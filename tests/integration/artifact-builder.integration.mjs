#!/usr/bin/env node
/**
 * Live tests for the artifact builder's server side, against an ISOLATED server with a mock test
 * player online (never the main server, never a real account).
 *
 *   node tests/integration/artifact-builder.integration.mjs --bridge=http://127.0.0.1:18088 --uid=<mock uid> \
 *        --log=../work/isolated/logs/latest.log
 *
 * Writes reports/api/artifact-builder-results.json.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const BRIDGE = String(args.bridge ?? 'http://127.0.0.1:18088').replace(/\/+$/, '');
const UID = Number(args.uid);
const LOG = args.log ? path.resolve(String(args.log)) : null;
if (/:8088$/.test(BRIDGE)) throw new Error('Refusing to run against the main server (8088).');
if (!Number.isInteger(UID) || UID === 10004) throw new Error('--uid must be the mock test player.');

const API = `${BRIDGE}/nukva/v1`;
const call = async (method, p, body) => {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `ab-${crypto.randomUUID()}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const data = (r) => {
  assert.equal(r.json?.ok, true, `expected ok, got ${r.status} ${JSON.stringify(r.json?.error)}`);
  return r.json.data;
};
const err = (r, status, code, detail) => {
  assert.equal(r.status, status, `status ${r.status} ${JSON.stringify(r.json)}`);
  assert.equal(r.json?.error?.code, code, JSON.stringify(r.json?.error));
  if (detail) assert.equal(r.json.error.detail, detail, JSON.stringify(r.json.error));
  return r.json;
};
const logSize = () => (LOG && fs.existsSync(LOG) ? fs.statSync(LOG).size : 0);
const logSince = (offset) => {
  if (!LOG || !fs.existsSync(LOG)) return '';
  const size = fs.statSync(LOG).size;
  const buf = Buffer.alloc(Math.max(0, size - offset));
  const fd = fs.openSync(LOG, 'r');
  fs.readSync(fd, buf, 0, buf.length, offset);
  fs.closeSync(fd);
  return buf.toString('utf8');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try {
    const evidence = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, evidence: evidence ?? null });
    console.log(`PASS ${name}${evidence ? `  ${JSON.stringify(evidence)}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(e?.message ?? e) });
    console.log(`FAIL ${name}\n     ${e?.message ?? e}`);
  }
}

// ------------------------------------------------------------------ fixtures from the catalog
const pieces = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/artifact-pieces.json'), 'utf8'));
const SET = 15001; // Gladiator's Finale
const piece5 = Object.fromEntries(['flower', 'plume', 'sands', 'goblet', 'circlet'].map((s) => [s, pieces.find((p) => p.setId === SET && p.slot === s && p.rarity === 5 && p.standard)]));
const piece4 = pieces.find((p) => p.setId === SET && p.slot === 'sands' && p.rarity === 4 && p.standard);
const AVATAR = 10000002;
assert.ok(Object.values(piece5).every(Boolean) && piece4, 'catalog pieces for set 15001');
const optionsOf = async (id) => data(await call('GET', `/artifacts/pieces/${id}/options`));
const subsByProp = (o) => Object.fromEntries(Object.entries(o.substats).map(([k, v]) => [k, v]));
const propOfAffix = (o) => {
  const m = new Map();
  for (const [prop, list] of Object.entries(o.substats)) for (const a of list) m.set(a.id, prop);
  return m;
};
/** Checks a stored artifact against the game's rules, from the server's own option data. */
function checkStored(o, item, { start, level, main }) {
  const props = item.appendPropIds.map((id) => propOfAffix(o).get(id));
  const mainProp = o.mainStats.find((m) => m.id === item.mainPropId)?.prop;
  assert.ok(props.every(Boolean), 'every substat is from the piece’s own affix depot');
  assert.equal(item.level, level);
  if (main) assert.equal(item.mainPropId, main);
  assert.ok(o.mainStats.find((m) => m.id === item.mainPropId)?.allowed, 'main stat is allowed for the slot');
  const upgrades = Math.floor((level - 1) / 4);
  assert.equal(props.length, start + upgrades, `rolls = ${start} start + ${upgrades} upgrades`);
  const distinct = new Set(props);
  assert.ok(distinct.size <= 4);
  assert.ok(!distinct.has(mainProp), 'no substat equals the main stat');
  assert.equal(new Set(props.slice(0, start)).size, start, 'starting substats are distinct');
  assert.equal(distinct.size, Math.min(4, start + upgrades), 'new types until four');
  return { main: mainProp, rolls: props.length, types: distinct.size };
}

const players = data(await call('GET', '/players'));
assert.ok(players.some((p) => p.uid === UID), `test player ${UID} is not online`);
if (!data(await call('GET', `/players/${UID}/avatars`)).some((a) => a.avatarId === AVATAR)) data(await call('POST', `/players/${UID}/avatars`, { avatarId: AVATAR, level: 90 }));

