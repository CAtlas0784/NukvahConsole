import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';

export type Lang = 'en' | 'th';
export type MotionPref = 'system' | 'reduced' | 'full';
export type IntroMode = 'session' | 'version' | 'off';

interface SettingsState {
  lang: Lang;
  motion: MotionPref;
  ambient: boolean;
  assetBase: string;
  introMode: IntroMode;
  /** Last intro version watched (for introMode 'version'). */
  introSeen: string;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

const defaultLang: Lang = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('th') ? 'th' : 'en';

/** Local icon cache served by the dev/preview server (see `npm run assets`). */
export const LOCAL_ASSET_BASE = `${import.meta.env.BASE_URL ?? '/'}game-assets`;

/**
 * Where artwork is loaded from: the operator's own URL when set in Settings, otherwise the local
 * cache. A missing image falls back to the generated sigil, so a build without the cache still works.
 */
export const useAssetBase = () => useSettings((s) => s.assetBase || LOCAL_ASSET_BASE);

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: defaultLang,
      motion: 'system',
      ambient: true,
      assetBase: (import.meta.env.VITE_ASSET_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '',
      introMode: 'session',
      introSeen: '',
      set: (patch) => set(patch),
    }),
    { name: 'nukva.settings', storage: createJSONStorage(() => safeStorage('local')), version: 1 },
  ),
);
