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

## Connecting the console to SnezhnayaCore

The bridge is **local-only and has no tokens**: run the server and open the console on the same
machine, then connect to `http://127.0.0.1:<HTTP listener port>` (default `http://127.0.0.1:8088`,
from `server.http.bindPort` in `config.json`).

### 1. Bridge settings (optional)

The bridge is on by default; `nukva.json` in the server's working directory is optional
(template: `nukva.example.json`). Use it to turn the bridge off or to allow another console origin:

```json
{
  "enabled": true,
  "allowedOrigins": ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"]
}
```

Restart the server after changing it; the log shows `[Nukva] API bridge enabled at /nukva/v1 (local-only …`.

### 2. Run the console

`npm run dev` serves `http://localhost:5173` (`npm run preview` → `http://localhost:4173`); both
origins are allowed by default. A hosted copy (Vercel/GitHub Pages) also works from this machine
if you add its origin to `allowedOrigins`, since browsers let any page call loopback.

Tailscale Serve, Cloudflare Tunnel and reverse proxies are **not** supported: requests that carry
forwarding headers are refused with `LOCAL_ONLY`.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `NETWORK` on connect | Server down, wrong port, or origin not allowed (no CORS headers) |
| `ORIGIN_NOT_ALLOWED` | Add the exact origin shown in the message to `allowedOrigins` |
| `BRIDGE_NOT_FOUND` / generic `{"retcode":0…}` | Bridge disabled (`enabled: false`), or another process owns the port |
| `LOCAL_ONLY` | Request did not come from this machine via 127.0.0.1/localhost, or went through a proxy/tunnel |
| `PLAYER_OFFLINE` | The bridge acts only on online players |
| `GAME_THREAD_TIMEOUT` | Server tick stalled or overloaded |
