# Command Codex, Autocomplete and World Authority (Part 6, 2026-11-10)

Part of this work was started by another session between 16:28 and 16:45. That session added:
- the command line (`CommandLine.tsx`, `src/lib/commandLine.ts`)
- the ID picker (`IdInput.tsx`)
- the coordinate map (`WorldMap.tsx`)
- the `@uid`/UID-policy checks in `execute`
- `tests/integration/codex-map.integration.mjs`

This part builds on it: nothing was rewritten.

## 1. Why the map was "locked" (root cause, with evidence)

There is no feature flag or lock in the Console. The lock is in the game server's data:

| Check | Finding |
|---|---|
| Point files in `resources/BinOutput/Scene/Point` | 2,203 files; 2,154 use the 7.2 layout, where the points sit under the obfuscated key `NNGAFPEMOML` (4,540 points). Only 27 old files use `points` (140 points). No file has both layouts. |
| Server loader | `ResourceLoader.ScenePointConfig` read only `points`. Result: 140 points in 27 scenes, and **scene 3 (Teyvat) had none**. |
| Point fields and types | Coordinates, area and type are obfuscated too (`CMGLCIKBLJJ` = pos, `NPCCBOFKBCO` = tranPos, `$type` `KDEHKECBDBO` = SceneTransPoint…). The game code compares readable names (`"SceneTransPoint"`, `"DungeonEntry"`, `"SceneBuildingPoint"`). |
| In-game effect | `PlayerProgressManager.unlockTransPoint` returns false when the point is not in `GameData`. No Teleport Waypoint or Statue in scene 3 could be unlocked, so the map stayed locked, and `SceneTransToPointReq` had no destination. |
| Second bug found while fixing | `PointData.updateDailyDungeon` threw a NullPointerException for 7.2 daily-domain rows (empty day lists). That aborted the whole ScenePoints stage partway: 2,285 points loaded and scene 3 was still missing. |
| Not the cause | Assets, backend routes, auth and permissions: the bridge answered, and teleport by coordinates already worked. |

### Fix (no resource file was modified)

- **Container:** `ScenePointConfig.points` also reads `NNGAFPEMOML`.
- **Fields:** `PointData` gets alternate keys for areaId, pos, tranPos, rot, size and tranSceneId.
- **Types:** `getType()` translates the 9 obfuscated type names.
  - **Where the mappings come from:** `scripts/derive-point-keys.mjs` matched 4,549 points against the deobfuscated AstaPS-Resource files (MIT). Every field agreed on at least 94% of points and every type on 100%.
  - **What stays unmapped:** two types that are obfuscated in the reference too stay raw. `unlocked`, `groupLimit` and `forbidSimpleUnlock` are also not mapped: there were too few samples, or two keys tied.
- **Daily domains:** `updateDailyDungeon` is null-safe, and one bad point can no longer abort the stage.

**Result:** **4,680 points in 2,181 scenes; scene 3 has 1,619** (638 SceneTransPoint, 304 DungeonEntry…).

**In-game check:** a mock client sent the game's own `UnlockTransPointReq` for scene 3:
- Waypoints 14 and 15 returned `retcode 0`, and the server sent `ScenePointUnlockNotify`.
- A non-existent point returned `-1`.

**About "scene3_point.json skipped":** the current `scene3_point.json` is the 7.2 layout file (1,619 points). It was kept as is and read through the new keys. Nothing was merged or overwritten.

## 2. World Authority

- **Scene and point selection:** the scene list comes from the catalog. The map draws every teleport point at its real coordinates (`src/lib/worldMap.ts`: X right, Z up, square fit, `project`/`unproject` are exact inverses).
- **Server check:** when connected, the map reads `GET /scenes/{id}/points`. A catalog point counts as **confirmed** when the server has the same id, the same type and a destination within 1 m. All 1,086 scene-3 catalog points are confirmed.
- **Teleport by point:** a confirmed point is sent as `{sceneId, pointId}`. The server lands on the point's own destination: `tranPos`, or `pos` when 7.2 stores `tranPos` as (0, 0, 0), which 12 scene-3 points do. That is the same spot the in-game teleport uses, and the position is read back (within 2 m, else `STATE_VERIFICATION_FAILED`). Points the server does not confirm fall back to coordinates, with a visible warning.
- **Coordinates:** checked before sending and again on the server. Partial or non-numeric values are refused, and so are values outside every scene (|X|, |Z| ≤ 20,000, −2,000 ≤ Y ≤ 5,000 → `INVALID_POSITION/OUT_OF_BOUNDS`).
- **World info:** the player summary shows how many waypoints/statues the player unlocked in the current scene and how many points the server knows there.
- **Isolated failures:** world level, spawning and teleport by coordinates keep working if the scene points cannot be read; the map then says so.

