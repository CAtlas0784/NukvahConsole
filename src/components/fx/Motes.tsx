import { useEffect, useRef } from 'react';
import { useReducedMotionPref } from '@/lib/motion';

/**
 * Golden light motes drifting upward, gently pushed away by the pointer. One canvas; pauses when
 * the tab is hidden; static (none) under reduced motion.
 */
export function Motes({ count = 70, className = 'fixed inset-0 -z-[5]', warm = 1 }: { count?: number; className?: string; warm?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || reduced) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let frame = 0;
    const pointer = { x: -9999, y: -9999 };
    type Mote = { x: number; y: number; vx: number; vy: number; r: number; life: number; tw: number };
    let motes: Mote[] = [];
    const spawn = (anywhere: boolean): Mote => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -(0.15 + Math.random() * 0.55),
      r: 0.6 + Math.random() ** 2 * 2.4,
      life: Math.random(),
      tw: Math.random() * Math.PI * 2,
    });
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      motes = Array.from({ length: count }, () => spawn(true));
    };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const tick = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        const dx = m.x - pointer.x;
        const dy = m.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 140 * 140) {
          const f = (1 - Math.sqrt(d2) / 140) * 0.35;
          m.vx += (dx / Math.sqrt(d2 + 1)) * f;
          m.vy += (dy / Math.sqrt(d2 + 1)) * f * 0.5;
        }
        m.vx *= 0.97;
        m.vy = m.vy * 0.97 - 0.012;
        m.x += m.vx + Math.sin(t * 0.0006 + m.tw) * 0.12;
        m.y += m.vy;
        if (m.y < -20 || m.x < -20 || m.x > w + 20) motes[i] = spawn(false);
        const a = (0.35 + 0.65 * Math.abs(Math.sin(t * 0.0012 + m.tw))) * Math.min(1, (h - m.y) / 120);
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 5);
        g.addColorStop(0, `rgba(255, ${220 + 30 * warm}, ${170 + 40 * (1 - warm)}, ${a})`);
        g.addColorStop(1, 'rgba(255, 190, 110, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(tick);
    };
    resize();
    frame = requestAnimationFrame(tick);
    const onVis = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(tick);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [count, reduced, warm]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none h-full w-full ${className}`} />;
}