await test('options: every slot offers exactly its legal main stats; ten substats with tiers', async () => {
  const want = { flower: 1, plume: 1, sands: 5, goblet: 12, circlet: 7 };
  const out = {};
  for (const [slot, p] of Object.entries(piece5)) {
    const o = await optionsOf(p.id);
    assert.equal(o.slot, slot);
    out[slot] = o.mainStats.filter((m) => m.allowed).length;
    assert.equal(out[slot], want[slot], slot);
    assert.equal(Object.keys(o.substats).length, 10);
    assert.ok(Object.values(o.substats).every((l) => l.length === 4 && l.every((a, i) => a.tier === i + 1)));
    assert.deepEqual(o.allowedStarts, [3, 4]);
    assert.deepEqual(o.upgradeLevels, [4, 8, 12, 16, 20]);
  }
  return out;
});

const created = [];
await test('normal mode: all five slots, every allowed main stat, read back against the rules', async () => {
  let n = 0;
  for (const [slot, p] of Object.entries(piece5)) {
    const o = await optionsOf(p.id);
    for (const m of o.mainStats.filter((x) => x.allowed)) {
      const r = data(await call('POST', `/players/${UID}/artifacts`, { itemId: p.id, level: 21, mode: 'normal', mainPropId: m.id, initialSubstats: 4 }));
      const stored = data(await call('GET', `/players/${UID}/artifacts`)).find((a) => a.guid === r.artifacts[0].guid);
      checkStored(o, stored, { start: 4, level: 21, main: m.id });
      created.push({ slot, guid: stored.guid, itemId: p.id });
      n++;
    }
  }
  return { created: n };
});

await test('normal mode: 3 starting substats and level boundaries (+0, +4, +20)', async () => {
  const o = await optionsOf(piece5.sands.id);
  const em = o.mainStats.find((m) => m.prop === 'FIGHT_PROP_ELEMENT_MASTERY').id;
  const out = [];
  for (const [start, level] of [[3, 1], [3, 5], [3, 21], [4, 1]]) {
    const r = data(await call('POST', `/players/${UID}/artifacts`, { itemId: piece5.sands.id, level, mode: 'normal', mainPropId: em, initialSubstats: start }));
    assert.equal(r.initialSubstats, start);
    out.push(checkStored(o, r.artifacts[0], { start, level, main: em }));
  }
  return out.map((x) => `${x.rolls} rolls/${x.types} types`);
});

await test('custom mode: exact tiers and stacked upgrades are stored exactly', async () => {
  const o = await optionsOf(piece5.circlet.id);
  const s = subsByProp(o);
  const cr = o.mainStats.find((m) => m.prop === 'FIGHT_PROP_CRITICAL').id;
  // 3 start, the +4 roll adds the 4th type, then 4 upgrades on CRIT DMG with mixed tiers.
  const seq = [s.FIGHT_PROP_ATTACK_PERCENT[3], s.FIGHT_PROP_CRITICAL_HURT[0], s.FIGHT_PROP_CHARGE_EFFICIENCY[1], s.FIGHT_PROP_ELEMENT_MASTERY[2],
    s.FIGHT_PROP_CRITICAL_HURT[3], s.FIGHT_PROP_CRITICAL_HURT[2], s.FIGHT_PROP_CRITICAL_HURT[1], s.FIGHT_PROP_CRITICAL_HURT[3]];
  const r = data(await call('POST', `/players/${UID}/artifacts`, { itemId: piece5.circlet.id, level: 21, mode: 'custom', mainPropId: cr, appendPropIds: seq.map((a) => a.id) }));
  assert.deepEqual(r.artifacts[0].appendPropIds, seq.map((a) => a.id));
  checkStored(o, r.artifacts[0], { start: 3, level: 21, main: cr });
  const critDmg = seq.filter((a) => a === s.FIGHT_PROP_CRITICAL_HURT[0] || o.substats.FIGHT_PROP_CRITICAL_HURT.includes(a)).reduce((t, a) => t + a.value, 0);
  created.push({ slot: 'circlet', guid: r.artifacts[0].guid, itemId: piece5.circlet.id });
  return { guid: r.artifacts[0].guid, critDmgTotal: Number((critDmg * 100).toFixed(1)) };
});

