import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FastForward, Pause, Play } from 'lucide-react';
import { StarAwakening } from './StarAwakening';
import type { RoomShot } from '@/three/celestiaRoom';
import { loadCatalog } from '@/data/catalog';
import { useT } from '@/i18n';
import { useReducedMotionPref, ease } from '@/lib/motion';
import type { IntroLine, IntroScene, IntroScript } from '@/content/intro';

const CelestiaRoom = lazy(() => import('@/components/three/CelestiaRoom'));

const SHOT: Record<IntroScene, RoomShot> = { ascend: 'walk', throne: 'throne', bloom: 'bloom' };



const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s: string) => (segmenter ? [...segmenter.segment(s)].map((g) => g.segment) : [...s]);

/** Reveals text grapheme by grapheme (safe for Thai combining marks). */
function useTypewriter(text: string, speed: number, instant: boolean) {
  const parts = useMemo(() => graphemes(text), [text]);
  const [n, setN] = useState(instant ? parts.length : 0);
  useEffect(() => {
    if (instant) {
      setN(parts.length);
      return;
    }
    setN(0);
    const id = setInterval(() => setN((v) => (v >= parts.length ? v : v + 1)), speed);
    return () => clearInterval(id);
  }, [parts, speed, instant]);
  return { shown: parts.slice(0, n).join(''), done: n >= parts.length, finish: () => setN(parts.length) };
}

function Constellation({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 50" className={className} aria-hidden>
      <g stroke="#cfe4ff" strokeOpacity=".7" strokeWidth=".8" fill="none">
        <path d="M4 40 L22 30 L36 34 L52 14 L70 20" />
        <path d="M36 34 L44 46" />
      </g>
      {[
        [4, 40],
        [22, 30],
        [36, 34],
        [52, 14],
        [70, 20],
        [44, 46],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#fff" />
      ))}
    </svg>
  );
}

function Dialogue({ line, script, onTyped, typed, instant }: { line: IntroLine; script: IntroScript; onTyped: (done: boolean, finish: () => void) => void; typed: boolean; instant: boolean }) {
  const t = useT();
  const text = t.loc(line.text);
  const tw = useTypewriter(text, t.lang === 'th' ? 38 : 30, instant || typed);
  useEffect(() => onTyped(tw.done, tw.finish), [tw.done, tw.finish, onTyped]);
  const speaker = line.speaker ? script.speakers[line.speaker] : undefined;

  if (line.style === 'celestial') {
    return (
      <motion.div
        key={text}
        initial={{ opacity: 0, scale: 0.92, filter: 'blur(8px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
        transition={{ duration: 0.9, ease }}
        className="absolute top-[9%] left-1/2 w-[min(88vw,620px)] -translate-x-1/2"
      >
        <div className="relative px-12 py-7 text-center">
          <div className="absolute inset-0 rounded-[50%] bg-[radial-gradient(closest-side,rgba(38,58,138,0.95),rgba(30,40,110,0.75)_55%,transparent)] blur-[2px]" />
          <div className="absolute inset-0 rounded-[50%] bg-[radial-gradient(1px_1px_at_20%_30%,#fff,transparent),radial-gradient(1px_1px_at_70%_60%,#fff,transparent),radial-gradient(1.5px_1.5px_at_40%_75%,#dfe9ff,transparent),radial-gradient(1px_1px_at_82%_28%,#fff,transparent)] opacity-80" />
          <Constellation className="absolute top-1 left-[18%] h-10 w-16 opacity-80" />
          <p className="relative font-sans text-lg font-semibold tracking-wide text-white drop-shadow-[0_2px_8px_rgba(0,0,40,0.8)] md:text-xl">{tw.shown}&#8203;</p>
        </div>
      </motion.div>
    );
  }

  if (line.style === 'caption') {
    return (
      <motion.p
        key={text}
        initial={{ opacity: 0, y: 10, letterSpacing: '0.4em' }}
        animate={{ opacity: 1, y: 0, letterSpacing: '0.16em' }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 1.4, ease }}
        className="absolute top-1/2 left-1/2 w-[90vw] -translate-x-1/2 -translate-y-1/2 text-center font-display text-xl text-ivory/95 drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)] md:text-2xl"
      >
        {tw.shown}&#8203;
      </motion.p>
    );
  }

  return (
    <motion.div
      key={text}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.6, ease }}
      className="absolute bottom-[9%] left-1/2 w-[min(94vw,980px)] -translate-x-1/2 text-center"
    >
      <div className="absolute inset-x-[-10%] -inset-y-6 bg-[radial-gradient(ellipse_at_center,rgba(20,24,64,0.72),transparent_70%)]" />
      <Constellation className="absolute -top-3 left-[6%] h-12 w-20 opacity-70" />
      {speaker && (
        <div className="relative mb-1 flex items-center justify-center gap-3">
          <span className="h-px w-[min(22vw,240px)] bg-gradient-to-r from-transparent via-gold/70 to-gold" />
          <span className="text-gold-bright">✦</span>
          <span className="font-sans text-xl font-bold tracking-wide text-[#f6d98e] drop-shadow-[0_0_12px_rgba(246,217,142,0.6)]">{speaker.name}</span>
          <span className="text-gold-bright">✦</span>
          <span className="h-px w-[min(22vw,240px)] bg-gradient-to-l from-transparent via-gold/70 to-gold" />
        </div>
      )}
      {speaker && <div className="relative mb-2 text-sm text-ivory/85">{t.loc(speaker.title)}</div>}
      <p className="relative font-sans text-lg font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] md:text-2xl">{tw.shown}&#8203;</p>
    </motion.div>
  );
}

