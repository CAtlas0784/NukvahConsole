# Plan: Character Builder (one-screen setup, like SRTools)

## Why

Setting up a character today means typing long slash commands in-game, for example
`/give 10000002 lv90 c6 sl10`. The goal of Nukvah Console is to replace that with a screen where
you pick a character and set everything visually, the way Firefly SRTools does for Honkai: Star Rail.

## Reference screenshots (in this folder)

| File | What it shows | Use it for |
|---|---|---|
| `01-srtools-character-info.webp` | Roster grid on the left, level slider with MAX, ultimate energy, "Use Technique", weapon card with refinement tabs (S1–S5) and Change/Remove buttons | Layout of the main screen and the Character / Weapon tab |
| `02-srtools-relics.webp` | Relic slot grid (6 slots, each with +15 badge), Change / Delete buttons, Set Effects panel on the right | Artifact tab layout and set-effect panel |
| `03-srtools-eidolons.webp` | Eidolon list E1–E6 with icons and descriptions, "Active: E6" badge | Constellation tab (C0–C6) |
| `04-srtools-skills.webp` | Skill tree with nodes showing 10/10 levels, "Max All" button, detail panel | Talents tab, plus the "Max All" button |
| `05-srtools-showcase-card.webp` | Summary card with stats, relic thumbnails, Copy Text / Copy Image / Save | Summary tab (read-only card, copy and save) |
| `06-columbina-gitools-relics-genshin.webp` | Genshin version of the same idea: roster by element, 'C6' badge, 4 artifact slots (flower, feather, sands, goblet) plus circlet, "一键满配" (one-click max), "连接私服" (connect private server) | **Primary reference**: this project is Genshin (7.2). Artifact slots and the one-click max button come from here |

Important: SRTools is for Honkai: Star Rail. Copy its **layout and interaction**, not its
terminology (traces, light cones, eidolons). Columbina GITools is for Genshin, the same game as this
server, so use it for data and naming.

## What already exists (do not rebuild)

- [Characters.tsx](../src/features/characters/Characters.tsx): browse, grant, level, constellation,
  talents, equipment view. Start from it.
- [Armory.tsx](../src/features/armory/Armory.tsx): weapon forge and artifact builder with real stat pools.
- [Inventory.tsx](../src/features/inventory/Inventory.tsx): item catalog, quick give, batch tray.
- [OperationDialog.tsx](../src/components/ui/OperationDialog.tsx): preview-then-apply pattern. Every
  write shows the exact request first. Keep this for the builder.
- Server operations in [NukvaOperations.java](../../SnezhnayaCore/src/main/java/emu/grasscutter/server/http/nukva/NukvaOperations.java):
  - Read: `GET /players/{uid}/avatars` (level, promoteLevel, constellation, talents, weapon, artifacts),
    `GET /players/{uid}/inventory` (items with `equippedAvatarId`)
  - Write: `POST /players/{uid}/avatars` (grant), `PATCH /players/{uid}/avatars/{avatarId}` (level,
    constellation, talents), `POST /players/{uid}/items` (weapons, batch up to 50),
    `POST /players/{uid}/artifacts`

## Gaps to close

Server (Java, [NukvaOperations.java](../../SnezhnayaCore/src/main/java/emu/grasscutter/server/http/nukva/NukvaOperations.java)):

1. **Equip / unequip** a weapon or artifact to an avatar. The code reads `equippedAvatarId` but has no
   write endpoint. Add `POST /players/{uid}/avatars/{avatarId}/equip` with `{ "guid" }` and
   `POST .../unequip` with `{ "slot" }`. Check the game's equip rules: one weapon per avatar, one
   artifact per slot, and an item cannot be on two avatars.
2. **Ascension** (`promoteLevel`). Level changes already set `promoteLevel` to the minimum for that
   level. Add an explicit promote control only if the builder needs it, and validate against the
   level cap.
