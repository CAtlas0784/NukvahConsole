import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { MotionConfig } from 'motion/react';
import { AppShell } from '@/components/layout/AppShell';
import { CelestialBackdrop } from '@/components/fx/CelestialBackdrop';
import { Intro } from '@/features/intro/Intro';
import { shouldAutoPlay, useIntro } from '@/stores/intro';
import { installReactor } from '@/lib/reactor';
import { SkeletonGrid } from '@/components/ui/Primitives';
import { Gate } from '@/features/gate/Gate';
import { restoreSession, useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { useReducedMotionPref } from '@/lib/motion';

const Dashboard = lazy(() => import('@/features/dashboard/Dashboard'));
const SearchPage = lazy(() => import('@/features/search/SearchPage'));
const Characters = lazy(() => import('@/features/characters/Characters'));
const Builder = lazy(() => import('@/features/builder/Builder'));
const Inventory = lazy(() => import('@/features/inventory/Inventory'));
const Armory = lazy(() => import('@/features/armory/Armory'));
const World = lazy(() => import('@/features/world/World'));
const Commands = lazy(() => import('@/features/commands/Commands'));
const Presets = lazy(() => import('@/features/presets/Presets'));
const Settings = lazy(() => import('@/features/settings/Settings'));

function Page({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<SkeletonGrid count={8} />}>{children}</Suspense>;
}

export function App() {
  const mode = useSession((s) => s.mode);
  const lang = useSettings((s) => s.lang);
  const motionPref = useSettings((s) => s.motion);
  const ambient = useSettings((s) => s.ambient);
  const reduced = useReducedMotionPref();
  const [restoring, setRestoring] = useState(true);
  const introScript = useIntro((s) => s.script);
  const introDone = useIntro((s) => s.done);

  useEffect(() => {
    if (shouldAutoPlay()) useIntro.getState().play();
    return installReactor();
  }, []);

  useEffect(() => {
    restoreSession().finally(() => setRestoring(false));
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.motion = motionPref === 'system' ? '' : motionPref;
  }, [lang, motionPref]);

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      {ambient && <CelestialBackdrop />}
      {introScript && <Intro script={introScript} onDone={introDone} />}
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        {mode === 'gate' ? (
          restoring ? null : <Gate />
        ) : (
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Page><Dashboard /></Page>} />
              <Route path="search" element={<Page><SearchPage /></Page>} />
              <Route path="characters" element={<Page><Characters /></Page>} />
              <Route path="builder" element={<Page><Builder /></Page>} />
              <Route path="inventory" element={<Page><Inventory /></Page>} />
              <Route path="armory" element={<Page><Armory /></Page>} />
              <Route path="world" element={<Page><World /></Page>} />
              <Route path="commands" element={<Page><Commands /></Page>} />
              <Route path="presets" element={<Page><Presets /></Page>} />
              <Route path="settings" element={<Page><Settings /></Page>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        )}
      </BrowserRouter>
    </MotionConfig>
  );
}
