import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Rune } from '@/components/fx/Runes';
import { ease } from '@/lib/motion';

/**
 * Prelude before the Celestia computing room: a star ignites in the dark, becomes a rune star,
 * calls a constellation of runes, binds them with three circles, then flares and rushes forward
 * into white-gold light. ~9.5 s; click/Enter skips to the end.
 */

// Timeline (ms): each stage starts at its time.
const STAGES = [0, 1300, 2700, 4500, 6000, 7600, 8700] as const;
// 0 spark · 1 rune star · 2 constellation · 3 circles · 4 warp flare · 5 burst · 6 done

const CONSTELLATION: { x: number; y: number; rune: number; s: number }[] = [
  { x: -14, y: -24, rune: 0, s: 1 },
  { x: -5, y: -12, rune: 2, s: 0.85 },
  { x: 2, y: -32, rune: 3, s: 1 },
  { x: 12, y: -10, rune: 5, s: 0.9 },
  { x: -9, y: 8, rune: 1, s: 0.8 },
  { x: 6, y: 12, rune: 4, s: 0.85 },
];

function Flare({ size, color = '#ffffff', className = '' }: { size: number; color?: string; className?: string }) {
  return (
    <svg viewBox="-100 -100 200 200" width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id="fl-core">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.25" stopColor="#e9f3ff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#9cc3ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="38" fill="url(#fl-core)" />
      <path d="M0 -100 L 5 -5 L 100 0 L 5 5 L 0 100 L -5 5 L -100 0 L -5 -5 Z" fill={color} opacity="0.95" />
      <path d="M0 -55 L 3 -3 L 55 0 L 3 3 L 0 55 L -3 3 L -55 0 L -3 -3 Z" fill="#fff" transform="rotate(45)" opacity="0.5" />
    </svg>
  );
}

