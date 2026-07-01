# Install

## Prerequisites

- OpenCode v1.17.8+ ([anomalyco/opencode](https://github.com/anomalyco/opencode))
- Node.js or Bun (for building)

## Quick install (from source)

```bash
git clone git@github.com:anibalardid/opencode-go-stats-plugin.git
cd opencode-go-stats-plugin
npm install
npm run build
opencode plugin -g "$(pwd)"
```

Restart OpenCode. You'll see a **Go Est. Stats** section in the sidebar.

## How to update

```bash
cd opencode-go-stats-plugin
git pull
npm install
npm run build
# Restart OpenCode
```

## Uninstall

```bash
opencode plugin -g "$(pwd)"
# Then delete the folder
rm -rf opencode-go-stats-plugin
```

## Requirements

The plugin reads `~/.local/share/opencode/opencode.db` (SQLite) which requires:
- macOS / Linux
- `sqlite3` CLI in PATH (comes pre-installed on macOS)
- OpenCode must have been used at least once (so the DB has session data)
