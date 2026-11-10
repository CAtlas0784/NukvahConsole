#!/usr/bin/env node
/**
 * Catalog coverage report: server resources vs. the server's loaded game data (bridge API) vs. the
 * console catalog vs. verified images. Writes reports/catalog/coverage.json and prints a summary.
 *
 *   node scripts/validate-catalog.mjs [--api http://127.0.0.1:8088]
 *
 * --api: fetch GET /nukva/v1/catalog/loaded from a running bridge (local only) and save it to
 * reports/catalog/server-loaded.json. Without it, a previously saved copy is used if present.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const DATA = path.join(ROOT, 'public', 'data');
const REPORTS = path.join(ROOT, 'reports', 'catalog');
const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const L = (n) => readJson(path.join(DATA, `${n}.json`), []);

let loaded = null;
if (args.api) {
  const url = `${String(args.api).replace(/\/+$/, '')}/nukva/v1/catalog/loaded`;
  const res = await fetch(url);
  const body = await res.json();
  if (!body.ok) throw new Error(`${url}: ${JSON.stringify(body.error)}`);
  loaded = body.data;
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, 'server-loaded.json'), JSON.stringify({ ok: true, data: loaded, fetchedAt: new Date().toISOString(), from: url }));
} else {
  loaded = readJson(path.join(REPORTS, 'server-loaded.json'))?.data ?? null;
}

const meta = readJson(path.join(DATA, 'meta.json'), {});
const excluded = readJson(path.join(REPORTS, 'excluded.json'), []);
const images = readJson(path.join(ROOT, 'reports', 'assets', 'image-accuracy.json'), null);
const verifiedIndex = readJson(path.join(ROOT, '.cache', 'game-assets', 'index.json'), null);

const cat = {
  characters: L('characters'),
  costumes: L('costumes'),
  weapons: L('weapons'),
  artifactSets: L('artifacts').sets ?? [],
  artifactPieces: L('artifact-pieces'),
  materials: L('materials'),
  furniture: L('furniture'),
  gadgets: L('gadgets'),
  monsters: L('monsters'),
  scenes: L('scenes'),
};
const excludedIds = (c) => new Set(excluded.filter((e) => e.category === c).map((e) => e.id));

/** Which loaded-data list each catalog category is compared with, and what the bridge can do with it. */
const API = {
  characters: { loaded: loaded?.avatars, ops: 'grant, level, constellation, talents, friendship, equip, max' },
  costumes: { loaded: loaded?.costumes, ops: 'none (read-only catalog)' },
  weapons: { loaded: loaded?.items?.ITEM_WEAPON, ops: 'give (level, refinement), edit, equip' },
  artifactSets: { loaded: loaded?.reliquarySets, ops: 'via pieces' },
  artifactPieces: { loaded: loaded?.items?.ITEM_RELIQUARY, ops: 'give (main stat, substats, level), edit, equip' },
  materials: { loaded: [...(loaded?.items?.ITEM_MATERIAL ?? []), ...(loaded?.items?.ITEM_VIRTUAL ?? [])], ops: 'give' },
  furniture: { loaded: loaded?.items?.ITEM_FURNITURE, ops: 'give' },
  gadgets: { loaded: null, ops: 'none (no gadget spawn endpoint)' },
  monsters: { loaded: loaded?.monsters, ops: 'spawn' },
  scenes: { loaded: loaded?.scenes, ops: 'teleport' },
};

const report = { generatedAt: new Date().toISOString(), gameVersion: meta.gameVersion ?? null, apiSnapshot: Boolean(loaded), categories: {} };
for (const [c, list] of Object.entries(cat)) {
  const ids = new Set(list.map((e) => e.id));
  const ex = excludedIds(c);
  const cov = meta.coverage?.[c] ?? null;
  const loadedIds = API[c].loaded ? new Set(API[c].loaded) : null;
  // Loaded by the server but neither in the catalog nor explained in excluded.json: an invisible gap.
  const unexplained = loadedIds ? [...loadedIds].filter((id) => !ids.has(id) && !ex.has(id)) : null;
  // In the catalog but not loaded by the server: the bridge would refuse it.
  const notLoaded = loadedIds ? [...ids].filter((id) => !loadedIds.has(id)) : null;
  const dupes = list.length - ids.size;
  const withKey = list.filter((e) => e.icon).length;
  const withVerified = verifiedIndex ? list.filter((e) => e.icon && verifiedIndex[e.icon]).length : null;
  const noEn = list.filter((e) => !e.name?.en).length;
  const internal = list.filter((e) => e.name?.internal || e.nameSource === 'icon').map((e) => e.id);
  // Thai TextMap entry absent (not merely identical to English).
  const noTh = list.filter((e) => e.name?.noTh).length;
  report.categories[c] = {
    sourceRows: cov?.sourceRows ?? null,
    loadedByServer: loadedIds ? loadedIds.size : null,
    inCatalog: ids.size,
    excluded: ex.size,
    excludedReasons: cov?.excludedReasons ?? {},
    duplicateIds: dupes,
    loadedButUnexplained: unexplained?.length ?? null,
    loadedButUnexplainedSample: unexplained?.slice(0, 20) ?? null,
    inCatalogButNotLoaded: notLoaded?.length ?? null,
    inCatalogButNotLoadedSample: notLoaded?.slice(0, 20) ?? null,
    withImageKey: withKey,
    withVerifiedImage: withVerified,
    placeholderArt: list.filter((e) => e.imageStatus === 'placeholder-art').map((e) => e.id),
    missingEnglishName: noEn,
    internalNameOnly: internal,
    englishOnlyNoThai: noTh,
    operations: API[c].ops,
  };
}
const teleports = L('teleports');
report.teleports = {
  inCatalog: teleports.length,
  byKind: teleports.reduce((m, t) => ((m[t.kind] = (m[t.kind] ?? 0) + 1), m), {}),
  scenes: new Set(teleports.map((t) => t.sceneId)).size,
  serverLoadedScenePoints: loaded?.scenePoints?.total ?? null,
  serverScenesWithPoints: loaded?.scenePoints ? Object.keys(loaded.scenePoints.perScene).length : null,
  pointFiles: meta.points ?? null,
};
report.images = images ? { statusCounts: images.statusCounts, summary: images.summary, rejected: images.rejected.length, missing: images.missing.length, sharedContentGroups: images.sharedContent.length, orphans: images.orphans.length } : null;

fs.mkdirSync(REPORTS, { recursive: true });
fs.writeFileSync(path.join(REPORTS, 'coverage.json'), JSON.stringify(report, null, 1));

const pad = (s, n) => String(s ?? '-').padEnd(n);
console.log(`${pad('category', 15)}${pad('source', 8)}${pad('loaded', 8)}${pad('catalog', 9)}${pad('excl', 7)}${pad('dupes', 7)}${pad('unexpl', 8)}${pad('notLd', 7)}${pad('key', 7)}${pad('verified', 9)}${pad('noTH', 6)}`);
for (const [c, r] of Object.entries(report.categories)) {
  console.log(`${pad(c, 15)}${pad(r.sourceRows, 8)}${pad(r.loadedByServer, 8)}${pad(r.inCatalog, 9)}${pad(r.excluded, 7)}${pad(r.duplicateIds, 7)}${pad(r.loadedButUnexplained, 8)}${pad(r.inCatalogButNotLoaded, 7)}${pad(r.withImageKey, 7)}${pad(r.withVerifiedImage, 9)}${pad(r.englishOnlyNoThai, 6)}`);
}
console.log('teleports', JSON.stringify(report.teleports));