3. **Max all** on one character: level 90, C6, all talents 10, best weapon if owned, and all owned
   artifacts equipped. Build it as one `POST /players/{uid}/avatars/{avatarId}/max` that returns the
   preview of changes first. Do not write it as several client-side calls, so that a failure cannot
   leave the character half-built.
4. **Artifact substats**: the server cannot edit an existing artifact yet. Add
   `PATCH /players/{uid}/items/{guid}` for level and substats, with the same validation as
   `giveArtifact`.

Console (React): mostly layout work on top of the existing `api` client.

## Screen spec (Nukvah Console)

Route: `/builder` (new). Add it to the sidebar near Characters.

Layout (desktop first, then phone width with a 16px gutter):

- **Left: roster.** Grid of owned characters with element and rarity filters, a search box (reuse
  `lib/search.ts`), and a 'owned only' toggle. Each card shows the level and the constellation badge.
- **Top bar:** character name, ID, connection status (reuse `useSession`), **One-click max** button.
- **Tabs** (same order as SRTools):
  1. *Character*: level slider with MAX, ascension status.
  2. *Weapon*: weapon picker from the owned inventory, refinement R1–R5, equip/unequip.
  3. *Artifacts*: 5 slots (flower, plume, sands, goblet, circlet) as a grid, each with a Change button.
     Side panel shows the active set effects (count per set, 2pc / 4pc).
  4. *Constellation*: C0–C6 as a row of toggles, with a label per step.
  5. *Talents*: normal, skill, burst, each 1–10, and a "Max all" button.
  6. *Summary*: read-only card with level, constellation, talents, weapon, and artifacts. Copy text /
     copy image. Image copy is client-side only, using a canvas.
- **Every write** goes through `OperationDialog`: show the list of changes and the requests. Apply
  only after confirmation. Show the server result per item (partial results are normal).

Rules:

- Use the same role checks as the rest of the console (`useCapability`). Viewers can open the page
  but cannot apply changes.
- Preview mode (`enterPreview`) must work with simulated data and must not send anything.
- Text in Thai and English. Add keys to both `i18n/th.ts` and `i18n/en.ts`.

## Data

- Read names, icons, and element from the Universal Index catalog (`public/data/*.json`, built by
  `npm run catalog`). Do not hard-code IDs.
- Icons: only from `VITE_ASSET_BASE_URL` (artwork the user hosts). Fall back to the generated sigils
  already used in the console. Do not bundle game art.

## Phases

1. **Server:** equip and unequip endpoints, plus the artifact substat patch, with Gradle tests in
   `NukvaAuthTest`-style unit tests. Run `.\gradlew.bat test --tests "emu.grasscutter.server.http.nukva.*"`.
2. **Console skeleton:** `/builder` route, roster, tabs with read-only data from the existing API.
3. **Console writes:** level, constellation, talents, weapon, and artifacts through `OperationDialog`.
4. **One-click max:** wire up the server max endpoint, then the button.
5. **Summary card:** layout, copy text, copy image.
6. **Polish:** phone width, reduced motion, Thai strings, empty states.

## Acceptance checks

- Setting a character to 90 / C6 / talents 10 from the builder produces the same result as the
  equivalent `/give` command in-game. Compare them in the audit log.
- Equipping an artifact already on another character is refused with a clear message.
- `npm test` and `npm run build` pass in `nukva-console`. The server tests pass.
- Works with the server running on `http://127.0.0.1:8088` and no token (the bridge is local-only).

## Notes for whoever implements this (Opus)

- Read this file and every image in this folder before writing code.
- Follow the existing code style in the console: zustand stores, `useT()` for strings, the
  `panel` / `field` / `btn` classes. Look at `Characters.tsx` first.
- Keep the change focused: do not restyle other pages, and do not change the connect screen or
  settings.
- The server-side equip rules are the main risk. Test them before wiring the UI.
- Open question for the user: should the artifact tab support 6 slots like SRTools, or only the 5
  Genshin slots? This plan assumes 5.
