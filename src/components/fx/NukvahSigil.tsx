import { useId } from 'react';

/**
 * Nukvah — the golden spire of the Divine Throne crowned by a halo ring, a cross finial and
 * curved blade wings. `crown` animates the crown with a slow 2.5D turn (CSS 3D), `glow` adds bloom.
 * Pure SVG; animation is CSS so reduced-motion settings stop it.
 */
export function NukvahSigil({
  size = 320,
  crown = true,
  glow = true,
  body = true,
  hideCrown = false,
  className = '',
}: {
  size?: number;
  crown?: boolean;
  glow?: boolean;
  body?: boolean;
  /** Keep the crown's space but draw nothing (a 3D crown is layered on top instead). */
  hideCrown?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const gold = `url(#nk-gold-${id})`;
  const goldSide = `url(#nk-side-${id})`;
  const height = body ? size * 1.55 : size;

  const crownSvg = (
    <svg viewBox="-160 -170 320 260" width={size} height={size * 0.8125} aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={`nk-gold-${id}`} x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset="0.45" stopColor="#f0cf83" />
          <stop offset="1" stopColor="#a97a2e" />
        </linearGradient>
        <linearGradient id={`nk-side-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b8893a" />
          <stop offset="0.5" stopColor="#ffe9b0" />
          <stop offset="1" stopColor="#c59745" />
        </linearGradient>
        <filter id={`nk-glow-${id}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={glow ? `url(#nk-glow-${id})` : undefined}>
        {/* halo ring */}
        <circle cx="0" cy="-40" r="78" fill="none" stroke={goldSide} strokeWidth="7" />
        <circle cx="0" cy="-40" r="70" fill="none" stroke="#fff3cf" strokeOpacity="0.35" strokeWidth="1.2" />
        {/* cross finial */}
        <path d="M0 -168 L9 -128 L4 -122 L4 -96 L18 -102 L30 -96 L18 -90 L4 -94 L4 -60 L0 -40 L-4 -60 L-4 -94 L-18 -90 L-30 -96 L-18 -102 L-4 -96 L-4 -122 L-9 -128 Z" fill={gold} />
        <path d="M0 -150 L5 -126 L0 -118 L-5 -126 Z" fill="#fffaf0" opacity="0.85" />
        {/* upper blades on the ring */}
        {[-1, 1].map((s) => (
          <g key={s} transform={`scale(${s} 1)`}>
            <path d="M28 -112 C 56 -122, 74 -112, 84 -92 C 66 -100, 50 -98, 40 -88 Z" fill={gold} />
            <path d="M74 -12 C 104 -18, 132 -14, 152 -2 C 128 -2, 112 4, 102 16 C 96 6, 86 -2, 74 -12 Z" fill={gold} />
            <path d="M84 -14 L 150 -3" stroke="#fff6dc" strokeOpacity="0.6" strokeWidth="1.2" />
            <path d="M60 18 C 84 26, 98 44, 104 66 C 88 52, 72 46, 56 46 Z" fill={gold} opacity="0.92" />
          </g>
        ))}
        {/* core gem */}
        <path d="M0 -62 L12 -40 L0 -18 L-12 -40 Z" fill="#7ef0ff" opacity="0.95" />
        <path d="M0 -62 L12 -40 L0 -40 Z" fill="#ffffff" opacity="0.55" />
      </g>
    </svg>
  );

  return (
    <div className={`relative ${className}`} style={{ width: size, height, perspective: size * 3 }} aria-hidden>
      {glow && !hideCrown && <div className="absolute top-[4%] left-1/2 h-[42%] w-[90%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,236,190,0.55),transparent)] blur-xl" />}
      <div className={`relative ${crown ? 'nk-crown-turn' : ''}`} style={{ transformStyle: 'preserve-3d' }}>
        {hideCrown ? <div style={{ width: size, height: size * 0.8125 }} /> : crownSvg}
      </div>
      {body && (
        <svg viewBox="-110 0 220 230" width={size * 0.69} height={size * 0.72} className="absolute left-1/2 -translate-x-1/2" style={{ top: size * 0.7 }}>
          <defs>
            <linearGradient id={`nk-stone-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#6f5a49" />
              <stop offset="0.45" stopColor="#efe1c4" />
              <stop offset="1" stopColor="#7b6450" />
            </linearGradient>
            <linearGradient id={`nk-band-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8b6326" />
              <stop offset="0.5" stopColor="#ffe3a0" />
              <stop offset="1" stopColor="#9a6f2c" />
            </linearGradient>
          </defs>
          {/* dome */}
          <path d="M-46 30 C -46 6, -22 -4, 0 -4 C 22 -4, 46 6, 46 30 Z" fill={`url(#nk-stone-${id})`} />
          <rect x="-50" y="28" width="100" height="10" rx="3" fill={`url(#nk-band-${id})`} />
          {/* colonnade drum */}
          <rect x="-58" y="38" width="116" height="46" fill={`url(#nk-stone-${id})`} />
          {[-44, -26, -8, 10, 28, 46].map((x) => (
            <rect key={x} x={x - 4} y="42" width="8" height="38" rx="2" fill="#2a2018" opacity="0.45" />
          ))}
          <rect x="-62" y="82" width="124" height="9" rx="3" fill={`url(#nk-band-${id})`} />
          {/* lower drum */}
          <rect x="-72" y="91" width="144" height="54" fill={`url(#nk-stone-${id})`} />
          <path d="M-30 145 L-30 110 C -30 98, 30 98, 30 110 L30 145 Z" fill="#2a2018" opacity="0.5" />
          <path d="M0 102 L10 116 L0 130 L-10 116 Z" fill="#e2c27d" opacity="0.8" />
          <rect x="-80" y="143" width="160" height="10" rx="3" fill={`url(#nk-band-${id})`} />
          <rect x="-90" y="153" width="180" height="77" fill={`url(#nk-stone-${id})`} />
          <rect x="-90" y="153" width="180" height="77" fill={`url(#nk-fade-${id})`} />
          <defs>
            <linearGradient id={`nk-fade-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.85" />
            </linearGradient>
          </defs>
        </svg>
      )}
    </div>
  );
}
