#!/usr/bin/env node
/**
 * Verifies the local icon cache against the catalog. Read-only for the cache files and the
 * download manifest; writes:
 *   .cache/game-assets/index.json      verified keys only {key: {w, h, sha256}} (the UI shows an image
 *                                      only when its key is listed here; everything else gets the
 *                                      explicit missing-image placeholder)
 *   reports/assets/image-accuracy.json full results (committed; contains no images)
 *
 *   node scripts/verify-assets.mjs [--dir .cache/game-assets]
 *
 * Checks per referenced key: file present, manifest status ok, SHA-256 of the file on disk equals
 * the manifest (cache corruption), valid PNG (signature, chunk CRCs, IHDR, IDAT inflates to exactly
 * the size the header implies), key family matches the entry's image type, and no two different
 * keys have byte-identical content (which would mean one image stands in for another object).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const CACHE_DIR = path.resolve(ROOT, String(args.dir ?? '.cache/game-assets'));
const DATA = path.join(ROOT, 'public', 'data');
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };

/** Key families each image type must belong to. Item icons vary by item family, so only a prefix. */
const FAMILY = {
  'avatar-icon': /^UI_AvatarIcon_(?!Side_)/,
  'avatar-costume-icon': /^UI_AvatarIcon_(?!Side_)/,
  'weapon-icon': /^UI_EquipIcon_/,
  'relic-icon': /^UI_RelicIcon_\d+_[1-5]$/,
  'item-icon': /^UI_/,
  'monster-icon': /^UI_MonsterIcon_/,
};

// ------------------------------------------------------------------ references from the catalog
const refs = []; // { category, id, field, key, imageType }
const add = (category, list, fields = ['icon']) => {
  for (const e of list ?? []) for (const f of fields) if (e[f]) refs.push({ category, id: e.id, field: f, key: e[f], imageType: e.imageType ?? null });
};
add('characters', readJson(path.join(DATA, 'characters.json')));
add('costumes', readJson(path.join(DATA, 'costumes.json')));
add('weapons', readJson(path.join(DATA, 'weapons.json')), ['icon', 'awakenIcon']);
add('artifactSets', readJson(path.join(DATA, 'artifacts.json'))?.sets);
add('artifactPieces', readJson(path.join(DATA, 'artifact-pieces.json')));
add('materials', readJson(path.join(DATA, 'materials.json')));
add('furniture', readJson(path.join(DATA, 'furniture.json')));
add('monsters', readJson(path.join(DATA, 'monsters.json')));
const keys = new Map();
for (const r of refs) {
  if (!keys.has(r.key)) keys.set(r.key, []);
  keys.get(r.key).push(r);
}

// ------------------------------------------------------------------ PNG check
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
function checkPng(buf) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) return { ok: false, error: 'not a PNG signature' };
  let off = 8;
  let ihdr = null;
  const idat = [];
  let sawEnd = false;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (off + 12 + len > buf.length) return { ok: false, error: `truncated ${type} chunk` };
    const data = buf.subarray(off + 8, off + 8 + len);
    const crc = buf.readUInt32BE(off + 8 + len);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== crc) return { ok: false, error: `bad CRC in ${type}` };
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { sawEnd = true; break; }
    off += 12 + len;
  }
  if (!ihdr) return { ok: false, error: 'no IHDR' };
  if (!sawEnd) return { ok: false, error: 'no IEND (truncated file)' };
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch (error) {
    return { ok: false, error: `IDAT does not inflate: ${error.message}` };
  }
  const ch = CHANNELS[ihdr.colorType];
  if (!ch) return { ok: false, error: `unknown colour type ${ihdr.colorType}` };
  if (ihdr.interlace === 0) {
    const stride = Math.ceil((ihdr.w * ch * ihdr.bitDepth) / 8) + 1;
    if (raw.length !== stride * ihdr.h) return { ok: false, error: `pixel data is ${raw.length} bytes, header implies ${stride * ihdr.h}` };
  }
  return { ok: true, w: ihdr.w, h: ihdr.h, colorType: ihdr.colorType, bitDepth: ihdr.bitDepth };
}

