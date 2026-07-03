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

Restart OpenCode. You'll see an **OpenCode Go** section in the sidebar.

## Authentication

The plugin scrapes your Go usage from the OpenCode dashboard. You need to provide your auth cookie and workspace ID.

### Option A: Environment variables

```bash
export OPENCODE_GO_AUTH_COOKIE="your-auth-cookie-value"
export OPENCODE_GO_WORKSPACE_ID="your-workspace-id"
```

### Option B: Config file

Create `~/.config/opencode/opencode-quota/opencode-go.json`:

```json
{
  "authCookie": "your-auth-cookie-value",
  "workspaceId": "your-workspace-id"
}
```

### How to get your credentials

1. Open [opencode.ai](https://opencode.ai) in your browser and log in
2. Open DevTools → Application → Cookies → opencode.ai
3. Copy the value of the `auth` cookie
4. Your workspace ID is the slug in the URL: `https://opencode.ai/workspace/<workspace-id>/go`

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

---

## 🇪🇸 Español

Lee las instrucciones en español aquí: [INSTALAR.md](INSTALAR.md)
