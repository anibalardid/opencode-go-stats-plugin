// index.tsx
import { createRoot, createSignal } from "solid-js";
import { jsx, jsxs } from "@opentui/solid/jsx-runtime";
var DASHBOARD_URL_PREFIX = "https://opencode.ai/workspace/";
var DASHBOARD_URL_SUFFIX = "/go";
var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0";
var SCRAPE_TIMEOUT_MS = 1e4;
var REFRESH_INTERVAL_MS = 6e4;
var KV_EXP = "go-usage:exp";
var RETRY_DELAYS = [5e3, 15e3, 3e4];
async function resolveConfig() {
  const envAuth = process.env.OPENCODE_GO_AUTH_COOKIE?.trim();
  const envWs = process.env.OPENCODE_GO_WORKSPACE_ID?.trim();
  if (envAuth && envWs) {
    return { result: { authCookie: envAuth, workspaceId: envWs, source: "env" } };
  }
  if (envAuth || envWs) {
    return { error: `Missing ${envAuth ? "OPENCODE_GO_WORKSPACE_ID" : "OPENCODE_GO_AUTH_COOKIE"}` };
  }
  const configPath = process.env.HOME + "/.config/opencode/opencode-quota/opencode-go.json";
  try {
    const fs = await import("fs/promises");
    const content = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    const authCookie = typeof parsed.authCookie === "string" ? parsed.authCookie.trim() : "";
    const workspaceId = typeof parsed.workspaceId === "string" ? parsed.workspaceId.trim() : "";
    if (authCookie && workspaceId) {
      return { result: { authCookie, workspaceId, source: configPath } };
    }
    return { error: `Incomplete config: missing ${authCookie ? "workspaceId" : "authCookie"}` };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { error: "no config found" };
    }
    return { error: `Error reading config: ${err.message}` };
  }
}
function parseHumanTime(timeStr) {
  const normalized = timeStr.toLowerCase().trim().replace(/\s+/g, " ");
  if (["reset-now", "reset now", "now", "resets now"].includes(normalized)) {
    return "now";
  }
  let days = 0, hours = 0, minutes = 0;
  const d = normalized.match(/(\d+)\s*days?/);
  const h = normalized.match(/(\d+)\s*hours?/);
  const m = normalized.match(/(\d+)\s*minutes?/);
  if (d) days = parseInt(d[1]);
  if (h) hours = parseInt(h[1]);
  if (m) minutes = parseInt(m[1]);
  const totalHours = days * 24 + hours + (minutes > 0 ? minutes / 60 : 0);
  if (totalHours <= 0) return "now";
  if (totalHours < 1) return `${Math.round(minutes)}m`;
  if (totalHours < 24) return `${Math.round(totalHours)}h`;
  return `${Math.round(totalHours / 24)}d`;
}
async function scrapeUsage(authCookie, workspaceId) {
  try {
    const url = `${DASHBOARD_URL_PREFIX}${encodeURIComponent(workspaceId)}${DASHBOARD_URL_SUFFIX}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        Cookie: `auth=${authCookie}`
      },
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS)
    });
    if (!resp.ok) {
      return { error: `HTTP ${resp.status}` };
    }
    const html = await resp.text();
    const items = html.split('data-slot="usage-item"');
    if (items.length <= 1) {
      return { error: "No usage data found on dashboard" };
    }
    const windows = [];
    for (let i = 1; i < items.length; i++) {
      const content = items[i];
      const labelMatch = content.match(/data-slot="usage-label">([^<]+)</);
      if (!labelMatch) continue;
      const label = labelMatch[1].trim();
      const usageMatch = content.match(/data-slot="usage-value">[^0-9]*(\d+(?:\.\d+)?)/);
      if (!usageMatch) continue;
      const usagePercent = parseFloat(usageMatch[1]);
      const resetMatch = content.match(/data-slot="(reset-time|reset-now)">([\s\S]*?)<\/span>/);
      if (!resetMatch) continue;
      const resetContent = resetMatch[2].replace(/<!--\$-->/g, "").replace(/<!--\/-->/g, "").replace(/Resets?\s*in\s*/i, "").trim();
      windows.push({
        label,
        usagePercent,
        resetText: parseHumanTime(resetContent)
      });
    }
    if (windows.length === 0) {
      return { error: "Could not parse usage windows" };
    }
    return { data: { windows } };
  } catch (err) {
    return { error: err?.message ?? String(err) };
  }
}
function barStr(ratio, w) {
  const filled = Math.round(Math.min(ratio, 1) * w);
  return "\u2588".repeat(Math.max(0, filled)) + "\u2591".repeat(Math.max(0, w - filled));
}
function fmtPct(n) {
  return `${n.toFixed(0)}%`;
}
var init = false;
var tui = async (api) => {
  if (init) return;
  init = true;
  let unsub;
  let sd;
  let timerId;
  let retryTimer;
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
    if (retryTimer) clearTimeout(retryTimer);
    init = false;
  };
  try {
    if (api.lifecycle?.onDispose) api.lifecycle.onDispose(cl);
    if (!api.lifecycle?.onDispose && api.lifecycle?.signal)
      api.lifecycle.signal.addEventListener("abort", cl, { once: true });
    createRoot((dis) => {
      sd = dis;
      const [state, setState] = createSignal({ kind: "loading" });
      const [expanded, setExpanded] = createSignal(
        api.kv?.get?.(KV_EXP, true) !== false
      );
      async function refresh() {
        const resolved = await resolveConfig();
        if (!resolved.result) {
          setState({ kind: "help" });
          return;
        }
        const scraped = await scrapeUsage(resolved.result.authCookie, resolved.result.workspaceId);
        if (scraped.error) {
          setState({ kind: "error", msg: scraped.error });
          scheduleRetry(0);
          return;
        }
        setState({ kind: "data", d: scraped.data });
      }
      function scheduleRetry(attempt) {
        if (retryTimer) clearTimeout(retryTimer);
        if (attempt >= RETRY_DELAYS.length) return;
        retryTimer = setTimeout(() => {
          refresh().then(() => {
            if (timerId) clearInterval(timerId);
            timerId = setInterval(refresh, REFRESH_INTERVAL_MS);
          });
        }, RETRY_DELAYS[attempt]);
      }
      refresh();
      timerId = setInterval(refresh, REFRESH_INTERVAL_MS);
      unsub = api.event?.on?.("session.updated", refresh);
      api.slots?.register?.({
        order: 210,
        slots: {
          sidebar_content(ctx, _props) {
            const s = state();
            const e = expanded();
            const fg = ctx.theme.current.text;
            const mu = ctx.theme.current.textMuted;
            const warn = ctx.theme.current.warning ?? "#e6a817";
            if (s.kind === "loading") {
              return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
                /* @__PURE__ */ jsx("text", { fg: mu, children: "OpenCode Go" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "Loading\u2026" })
              ] });
            }
            if (s.kind === "help") {
              return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
                /* @__PURE__ */ jsx("text", { fg: warn, children: "\u26A0 OpenCode Go" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "No config found" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "Set env vars:" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "OPENCODE_GO_AUTH_COOKIE" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "OPENCODE_GO_WORKSPACE_ID" }),
                /* @__PURE__ */ jsx("text", { fg: mu }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "Or create:" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "~/.config/opencode/" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "  opencode-quota/" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "    opencode-go.json" }),
                /* @__PURE__ */ jsxs("text", { fg: mu, children: [
                  "  \u2192 ",
                  "{",
                  '"authCookie":"...",'
                ] }),
                /* @__PURE__ */ jsxs("text", { fg: mu, children: [
                  '     "workspaceId":"...',
                  "}"
                ] })
              ] });
            }
            if (s.kind === "error") {
              return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
                /* @__PURE__ */ jsx("text", { fg: warn, children: "\u26A0 OpenCode Go" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: s.msg })
              ] });
            }
            const d = s.d;
            const monthly = d.windows.find((w) => w.label.toLowerCase().includes("monthly"));
            const monthlyPct = monthly ? monthly.usagePercent : 0;
            return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
              /* @__PURE__ */ jsxs(
                "box",
                {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  onMouseDown: () => {
                    const next = !e;
                    setExpanded(next);
                    api.kv?.set?.(KV_EXP, next);
                  },
                  children: [
                    /* @__PURE__ */ jsxs("text", { fg, children: [
                      e ? "\u25BC" : "\u25B6",
                      " OpenCode Go"
                    ] }),
                    /* @__PURE__ */ jsx("text", { fg: mu, children: fmtPct(monthlyPct) })
                  ]
                }
              ),
              e && d.windows.map((w) => {
                const remaining = 100 - w.usagePercent;
                let circle = "";
                if (w.usagePercent >= 100) circle = "\u{1F534} ";
                else if (w.usagePercent >= 90) circle = "\u{1F7E1} ";
                return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
                  /* @__PURE__ */ jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [
                    /* @__PURE__ */ jsxs("text", { fg, children: [
                      circle,
                      w.label
                    ] }),
                    /* @__PURE__ */ jsxs("text", { fg, children: [
                      fmtPct(w.usagePercent),
                      " used"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs("text", { fg, children: [
                    barStr(remaining / 100, 8),
                    " ",
                    fmtPct(remaining),
                    " free"
                  ] }),
                  /* @__PURE__ */ jsxs("text", { fg: mu, children: [
                    "Reset ",
                    w.resetText
                  ] })
                ] });
              })
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
