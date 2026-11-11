# API integration (Part 3, 2026-11-10)

Every route the console uses, the server code behind it, and how each was verified. The
machine-readable contract is [`api/contract.json`](../api/contract.json). TypeScript types are
generated from it into `src/api/generated.ts` (`npm run api:types`). A test compares the contract
with the route table the live server reports (`GET /routes`).

## Where the API lives

The bridge is inside SnezhnayaCore (`src/main/java/emu/grasscutter/server/http/nukva/`), mounted at
`/nukva/v1` on the server's own HTTP listener. The proposed `/api/v1/...` routes were **not**
duplicated. Existing routes were reused and the missing ones added under the same prefix:

| Proposed | Implemented as |
|---|---|
| `GET /api/v1/catalog/characters` | `GET /nukva/v1/catalog/characters` (new) |
| `GET /api/v1/catalog/items` | `GET /nukva/v1/catalog/items?type=` (new) |
| `GET /api/v1/catalog/weapons` | `GET /nukva/v1/catalog/weapons` (new) |
| `GET /api/v1/artifacts/catalog` | `GET /nukva/v1/artifacts/catalog` (new) |
| `GET /api/v1/artifacts/pieces/{itemId}/options` | `GET /nukva/v1/artifacts/pieces/{itemId}/options` (new) |
| `GET /api/v1/players/{uid}/inventory` | `GET /nukva/v1/players/{uid}/inventory` (existing) |
| `GET /api/v1/players/{uid}/artifacts` | `GET /nukva/v1/players/{uid}/artifacts` (new) |
| `POST /api/v1/players/{uid}/items` | `POST /nukva/v1/players/{uid}/items` (existing, now verified per item) |
| `POST /api/v1/players/{uid}/artifacts` | `POST /nukva/v1/players/{uid}/artifacts` (existing, now verified per piece) |
| `POST /api/v1/players/{uid}/artifacts/{guid}/equip` | `POST /nukva/v1/players/{uid}/artifacts/{guid}/equip` (new) |

The console's display catalog (names, icons) stays static (`public/data`, Part 2). The new catalog
routes return what the server will **accept** (ids, types, limits, artifact rules), straight from
the loaded `GameData` that every write is validated against.

## Request pipeline (every route)

```
browser / script
  → CORS: Origin must be in nukva.json allowedOrigins (no Origin = non-browser, allowed)
  → local-only identity: loopback socket peer + loopback Host + no X-Forwarded-*/Forwarded headers
  → rate limit (requests and writes per minute)
  → role check (single local principal = admin; roles kept for the contract)
  → writes: target UID permission (nukva.json targets.allowUids / denyUids) → PERMISSION_DENIED
  → writes: Idempotency-Key (optional header) → replay / IN_PROGRESS / IDEMPOTENCY_KEY_REUSED
  → validation against GameData (ids, types, ranges, artifact rules) → 4xx before any change
  → game thread (GameServer scheduler), the same Player/Avatar/Inventory/World methods the GM commands use
  → read-back of the changed state → STATE_VERIFICATION_FAILED if it differs
  → audit log (logs/nukva-audit.log + memory ring), JSON envelope
```

There are no secrets in the frontend: the bridge has no tokens, and it refuses anything that does
not come from this machine.

## Routes and handlers

