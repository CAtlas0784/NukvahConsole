import { useEffect, useState } from 'react';
import { useSettings } from '@/stores/settings';

/** Combines the OS preference with the in-app override (Settings → Motion). */
export function useReducedMotionPref(): boolean {
  const pref = useSettings((s) => s.motion);
  const [system, setSystem] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setSystem(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return pref === 'reduced' || (pref === 'system' && system);
}

export const ease = [0.22, 1, 0.36, 1] as const;
