/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createRoot, createSignal } from "solid-js"

// ── Go Plan Limits ─────────────────────────────────────────────────────────
const LIMIT_5H = 12
const LIMIT_WEEKLY = 30
const LIMIT_MONTHLY = 60

const KV_LOG = "go-usage:log2"
const KV_EXP = "go-usage:exp"

interface Entry {
  m: string  // model
  c: number  // cost (accumulative for this session)
  t: number  // timestamp
  s: string  // sessionID
}

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

function sumWindow(entries: Entry[], windowMs: number): number {
  const cut = Date.now() - windowMs
  // Group by sessionID+model, take max cost per group, sum within window
  const maxPerKey = new Map<string, number>()
  for (const e of entries) {
    if (e.t < cut) continue
    const key = `${e.s}::${e.m}`
    const prev = maxPerKey.get(key) ?? 0
    if (e.c > prev) maxPerKey.set(key, e.c)
  }
  let total = 0
  for (const v of maxPerKey.values()) total += v
  return total
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

      // Restore from KV + track live
      const saved = () => api.kv?.get?.<Entry[]>(KV_LOG) ?? []
      const [entries, setEntries] = createSignal<Entry[]>(saved())

      // Compute windows reactively
      const windows = () => ({
        h5: sumWindow(entries(), 5 * 3600 * 1000),
        wk: sumWindow(entries(), 7 * 86400 * 1000),
        mo: sumWindow(entries(), 30 * 86400 * 1000),
      })

      // Debounced KV save
      let st: ReturnType<typeof setTimeout> | undefined
      const scheduleSave = () => {
        if (st) clearTimeout(st)
        st = setTimeout(() => {
          const data = entries()
          if (data.length > 0) api.kv?.set?.(KV_LOG, data)
        }, 2000)
      }
      const flushSave = () => {
        if (st) { clearTimeout(st); st = undefined }
        const data = entries()
        if (data.length > 0) api.kv?.set?.(KV_LOG, data)
      }

      // Listen for session updates
      unsub = api.event?.on?.("session.updated", (ev) => {
        try {
          const info = ev?.properties?.info
          const sid = ev?.properties?.sessionID
          if (!info || !sid) return
          const cost = typeof info.cost === "number" ? info.cost : 0
          if (cost <= 0) return
          const model = info.model?.id ?? "?"

          setEntries((prev) => {
            const key = `${sid}::${model}`
            const idx = prev.findIndex((e) => `${e.s}::${e.m}` === key)
            let next: Entry[]
            if (idx >= 0) {
              // Event carries accumulative cost — keep highest seen
              if (cost <= prev[idx].c) return prev
              next = prev.slice()
              next[idx] = { m: model, c: cost, t: Date.now(), s: sid }
            } else {
              next = [...prev, { m: model, c: cost, t: Date.now(), s: sid }]
            }
            // Prune entries older than 31 days
            const cut = Date.now() - 31 * 86400 * 1000
            return next.filter((e) => e.t >= cut)
          })
          scheduleSave()
        } catch { /* silent */ }
      })

      // Periodic KV flush
      timerId = setInterval(flushSave, 30_000)

      api.slots?.register?.({
        order: 210,
        slots: {
          sidebar_content(ctx, _props) {
            const w = windows()
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

            const total = w.h5 + w.wk + w.mo
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
                    {Row(w.h5, LIMIT_5H, "5h")}
                    {Row(w.wk, LIMIT_WEEKLY, "Week")}
                    {Row(w.mo, LIMIT_MONTHLY, "Month")}
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