| Method + path | Handler (`NukvaOperations`) | Game-state methods used | Read-back | Verified by |
|---|---|---|---|---|
| GET `/health` | handler | — | — | integration (all runs) |
| GET `/status` | `status` | — | — | browser connect |
| GET `/routes` | handler route table | — | — | integration → `reports/api/routes.json` (28 routes) → contract test |
| GET `/players`, `/players/{uid}` | `players`, `player` | `GameServer.getPlayers`, `Player` getters | — | integration, browser |
| GET `/players/{uid}/avatars` | `avatars` | `Player.getAvatars` | — | integration |
| GET `/players/{uid}/inventory?type=` | `inventory` | `Inventory.getItems` | — | integration |
| GET `/players/{uid}/artifacts` | `playerArtifacts` | same, relics only | — | integration |
| GET `/catalog/characters` | `catalogCharacters` | `GameData.getAvatarDataMap` (playable rule) | — | integration: 121 |
| GET `/catalog/items` | `catalogItems` | `GameData.getItemDataMap` | — | integration: 4,292 relic items; bad type → INVALID_TYPE |
| GET `/catalog/weapons` | `catalogWeapons` | item map + 1TXXX rule | — | integration: 258 |
| GET `/artifacts/catalog` | `artifactCatalog` | item map + `ReliquarySetDataMap` | — | integration: 64 sets |
| GET `/artifacts/pieces/{id}/options` | `artifactPieceOptions` | `ReliquaryMainPropDataMap`, `ReliquaryAffixDataMap` | — | integration: sands rollable mains = HP%, ATK%, DEF%, ER, EM; non-artifact → ITEM_NOT_FOUND |
| GET `/catalog/loaded`, `/commands`, `/audit` | existing | — | — | Part 2 / browser |
| POST `/players/{uid}/items` | `giveItems` | `Inventory.addItem` (`ActionReason.Gm`) | per item: weapons/artifacts by new guid; materials by count delta; currencies by player property; consumed-on-gain items reported `not-countable` | integration + browser (Mora +4,242 → `verified`) |
| POST `/players/{uid}/artifacts` | `giveArtifact` | `GameItem`, `addAppendProps`, `Inventory.addItem` | stored piece by guid: level, main stat, requested substats | integration (Lv21 piece, 4 chosen + 5 server rolls = 9) |
| POST `/players/{uid}/artifacts/{guid}/equip` | `equipArtifact` → `equipItem` | `Avatar.equipItem` | slot holds that guid, `equipCharacter` = avatar | integration (+ `AvatarEquipChangeNotify` sent) |
| POST `/avatars/{id}/equip`, `/unequip` | `equipItem`, `unequipItem` | `Avatar.equipItem`, `Inventory.unequipItem` | slot state | integration |
| PATCH `/players/{uid}/items/{guid}` | `patchItem` | `GameItem` setters, `PacketStoreItemChangeNotify` | stored values | integration |
| POST `/players/{uid}/avatars` | `grantAvatar` | `new Avatar`, `Player.addAvatar` | in roster at the level asked | integration (10000999 refused: NOT_PLAYABLE) |
| PATCH `/players/{uid}/avatars/{id}` | `updateAvatar` | `setLevel`, `forceConstellationLevel` + `recalcConstellations` (+ scene reload when lowering), `setSkillLevel`, `setFetterLevel` | level, constellation, friendship | integration (4 runs: raise and lower paths) |
| POST `/avatars/{id}/max` | `maxAvatar` | as above + weapon level/refinement | — (preview/apply in one task) | Part 1 |
| POST `/players/{uid}/world-level` | `setWorldLevel` | `Player.setWorldLevel` | `getWorldLevel` | integration |
| POST `/players/{uid}/teleport` | `teleport` | `World.transferPlayerToScene` | `getSceneId` | integration (+ `PlayerEnterSceneNotify`) |
| POST `/players/{uid}/spawn` | `spawn` | `Scene.addEntity(new EntityMonster)` | count | Part 1 |
| POST `/commands/execute` | `execute` | `CommandMap.invoke` (allowlisted) | command feedback | Part 1 |

## Error codes

The full list, with HTTP statuses, is in `api/contract.json` → `errors` (46 codes) and is generated
into `ErrorCode` / `ERROR_STATUS`. The ones requested for this phase:

| Code | HTTP | Meaning |
|---|---|---|
| PLAYER_NOT_FOUND | 409 | No player with this UID (read-only DB lookup); `PLAYER_OFFLINE` when it exists but is offline |
| PERMISSION_DENIED | 403 | Target UID blocked by `targets` in nukva.json (checked before anything runs) |
| ITEM_NOT_FOUND | 409 | No item with that guid / not an artifact id |
| INVALID_ARTIFACT_CONFIG | 400 | `detail`: INVALID_MAIN_STAT, INVALID_SUBSTAT, TOO_MANY_SUBSTATS, TOO_MANY_SUBSTAT_TYPES, SUBSTAT_EQUALS_MAIN (RANDOM_ROLL_UNAVAILABLE as 409) |
| INVENTORY_FULL | 409 | Weapons/artifacts would exceed the tab capacity; **nothing** from the batch is added |
| SERVER_UNAVAILABLE | 503 / 504 | No game server (503), or the game thread did not finish in time (504, `detail` GAME_THREAD_TIMEOUT: re-read state) |
| UNSUPPORTED_OPERATION | 400 | Target exists but the operation does not apply (`detail` NOT_PLAYABLE for trial/test/UGC avatars) |
| STATE_VERIFICATION_FAILED | 409 | The change ran but the read-back differs; `data` holds what was read |

Envelope: `{ ok: false, error: { code, detail?, message }, data? }`. The console shows
`CODE (detail): message` and never turns an error into success.

## Duplicate execution, concurrency, interruptions

