/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createRoot, createSignal } from "solid-js"

// ── Config ───────────────────────────────────────────────────────────────────
const DASHBOARD_URL_PREFIX = "https://opencode.ai/workspace/"
const DASHBOARD_URL_SUFFIX = "/go"
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0"
const SCRAPE_TIMEOUT_MS = 10_000
const REFRESH_INTERVAL_MS = 60_000

const KV_EXP = "go-usage:exp"

// ── Cookie resolution ────────────────────────────────────────────────────────
interface GoConfig {
  authCookie: string
  workspaceId: string
  source: string
}

async function resolveConfig(): Promise<{ result?: GoConfig; error?: string }> {
  // 1. Env vars
  const envAuth = process.env.OPENCODE_GO_AUTH_COOKIE?.trim()
  const envWs = process.env.OPENCODE_GO_WORKSPACE_ID?.trim()
  if (envAuth && envWs) {
    return { result: { authCookie: envAuth, workspaceId: envWs, source: "env" } }
  }
  if (envAuth || envWs) {
    return { error: `Missing ${envAuth ? "OPENCODE_GO_WORKSPACE_ID" : "OPENCODE_GO_AUTH_COOKIE"}` }
  }

  // 2. Config file
  const configPath = process.env.HOME + "/.config/opencode/opencode-quota/opencode-go.json"
  try {
    const fs = await import("fs/promises")
    const content = await fs.readFile(configPath, "utf-8")
    const parsed = JSON.parse(content)
    const authCookie = typeof parsed.authCookie === "string" ? parsed.authCookie.trim() : ""
    const workspaceId = typeof parsed.workspaceId === "string" ? parsed.workspaceId.trim() : ""
    if (authCookie && workspaceId) {
      return { result: { authCookie, workspaceId, source: configPath } }
    }
    return { error: `Incomplete config: missing ${authCookie ? "workspaceId" : "authCookie"}` }
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return { error: "no config found" }
    }
    return { error: `Error reading config: ${err.message}` }
  }
}

// ── Scraper ──────────────────────────────────────────────────────────────────
interface WindowUsage {
  label: string
  usagePercent: number
  resetText: string
}

interface GoUsageData {
  windows: WindowUsage[]
}

function parseHumanTime(timeStr: string): string {
  const normalized = timeStr.toLowerCase().trim().replace(/\s+/g, " ")
  if (["reset-now", "reset now", "now", "resets now"].includes(normalized)) {
    return "now"
  }

  let days = 0, hours = 0, minutes = 0
  const d = normalized.match(/(\d+)\s*days?/)
  const h = normalized.match(/(\d+)\s*hours?/)
  const m = normalized.match(/(\d+)\s*minutes?/)

  if (d) days = parseInt(d[1])
  if (h) hours = parseInt(h[1])
  if (m) minutes = parseInt(m[1])

  const totalHours = days * 24 + hours + (minutes > 0 ? minutes / 60 : 0)

  if (totalHours <= 0) return "now"
  if (totalHours < 1) return `${Math.round(minutes)}m`
  if (totalHours < 24) return `${Math.round(totalHours)}h`
  return `${Math.round(totalHours / 24)}d`
}

