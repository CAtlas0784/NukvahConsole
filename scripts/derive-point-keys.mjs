#!/usr/bin/env node
/**
 * Derives the plain names of the obfuscated keys in the server's 7.x scene point files
 * (resources/BinOutput/Scene/Point/scene*_point.json) by comparing them, point by point, with a
 * deobfuscated copy of the same files. Nothing is guessed from key names: a key is mapped only when
 * the SAME point id in the SAME scene carries the SAME value under both names, and the mapping is
 * accepted only when it wins by a clear margin. Evidence counts are written next to every mapping.
 *
 *   node scripts/derive-point-keys.mjs --reference <AstaPS-Resource>/BinOutput/Scene/Point
 *        [--server ../SnezhnayaCore]   # writes scripts/point-keys.json
 *
 * Reference used (2026-11-09): MeChen618/AstaPS-Resource 6cfecfb5 "Update 7.2" (MIT).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
if (!args.reference) {
  console.error('Usage: node scripts/derive-point-keys.mjs --reference <dir with deobfuscated scene*_point.json>');
  process.exit(2);
}
const serverDir = path.resolve(root, args.server ?? '../SnezhnayaCore');
const oursDir = path.join(serverDir, 'resources', 'BinOutput', 'Scene', 'Point');
const refDir = path.resolve(args.reference);

/** Fields and point types the console needs. Anything else stays unmapped on purpose. */
const WANTED_FIELDS = ['pos', 'tranPos', 'rot', 'tranRot', 'gadgetId', 'areaId', 'titleTextID', 'dungeonIds', 'tranSceneId', 'size', 'groupIDs', 'dungeonRandomList'];
/** Booleans cannot be matched by value; a key is accepted when it agrees with the reference on (almost) every point. */
const WANTED_BOOLEANS = ['unlocked', 'groupLimit', 'forbidSimpleUnlock'];
const WANTED_TYPES = ['SceneTransPoint', 'VirtualTransPoint', 'DungeonEntry', 'PersonalSceneJumpPoint', 'SceneBuildingPoint', 'DungeonExit', 'SceneVehicleSummonPoint', 'DungeonWayPoint', 'DungeonQuitPoint'];
const MIN_SUPPORT = 50;
const MIN_PURITY = 0.75;

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const isVec = (v) => v && typeof v === 'object' && !Array.isArray(v) && ['x', 'y', 'z', '_x', '_y', '_z'].some((k) => k in v);
const norm = (v) => {
  if (isVec(v)) return 'V' + ['x', 'y', 'z'].map((a) => Number(v[a] ?? v[`_${a}`] ?? 0).toFixed(2)).join(',');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return v;
};
const trivial = (v) => v === 0 || v === false || v === '' || v === null || v === undefined || v === '[]' || v === '{}';

const fieldVotes = new Map();
const typeVotes = new Map();
const containerVotes = new Map();
const fieldSeen = new Map();
// boolAgree[refKey][ourKey] = [agree, total, refTrue]
const boolAgree = new Map();
const bump = (map, a, b) => {
  if (!map.has(a)) map.set(a, new Map());
  map.get(a).set(b, (map.get(a).get(b) ?? 0) + 1);
};
let files = 0;
let pairs = 0;

for (const file of fs.readdirSync(refDir).filter((f) => /^scene\d+_point\.json$/.test(f))) {
  const oursFile = path.join(oursDir, file);
  if (!fs.existsSync(oursFile)) continue;
  const ref = readJson(path.join(refDir, file))?.points;
  const ours = readJson(oursFile);
  if (!ref || typeof ref !== 'object' || Array.isArray(ref) || !ours || Array.isArray(ours)) continue;
  // The container is the object whose entries carry a "$type" and share the most ids with the reference.
  let best = null;
  for (const [k, v] of Object.entries(ours)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const values = Object.values(v);
    if (!values.length || !values.every((x) => x && typeof x === 'object' && '$type' in x)) continue;
    const overlap = Object.keys(v).filter((id) => id in ref).length;
    if (overlap && (!best || overlap > best.overlap)) best = { key: k, overlap };
  }
  if (!best) continue;
  files++;
  // Weighted by overlap: small dungeon files share ids 1..n with unrelated containers by chance.
  for (let i = 0; i < best.overlap; i++) bump(containerVotes, 'points', best.key);
  const container = ours[best.key];
  for (const [id, refPoint] of Object.entries(ref)) {
    const point = container[id];
    if (!point) continue;
    pairs++;
    bump(typeVotes, refPoint.$type, point.$type);
    const normalized = Object.entries(point).filter(([k]) => k !== '$type').map(([k, v]) => [k, norm(v)]);
    for (const refKey of WANTED_BOOLEANS) {
      const rv = refPoint[refKey] === true;
      if (!boolAgree.has(refKey)) boolAgree.set(refKey, new Map());
      const m = boolAgree.get(refKey);
      for (const [k, v] of Object.entries(point)) {
        if (typeof v !== 'boolean') continue;
        const cur = m.get(k) ?? [0, 0, 0, 0];
        cur[0] += v === rv ? 1 : 0;
        cur[1] += 1;
        cur[2] += rv ? 1 : 0;
        cur[3] += rv && v ? 1 : 0;
        m.set(k, cur);
      }
    }
    for (const [refKey, refValue] of Object.entries(refPoint)) {
      if (refKey === '$type') continue;
      fieldSeen.set(refKey, (fieldSeen.get(refKey) ?? 0) + 1);
      const n = norm(refValue);
      if (trivial(n)) continue;
      // Only exclusive matches count: when pos == tranPos the value cannot tell the two keys apart.
      const hits = normalized.filter(([, v]) => v === n);
      if (hits.length === 1) bump(fieldVotes, refKey, hits[0][0]);
    }
  }
}

