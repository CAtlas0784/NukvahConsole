# Console ↔ SnezhnayaCore integration — progress log

Continuous log for the 7-part Console project. Newest part last. Every "verified" claim names how it
was checked; anything not listed as verified is not.

---

## Part 1 — Repository and integration audit (2026-11-09)

### 1.1 Repository state at start (nothing reset, committed or pushed)

| Repo | Branch | HEAD | Uncommitted work found (kept as is) |
|---|---|---|---|
| SnezhnayaCore | `feature/nukva-bridge` (also `dev`, `main`) | `be11cca3` 7.2 world entry | Whole `server/http/nukva` package staged/modified: local-only auth (tokens removed), equip / unequip / one-click max / item-patch endpoints, `NukvaEquipmentTest` (untracked); AstaPS reliquary weight import tool (untracked) + `RESOURCE_READINESS §7`; `GameSession`, `PacketWindSeed*`/`PacketWindy`, `UID.luac`/`UID.lua` |
| NukvahConsole | `dev` (tracks `origin/dev`) | `dce08a1` vercel | Catalog rebuild, asset sync script (`scripts/sync-assets.mjs`), Commands autocomplete (`lib/suggest.ts`, `components/ui/IdInput.tsx`, `lib/commandCategories.ts`), settings/asset base, i18n |

Running processes observed (not touched):
- Main server PID 40464 (`SnezhnayaCore-7.2.jar`, started 22:16) — serves the bridge on 8088.
- **A second server PID 5440** (same jar, started 22:55) — also bound to UDP 22101. Two servers on
  one game port can split a client's KCP traffic between them. Not stopped (not mine); flagged as an
  operational blocker below.
- **A real GenshinImpact client (PID 28868) is connected; uid 10004 "GGC" is online** on the main
  server (121 characters, 366 weapons). Treated as a real player: only read-only calls were made
  against it.
- mongod 27017, Vite dev server 5173.

### 1.2 How the system is wired (traced, not assumed)

```
React page → src/api/nukva.ts (typed) → src/api/client.ts fetch(baseUrl + /nukva/v1 + path)
  → Javalin route in NukvaApiHandler.write()/read()
  → originAllowed (CORS allowlist) → localPrincipal (loopback socket + loopback Host + no X-Forwarded-*)
  → rate limit → NukvaOperations.<op>()
  → GameServer scheduler (game thread) → Player/Avatar/Inventory/World methods (same as GM commands)
  → read-back → { ok, data } → page refreshes via useLive().refresh / set
```

- Auth: **no tokens any more**; the single principal is `local` with role ADMIN. Every request from
  this machine is admin. Roles in the UI (`CAPABILITY_ROLE`) are now cosmetic.
