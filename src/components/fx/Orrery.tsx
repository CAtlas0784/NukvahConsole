import { useId } from 'react';

/**
 * Nukva's emblem: a celestial orrery of engraved rings, ticks, a four-point star and orbiting
 * nodes. Pure SVG; ring rotation is CSS-driven so reduced-motion disables it automatically.
 */
export function Orrery({ size = 520, className = '', intensity = 1 }: { size?: number; className?: string; intensity?: number }) {
  const id = useId().replace(/:/g, '');
  const ticks = Array.from({ length: 120 }, (_, i) => i);
  const runes = Array.from({ length: 24 }, (_, i) => i);
  return (
    <svg viewBox="-260 -260 520 520" width={size} height={size} className={className} aria-hidden style={{ opacity: intensity }}>
      <defs>
        <radialGradient id={`core-${id}`}>
          <stop offset="0%" stopColor="#7ef0ff" stopOpacity="0.9" />
          <stop offset="35%" stopColor="#8e7fe0" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#04050b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`gold-${id}`} x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff2cf" />
          <stop offset="50%" stopColor="#e2c27d" />
          <stop offset="100%" stopColor="#8a6a2c" />
        </linearGradient>
        <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle r="200" fill={`url(#core-${id})`} opacity="0.35" />

      {/* outer engraved ring */}
      <g className="origin-center animate-spin-slow" style={{ transformBox: 'view-box' }}>
        <circle r="246" fill="none" stroke="#e2c27d" strokeOpacity="0.28" strokeWidth="1" />
        <circle r="236" fill="none" stroke="#e2c27d" strokeOpacity="0.14" strokeWidth="0.75" strokeDasharray="2 6" />
        {ticks.map((i) => (
          <line
            key={i}
            x1="0"
            y1={-246}
            x2="0"
            y2={i % 10 === 0 ? -228 : i % 5 === 0 ? -234 : -240}
            stroke="#e2c27d"
            strokeOpacity={i % 10 === 0 ? 0.65 : 0.25}
            strokeWidth={i % 10 === 0 ? 1.2 : 0.6}
            transform={`rotate(${i * 3})`}
          />
        ))}
        {[0, 90, 180, 270].map((r) => (
          <g key={r} transform={`rotate(${r}) translate(0 -246)`}>
            <path d="M0 -7 L5 0 L0 7 L-5 0 Z" fill={`url(#gold-${id})`} />
          </g>
        ))}
      </g>

      {/* rune band */}
      <g className="origin-center animate-spin-slower" style={{ transformBox: 'view-box' }}>
        <circle r="206" fill="none" stroke="#a9c8ec" strokeOpacity="0.18" strokeWidth="0.8" />
        <circle r="186" fill="none" stroke="#a9c8ec" strokeOpacity="0.12" strokeWidth="0.8" />
        {runes.map((i) => (
          <g key={i} transform={`rotate(${i * 15}) translate(0 -196)`} opacity={i % 3 === 0 ? 0.75 : 0.35}>
            <path
              d={i % 4 === 0 ? 'M-3 -4 L3 -4 L0 4 Z' : i % 4 === 1 ? 'M-3 0 L0 -4 L3 0 L0 4 Z' : i % 4 === 2 ? 'M-3 -3 L3 3 M3 -3 L-3 3' : 'M0 -4 L0 4 M-3 0 L3 0'}
              fill="none"
              stroke="#a9c8ec"
              strokeWidth="0.9"
            />
          </g>
        ))}
      </g>

      {/* inclined orbits */}
      <g fill="none" stroke="#e2c27d" strokeOpacity="0.35" strokeWidth="0.8">
        <ellipse rx="160" ry="58" transform="rotate(-22)" />
        <ellipse rx="160" ry="58" transform="rotate(38)" strokeOpacity="0.22" />
        <ellipse rx="128" ry="128" strokeOpacity="0.3" strokeDasharray="1 5" />
      </g>
      <g className="origin-center animate-spin-slow" style={{ transformBox: 'view-box', animationDuration: '60s' }}>
        <circle cx="128" cy="0" r="3.2" fill="#7ef0ff" filter={`url(#glow-${id})`} />
        <circle cx="-90" cy="91" r="2.2" fill="#f7e4b0" />
      </g>
      <g className="origin-center animate-spin-slower" style={{ transformBox: 'view-box', animationDuration: '90s' }}>
        <circle cx="0" cy="-160" r="2.6" fill="#8e7fe0" filter={`url(#glow-${id})`} />
      </g>

      {/* hexagram + four-point star */}
      <g stroke={`url(#gold-${id})`} strokeWidth="1.1" fill="none" opacity="0.85">
        <path d="M0 -108 L93.5 54 L-93.5 54 Z" strokeOpacity="0.45" />
        <path d="M0 108 L93.5 -54 L-93.5 -54 Z" strokeOpacity="0.45" />
        <circle r="62" strokeOpacity="0.55" />
      </g>
      <g filter={`url(#glow-${id})`}>
        <path d="M0 -92 C 6 -20, 20 -6, 92 0 C 20 6, 6 20, 0 92 C -6 20, -20 6, -92 0 C -20 -6, -6 -20, 0 -92 Z" fill={`url(#gold-${id})`} opacity="0.9" />
        <path d="M0 -44 L10 0 L0 44 L-10 0 Z" fill="#04050b" opacity="0.65" />
        <circle r="6" fill="#7ef0ff" className="animate-breathe" />
      </g>
    </svg>
  );
}