const decide = (votes, name) => {
  const ranked = [...(votes.get(name) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((s, [, n]) => s + n, 0);
  const [top, second] = ranked;
  if (!top) return { accepted: false, reason: 'no evidence' };
  const purity = top[1] / total;
  const accepted = top[1] >= MIN_SUPPORT && purity >= MIN_PURITY;
  return { key: top[0], support: top[1], total, purity: Number(purity.toFixed(3)), runnerUp: second ?? null, accepted };
};

/**
 * Types are judged from our side: every obfuscated type name whose points are (almost) all of one
 * reference type maps to it. A type can have more than one name (some rows are still plain text).
 */
const reverseTypes = new Map();
for (const [refType, m] of typeVotes) {
  for (const [ourType, n] of m) {
    if (!reverseTypes.has(ourType)) reverseTypes.set(ourType, new Map());
    reverseTypes.get(ourType).set(refType, (reverseTypes.get(ourType).get(refType) ?? 0) + n);
  }
}
const decideType = (refType) => {
  const keys = [];
  for (const [ourType, m] of reverseTypes) {
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    const support = m.get(refType) ?? 0;
    const purity = support / total;
    if (support >= 20 && purity >= 0.95) keys.push({ key: ourType, support, total, purity: Number(purity.toFixed(3)) });
  }
  return { keys, accepted: keys.length > 0 };
};

const out = {
  generatedAt: new Date().toISOString(),
  reference: { dir: refDir, note: 'MeChen618/AstaPS-Resource 6cfecfb5 (MIT), deobfuscated scene point files' },
  evidence: { matchedSceneFiles: files, matchedPoints: pairs, minSupport: MIN_SUPPORT, minPurity: MIN_PURITY },
  container: decide(containerVotes, 'points'),
  fields: Object.fromEntries(WANTED_FIELDS.map((f) => [f, { ...decide(fieldVotes, f), seen: fieldSeen.get(f) ?? 0 }])),
  types: Object.fromEntries(WANTED_TYPES.map((t) => [t, decideType(t)])),
  booleans: Object.fromEntries(
    WANTED_BOOLEANS.map((b) => {
      const ranked = [...(boolAgree.get(b) ?? new Map()).entries()]
        .map(([key, [agree, total, refTrue, bothTrue]]) => ({ key, agree, total, refTrue, bothTrue, purity: Number((agree / total).toFixed(4)) }))
        .filter((x) => x.total >= 200)
        .sort((x, y) => y.purity - x.purity || y.bothTrue - x.bothTrue);
      const [top, second] = ranked;
      // Accept only when the key matches every true value of the reference and is not tied.
      const accepted = !!top && top.refTrue >= 20 && top.bothTrue === top.refTrue && top.purity >= 0.995 && (!second || second.purity < top.purity);
      return [b, { ...(top ?? {}), runnerUp: second ? { key: second.key, purity: second.purity } : null, accepted }];
    }),
  ),
};
// Plain names are always accepted too: a few files still use them.
out.plainAliases = { container: 'points', fields: Object.fromEntries(WANTED_FIELDS.map((f) => [f, f])) };

const target = path.join(root, 'scripts', 'point-keys.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`matched ${pairs} points in ${files} scene files`);
for (const [k, v] of Object.entries({ container: out.container, ...out.fields })) {
  console.log(`${v.accepted ? 'OK  ' : 'SKIP'} ${k.padEnd(24)} -> ${v.key ?? '-'} (${v.support ?? 0}/${v.total ?? 0}, purity ${v.purity ?? '-'})`);
}
for (const [k, v] of Object.entries(out.booleans)) {
  console.log(`${v.accepted ? 'OK  ' : 'SKIP'} bool ${k.padEnd(19)} -> ${v.key ?? '-'} (agree ${v.agree ?? 0}/${v.total ?? 0}, ref true ${v.refTrue ?? 0}, runner-up ${v.runnerUp?.key ?? '-'} ${v.runnerUp?.purity ?? ''})`);
}
for (const [k, v] of Object.entries(out.types)) {
  console.log(`${v.accepted ? 'OK  ' : 'SKIP'} type ${k.padEnd(19)} -> ${v.keys.map((x) => `${x.key} (${x.support}/${x.total})`).join(', ') || '-'}`);
}
console.log(`wrote ${path.relative(root, target)}`);
