# Image accuracy report (Part 2, 2026-11-10)

Rule: an image may only be shown for the exact game object it belongs to. When that can't be
verified, the UI shows an explicit, labelled "no image" placeholder, never a similar or substitute
picture. Machine-readable results: `reports/assets/image-accuracy.json`.

## How identity is established

1. **Key from the entry's own row.** Each catalog entry's `icon` is the icon field of its own Excel
   row: `AvatarExcel.iconName`, `AvatarCostume.frontIconName`, `WeaponExcel.icon` / `awakenIcon`,
   `ReliquaryExcel.icon`, `MaterialExcel.icon`, `HomeWorldFurniture.itemIcon`, `MonsterDescribe.icon`.
   No name is ever used to find an image.
2. **Key = file.** Both sources serve the game's icons under the game's own key
   (`<base>/<Key>.png`). The manifest records the key, URL, source, bytes, SHA-256, ETag,
   Last-Modified, the catalog game version, the sources checked, and every catalog id using the key.
3. **File verification** (`npm run assets:verify`): file present; SHA-256 on disk equals the
   manifest (corruption check); full PNG check (signature, every chunk CRC, IHDR, IEND, and the IDAT
   stream inflates to exactly the size the header implies); key family matches the image type
   (`UI_AvatarIcon_*`, `UI_EquipIcon_*`, `UI_RelicIcon_<set>_<slot>`, `UI_MonsterIcon_*`).
4. **Not associated with another object:**
   - Byte-identical files under different keys are rejected unless reviewed one by one in
     `scripts/asset-review.json`. 6 groups were reviewed, all quest items: the game reuses generic
     document, notebook and key art, or one item has several rows. A review holds only while both
     the keys and the hash are unchanged.
   - A key shared by *differently named* weapons or monsters is kept only by its owner; the others
     get `imageStatus: "placeholder-art"`, `icon: null` and the original key in `gameIcon`.
     Weapon owner = the codex-released row; monster owner = lowest id.
   - Materials and furniture keep shared art (blueprints, food qualities, currency variants),
     marked `imageStatus: "shared-key"`.
5. **Display gate.** Verification writes `.cache/game-assets/index.json`. `<Artwork>` and the summary
   image export draw a key only if it is in that index. Everything else shows the placeholder, with a
   reason (`no-key`, `unverified`, `load-failed`) in its label and a `data-missing-image` attribute.
6. **Visual check by eye** (not only HTTP 200 or hashes):
   - Furina portrait; Primordial Jade Cutter 11505 (Morax sword); Jean's Sea Breeze Dandelion skin
     under the costume entry, not her portrait.
   - Gladiator's Finale flower (_4), goblet (_1) and sands (_5).
   - Teachings of Kindling (Ambr); Dendro Slime (Ambr).
   - In the browser: 11505 renders `UI_EquipIcon_Sword_Morax` decoded at 256 px, while 11506 renders
     the "no image" placeholder; the Kindling talent books render their own keys at 256 px.

## Results by category