export function Intro({ script, onDone }: { script: IntroScript; onDone: () => void }) {
  const t = useT();
  const reduced = useReducedMotionPref();
  const [phase, setPhase] = useState<'veil' | 'play' | 'flash'>('veil');
  const [preludeDone, setPreludeDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (phase === 'veil' && preludeDone && loaded) setPhase('play');
  }, [phase, preludeDone, loaded]);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [typed, setTyped] = useState(false);
  // Dialogue waits for the loading veil to finish dissolving.
  const [stage, setStage] = useState(false);
  const [veilGone, setVeilGone] = useState(false);
  useEffect(() => {
    if (phase === 'veil') return;
    const id = setTimeout(() => setVeilGone(true), reduced ? 0 : 1900);
    return () => clearTimeout(id);
  }, [phase, reduced]);
  useEffect(() => {
    if (phase !== 'play') return;
    const id = setTimeout(() => setStage(true), reduced ? 0 : 1500);
    return () => clearTimeout(id);
  }, [phase, reduced]);
  const finishRef = useRef<() => void>(() => undefined);
  const line = script.lines[index];

  // Veil: preload the catalogs the first pages need, with a minimum cinematic duration.
  useEffect(() => {
    let alive = true;
    void import('@/components/three/CelestiaRoom'); // warm the 3D room chunk during the prelude
    const names = ['meta', 'characters', 'commands', 'weapons'] as const;
    let loaded = 0;
    const started = Date.now();
    Promise.all(names.map((n) => loadCatalog(n).catch(() => null).finally(() => alive && setProgress(++loaded / names.length)))).then(() => {
      const wait = Math.max(0, (reduced ? 300 : 1900) - (Date.now() - started));
      setTimeout(() => alive && setLoaded(true), wait);
    });
    return () => {
      alive = false;
    };
  }, [reduced]);

  useEffect(() => {
    if (phase === 'play' && line) {
      setTyped(false);
    }
  }, [phase, line]);

  const finish = useCallback(() => {
    setPhase('flash');
    setTimeout(onDone, reduced ? 50 : 1100);
  }, [onDone, reduced]);

  const advance = useCallback(() => {
    if (phase === 'veil') return;
    if (phase !== 'play' || !stage) return;
    if (!typed) {
      finishRef.current();
      return;
    }
    if (index + 1 < script.lines.length) setIndex(index + 1);
    else finish();
  }, [phase, stage, typed, index, script.lines.length, finish]);

  // Auto-advance after the line's hold once fully typed.
  useEffect(() => {
    if (phase !== 'play' || !stage || !typed || paused) return;
    const id = setTimeout(advance, line?.hold ?? 3500);
    return () => clearTimeout(id);
  }, [phase, typed, paused, advance, line]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, finish]);

  const onTyped = useCallback((done: boolean, f: () => void) => {
    finishRef.current = f;
    setTyped(done);
  }, []);


  return (
    <div className="fixed inset-0 z-[100] cursor-pointer select-none overflow-hidden bg-black" onClick={advance} role="dialog" aria-label="Intro">
      {/* the Celestia computing room — real 3D; mounts under the prelude so it is ready when the light clears */}
      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <CelestiaRoom shot={phase === 'play' && line ? SHOT[line.scene] : 'gate'} exposure={phase === 'play' && line?.scene === 'bloom' ? 1.9 : 1} />
        </Suspense>
      </div>


      {/* dialogue */}
      <AnimatePresence mode="wait">{phase === 'play' && stage && line && <Dialogue key={index} line={line} script={script} onTyped={onTyped} typed={false} instant={reduced} />}</AnimatePresence>

      {phase === 'play' && stage && typed && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute bottom-[3%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-sm font-semibold text-[#f6d98e] drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
          {t('intro.continue')}
          <span className="nk-bob mt-1 block h-2.5 w-2.5 border border-[#f6d98e]" />
        </motion.div>
      )}

      {/* game-style controls */}
      {phase === 'play' && (
        <div className="absolute top-5 left-5 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <button className="flex items-center gap-2 rounded-full bg-black/35 py-1.5 pr-3.5 pl-1.5 text-sm font-semibold text-white backdrop-blur" onClick={() => setPaused((p) => !p)} aria-label={paused ? t('intro.play') : t('intro.pause')}>
            <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#f6d98e] bg-black/40">{paused ? <Play size={13} /> : <Pause size={13} />}</span>
            {paused ? t('intro.paused') : t('intro.playing')}
          </button>
        </div>
      )}
      <button
        className="absolute top-5 right-5 flex items-center gap-2 rounded-full bg-black/35 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur transition-colors hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
      >
        {t('intro.skip')} <FastForward size={14} />
      </button>

      {/* prelude: the star awakening, ending in white light that clears onto the room */}
      {!veilGone && (
        <div className="absolute inset-0" style={{ opacity: phase === 'veil' ? 1 : 0, transition: `opacity ${reduced ? 0 : 1800}ms cubic-bezier(.22,1,.36,1)`, pointerEvents: phase === 'veil' ? 'auto' : 'none' }}>
          <StarAwakening reduced={reduced} onDone={() => setPreludeDone(true)} />
          {preludeDone && !loaded && <div className="absolute inset-x-0 bottom-10 text-center text-xs tracking-[0.3em] text-[#7a6a50] uppercase">{t.loc(script.chapter)} · {Math.round(progress * 100)}%</div>}
        </div>
      )}

      {/* white bloom into the console */}
      <AnimatePresence>
        {phase === 'flash' && <motion.div className="absolute inset-0 bg-[#fffaf0]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 1, ease }} />}
      </AnimatePresence>
      {line?.scene === 'bloom' && phase === 'play' && <motion.div className="pointer-events-none absolute inset-0 bg-[#fff6e0]" initial={{ opacity: 0 }} animate={{ opacity: 0.35 }} transition={{ duration: 4, ease }} />}
    </div>
  );
}
