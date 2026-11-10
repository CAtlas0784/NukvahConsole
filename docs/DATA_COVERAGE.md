# Data coverage (Part 2, 2026-11-09)

How completely the console catalog covers the game data the SnezhnayaCore 7.2 server actually has.
Every number comes from `npm run catalog` and `npm run catalog:validate`. The full machine-readable
versions are `public/data/meta.json`, `reports/catalog/coverage.json` and
`reports/catalog/excluded.json` (every excluded id with its reason). Images are covered in
[IMAGE_ACCURACY_REPORT.md](IMAGE_ACCURACY_REPORT.md).

## Sources

| Layer | What | How it was read |
|---|---|---|
| Server resources | `SnezhnayaCore/resources/ExcelBinOutput` (junction → AnimeGameData 7.2 + AstaPS 7.2 additions), `TextMap` EN/TH, `BinOutput/Scene/Point` | `scripts/build-catalog.mjs` |
| Loaded by the server | What `GameData` holds after startup. The bridge validates every operation against it | New read-only bridge route `GET /nukva/v1/catalog/loaded`, snapshot in `reports/catalog/server-loaded.json` (isolated instance, jar `SnezhnayaCore-7.2-p2`) |
| Console catalog | `public/data/*.json` | build output |

Entries are keyed by the game's numeric id. Names are only for display.

## Coverage by category

"Unexplained" counts ids the server loaded that are neither in the catalog nor listed in
`excluded.json`. "Not loaded" counts catalog ids the server did not load, which the bridge would refuse.

| Category | Server rows | Loaded by server | In catalog | Excluded | Unexplained | Not loaded | Bridge operations |
|---|---|---|---|---|---|---|---|
| Characters | 158 | 158 | 121 | 37 | 0 | 0 | grant, level, constellation, talents, friendship, equip, max |
| Costumes (skins) | 155 | 155 | 149 | 6 | 0 | 0 | none yet (read-only) |
| Weapons | 266 | 266 | 258 | 8 | 0 | 0 | give, edit, equip |
| Artifact sets | 64 | 64 | 63 | 1 | 0 | 0 | via pieces |
| Artifact pieces | 4,292 | 4,292 | 4,185 | 107 | 0 | 0 | give (main/sub stats), edit, equip |
| Materials + virtual items | 10,061 | 10,061 | 9,647 | 414 | 0 | 0 | give |
| Furniture | 2,362 | 2,362 | 2,350 | 12 | 0 | 0 | give |
| Gadgets | 27,359 | (count only) 27,359 | 1,787 | 25,572 | — | — | none (no gadget endpoint) |
| Monsters | 3,013 | 3,013 | 1,476 | 1,537 | 0 | 0 | spawn |
| Scenes | 2,241 | 2,241 | 2,241 | 0 | 0 | 0 | teleport |
| Teleport points | 2,202 point files | **140 points in 27 scenes** | 1,600 | see below | — | — | teleport by coordinates |
| Commands | 58 | 58 | 58 | 0 | — | — | list, execute (allowlisted) |

No duplicate ids in any category. Before Part 2, the builder dropped unnamed or out-of-range rows
and every artifact piece except one per set/slot/rarity, without recording them. Now every row is
either included or excluded with a reason, and a test checks `included + excluded = server rows`.

### Why rows are excluded (all field-based, never name-based)

| Category | Reason (rows) |
|---|---|
| Characters | `useType AVATAR_TEST` (27: the 1100xxxx trial copies), formal but outside the playable id range 10000002–10000899 (6: UGC/test 10000901–904, 998, 999), `AVATAR_ABANDON` (3), `AVATAR_SYNC_TEST` (1) |
| Costumes | belong to the 6 excluded UGC/test characters |
| Weapons | template rows with icon `*_Template` (7: 10002–10009), id outside its type's 1TXXX range (1: 20001, the fishing rod row typed as a sword) |
| Artifact sets | set 15000 has no named set bonus |
| Artifact pieces | no set (32), belong to set 15000 (75) |
| Materials, furniture, gadgets, monsters | no TextMap name. Unnamed monsters can still be spawned by id through the bridge; they are just not listed |

### Playable vs. other entries

