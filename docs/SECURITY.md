# Security

## Threat model

The server and the console run on the same machine for one person. **Authority comes from
being on that machine**: the bridge has no tokens and answers only requests made locally through
`http://127.0.0.1:<port>`. The remaining threats are other machines on the network (the HTTP
listener binds `0.0.0.0` for game clients) and hostile web pages open in the local browser.

## Controls

| Control | Implementation |
|---|---|
| On/off | Routes are registered unless `nukva.json` sets `enabled: false`; the file is optional |
| Local-only | The socket peer (`getRemoteAddr()`, never a header) must be a loopback IP; anything else → 403 `LOCAL_ONLY` |
| No proxy bypass | Any `X-Forwarded-For`, `X-Forwarded-Host`, `X-Real-IP`, `Forwarded` or `CF-Connecting-IP` header → 403 `LOCAL_ONLY`, so a tunnel or reverse proxy on this machine cannot expose the bridge |
| DNS rebinding | The `Host` header must be `127.0.0.1`, `localhost` or `[::1]` (any port); a hostile site that resolves its own name to 127.0.0.1 is refused |
| Authorization | Every local request acts as the single `local` principal with role `admin`; the role checks remain in code but always pass |
| Origin restriction | Exact-match `allowedOrigins`; `*` is discarded. Browser requests from other origins (other websites) are refused with 403 before any work is done. Requests without `Origin` (curl, scripts on this machine) are allowed |
| Rate limiting | 240 requests/min, 40 writes/min (configurable) |
| Input validation | Every ID checked against loaded `GameData`; numeric ranges; artifact depot rules; batch ≤ 50; entity spawn ≤ 20; stack ≤ 1,000,000 |
| Command injection | No string-built commands for typed operations. Raw execution: disabled by default, admin only, label allowlist, ≤ 256 chars, no control chars, `@uid`/`target` rejected, target taken from the validated `uid` field |
| Consistency | Mutations run on the game thread via the server scheduler using existing game methods — no direct MongoDB writes |
| Audit | Every write (success, failure) → `logs/nukva-audit.log` (JSON lines: time, principal `local`, IP, origin, action, uid, body, result) and the server log |
| Response hygiene | `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; errors never include stack traces |
| Frontend | `credentials: 'omit'`, `referrerPolicy: no-referrer`; the connect screen accepts only loopback URLs; nothing secret anywhere |

## Transport

Plain `http://127.0.0.1:<port>` is fine: traffic never leaves the machine, and browsers exempt
loopback from mixed-content blocking. Do **not** put the bridge behind Tailscale Serve, Cloudflare
Tunnel or a reverse proxy — it will refuse those requests by design. If you ever need remote
access, that requires bringing back real authentication first.

## Global CORS setting

SnezhnayaCore's own `server.http.policies.cors` applies to *all* routes. The bridge sets its own,
stricter CORS headers on `/nukva/*` (overriding the global ones for allowed origins). If you do
not need global CORS for other tooling, set `policies.cors.enabled` to `false`.

## Known limitations

- Anything that can run code on this machine (another local program or user) can call the bridge.
  That is the accepted trade-off of a local-only, tokenless design.
- Rate-limit state is in memory and resets on restart.
- The audit log is append-only by convention, not tamper-proof.
- Raw command output is captured from console feedback and may be incomplete for threaded commands.
