#!/usr/bin/env node
/**
 * Live integration tests for the Nukva bridge, run against an ISOLATED server with a mock test
 * player online (never the main server, never a real account).
 *
 *   node tests/integration/bridge.integration.mjs --bridge=http://127.0.0.1:18088 --uid=<mock uid> \
 *        --log=../work/isolated/logs/latest.log --deny-uid=77777
 *
 * Expects nukva.json targets.denyUids to contain --deny-uid, and the isolated config.json
 * inventoryLimits.weapons to be small (30) so INVENTORY_FULL can be reached.
 * Writes reports/api/integration-results.json and reports/api/routes.json.
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
const DENY = Number(args['deny-uid'] ?? 77777);
const LOG = args.log ? path.resolve(String(args.log)) : null;
const PROTECTED = new Set([10004]);

if (/:8088$/.test(BRIDGE) && !args['allow-main']) throw new Error('Refusing to run against the main server (8088). Use the isolated instance.');
if (!Number.isInteger(UID) || PROTECTED.has(UID)) throw new Error(`--uid must be the mock test player (got ${args.uid}).`);

const API = `${BRIDGE}/nukva/v1`;
const call = async (method, p, body, { key, signal } = {}) => {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, replayed: res.headers.get('Idempotency-Replayed') === 'true' };
};
const key = () => `it-${crypto.randomUUID()}`;
const data = (r) => {
  assert.equal(r.json?.ok, true, `expected ok, got ${r.status} ${JSON.stringify(r.json?.error)}`);
  return r.json.data;
};
const err = (r, status, code) => {
  assert.equal(r.status, status, `status ${r.status} ${JSON.stringify(r.json)}`);
  assert.equal(r.json?.ok, false);
  assert.equal(r.json?.error?.code, code, JSON.stringify(r.json?.error));
  return r.json.error;
};
const mora = async () => data(await call('GET', `/players/${UID}`)).currencies.mora;
const countOf = async (itemId) => data(await call('GET', `/players/${UID}/inventory`)).filter((i) => i.itemId === itemId).reduce((s, i) => s + i.count, 0);
const logSize = () => (LOG && fs.existsSync(LOG) ? fs.statSync(LOG).size : 0);
const logSince = (offset) => {
  if (!LOG || !fs.existsSync(LOG)) return '';
  const fd = fs.openSync(LOG, 'r');
  const size = fs.statSync(LOG).size;
  const buf = Buffer.alloc(Math.max(0, size - offset));
  fs.readSync(fd, buf, 0, buf.length, offset);
  fs.closeSync(fd);
  return buf.toString('utf8');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
async function test(name, fn) {
  const started = Date.now();
  try {
    const evidence = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, evidence: evidence ?? null });
    console.log(`PASS ${name}${evidence ? `  ${JSON.stringify(evidence)}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL ${name}\n     ${error?.message ?? error}`);
  }
}

// ------------------------------------------------------------------ fixture
const players = data(await call('GET', '/players'));
assert.ok(players.some((p) => p.uid === UID), `test player ${UID} is not online on ${BRIDGE}`);
const ARTIFACT = 75554; // Gladiator's Finale (set 15001) 5* sands, the standard piece in public/data/artifact-pieces.json (4 initial substats)
const AVATAR = 10000002;

await test('routes: live route table is captured for the contract check', async () => {
  const routes = data(await call('GET', '/routes'));
  fs.mkdirSync(path.join(ROOT, 'reports', 'api'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'reports', 'api', 'routes.json'), JSON.stringify(routes, null, 1));
  return { routes: routes.length };
});

await test('typed catalog: characters / items / weapons / artifacts', async () => {
  const chars = data(await call('GET', '/catalog/characters'));
  const weapons = data(await call('GET', '/catalog/weapons'));
  const relics = data(await call('GET', '/catalog/items?type=ITEM_RELIQUARY'));
  const sets = data(await call('GET', '/artifacts/catalog'));
  assert.equal(chars.length, 121);
  assert.equal(weapons.length, 258);
  assert.equal(relics.length, 4292);
  assert.ok(chars.every((c) => c.id >= 10000002 && c.id < 10000900));
  assert.ok(weapons.every((w) => ['sword', 'claymore', 'polearm', 'catalyst', 'bow'].includes(w.weaponType)));
  err(await call('GET', '/catalog/items?type=NOPE'), 400, 'INVALID_TYPE');
  return { characters: chars.length, weapons: weapons.length, relicItems: relics.length, sets: sets.length };
});

await test('artifact piece options come from the server and match its rules', async () => {
  const o = data(await call('GET', `/artifacts/pieces/${ARTIFACT}/options`));
  assert.equal(o.slot, 'sands');
  const rollable = o.mainStats.filter((m) => m.rollable).map((m) => m.prop).sort();
  assert.deepEqual(rollable, ['FIGHT_PROP_ATTACK_PERCENT', 'FIGHT_PROP_CHARGE_EFFICIENCY', 'FIGHT_PROP_DEFENSE_PERCENT', 'FIGHT_PROP_ELEMENT_MASTERY', 'FIGHT_PROP_HP_PERCENT']);
  err(await call('GET', '/artifacts/pieces/202/options'), 409, 'ITEM_NOT_FOUND');
  return { mainStats: o.mainStats.length, substatTypes: Object.keys(o.substats).length, rollsAtMaxLevel: o.rollsAtMaxLevel };
});

await test('authorized write + read-back: give mora, a material and a weapon', async () => {
  const m0 = await mora();
  const ore0 = await countOf(104003);
  const r = data(await call('POST', `/players/${UID}/items`, { items: [{ itemId: 202, amount: 1234 }, { itemId: 104003, amount: 7 }, { itemId: 11501, amount: 1, level: 90, refinement: 5 }] }, { key: key() }));
  assert.equal(r.success, true);
  assert.deepEqual(r.results.map((x) => x.verification), ['verified', 'verified', 'verified']);
  assert.equal(await mora(), m0 + 1234);
  assert.equal(await countOf(104003), ore0 + 7);
  const weapon = data(await call('GET', `/players/${UID}/inventory?type=ITEM_WEAPON`)).find((i) => i.guid === r.results[2].guids[0]);
  assert.equal(weapon.level, 90);
  assert.equal(weapon.refinement, 5);
  return { moraDelta: 1234, oreDelta: 7, weaponGuid: weapon.guid };
});

await test('permission denial: UID in targets.denyUids is refused before anything runs', async () => {
  const e = err(await call('POST', `/players/${DENY}/items`, { items: [{ itemId: 202, amount: 1 }] }), 403, 'PERMISSION_DENIED');
  const e2 = err(await call('POST', `/players/10004/world-level`, { worldLevel: 1 }), 403, 'PERMISSION_DENIED');
  return { message: e.message, realAccountProtected: e2.code };
});

await test('invalid ids and unknown players', async () => {
  err(await call('POST', `/players/${UID}/items`, { items: [{ itemId: 999999999, amount: 1 }] }), 400, 'UNKNOWN_ITEM');
  err(await call('POST', `/players/${UID}/avatars`, { avatarId: 10000500 }), 400, 'UNKNOWN_AVATAR');
  const np = err(await call('POST', `/players/${UID}/avatars`, { avatarId: 10000999 }), 400, 'UNSUPPORTED_OPERATION');
  assert.equal(np.detail, 'NOT_PLAYABLE');
  err(await call('POST', `/players/${UID}/spawn`, { monsterId: 1, amount: 1, level: 1 }), 400, 'UNKNOWN_MONSTER');
  err(await call('POST', `/players/${UID}/teleport`, { sceneId: 999999 }), 400, 'UNKNOWN_SCENE');
  err(await call('POST', `/players/${UID}/artifacts`, { itemId: 202, level: 1, appendPropIds: [] }), 400, 'NOT_AN_ARTIFACT');
  err(await call('GET', '/players/123456789'), 409, 'PLAYER_NOT_FOUND');
  err(await call('PATCH', `/players/${UID}/items/999999999999`, { level: 2 }), 409, 'ITEM_NOT_FOUND');
  err(await call('POST', `/players/${UID}/items`, { items: [{ itemId: 202, amount: 0 }] }), 400, 'OUT_OF_RANGE');
});

await test('invalid artifact configuration is rejected with the exact rule', async () => {
  const o = data(await call('GET', `/artifacts/pieces/${ARTIFACT}/options`));
  const atk = o.mainStats.find((m) => m.prop === 'FIGHT_PROP_ATTACK_PERCENT');
  const atkSub = o.substats.FIGHT_PROP_ATTACK_PERCENT[0];
  const before = (await call('GET', `/players/${UID}/artifacts`)).json.data.length;
  const d1 = err(await call('POST', `/players/${UID}/artifacts`, { itemId: ARTIFACT, level: 1, mainPropId: atk.id, appendPropIds: [atkSub.id] }), 400, 'INVALID_ARTIFACT_CONFIG');
  assert.equal(d1.detail, 'SUBSTAT_EQUALS_MAIN');
  const d2 = err(await call('POST', `/players/${UID}/artifacts`, { itemId: ARTIFACT, level: 1, mainPropId: 14001, appendPropIds: [] }), 400, 'INVALID_ARTIFACT_CONFIG');
  assert.equal(d2.detail, 'INVALID_MAIN_STAT'); // flat HP is a flower main stat, not a sands one
  const five = Object.values(o.substats).filter((_, i) => i < 6).map((list) => list[0].id);
  const d3 = err(await call('POST', `/players/${UID}/artifacts`, { itemId: ARTIFACT, level: 21, mainPropId: o.mainStats.find((m) => m.prop === 'FIGHT_PROP_ELEMENT_MASTERY').id, appendPropIds: five }), 400, 'INVALID_ARTIFACT_CONFIG');
  assert.ok(['TOO_MANY_SUBSTAT_TYPES', 'SUBSTAT_EQUALS_MAIN'].includes(d3.detail));
  assert.equal((await call('GET', `/players/${UID}/artifacts`)).json.data.length, before, 'nothing was created');
  return { details: [d1.detail, d2.detail, d3.detail] };
});

let createdGuid = null;
await test('artifact: create with exact stats, read back, equip by guid, read back on the character', async () => {
  const o = data(await call('GET', `/artifacts/pieces/${ARTIFACT}/options`));
  const main = o.mainStats.find((m) => m.prop === 'FIGHT_PROP_ELEMENT_MASTERY');
  const subs = ['FIGHT_PROP_CRITICAL', 'FIGHT_PROP_CRITICAL_HURT', 'FIGHT_PROP_ATTACK_PERCENT', 'FIGHT_PROP_CHARGE_EFFICIENCY'].map((p) => o.substats[p].at(-1).id);
  const r = data(await call('POST', `/players/${UID}/artifacts`, { itemId: ARTIFACT, level: 21, mainPropId: main.id, appendPropIds: subs }, { key: key() }));
  assert.equal(r.artifacts.length, 1);
  createdGuid = r.artifacts[0].guid;
  const stored = data(await call('GET', `/players/${UID}/artifacts`)).find((a) => a.guid === createdGuid);
  assert.equal(stored.level, 21);
  assert.equal(stored.mainPropId, main.id);
  assert.deepEqual(stored.appendPropIds.slice(0, 4), subs);
  // Expected total from the server's own rule: initial substats + one roll per 4 levels.
  const expected = Math.max(subs.length, o.initialSubstats + Math.floor((21 - 1) / 4));
  assert.equal(stored.appendPropIds.length, expected, `initial ${o.initialSubstats} + 5 rolls at Lv21`);
  // the character must be owned for the equip
  const owned = data(await call('GET', `/players/${UID}/avatars`)).some((a) => a.avatarId === AVATAR);
  if (!owned) data(await call('POST', `/players/${UID}/avatars`, { avatarId: AVATAR, level: 80 }, { key: key() }));
  const offset = logSize();
  // Since Part 4 an occupied artifact slot needs an explicit, confirmed replacement.
  const wearing = data(await call('GET', `/players/${UID}/avatars`)).find((a) => a.avatarId === AVATAR).artifacts.some((a) => a.slot === 'EQUIP_SHOES');
  const equipped = data(await call('POST', `/players/${UID}/artifacts/${createdGuid}/equip`, { avatarId: AVATAR, ...(wearing ? { replace: true } : {}) }, { key: key() }));
  assert.ok(equipped.artifacts.some((a) => a.guid === createdGuid && a.slot === 'EQUIP_SHOES'));
  const after = data(await call('GET', `/players/${UID}/artifacts`)).find((a) => a.guid === createdGuid);
  assert.equal(after.equippedAvatarId, AVATAR);
  await sleep(300);
  const sent = logSince(offset);
  return { guid: createdGuid, rolls: stored.appendPropIds.length, clientSync: LOG ? /AvatarEquipChangeNotify/.test(sent) : 'no log' };
});

await test('duplicate execution: same Idempotency-Key applies once; replay is marked', async () => {
  const m0 = await mora();
  const k = key();
  const body = { items: [{ itemId: 202, amount: 500 }] };
  const first = await call('POST', `/players/${UID}/items`, body, { key: k });
  const second = await call('POST', `/players/${UID}/items`, body, { key: k });
  data(first);
  data(second);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.json, first.json);
  assert.equal(await mora(), m0 + 500);
  err(await call('POST', `/players/${UID}/items`, { items: [{ itemId: 202, amount: 501 }] }, { key: k }), 422, 'IDEMPOTENCY_KEY_REUSED');
  err(await call('POST', `/players/${UID}/items`, body, { key: 'short' }), 400, 'INVALID_IDEMPOTENCY_KEY');
  return { moraDelta: (await mora()) - m0 };
});

await test('concurrent requests: 10 distinct writes all apply; 10 copies of one key apply once', async () => {
  const m0 = await mora();
  const distinct = await Promise.all(Array.from({ length: 10 }, () => call('POST', `/players/${UID}/items`, { items: [{ itemId: 202, amount: 100 }] }, { key: key() })));
  distinct.forEach(data);
  assert.equal(await mora(), m0 + 1000);
  const shared = key();
  const copies = await Promise.all(Array.from({ length: 10 }, () => call('POST', `/players/${UID}/items`, { items: [{ itemId: 202, amount: 100 }] }, { key: shared })));
  const statuses = copies.map((c) => (c.status === 200 ? (c.replayed ? 'replay' : 'ran') : c.json?.error?.code));
  assert.equal(statuses.filter((s) => s === 'ran').length, 1);
  assert.ok(statuses.every((s) => ['ran', 'replay', 'IN_PROGRESS'].includes(s)), statuses.join(','));
  assert.equal(await mora(), m0 + 1100);
  return { statuses: Object.fromEntries([...new Set(statuses)].map((s) => [s, statuses.filter((x) => x === s).length])) };
});

await test('network interruption: client aborts, retry with the same key does not apply twice', async () => {
  const m0 = await mora();
  const k = key();
  const body = { items: [{ itemId: 202, amount: 77 }] };
  const controller = new AbortController();
  const aborted = call('POST', `/players/${UID}/items`, body, { key: k, signal: controller.signal }).then(() => 'completed', (e) => e.name);
  setTimeout(() => controller.abort(), 30);
  const outcome = await aborted;
  // Retry until the server's stored result answers (it may still be running on the game thread).
  let retry;
  for (let i = 0; i < 20; i++) {
    retry = await call('POST', `/players/${UID}/items`, body, { key: k });
    if (retry.status === 200) break;
    assert.equal(retry.json?.error?.code, 'IN_PROGRESS');
    await sleep(250);
  }
  data(retry);
  assert.equal(await mora(), m0 + 77, 'applied exactly once');
  return { firstAttempt: outcome, retryReplayed: retry.replayed };
});

await test('inventory full: nothing is added when the batch does not fit', async () => {
  const weapons = data(await call('GET', `/players/${UID}/inventory?type=ITEM_WEAPON`)).length;
  const e = err(await call('POST', `/players/${UID}/items`, { items: [{ itemId: 11101, amount: 40 }] }, { key: key() }), 409, 'INVENTORY_FULL');
  assert.equal(data(await call('GET', `/players/${UID}/inventory?type=ITEM_WEAPON`)).length, weapons);
  return { weaponsBefore: weapons, error: e.message };
});

await test('character + world writes read back; client is sent its sync packets', async () => {
  // Every value changes relative to the current state, so each run produces real updates (an
  // unchanged constellation correctly sends nothing).
  const cur = data(await call('GET', `/players/${UID}/avatars`)).find((a) => a.avatarId === AVATAR);
  const level = cur.level === 85 ? 84 : 85;
  const raising = cur.constellation < 6;
  const constellation = raising ? cur.constellation + 1 : 3;
  const fetter = cur.fetterLevel === 6 ? 7 : 6;
  const worldLevel = data(await call('GET', `/players/${UID}`)).worldLevel === 2 ? 3 : 2;
  const offset = logSize();
  const u = data(await call('PATCH', `/players/${UID}/avatars/${AVATAR}`, { level, constellation, fetter }, { key: key() }));
  assert.equal(u.level, level);
  assert.equal(u.constellation, constellation);
  assert.equal(u.fetterLevel, fetter);
  assert.equal(u.sceneReloaded, !raising, 'lowering constellations reloads the scene, raising does not');
  const wl = data(await call('POST', `/players/${UID}/world-level`, { worldLevel }, { key: key() }));
  assert.equal(wl.worldLevel, worldLevel);
  const tp = data(await call('POST', `/players/${UID}/teleport`, { sceneId: 3 }, { key: key() }));
  assert.equal(tp.sceneId, 3);
  const profile = data(await call('GET', `/players/${UID}`));
  assert.equal(profile.worldLevel, worldLevel);
  await sleep(300);
  const sent = logSince(offset);
  // AvatarPropNotify (the level change) is also sent, but it is in the server's LOOP_PACKETS list and
  // is not written to the log while isShowLoopPackets is false; the level is proven by the read-back.
  const expected = ['AvatarFetterDataNotify', 'PlayerEnterSceneNotify', ...(raising ? ['AvatarUnlockTalentNotify'] : [])];
  const seen = expected.filter((p) => sent.includes(p));
  if (LOG) assert.deepEqual(seen, expected, `sync packets in the server log: saw ${seen.join(',')}`);
  return { level, constellation, fetter, worldLevel, syncPackets: seen };
});

await test('unequip and edit read back', async () => {
  if (!createdGuid) throw new Error('needs the artifact test');
  const un = data(await call('POST', `/players/${UID}/avatars/${AVATAR}/unequip`, { slot: 'sands' }, { key: key() }));
  assert.ok(!un.artifacts.some((a) => a.guid === createdGuid));
  const edited = data(await call('PATCH', `/players/${UID}/items/${createdGuid}`, { level: 20 }, { key: key() }));
  assert.equal(edited.level, 20);
  err(await call('POST', `/players/${UID}/avatars/${AVATAR}/unequip`, { slot: 'sands' }), 409, 'SLOT_EMPTY');
});

const summary = { bridge: BRIDGE, uid: UID, at: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
fs.mkdirSync(path.join(ROOT, 'reports', 'api'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports', 'api', 'integration-results.json'), JSON.stringify(summary, null, 1));
console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
process.exit(summary.failed ? 1 : 0);
