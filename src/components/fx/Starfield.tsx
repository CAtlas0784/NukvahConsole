import { useEffect, useRef } from 'react';
import { useReducedMotionPref } from '@/lib/motion';

/**
 * A slow, low-cost starfield on a single canvas. Pauses when the tab is hidden and renders one
 * static frame when reduced motion is requested.
 */
export function Starfield({ density = 0.00012 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let stars: { x: number; y: number; r: number; a: number; s: number; hue: number }[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const { innerWidth: w, innerHeight: h } = window;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const count = Math.round(w * h * density);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() ** 3 * 1.6 + 0.25,
        a: Math.random() * Math.PI * 2,
        s: 0.15 + Math.random() * 0.6,
        hue: Math.random(),
      }));
    };

    const draw = (time: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const st of stars) {
        const twinkle = reduced ? 0.7 : 0.45 + 0.55 * Math.sin(st.a + time * 0.0006 * st.s);
        const drift = reduced ? 0 : (time * 0.002 * st.s) % window.innerHeight;
        const y = (st.y - drift + window.innerHeight) % window.innerHeight;
        ctx.globalAlpha = Math.max(0.05, twinkle) * (st.r > 1 ? 0.95 : 0.6);
        ctx.fillStyle = st.hue > 0.86 ? '#f7e4b0' : st.hue > 0.72 ? '#a9c8ec' : '#e9ecf7';
        ctx.beginPath();
        ctx.arc(st.x, y, st.r, 0, Math.PI * 2);
        ctx.fill();
        if (st.r > 1.35) {
          ctx.globalAlpha *= 0.25;
          ctx.fillRect(st.x - st.r * 3, y - 0.3, st.r * 6, 0.6);
          ctx.fillRect(st.x - 0.3, y - st.r * 3, 0.6, st.r * 6);
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };

    resize();
    if (reduced) draw(0);
    else frame = requestAnimationFrame(loop);

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduced) frame = requestAnimationFrame(loop);
    };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [density, reduced]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 opacity-80" />;
}