| Classification | Field used | Result |
|---|---|---|
| Playable character | `useType = AVATAR_FORMAL` and id 10000002–10000899 | 121 |
| Trial / test / abandoned | `useType` | excluded (31) |
| Traveler | `candSkillDepotIds` non-empty | 10000005, 10000007 (`release: "traveler"`) |
| Released | listed in `AvatarCodex` / `WeaponCodex` / `ReliquaryCodex`, not `isDisuse` | characters 117, weapons 232, artifact sets 61 |
| Disused | codex row with `isDisuse: true` | weapons 11304 Dark Iron Sword, 12505, 15504, 15505 |
| Not in codex (unreleased, quest variant or 7.2 addition) | absent from the codex | characters 10000136 Mitya, 10000137 Valeriy; 22 weapons; sets 15004 Glacier and Snowfield, 15012 Prayers to the Firmament |
| Costume vs. default art | `AvatarCostume.isDefault` | 121 default outfits use the character's own icon; 28 skins have their own `frontIconName` and never replace it |

Release status is data only. The UI does not filter on it yet; that's a later phase.

### Names and translations

| Check | Result |
|---|---|
| Entries without an English name | 0 |
| Entries whose name comes from an internal key (no TextMap entry), marked `internal: true` | characters 10000136, 10000137; weapons 11411, 11508, 12508, 12509, 13503, 14411, 14508, 14525; costumes 213600, 213700 (the two 7.2 default outfits) |
| Thai TextMap entry missing (not just identical to English) | 13 materials. Everything else has Thai text; proper names are often identical in Thai and then stored once |

## Teleport points

The 7.x point files (`BinOutput/Scene/Point/scene*_point.json`) are obfuscated: the point list sits
under `NNGAFPEMOML` instead of `points`, and every field and point type is renamed. The mapping in
`scripts/point-keys.json` was derived by `scripts/derive-point-keys.mjs`: 4,549 points with the same
id in 1,410 scene files were compared with AstaPS-Resource's deobfuscated copies, counting only
values that match exactly one key.

| Mapping | Key | Evidence |
|---|---|---|
| point list | `NNGAFPEMOML` (plus plain `points`) | 3,524 / 4,549 |
| pos / tranPos | `CMGLCIKBLJJ` / `NPCCBOFKBCO` | 2,485/2,576, 1,941/2,015 |
| rot / tranRot | `FFHABOBFAGN` / `EGALADGLFJM` | 1,590/1,622, 1,217/1,261 |
| gadgetId / areaId | `NNBHCICJLIF` / `ELEFFFOPKAH` | 3,593/3,729, 1,704/1,704 |
| SceneTransPoint | `KDEHKECBDBO` | 839/839 |
| DungeonEntry | `BIDKGIAOIJE` (+ plain) | 391/391 |
| VirtualTransPoint | `CAENMMKPMIJ` (+ plain) | 58/58 |
| PersonalSceneJumpPoint | `HGEKJIDOFJN` | 131/131 |

Catalog result: 1,600 points in 118 scenes: 767 waypoints, 57 Statues of The Seven, 452 domain
entrances, 176 virtual points, 132 scene jumps, and 16 other. Kind comes from the gadget's `type`
(`TransPointFirst` = statue, `TransPointSecond` = waypoint), and the area name from
`WorldAreaConfigData` (level 1). Spot check: point 3/10 matches the upstream file exactly
(pos 2281.50, 220.42, -867.69).

**Server bug found:** `ResourceLoader.loadScenePoints` reads only the plain `points` key, so the
server loaded **140 points in 27 scenes** (confirmed through `/catalog/loaded`). In-game waypoint
unlocking and teleporting fail for most of the world. The console does not depend on this, because
its teleport uses coordinates. Fixing the server loader (alternate names on `ScenePointConfig.points`
and `PointData`, plus a type-name map) is left for the map/teleport phase.

## Content the server does not have

The catalog can only list what the server loads. AstaPS-Resource's 7.1 baseline has rows our
AnimeGameData lacks (Part 1 §1.4): avatars 10000133–135, 140, 143, 148, 150; 22 weapons; 60
artifact pieces; sets 15047, 15048. They are not shown and cannot be granted until a reviewed
resource import adds them to the server.

## Reproduce

```bash
npm run catalog
```
```bash
npm run catalog:validate -- --api http://127.0.0.1:8088
```
```bash
npm test
```
