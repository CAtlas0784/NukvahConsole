import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';
import { ApiError, newOperationKey, withIdempotency } from '@/api/client';

export type OpStatus = 'success' | 'failed' | 'partial';

export interface OpRecord {
  id: string;
  ts: number;
  action: string;
  uid: number | null;
  summary: string;
  status: OpStatus;
  detail: string;
}

interface OpsState {
  history: OpRecord[];
  push: (record: Omit<OpRecord, 'id' | 'ts'>) => void;
  clear: () => void;
}

export const useOps = create<OpsState>()(
  persist(
    (set) => ({
      history: [],
      push: (record) =>
        set((s) => ({
          history: [{ ...record, id: crypto.randomUUID(), ts: Date.now() }, ...s.history].slice(0, 200),
        })),
      clear: () => set({ history: [] }),
    }),
    { name: 'nukva.history', storage: createJSONStorage(() => safeStorage('local')), version: 1 },
  ),
);

export interface Toast {
  id: string;
  tone: 'success' | 'error' | 'info' | 'warn';
  title: string;
  body?: string;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  show(toast) {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }));
    setTimeout(() => get().dismiss(id), toast.tone === 'error' ? 9000 : 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Bumped after every write attempt, successful or not. Every live data hook re-reads the server
 * when it changes, so the screen always shows the server's state after an operation (a failed
 * or partial write may still have changed something).
 */
export const useDataVersion = create<{ version: number; bump: () => void }>()((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return `${error.code}${error.detail ? ` (${error.detail})` : ''}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Runs a write operation and records the outcome. `judge` inspects the server's confirmation; a
 * result is only reported as success when the server confirmed it.
 */
export async function runOperation<T>(opts: {
  action: string;
  uid: number | null;
  summary: string;
  run: () => Promise<T>;
  judge?: (result: T) => { status: OpStatus; detail?: string };
  labels: { success: string; failed: string; partial: string };
  /** Reuse the same key when the user retries the same operation (see withIdempotency). */
  idempotencyKey?: string;
}): Promise<{ ok: boolean; result?: T; error?: unknown }> {
  const { push } = useOps.getState();
  const { show } = useToasts.getState();
  try {
    const result = await withIdempotency(opts.idempotencyKey ?? newOperationKey(), opts.run);
    const verdict = opts.judge ? opts.judge(result) : { status: 'success' as const };
    push({ action: opts.action, uid: opts.uid, summary: opts.summary, status: verdict.status, detail: verdict.detail ?? '' });
    show({
      tone: verdict.status === 'success' ? 'success' : verdict.status === 'partial' ? 'warn' : 'error',
      title: verdict.status === 'success' ? opts.labels.success : verdict.status === 'partial' ? opts.labels.partial : opts.labels.failed,
      body: verdict.detail ? `${opts.summary} — ${verdict.detail}` : opts.summary,
    });
    return { ok: verdict.status === 'success', result };
  } catch (error) {
    const detail = describeError(error);
    push({ action: opts.action, uid: opts.uid, summary: opts.summary, status: 'failed', detail });
    show({ tone: 'error', title: opts.labels.failed, body: detail });
    return { ok: false, error };
  } finally {
    useDataVersion.getState().bump();
  }
}