/** Canvas layer: rising dashed light lines, and radial warp streaks during the flare. */
function Streaks({ stage }: { stage: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
    };
    resize();
    const lines = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), len: 0.05 + Math.random() * 0.25, v: 0.0006 + Math.random() * 0.0016, a: 0.2 + Math.random() * 0.6, dash: Math.random() > 0.5 }));
    const rays = Array.from({ length: 140 }, () => ({ ang: Math.random() * Math.PI * 2, r: Math.random(), v: 0.006 + Math.random() * 0.02, hue: Math.random() }));
    let raf = 0;
    const tick = () => {
      const st = stageRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (st >= 2 && st <= 5) {
        for (const l of lines) {
          l.y -= l.v * (st >= 4 ? 4 : 1);
          if (l.y + l.len < 0) {
            l.y = 1;
            l.x = Math.random();
          }
          ctx.strokeStyle = `rgba(225,235,255,${l.a * (st >= 4 ? 1 : 0.6)})`;
          ctx.lineWidth = st >= 4 ? 3 : 1.4;
          ctx.setLineDash(l.dash ? [6, 8] : []);
          ctx.beginPath();
          ctx.moveTo(l.x * w, l.y * h);
          ctx.lineTo(l.x * w, (l.y + l.len) * h);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      if (st >= 4 && st <= 5) {
        const cx = w / 2;
        const cy = h * 0.45;
        const max = Math.hypot(w, h) * 0.6;
        for (const r of rays) {
          r.r += r.v * (st === 5 ? 2.2 : 1);
          if (r.r > 1) {
            r.r = 0.05;
            r.ang = Math.random() * Math.PI * 2;
          }
          const r0 = r.r * max;
          const r1 = r0 + 40 + r.r * 160;
          const col = r.hue > 0.85 ? '255,170,200' : r.hue > 0.7 ? '170,220,255' : r.hue > 0.6 ? '255,230,160' : '255,255,255';
          ctx.strokeStyle = `rgba(${col},${0.25 + r.r * 0.6})`;
          ctx.lineWidth = 1 + r.r * 4;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(r.ang) * r0, cy + Math.sin(r.ang) * r0);
          ctx.lineTo(cx + Math.cos(r.ang) * r1, cy + Math.sin(r.ang) * r1);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />;
}

export function StarAwakening({ onDone, reduced }: { onDone: () => void; reduced: boolean }) {
  const [stage, setStage] = useState(reduced ? 6 : 0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (reduced) {
      doneRef.current();
      return;
    }
    const timers = STAGES.map((at, i) => setTimeout(() => setStage(i), at));
    timers.push(setTimeout(() => doneRef.current(), STAGES[6] + 300));
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  const skip = () => {
    setStage(6);
    doneRef.current();
  };

  const vmin = Math.min(window.innerWidth, window.innerHeight);
  const unit = vmin / 100;

  return (
    <div className="absolute inset-0 z-20 overflow-hidden" onClick={(e) => (e.stopPropagation(), skip())} role="presentation">
      {/* sky: black → deep navy with a rising horizon glow */}
      <div className="absolute inset-0 bg-black" />
      <div
        className="absolute inset-0 transition-opacity duration-[1600ms]"
        style={{
          opacity: stage >= 2 ? 1 : 0,
          background: 'radial-gradient(120% 70% at 50% 120%, rgba(150,160,255,0.55), transparent 60%), linear-gradient(180deg, #121a33 0%, #1d2a52 55%, #3a3f7a 100%)',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.75)_100%)]" style={{ opacity: stage >= 4 ? 0 : 1, transition: 'opacity 1s' }} />
      <Streaks stage={stage} />

      {/* 0–1: the spark, then the rune star */}
      <AnimatePresence>
        {stage <= 2 && (
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            initial={{ scale: 0.05, opacity: 0 }}
            animate={{ scale: stage === 0 ? 0.35 : 1, opacity: 1, y: stage === 2 ? -unit * 14 : 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 1.2, ease }}
          >
            <div className="absolute top-1/2 left-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(220,230,255,0.45),rgba(150,180,255,0.12)_55%,transparent)]" />
            <Flare size={unit * 36} className="relative" />
            {stage >= 1 && (
              <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease }}>
                <Rune index={3} size={unit * 7} />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2–3: the constellation of rune stars, then the three circles */}
      <AnimatePresence>
        {stage >= 2 && stage <= 4 && (
          <motion.div className="absolute top-1/2 left-1/2" exit={{ opacity: 0, scale: 1.6 }} transition={{ duration: 0.8, ease }}>
            {CONSTELLATION.map((s, i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{ left: s.x * unit, top: s.y * unit }}
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: 1, scale: s.s }}
                transition={{ delay: 0.15 * i, duration: 0.9, ease }}
              >
                <div className="relative -translate-x-1/2 -translate-y-1/2">
                  <Flare size={unit * 9} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-80" />
                  <Rune index={s.rune} size={unit * 4.4} className="relative" />
                </div>
              </motion.div>
            ))}
            {/* vertical axis */}
            <motion.div className="absolute w-px bg-gradient-to-b from-transparent via-white/80 to-transparent" style={{ left: 0, top: -unit * 45, height: unit * 90 }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.6, duration: 1.2, ease }} />
            {stage >= 3 && (
              <svg className="absolute overflow-visible" style={{ left: 0, top: 0 }} width="1" height="1" aria-hidden>
                {[
                  [0, -unit * 16],
                  [-unit * 11, unit * 3],
                  [unit * 11, unit * 3],
                ].map(([cx, cy], i) => (
                  <motion.circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={unit * 15}
                    fill="none"
                    stroke="rgba(235,240,255,0.85)"
                    strokeWidth={2}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: i * 0.18, duration: 1.1, ease }}
                    style={{ filter: 'drop-shadow(0 0 6px rgba(200,220,255,0.9))' }}
                  />
                ))}
              </svg>
            )}
            {stage >= 3 && (
              <motion.div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: 0, top: -unit * 4 }} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, duration: 0.9, ease }}>
                <Flare size={unit * 16} />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4: the warp flare */}
      <AnimatePresence>
        {stage >= 4 && stage <= 5 && (
          <motion.div
            className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2"
            initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
            animate={{ scale: stage === 5 ? 6 : 1.4, rotate: stage === 5 ? 30 : 8, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: stage === 5 ? 1.2 : 1.6, ease }}
          >
            <div className="absolute top-1/2 left-1/2 h-[90vmin] w-[90vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_0deg,rgba(255,180,200,0.0),rgba(170,220,255,0.35),rgba(255,240,170,0.3),rgba(255,180,220,0.3),rgba(170,220,255,0.0))] blur-2xl" />
            <Flare size={unit * 70} className="relative" />
            <svg viewBox="-100 -100 200 200" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" width={unit * 46} height={unit * 46} aria-hidden>
              <circle r="62" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5–6: white-gold burst */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: stage >= 5 ? 1 : 0,
          transition: 'opacity 900ms cubic-bezier(.22,1,.36,1)',
          background: 'radial-gradient(circle at 50% 45%, #ffffff 0%, #fff6e0 30%, #ffe2b0 55%, #ffd6f0 75%, #e6f2ff 100%)',
        }}
      />
    </div>
  );
}
