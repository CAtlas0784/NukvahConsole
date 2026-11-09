import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, normalizeBaseUrl, request, transportProblem } from './client';

describe('normalizeBaseUrl', () => {
  it('adds https, strips trailing slashes and a pasted API prefix', () => {
    expect(normalizeBaseUrl('host.ts.net/')).toBe('https://host.ts.net');
    expect(normalizeBaseUrl('https://host.ts.net/nukva/v1/')).toBe('https://host.ts.net');
    expect(normalizeBaseUrl('http://127.0.0.1:443')).toBe('http://127.0.0.1:443');
  });
});

describe('transportProblem', () => {
  it('flags mixed content except for loopback', () => {
    expect(transportProblem('http://example.com', 'https:')).toBe('mixed-content');
    expect(transportProblem('http://localhost:443', 'https:')).toBeNull();
    expect(transportProblem('https://example.com', 'https:')).toBeNull();
    expect(transportProblem('ftp://x', 'https:')).toBe('invalid-url');
  });
});

describe('request', () => {
  afterEach(() => vi.unstubAllGlobals());
  const conn = { baseUrl: 'https://srv', token: 'secret-token-value-123456' };

  it('sends the bearer token and unwraps data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { a: 1 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request(conn, 'GET', '/status')).resolves.toEqual({ a: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://srv/nukva/v1/status');
    expect(init.headers.Authorization).toBe(`Bearer ${conn.token}`);
    expect(init.credentials).toBe('omit');
  });

  it('turns error envelopes into ApiError with the server code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: 'FORBIDDEN', message: 'no' } }), { status: 403 })));
    await expect(request(conn, 'POST', '/x', {})).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
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
