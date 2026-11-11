# Artifact Builder (Part 4, 2026-11-10)

Armory → Artifact. The workflow below needs no console commands:

```
select UID → set → slot/piece → rarity/level → mode → main stat → rolls (custom) → preview → create
→ inventory re-read confirms the GUID → optionally equip (with confirmed replacement)
```

The **Player artifacts** view manages the player's real pieces by GUID: equip, unequip, edit
(custom rules, same GUID kept) and delete (unequipped pieces only, confirmed).

## Where the rules live

| Layer | File | Role |
|---|---|---|
| Server (authoritative) | `SnezhnayaCore/.../nukva/NukvaArtifactRules.java` + `NukvaOperations.giveArtifact / patchItem / deleteItem / equipItem / artifactPieceOptions` | Every rule is checked again on every write |
| Console | `src/lib/artifactRules.ts` | Same rules; the UI only offers legal choices |
| Game data | `ReliquaryExcelConfigData` (piece, `mainPropDepotId`, `appendPropDepotId`, `appendPropNum`, `maxLevel`, rarity), `ReliquaryMainPropExcelConfigData` (depot, weight), `ReliquaryAffixExcelConfigData` (depot, value, weights) | Main stats come from the piece's **own** depot; substat tiers come from its **own** affix depot |

## Rules enforced

**Main stat.** The stat must be in the piece's main depot, have a non-zero roll weight, *and* be
legal for the slot:

| Slot | Allowed |
|---|---|
| Flower | flat HP |
| Plume | flat ATK |
| Sands | HP%, ATK%, DEF%, EM, Energy Recharge |
| Goblet | HP%, ATK%, DEF%, EM, 7 elemental DMG, Physical DMG |
| Circlet | HP%, ATK%, DEF%, EM, CRIT Rate, CRIT DMG, Healing Bonus |

The depots also contain rows the game never rolls (flat HP/ATK/DEF and resistance on sands, goblet
and circlet, all weight 0). Before Part 4 the bridge accepted them because they are "in the depot".
They are now rejected with `MAIN_STAT_NOT_ALLOWED_FOR_SLOT`.

**Substats.** Ten types: flat HP/ATK/DEF, HP%/ATK%/DEF%, EM, ER, CRIT Rate, CRIT DMG. Each roll is an
affix id from the piece's own affix depot, so values are only ever the game's tiers (5★: 4 tiers per
stat). Rules:
- At most 4 distinct types, never the main stat's type.
- Starting substats: 5★ 3 or 4, 4★ 2 or 3, 3★ 1 or 2, 2★ 0 or 1, 1★ 0. Fixed reward variants
  (rows whose `appendPropNum` is lower) start with exactly their `appendPropNum`.
- One roll per 4 levels up to the rarity's maximum (5★ +4/+8/+12/+16/+20; 4★ up to +16; levels
  come from the row's `maxLevel`).
