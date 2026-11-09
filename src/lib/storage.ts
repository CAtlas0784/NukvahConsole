/** Storage that never throws (private windows, blocked site data) and degrades to memory. */
const memory = new Map<string, string>();

export function safeStorage(kind: 'local' | 'session'): Storage {
  const backing = (): Storage | null => {
    try {
      return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    get length() {
      return backing()?.length ?? memory.size;
    },
    clear() {
      try {
        backing()?.clear();
      } catch {
        memory.clear();
      }
    },
    getItem(key) {
      try {
        const s = backing();
        return s ? s.getItem(key) : (memory.get(key) ?? null);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    key(index) {
      try {
        return backing()?.key(index) ?? null;
      } catch {
        return null;
      }
    },
    removeItem(key) {
      try {
        backing()?.removeItem(key);
      } catch {
        // ignore
      }
      memory.delete(key);
    },
    setItem(key, value) {
      try {
        const s = backing();
        if (s) s.setItem(key, value);
        else memory.set(key, value);
      } catch {
        memory.set(key, value);
      }
    },
  };
}
