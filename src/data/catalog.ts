import { useEffect, useState } from 'react';
import type { CatalogFiles, CatalogName } from './types';

const cache = new Map<CatalogName, Promise<unknown>>();
const resolved = new Map<CatalogName, unknown>();

/** Loads one generated catalog file (cached for the session). */
export function loadCatalog<K extends CatalogName>(name: K): Promise<CatalogFiles[K]> {
  let pending = cache.get(name) as Promise<CatalogFiles[K]> | undefined;
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/${name}.json`, { credentials: 'omit' })
      .then((res) => {
        if (!res.ok) throw new Error(`Catalog "${name}" could not be loaded (HTTP ${res.status}).`);
        return res.json() as Promise<CatalogFiles[K]>;
      })
      .then((data) => {
        resolved.set(name, data);
        return data;
      })
      .catch((error) => {
        cache.delete(name);
        throw error;
      });
    cache.set(name, pending);
  }
  return pending;
}

export interface CatalogState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  retry: () => void;
}

export function useCatalog<K extends CatalogName>(name: K): CatalogState<CatalogFiles[K]> {
  const [state, setState] = useState<{ data?: CatalogFiles[K]; error?: Error }>(() => ({
    data: resolved.get(name) as CatalogFiles[K] | undefined,
  }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (resolved.has(name)) {
      setState({ data: resolved.get(name) as CatalogFiles[K] });
      return;
    }
    let alive = true;
    loadCatalog(name).then(
      (data) => alive && setState({ data }),
      (error: Error) => alive && setState({ error }),
    );
    return () => {
      alive = false;
    };
  }, [name, attempt]);

  return {
    data: state.data,
    error: state.error,
    loading: !state.data && !state.error,
    retry: () => {
      setState({});
      setAttempt((a) => a + 1);
    },
  };
}

/** Builds an id → entry lookup once per array instance. */
const indexCache = new WeakMap<object, Map<number, unknown>>();
export function byId<T extends { id: number }>(list: T[] | undefined): Map<number, T> {
  if (!list) return new Map();
  let map = indexCache.get(list) as Map<number, T> | undefined;
  if (!map) {
    map = new Map(list.map((x) => [x.id, x]));
    indexCache.set(list, map);
  }
  return map;
}
