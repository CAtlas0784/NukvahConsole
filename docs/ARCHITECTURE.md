# Architecture

## Components

| Layer | Where | Responsibility |
|---|---|---|
| **Nukvah Console** | this repository; static files on Vercel / GitHub Pages | UI, search, catalog, previews, presets. No server runtime. |
| **Nukvah bridge** | `SnezhnayaCore/src/main/java/emu/grasscutter/server/http/nukva/` | Authenticated JSON API mounted at `/nukva/v1` on the server's existing Javalin HTTP listener |
| **SnezhnayaCore** | Java game server + MongoDB | Owns all game state; the bridge calls its existing methods |

## Decisions

1. **The bridge lives inside SnezhnayaCore**, not as a separate service. Typed operations must
   act on *live, in-memory* player state and send the client its update packets; a separate
   process could only edit MongoDB behind the server's back (explicitly forbidden). The bridge is
   an isolated package plus one registration line in `Grasscutter.java`, and is **off** unless
   `nukva.json` enables it.
2. **Reuse, don't reimplement.** Every operation mirrors what the server's own GM commands and
   built-in handbook already do (`Avatar.setLevel/forceConstellationLevel/setSkillLevel`,
   `Inventory.addItem`, `World.transferPlayerToScene`, `Scene.addEntity`, `Player.setWorldLevel`).
3. **Game-thread execution.** Operations are queued with `GameServer.getScheduler().scheduleTask`
   and awaited with a timeout (default 10 s), so HTTP threads never mutate game state
   concurrently with the tick loop. The scheduler ticks once per second, so writes take ≤ ~1 s.
4. **Read-back verification.** Writes return the state read back after applying (e.g. the
   avatar's level/constellation, the world level, per-item `added` counts). The console reports
   success only from that confirmation; anything else is *failed* or *partial*.
5. **Typed endpoints over console strings.** Raw command execution exists but is disabled by
   default, admin-only and allowlisted; `@uid`/`target` tricks are rejected.
6. **Static catalog generated from the server's resources.** `scripts/build-catalog.mjs` reads
   `ExcelBinOutput` + `TextMap` (EN, TH, incl. `TextMap_Medium`) and the `@Command` annotations,
   producing compact JSON in `public/data`. Large files load lazily; search builds one shared
   in-memory index.
7. **Capability negotiation.** `/status` lists capabilities; the UI enables only those, and
   explains why something is unavailable (preview, disconnected, unsupported, role).

## Bridge API (`/nukva/v1`)

All responses: `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "code", "message" } }`.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/health` | none | `{ok, service, apiVersion}` — reveals nothing else |
| GET | `/status` | viewer | versions, run mode, online count, uptime, role, capabilities, limits |
| GET | `/players` | viewer | online players |
| GET | `/players/{uid}` | viewer | profile, position, currencies, inventory counts by type |
| GET | `/players/{uid}/avatars` | viewer | level, ascension, constellation, talents (N/E/Q), friendship, weapon, artifacts |
| GET | `/players/{uid}/inventory?type=` | viewer | items (≤ 5000) |
| GET | `/commands` | viewer | from `CommandMap` annotations + language file |
| GET | `/audit?limit=` | viewer | recent audit entries (memory ring, 200) |
| GET | `/catalog/loaded` | viewer | ids the server actually loaded (avatars, costumes, items by type, artifact sets, monsters, scenes, gadget count, scene points per scene). Used by `npm run catalog:validate` |
| POST | `/players/{uid}/avatars` | operator | grant `{avatarId, level, constellation, talentLevel}`; 409 if owned |
| PATCH | `/players/{uid}/avatars/{avatarId}` | operator | `{level?, constellation?, normal?, skill?, burst?, fetter?}`; returns `rejected[]`, `sceneReloaded` (true when lowering constellations reloaded the scene, as `setconst` does) |
| POST | `/players/{uid}/items` | operator | `{items:[{itemId, amount, level?, refinement?}]}`; weapons/artifacts unstackable |
| POST | `/players/{uid}/artifacts` | operator | `{itemId, level, mainPropId?, appendPropIds[], amount?}`; depot-validated |
| POST | `/players/{uid}/world-level` | operator | `{worldLevel 0–9}`; verified read-back |
| POST | `/players/{uid}/teleport` | operator | `{sceneId, x?, y?, z?}` |
| POST | `/players/{uid}/spawn` | operator | `{monsterId, amount ≤ maxEntities, level 1–200}` |
| POST | `/commands/execute` | admin | `{uid, command}`; disabled unless `rawCommands.enabled` |

Missing or unusable targets (offline player, unowned character) return **409** — the server's global 404 handler would replace a 404 body.

Validation happens server-side against the loaded `GameData` (unknown IDs, ranges, artifact
main/sub-stat depots, ≤ 4 distinct substats, substat ≠ main stat, roll count by level). Players
must be online.

## Frontend structure

```
src/
  api/          client (envelope, timeouts, errors), typed endpoints, data hooks
  app/          router + lazy pages
  components/   fx (starfield, orrery, artwork sigils), layout (shell, sidebar, topbar), ui
  data/         catalog types/loader, search index, preview (simulated) data
  features/     dashboard, search, characters, inventory, armory, world, commands, presets, settings, gate
  i18n/         typed EN/TH dictionaries (missing keys fail type-checking)
  lib/          search engine, usage parser, presets schema, stats labels, storage, motion
  stores/       zustand: session/link, settings, ops history + toasts, presets/bookmarks
```

Stack: React 19, TypeScript, Vite 8, Tailwind CSS 4, Motion, Zustand, Lucide, React Router.
shadcn/ui was not used: the design needed bespoke components and avoiding Radix keeps the
bundle small (~140 KB gzip JS for the shell; pages and catalogs load lazily).
