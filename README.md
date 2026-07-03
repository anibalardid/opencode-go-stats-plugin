# OpenCode Go Est. Stats

Sidebar plugin for OpenCode that estimates your **Go plan usage** — tracks cost against the $12 (5h), $30 (weekly), and $60 (monthly) limits.

```
▼ OpenCode Go               $17.89
  5h   $2.90 / $12
  ██░░░░░░ 24%
  Week $10.06 / $30
  ███░░░░░ 34%
  Month$17.89 / $60
  ███░░░░░ 30%
  Total: $17.89 / $102 (30%)
```

> 🔴 = 100% used · 🟡 = 90–99% used

## How it works

The plugin scrapes your Go usage directly from the OpenCode dashboard using your auth cookie. It parses the usage windows (5h, weekly, monthly) and displays them in the sidebar.

It listens to `session.updated` events for real-time updates and refreshes every 60 seconds.

> **Note**: These are **server-side** numbers from the opencode.ai dashboard — they match what you see on the web.

## Limits reference (from [opencode.ai/docs/go](https://opencode.ai/docs/go))

| Model | Req/5h | Req/week | Req/month |
|-------|--------|----------|-----------|
| DeepSeek V4 Flash | 31,650 | 79,050 | 158,150 |
| MiMo-V2.5 | 30,100 | 75,200 | 150,400 |
| DeepSeek V4 Pro | 3,450 | 8,550 | 17,150 |
| MiniMax M3 | 3,200 | 8,000 | 16,000 |
| MiMo-V2.5-Pro | 3,250 | 8,150 | 16,300 |
| Qwen3.7 Plus | 4,300 | 10,800 | 21,600 |
| Kimi K2.7 Code | 1,350 | 4,630 | 9,250 |
| Qwen3.7 Max | 950 | 2,390 | 4,770 |
| GLM-5.2 / GLM-5.1 | 880 | 2,150 | 4,300 |

## Files

| File | Purpose |
|------|---------|
| `index.tsx` | Plugin source (JSX + Solid.js) |
| `package.json` | npm package manifest |
| `tsup.config.ts` | Build config |
| `tsconfig.json` | TypeScript config |
| `dist/` | Built output (loaded by OpenCode) |

## Install

[INSTALL.md](INSTALL.md)

## License

MIT

---

## 🇪🇸 Español

Lee la documentación en español aquí: [LEEME.md](LEEME.md) · [INSTALAR.md](INSTALAR.md)
