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

## Autenticación

El plugin obtiene tu uso de Go desde el dashboard de OpenCode. Necesitás tu cookie de autenticación y el ID del workspace.

### Opción A: Variables de entorno

```bash
export OPENCODE_GO_AUTH_COOKIE="valor-de-tu-cookie-auth"
export OPENCODE_GO_WORKSPACE_ID="tu-workspace-id"
```

### Opción B: Archivo de configuración

Creá `~/.config/opencode/opencode-quota/opencode-go.json`:

```json
{
  "authCookie": "valor-de-tu-cookie-auth",
  "workspaceId": "tu-workspace-id"
}
```

### Cómo obtener tus credenciales

1. Abrí [opencode.ai](https://opencode.ai) en tu navegador e iniciá sesión
2. Abrí DevTools → Application → Cookies → opencode.ai
3. Copiá el valor de la cookie `auth`
4. Tu workspace ID es el slug en la URL: `https://opencode.ai/workspace/<workspace-id>/go`

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

---

## 🇬🇧 English

Read the English install guide here: [INSTALL.md](INSTALL.md)