await test('invalid configurations are rejected with the exact rule, nothing created', async () => {
  const before = data(await call('GET', `/players/${UID}/artifacts`)).length;
  const o = await optionsOf(piece5.sands.id);
  const s = subsByProp(o);
  const flatHp = o.mainStats.find((m) => m.prop === 'FIGHT_PROP_HP');
  const atk = o.mainStats.find((m) => m.prop === 'FIGHT_PROP_ATTACK_PERCENT').id;
  const sp = piece5.sands.id;
  const details = [];
  const expect = async (body, status, code, detail) => {
    err(await call('POST', `/players/${UID}/artifacts`, body), status, code, detail);
    details.push(detail ?? code);
  };
  if (flatHp) await expect({ itemId: sp, level: 21, mode: 'normal', mainPropId: flatHp.id }, 400, 'INVALID_ARTIFACT_CONFIG', 'MAIN_STAT_NOT_ALLOWED_FOR_SLOT');
  await expect({ itemId: sp, level: 21, mode: 'normal', mainPropId: 14001 }, 400, 'INVALID_ARTIFACT_CONFIG', 'INVALID_MAIN_STAT'); // flower depot id
  await expect({ itemId: sp, level: 21, mode: 'normal', initialSubstats: 2 }, 400, 'INVALID_ARTIFACT_CONFIG', 'INVALID_INITIAL_SUBSTATS');
  await expect({ itemId: sp, level: 21, mode: 'normal', appendPropIds: [s.FIGHT_PROP_HP[0].id] }, 400, 'INVALID_ARTIFACT_CONFIG', 'ROLLS_NOT_ALLOWED');
  await expect({ itemId: sp, level: 1, mode: 'custom', appendPropIds: [] }, 400, 'INVALID_ARTIFACT_CONFIG', 'MAIN_STAT_REQUIRED');
  const four = [s.FIGHT_PROP_HP[0], s.FIGHT_PROP_DEFENSE[0], s.FIGHT_PROP_CRITICAL[0], s.FIGHT_PROP_CRITICAL_HURT[0]].map((a) => a.id);
  // +4 allows 4 rolls (3 start + new type) or 5 (4 start + upgrade); 3 is impossible.
  await expect({ itemId: sp, level: 5, mode: 'custom', mainPropId: atk, appendPropIds: four.slice(0, 3) }, 400, 'INVALID_ARTIFACT_CONFIG', 'ROLL_COUNT_MISMATCH');
  await expect({ itemId: sp, level: 1, mode: 'custom', mainPropId: atk, appendPropIds: [four[0], four[0], four[2], four[3]] }, 400, 'INVALID_ARTIFACT_CONFIG');
  await expect({ itemId: sp, level: 5, mode: 'custom', mainPropId: atk, appendPropIds: [four[0], four[1], four[2], four[2]] }, 400, 'INVALID_ARTIFACT_CONFIG', 'UPGRADE_BEFORE_FOUR_TYPES');
  await expect({ itemId: sp, level: 1, mode: 'custom', mainPropId: atk, appendPropIds: [s.FIGHT_PROP_ATTACK_PERCENT[0].id, four[1], four[2], four[3]] }, 400, 'INVALID_ARTIFACT_CONFIG', 'SUBSTAT_EQUALS_MAIN');
  await expect({ itemId: sp, level: 22, mode: 'normal' }, 400, 'OUT_OF_RANGE');
  await expect({ itemId: sp, level: 0, mode: 'normal' }, 400, 'OUT_OF_RANGE');
  await expect({ itemId: sp, level: 21, mode: 'weird' }, 400, 'INVALID_MODE');
  assert.equal(data(await call('GET', `/players/${UID}/artifacts`)).length, before, 'nothing created');
  return { rejected: details };
});

await test('4★ piece: rules come from its rarity (2–3 start, +16 max)', async () => {
  const o = await optionsOf(piece4.id);
  assert.deepEqual(o.allowedStarts, [2, 3]);
  assert.equal(o.level[1], 17);
  assert.deepEqual(o.upgradeLevels, [4, 8, 12, 16]);
  const main = o.mainStats.find((m) => m.allowed).id;
  const r = data(await call('POST', `/players/${UID}/artifacts`, { itemId: piece4.id, level: 17, mode: 'normal', mainPropId: main, initialSubstats: 2 }));
  const res = checkStored(o, r.artifacts[0], { start: 2, level: 17, main });
  err(await call('POST', `/players/${UID}/artifacts`, { itemId: piece4.id, level: 18, mode: 'normal' }), 400, 'OUT_OF_RANGE');
  err(await call('POST', `/players/${UID}/artifacts`, { itemId: piece4.id, level: 17, mode: 'normal', initialSubstats: 4 }), 400, 'INVALID_ARTIFACT_CONFIG', 'INVALID_INITIAL_SUBSTATS');
  return res;
});