- **Idempotency-Key.** Every console write sends `Idempotency-Key: <operation key>:<n>`. The key
  is made once per opened confirm dialog, so pressing Confirm again after a dropped connection
  reuses it. The server (`NukvaIdempotency`, 15 min, at most 2,000 keys):
  - The first request runs.
  - A repeat with the same request returns the stored response (header `Idempotency-Replayed: true`).
  - A repeat while the first is still running gets `IN_PROGRESS`.
  - The same key with a different body gets `IDEMPOTENCY_KEY_REUSED`.
  - A request rejected by validation (400) frees its key. Anything that reached the game keeps its
    result. A game-thread timeout keeps the key "in progress" until it expires, because the task
    may still run.
- **Server bug fixed (root cause of the one failure at the end of the previous session):**
  `ServerTaskScheduler.nextTaskId` was a plain `int` incremented from many threads. Two parallel
  requests could get the same task id, and `tasks.put` then **silently replaced** one task, which
  never ran: one of 10 parallel writes timed out after 10 s. The counter is now an `AtomicInteger`.
  `ServerTaskSchedulerTest` (16 threads × 2,000 tasks, one tick must run all 32,000) failed on the
  old code and passes on the new. This affects every caller of the scheduler, not just the bridge.
- **Latency.** Game-thread work runs on the server tick (1 s), so a write takes up to about 1 s.
  Parallel writes are applied in the same tick.

## Frontend refresh and feedback

- `runOperation` reports success only when the response (and its `judge`, e.g. every item
  `success: true`) says so. Failures show `code (detail): message`.
- After **every** write attempt, success or failure, `useDataVersion` is bumped, and every live
  data hook re-reads the server. A partial or failed write may still have changed state.
- Game-client sync is the server's own mechanism: the same packets the GM commands send
  (`AvatarEquipChangeNotify`, `AvatarUnlockTalentNotify`, `AvatarFetterDataNotify`,
  `PlayerEnterSceneNotify`, `StoreItemChangeNotify`, `AvatarPropNotify`). The integration test
  checks the server log for them. `AvatarPropNotify` is in the server's LOOP_PACKETS list and is not
  logged while `isShowLoopPackets` is false, so the level change is proven by the read-back instead.

## Offline players

Not edited. Their avatars and inventory are not loaded in memory, and writing MongoDB behind the
server would bypass validation and the client sync. Reads return PLAYER_OFFLINE; PLAYER_NOT_FOUND
uses a read-only DB lookup.

## Tests

| Suite | Where | Result |
|---|---|---|
| Bridge unit tests | `SnezhnayaCore/src/test/.../nukva/` (Auth 6, Equipment 17, Integrity 9) | 32/32 |
| Scheduler race | `SnezhnayaCore/src/test/.../scheduler/ServerTaskSchedulerTest` | fails before fix, passes after |
| Console unit tests | `npm test` (incl. `src/api/integrity.test.ts`: key stamping and retry, error detail, failure ⇒ not success + refresh, contract ⇔ generated ⇔ live routes) | 96/96 |
| Live integration | `tests/integration/bridge.integration.mjs` against the **isolated** server (18088, DB `grasscutter_regtest`), fixture = fresh mock account (uid 10160) | 14/14, four consecutive runs (`reports/api/integration-results.json`) |
| Browser | Console connected to the isolated bridge, Inventory → give Mora ×4,242 to uid 10160 | response `verified`, server balance +4,242, audit entry with origin, page re-read after the write |

The integration suite refuses to run against port 8088 or uid 10004. It covers: authorized writes
with read-back, permission denial (incl. the real account 10004 via `denyUids`), invalid ids,
unknown player, invalid artifact configs (three different rules, nothing created), artifact
create → read → equip → read on character, duplicate execution and key reuse, 10 parallel distinct
writes and 10 parallel copies of one key, client abort plus retry with the same key (applied once),
INVENTORY_FULL (nothing added), character/world writes with sync packets (raise and lower paths),
and unequip/edit read-back.

Isolated-only test settings (`work/isolated/config.json` weapons limit 30; `nukva.json` denyUids
[10004, 77777] and higher rate limits) are not used by the main server. Backups: `*.bak_p3`.

## Not verified

- A real 7.2 client. All checks used the mock client; the main server and the real player were
  not touched.
- Seeing the `Idempotency-Key` header on a browser request directly (the browser tool does not
  expose request headers). It is covered by unit tests and the successful CORS preflight.
- `STATE_VERIFICATION_FAILED` on a live server: no natural way to make the server disagree with
  itself. Covered by unit tests of the envelope and code paths only.
