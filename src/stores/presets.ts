import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';
import type { Preset } from '@/lib/presets';

export interface Bookmark {
  id: string;
  name: string;
  sceneId: number;
  x: number;
  y: number;
  z: number;
}

interface PresetState {
  presets: Preset[];
  bookmarks: Bookmark[];
  add: (preset: Omit<Preset, 'id' | 'createdAt'>) => void;
  addMany: (presets: Preset[]) => void;
  remove: (id: string) => void;
  addBookmark: (b: Omit<Bookmark, 'id'>) => void;
  removeBookmark: (id: string) => void;
}

export const usePresets = create<PresetState>()(
  persist(
    (set) => ({
      presets: [],
      bookmarks: [],
      add: (preset) =>
        set((s) => ({ presets: [{ ...preset, id: crypto.randomUUID(), createdAt: Date.now() } as Preset, ...s.presets] })),
      addMany: (presets) => set((s) => ({ presets: [...presets, ...s.presets] })),
      remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
      addBookmark: (b) => set((s) => ({ bookmarks: [{ ...b, id: crypto.randomUUID() }, ...s.bookmarks].slice(0, 100) })),
      removeBookmark: (id) => set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),
    }),
    { name: 'nukva.presets', storage: createJSONStorage(() => safeStorage('local')), version: 1 },
  ),
);
