/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createRoot, createSignal } from "solid-js"

// ── Go Plan Limits ─────────────────────────────────────────────────────────
const LIMIT_5H = 12
const LIMIT_WEEKLY = 30
const LIMIT_MONTHLY = 60

const KV_EXP = "go-usage:exp"

const DB = process.env.HOME + "/.local/share/opencode/opencode.db"

function $c(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ""
  return `$${n.toFixed(2)}`
}

function pct(u: number, l: number): string {
  if (l <= 0) return "0"
  return `${Math.round((u / l) * 100)}%`
}

function barStr(ratio: number, w: number): string {
  const filled = Math.round(Math.min(ratio, 1) * w)
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, w - filled))
}

// ── Query SQLite via child_process ─────────────────────────────────────────
function queryDB(): { h5: number; wk: number; mo: number } | null {
  try {
    // @ts-ignore: child_process
    const { execSync } = require("child_process")
    // Use pipe-delimited output to avoid shell escaping issues
    const sql = [
      "SELECT",
      "COALESCE(SUM(CASE WHEN time_created >= CAST(strftime('%s','now') AS INTEGER)*1000 - 5*3600*1000 THEN cost ELSE 0 END), 0)",
      "||'|'||",
      "COALESCE(SUM(CASE WHEN time_created >= CAST(strftime('%s','now') AS INTEGER)*1000 - 7*86400*1000 THEN cost ELSE 0 END), 0)",
      "||'|'||",
      "COALESCE(SUM(CASE WHEN time_created >= CAST(strftime('%s','now') AS INTEGER)*1000 - 30*86400*1000 THEN cost ELSE 0 END), 0)",
      "FROM session WHERE cost > 0",
    ].join(" ")
    const out = execSync(`sqlite3 "${DB}" "${sql}"`, {
      encoding: "utf-8",
      timeout: 3000,
      windowsHide: true,
    }).trim()
    const parts = out.split("|")
    return {
      h5: parseFloat(parts[0] ?? "0"),
      wk: parseFloat(parts[1] ?? "0"),
      mo: parseFloat(parts[2] ?? "0"),
    }
  } catch {
    return null
  }
}

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

      // Initial query + periodic refresh
      const [data, setData] = createSignal(queryDB() ?? { h5: 0, wk: 0, mo: 0 })

      // Refresh every 30s
      timerId = setInterval(() => {
        const r = queryDB()
        if (r) setData(r)
      }, 30_000)

      // Refresh on session activity too
      unsub = api.event?.on?.("session.updated", () => {
        const r = queryDB()
        if (r) setData(r)
      })

      api.slots?.register?.({
        order: 210,
        slots: {
          sidebar_content(ctx, _props) {
            const d = data()
            const fg = ctx.theme.current.text
            const mu = ctx.theme.current.textMuted
            const e = api.kv?.get?.<boolean>(KV_EXP, true) !== false

            const Row = (used: number, limit: number, label: string) => {
              const r = limit > 0 ? used / limit : 0
              return (
                <box flexDirection="column">
                  <box flexDirection="row" justifyContent="space-between">
                    <text fg={mu}>{label}</text>
                    <text fg={fg}>
                      {$c(used)}{used > 0 ? ` / $${limit}` : `$${limit}`}
                    </text>
                  </box>
                  <text fg={fg}>{barStr(r, 8)} {pct(used, limit)}</text>
                </box>
              )
            }

            const total = d.h5 + d.wk + d.mo
            const totalLim = LIMIT_5H + LIMIT_WEEKLY + LIMIT_MONTHLY

            return (
              <box flexDirection="column">
                <box
                  flexDirection="row"
                  justifyContent="space-between"
                  onMouseDown={() => api.kv?.set?.(KV_EXP, !e)}
                >
                  <text fg={fg}>{e ? "▼" : "▶"} Go Est. Stats</text>
                  <text fg={mu}>{$c(total)}</text>
                </box>
                {e && (
                  <box flexDirection="column">
                    {Row(d.h5, LIMIT_5H, "5h")}
                    {Row(d.wk, LIMIT_WEEKLY, "Week")}
                    {Row(d.mo, LIMIT_MONTHLY, "Month")}
                    <text fg={mu}>
                      Total: {$c(total)} / ${totalLim} ({pct(total, totalLim)})
                    </text>
                  </box>
                )}
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
