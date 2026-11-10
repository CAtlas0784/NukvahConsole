import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, withIdempotency } from './client';
import { runOperation, useDataVersion } from '@/stores/ops';
import { ROUTES, ERROR_STATUS } from './generated';
import contract from '../../api/contract.json';

const conn = { baseUrl: 'http://127.0.0.1:8088' };
const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200 });
const keysOf = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers['Idempotency-Key']);

describe('duplicate-execution guard (client side)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stamps each write in an operation with its own derived key; reads get none', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok({})));
    vi.stubGlobal('fetch', fetchMock);
    await withIdempotency('op-test', async () => {
      await request(conn, 'GET', '/players/1/avatars');
      await request(conn, 'POST', '/players/1/avatars', {});
      await request(conn, 'PATCH', '/players/1/avatars/2', {});
    });
    expect(keysOf(fetchMock)).toEqual([undefined, 'op-test:0', 'op-test:1']);
  });

  it('a retry of the same operation sends the same keys (so the server can replay, not re-apply)', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('network down')).mockResolvedValue(ok({ added: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const run = () => request(conn, 'POST', '/players/1/items', { items: [{ itemId: 202, amount: 1 }] });
    await expect(withIdempotency('op-retry', run)).rejects.toMatchObject({ code: 'NETWORK' });
    await expect(withIdempotency('op-retry', run)).resolves.toEqual({ added: 1 });
    expect(keysOf(fetchMock)).toEqual(['op-retry:0', 'op-retry:0']);
  });

  it('writes outside an operation carry no key', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok({})));
    vi.stubGlobal('fetch', fetchMock);
    await request(conn, 'POST', '/x', {});
    expect(keysOf(fetchMock)).toEqual([undefined]);
  });
});

describe('errors keep the real reason', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exposes code, detail and partial data', async () => {
    const body = { ok: false, error: { code: 'INVALID_ARTIFACT_CONFIG', detail: 'SUBSTAT_EQUALS_MAIN', message: 'no' }, data: { created: [] } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })));
    const error = await request(conn, 'POST', '/players/1/artifacts', {}).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'INVALID_ARTIFACT_CONFIG', detail: 'SUBSTAT_EQUALS_MAIN', data: { created: [] } });
  });

  it('a failed operation is reported as failed, never success, and still triggers a refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: 'STATE_VERIFICATION_FAILED', message: 'read-back differs' } }), { status: 409 })),
    );
    const before = useDataVersion.getState().version;
    const outcome = await runOperation({
      action: 'test',
      uid: 1,
      summary: 'x',
      run: () => request(conn, 'POST', '/players/1/world-level', { worldLevel: 3 }),
      labels: { success: 'ok', failed: 'failed', partial: 'partial' },
    });
    expect(outcome.ok).toBe(false);
    expect((outcome.error as ApiError).code).toBe('STATE_VERIFICATION_FAILED');
    expect(useDataVersion.getState().version).toBe(before + 1);
  });

  it('a 200 response whose judged result is not a success is not reported as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ success: false, results: [{ success: false, verification: 'mismatch' }] })));
    const outcome = await runOperation({
      action: 'test',
      uid: 1,
      summary: 'x',
      run: () => request<{ success: boolean }>(conn, 'POST', '/players/1/items', {}),
      judge: (r) => ({ status: r.success ? 'success' : 'failed' }),
      labels: { success: 'ok', failed: 'failed', partial: 'partial' },
    });
    expect(outcome.ok).toBe(false);
  });
});

describe('API contract', () => {
  it('generated routes match api/contract.json', () => {
    expect(ROUTES.map((r) => `${r.method} ${r.path}`)).toEqual(contract.routes.map((r) => `${r.method} ${r.path}`));
  });
  it('every error code used by a route is defined', () => {
    for (const r of ROUTES) for (const code of r.errors ?? []) expect(ERROR_STATUS[code], `${r.path} ${code}`).toBeDefined();
  });
  it('the live server registers exactly the contract routes (when a snapshot exists)', async () => {
    const fs = await import('node:fs');
    const file = new URL('../../reports/api/routes.json', import.meta.url);
    if (!fs.existsSync(file)) return;
    const live = JSON.parse(fs.readFileSync(file, 'utf8')) as { method: string; path: string; role: string }[];
    const fromServer = live.map((r) => `${r.method} ${r.path.replace(/^\/nukva\/v1/, '')}`).sort();
    const inContract = ROUTES.filter((r) => r.path !== '/health').map((r) => `${r.method} ${r.path}`).sort();
    expect(fromServer).toEqual(inContract);
    for (const r of live) {
      const spec = ROUTES.find((x) => x.method === r.method && `/nukva/v1${x.path}` === r.path);
      expect(spec?.role, r.path).toBe(r.role);
    }
  });
});
