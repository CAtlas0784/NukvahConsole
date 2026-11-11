#!/usr/bin/env node
/**
 * Local game-icon cache for Nukvah Console.
 *
 * Reads the icon NAMES already present in the local catalog (public/data/*.json, generated from the
 * server's own 7.2 ExcelBinOutput by build-catalog.mjs) and downloads each image once into a
 * git-ignored cache folder. The console serves that folder at /game-assets during `npm run dev` and
 * `npm run preview`; it is never copied into `dist/`, so no game artwork is bundled or deployed.
 *
 *   node scripts/sync-assets.mjs                 # characters, weapons, artifacts (incremental)
 *   node scripts/sync-assets.mjs --kinds characters,weapons,artifacts,materials
 *   node scripts/sync-assets.mjs --retry-missing # also re-check icons the source did not have
 *   node scripts/sync-assets.mjs --dry-run       # only report what would be fetched
 *   node scripts/sync-assets.mjs --concurrency=4 # parallel requests (default 4, max 8)
 *
 * Source: Enka.Network's public UI icon host (https://enka.network/ui/<IconName>.png), the host its
 * API-docs store files (github.com/EnkaNetwork/API-docs, store/gi/*.json) point at. Rules followed:
 * one request at a time with a delay, a descriptive User-Agent, robots.txt checked first,
 * Retry-After honoured on 429/503, and a hard stop on 401/403 (never bypassed or retried around).
 *
 * Incremental: an icon already on disk with a matching manifest entry is never requested again.
 * Icons the source returned 404 for are recorded as "missing" and re-checked only after
 * MISSING_RECHECK_DAYS or with --retry-missing. Existing files are never deleted or overwritten
 * unless a new download fully succeeds.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const SOURCE = String(args.source ?? 'https://enka.network/ui').replace(/\/+$/, '');
/**
 * Sources that serve the game's icons under the game's own icon key (never by name):
 *   Enka.Network  https://enka.network/ui/<Key>.png               (primary)
 *   Project Amber https://gi.yatta.moe/assets/UI/<Key>.png        (fallback; monster icons in monster/, furniture in furniture/)
 * Both were checked against each other: same art and size for the same key (Ambr re-encodes, so
 * bytes may differ). --fallback only requests keys that have no good file and that this source was
 * never asked about.
 */
const KNOWN_SOURCES = ['https://enka.network/ui', 'https://gi.yatta.moe/assets/UI'];
const FALLBACK = Boolean(args.fallback);
// Project Amber keeps monster and furniture icons in sub-folders (checked 2026-11-10: the root path 404s for
// furniture keys, furniture/<Key>.png serves them). The key itself is unchanged.
const pathFor = (icon) => {
  if (!SOURCE.includes('gi.yatta.moe')) return icon;
  if (icon.startsWith('UI_MonsterIcon_')) return `monster/${icon}`;
  const kinds = wanted.get(icon)?.kinds;
  if (kinds && kinds.size === 1 && kinds.has('furniture')) return `furniture/${icon}`;
  return icon;
};
const CACHE_DIR = path.resolve(ROOT, String(args.dir ?? '.cache/game-assets'));
const KINDS = String(args.kinds ?? 'characters,costumes,weapons,artifacts,artifact-pieces,materials').split(',').map((s) => s.trim());
const DELAY_MS = Math.max(150, Number(args.delay ?? 300));
// Parallel requests. Kept small on purpose (default 4, hard cap 8): this is someone else's server.
const CONCURRENCY = Math.min(8, Math.max(1, Number(args.concurrency ?? 4)));
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const DRY = Boolean(args['dry-run']);
const RETRY_MISSING = Boolean(args['retry-missing']);
const MISSING_RECHECK_DAYS = 7;
const MAX_RETRY_AFTER_S = 120;
const USER_AGENT = 'NukvahConsole-asset-sync/1.0 (local private-server admin tool; one request at a time)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJsonAtomic = (file, value) => {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
};

