import { lazy, Suspense, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Link2, Loader2, Server, Sparkles, TriangleAlert } from 'lucide-react';
import { NukvahSigil } from '@/components/fx/NukvahSigil';

const ArmillaryBackdrop = lazy(() => import('@/components/three/ArmillaryBackdrop'));
const Crown3D = lazy(() => import('@/components/three/Crown3D'));
import { Motes } from '@/components/fx/Motes';
import { useT } from '@/i18n';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { api } from '@/api/nukva';
import { ApiError, DEFAULT_BASE_URL, normalizeBaseUrl, transportProblem } from '@/api/client';
import { ease } from '@/lib/motion';

const LETTERS = 'NUKVAH'.split('');

export function Gate() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const setSettings = useSettings((s) => s.set);
  const storedUrl = useSession((s) => s.baseUrl);
  const connect = useSession((s) => s.connect);
  const enterPreview = useSession((s) => s.enterPreview);

  const [url, setUrl] = useState(storedUrl);
  const [remember, setRemember] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'probe' | 'auth'>('idle');
  const [error, setError] = useState<string | null>(null);

  const origin = typeof location !== 'undefined' ? location.origin : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let base: string;
    try {
      base = normalizeBaseUrl(url);
    } catch {
      setError(t('gate.invalidUrl'));
      return;
    }
    const problem = transportProblem(base);
    if (problem === 'invalid-url') return setError(t('gate.invalidUrl'));
    if (problem === 'not-local') return setError(t('gate.notLocal'));
    try {
      setPhase('probe');
      await api.health({ baseUrl: base });
      setPhase('auth');
      await connect(base, remember);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ORIGIN_NOT_ALLOWED') setError(`${err.message} → allowedOrigins: "${origin}"`);
        else setError(`${err.code}: ${err.message}`);
      } else setError(String(err));
    } finally {
      setPhase('idle');
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Celestia's armillary turning in the dark sky (real 3D, lazy-loaded). */}
      <div className="absolute inset-0 bg-[#03040a]" aria-hidden>
        <Suspense fallback={null}>
          <ArmillaryBackdrop focus={0.15} />
        </Suspense>
      </div>
      <Motes count={40} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_55%_50%,transparent_20%,rgba(3,4,10,0.8)_85%),linear-gradient(90deg,rgba(3,4,10,0.78)_0%,rgba(3,4,10,0.35)_40%,rgba(3,4,10,0.2)_60%,rgba(3,4,10,0.7)_100%)]" aria-hidden />
      <motion.div className="pointer-events-none absolute inset-0 bg-[#fffaf0]" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.6, ease }} aria-hidden />

      <header className="relative z-10 flex items-center justify-between px-6 pt-6 md:px-10">
        <div className="eyebrow flex items-center gap-2 text-gold/80">
          <span className="h-1.5 w-1.5 rotate-45 bg-cyan shadow-[0_0_8px_#7ef0ff]" />
          SnezhnayaCore · 7.2
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setSettings({ lang: lang === 'en' ? 'th' : 'en' })}>
          {lang === 'en' ? 'ภาษาไทย' : 'English'}
        </button>
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-80px)] max-w-7xl items-center gap-12 px-6 pb-12 md:px-10 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Identity */}
        <section className="pt-10 lg:pt-0">
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.2, duration: 1.4, ease }} className="mb-3 -ml-10 h-[210px] w-[230px]">
            <Suspense fallback={<NukvahSigil size={150} body={false} className="mx-auto mt-6" />}>
              <Crown3D />
            </Suspense>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.9, ease }} className="eyebrow mb-6 flex items-center gap-3">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold" />
            {t('brand.secondary')}
          </motion.div>
          <h1 className="font-display text-[clamp(3.4rem,8.5vw,8.5rem)] leading-[0.9] font-semibold whitespace-nowrap" aria-label="Nukvah">
            {LETTERS.map((letter, i) => (
              <motion.span
                key={i}
                className="text-gilded inline-block"
                initial={{ opacity: 0, y: 40, filter: 'blur(12px)', letterSpacing: '0.5em' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)', letterSpacing: '0.08em' }}
                transition={{ delay: 0.45 + i * 0.12, duration: 1.1, ease }}
                aria-hidden
              >
                {letter}
              </motion.span>
            ))}
          </h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 1 }} className="mt-5 font-display text-xl tracking-[0.22em] text-ivory/90 uppercase md:text-2xl">
            {t('brand.tagline')}
          </motion.p>
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 1.6, duration: 1.2, ease }} className="rune-rule mt-8 max-w-md origin-left" />
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.9, duration: 1 }} className="mt-8 grid max-w-lg grid-cols-3 gap-4 text-xs text-mist">
            {[
              ['I', t('nav.search')],
              ['II', t('nav.characters')],
              ['III', t('nav.world')],
            ].map(([n, label]) => (
              <li key={n} className="border-l border-gold/30 pl-3">
                <div className="font-display text-gold">{n}</div>
                <div className="mt-1">{label}</div>
              </li>
            ))}
          </motion.ul>
        </section>

        {/* Link form */}
        <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.9, ease }} className="panel panel-corners tilt p-7 md:p-8" data-tilt-max="3">
          <div className="eyebrow mb-2 flex items-center gap-2">
            <Link2 size={13} /> {t('gate.eyebrow')}
          </div>
          <h2 className="title-display text-2xl">{t('gate.title')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">{t('gate.lead')}</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="gate-url">
                {t('gate.serverUrl')}
              </label>
              <div className="relative">
                <Server size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
                <input id="gate-url" className="field pl-9 font-mono text-sm" placeholder={DEFAULT_BASE_URL} value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="url" spellCheck={false} required />
              </div>
              <p className="mt-1.5 text-xs text-dim">{t('gate.serverUrlHint')}</p>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 accent-[#e2c27d]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>
                <span className="text-ivory">{t('gate.remember')}</span>
                <span className="block text-xs text-dim">{t('gate.rememberHint')}</span>
              </span>
            </label>

            {error && (
              <div role="alert" className="flex gap-2.5 rounded-xl border border-danger/30 bg-danger/[0.06] px-3.5 py-3 text-sm text-danger">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}

            <button className="btn btn-primary w-full py-3" type="submit" disabled={phase !== 'idle' || !url.trim()}>
              {phase !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {phase === 'probe' ? t('gate.checking') : phase === 'auth' ? t('gate.authenticating') : t('gate.connect')}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-[10px] tracking-[0.3em] text-dim uppercase">
            <span className="h-px flex-1 bg-line" />◆<span className="h-px flex-1 bg-line" />
          </div>

          <button className="btn btn-ghost w-full" onClick={enterPreview}>
            <Sparkles size={15} className="text-warn" />
            {t('gate.preview')}
          </button>
          <p className="mt-2 text-center text-xs text-dim">{t('gate.previewHint')}</p>
        </motion.section>
      </div>
      <footer className="relative z-10 pb-6 text-center text-[11px] text-dim">{t('gate.footnote')}</footer>
    </div>
  );
}
