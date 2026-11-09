# Deployment

The console is a static site. Both targets build the same code; only the base path differs.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_BASE_PATH` | `/` | `/` for Vercel; `/<repository>/` for a GitHub Pages project site (the workflow sets it) |
| `VITE_DEFAULT_API_URL` | empty | Pre-fills the server URL on the connect screen |
| `VITE_ASSET_BASE_URL` | empty | Artwork you host and may use (`<base>/<IconName>.png`) |

These end up in public JavaScript. **Never** put tokens or passwords in them.

## Vercel

1. Push this repository to GitHub and import it in Vercel (framework: Vite — detected).
2. `vercel.json` sets `npm run build` → `dist/`, SPA rewrites (deep links and refresh work),
   long-cache headers for hashed assets and basic security headers.
3. Optionally set `VITE_DEFAULT_API_URL` / `VITE_ASSET_BASE_URL` in *Project → Settings →
   Environment Variables*.
4. Add the deployment origin (e.g. `https://nukva-console.vercel.app`) to the bridge's
   `allowedOrigins`.

## GitHub Pages

1. Push to a repository (suggested name: `nukva-console`).
2. *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
3. Push to `main` (or run the workflow manually). `.github/workflows/pages.yml` runs the tests,
   builds with `VITE_BASE_PATH=/<repository>/`, and deploys `dist/`.
4. Optional repository *variables*: `NUKVA_DEFAULT_API_URL`, `NUKVA_ASSET_BASE_URL`.
5. Add `https://<user>.github.io` (origin only — no path) to the bridge's `allowedOrigins`.

**SPA routing on Pages:** the build copies `index.html` to `404.html`. Pages serves it for any
unknown path; the app boots with the correct base and the router renders the requested route,
so refreshing `/nukva-console/characters` works. (Pages still sends HTTP 404 for those URLs; this
is the standard limitation of Pages and does not affect users.)

For a custom domain or a `<user>.github.io` user site, build with `VITE_BASE_PATH=/`.

## Connecting the hosted console to SnezhnayaCore

The browser talks to the bridge directly, so the bridge must be reachable over **HTTPS** from the
user's machine.

### 1. Enable the bridge

In the server's working directory create `nukva.json` (template: `nukva.example.json`):

```json
{
  "enabled": true,
  "allowedOrigins": ["https://<user>.github.io", "https://nukva-console.vercel.app", "http://localhost:5173"],
  "tokens": [{ "id": "owner", "sha256": "<sha256 of your token>", "role": "operator" }]
}
```

Restart the server; the log shows `[Nukva] API bridge enabled at /nukva/v1 …`.

### 2. Provide HTTPS — pick one

**Tailscale Serve (recommended; private to your tailnet).** You already use a `*.ts.net` host.

```bash
tailscale serve --bg 8088
```

The console URL is then `https://<machine>.<tailnet>.ts.net`. Only devices on your tailnet can
reach it. (`tailscale funnel` would make it public — avoid unless you need it.)

**Cloudflare Tunnel.** `cloudflared tunnel --url http://127.0.0.1:8088` (or a named tunnel with
Cloudflare Access in front for an extra login).

**Reverse proxy (Caddy).**

```
nukva.example.com {
    reverse_proxy 127.0.0.1:8088
}
```

**SnezhnayaCore's own TLS** (`server.http.encryption.useEncryption` with a keystore) works only
with a certificate browsers trust.

### 3. Local development

`npm run dev` serves `http://localhost:5173`; browsers allow it to call
`http://127.0.0.1:<port>` directly. Add `http://localhost:5173` to `allowedOrigins`.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `NETWORK` on connect | Wrong URL, untrusted certificate, server down, or origin not allowed (no CORS headers) |
| `ORIGIN_NOT_ALLOWED` | Add the exact origin shown in the message to `allowedOrigins` |
| `BRIDGE_NOT_FOUND` / generic `{"retcode":0…}` | Bridge disabled, or another process owns the port |
| `UNAUTHORIZED` | Token doesn't match any digest |
| `LOCKED_OUT` | Too many failures from your IP; wait 10 minutes |
| `PLAYER_OFFLINE` | The bridge acts only on online players |
| `GAME_THREAD_TIMEOUT` | Server tick stalled or overloaded |