// ------------------------------------------------------------------ wanted icons (from local data)
const meta = readJson(path.join(DATA_DIR, 'meta.json'), {});
const wanted = new Map(); // icon -> { kinds:Set, ids:Set }
const want = (icon, kind, id) => {
  if (typeof icon !== 'string' || !/^UI_[A-Za-z0-9_]+$/.test(icon)) return;
  const entry = wanted.get(icon) ?? { kinds: new Set(), ids: new Set() };
  entry.kinds.add(kind);
  if (id !== undefined && id !== null) entry.ids.add(id);
  wanted.set(icon, entry);
};
/** Fields that hold an icon key of the entry's OWN row (see build-catalog.mjs). */
const ICON_FIELDS = new Set(['icon', 'awakenIcon']);
const walkIcons = (node, kind, id) => {
  if (Array.isArray(node)) return node.forEach((n) => walkIcons(n, kind, id));
  if (!node || typeof node !== 'object') return;
  const ownId = node.id ?? id;
  for (const [k, v] of Object.entries(node)) {
    if (ICON_FIELDS.has(k)) want(v, kind, ownId);
    else if (v && typeof v === 'object') walkIcons(v, kind, ownId);
  }
};
const KIND_FILES = {
  characters: 'characters.json',
  costumes: 'costumes.json',
  weapons: 'weapons.json',
  artifacts: 'artifacts.json',
  'artifact-pieces': 'artifact-pieces.json',
  materials: 'materials.json',
  furniture: 'furniture.json',
  monsters: 'monsters.json',
};
for (const kind of KINDS) {
  const file = KIND_FILES[kind];
  if (!file) {
    console.error(`Unknown kind "${kind}". Known: ${Object.keys(KIND_FILES).join(', ')}`);
    process.exit(2);
  }
  const data = readJson(path.join(DATA_DIR, file), null);
  if (!data) {
    console.error(`Missing ${file}. Run "npm run catalog" first.`);
    process.exit(2);
  }
  walkIcons(kind === 'artifacts' ? data.sets : data, kind);
}

// ------------------------------------------------------------------ manifest
fs.mkdirSync(CACHE_DIR, { recursive: true });
const MANIFEST = path.join(CACHE_DIR, 'manifest.json');
const manifest = readJson(MANIFEST, { schema: 1, source: SOURCE, entries: {} });
if (!FALLBACK) manifest.source = SOURCE;
manifest.sources = [...new Set([...(manifest.sources ?? [manifest.source].filter(Boolean)), SOURCE])];
manifest.catalogGameVersion = meta.gameVersion ?? null;
manifest.catalogGeneratedAt = meta.generatedAt ?? null;

const fileFor = (icon) => path.join(CACHE_DIR, `${icon}.png`);
const isPng = (buf) => buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/** Sources already asked about a key (older entries only recorded their url). */
const checkedSources = (entry) => {
  const list = new Set(entry?.checkedSources ?? []);
  if (entry?.url) for (const s of KNOWN_SOURCES) if (entry.url.startsWith(`${s}/`)) list.add(s);
  return [...list];
};

