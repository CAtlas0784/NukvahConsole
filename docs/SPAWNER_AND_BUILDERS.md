# Item Spawner, Character Builder, Weapon Builder (Part 5, 2026-11-10)

You don't need a console command for ordinary spawning, character management or weapon creation.
Every write goes through a typed bridge route, the server checks it again, and the result is read
back before it is reported.

## Item Spawner (Inventory → Item spawner)

```
select UID (top bar) → search name / ID → pick the exact card → amount (quick buttons) → review → add
→ server reads the inventory back → card count and "Last result" refresh
```

- **Catalog:** 9,647 materials, 2,350 furniture items and 258 weapons, all from the 7.2
  ExcelBinOutput. Each card shows:
  - the image from its own icon key (same Part 2 rules and placeholder)
  - the localized name, native item ID, rarity and category
  - the current owned amount (live inventory; Primogem/Mora/Genesis come from the player
    summary)

  The details view adds the description from `material-text.json`, which loads only when you open
  an item, and the stack limit.
- **Search and filters:**
  - Search: by name (EN/TH) or ID prefix.
  - Categories: Currency, Enhancement, Consumables, Gadgets, Unlocks, Housing, Weapons, Quest,
    Other.
  - Also: rarity, Favourites and Recent.
  - Artifacts link to the Artifact Builder (Part 4); they need stat choices.
- **Picking amounts and several items:**
  - Quick amounts stop at what still fits. "Max" equals the stack limit minus what the player
    already holds.
  - Ticking cards fills the *Selection* tray (up to `maxBatchSize` lines), which is given in one
    request.
  - The tray can be saved as or loaded from a **bundle preset**.
  - Favourites and Recent are stored per browser.
  - Results: the "Last result" panel shows each line's verification (before → after, GUIDs). The
    full list stays in *Operation history*.
- **Undo:** not offered for gives. The server has no safe way to take materials back, and the UI
  says so.

### What can be given (server rule, `NukvaItemRules`)

The rule is decided from the item's own data and from what the server's `Inventory.putItem`,
`addVirtualItem` and `InventorySystem.useItemDirect` actually do with it. The Console uses the
server's `/catalog/items` answer when it is connected. The catalog builder applies the same rules
offline, and the live test found 0 differences across 11,997 items.

| Kind | Items | Read-back |
|---|---|---|
| stackable | materials, furniture | count delta; refused above the item's `stackLimit` |
| currency | virtual 101, 102, 105, 106, 107, 121, 201–204 (the ones `addVirtualItem` handles) | balance for 106, 107, 201–204; "applied" for the EXP types |
| unlock | namecards, gliders, outfits (used on gain) | the player's namecard / glider / costume list; once only |
| weapon | combat weapons (1TXXX) | one GUID per unit with level/ascension/refinement |
| unsupported (with reason) | character cards → `USE_CHARACTER_BUILDER`; other used-on-gain items (TCG cards, codex/quest unlocks, poses…) → `CONSUMED_ON_GAIN`; unhandled virtual ids → `NO_SERVER_HANDLER`; refused material types → `SERVER_REFUSES` | never sent |

Checks done on the game thread **before anything is added**:
- **Stack limit:** current + requested must not exceed the limit. This is summed per item across
  the batch. Error: `STACK_LIMIT_EXCEEDED`, with `data.current`, `data.limit` and
  `data.maxAddable`.
- **Space:** weapon/artifact tab space, and space for new material/furniture stacks. Error:
  `INVENTORY_FULL`.
- **Unlocks:** an unlock the player already has is refused with `ALREADY_OWNED` / `UNLOCK_OWNED`.

The whole batch is all-or-nothing.

## Character Builder (Character Builder page)

- **Roster:**
  - Search by name or ID.
  - Filters: element, **weapon type**, rarity, owned-only.
  - Traveler variants carry a *Traveler* badge.
  - Unreleased (not-in-codex) rows are hidden unless "Show unreleased" is on.
  - Trial, test and NPC avatars are not in the catalog, and the server refuses them (`NOT_PLAYABLE`).