| Category | Catalog entries | With an image key | **Verified image shown** | Placeholder because |
|---|---|---|---|---|
| Characters | 121 | 121 | **121** | — |
| Costumes (skins) | 149 | 28 | **28** | 121 default outfits use the character's own portrait by design; no skin replaces it |
| Weapons | 258 | 242 | **238** | 16 placeholder-art rows (below); 4 unreleased 3★ (12304 Quartz, 13304 The Flagstaff, 14306 Amber Bead, 15306 Ebony Bow), with no art at either source |
| Artifact sets | 63 | 63 | **61** | 15004 Glacier and Snowfield, 15012 Prayers to the Firmament: not in the codex (never released), no art at either source |
| Artifact pieces | 4,185 | 4,185 | **4,085** | the 100 pieces of those two sets |
| Materials | 9,647 | 9,637 | **7,334** | GCG card faces/cards/backs (1,824) and older quest, event and test items that neither source hosts |
| Furniture | 2,350 | 2,178 | **0** | not synced yet (opt-in kind, 2,172 keys; Ambr's root path 404s for them, see below) |
| Monsters | 1,476 | 1,254 | **1,249** | 216 placeholder-art (icon of a differently named monster), 6 with no describe icon, 5 keys neither source has |
| Gadgets | 1,787 | 0 | 0 | world objects have no inventory icon (`imageType: "none"`) |

All verified images are square: 64, 128, 180, 256, 360, 390 or 512 px. The UI draws every image
`object-contain` in a fixed square frame, so different source sizes look consistent.

### The 16 weapon rows with placeholder art

The game data gives these rows another weapon's picture, mostly the 1★ starter weapon of the same
type. All are absent from the codex or disused, and all use the starter weapon's promote curve. They
show the placeholder; the starter weapons themselves keep their art.

11506 Primordial Jade Cutter (uses Dull Blade's icon; the real Primordial Jade Cutter is 11505, which
keeps its own), 11507 One Side, 11508 / 11411 "Blunt", 12505 Primordial Jade Greatsword (disused),
12506 The Other Side, 12508 / 12509 "Aniki", 13503 "Gewalt", 13506 Deicide, 14503 Lost Ballade,
14508 / 14411 "Apprentice", 15504 Kunwu's Wyrmbane (disused), 15505 Primordial Jade Vista (disused),
15506 Mirror Breaker.

Variants with the same name keep their image (11419/11421 Prized Isshin Blade, 11428/11429 Sword of
Narzissenkreuz).

### Characters and skins

- 121/121 portraits have a key unique to that character (tested).
- 7.2 characters 10000136 "Mitya" and 10000137 "Valeriy" have no TextMap entry; the name comes from
  the icon key and is marked internal. Their portraits are tied to them only by their own row's key.
  I could not confirm what these characters look like from independent knowledge.
- Skins are a separate catalog (`costumes.json`). Non-default skins carry their own
  `UI_AvatarIcon_*Costume*` keys, never a character's default key (tested).

## The 17 originally missing images

The earlier run reported 646/663 with 17 missing. Each was investigated:

| Key(s) | Object | Finding |
|---|---|---|
| `UI_EquipIcon_FishingRod` | 20001 | utility row typed as a sword; now excluded from weapons |
| 6 × `*_Template` | 10002–10009 | template weapons; now excluded |
| `Claymore_Quartz`, `Pole_Flagpole`, `Catalyst_Amber`, `Bow_Hardwood` | 12304, 13304, 14306, 15306 | 3★ weapons not in the codex; neither Enka nor Ambr has them; placeholder |
| `UI_RelicIcon_15004_{1..5}` | Glacier and Snowfield | unreleased set (no codex row); placeholder |
| `UI_RelicIcon_15012_3` | Prayers to the Firmament circlet | set exists only as one circlet, not in codex; placeholder |

## Sources

| Source | Used for | Count | Notes |
|---|---|---|---|
| Enka.Network `https://enka.network/ui/<Key>.png` | primary | 2,959 | robots.txt has only content-signal comments (no Disallow); no monster or flycloak icons |
| Project Amber `https://gi.yatta.moe/assets/UI/<Key>.png` (`monster/` for monsters) | fallback for keys Enka lacks | 1,010 | robots.txt `Disallow:` (nothing disallowed). Same art and size as Enka for the same key (checked on Furina, Morax sword, Mora; Mora byte-identical, others re-encoded) |
| genshindev/api | not used | — | keyed by name slug, not game key, and too old for 7.2 |

Download behaviour: incremental (a cached, verified key is never requested again), deduplicated by
key (one download serves every id using it), 4 workers by default (`--concurrency`, max 8) with a
300 ms delay each. One 429/503 pauses all workers for `Retry-After`; 401/403 stops everything.
Replacement is atomic (`.part` then rename). A fallback pass (`--fallback`) only asks a source about
keys it has never been asked about (`checkedSources`). 2,183 keys are missing at source, and 2,174
of them were checked at both sources. Total requests this phase: ~5,150 to Enka and ~3,190 to
Ambr, with no 429, 403 or errors.

## Acceptance tests (`npm test`, `src/data/catalog.test.ts`)

All pass (87 tests in the suite):

| Check | Test |
|---|---|
| Duplicate game ids | per category, artifact sets, teleport points |
| Missing catalog entries | `included + excluded = source rows`; every server-loaded id is in the catalog or explained; nothing in the catalog the server did not load |
| Invalid asset mappings / broken paths | route-safe keys, correct family per image type |
| Incorrect artifact slots | every piece icon = `UI_RelicIcon_<its setId>_<its slot digit>`; set listings only offer their own pieces in the right slot |
| Weapon/character association | weapon id numbering matches type; each character's starting weapon matches their weapon type |
| Mismatched images | unique character portraits; no weapon or monster shows a differently named object's icon; skins never replace defaults; shared item art marked |
| Cache corruption | every verified file re-hashed against the index and manifest |
| Orphaned images | none in the cache |
| Square images | all verified images square |
| Missing translations | every entry has English; missing Thai stays ≤ 13 (regression guard) |

## Known gaps

- Furniture images: not synced (2,172 keys). Neither source's root path serves them; Ambr may keep
  them under another path. To do with the furniture UI.
- GCG (card game) art: no source; not admin-relevant.
- 5,216 materials show art they share with differently named rows (marked `shared-key`). Tightening
  this to placeholders would blank most blueprints and food variants. Kept as a deliberate, visible
  decision.
- Visual identity was checked by eye on a sample only. The rest relies on key-from-own-row plus the
  automated checks.
