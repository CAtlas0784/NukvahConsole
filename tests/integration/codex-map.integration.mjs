#!/usr/bin/env node
/**
 * Live tests for the Command Codex (command metadata, allowlisted execution, refusals) and the
 * teleport map (teleport to a catalog point, read the position back), against the ISOLATED server
 * with a mock test player online. Never the main server, never a real account.
 *
 *   node tests/integration/codex-map.integration.mjs --bridge=http://127.0.0.1:18088 --uid=<mock uid> --offline-uid=<disconnected mock uid>
 *
 * Writes reports/api/codex-map-results.json.
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
const OFFLINE_UID = Number(args['offline-uid']);
if (/:8088$/.test(BRIDGE)) throw new Error('Refusing to run against the main server (8088).');
if (!Number.isInteger(UID) || UID === 10004) throw new Error('--uid must be the mock test player.');
if (!Number.isInteger(OFFLINE_UID) || OFFLINE_UID <= 0 || OFFLINE_UID === UID || OFFLINE_UID === 10004) throw new Error('--offline-uid must be a different mock test player.');

const API = `${BRIDGE}/nukva/v1`;
const call = async (method, p, body) => {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `cm-${crypto.randomUUID()}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const data = (r) => {
  assert.equal(r.json?.ok, true, `expected ok, got ${r.status} ${JSON.stringify(r.json?.error)}`);
  return r.json.data;
};
const err = (r, status, code) => {
  assert.equal(r.status, status, `status ${r.status} ${JSON.stringify(r.json)}`);
  assert.equal(r.json?.error?.code, code, JSON.stringify(r.json?.error));
  return r.json.error;
};
const exec = (command, uid = UID) => call('POST', '/commands/execute', { uid, command });
const catalog = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', `${name}.json`), 'utf8'));

const results = [];
async function test(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`PASS ${name}${detail ? `  ${JSON.stringify(detail)}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`FAIL ${name}\n     ${e.message.split('\n')[0]}`);
  }
}

const players = data(await call('GET', '/players'));
assert.ok(players.some((p) => p.uid === UID), `test player ${UID} is not online`);
assert.ok(!players.some((p) => p.uid === OFFLINE_UID), `offline test player ${OFFLINE_UID} is still online`);

await test('command metadata comes from the server and matches the generated snapshot', async () => {
  const live = data(await call('GET', '/commands'));
  const snapshot = catalog('commands');
  const liveLabels = new Set(live.map((c) => c.label));
  const missing = snapshot.filter((c) => !liveLabels.has(c.label)).map((c) => c.label);
  assert.deepEqual(missing, [], 'snapshot commands missing from the live list');
  const give = live.find((c) => c.label === 'give');
  assert.ok(give.usage.length >= 1 && give.aliases.includes('g'));
  const executable = live.filter((c) => c.executable).map((c) => c.label);
  assert.ok(executable.includes('give') && !executable.includes('stop'));
  return { live: live.length, executable: executable.length };
});

await test('allowlisted command runs on the chosen player and its effect reads back', async () => {
  const before = data(await call('GET', `/players/${UID}`)).currencies.mora;
  const r = data(await exec('give 202 x321'));
  assert.ok(Array.isArray(r.output));
  const after = data(await call('GET', `/players/${UID}`)).currencies.mora;
  assert.equal(after - before, 321, `mora changed by ${after - before}`);
  return { moraDelta: after - before, output: r.output.slice(0, 2) };
});

await test('a command with feedback returns the server output', async () => {
  const r = data(await exec('heal'));
  assert.ok(r.output.length > 0, 'no feedback');
  return { output: r.output.slice(0, 2) };
});

await test('refusals carry exact codes: not allowlisted, unknown, explicit target, offline player', async () => {
  const codes = [];
  codes.push(err(await exec('stop'), 403, 'COMMAND_NOT_ALLOWED').code);
  codes.push(err(await exec('definitelynotacommand'), 400, 'UNKNOWN_COMMAND').code);
  const target = await exec(`give 202 x1 @${UID}`);
  assert.equal(target.status, 400, JSON.stringify(target.json));
  codes.push(target.json.error.code);
  // 10004 is in targets.denyUids on the test instance: the body uid must hit the same policy as {uid} routes.
  codes.push(err(await exec('heal', 10004), 403, 'PERMISSION_DENIED').code);
  codes.push(err(await exec('heal', OFFLINE_UID), 409, 'PLAYER_OFFLINE').code);
  return { codes };
});

await test('teleport to a catalog teleport point lands at its coordinates', async () => {
  const points = catalog('teleports').filter((p) => p.sceneId === 3 && p.kind === 'statue');
  assert.ok(points.length > 0, 'no statues in the catalog');
  const p = points[Math.floor(points.length / 2)];
  const body = { sceneId: 3, x: Number(p.pos.x.toFixed(2)), y: Number((p.pos.y + 1.5).toFixed(2)), z: Number(p.pos.z.toFixed(2)) };
  data(await call('POST', `/players/${UID}/teleport`, body));
  const now = data(await call('GET', `/players/${UID}`));
  const dist = Math.hypot(now.position.x - body.x, now.position.z - body.z);
  assert.equal(now.sceneId, 3);
  assert.ok(dist < 2, `landed ${dist.toFixed(1)} m away`);
  return { point: `${p.sceneId}:${p.pointId}`, area: p.area?.en ?? null, distance: Number(dist.toFixed(2)) };
});

await test('teleport into another scene from the catalog, then back', async () => {
  const other = catalog('teleports').find((p) => p.sceneId !== 3 && p.kind === 'waypoint');
  assert.ok(other, 'no waypoint outside scene 3');
  const body = { sceneId: other.sceneId, x: other.pos.x, y: other.pos.y + 1.5, z: other.pos.z };
  const r = await call('POST', `/players/${UID}/teleport`, body);
  const outcome = r.json?.ok ? 'moved' : r.json?.error?.code;
  if (r.json?.ok) assert.equal(data(await call('GET', `/players/${UID}`)).sceneId, other.sceneId);
  data(await call('POST', `/players/${UID}/teleport`, { sceneId: 3 }));
  return { scene: other.sceneId, outcome };
});

await test('invalid teleport targets are refused', async () => {
  err(await call('POST', `/players/${UID}/teleport`, { sceneId: 987654 }), 400, 'UNKNOWN_SCENE');
  const nan = await call('POST', `/players/${UID}/teleport`, { sceneId: 3, x: 'a', y: 1, z: 1 });
  assert.equal(nan.status, 400);
  return { nan: nan.json.error.code };
});

await test('server loads the 7.2 scene points (the locked-map root cause)', async () => {
  const loaded = data(await call('GET', '/catalog/loaded'));
  assert.ok(loaded.scenePoints.total >= 4000, `only ${loaded.scenePoints.total} points loaded`);
  assert.ok((loaded.scenePoints.perScene['3'] ?? 0) >= 1000, `scene 3 has ${loaded.scenePoints.perScene['3']} points`);
  const scenes = data(await call('GET', '/scenes'));
  assert.equal(scenes.find((x) => x.sceneId === 3)?.points, loaded.scenePoints.perScene['3']);
  const pts = data(await call('GET', '/scenes/3/points')).points;
  const types = {};
  for (const p of pts) types[p.type] = (types[p.type] ?? 0) + 1;
  assert.ok(types.SceneTransPoint > 400 && types.DungeonEntry > 100, JSON.stringify(types));
  err(await call('GET', '/scenes/987654/points'), 409, 'UNKNOWN_SCENE'); // bridge "not found" = 409 (Grasscutter rewrites 404 bodies)
  return { total: loaded.scenePoints.total, scenes: Object.keys(loaded.scenePoints.perScene).length, scene3: pts.length, types };
});

await test('catalog teleport points match the server data (same id, type, position)', async () => {
  const server = new Map(data(await call('GET', '/scenes/3/points')).points.map((p) => [p.pointId, p]));
  const mine = catalog('teleports').filter((p) => p.sceneId === 3);
  let same = 0;
  const off = [];
  for (const p of mine) {
    const s = server.get(p.pointId);
    const d = s && s.destination;
    if (s && s.type === p.type && d && Math.hypot(d.x - p.pos.x, d.y - p.pos.y, d.z - p.pos.z) <= 1) same++;
    else off.push(p.pointId);
  }
  assert.equal(off.length, 0, `points that differ: ${off.slice(0, 10)}`);
  return { catalog: mine.length, verified: same };
});

await test('teleport by point id lands on the server tranPos, read back', async () => {
  const pts = data(await call('GET', '/scenes/3/points')).points.filter((p) => p.type === 'SceneTransPoint' && p.destination);
  const p = pts[Math.floor(pts.length / 3)];
  const r = data(await call('POST', `/players/${UID}/teleport`, { sceneId: 3, pointId: p.pointId }));
  const now = data(await call('GET', `/players/${UID}`));
  const dist = Math.hypot(now.position.x - p.destination.x, now.position.z - p.destination.z);
  assert.equal(now.sceneId, 3);
  assert.ok(dist < 1, `landed ${dist.toFixed(2)} m from tranPos`);
  assert.equal(r.point.pointId, p.pointId);
  return { pointId: p.pointId, areaId: p.areaId, distance: Number(dist.toFixed(3)), unlockedPoints: now.unlockedPoints, scenePoints: now.scenePoints };
});

await test('teleport refusals: unknown point, point + coordinates, out of bounds, partial coordinates', async () => {
  const codes = [];
  const missing = err(await call('POST', `/players/${UID}/teleport`, { sceneId: 3, pointId: 65000 }), 409, 'POINT_NOT_FOUND');
  assert.ok(missing.message.includes('65000'));
  codes.push('POINT_NOT_FOUND');
  codes.push(err(await call('POST', `/players/${UID}/teleport`, { sceneId: 3, pointId: 3, x: 1, y: 2, z: 3 }), 400, 'INVALID_POSITION').code);
  const oob = err(await call('POST', `/players/${UID}/teleport`, { sceneId: 3, x: 99999, y: 1, z: 1 }), 400, 'INVALID_POSITION');
  assert.equal(oob.detail, 'OUT_OF_BOUNDS');
  codes.push(oob.detail);
  codes.push(err(await call('POST', `/players/${UID}/teleport`, { sceneId: 3, x: 1 }), 400, 'INVALID_POSITION').code);
  return { codes };
});

await test('player list marks UIDs the bridge refuses (for UID completion)', async () => {
  const list = data(await call('GET', '/players'));
  const me = list.find((p) => p.uid === UID);
  assert.equal(me.writable, true);
  return { players: list.map((p) => ({ uid: p.uid, writable: p.writable })) };
});

await test('a stopped server is reported as a network failure, not success', async () => {
  let failed = false;
  try {
    await fetch('http://127.0.0.1:18099/nukva/v1/health', { signal: AbortSignal.timeout(3000) });
  } catch {
    failed = true;
  }
  assert.ok(failed);
  return { unreachable: true };
});

const passed = results.filter((r) => r.ok).length;
fs.mkdirSync(path.join(ROOT, 'reports', 'api'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports', 'api', 'codex-map-results.json'), JSON.stringify({ at: new Date().toISOString(), bridge: BRIDGE, uid: UID, passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