function needsFetch(icon) {
  const entry = manifest.entries[icon];
  const onDisk = fs.existsSync(fileFor(icon));
  if (FALLBACK) {
    // Fallback pass: only keys that have no good file yet and that this source was never asked for.
    if (onDisk && entry?.status === 'ok') return false;
    return !checkedSources(entry).includes(SOURCE);
  }
  if (onDisk && entry?.status === 'ok') return false;
  if (onDisk && !entry) {
    // A file placed here earlier (or by hand): adopt it instead of downloading again.
    const buf = fs.readFileSync(fileFor(icon));
    manifest.entries[icon] = { status: 'ok', url: null, bytes: buf.length, sha256: sha(buf), fetchedAt: null, adopted: true };
    return false;
  }
  if (entry?.status === 'missing' && !RETRY_MISSING) {
    const ageDays = (Date.now() - Date.parse(entry.checkedAt ?? 0)) / 86_400_000;
    if (ageDays < MISSING_RECHECK_DAYS) return false;
  }
  return true;
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ------------------------------------------------------------------ robots.txt
async function robotsAllows(urlPath) {
  const origin = new URL(SOURCE).origin;
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return { allowed: true, note: `robots.txt HTTP ${res.status} (treated as no rules)` };
    const lines = (await res.text()).split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
    let applies = false;
    const disallow = [];
    let crawlDelay = 0;
    for (const line of lines) {
      const [rawKey, ...rest] = line.split(':');
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (key === 'user-agent') applies = value === '*' || USER_AGENT.toLowerCase().includes(value.toLowerCase());
      else if (applies && key === 'disallow' && value) disallow.push(value);
      else if (applies && key === 'crawl-delay') crawlDelay = Number(value) || 0;
    }
    const blocked = disallow.find((p) => urlPath.startsWith(p));
    return { allowed: !blocked, note: blocked ? `disallowed by "${blocked}"` : `${disallow.length} disallow rule(s), none match`, crawlDelay };
  } catch (error) {
    return { allowed: false, note: `could not read robots.txt (${error.message}); not fetching` };
  }
}

// ------------------------------------------------------------------ download loop
const queue = [...wanted.keys()].filter(needsFetch).slice(0, LIMIT);
const stats = { wanted: wanted.size, alreadyCached: wanted.size - queue.length, downloaded: 0, missing: 0, errors: 0, stoppedBy: null };
console.log(`Source ${SOURCE}\nCache  ${CACHE_DIR}\nCatalog game version ${meta.gameVersion ?? '?'} (${meta.generatedAt ?? '?'})`);
console.log(`Icons wanted ${wanted.size} (${KINDS.join(', ')}), already cached or recently missing ${stats.alreadyCached}, to request ${queue.length}`);

