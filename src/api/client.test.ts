import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, normalizeBaseUrl, request, transportProblem } from './client';

describe('normalizeBaseUrl', () => {
  it('adds a scheme, strips trailing slashes and a pasted API prefix', () => {
    expect(normalizeBaseUrl('127.0.0.1:8088/')).toBe('http://127.0.0.1:8088');
    expect(normalizeBaseUrl('localhost:8088')).toBe('http://localhost:8088');
    expect(normalizeBaseUrl('http://127.0.0.1:8088/nukva/v1/')).toBe('http://127.0.0.1:8088');
    expect(normalizeBaseUrl('host.ts.net/')).toBe('https://host.ts.net');
  });
});

describe('transportProblem', () => {
  it('accepts only loopback addresses', () => {
    expect(transportProblem('http://127.0.0.1:8088')).toBeNull();
    expect(transportProblem('http://localhost:8088')).toBeNull();
    expect(transportProblem('http://[::1]:8088')).toBeNull();
    expect(transportProblem('http://192.168.1.5:8088')).toBe('not-local');
    expect(transportProblem('https://host.ts.net')).toBe('not-local');
    expect(transportProblem('ftp://127.0.0.1')).toBe('invalid-url');
  });
});

describe('request', () => {
  afterEach(() => vi.unstubAllGlobals());
  const conn = { baseUrl: 'http://127.0.0.1:8088' };

  it('sends no credentials and unwraps data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { a: 1 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request(conn, 'GET', '/status')).resolves.toEqual({ a: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8088/nukva/v1/status');
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.credentials).toBe('omit');
  });

  it('turns error envelopes into ApiError with the server code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: 'LOCAL_ONLY', message: 'no' } }), { status: 403 })));
    await expect(request(conn, 'POST', '/x', {})).rejects.toMatchObject({ status: 403, code: 'LOCAL_ONLY' });
  });

  it('never treats a non-envelope 200 as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
    await expect(request(conn, 'GET', '/status')).rejects.toBeInstanceOf(ApiError);
  });

  it('reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(request(conn, 'GET', '/status')).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
