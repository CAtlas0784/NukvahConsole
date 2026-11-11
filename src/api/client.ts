/**
 * Minimal HTTP client for the Nukvah bridge (/nukva/v1 on the SnezhnayaCore HTTP listener).
 * Every response is either { ok: true, data } or { ok: false, error: { code, message } }.
 */

/** The bridge is local-only (no tokens): a connection is just the server's loopback address. */
export interface Connection {
  baseUrl: string;
}

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8088';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** Finer reason inside the code (e.g. INVALID_ARTIFACT_CONFIG / SUBSTAT_EQUALS_MAIN). */
    public readonly detail?: string,
    /** State the server read back or partially applied before failing. */
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Duplicate-execution guard. Inside withIdempotency(base, fn), every write that fn starts carries an
 * Idempotency-Key header `${base}:${n}` (n counts the writes in order). Retrying the same operation
 * with the same base after a dropped connection makes the server answer from its stored result
 * instead of applying the change again.
 */
let idempotencyScope: { base: string; n: number } | null = null;

export function newOperationKey(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Math.random().toString(36).slice(2)}${Date.now()}`;
  return `op-${rand}`;
}

export async function withIdempotency<T>(base: string, fn: () => Promise<T>): Promise<T> {
  const previous = idempotencyScope;
  idempotencyScope = { base, n: 0 };
  try {
    return await fn();
  } finally {
    idempotencyScope = previous;
  }
}

export const API_PREFIX = '/nukva/v1';
const TIMEOUT_MS = 20_000;

export function normalizeBaseUrl(input: string): string {
  let value = input.trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `${/^(localhost|127\.|\[::1\])/i.test(value) ? 'http' : 'https'}://${value}`;
  const url = new URL(value);
  // Accept a pasted ".../nukva/v1" URL as well.
  const pathname = url.pathname.replace(/\/+$/, '').replace(/\/nukva\/v1$/i, '');
  return `${url.protocol}//${url.host}${pathname}`;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Explains why a browser would refuse to talk to this URL from the current page, if it would. */
export function transportProblem(baseUrl: string): 'invalid-url' | 'not-local' | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return 'invalid-url';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'invalid-url';
  // The bridge refuses anything that does not arrive on this machine's loopback interface.
  // (Browsers exempt loopback from mixed-content blocking, so an https page may still call it.)
  if (!LOCAL_HOSTS.has(url.hostname)) return 'not-local';
  return null;
}

export async function request<T>(
  conn: Connection,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  // Read the scope synchronously, before the first await, so each write gets its own key.
  const idempotencyKey = method !== 'GET' && idempotencyScope ? `${idempotencyScope.base}:${idempotencyScope.n++}` : undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });

  let response: Response;
  try {
    response = await fetch(`${conn.baseUrl}${API_PREFIX}${path}`, {
      method,
      mode: 'cors',
      ...(transportProblem(conn.baseUrl) === null ? { targetAddressSpace: 'loopback' } : {}),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted)
      throw new ApiError(0, 'TIMEOUT', 'The server did not respond in time. The change may still have been applied: refresh before retrying.');
    if (signal?.aborted) throw new ApiError(0, 'ABORTED', 'Request cancelled.');
    throw new ApiError(
      0,
      'NETWORK',
      'Could not reach the server. Check that SnezhnayaCore is running, the port is right, and this page origin is in nukva.json allowedOrigins.',
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // fall through
  }
  const envelope = payload as { ok?: boolean; data?: T; error?: { code?: string; detail?: string; message?: string } } | null;
  if (response.ok && envelope?.ok === true) return envelope.data as T;
  if (envelope && envelope.ok === false && envelope.error) {
    throw new ApiError(response.status, envelope.error.code ?? 'ERROR', envelope.error.message ?? 'Request failed.', envelope.error.detail, envelope.data);
  }
  if (response.status === 404) {
    throw new ApiError(404, 'BRIDGE_NOT_FOUND', 'No Nukvah bridge at this address (is it enabled in nukva.json?).');
  }
  throw new ApiError(response.status, 'UNEXPECTED_RESPONSE', `Unexpected response (HTTP ${response.status}).`);
}
