# OpenCode Go Est. Stats — LEEME

Plugin de barra lateral para OpenCode que estima tu uso del plan **Go** — calcula el costo contra los límites de $12 (5h), $30 (semanal) y $60 (mensual).

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

> 🔴 = 100% usado · 🟡 = 90–99% usado

## Cómo funciona

El plugin lee los datos de costo directamente de la base de datos SQLite local de OpenCode (`~/.local/share/opencode/opencode.db`) y calcula costos en ventanas móviles contra los límites publicados del plan Go:

| Ventana | Límite (USD) |
|---------|-------------|
| 5 horas | $12 |
| Semanal | $30 |
| Mensual | $60 |

También escucha eventos `session.updated` para actualizaciones en tiempo real y refresca la consulta cada 30 segundos.

> **Nota**: Son **estimaciones** basadas en datos locales. La consola de opencode.ai muestra el uso autoritativo del servidor con contadores en tiempo real. La cifra mensual suele coincidir (~2% de diferencia); las ventanas más cortas pueden divergir más.

Para una vista más precisa del lado del servidor, probá el plugin complementario [`opencode-go-dash`](https://github.com/anibalardid/opencode-go-dash) que obtiene los datos del dashboard real de OpenCode.

## Referencia de límites (de [opencode.ai/docs/go](https://opencode.ai/docs/go))

| Modelo | Req/5h | Req/semana | Req/mes |
|--------|--------|------------|---------|
| DeepSeek V4 Flash | 31,650 | 79,050 | 158,150 |
| MiMo-V2.5 | 30,100 | 75,200 | 150,400 |
| DeepSeek V4 Pro | 3,450 | 8,550 | 17,150 |
| MiniMax M3 | 3,200 | 8,000 | 16,000 |
| MiMo-V2.5-Pro | 3,250 | 8,150 | 16,300 |
| Qwen3.7 Plus | 4,300 | 10,800 | 21,600 |
| Kimi K2.7 Code | 1,350 | 4,630 | 9,250 |
| Qwen3.7 Max | 950 | 2,390 | 4,770 |
| GLM-5.2 / GLM-5.1 | 880 | 2,150 | 4,300 |

## Archivos

| Archivo | Propósito |
|---------|-----------|
| `index.tsx` | Código fuente del plugin (JSX + Solid.js) |
| `package.json` | Manifiesto npm |
| `tsup.config.ts` | Configuración de build |
| `tsconfig.json` | Configuración de TypeScript |
| `dist/` | Output compilado (cargado por OpenCode) |

## Licencia

MIT

---

## 🇬🇧 English

Read the English docs here: [README.md](README.md) · [INSTALL.md](INSTALL.md)
