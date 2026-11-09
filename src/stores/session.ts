import { create } from 'zustand';
import { api, CAPABILITY_ROLE, ROLE_RANK, type Capability, type Role, type ServerStatus } from '@/api/nukva';
import { ApiError, DEFAULT_BASE_URL, normalizeBaseUrl, type Connection } from '@/api/client';
import { safeStorage } from '@/lib/storage';
import { DEMO_UID } from '@/data/demo';

export type Mode = 'gate' | 'preview' | 'connected';

interface SessionState {
  mode: Mode;
  baseUrl: string;
  status: ServerStatus | null;
  uid: number | null;
  connecting: boolean;
  connect: (baseUrl: string, remember: boolean) => Promise<void>;
  refreshStatus: () => Promise<void>;
  enterPreview: () => void;
  disconnect: () => void;
  setUid: (uid: number | null) => void;
}

const local = safeStorage('local');
const session = safeStorage('session');
const LAST_URL = 'nukva.lastUrl';
const LINK = 'nukva.link';
const UID = 'nukva.uid';
const PREVIEW = 'nukva.preview';

function readLink(): { baseUrl: string } | null {
  try {
    const raw = session.getItem(LINK);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { baseUrl?: string };
    return parsed.baseUrl ? { baseUrl: parsed.baseUrl } : null;
  } catch {
    return null;
  }
}

const storedUid = Number(local.getItem(UID));

export const useSession = create<SessionState>()((set, get) => ({
  mode: 'gate',
  baseUrl: local.getItem(LAST_URL) ?? ((import.meta.env.VITE_DEFAULT_API_URL as string | undefined) || DEFAULT_BASE_URL),
  status: null,
  uid: Number.isFinite(storedUid) && storedUid > 0 ? storedUid : null,
  connecting: false,

  async connect(rawUrl, remember) {
    const baseUrl = normalizeBaseUrl(rawUrl);
    set({ connecting: true });
    try {
      const status = await api.status({ baseUrl });
      local.setItem(LAST_URL, baseUrl);
      if (remember) session.setItem(LINK, JSON.stringify({ baseUrl }));
      else session.removeItem(LINK);
      session.removeItem(PREVIEW);
      set({ mode: 'connected', baseUrl, status, connecting: false });
    } catch (error) {
      set({ connecting: false });
      throw error;
    }
  },

  async refreshStatus() {
    const { baseUrl, mode } = get();
    if (mode !== 'connected') return;
    try {
      const status = await api.status({ baseUrl });
      set({ status });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'LOCAL_ONLY') get().disconnect();
      throw error;
    }
  },

  enterPreview() {
    session.setItem(PREVIEW, '1');
    set({ mode: 'preview', status: null, uid: DEMO_UID });
  },

  disconnect() {
    session.removeItem(LINK);
    session.removeItem(PREVIEW);
    const stored = Number(local.getItem(UID));
    set({ mode: 'gate', status: null, uid: Number.isFinite(stored) && stored > 0 ? stored : null });
  },

  setUid(uid) {
    if (get().mode === 'preview') return set({ uid });
    if (uid) local.setItem(UID, String(uid));
    else local.removeItem(UID);
    set({ uid });
  },
}));

/** Restores a tab-scoped link (sessionStorage) on load. */
export async function restoreSession(): Promise<void> {
  if (session.getItem(PREVIEW) === '1') {
    useSession.getState().enterPreview();
    return;
  }
  const link = readLink();
  if (!link) return;
  try {
    await useSession.getState().connect(link.baseUrl, true);
  } catch {
    session.removeItem(LINK);
  }
}

export function useConnection(): Connection | null {
  const mode = useSession((s) => s.mode);
  const baseUrl = useSession((s) => s.baseUrl);
  return mode === 'connected' ? { baseUrl } : null;
}

export type Denial = 'preview' | 'disconnected' | 'unsupported' | 'role' | null;

/** Whether the current link may use a capability, and if not, why. */
export function useCapability(cap: Capability): { allowed: boolean; reason: Denial; role: Role | null } {
  const mode = useSession((s) => s.mode);
  const status = useSession((s) => s.status);
  if (mode === 'preview') return { allowed: false, reason: 'preview', role: null };
  if (mode !== 'connected' || !status) return { allowed: false, reason: 'disconnected', role: null };
  if (!status.capabilities.includes(cap)) return { allowed: false, reason: 'unsupported', role: status.role };
  const need = CAPABILITY_ROLE[cap];
  if (need && ROLE_RANK[status.role] < ROLE_RANK[need]) return { allowed: false, reason: 'role', role: status.role };
  return { allowed: true, reason: null, role: status.role };
}
