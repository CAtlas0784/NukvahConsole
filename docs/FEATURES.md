# Features and known limitations

Status legend: **Implemented** (works end-to-end through the bridge), **UI only** (no server
action involved), **Unavailable** (shown as disabled/labelled in the UI).

## Implemented

| Feature | Bridge capability |
|---|---|
| Server status, versions, role, uptime, online count | `players.read` |
| Online player list, player profile, currencies, inventory counts | `players.read` |
| Owned characters with level, ascension, constellation, talents, friendship, weapon, artifacts | `avatars.read` |
| Grant a character (level, constellation, talent level) | `avatars.grant` |
| Set character level / constellation / Normal-Skill-Burst levels | `avatars.level`, `.constellation`, `.talents` |
| Give items (single or batch, per-item results) | `items.give` |
| Give weapons (level, refinement, amount) | `weapons.give` |
| Give artifacts (piece, level, main stat, exact substat rolls; remainder rolled by server) | `artifacts.give` |
| Player inventory table | `inventory.read` |
| World level | `world.level` |
| Teleport (scene default point or coordinates) | `world.teleport` |
| Spawn monsters at the player | `world.spawn` |
| Command reference from the live server | `commands.list` |
| Raw command execution (allowlisted, admin, disabled by default) | `commands.execute` |
| Server audit log on the dashboard | `audit.read` |

## UI only

Universal search and palette, catalog browsing, command builder (copy to clipboard), presets
(create, apply via the operations above, JSON import/export with validation), coordinate
bookmarks, local operation history, EN/TH, reduced motion, preview mode.

## Unavailable (needs new bridge work)

| Feature | Why |
|---|---|
| Equip a weapon/artifact onto a character from the console | Needs a bridge endpoint wrapping `Avatar.equipItem` + inventory GUID selection |
| Set friendship (fetter) level | Not exposed yet (`SetFetterLevelCommand` exists in the server) |
| Ascension phase independent of level | Bridge derives it from level, like the give command |
| Acting on offline players | Offline players' avatars/inventory aren't loaded; editing the DB directly is forbidden by design |
| Named teleport waypoints | Waypoint names aren't present in the available resources (point files are hashed); use scenes + saved coordinates |
| Character / item artwork | Not bundled (licensing); configure your own `VITE_ASSET_BASE_URL` |

## Verification status

- Frontend: `tsc` clean, production builds for Vercel (`/`) and Pages (`/nukva-console/`), 25 unit
  tests (search ranking incl. Thai, usage parser, preset schema, API client error handling).
- Bridge: compiles; 6 JUnit tests (hashing, auth, roles, rate limit, lockout, config
  normalisation).
- **Live bridge test (2026-11-09, mock-tier player):** a mock client (`work/nukva_mock_player.py`,
  reusing `tools/mock72`) logged in to the real server; every endpoint was exercised with curl:
  auth (401), role (403), origin (403), preflight (204 + CORS), rate/validation errors (400/409),
  grant + update character (read-back Lv90 C6 talents 10/9/8), batch give (mora, primogems,
  materials, R5 weapon), artifact with exact stats, world level, teleport with coordinates,
  spawn, inventory, audit. The console's connect flow was tested in the browser up to
  authentication (CORS + health + clear `UNAUTHORIZED` message).
- **Not verified:** a signed-in browser session against the live bridge, and in-game effects on
  a real 7.2 client (SnezhnayaCore's real-client compatibility is itself still unverified).

## Known data caveats

- **Random artifact stats do not work with the current server resources.**
  `ReliquaryMainPropExcelConfigData` and `ReliquaryAffixExcelConfigData` lack the `weight` /
  `upgradeWeight` fields, so the server cannot roll any random main stat or substat (this also
  affects the `give` command and drops). The bridge refuses to create a stat-less artifact
  (`RANDOM_ROLL_UNAVAILABLE`) and reports `rolls` vs `expectedRolls`; the builder therefore
  defaults to an explicit main stat, and every roll you want must be chosen explicitly.

- Catalog reflects the server's current resources: e.g. 7.1/7.2 characters missing from the
  AnimeGameData Excel set (see `SnezhnayaCore/docs/ASTAPS_INTEGRATION.md`) are absent here too.
- Thai character names equal the English ones (the game's Thai localisation keeps them in English).
- Sands' resistance (`*_SUB_HURT`) main-stat rows exist in the data but never roll in the game;
  they are excluded from the builder.
- One artifact piece per set/slot/rarity is offered: the standard randomisable variant (largest
  main/sub-stat pools). Fixed-stat event variants are omitted.
