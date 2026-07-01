/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createRoot, createSignal } from "solid-js"

// ── Go Plan Limits ─────────────────────────────────────────────────────────
const LIMIT_5H = 12
const LIMIT_WEEKLY = 30
const LIMIT_MONTHLY = 60

const DB_PATH = process.env.HOME + "/.local/share/opencode/opencode.db"
const REFRESH_MS = 60_000

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

interface CostRow {
  h5: number
  wk: number
  mo: number
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

      // Try to set up SQLite via child_process sqlite3 (more portable)
      // We use a singleton pattern: run sqlite3 occasionally, cache results
      let cached: CostRow | null = null
      let lastFetch = 0

      function fetchCosts(): CostRow {
        const now = Date.now()
        if (cached && now - lastFetch < 5000) return cached

        try {
          // Use child_process to run sqlite3 — works in any runtime
          // @ts-ignore
          const { execSync } = require("child_process") as any
          const sql = `SELECT COALESCE(SUM(CASE WHEN time_created >= CAST(strftime('%s','now') AS INTEGER)*1000 - ${5*3600*1000} THEN cost ELSE 0 END), 0) || '|' || COALESCE(SUM(CASE WHEN time_created >= CAST(strftime('%s','now') AS INTEGER)*1000 - ${7*86400*1000} THEN cost ELSE 0 END), 0) || '|' || COALESCE(SUM(CASE WHEN time_created >= CAST(strftime('%s','now') AS INTEGER)*1000 - ${30*86400*1000} THEN cost ELSE 0 END), 0) FROM session WHERE cost > 0`
          const out = execSync(`sqlite3 "${DB_PATH}" "${sql}"`, {
            encoding: "utf-8",
            timeout: 3000,
            windowsHide: true,
          }).trim()
          const parts = out.split("|")
          cached = {
            h5: parseFloat(parts[0] ?? "0"),
            wk: parseFloat(parts[1] ?? "0"),
            mo: parseFloat(parts[2] ?? "0"),
          }
          lastFetch = now
          return cached
        } catch {
          return { h5: 0, wk: 0, mo: 0 }
        }
      }

      const [data, setData] = createSignal<CostRow>(fetchCosts())

      // Refresh periodically
      timerId = setInterval(() => setData(fetchCosts()), REFRESH_MS)

      // Refresh on session activity (debounced via 5s cache)
      unsub = api.event?.on?.("session.updated", () => {
        setData(fetchCosts())
      })

      api.slots?.register?.({
        order: 210,
        slots: {
          sidebar_content(ctx, _props) {
            const d = data()
            const fg = ctx.theme.current.text
            const mu = ctx.theme.current.textMuted
            const e = api.kv?.get?.<boolean>("go-usage:exp", true) !== false

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
                  onMouseDown={() => api.kv?.set?.("go-usage:exp", !e)}
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
