import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';

export type Lang = 'en' | 'th';
export type MotionPref = 'system' | 'reduced' | 'full';

interface SettingsState {
  lang: Lang;
  motion: MotionPref;
  ambient: boolean;
  assetBase: string;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

const defaultLang: Lang = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('th') ? 'th' : 'en';

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: defaultLang,
      motion: 'system',
      ambient: true,
      assetBase: (import.meta.env.VITE_ASSET_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '',
      set: (patch) => set(patch),
    }),
    { name: 'nukva.settings', storage: createJSONStorage(() => safeStorage('local')), version: 1 },
  ),
);