// ------------------------------------------------------------------ verify
const manifest = readJson(path.join(CACHE_DIR, 'manifest.json'), { entries: {} });
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const results = {};
const bySha = new Map();
for (const key of keys.keys()) {
  const entry = manifest.entries?.[key];
  const file = path.join(CACHE_DIR, `${key}.png`);
  const r = { status: 'unverified', reasons: [] };
  const fams = new Set(keys.get(key).map((x) => x.imageType));
  for (const t of fams) if (FAMILY[t] && !FAMILY[t].test(key)) r.reasons.push(`key does not belong to the ${t} family`);
  if (!entry) r.reasons.push('never downloaded');
  else if (entry.status !== 'ok') r.reasons.push(entry.status === 'missing' ? `source returned HTTP ${entry.httpStatus ?? 404}` : `download ${entry.status}`);
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    const digest = sha(buf);
    if (entry?.sha256 && entry.sha256 !== digest) r.reasons.push('file on disk does not match the manifest SHA-256 (corrupt or replaced)');
    const png = checkPng(buf);
    if (!png.ok) r.reasons.push(`invalid PNG: ${png.error}`);
    else Object.assign(r, { w: png.w, h: png.h });
    r.sha256 = digest;
    r.bytes = buf.length;
    if (!bySha.has(digest)) bySha.set(digest, []);
    bySha.get(digest).push(key);
  } else if (entry?.status === 'ok') {
    r.reasons.push('manifest says ok but the file is missing');
  }
  results[key] = r;
}
// Identical bytes under different keys: one picture could be standing in for another object. Each
// group must be reviewed by hand in scripts/asset-review.json; a review applies only while the
// group's keys AND hash are exactly the same, so any new or changed group is rejected again.
const review = readJson(path.join(ROOT, 'scripts', 'asset-review.json'), { sharedContent: [] });
const sameKeys = (a, b) => a.length === b.length && [...a].sort().every((k, i) => k === [...b].sort()[i]);
const allContent = [...bySha.entries()].filter(([, list]) => list.length > 1);
const reviewedContent = [];
const sharedContent = [];
for (const [digest, list] of allContent) {
  const ok = review.sharedContent?.find((g) => g.decision === 'accept' && g.sha256 === digest && sameKeys(g.keys, list));
  if (ok) reviewedContent.push({ keys: list, reason: ok.reason });
  else sharedContent.push(list);
}
for (const list of sharedContent) for (const key of list) results[key].reasons.push(`identical bytes to ${list.filter((k) => k !== key).join(', ')} (not reviewed)`);
for (const r of Object.values(results)) r.status = r.reasons.length === 0 && r.sha256 ? 'verified' : r.sha256 || r.reasons.length ? 'rejected' : 'unverified';
for (const [key, r] of Object.entries(results)) if (!r.sha256 && r.status !== 'verified') r.status = 'missing';

// Orphans: files in the cache that no catalog entry references.
const orphans = fs.existsSync(CACHE_DIR)
  ? fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.png') && !keys.has(f.slice(0, -4)))
  : [];

// Keys shared by several catalog ids (allowed only when it is the same object, e.g. one artifact
// slot icon across rarities of the same set; reported per category for review).
const sharedKeys = {};
for (const [key, list] of keys) {
  const ids = [...new Set(list.map((x) => `${x.category}:${x.id}`))];
  if (ids.length > 1) {
    const cats = [...new Set(list.map((x) => x.category))].join('+');
    (sharedKeys[cats] ??= []).push({ key, ids: ids.length, sample: ids.slice(0, 4) });
  }
}

// ------------------------------------------------------------------ outputs
const index = {};
for (const [key, r] of Object.entries(results)) if (r.status === 'verified') index[key] = { w: r.w, h: r.h, sha256: r.sha256 };
if (fs.existsSync(CACHE_DIR)) fs.writeFileSync(path.join(CACHE_DIR, 'index.json'), JSON.stringify(index));

const perCategory = {};
for (const r of refs) {
  const c = (perCategory[r.category] ??= { entries: new Set(), withVerifiedImage: new Set(), noKey: 0, dims: {} });
  c.entries.add(r.id);
  const res = results[r.key];
  if (r.field === 'icon' && res?.status === 'verified') {
    c.withVerifiedImage.add(r.id);
    const d = `${res.w}x${res.h}`;
    c.dims[d] = (c.dims[d] ?? 0) + 1;
  }
}
const catalogCounts = readJson(path.join(DATA, 'meta.json'), {}).counts ?? {};
const summary = Object.fromEntries(
  Object.entries(perCategory).map(([k, c]) => [k, { entriesWithKey: c.entries.size, withVerifiedImage: c.withVerifiedImage.size, dimensions: c.dims }]),
);
const statusCounts = {};
for (const r of Object.values(results)) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
const report = {
  generatedAt: new Date().toISOString(),
  cacheDir: path.relative(ROOT, CACHE_DIR),
  source: manifest.source ?? null,
  keysReferenced: keys.size,
  statusCounts,
  catalogCounts,
  summary,
  rejected: Object.entries(results).filter(([, r]) => r.status === 'rejected').map(([key, r]) => ({ key, reasons: r.reasons, usedBy: keys.get(key).slice(0, 5).map((x) => `${x.category}:${x.id}`) })),
  missing: Object.entries(results).filter(([, r]) => r.status === 'missing').map(([key, r]) => ({ key, reasons: r.reasons, usedBy: keys.get(key).slice(0, 5).map((x) => `${x.category}:${x.id}`) })),
  sharedContent,
  reviewedSharedContent: reviewedContent,
  sharedKeys: Object.fromEntries(Object.entries(sharedKeys).map(([k, v]) => [k, { count: v.length, sample: v.slice(0, 10) }])),
  orphans,
};
const reportDir = path.join(ROOT, 'reports', 'assets');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'image-accuracy.json'), JSON.stringify(report, null, 1));
console.log(`keys ${keys.size}:`, statusCounts);
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(15)} ${v.withVerifiedImage}/${v.entriesWithKey} verified`, JSON.stringify(v.dimensions));
console.log(`rejected ${report.rejected.length}, shared-content groups ${sharedContent.length}, orphans ${orphans.length}`);
process.exit(report.rejected.some((r) => r.reasons.some((x) => /corrupt|invalid PNG|family/.test(x))) ? 1 : 0);
