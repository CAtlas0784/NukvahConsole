# Nukvah Console — The Authority Over Teyvat

*An Intelligence Beyond the Heavenly Principles.*

Nukvah Console is a web administration and character-management console for the
**SnezhnayaCore** Genshin Impact 7.2 private server. Instead of memorising GM commands and ID
lists, you search, pick, preview the exact request, confirm, and get the server's verified
answer.

It is a standalone static site (React + TypeScript + Vite). It deploys to **Vercel** or
**GitHub Pages** from the same code, and talks to the game server through the **Nukvah bridge**,
a small local-only API inside SnezhnayaCore (`/nukva/v1`). Server and console run on the same
machine; there are no tokens.

```
Browser ── Nukvah Console (npm run dev / preview, same machine)
             │  http://127.0.0.1:<port>, loopback-only, CORS allowlist
             ▼
           Nukvah bridge  (/nukva/v1 on the SnezhnayaCore HTTP listener)
             │  server task scheduler → existing game methods
             ▼
           SnezhnayaCore 7.2 (Java game server + MongoDB)
```

> Unofficial fan-made tool, not affiliated with HoYoverse. No game artwork is bundled — see
> [docs/DATA_PROVENANCE.md](docs/DATA_PROVENANCE.md).

## Features

| Area | What it does |
|---|---|
| **Observatory** (dashboard) | Link status, server/game/bridge version, role, uptime, online count; selected player's UID, nickname, AR, WL, scene, position, currencies, inventory summary; recent audit log; catalog counts; bridge capability map |
| **Universal Index** | Ranked search over 119 characters, 250 weapons, 63 artifact sets, 9,639 items, 1,476 monsters, 2,241 scenes and 58 commands — by ID, EN/TH name, internal name, element, category; typo-tolerant; prefix filters `c: w: a: m: mon: s: cmd:`; also a <kbd>Ctrl/⌘ K</kbd> palette |
| **Characters** | Browse/filter by element, weapon, rarity, ownership; live level/constellation/talents/friendship/equipment; grant, set level, constellation (with real names), talents |
| **Inventory** | Searchable item catalog by category, quantity selectors, quick give, batch tray (≤50 entries), player inventory table, operation history |
| **Armory** | Weapon forge (level, refinement, amount); artifact builder using the real main-stat and substat pools per piece, real roll tiers and game rules (≤4 stats, no main-stat duplicate, roll count by level) |
| **World Authority** | World level dial, teleport to any scene (default point or coordinates), saved coordinates, spawn monsters (amount/level) |
| **Command Codex** | Every command with aliases, usage, permissions and target requirement — live from the server when linked, otherwise a snapshot from the server source; form-based command builder; optional allowlisted execution |
| **Presets** | Character, equipment and item-bundle presets; applied through the same verified operations; JSON export/import with schema validation and catalog compatibility warnings |
| **Settings** | English / ไทย, motion (system/reduced/full), ambient starfield, optional self-hosted artwork base URL |

Every write opens a **preview** showing the exact HTTP request. Success is shown only when the
server confirms it; partial results are reported per item. **Preview mode** lets you explore with
clearly-marked simulated data and cannot apply anything.

Full list and known limitations: [docs/FEATURES.md](docs/FEATURES.md).

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173, choose **Enter preview mode**, or link a server (below).

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type-check + production build into `dist/` |
| `npm test` | Unit tests (search, command parser, presets, API client) |
| `npm run catalog` | Regenerate `public/data/*.json` from the server's resources |

## Linking a server

1. Build SnezhnayaCore from the `feature/nukva-bridge` branch.
2. Start the server on this machine. The bridge is on by default and accepts only local requests
   (no token). `nukva.json` is optional — use it to disable the bridge or allow another origin.
3. In the console, enter `http://127.0.0.1:<HTTP listener port>` (default `http://127.0.0.1:8088`)
   and connect.

Details: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#connecting-the-console-to-snezhnayacore).

## Deploying

- **Vercel** — import the repository; `vercel.json` configures the build and SPA rewrites.
- **GitHub Pages** — enable *Settings → Pages → Source: GitHub Actions*; `.github/workflows/pages.yml`
  builds with `VITE_BASE_PATH=/<repo>/` and ships a `404.html` SPA fallback.

Step-by-step: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Regenerating the catalog

The catalog is generated from the same files the server loads, so IDs always match:

```bash
node --max-old-space-size=6144 scripts/build-catalog.mjs --server ../SnezhnayaCore
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — components, decisions, data flow
- [Security](docs/SECURITY.md) — threat model, local-only access, CORS, audit
- [Deployment](docs/DEPLOYMENT.md) — Vercel, GitHub Pages, local connection
- [Features & limitations](docs/FEATURES.md)
- [Data provenance](docs/DATA_PROVENANCE.md)
