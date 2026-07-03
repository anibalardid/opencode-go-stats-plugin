# Instalar

## Requisitos

- OpenCode v1.17.8+ ([anomalyco/opencode](https://github.com/anomalyco/opencode))
- Node.js o Bun (para compilar)

## Instalación rápida (desde fuente)

```bash
git clone git@github.com:anibalardid/opencode-go-stats-plugin.git
cd opencode-go-stats-plugin
npm install
npm run build
opencode plugin -g "$(pwd)"
```

Reiniciá OpenCode. Vas a ver una sección **OpenCode Go** en la barra lateral.

## Cómo actualizar

```bash
cd opencode-go-stats-plugin
git pull
npm install
npm run build
# Reiniciá OpenCode
```

## Desinstalar

```bash
opencode plugin -g "$(pwd)"
# Luego borrá la carpeta
rm -rf opencode-go-stats-plugin
```

## Requisitos

El plugin lee `~/.local/share/opencode/opencode.db` (SQLite), lo que requiere:
- macOS / Linux
- `sqlite3` CLI en PATH (viene preinstalado en macOS)
- OpenCode debe haberse usado al menos una vez (para que la DB tenga datos de sesión)

---

## 🇬🇧 English

Read the English install guide here: [INSTALL.md](INSTALL.md)