if (queue.length && !DRY) {
  const robots = await robotsAllows(new URL(SOURCE).pathname + '/');
  console.log(`robots.txt: ${robots.note}`);
  if (!robots.allowed) {
    stats.stoppedBy = `robots.txt: ${robots.note}`;
    queue.length = 0;
  }
  const delay = Math.max(DELAY_MS, (robots.crawlDelay ?? 0) * 1000);
  console.log(`concurrency ${CONCURRENCY}, delay ${delay}ms per worker`);
  // Shared state: one 429/503 pauses every worker for the server's Retry-After; 401/403 stops all.
  let next = 0;
  let done = 0;
  let pauseUntil = 0;
  let consecutiveThrottles = 0;
  const fetchOne = async (icon) => {
    const url = `${SOURCE}/${pathFor(icon)}.png`;
    const checked = [...new Set([...checkedSources(manifest.entries[icon]), SOURCE])];
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/png' } });
    } catch (error) {
      stats.errors++;
      manifest.entries[icon] = { ...(manifest.entries[icon] ?? {}), status: manifest.entries[icon]?.status === 'ok' ? 'ok' : 'error', lastError: error.message, checkedAt: new Date().toISOString(), url };
      return 'done';
    }
    if (res.status === 429 || res.status === 503) {
      const ra = res.headers.get('retry-after');
      const waitS = ra ? (Number.isFinite(Number(ra)) ? Number(ra) : Math.max(0, (Date.parse(ra) - Date.now()) / 1000)) : 30;
      consecutiveThrottles++;
      if (consecutiveThrottles > 3 || waitS > MAX_RETRY_AFTER_S) {
        stats.stoppedBy = `HTTP ${res.status} (Retry-After ${ra ?? 'none'}); stopping instead of pressing on`;
        return 'stop';
      }
      console.log(`HTTP ${res.status}: all workers wait ${Math.ceil(waitS)}s as the server asked`);
      pauseUntil = Math.max(pauseUntil, Date.now() + Math.ceil(waitS) * 1000);
      return 'retry';
    }
    consecutiveThrottles = 0;
    if (res.status === 401 || res.status === 403) {
      stats.stoppedBy = `HTTP ${res.status} on ${url}; the source refused access, not retrying`;
      return 'stop';
    }
    if (res.status === 404) {
      stats.missing++;
      manifest.entries[icon] = { status: 'missing', url, httpStatus: 404, checkedSources: checked, checkedAt: new Date().toISOString() };
    } else if (!res.ok) {
      stats.errors++;
      manifest.entries[icon] = { ...(manifest.entries[icon] ?? {}), status: 'error', url, httpStatus: res.status, checkedAt: new Date().toISOString() };
    } else {
      const buf = Buffer.from(await res.arrayBuffer());
      if (!isPng(buf)) {
        stats.errors++;
        manifest.entries[icon] = { status: 'error', url, httpStatus: res.status, lastError: `not a PNG (${res.headers.get('content-type')})`, checkedAt: new Date().toISOString() };
      } else {
        const tmp = `${fileFor(icon)}.part`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, fileFor(icon)); // replace only after a complete, valid download
        stats.downloaded++;
        manifest.entries[icon] = {
          status: 'ok',
          url,
          source: SOURCE,
          bytes: buf.length,
          sha256: sha(buf),
          // Version tracking: the source's own validators plus the catalog version it was fetched for.
          etag: res.headers.get('etag'),
          lastModified: res.headers.get('last-modified'),
          catalogGameVersion: meta.gameVersion ?? null,
          checkedSources: checked,
          fetchedAt: new Date().toISOString(),
        };
      }
    }
    return 'done';
  };
  const worker = async () => {
    while (!stats.stoppedBy) {
      const wait = pauseUntil - Date.now();
      if (wait > 0) await sleep(wait);
      if (next >= queue.length) return;
      const icon = queue[next++];
      const outcome = await fetchOne(icon);
      if (outcome === 'stop') return;
      if (outcome === 'retry') {
        queue.push(icon); // same icon again after the pause
        continue;
      }
      done++;
      if (done % 50 === 0) {
        writeJsonAtomic(MANIFEST, manifest);
        console.log(`  ${done}/${queue.length} (new ${stats.downloaded}, missing ${stats.missing}, errors ${stats.errors})`);
      }
      await sleep(delay);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

// ------------------------------------------------------------------ report
for (const [icon, info] of wanted) {
  const entry = manifest.entries[icon];
  if (entry) {
    entry.kinds = [...new Set([...(entry.kinds ?? []), ...info.kinds])];
    // Every catalog id that uses this key (the full id -> key map is written by verify-assets.mjs).
    entry.ids = [...new Set([...(entry.ids ?? []), ...info.ids])];
  }
}
manifest.updatedAt = new Date().toISOString();
if (!DRY) writeJsonAtomic(MANIFEST, manifest);

const byStatus = { ok: [], missing: [], error: [], unchecked: [] };
for (const icon of wanted.keys()) {
  const status = manifest.entries[icon]?.status ?? 'unchecked';
  (byStatus[status] ?? byStatus.unchecked).push(icon);
}
const report = {
  generatedAt: new Date().toISOString(),
  source: SOURCE,
  catalogGameVersion: meta.gameVersion ?? null,
  kinds: KINDS,
  run: stats,
  totals: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, v.length])),
  missing: byStatus.missing.map((icon) => ({ icon, kinds: [...wanted.get(icon).kinds], ids: [...wanted.get(icon).ids].slice(0, 5) })),
  errors: byStatus.error.map((icon) => ({ icon, ...manifest.entries[icon] })),
};
if (!DRY) writeJsonAtomic(path.join(CACHE_DIR, 'report.json'), report);
console.log(
  `Done: cached ${report.totals.ok}/${wanted.size}, missing at source ${report.totals.missing}, errors ${report.totals.error}, unchecked ${report.totals.unchecked}` +
    (stats.stoppedBy ? `\nSTOPPED: ${stats.stoppedBy}` : ''),
);
if (report.missing.length) console.log(`Missing at source (the UI shows the "no image" placeholder): ${report.missing.slice(0, 15).map((m) => m.icon).join(', ')}${report.missing.length > 15 ? ', ...' : ''}`);
process.exit(stats.stoppedBy ? 1 : 0);
