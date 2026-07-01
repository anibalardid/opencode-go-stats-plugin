var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// index.tsx
import { createRoot, createSignal } from "solid-js";
import { jsx, jsxs } from "@opentui/solid/jsx-runtime";
var LIMIT_5H = 12;
var LIMIT_WEEKLY = 30;
var LIMIT_MONTHLY = 60;
var KV_EXP = "go-usage:exp";
var DB = process.env.HOME + "/.local/share/opencode/opencode.db";
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
function queryDB() {
  try {
    const { execSync } = __require("child_process");
    const sql = [
      "SELECT",
      "COALESCE(SUM(CASE WHEN time_created >= CAST(strftime('%s','now') AS INTEGER)*1000 - 5*3600*1000 THEN cost ELSE 0 END), 0)",
      "||'|'||",
      "COALESCE(SUM(CASE WHEN time_created >= CAST(strftime('%s','now') AS INTEGER)*1000 - 7*86400*1000 THEN cost ELSE 0 END), 0)",
      "||'|'||",
      "COALESCE(SUM(CASE WHEN time_created >= CAST(strftime('%s','now') AS INTEGER)*1000 - 30*86400*1000 THEN cost ELSE 0 END), 0)",
      "FROM session WHERE cost > 0"
    ].join(" ");
    const out = execSync(`sqlite3 "${DB}" "${sql}"`, {
      encoding: "utf-8",
      timeout: 3e3,
      windowsHide: true
    }).trim();
    const parts = out.split("|");
    return {
      h5: parseFloat(parts[0] ?? "0"),
      wk: parseFloat(parts[1] ?? "0"),
      mo: parseFloat(parts[2] ?? "0")
    };
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
      const [data, setData] = createSignal(queryDB() ?? { h5: 0, wk: 0, mo: 0 });
      timerId = setInterval(() => {
        const r = queryDB();
        if (r) setData(r);
      }, 3e4);
      unsub = api.event?.on?.("session.updated", () => {
        const r = queryDB();
        if (r) setData(r);
      });
      api.slots?.register?.({
        order: 210,
        slots: {
          sidebar_content(ctx, _props) {
            const d = data();
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
            const total = d.mo;
            const totalLim = LIMIT_MONTHLY;
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
                Row(d.h5, LIMIT_5H, "5h"),
                Row(d.wk, LIMIT_WEEKLY, "Week"),
                Row(d.mo, LIMIT_MONTHLY, "Month"),
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