## 3. Command Codex

The metadata comes from the server's own `@Command` registry (`GET /commands`, or the snapshot generated from the same annotations): label, aliases, usage lines, permission, target requirement, description and allowlisted status. Nothing is hand-written.

Additions:
- **Arguments table per usage:** required/optional, repeatable, and expected type (game ID with its catalog kind, number, coordinate, flag, one-of, text, player UID).
- **Examples:** generated from the usage text with real 7.2 IDs. Every generated example (over 40) passes the same check as the Execute button.
- **Fuzzy matching:** finds commands with skipped letters or one typo (`teleprot` → `/teleport`), and exact aliases rank first (`g` → `/give`). Item search falls back to fuzzy matching when nothing contains the text.
- **New suggestion kinds:**
  - **`player`:** online UIDs; UIDs the bridge refuses are shown disabled. `GET /players` now has a `writable` flag.
  - **`point`:** teleport points by area name. Picking one inserts `x y z`, plus the scene for `/teleport`.
- **Permission-aware list:** commands outside the allowlist are labelled.
- **Typed pages first:** commands with a typed page (`give`, `teleport`, `spawn`, `setconst`, `talent`…) link to the Spawner, Builders or World. The raw command stays available as an advanced option.
- **Parser fix:** `[sceneId]`/`[uid]`/`[sceneTagId]` written without `<>` were parsed as flags, so `/teleport x y z 3` reported the `3` as an extra word. Bare words that end in "id" are now values.

Secure execution (server, unchanged rules plus Part 6 checks):
- Admin only, and only commands on the `nukva.json` allowlist.
- The target is the `uid` field, checked against the same `targets` policy as every `{uid}` route.
- `@uid` inside the text is refused.
- Dangerous commands need an explicit tick in the Console.
- The result is the server's own feedback.

## 4. API

| Route / change | Notes |
|---|---|
| `GET /scenes` | `{sceneId, type, points}` for every scene |
| `GET /scenes/{sceneId}/points` | the server's loaded points with type, area, pos, tranPos, destination, teleportable; `UNKNOWN_SCENE` |
| `POST /players/{uid}/teleport` | adds `pointId` (not combined with x/y/z), bounds check, position read-back; the result carries `position`, `destination`, `point` |
| `GET /players` | adds `writable` |
| `GET /players/{uid}` | adds `unlockedPoints`, `scenePoints` |
| capabilities | `world.points`, `world.teleport.point` |
| error | `POINT_NOT_FOUND` (409: like every bridge "not found", because Grasscutter's global 404 handler replaces 404 bodies) |

## 5. Tests

| Suite | Result |
|---|---|
| Server unit tests: new `NukvaScenePointsTest` (obfuscated layout, plain layout, the real `scene3_point.json`) and earlier suites | 45/45 |
| Console unit tests: new `codex.test.ts` and `worldMap.test.ts`; `suggest.test.ts` updated for the new `x` → point rule; the route snapshot now matches the live server's 32 routes | 132/132 |
| `codex-map.integration.mjs` (mock uid 10168, isolated p6b server) | 13/13 |
| Part 3 / 4 / 5 regressions | 14/14, 9/9, 17/17 |
| In-game `UnlockTransPointReq` via the mock client | waypoints 14 and 15: retcode 0 + `ScenePointUnlockNotify`; point 65000: refused |
| Browser: `/teleprot` → `/teleport` with Tab, area search "gavireh" → statue #744 with ↓ Enter, line validated, executed from the UI | position read back 480.12, 326.62, 6188.01 in scene 3; audit origin `http://127.0.0.1:5173` |

## 6. Open points

- **Real 7.2 client:** the in-game map unlock was checked with the mock client only.
- **Unmapped boolean flags:** `unlocked`, `groupLimit` and `forbidSimpleUnlock` have no 7.2 key yet. Points that are "unlocked by default" in the game are not auto-unlocked by the server.
- **Map imagery:** none is bundled. The map is an accurate coordinate map, without terrain.
- **Main server (8088):** it needs this jar to get the scene-point fix.