- A roll adds a **new** type while fewer than 4 exist, otherwise it upgrades an existing one (this
  is also what the server's `GameItem.addAppendProp` does). Several upgrades may stack on one stat.
- Total rolls = start + upgrades, exactly (custom mode).

Detail codes (inside `INVALID_ARTIFACT_CONFIG`): `INVALID_MAIN_STAT`,
`MAIN_STAT_NOT_ALLOWED_FOR_SLOT`, `MAIN_STAT_REQUIRED`, `INVALID_SUBSTAT`, `SUBSTAT_EQUALS_MAIN`,
`DUPLICATE_INITIAL_SUBSTAT`, `UPGRADE_BEFORE_FOUR_TYPES`, `TOO_MANY_SUBSTAT_TYPES`,
`ROLL_COUNT_MISMATCH`, `INVALID_INITIAL_SUBSTATS`, `ROLLS_NOT_ALLOWED`.

## Two modes

| | Normal | Custom |
|---|---|---|
| Choose | piece, level, main stat (or server-random), starting count | piece, level, main stat, every roll in order (type + tier) |
| Substats | rolled by the server with `GameItem.addAppendProps` (affix weights, upgrade weights) after the main stat is fixed | sent as the full ordered list and checked exactly; nothing random is added |
| Request | `POST /players/{uid}/artifacts {itemId, level, mode:"normal", mainPropId?, initialSubstats}` | `… {itemId, level, mode:"custom", mainPropId, appendPropIds:[…]}` |

**Bug fixed on the way.** `new GameItem(data)` rolls a random main stat and the starting substats.
The bridge then overwrote the main stat but kept those substats, so a substat could equal the chosen
main stat. Normal mode now clears and re-rolls after the main stat is set. Requests without `mode`
(older presets) keep the previous "listed rolls + server fills the rest" behaviour, with the
stricter main-stat rule.

UI: legal next choices only (`nextRollChoices`), roll history with stage (start, +4, …, +20),
tier, value and affix id, undo/clear, per-stat totals, validation messages, preview card, and
save/load presets (stored with mode and starting count). Displayed values are rounded (`11.7%`);
the request carries the real affix ids (e.g. 501204 = CRIT Rate 3.89%).

## Equip, edit, delete

- `POST /players/{uid}/artifacts/{guid}/equip {avatarId, replace?}`: equipping into an occupied
  slot is refused with `SLOT_OCCUPIED` (`data.current` = the worn piece) unless `replace: true`. The
  Console shows "Replaces: artifact X (+N), which goes back to the bag" in the confirmation and only
  then sends `replace`. The same guard applies to `/avatars/{id}/equip` for artifacts; weapons are
  exempt because a character always holds one. An artifact can only go to its own slot
  (`EquipType`), and the read-back confirms the GUID is in that slot.
- `PATCH /players/{uid}/items/{guid} {…, mode:"custom"}`: the final roll list is checked like a
  custom creation against the piece's own row at the new level. The GUID is kept.
- `DELETE /players/{uid}/items/{guid}?confirm=<guid>`: artifacts only, must not be equipped
  (`ITEM_EQUIPPED`), uses `Inventory.removeItem` (sends `StoreItemDelNotify`), and the read-back
  confirms the item is gone.

## Reference study

- `GiveCommand` / `GameItem`: the same constructor and `addAppendProps` are reused (no duplicate
  roll logic).
- `GameDepot`: random main stats and substats come from `getRandomRelicMainProp` and the affix
  depots, which only contain weight > 0 rows.
- AstaPS `ArtifactShop.roll` (GPL-3.0, not copied) generates through the same `GameItem` path and
  then biases odds; its comment that "shipped weights are flat" does not apply to our imported
  weights (Part 2 §1.3).
- AstaPS `GameDepot` ranks affix value tiers. We derive tiers the same way (ascending value per stat
  in the depot).

## Tests

| Suite | Result |
|---|---|
| `NukvaArtifactRulesTest` (server, slot table, starts by rarity, valid/invalid sequences) | 4/4 |
| `src/lib/artifactRules.test.ts` (Console, against the real catalog: five slots' main stats from their depots, ten substats × 4 tiers, sequencing, rejection, id → roll decoding) | 7/7 |
| `tests/integration/artifact-builder.integration.mjs` on the isolated server, mock uid 10161 | 9/9 |
| Part 3 regression suite on the same server (updated: plain equip into an occupied slot now needs `replace`) | 14/14 |
| Console unit tests total | 103/103 |
| Browser, connected to the isolated bridge | see below |

The integration suite covers:
- **Options:** legal main stats per slot (1/1/5/12/7), 10 substats × 4 tiers, starts [3,4], upgrade
  levels.
- **Normal mode:** 26 creations covering all five slots and every legal main stat, each re-read and
  checked against the rules.
- **Boundaries:** 3 vs 4 starting substats at +0/+4/+20.
- **Custom mode:** exact tiers with stacked upgrades stored exactly.
- **Rejections:** 12 invalid configurations, nothing created.
- **4★:** starts [2,3], +16 max; +17 and a 4-start rejected.
- **Equip:** `SLOT_OCCUPIED`, then a confirmed replacement (old piece back in the bag,
  `AvatarEquipChangeNotify` sent).
- **Edit:** custom edit keeps the GUID; an impossible edit is rejected and the item is unchanged.
- **Delete:** needs confirmation, refuses an equipped piece, removes it (`StoreItemDelNotify` sent).

**Browser end-to-end (isolated server, uid 10161):**
1. Set 15001 → Flower shows item #75544, main depot 4000, HP only.
2. Goblet, custom mode, 3 starting substats: the main list shows exactly the 12 legal stats with
   real ids. Picked Pyro DMG #15008.
3. Rolls placed through the UI: after 3 starting substats, CRIT Rate was blocked at +4 (a new type
   is required); after 4 types only those four were offered; at 8/8 everything locked.
4. Preview: CRIT Rate +11.7% (3×), CRIT DMG +22.5% (3×), ATK% +5.3%, ER +5.2%.
5. Create: the request carried 8 affix ids in roll order. Result panel: "Created and found in the
   inventory", GUID 43641162694731, stats decoded from the server's stored ids.
6. Equip to Kamisato Ayaka from the result panel. The dialog had no "Replaces" line (empty slot).
   Server read-back: the GUID is in `EQUIP_RING` with main 15008 and the same 8 ids. Audit entries
   for `artifact.give` and `artifact.equip` carry origin `http://127.0.0.1:5173`.
7. Player artifacts view: the piece is listed with the same stats and "Worn by Kamisato Ayaka".

## Unresolved / 7.2 compatibility notes (with evidence)

1. **Main-stat value at a level is not shown.** It needs `ReliquaryLevelExcelConfigData` curves,
   which are not in the Console catalog yet. The server computes it in game. The preview says so
   explicitly.
2. **Substat roll weights are AstaPS-Resource's**, imported in Part 1 (`RESOURCE_READINESS §7`) and
   not independently confirmed for 7.2. This only affects normal-mode odds; custom mode is exact.
3. **Reward variant rows** (`appendPropNum` 0–2 on 5★, 435 rows) are valid pieces with a fixed start.
   The builder offers the standard piece per set/slot/rarity. Variants are reachable by id through
   the API and are handled by `allowedStarts`.
4. **Sets with no art** (15004 Glacier and Snowfield, 15012 Prayers to the Firmament) are not in the
   codex. They are buildable, but they show the "no image" placeholder (Part 2).
5. **Older artifacts** created before Part 4 could carry a main stat that is now rejected (e.g. flat
   HP on sands). Editing such a piece fails with `MAIN_STAT_NOT_ALLOWED_FOR_SLOT` until its main stat
   is changed. None were found in the test data; the real account was not inspected.
6. **Real 7.2 client not tested.** Packets are confirmed in the server log against the mock client
   only.