async function scrapeUsage(authCookie: string, workspaceId: string): Promise<{ data?: GoUsageData; error?: string }> {
  try {
    const url = `${DASHBOARD_URL_PREFIX}${encodeURIComponent(workspaceId)}${DASHBOARD_URL_SUFFIX}`
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        Cookie: `auth=${authCookie}`,
      },
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    })

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}` }
    }

    const html = await resp.text()

    // Parse data-slot format
    const items = html.split('data-slot="usage-item"')
    if (items.length <= 1) {
      return { error: "No usage data found on dashboard" }
    }

    const windows: WindowUsage[] = []

    for (let i = 1; i < items.length; i++) {
      const content = items[i]

      const labelMatch = content.match(/data-slot="usage-label">([^<]+)</)
      if (!labelMatch) continue

      const label = labelMatch[1].trim()

      const usageMatch = content.match(/data-slot="usage-value">[^0-9]*(\d+(?:\.\d+)?)/)
      if (!usageMatch) continue

      const usagePercent = parseFloat(usageMatch[1])

      const resetMatch = content.match(/data-slot="(reset-time|reset-now)">([\s\S]*?)<\/span>/)
      if (!resetMatch) continue

      const resetContent = resetMatch[2]
        .replace(/<!--\$-->/g, "")
        .replace(/<!--\/-->/g, "")
        .replace(/Resets?\s*in\s*/i, "")
        .trim()

      windows.push({
        label,
        usagePercent,
        resetText: parseHumanTime(resetContent),
      })
    }

    if (windows.length === 0) {
      return { error: "Could not parse usage windows" }
    }

    return { data: { windows } }
  } catch (err: any) {
    return { error: err?.message ?? String(err) }
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function barStr(ratio: number, w: number): string {
  const filled = Math.round(Math.min(ratio, 1) * w)
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, w - filled))
}

function fmtPct(n: number): string {
  return `${n.toFixed(0)}%`
}

// ── Plugin ───────────────────────────────────────────────────────────────────
let init = false

const tui: TuiPlugin = async (api) => {
  if (init) return
  init = true

  let unsub: (() => void) | undefined
  let sd: (() => void) | undefined
  let timerId: ReturnType<typeof setInterval> | undefined

  const cl = () => {
    try { unsub?.() } catch {}
    try { sd?.() } catch {}
    if (timerId) clearInterval(timerId)
    init = false
  }

  try {
    if (api.lifecycle?.onDispose) api.lifecycle.onDispose(cl)
    if (!api.lifecycle?.onDispose && api.lifecycle?.signal)
      api.lifecycle.signal.addEventListener("abort", cl, { once: true })

    createRoot((dis) => {
      sd = dis

      type State =
        | { kind: "loading" }
        | { kind: "error"; msg: string }
        | { kind: "help" }
        | { kind: "data"; d: GoUsageData }

      const [state, setState] = createSignal<State>({ kind: "loading" })
      const [expanded, setExpanded] = createSignal(
        api.kv?.get?.<boolean>(KV_EXP, true) !== false,
      )

      async function refresh() {
        const resolved = await resolveConfig()
        if (!resolved.result) {
          setState({ kind: "help" })
          return
        }

        const scraped = await scrapeUsage(resolved.result.authCookie, resolved.result.workspaceId)
        if (scraped.error) {
          setState({ kind: "error", msg: scraped.error })
          return
        }

        setState({ kind: "data", d: scraped.data! })
      }

      refresh()
      timerId = setInterval(refresh, REFRESH_INTERVAL_MS)
      unsub = api.event?.on?.("session.updated", refresh)

      api.slots?.register?.({
        order: 210,
        slots: {
          sidebar_content(ctx, _props) {
            const s = state()
            const e = expanded()
            const fg = ctx.theme.current.text
            const mu = ctx.theme.current.textMuted
            const warn = ctx.theme.current.warning ?? "#e6a817"

            if (s.kind === "loading") {
              return (
                <box flexDirection="column">
                  <text fg={mu}>OpenCode Go</text>
                  <text fg={mu}>Loading…</text>
                </box>
              )
            }

            if (s.kind === "help") {
              return (
                <box flexDirection="column">
                  <text fg={warn}>⚠ OpenCode Go</text>
                  <text fg={mu}>No config found</text>
                  <text fg={mu}>Set env vars:</text>
                  <text fg={mu}>OPENCODE_GO_AUTH_COOKIE</text>
                  <text fg={mu}>OPENCODE_GO_WORKSPACE_ID</text>
                  <text fg={mu}></text>
                  <text fg={mu}>Or create:</text>
                  <text fg={mu}>~/.config/opencode/</text>
                  <text fg={mu}>  opencode-quota/</text>
                  <text fg={mu}>    opencode-go.json</text>
                  <text fg={mu}>  → {"{"}"authCookie":"...",</text>
                  <text fg={mu}>     "workspaceId":"...{"}"}</text>
                </box>
              )
            }

            if (s.kind === "error") {
              return (
                <box flexDirection="column">
                  <text fg={warn}>⚠ OpenCode Go</text>
                  <text fg={mu}>{s.msg}</text>
                </box>
              )
            }

            // Data
            const d = s.d
            const monthly = d.windows.find((w) => w.label.toLowerCase().includes("monthly"))
            const monthlyPct = monthly ? monthly.usagePercent : 0

            return (
              <box flexDirection="column">
                <box
                  flexDirection="row"
                  justifyContent="space-between"
                  onMouseDown={() => {
                    const next = !e
                    setExpanded(next)
                    api.kv?.set?.(KV_EXP, next)
                  }}
                >
                  <text fg={fg}>{e ? "▼" : "▶"} OpenCode Go</text>
                  <text fg={mu}>{fmtPct(monthlyPct)}</text>
                </box>
                {e && d.windows.map((w) => {
                  const remaining = 100 - w.usagePercent
                  let circle = ""
                  if (w.usagePercent >= 100) circle = "🔴 "
                  else if (w.usagePercent >= 90) circle = "🟡 "
                  return (
                    <box flexDirection="column">
                      <box flexDirection="row" justifyContent="space-between">
                        <text fg={fg}>{circle}{w.label}</text>
                        <text fg={fg}>{fmtPct(w.usagePercent)} used</text>
                      </box>
                      <text fg={fg}>
                        {barStr(remaining / 100, 8)} {fmtPct(remaining)} free
                      </text>
                      <text fg={mu}>Reset {w.resetText}</text>
                    </box>
                  )
                })}
              </box>
            )
          },
        },
      })
    })
  } catch (err) {
    cl()
    api.ui?.toast?.({ message: "go-usage failed", variant: "error" })
    throw err
  }
}

export default { id: "go-usage", tui }
