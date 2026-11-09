import { create } from 'zustand';
import { safeStorage } from '@/lib/storage';
import { useSettings } from './settings';
import { CURRENT_INTRO, type IntroScript } from '@/content/intro';

const session = safeStorage('session');
const PLAYED = 'nukva.introPlayed';

/** Decides whether the intro cinematic plays, and lets Settings replay it. */
export const useIntro = create<{ script: IntroScript | null; play: (script?: IntroScript) => void; done: () => void }>()((set, get) => ({
  script: null,
  play: (script = CURRENT_INTRO) => set({ script }),
  done: () => {
    const script = get().script;
    session.setItem(PLAYED, '1');
    if (script) useSettings.getState().set({ introSeen: script.version });
    set({ script: null });
  },
}));

export function shouldAutoPlay(script: IntroScript = CURRENT_INTRO): boolean {
  const { introMode, introSeen } = useSettings.getState();
  if (introMode === 'off') return false;
  if (introMode === 'version') return introSeen !== script.version;
  return session.getItem(PLAYED) !== '1';
}
