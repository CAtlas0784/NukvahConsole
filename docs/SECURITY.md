# Security

## Threat model

The console is a public static site. Anyone can load it; **authority comes only from a bridge
token**, which lives in the user's browser tab, never in the site's code. The bridge is an
administrative API on a game server reachable from the internet, so it must assume hostile
callers.

## Controls

| Control | Implementation |
|---|---|
| Off by default | Bridge routes are not registered unless `nukva.json` exists with `enabled: true` and ≥ 1 valid token hash |
| Authentication | `Authorization: Bearer <token>`; token length 24–512; SHA-256 digest compared with `MessageDigest.isEqual` against every configured digest |
| No plaintext secrets on the server | `nukva.json` stores only SHA-256 digests (it is git-ignored anyway) |
| Authorization | Roles `viewer` (reads) < `operator` (typed writes) < `admin` (raw commands). Enforced per route server-side; the UI mirrors it only for usability |
| Origin restriction | Exact-match `allowedOrigins`; `*` is discarded. Browser requests from other origins are refused with 403 before any work is done. Requests without `Origin` (curl, scripts) still need a token |
| Rate limiting | Per token+IP: 240 requests/min, 40 writes/min (configurable) |
| Brute-force lockout | 10 failed authentications per IP within 10 min → 429 |
| Input validation | Every ID checked against loaded `GameData`; numeric ranges; artifact depot rules; batch ≤ 50; entity spawn ≤ 20; stack ≤ 1,000,000 |
| Command injection | No string-built commands for typed operations. Raw execution: disabled by default, admin only, label allowlist, ≤ 256 chars, no control chars, `@uid`/`target` rejected, target taken from the validated `uid` field |
| Consistency | Mutations run on the game thread via the server scheduler using existing game methods — no direct MongoDB writes |
| Audit | Every write (success, failure, forbidden) → `logs/nukva-audit.log` (JSON lines: time, token id, IP, origin, action, uid, body, result) and the server log |
| Response hygiene | `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; errors never include stack traces |
| Frontend | `credentials: 'omit'`, `referrerPolicy: no-referrer`; token kept in memory, or in `sessionStorage` only when "keep me linked" is ticked; nothing secret in `VITE_*` variables |

## Tokens

Generate a long random token and its digest (PowerShell):

```powershell
$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
$hash  = [BitConverter]::ToString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($token))).Replace('-','').ToLower()
"token: $token"; "sha256: $hash"
```

Or with OpenSSL/Python:

```bash
python3 -c "import secrets,hashlib;t=secrets.token_urlsafe(32);print(t);print(hashlib.sha256(t.encode()).hexdigest())"
```

Put only the `sha256` into `nukva.json`; give the token to the console user. Rotate by replacing
the digest and restarting the server. Use a separate token per person so audit entries are
attributable, and give `admin` only to whoever needs raw commands.

## Transport

Browsers block an HTTPS page from calling `http://` hosts (except loopback). Serve the bridge over
HTTPS — see [DEPLOYMENT.md](DEPLOYMENT.md#connecting-the-hosted-console-to-snezhnayacore). Prefer
a private network (Tailscale Serve, not Funnel) so the bridge is not reachable from the public
internet at all.

## Global CORS setting

SnezhnayaCore's own `server.http.policies.cors` applies to *all* routes. The bridge sets its own,
stricter CORS headers on `/nukva/*` (overriding the global ones for allowed origins). If you do
not need global CORS for other tooling, set `policies.cors.enabled` to `false`.

## Known limitations

- Tokens are static bearer secrets; no expiry/refresh. Rotate manually.
- Rate-limit and lockout state is in memory and resets on restart.
- The audit log is append-only by convention, not tamper-proof.
- Raw command output is captured from console feedback and may be incomplete for threaded commands.
