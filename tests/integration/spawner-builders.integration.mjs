#!/usr/bin/env node
/**
 * Part 5 live tests: item spawner, character builder and weapon builder, against an ISOLATED server
 * with a mock test player online (never the main server, never a real account).
 *
 *   node tests/integration/spawner-builders.integration.mjs --bridge=http://127.0.0.1:18088 --uid=<mock uid> \
 *        --log=../work/isolated/logs/latest.log
 *
 * Needs the isolated test config: inventoryLimits.weapons 30, inventoryLimits.furniture 5,
 * nukva.json targets.denyUids [10004, 77777]. Writes reports/api/spawner-builders-results.json.
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
const call = async (method, p, body, key = `p5-${crypto.randomUUID()}`) => {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(method === 'GET' ? {} : { 'Idempotency-Key': key }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, replayed: res.headers.get('Idempotency-Replayed'), json: await res.json().catch(() => null) };
};
const data = (r) => {
  assert.equal(r.json?.ok, true, `expected ok, got ${r.status} ${JSON.stringify(r.json?.error)}`);
  return r.json.data;
};
const err = (r, status, code, detail) => {
  assert.equal(r.status, status, `status ${r.status} ${JSON.stringify(r.json)}`);
  assert.equal(r.json?.error?.code, code, JSON.stringify(r.json?.error));
  if (detail) assert.equal(r.json.error.detail, detail, JSON.stringify(r.json.error));
  return r.json.error;
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

// ------------------------------------------------------------------ helpers
const catalog = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', `${name}.json`), 'utf8'));
const materials = catalog('materials');
const furniture = catalog('furniture');
const characters = catalog('characters');
const inventory = async () => data(await call('GET', `/players/${UID}/inventory`));
const countOf = async (id) => (await inventory()).filter((i) => i.itemId === id).reduce((n, i) => n + (i.type === 'ITEM_WEAPON' ? 1 : i.count), 0);
const player = async () => data(await call('GET', `/players/${UID}`));
const avatars = async () => data(await call('GET', `/players/${UID}/avatars`));
const give = (items, key) => call('POST', `/players/${UID}/items`, { items }, key);

const WIT = 104003; // Hero's Wit, stack limit 99999
const MORA = 202;
const MISTSPLITTER = 11509; // 5-star sword
const DULL = 11101; // 1-star sword: Lv70, no refinement
const DEATHMATCH = 13405; // 4-star polearm

// ------------------------------------------------------------------ catalog
let server = [];
await test('server spawn catalog: classification, stack limits, reasons', async () => {
  server = data(await call('GET', '/catalog/items'));
  const by = new Map(server.map((s) => [s.id, s]));
  assert.deepEqual([by.get(WIT).kind, by.get(WIT).stackLimit, by.get(WIT).supported], ['stackable', 99999, true]);
  assert.equal(by.get(201).kind, 'currency');
  assert.equal(by.get(150)?.reason, 'NO_SERVER_HANDLER');
  const card = materials.find((m) => m.spawnReason === 'USE_CHARACTER_BUILDER');
  assert.equal(by.get(card.id).reason, 'USE_CHARACTER_BUILDER');
  assert.equal(by.get(140002).kind, 'unlock', 'glider unlock needs the 7.2 flycloak id mapping');
  // The console catalog's offline classification must match the server for every catalog item.
  const mismatches = [];
  for (const m of [...materials, ...furniture]) {
    const s = by.get(m.id);
    if (!s) { mismatches.push(`${m.id}:not-loaded`); continue; }
    const kind = s.supported ? s.kind : 'unsupported';
    if (kind !== (m.spawn ?? 'stackable')) mismatches.push(`${m.id}:${m.spawn}/${kind}`);
    else if (kind === 'stackable' && s.stackLimit !== m.stackLimit) mismatches.push(`${m.id}:limit ${m.stackLimit}/${s.stackLimit}`);
  }
  assert.deepEqual(mismatches.slice(0, 20), [], `${mismatches.length} catalog/server mismatches`);
  return { serverItems: server.length, checked: materials.length + furniture.length, mismatches: 0 };
});

// ------------------------------------------------------------------ spawner
await test('stackable item: added and verified by count', async () => {
  const before = await countOf(WIT);
  const r = data(await give([{ itemId: WIT, amount: 100 }]));
  assert.equal(r.success, true);
  const line = r.results[0];
  assert.deepEqual([line.kind, line.verification, line.before, line.after], ['stackable', 'verified', before, before + 100]);
  assert.equal(await countOf(WIT), before + 100);
  return { before, after: before + 100 };
});

await test('stack limit: refused with the addable amount, nothing changes', async () => {
  const before = await countOf(WIT);
  const e = err(await give([{ itemId: WIT, amount: 99999 - before + 1 }]), 409, 'STACK_LIMIT_EXCEEDED');
  assert.equal(e.message.includes('at most'), true, e.message);
  const after = await countOf(WIT);
  assert.equal(after, before);
  // A batch that splits the excess over two lines is refused the same way.
  err(await give([{ itemId: WIT, amount: 60000 }, { itemId: WIT, amount: 60000 }]), 409, 'STACK_LIMIT_EXCEEDED');
  assert.equal(await countOf(WIT), before);
  return { current: before, limit: 99999 };
});

await test('currency: Mora added and verified', async () => {
  const before = (await player()).currencies.mora;
  const line = data(await give([{ itemId: MORA, amount: 12345 }])).results[0];
  assert.equal(line.verification, 'verified');
  assert.equal((await player()).currencies.mora, before + 12345);
  return { before, after: before + 12345 };
});

await test('non-stackable weapon: independent instances with level, ascension, refinement', async () => {
  const off = logSize();
  const line = data(await give([{ itemId: MISTSPLITTER, amount: 2, level: 80, promoteLevel: 6, refinement: 3 }])).results[0];
  assert.equal(line.guids.length, 2);
  assert.notEqual(line.guids[0], line.guids[1]);
  const inv = await inventory();
  for (const g of line.guids) {
    const it = inv.find((i) => i.guid === g);
    assert.deepEqual([it.itemId, it.level, it.promoteLevel, it.refinement, it.count], [MISTSPLITTER, 80, 6, 3, 1]);
  }
  await sleep(300);
  const packets = (logSince(off).match(/StoreItemChangeNotify/g) ?? []).length;
  return { guids: line.guids, storeItemChangeNotify: packets };
});

await test('weapon rules: ascension, level cap and refinement per weapon', async () => {
  const before = await countOf(MISTSPLITTER);
  err(await give([{ itemId: MISTSPLITTER, amount: 1, level: 50, promoteLevel: 4 }]), 400, 'INVALID_ASCENSION');
  const r = await give([{ itemId: MISTSPLITTER, amount: 1, level: 50, promoteLevel: 4 }]);
  assert.deepEqual(r.json.data.allowed, [2, 3], "50 is a breakpoint: 50/50 and 50/60");
  err(await give([{ itemId: DULL, amount: 1, level: 80 }]), 400, 'OUT_OF_RANGE', 'LEVEL_ABOVE_MAX');
  err(await give([{ itemId: DULL, amount: 1, level: 70, refinement: 2 }]), 400, 'OUT_OF_RANGE', 'NO_REFINEMENT');
  assert.equal(await countOf(MISTSPLITTER), before);
  // Both sides of a breakpoint are accepted.
  const [a, b] = [
    data(await give([{ itemId: DULL, amount: 1, level: 40, promoteLevel: 1 }])).results[0].guids[0],
    data(await give([{ itemId: DULL, amount: 1, level: 40, promoteLevel: 2 }])).results[0].guids[0],
  ];
  const inv = await inventory();
  assert.deepEqual([inv.find((i) => i.guid === a).promoteLevel, inv.find((i) => i.guid === b).promoteLevel], [1, 2]);
  return { allowedAt50: [2, 3], dullMax: 70 };
});

await test('multiple items in one request, all read back', async () => {
  const [w0, m0, d0] = [await countOf(WIT), (await player()).currencies.mora, await countOf(DULL)];
  const r = data(await give([{ itemId: WIT, amount: 10 }, { itemId: MORA, amount: 500 }, { itemId: DULL, amount: 1 }]));
  assert.equal(r.success, true);
  assert.deepEqual(r.results.map((x) => x.verification), ['verified', 'verified', 'verified']);
  assert.deepEqual([await countOf(WIT), (await player()).currencies.mora, await countOf(DULL)], [w0 + 10, m0 + 500, d0 + 1]);
  return { lines: 3 };
});

await test('invalid item ids and unsupported items: refused, nothing applied', async () => {
  const before = await countOf(WIT);
  err(await give([{ itemId: WIT, amount: 5 }, { itemId: 99999999, amount: 1 }]), 400, 'UNKNOWN_ITEM');
  const card = materials.find((m) => m.spawnReason === 'USE_CHARACTER_BUILDER');
  err(await give([{ itemId: WIT, amount: 5 }, { itemId: card.id, amount: 1 }]), 400, 'UNSUPPORTED_ITEM', 'USE_CHARACTER_BUILDER');
  err(await give([{ itemId: 150, amount: 1 }]), 400, 'UNSUPPORTED_ITEM', 'NO_SERVER_HANDLER');
  const gcg = server.find((s) => s.reason === 'CONSUMED_ON_GAIN');
  err(await give([{ itemId: gcg.id, amount: 1 }]), 400, 'UNSUPPORTED_ITEM', 'CONSUMED_ON_GAIN');
  err(await give([{ itemId: WIT, amount: 1, level: 5 }]), 400, 'NOT_EQUIPMENT');
  assert.equal(await countOf(WIT), before);
  return { avatarCard: card.id, consumedOnGain: gcg.id };
});

await test('unlocks: namecard and glider verified on the player, second give refused', async () => {
  const namecard = materials.find((m) => m.type === 'NAMECARD' && m.spawn === 'unlock' && m.id !== 210001);
  const n = data(await give([{ itemId: namecard.id, amount: 1 }])).results[0];
  assert.deepEqual([n.kind, n.verification], ['unlock', 'verified']);
  err(await give([{ itemId: namecard.id, amount: 1 }]), 409, 'ALREADY_OWNED', 'UNLOCK_OWNED');
  const g = data(await give([{ itemId: 140002, amount: 1 }])).results[0];
  assert.equal(g.verification, 'verified');
  err(await give([{ itemId: 140002, amount: 2 }]), 400, 'OUT_OF_RANGE');
  return { namecard: namecard.id, glider: 140002 };
});

await test('unauthorized UIDs are refused', async () => {
  for (const uid of [10004, 77777]) {
    const r = await call('POST', `/players/${uid}/items`, { items: [{ itemId: WIT, amount: 1 }] });
    err(r, 403, 'PERMISSION_DENIED');
  }
  return { denied: [10004, 77777] };
});

await test('duplicate request with the same Idempotency-Key is applied once', async () => {
  const before = await countOf(WIT);
  const key = `p5-dup-${crypto.randomUUID()}`;
  const a = await give([{ itemId: WIT, amount: 7 }], key);
  const b = await give([{ itemId: WIT, amount: 7 }], key);
  data(a);
  data(b);
  assert.equal(b.replayed, 'true');
  assert.equal(await countOf(WIT), before + 7);
  return { before, after: before + 7, replayed: b.replayed };
});

await test('furniture: store a supported stack and refuse a zero-capacity item before applying the batch', async () => {
  const storable = furniture.find((f) => f.spawn === 'stackable');
  const zero = furniture.find((f) => f.spawnReason === 'ZERO_STACK_LIMIT');
  assert.ok(storable && zero);
  const before = await countOf(storable.id);
  err(await give([{ itemId: storable.id, amount: 1 }, { itemId: zero.id, amount: 1 }]), 400, 'UNSUPPORTED_ITEM', 'ZERO_STACK_LIMIT');
  assert.equal(await countOf(storable.id), before);
  const line = data(await give([{ itemId: storable.id, amount: 1 }])).results[0];
  assert.equal(line.verification, 'verified');
  assert.equal(await countOf(storable.id), before + 1);
  return { stored: storable.id, rejected: zero.id };
});

await test('capacity: weapon tab and furniture tab full -> INVENTORY_FULL, nothing added', async () => {
  const inv = await inventory();
  const weaponsNow = inv.filter((i) => i.type === 'ITEM_WEAPON').length;
  const e = err(await give([{ itemId: DULL, amount: 50 }]), 409, 'INVENTORY_FULL');
  assert.equal((await inventory()).filter((i) => i.type === 'ITEM_WEAPON').length, weaponsNow);
  const ids = furniture.filter((f) => server.find((s) => s.id === f.id)?.supported).slice(0, 6).map((f) => f.id);
  const furnBefore = (await inventory()).filter((i) => i.type === 'ITEM_FURNITURE').length;
  const f = err(await give(ids.map((itemId) => ({ itemId, amount: 1 }))), 409, 'INVENTORY_FULL');
  assert.equal((await inventory()).filter((i) => i.type === 'ITEM_FURNITURE').length, furnBefore);
  return { weaponTab: weaponsNow, weaponError: e.message, furniture: f.message };
});

// ------------------------------------------------------------------ character builder
const unowned = async () => {
  const have = new Set((await avatars()).map((a) => a.avatarId));
  return characters.find((c) => c.release === 'released' && c.weapon === 'polearm' && !have.has(c.id));
};
let hero = null;
await test('character unlock with level, ascension, constellation and talents', async () => {
  const c = await unowned();
  const off = logSize();
  const r = data(await call('POST', `/players/${UID}/avatars`, { avatarId: c.id, level: 80, promoteLevel: 6, constellation: 2, normal: 6, skill: 8, burst: 9 }));
  assert.deepEqual([r.level, r.promoteLevel, r.constellation, r.talents.normal.level, r.talents.skill.level, r.talents.burst.level], [80, 6, 2, 6, 8, 9]);
  const back = (await avatars()).find((a) => a.avatarId === c.id);
  assert.deepEqual([back.level, back.promoteLevel, back.constellation], [80, 6, 2]);
  err(await call('POST', `/players/${UID}/avatars`, { avatarId: c.id, level: 1 }), 409, 'ALREADY_OWNED');
  await sleep(300);
  hero = c;
  return { avatarId: c.id, name: c.name.en, addNoGachaAvatarCardNotify: /AddNoGachaAvatarCardNotify/.test(logSince(off)) };
});

await test('character modification: ascension at a breakpoint, invalid ascension, undo', async () => {
  const id = hero.id;
  const r = data(await call('PATCH', `/players/${UID}/avatars/${id}`, { promoteLevel: 5 }));
  assert.deepEqual([r.level, r.promoteLevel], [80, 5]);
  err(await call('PATCH', `/players/${UID}/avatars/${id}`, { level: 85, promoteLevel: 5 }), 400, 'INVALID_ASCENSION');
  const up = data(await call('PATCH', `/players/${UID}/avatars/${id}`, { level: 90, constellation: 4, skill: 10 }));
  assert.deepEqual([up.level, up.promoteLevel, up.constellation, up.talents.skill.level], [90, 6, 4, 10]);
  // Undo = the previous values sent back (what the console's Undo does).
  const undo = data(await call('PATCH', `/players/${UID}/avatars/${id}`, { level: 80, promoteLevel: 5, constellation: 2, skill: 8 }));
  assert.deepEqual([undo.level, undo.promoteLevel, undo.constellation, undo.talents.skill.level], [80, 5, 2, 8]);
  err(await call('PATCH', `/players/${UID}/avatars/${id}`, {}), 400, 'MISSING_BODY');
  return { breakpoint: '80/80 <-> 80/90', undo: 'ok' };
});

await test('non-playable and incomplete characters are refused with a reason', async () => {
  err(await call('POST', `/players/${UID}/avatars`, { avatarId: 10000136, level: 1 }), 409, 'UNSUPPORTED_OPERATION', 'NO_PROMOTE_DATA');
  const e = await call('POST', `/players/${UID}/avatars`, { avatarId: 10000001, level: 1 });
  assert.ok([400].includes(e.status), JSON.stringify(e.json));
  assert.ok(['UNSUPPORTED_OPERATION', 'UNKNOWN_AVATAR'].includes(e.json.error.code));
  return { unreleased: 'NO_PROMOTE_DATA', nonPlayable: e.json.error.code };
});

// ------------------------------------------------------------------ weapon builder
await test('weapon creation and equipment: compatible only, read back in the slot', async () => {
  const id = hero.id;
  const sword = data(await give([{ itemId: MISTSPLITTER, amount: 1, level: 90, refinement: 1 }])).results[0].guids[0];
  err(await call('POST', `/players/${UID}/avatars/${id}/equip`, { guid: sword }), 409, 'WEAPON_TYPE_MISMATCH');
  const pole = data(await give([{ itemId: DEATHMATCH, amount: 1, level: 70, promoteLevel: 4, refinement: 5 }])).results[0].guids[0];
  const before = (await avatars()).find((a) => a.avatarId === id).weapon;
  const off = logSize();
  const r = data(await call('POST', `/players/${UID}/avatars/${id}/equip`, { guid: pole }));
  assert.deepEqual([r.weapon.guid, r.weapon.level, r.weapon.promoteLevel, r.weapon.refinement], [pole, 70, 4, 5]);
  const inv = await inventory();
  assert.equal(inv.find((i) => i.guid === pole).equippedAvatarId, id);
  assert.equal(inv.find((i) => i.guid === before.guid)?.equippedAvatarId, undefined, 'old weapon back in the bag');
  // Edit: ascend at 70 then level up, keeping the guid.
  const e = data(await call('PATCH', `/players/${UID}/items/${pole}`, { promoteLevel: 5 }));
  assert.deepEqual([e.level, e.promoteLevel], [70, 5]);
  err(await call('PATCH', `/players/${UID}/items/${pole}`, { promoteLevel: 6 }), 400, 'INVALID_ASCENSION');
  // Undo of a swap = equip the previous weapon again.
  const u = data(await call('POST', `/players/${UID}/avatars/${id}/equip`, { guid: before.guid }));
  assert.equal(u.weapon.guid, before.guid);
  await sleep(300);
  return { equipped: pole, avatarEquipChangeNotify: /AvatarEquipChangeNotify/.test(logSince(off)) };
});

await test('one-click max respects the weapon own cap (1-star: Lv70 R1)', async () => {
  const id = hero.id;
  const owned = await avatars();
  const swordUser = owned.find((a) => characters.find((c) => c.id === a.avatarId)?.weapon === 'sword');
  const dull = data(await give([{ itemId: DULL, amount: 1, level: 1 }])).results[0].guids[0];
  data(await call('POST', `/players/${UID}/avatars/${swordUser.avatarId}/equip`, { guid: dull }));
  const plan = data(await call('POST', `/players/${UID}/avatars/${swordUser.avatarId}/max`, { apply: false }));
  const w = plan.changes.find((c) => c.field === 'weapon');
  assert.equal(w.to, 'Lv70 R1');
  const applied = data(await call('POST', `/players/${UID}/avatars/${swordUser.avatarId}/max`, { apply: true }));
  assert.deepEqual([applied.avatar.weapon.level, applied.avatar.weapon.refinement, applied.avatar.weapon.promoteLevel], [70, 1, 4]);
  return { avatar: swordUser.avatarId, hero: id, weapon: 'Lv70 R1' };
});

// ------------------------------------------------------------------ report
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
const out = path.join(ROOT, 'reports/api/spawner-builders-results.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), bridge: BRIDGE, uid: UID, passed, total: results.length, results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
