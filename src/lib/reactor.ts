/**
 * One global listener set that makes the whole UI respond to the pointer:
 *  - `--px` / `--py` on <html>: pointer position in [-1, 1] for parallax layers
 *  - `--mx` / `--my` on the hovered `.panel`: spotlight position
 *  - `--rx` / `--ry` on the hovered `.tilt`: 3D tilt
 *  - golden spark burst + ring on clicks of interactive elements
 * Everything is rAF-throttled and disabled under reduced motion.
 */

const INTERACTIVE = 'button:not(:disabled), a[href], [role="option"], [role="radio"], .chip, summary, label';

function reduced(): boolean {
  const pref = document.documentElement.dataset.motion;
  if (pref === 'reduced') return true;
  if (pref === 'full') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function installReactor(): () => void {
  const root = document.documentElement;
  let frame = 0;
  let last: PointerEvent | null = null;
  let tilted: HTMLElement | null = null;
  let lit: HTMLElement | null = null;

  const resetTilt = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.dataset.tilting = 'false';
  };

  const apply = () => {
    frame = 0;
    const e = last;
    if (!e) return;
    root.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
    root.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));

    const target = e.target instanceof Element ? e.target : null;
    const panel = target?.closest<HTMLElement>('.panel') ?? null;
    if (panel) {
      const r = panel.getBoundingClientRect();
      panel.style.setProperty('--mx', `${e.clientX - r.left}px`);
      panel.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
    if (lit && lit !== panel) {
      lit.style.setProperty('--mx', '-999px');
      lit.style.setProperty('--my', '-999px');
    }
    lit = panel;

    const tilt = reduced() ? null : (target?.closest<HTMLElement>('.tilt') ?? null);
    if (tilted && tilted !== tilt) resetTilt(tilted);
    if (tilt) {
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      const max = Number(tilt.dataset.tiltMax ?? 8);
      tilt.style.setProperty('--ry', `${(x * max * 2).toFixed(2)}deg`);
      tilt.style.setProperty('--rx', `${(-y * max * 2).toFixed(2)}deg`);
      tilt.dataset.tilting = 'true';
    }
    tilted = tilt;
  };

  const onMove = (e: PointerEvent) => {
    last = e;
    if (!frame) frame = requestAnimationFrame(apply);
  };

  const onLeave = () => {
    resetTilt(tilted);
    tilted = null;
  };

  const onDown = (e: PointerEvent) => {
    if (reduced() || e.button !== 0) return;
    const target = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
    if (!target) return;
    burst(e.clientX, e.clientY, target.classList.contains('btn-primary') ? 12 : 7);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  window.addEventListener('pointerdown', onDown, { passive: true });
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('pointerdown', onDown);
  };
}

export function burst(x: number, y: number, count = 8) {
  const ring = document.createElement('span');
  ring.className = 'nk-ring';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  document.body.appendChild(ring);
  setTimeout(() => ring.remove(), 650);
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'nk-spark';
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    document.body.appendChild(s);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = 22 + Math.random() * 30;
    const anim = s.animate(
      [
        { transform: 'translate(0,0) rotate(45deg) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist - 10}px) rotate(225deg) scale(0.2)`, opacity: 0 },
      ],
      { duration: 520 + Math.random() * 260, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
    anim.onfinish = () => s.remove();
  }
}