- Capabilities: `/status` lists them; the UI enables only listed ones.
- Players must be online (offline players' inventories are not loaded; DB writes are refused by design).
- Catalog: `scripts/build-catalog.mjs` reads the server's `ExcelBinOutput` + `TextMap` → `public/data/*.json`.
- Images: `scripts/sync-assets.mjs` caches Enka UI icons into `.cache/game-assets` (git-ignored,
  served at `/game-assets` by Vite dev/preview only); otherwise a generated sigil is drawn.

### 1.3 Reference study (read-only, sparse clones in the session scratchpad)

| Repo | Commit | Licence |
|---|---|---|
| MeChen618/AstaPS | `a49f51aa` "update to 7.2" | GPL-3.0 |
| MeChen618/AstaPS-Resource | `6cfecfb5` "Update 7.2" | MIT (per earlier session record) |

Findings:
- **GameDepot / ReliquaryMainPropData / ReliquaryAffixData**: AstaPS fills missing weights in code
  (`RelicWeightDefaults` in `onLoad`) and ranks substat value tiers. We instead imported the weights
  into the data (RESOURCE_READINESS §7). Checked our imported weights per depot: flat HP/ATK/DEF have
  weight 0 in Sands (1000), Circlet (3000) and Goblet (5000); percentages match the known rates
  (Sands HP%/ATK%/DEF% 26.7 %, ER/EM 10 %; Circlet CR/CD/Heal 10 %, EM 4 %; Goblet DMG bonuses 5 %).
  AstaPS's `ArtifactShop` warns that "shipped" weights are flat and give flat-HP Sands — **that does
  not apply to our data** (live check below: 8 random Sands, no flat stats).
- **ItemData** (AstaPS): forces `useOnGain` for avatar cards, costumes, flycloaks, namecards and
  energy particles (7.1 data dropped the flag, so wished characters never arrived and particles did not
  charge bursts). **Not ported** — gameplay change, needs its own review (wish / particle paths).
- **ArtifactShop**: lists every 5★ piece as shop goods, rolls with biased odds. Not ported (shop
  feature, GPL code); the Console's artifact builder already covers admin artifact creation.
- **GiveCommand / Inventory / Avatar / GameItem** differ heavily (Lombok refactors + features); no
  bridge-relevant correctness difference was found in the paths the bridge calls (`equipItem`,
  `unequipItem`, `addItem`, `setSkillLevel`, `forceConstellationLevel`).

### 1.4 Resource gap behind the "incomplete catalogs"

The console catalog is generated from the server's own Excel, so it can only show what the server
loads. Compared with AstaPS-Resource (`id` sets):

| Table | Ours | Upstream | Missing |
|---|---|---|---|
| AvatarExcelConfigData | 158 | 169 | 10000133 (Marionette), 134/135 (traveler, crossbow), 140 (Vodyanitsa), 143 (Vesna), 148 (Alyosha), 150 (Odette), 11000047/48/134/135 |
| WeaponExcelConfigData | 266 | 288 | 22 (e.g. 11435-11438, 11520-11522, 12516, 14524, …) |
| ReliquaryExcelConfigData | 4292 | 4352 | 60 pieces |
| ReliquarySetExcelConfigData | 64 | 66 | sets 15047, 15048 |
| AvatarSkillDepot / Skill / Talent / ProudSkill | — | — | 6 / 116 / 36 / 316 rows |
| Avatar / Weapon promote rows | — | — | 44 / 134 |

Not imported in Part 1: a usable character also needs TextMap names and BinOutput avatar/ability
configs, and some of these ids may be unreleased/test rows. Needs a reviewed additive import like
the session-15 one (see Next actions).

### 1.5 Implementation matrix

Status after the Part 1 fixes. "Live" = exercised against a running server with a mock-tier player
(isolated instance, uid 10157). Nothing here is verified with the real client.

| Feature | Status | Frontend | Endpoint | Backend | Resources | Cause of failure / gap | Fix | How tested |
|---|---|---|---|---|---|---|---|---|
| Connect / health / status | WORKING | `features/gate/Gate.tsx`, `stores/session.ts` | GET `/health`, `/status` | `NukvaApiHandler`, `NukvaOperations.status` | — | — | — | Live curl (main + isolated) |
| Authentication | WORKING (local-only) | `api/client.ts` | all | `NukvaAuth.authorizeLocal` | — | No per-user identity: every local caller is admin; role UI is cosmetic | Decide in a later part whether roles still matter | Live: non-loopback Host → 403 `LOCAL_ONLY`; unit tests 6/6 |
| Player list / profile | WORKING | `Topbar`, `Dashboard` | GET `/players`, `/players/{uid}` | `players`, `player` | — | Online players only | — | Live (read-only on real uid 10004 and mock) |
| Characters: list owned | WORKING | `characters/Characters.tsx` | GET `/players/{uid}/avatars` | `avatars` | Avatar Excel | — | — | Live |
| Characters: grant | WORKING | `Characters.tsx`, `Presets.tsx` | POST `/players/{uid}/avatars` | `grantAvatar` | Avatar Excel | Missing ids above cannot be granted (`UNKNOWN_AVATAR`) | Resource import (later part) | Live: grant 10000002 Lv80 C6 T6 |
| Characters: level / talents | WORKING | `Characters.tsx`, `builder/Builder.tsx` | PATCH `/avatars/{id}` | `updateAvatar` | Skill depot | — | — | Live (max path); earlier session live |
| Characters: constellation | **FIXED** (was PARTIAL) | same | PATCH `/avatars/{id}` `{constellation}` | `applyConstellation` | Talent Excel | Lowering sent no packet and skipped `recalcConstellations`, so the client kept the removed constellations | Mirror `SetConstCommand`: recalc + scene reload when lowered; response `sceneReloaded` | Live: C6→C2 `sceneReloaded:true`, 2 `PlayerEnterSceneNotify`; C2→C4 `false`, unlock notifies sent |
| Characters: friendship | **FIXED backend** (was MISSING) / UI MISSING | display only (`Characters.tsx:291`, `Builder.tsx:336`) | PATCH `/avatars/{id}` `{fetter}` | `applyFetterLevel` | AvatarFetterLevel | No endpoint | Added `fetter` 1-10 + capability `avatars.fetter`, mirrors `SetFetterLevelCommand` (exp reset to 0) | Live: fetter 7 read back, `AvatarFetterDataNotify` sent; 0 and 11 → 400. **No UI control yet** |
| One-click max | WORKING | `Builder.tsx` | POST `/avatars/{id}/max` | `maxAvatar` | — | Used `forceConstellationLevel` without recalc | Now uses `applyConstellation` | Live: preview lists 6 changes; apply → Lv90 C6 talents 10/10/10 |
| Weapons: give | WORKING | `armory/Armory.tsx`, `Inventory.tsx` | POST `/items` | `giveItems` | Weapon Excel | 22 weapons missing from data | Resource import | Live: 11509 Lv90 R5 added |
| Weapons: edit / equip | WORKING | `builder/WeaponTab.tsx` | PATCH `/items/{guid}`, POST `/equip` | `patchItem`, `equipItem` | — | — | — | Live (max upgraded weapon); unit tests 17/17 |
| Artifacts: give (explicit stats) | WORKING | `Armory.tsx`, `Presets.tsx` | POST `/artifacts` | `giveArtifact` | Reliquary Excel + weights | — | — | Earlier session live |
| Artifacts: give (random stats) | WORKING | same | POST `/artifacts` (no `mainPropId`) | `giveArtifact` → `GameItem` | Weights (imported) | Was broken before the weight import | — | Live: 8× Sands 51550 Lv21 → main stats EM×3, ATK%×2, ER, HP%, DEF%; 5 substats each |
| Artifacts: equip / unequip / edit | WORKING | `builder/ArtifactsTab.tsx` | POST `/equip`, `/unequip`, PATCH `/items/{guid}` | `equipItem`, `unequipItem`, `patchItem` | — | — | — | Live: equip Sands → slot listed; unequip → empty |
| Artifacts: catalog | PARTIAL | `Armory.tsx` | — (static) | — | Reliquary Excel | 60 pieces / 2 sets missing from data; one variant per set/slot shown | Resource import | Catalog counts |
| Items / materials give | WORKING | `inventory/Inventory.tsx` | POST `/items` | `giveItems` | Item Excel | — | — | Live: 5000 mora |
| Inventory view | WORKING | `Inventory.tsx` | GET `/inventory?type=` | `inventory` | — | ≤ 5000 rows | — | Live |
| Item spawning UX | PARTIAL | `Inventory.tsx`, `Armory.tsx` | — | — | — | ID inputs outside Commands have no autocomplete (`IdInput` only used in `Commands.tsx`) | Reuse `IdInput` (later part) | Code read |
| World level | WORKING | `world/World.tsx` | POST `/world-level` | `setWorldLevel` | — | — | — | Live: 3 read back |
| Teleport (scene / coordinates) | WORKING | `World.tsx` | POST `/teleport` | `teleport` | Scene Excel | No named waypoints | — | Live: scene 3 |
| Map | MISSING | `World.tsx` (scene list + x/y/z inputs only) | — | — | Map tiles + waypoint coords | There is no map component at all; the "locked map" is the absence of one | Build a map view (later part) | Code read |
| Spawn monsters | WORKING | `World.tsx` | POST `/spawn` | `spawn` | Monster Excel | — | — | Live: 2× 20010101 |
| Commands: list | WORKING | `commands/Commands.tsx` | GET `/commands` | `commands` | `@Command` annotations | — | — | Live |
| Commands: execute | WORKING (locally enabled) | `Commands.tsx` | POST `/commands/execute` | `execute` | — | Enabled only because the local `nukva.json` turns it on (example file has it off) | — | Live: `heal` → server feedback returned |
| Commands: autocomplete | PARTIAL (uncommitted) | `lib/suggest.ts`, `IdInput.tsx` | — | — | catalog | Present only in Commands; 8 unit tests | Extend (later part) | Vitest |
| Images | WORKING (local dev/preview only) | `fx/Artwork.tsx`, `scripts/sync-assets.mjs` | — | — | Enka UI host | 121/121 character icons; 12 weapons without icons are templates/test/fishing rod; not served in production builds by design | — | Manifest vs catalog |
| Presets | WORKING (composes the ops above) | `presets/Presets.tsx` | grant/update/items/artifacts | — | — | Inherits catalog gaps | — | Code trace + unit tests |
| Audit | WORKING | `Dashboard.tsx` | GET `/audit` | `NukvaAudit` | — | — | — | Earlier session live |

### 1.6 Code changes in Part 1

| File | Change |
|---|---|
| `SnezhnayaCore/src/main/java/emu/grasscutter/server/http/nukva/NukvaOperations.java` | `applyConstellation` (recalc + scene reload on lowering, as `SetConstCommand`) used by update and max; `applyFetterLevel` + `fetter` field on `UpdateAvatarBody`; `sceneReloaded` in the update response; capability `avatars.fetter` |
| `NukvahConsole/src/api/nukva.ts` | `fetter` in `updateAvatar` body, `sceneReloaded` on `OwnedAvatar`, `avatars.fetter` role entry; removed the "not provided" note |
| `NukvahConsole/docs/FEATURES.md`, `docs/ARCHITECTURE.md` | Friendship row moved; PATCH body documented |
| this file | new |

Build artefact: `SnezhnayaCore/SnezhnayaCore-7.2-p1.jar` (copied to `work/isolated/`). The main
`SnezhnayaCore-7.2.jar` was not rebuilt: it is held open by the running servers.

### 1.7 Tests actually run

| Test | Result |
|---|---|
| `tsc -b` (Console) | clean, before and after |
| `vitest run` (Console) | 46/46 before and after |
| `gradlew test --tests emu.grasscutter.server.http.nukva.*` | NukvaAuthTest 6/6, NukvaEquipmentTest 17/17 |
| `gradlew jar` (with an init script renaming the output) | built, 29 nukva classes in jar |
| Isolated server (18088/22112, DB `grasscutter_regtest`) + mock player uid 10157 | all live results in the matrix; no bridge errors in `work/isolated/logs/latest.log` (only the pre-existing startup resource errors: Quest/Talk/Statue tables) |

### 1.8 Remaining bugs and blockers

1. **Two server processes share UDP 22101** (PIDs 40464 and 5440). One should be stopped by the
   operator; I did not, because a real client is connected.
2. Friendship has a backend endpoint but no Console control (display only).
3. Resource gap (§1.4): 7 characters, 22 weapons, 60 artifact pieces, 2 sets.
4. No interactive map.
5. Item/character ID entry outside Commands has no autocomplete.
6. Local-only auth makes every caller admin; role UI is inert.
7. `gradlew jar -PjarFilename=…` fails ("Illegal char <:>"): `build.gradle` interpolates
   `${archiveExtension}` (a Property object) into the file name. Pre-existing; not changed.
8. AstaPS `ItemData.useOnGain` fix (wished characters / energy particles) not evaluated for our data.
9. Nothing verified on a real 7.2 client, including the scene-reload path for lowered constellations.

### 1.9 Next actions

- Part 2+: reviewed additive import of the 7.1 baseline rows in §1.4 (with TextMap + BinOutput
  checks), then rebuild the catalog; friendship control in the Builder; `IdInput` on every ID field;
  map view.

---

## Part 2 — Complete 7.2 catalogs and accurate images (2026-11-09 → 11-10)

Details: [DATA_COVERAGE.md](DATA_COVERAGE.md), [IMAGE_ACCURACY_REPORT.md](IMAGE_ACCURACY_REPORT.md).

### 2.1 Code changes

| File | Change |
|---|---|
| `scripts/build-catalog.mjs` | Rewritten classification: every source row is either included or listed in `reports/catalog/excluded.json` with a field-based reason. New catalogs: costumes, all 4,292 artifact pieces, furniture, gadgets, 1,600 teleport points. Release status from the codex tables. `imageType` / `imageStatus` per entry; placeholder-art rule for weapons and monsters; `shared-key` marking for items; `noTh` / `internal` name flags |
| `scripts/derive-point-keys.mjs`, `scripts/point-keys.json` | Evidence-based mapping of the obfuscated 7.x scene point files (matched against AstaPS-Resource, MIT) |
| `scripts/sync-assets.mjs` | Costumes, awakened weapons, artifact pieces and materials added; bounded concurrency (default 4) with a shared Retry-After pause; per-entry `checkedSources`, `source`, `catalogGameVersion`, full id list; `--fallback` pass for Project Amber |
| `scripts/verify-assets.mjs` (new) | Re-hash, full PNG decode check, key family, identical-bytes check with `scripts/asset-review.json`, orphans; writes `index.json` and `reports/assets/image-accuracy.json` |
| `scripts/validate-catalog.mjs` (new) | Compares server resources, server-loaded data (bridge) and catalog → `reports/catalog/coverage.json` |
| `src/components/fx/Artwork.tsx`, `src/lib/assetIndex.ts` (new) | Draws only verified keys; explicit labelled "no image" placeholder (the generated sigil is gone); loading skeleton; `object-contain` |
| `src/features/builder/SummaryTab.tsx` | Image export uses the same verified-key gate |
| `src/data/types.ts`, `src/data/searchIndex.ts` | New catalog types and fields; nullable icons |
| `src/data/catalog.test.ts` (new) | 41 acceptance tests |
| `vite.config.ts` | Dev/preview server also serves `/game-assets/index.json` |
| `package.json` | `assets:verify`, `catalog:validate`, `catalog:points` |
| SnezhnayaCore `NukvaOperations.java`, `NukvaApiHandler.java` | Read-only `GET /nukva/v1/catalog/loaded` (capability `catalog.loaded`) |
| docs | DATA_COVERAGE.md, IMAGE_ACCURACY_REPORT.md (new); ARCHITECTURE.md, DATA_PROVENANCE.md updated |

### 2.2 Tests actually run

| Test | Result |
|---|---|
| `vitest run` | 87/87 (46 existing + 41 new) |
| `tsc -b --force` | clean (an incremental build had hidden a null-icon error in `searchIndex.ts`; fixed) |
| `vite build` (to `work/p2_dist_check`) | builds; 0 PNG files in the output |
| `gradlew test --tests …nukva.*` + jar `SnezhnayaCore-7.2-p2` | pass; built |
| `GET /catalog/loaded` on the isolated instance (18088) | all categories loaded = server rows; scene points 140 in 27 scenes |
| `verify-assets` | 3,969 verified, 0 rejected, 0 unreviewed identical groups, 0 orphans |
| Browser (built-in, preview mode, Vite 5173) | Armory: 11505 renders `UI_EquipIcon_Sword_Morax` (decoded 256 px), 11506 renders the placeholder; Search "Kindling": three Ambr icons render with their own keys |
| Visual check by eye | 9 images across characters, skins, weapons, artifact slots, materials and monsters match their objects |

### 2.3 Remaining bugs, blockers, missing functionality

1. **Server loads only 140 of the teleport points** (27 scenes); the 7.x point files are
   obfuscated. In-game waypoints are broken for most of the world. Fix (mapping in
   `point-keys.json` → `ScenePointConfig` / `PointData` alternates + type map) is for the
   map/teleport phase.
2. Furniture images not synced (2,172 keys; no verified source path yet).
3. 2,183 icon keys exist at neither source (mainly GCG and old quest or event items); they show the
   placeholder.
4. 5,216 materials display art shared with differently named rows (marked `shared-key`, deliberate).
5. The UI does not yet use `release`, costumes, teleports or artifact pieces (data only); filtering
   and pickers are for later parts.
6. Content missing from the server's resources (Part 1 §1.4: 7 avatars, 22 weapons, …) is still
   absent.
7. The two server processes on UDP 22101 from Part 1 were not touched.

### 2.4 Acceptance criteria

| Requirement | Status |
|---|---|
| Catalogs from actual server resources, keyed by id; playable vs NPC/trial/test/unreleased/costume separated | met |
| No invisible filtering | met (excluded list + test) |
| Every image resolved from the entry's own row; validated; not associated with another object; explicit placeholder otherwise | met. Materials' shared art is marked, not withheld (documented decision) |
| The 17 missing images investigated individually | met |
| Cache, incremental, dedup, Retry-After, SHA-256, version tracking, manifest, missing/invalid reports, loading/placeholder states | met |
| Validation reports per category (resources / API / frontend / images / missing / names / operations) | met |
| Automated checks for duplicates, mappings, orphans, missing entries, slots, weapon↔character, paths, corruption, translations | met |
| Rendered-image verification | met on a sample (browser DOM decode + visual check), not exhaustive |

---

## Part 3 — Backend APIs, handlers and game integration (2026-11-10)

Details: [API_INTEGRATION.md](API_INTEGRATION.md).

### 3.1 Code changes

| File | Change |
|---|---|
| SnezhnayaCore `server/scheduler/ServerTaskScheduler.java` | **Bug fix:** task id counter is now atomic; duplicate ids silently dropped tasks scheduled in parallel |
| SnezhnayaCore `nukva/NukvaOperations.java` | New read routes (catalog characters/items/weapons, artifact catalog, piece options, player artifacts), artifact equip by guid; read-back verification on every write; INVENTORY_FULL pre-check; PLAYER_NOT_FOUND vs PLAYER_OFFLINE; INVALID_ARTIFACT_CONFIG with detail; grant limited to playable characters (UNSUPPORTED_OPERATION / NOT_PLAYABLE) |
| SnezhnayaCore `nukva/NukvaApiHandler.java` | Target-UID permission, Idempotency-Key handling, error `detail` + `data`, `/routes`, new routes, CORS for the new headers |
| SnezhnayaCore `nukva/NukvaIdempotency.java` (new), `NukvaException.java`, `NukvaConfig.java` (`targets`, `idempotencyMinutes`) | as above |
| SnezhnayaCore tests | `NukvaIntegrityTest` (new, 9), `ServerTaskSchedulerTest` (new), `NukvaEquipmentTest` (renamed code) |
| Console `api/contract.json`, `scripts/gen-api-types.mjs`, `src/api/generated.ts` (new) | Contract and generated types (`npm run api:types`) |
| Console `src/api/client.ts`, `src/api/nukva.ts`, `src/stores/ops.ts`, `src/api/hooks.ts`, `src/components/ui/OperationDialog.tsx` | Idempotency keys, error detail/data, typed new endpoints, refresh after every write attempt |
| Console `src/api/integrity.test.ts`, `tests/integration/bridge.integration.mjs` (new) | Tests |

### 3.2 Tests actually run

- Bridge unit tests 32/32; scheduler race test (fails on the old code, passes on the new); Console 96/96; `tsc -b --force` clean.
- Live integration on the isolated server: 14/14 on four consecutive runs (first attempt: 13/14 with one 10 s timeout under parallel writes → the scheduler bug above).
- Browser: UI give on the isolated bridge, verified read-back, audit entry, refresh.

### 3.3 Remaining

1. Real-client verification (not done; main server untouched).
2. `STATE_VERIFICATION_FAILED` only unit-tested (cannot be provoked live).
3. UI does not yet use the server's artifact options for its editor (data available: `api.artifactOptions`). Planned for the artifact UI phase.
4. Writes take up to ~1 s (server tick).
5. From earlier parts: teleport points not loaded by the server (Part 2), duplicate server on UDP 22101 (Part 1).

### 3.4 Acceptance criteria

| Requirement | Status |
|---|---|
| Real implementations located and reused | met |
| Typed endpoints (catalogs, artifacts, options, inventory, give, equip) with schemas and error codes; TS types generated | met |
| Server-side validation of identity, target UID, operation, ids, types, limits, stats, player state, server availability | met (identity = local-only principal; no per-user accounts) |
| Execute through server services, structured result, read-back, verify, refresh, real feedback | met |
| Error codes incl. the eight requested | met |
| Tests: authorized writes, permission denial, invalid ids, invalid config, duplicates, concurrency, interruption, read-back, client refresh | met on the isolated server with a mock client; real client not tested |
| API_INTEGRATION.md | met |

---

## Part 4 — Visual artifact builder (2026-11-10)

Details: [ARTIFACT_BUILDER.md](ARTIFACT_BUILDER.md).

### 4.1 Code changes

| File | Change |
|---|---|
| SnezhnayaCore `nukva/NukvaArtifactRules.java` (new) | Slot main-stat table, starting counts by rarity, ordered roll-sequence check |
| SnezhnayaCore `nukva/NukvaOperations.java` | `giveArtifact` normal/custom modes (and fix: substats rolled before the explicit main stat are discarded); main stat must be rollable and legal for the slot; custom edit; `deleteItem`; `SLOT_OCCUPIED` guard with `replace`; richer piece options (`allowed`, `tier`, `allowedStarts`, `upgradeLevels`) |
| SnezhnayaCore `nukva/NukvaApiHandler.java` | `DELETE /players/{uid}/items/{guid}`; CORS allows DELETE |
| SnezhnayaCore `NukvaArtifactRulesTest.java` (new) | 4 tests |
| Console `src/lib/artifactRules.ts` + test (new) | Rules engine, 7 tests on real catalog data |
| Console `src/features/armory/ArtifactForge.tsx` (new), `Armory.tsx` | Builder (two modes, roll history, preview, presets, create → verify → equip) and Player artifacts (equip/unequip/edit/delete) |
| Console `src/api/nukva.ts`, `client.ts`, `OperationDialog.tsx`, `lib/presets.ts`, `features/presets/Presets.tsx`, `i18n/en.ts`, `i18n/th.ts` | API options (mode, replace, delete), DELETE support, presets with mode/start, EN/TH strings |
| Console `api/contract.json`, `src/api/generated.ts` | New fields, DELETE route, error codes (50) |
| Console `tests/integration/artifact-builder.integration.mjs` (new); `bridge.integration.mjs` | 9 live tests; Part 3 equip test sends `replace` when the slot is worn |

### 4.2 Tests actually run

Server unit tests 37/37; Console 103/103; `tsc -b --force` clean; artifact suite 9/9 and Part 3 suite 14/14 on the isolated server (p4 jar, uid 10161); browser end-to-end create → verify → equip (ARTIFACT_BUILDER.md).

### 4.3 Remaining

Main-stat values at level not shown (needs level curves in the catalog); weights not independently confirmed for 7.2; real client untested; earlier-part items (teleport points, duplicate server on 22101, main server running the old jar).

### 4.4 Acceptance criteria

| Requirement | Status |
|---|---|
| Searchable sets with images, exact set/item ids, rarity and slot filters, bonuses, localized names | met (rarity filter on the set list; slot via the piece picker) |
| Slot main-stat rules from the piece's own depot | met (server + UI, tested on all five slots) |
| Substat rules (10 types, ≤4, no main, stacking, depot tiers, roll count by rarity/start/level) | met |
| Normal and custom modes, preview, summary, roll history, warnings, presets | met |
| Create, add to inventory, equip, unequip, edit (GUID kept), delete (confirmed), no silent replacement | met |
| Created and retrieved through the real server API in an authorized test environment | met (isolated server, mock client); real client not tested |

## Part 5 — Item Spawner, Character Builder, Weapon Builder (2026-11-10)

Details, rules, tests and evidence: [SPAWNER_AND_BUILDERS.md](SPAWNER_AND_BUILDERS.md).

Files:
- Server:
  - new: `NukvaItemRules.java`, `NukvaProgression.java`, `NukvaSpawnRulesTest.java`
  - changed: `NukvaOperations.java` (giveItems, grant/update ascension, patchItem, equipItem
    weapon type, maxAvatar weapon cap, catalog fields), `data/excels/avatar/AvatarFlycloakData.java`
    (7.2 glider key)
- Console:
  - new: `src/features/inventory/ItemSpawner.tsx`, `src/features/builder/UnlockPanel.tsx`,
    `src/features/armory/WeaponForge.tsx`, `src/lib/spawner.ts` (+test),
    `src/lib/progression.ts` (+test), `src/stores/spawner.ts`,
    `tests/integration/spawner-builders.integration.mjs`
  - changed: `Inventory.tsx`, `Armory.tsx`, `Builder.tsx`, `WeaponTab.tsx`, `Presets.tsx`,
    `src/lib/presets.ts`, `src/api/{nukva,hooks,generated}.ts`, `api/contract.json`,
    `src/data/types.ts`, `scripts/build-catalog.mjs` (stack limits, spawn policy, descriptions →
    `public/data/material-text.json`, weapon caps/refinement), `src/i18n/{en,th}.ts`
- Reports: `reports/api/spawner-builders-results.json`

Results:
- Server unit tests: 42/42
- Console unit tests: 114/114
- Part 5 integration: 17/17; Part 3 and Part 4 regressions: 14/14 and 9/9 (isolated server, mock
  uid 10163)
- Browser end-to-end (spawner, unlock, ascension and undo, weapon create and equip): passed
- `tsc` and the build are clean

Verified on the isolated server with the mock client only. The main server still runs the old jar.

## Part 6 — Command Codex, autocomplete, World Authority (2026-11-10)

Details and evidence: [CODEX_AND_WORLD.md](CODEX_AND_WORLD.md). This part builds on Codex and map work another session added at 16:28–16:45.

Root cause of the locked map: the server read only the old `points` key of the scene point files. 7.2 stores them under obfuscated keys, so 140 points loaded and scene 3 had none, and the game could never unlock a waypoint. A daily-domain NullPointerException also cut the loading stage short. Fixed in the loader with derived key mappings; no resource files were changed. The server now loads 4,680 points (scene 3: 1,619), and waypoint unlocks succeed.

Files:
- Server:
  - changed: `data/common/PointData.java`, `data/ResourceLoader.java`, `NukvaOperations.java` (teleport by point, scenes, scene points, bounds, `writable`, `unlockedPoints`), `NukvaApiHandler.java`
  - new: `NukvaScenePointsTest.java`
- Console:
  - new: `src/lib/worldMap.ts` (+test), `src/lib/codex.test.ts`
  - changed: `src/lib/{suggest,commandLine,usage}.ts`, `src/features/world/{World,WorldMap}.tsx`, `src/features/commands/{Commands,CommandLine}.tsx`, `src/components/ui/IdInput.tsx`, `src/api/{nukva,hooks,generated}.ts`, `api/contract.json`, `src/i18n/{en,th}.ts`, `scripts/derive-point-keys.mjs` and `scripts/point-keys.json` (boolean check, 2 more types), `tests/integration/codex-map.integration.mjs` (5 more tests)

Results:
- Server unit tests: 45/45. Console unit tests: 132/132. `tsc` is clean.
- `codex-map` integration: 13/13. Part 3, 4 and 5 regressions: 14/14, 9/9, 17/17.
- In-game waypoint unlock via the mock client: passed.
- Browser: Codex autocomplete and execution passed.