- **Unlock:** a character the player does not own opens the unlock panel. You set level +
  ascension, constellation and three talent levels, and they are sent in one grant, which the
  server reads back.
- **Level and ascension:** at 20/40/50/60/70/80 you choose before or after ascending (e.g. 80/80 or
  80/90). The server checks this against the character's own AvatarPromote rows
  (`INVALID_ASCENSION` lists the allowed values).
- **Other tabs:** constellation, talents, weapon (equip owned / create new), artifacts and the
  one-click max work as before. Every change goes through review → apply → server read-back.
- **Undo:** after an update, an Undo bar can put the previous values back. That is a normal,
  reviewed update with the old values.
- **Presets:** "Save this build" stores a character preset (with ascension) and, when the character
  has gear, an equipment preset. "Load" fills the editor only; nothing is sent until you review.

## Weapon Builder (Armory → Weapon)

- **Browse:** search by name or ID; filter by type, rarity, and "show unreleased". The art is the
  weapon's own icon, and placeholder-art rows show the "no image" placeholder (Part 2).
- **Level, ascension and refinement come from the weapon's own data:**
  - The level cap and ascension steps come from `WeaponPromoteExcelConfigData`. 1★/2★ weapons
    stop at Lv70.
  - Refinement exists only for weapons with a passive (`skillAffix`); others show "R1 only".
  - The server enforces the same rules: `LEVEL_ABOVE_MAX`, `INVALID_ASCENSION`, `NO_REFINEMENT`.
- **Create:** `POST /players/{uid}/items` with `{level, promoteLevel, refinement}`. Every unit is its
  own GameItem, and each GUID is re-read with its level, ascension and refinement.
- **Equip:** the result lists only characters of the matching weapon type (the character you came
  from is listed first). The server refuses a wrong type with `WEAPON_TYPE_MISMATCH`, and the
  review says the current weapon goes back to the bag. From a character's Weapon tab, "Create a new
  weapon for this character" opens the builder pre-filtered, and a swap can be undone (the previous
  weapon is equipped again).
- **Presets:** save and load weapon presets (level, ascension, refinement).

## Server changes

| File | Change |
|---|---|
| `NukvaItemRules.java` (new) | spawn policy per item, stack limits, unlock targets, weapon ascension caps, refinement availability |
| `NukvaProgression.java` (new) | valid ascensions per level (breakpoints), max level, AvatarPromote caps |
| `NukvaOperations.giveItems` | split into `planEntry` / `checkGiveFits` / `applyGive`. Adds unsupported-item refusal, stack-limit and new-stack capacity checks, unlock read-back, weapon `promoteLevel`, refinement only with a passive, and before/after counts in the result |
| `grantAvatar` / `updateAvatar` | `promoteLevel` (validated, read back); an empty update is `MISSING_BODY` |
| `patchItem` | weapon `promoteLevel`, level cap per weapon, `NO_REFINEMENT` |
| `equipItem` | `WEAPON_TYPE_MISMATCH` |
| `maxAvatar` | **bug fixed:** max used to set every weapon to Lv90 R5, including 1★/2★ weapons whose cap is Lv70 with no refinement; it now uses the weapon's own maximum |
| `catalogItems` / `catalogWeapons` / `catalogCharacters` | `kind`, `supported`, `reason`, `stackLimit`; `ascensionCaps`; real level/refinement limits |
| `AvatarFlycloakData.java` | **7.2 data fix:** the glider id is under the obfuscated key `BMHJMHKFHCC`. Without the mapping every glider loaded as id 0, so the server's own glider unlock silently did nothing |

New error codes: `UNSUPPORTED_ITEM`, `STACK_LIMIT_EXCEEDED`, `INVALID_ASCENSION`,
`WEAPON_TYPE_MISMATCH` (contract: 54 codes).

## Tests

