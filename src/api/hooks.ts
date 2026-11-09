import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AuditEntry, type OnlinePlayer, type OwnedAvatar, type PlayerSummary } from './nukva';
import type { Connection } from './client';
import { useConnection, useSession } from '@/stores/session';
import { demoAudit, demoAvatars, demoPlayer, demoPlayers, DEMO_UID } from '@/data/demo';
import type { CommandInfo } from '@/data/types';

export interface Live<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  /** True when the data is simulated preview data. */
  simulated: boolean;
  refresh: () => void;
  set: (value: T) => void;
}

/**
 * Fetches live data when linked, returns the simulated value in preview mode, and nothing when
 * disconnected. Refreshes when the connection or dependencies change.
 */
function useLive<T>(fetcher: ((c: Connection) => Promise<T>) | null, preview: T | undefined, deps: unknown[]): Live<T> {
  const conn = useConnection();
  const mode = useSession((s) => s.mode);
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: false });
  const [tick, setTick] = useState(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    if (mode !== 'connected' || !conn || !fetchRef.current) {
      setState({ loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ data: s.data, loading: true }));
    fetchRef.current(conn).then(
      (data) => alive && setState({ data, loading: false }),
      (error) => alive && setState({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, conn?.baseUrl, conn?.token, tick, ...deps]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const set = useCallback((value: T) => setState({ data: value, loading: false }), []);

  if (mode === 'preview') return { data: preview, error: undefined, loading: false, simulated: true, refresh, set };
  return { data: state.data, error: state.error, loading: state.loading, simulated: false, refresh, set };
}

export function useOnlinePlayers(): Live<OnlinePlayer[]> {
  return useLive((c) => api.players(c), demoPlayers, []);
}

export function usePlayer(uid: number | null): Live<PlayerSummary> {
  return useLive(uid ? (c) => api.player(c, uid) : null, uid === DEMO_UID ? demoPlayer : undefined, [uid]);
}

export function useAvatars(uid: number | null): Live<OwnedAvatar[]> {
  return useLive(uid ? (c) => api.avatars(c, uid) : null, uid === DEMO_UID ? demoAvatars : undefined, [uid]);
}

export function useAudit(limit = 20): Live<AuditEntry[]> {
  return useLive((c) => api.audit(c, limit), demoAudit, [limit]);
}

export function useLiveCommands(): Live<CommandInfo[]> {
  return useLive((c) => api.commands(c), undefined, []);
}

export function useInventory(uid: number | null, enabled = true): Live<import('./nukva').InventoryItem[]> {
  return useLive(uid && enabled ? (c) => api.inventory(c, uid) : null, undefined, [uid, enabled]);
}
