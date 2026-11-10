import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';

/** Per-browser spawner conveniences: favourite and recently given item ids (newest first). */
interface SpawnerState {
  favorites: number[];
  recent: number[];
  toggleFavorite: (id: number) => void;
  pushRecent: (ids: number[]) => void;
  clearRecent: () => void;
}

export const RECENT_MAX = 40;

export const useSpawner = create<SpawnerState>()(
  persist(
    (set) => ({
      favorites: [],
      recent: [],
      toggleFavorite: (id) => set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [id, ...s.favorites].slice(0, 500) })),
      pushRecent: (ids) => set((s) => ({ recent: [...new Set([...ids, ...s.recent])].slice(0, RECENT_MAX) })),
      clearRecent: () => set({ recent: [] }),
    }),
    { name: 'nukva.spawner', storage: createJSONStorage(() => safeStorage('local')), version: 1 },
  ),
);
