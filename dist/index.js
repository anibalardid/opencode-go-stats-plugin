// index.tsx
import { createRoot, createSignal } from "solid-js";
import { jsx, jsxs } from "@opentui/solid/jsx-runtime";
var LIMIT_5H = 12;
var LIMIT_WEEKLY = 30;
var LIMIT_MONTHLY = 60;
var KV_LOG = "go-usage:log3";
var KV_EXP = "go-usage:exp";
function $c(n) {
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toFixed(2)}`;
}
function pct(u, l) {
  if (l <= 0) return "0";
  return `${Math.round(u / l * 100)}%`;
}
function barStr(ratio, w) {
  const filled = Math.round(Math.min(ratio, 1) * w);
  return "\u2588".repeat(Math.max(0, filled)) + "\u2591".repeat(Math.max(0, w - filled));
}
function sumWindow(entries, windowMs) {
  const cut = Date.now() - windowMs;
  const maxPerKey = /* @__PURE__ */ new Map();
  for (const e of entries) {
    if (e.t < cut) continue;
    const key = `${e.s}::${e.m}`;
    maxPerKey.set(key, Math.max(maxPerKey.get(key) ?? 0, e.c));
  }
  let total = 0;
  for (const v of maxPerKey.values()) total += v;
  return total;
}
function trySeedFromDB() {
  try {
    const db = new Bun.sqlite(
      process.env.HOME + "/.local/share/opencode/opencode.db",
      { readonly: true }
    );
    const rows = db.query(`
      SELECT
        id as sid,
        time_created as ts,
        cost,
        model
      FROM session
      WHERE cost > 0 AND time_created >= CAST(strftime('%s','now') AS INTEGER)*1000 - 31*86400*1000
      ORDER BY time_created ASC
    `).all();
    db.close();
    if (!rows || rows.length === 0) return null;
    return rows.map((r) => {
      let modelId = "?";
      try {
        const parsed = JSON.parse(r.model);
        modelId = parsed.id ?? "?";
      } catch {
        modelId = r.model ?? "?";
      }
      return { m: modelId, c: r.cost, t: r.ts, s: r.sid };
    });
  } catch {
    return null;
  }
}
var init = false;
var tui = async (api) => {
  if (init) return;
  init = true;
  let unsub;
  let sd;
  let timerId;
  const cl = () => {
    try {
      unsub?.();
    } catch {
    }
    try {
      sd?.();
    } catch {
    }
    if (timerId) clearInterval(timerId);
    init = false;
  };
  try {
    if (api.lifecycle?.onDispose) api.lifecycle.onDispose(cl);
    if (!api.lifecycle?.onDispose && api.lifecycle?.signal)
      api.lifecycle.signal.addEventListener("abort", cl, { once: true });
    createRoot((dis) => {
      sd = dis;
      let initial = [];
      const seeded = trySeedFromDB();
      if (seeded) {
        initial = seeded;
        api.kv?.set?.(KV_LOG, seeded);
      } else {
        initial = api.kv?.get?.(KV_LOG) ?? [];
      }
      const [entries, setEntries] = createSignal(initial);
      const windows = () => ({
        h5: sumWindow(entries(), 5 * 3600 * 1e3),
        wk: sumWindow(entries(), 7 * 86400 * 1e3),
        mo: sumWindow(entries(), 30 * 86400 * 1e3)
      });
      let st;
      const scheduleSave = () => {
        if (st) clearTimeout(st);
        st = setTimeout(() => {
          const data = entries();
          if (data.length > 0) api.kv?.set?.(KV_LOG, data);
        }, 2e3);
      };
      const flushSave = () => {
        if (st) {
          clearTimeout(st);
          st = void 0;
        }
        const data = entries();
        if (data.length > 0) api.kv?.set?.(KV_LOG, data);
      };
      unsub = api.event?.on?.("session.updated", (ev) => {
        try {
          const info = ev?.properties?.info;
          const sid = ev?.properties?.sessionID;
          if (!info || !sid) return;
          const cost = typeof info.cost === "number" ? info.cost : 0;
          if (cost <= 0) return;
          const model = info.model?.id ?? "?";
          setEntries((prev) => {
            const key = `${sid}::${model}`;
            const idx = prev.findIndex((e) => `${e.s}::${e.m}` === key);
            let next;
            if (idx >= 0) {
              if (cost <= prev[idx].c) return prev;
              next = prev.slice();
              next[idx] = { m: model, c: cost, t: Date.now(), s: sid };
            } else {
              next = [...prev, { m: model, c: cost, t: Date.now(), s: sid }];
            }
            const cut = Date.now() - 31 * 86400 * 1e3;
            return next.filter((e) => e.t >= cut);
          });
          scheduleSave();
        } catch {
        }
      });
      timerId = setInterval(flushSave, 3e4);
      api.slots?.register?.({
        order: 210,
        slots: {
          sidebar_content(ctx, _props) {
            const w = windows();
            const fg = ctx.theme.current.text;
            const mu = ctx.theme.current.textMuted;
            const e = api.kv?.get?.(KV_EXP, true) !== false;
            const Row = (used, limit, label) => {
              const r = limit > 0 ? used / limit : 0;
              return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
                /* @__PURE__ */ jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [
                  /* @__PURE__ */ jsx("text", { fg: mu, children: label }),
                  /* @__PURE__ */ jsxs("text", { fg, children: [
                    $c(used),
                    used > 0 ? ` / $${limit}` : `$${limit}`
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("text", { fg, children: [
                  barStr(r, 8),
                  " ",
                  pct(used, limit)
                ] })
              ] });
            };
            const total = w.h5 + w.wk + w.mo;
            const totalLim = LIMIT_5H + LIMIT_WEEKLY + LIMIT_MONTHLY;
            return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
              /* @__PURE__ */ jsxs(
                "box",
                {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  onMouseDown: () => api.kv?.set?.(KV_EXP, !e),
                  children: [
                    /* @__PURE__ */ jsxs("text", { fg, children: [
                      e ? "\u25BC" : "\u25B6",
                      " Go Est. Stats"
                    ] }),
                    /* @__PURE__ */ jsx("text", { fg: mu, children: $c(total) })
                  ]
                }
              ),
              e && /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
                Row(w.h5, LIMIT_5H, "5h"),
                Row(w.wk, LIMIT_WEEKLY, "Week"),
                Row(w.mo, LIMIT_MONTHLY, "Month"),
                /* @__PURE__ */ jsxs("text", { fg: mu, children: [
                  "Total: ",
                  $c(total),
                  " / $",
                  totalLim,
                  " (",
                  pct(total, totalLim),
                  ")"
                ] })
              ] })
            ] });
          }
        }
      });
    });
  } catch (err) {
    cl();
    api.ui?.toast?.({ message: "go-usage failed", variant: "error" });
    throw err;
  }
};
var index_default = { id: "go-usage", tui };
export {
  index_default as default
};