await test('equip: never replaces silently; confirmed replacement returns the old piece to the bag; client is told', async () => {
  const [a, b] = created.filter((c) => c.slot === 'sands').slice(0, 2);
  // Clear the slot first so the test starts from a known state.
  const av = data(await call('GET', `/players/${UID}/avatars`)).find((x) => x.avatarId === AVATAR);
  if (av.artifacts.some((x) => x.slot === 'EQUIP_SHOES')) data(await call('POST', `/players/${UID}/avatars/${AVATAR}/unequip`, { slot: 'sands' }));
  const offset = logSize();
  data(await call('POST', `/players/${UID}/artifacts/${a.guid}/equip`, { avatarId: AVATAR }));
  const blocked = err(await call('POST', `/players/${UID}/artifacts/${b.guid}/equip`, { avatarId: AVATAR }), 409, 'SLOT_OCCUPIED');
  assert.equal(blocked.data.current.guid, a.guid);
  const after = data(await call('POST', `/players/${UID}/artifacts/${b.guid}/equip`, { avatarId: AVATAR, replace: true }));
  assert.ok(after.artifacts.some((x) => x.guid === b.guid && x.slot === 'EQUIP_SHOES'));
  const bag = data(await call('GET', `/players/${UID}/artifacts`));
  assert.equal(bag.find((x) => x.guid === a.guid).equippedAvatarId, undefined, 'old piece is back in the bag');
  assert.equal(bag.find((x) => x.guid === b.guid).equippedAvatarId, AVATAR);
  await sleep(300);
  return { replaced: a.guid, now: b.guid, clientSync: LOG ? /AvatarEquipChangeNotify/.test(logSince(offset)) : 'no log' };
});

await test('edit keeps the GUID and is checked like custom creation', async () => {
  const c = created.find((x) => x.slot === 'circlet' && x.itemId === piece5.circlet.id);
  const o = await optionsOf(piece5.circlet.id);
  const s = subsByProp(o);
  const item = data(await call('GET', `/players/${UID}/artifacts`)).find((x) => x.guid === c.guid);
  // Lower to +4 with a legal 4-start sequence + 1 upgrade.
  const mainProp = o.mainStats.find((m) => m.id === item.mainPropId).prop;
  const pick = ['FIGHT_PROP_HP', 'FIGHT_PROP_DEFENSE', 'FIGHT_PROP_ATTACK', 'FIGHT_PROP_HP_PERCENT', 'FIGHT_PROP_CRITICAL_HURT'].filter((p) => p !== mainProp).slice(0, 4);
  const seq = [...pick.map((p) => s[p][3].id), s[pick[0]][0].id];
  const edited = data(await call('PATCH', `/players/${UID}/items/${c.guid}`, { level: 5, appendPropIds: seq, mode: 'custom' }));
  assert.equal(edited.guid, c.guid);
  assert.deepEqual(edited.appendPropIds, seq);
  // +12 needs 6 or 7 rolls; 5 is impossible (and the item must stay as it was).
  err(await call('PATCH', `/players/${UID}/items/${c.guid}`, { level: 13, appendPropIds: seq, mode: 'custom' }), 400, 'INVALID_ARTIFACT_CONFIG', 'ROLL_COUNT_MISMATCH');
  const unchanged = data(await call('GET', `/players/${UID}/artifacts`)).find((x) => x.guid === c.guid);
  assert.equal(unchanged.level, 5);
  assert.deepEqual(unchanged.appendPropIds, seq);
  return { guid: c.guid, level: edited.level };
});

await test('delete: needs confirmation, refuses an equipped piece, removes and reads back', async () => {
  const worn = data(await call('GET', `/players/${UID}/artifacts`)).find((x) => x.equippedAvatarId === AVATAR);
  err(await call('DELETE', `/players/${UID}/items/${worn.guid}`), 400, 'CONFIRMATION_REQUIRED');
  err(await call('DELETE', `/players/${UID}/items/${worn.guid}?confirm=${worn.guid}`), 409, 'ITEM_EQUIPPED');
  const free = data(await call('GET', `/players/${UID}/artifacts`)).find((x) => !x.equippedAvatarId);
  const offset = logSize();
  const d = data(await call('DELETE', `/players/${UID}/items/${free.guid}?confirm=${free.guid}`));
  assert.equal(d.deleted.guid, free.guid);
  assert.ok(!data(await call('GET', `/players/${UID}/artifacts`)).some((x) => x.guid === free.guid));
  err(await call('DELETE', `/players/${UID}/items/${free.guid}?confirm=${free.guid}`), 409, 'ITEM_NOT_FOUND');
  await sleep(300);
  return { deleted: free.guid, clientSync: LOG ? /StoreItemDelNotify/.test(logSince(offset)) : 'no log' };
});

const summary = { bridge: BRIDGE, uid: UID, at: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
fs.mkdirSync(path.join(ROOT, 'reports', 'api'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports', 'api', 'artifact-builder-results.json'), JSON.stringify(summary, null, 1));
console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
process.exit(summary.failed ? 1 : 0);