| Suite | Result |
|---|---|
| Server unit (`NukvaSpawnRulesTest` new: breakpoints, caps, stack limits, spawn policy from ItemData, refinement) + earlier suites | 42/42 |
| Console unit (`spawner.test.ts`, `progression.test.ts` new, against the real catalog) | 114/114 |
| `tests/integration/spawner-builders.integration.mjs`, isolated server, mock uid 10163 | 17/17 |
| Part 3 regression (`bridge.integration.mjs`) / Part 4 regression (`artifact-builder.integration.mjs`) | 14/14, 9/9 |
| `tsc -b --force`, `vite build` | clean |

The integration suite covers:
- server classification = catalog (0 differences in 11,997 items)
- a stackable give with before/after
- the stack limit (single line and split across lines)
- Mora
- 2 independent Mistsplitter instances (Lv80/A6/R3), each read back
- weapon rules (ascension at 50 → [2,3], 1★ above 70, R2 on a 1★)
- a multi-item give
- unknown and unsupported items (whole batch refused, nothing applied)
- a namecard and a glider unlock, the second give refused
- UIDs 10004 and 77777 → `PERMISSION_DENIED`
- the same Idempotency-Key twice → applied once, replay marked
- a full weapon tab (30) and furniture tab (5) → `INVENTORY_FULL` with nothing added
- a character unlock (80/A6 C2 T6/8/9, `AddNoGachaAvatarCardNotify`)
- ascension 80/80↔80/90, an invalid ascension, undo
- unreleased Mitya → `NO_PROMOTE_DATA`, non-playable → refused
- a sword on a polearm user → `WEAPON_TYPE_MISMATCH`
- equip with read-back (`AvatarEquipChangeNotify`) and the old weapon back in the bag
- a weapon ascension edit, undoing a swap
- one-click max with a 1★ weapon → Lv70 R1

**Browser end-to-end (isolated server, uid 10163):**
1. Search "Hero's Wit". The card showed Owned 124; details showed the description, stack 99,999 and
   "Max 99,875".
2. Quick 1,000. The review showed 124 → 1,124. After applying, the card showed 1,124 and the result
   panel said "verified in the inventory".
3. Ticked Mora and Mistsplitter and gave both in one request. Both were verified, with a GUID for
   the weapon, and the tray cleared.
4. With "show unsupported", the Hu Tao character card said to use the Character Builder, and the
   constellation item said it is consumed on gain.
5. Builder → Hu Tao (not owned) showed the unlock panel. Lv80 with 80/80 sent `promoteLevel: 5`, and
   the server read back 80/5.
6. Ascended to 80/90 (`{promoteLevel: 6}`), then Undo → `{level: 80, promoteLevel: 5}`. The server
   confirmed both and the editor resynced.
7. Weapon tab → "Create a new weapon for this character" opened the builder pre-filtered to
   polearms, with Hu Tao first. I created Staff of Homa 90/90 R3 (GUID 43649752629301) and equipped
   it. The review mentioned the old weapon going back to the bag, and the server read it back on
   Hu Tao (Lv90, A6, R3).

**Bug found and fixed during the browser run:** on a short window the sticky side panels (Weapon
Builder result, spawner tray) were taller than the screen, and their lower buttons could not be
reached. They now scroll inside the viewport.

## Unresolved / 7.2 notes

1. **Real 7.2 client not tested.** Sync packets were confirmed against the mock client only.
2. **Traveler element:** grants use the server's default skill depot. Choosing the element is not
   offered.
3. **Unreleased characters:** Mitya (10000136) and Valeriy (10000137) have no level-0 ascension row
   in 7.2's AvatarPromote, so the server refuses them (`NO_PROMOTE_DATA`). Other unreleased rows
   are hidden by default.
4. **No undo for gives:** the bridge has no safe way to remove materials. Weapon deletion is not
   offered either; only artifacts can be deleted (Part 4).
5. **Character / adventure / companionship EXP** (101/102/105) are applied to the active team
   immediately. There is no balance to read back, so they are reported as "applied (not
   countable)".
6. **Main server (8088)** still runs the old jar. Parts 1–5 are only live on the isolated test
   server until it is rebuilt and restarted.
