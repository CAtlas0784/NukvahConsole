/**
 * Celestia rune glyphs — vector drawings in the style of the celestial script (pale luminous
 * strokes with a dark outline). Each glyph is a set of stroke paths in a 100×140 box.
 */

export const RUNES: { name: string; strokes: string[]; dots?: [number, number][] }[] = [
  {
    name: 'hook',
    strokes: ['M58 8 C 70 20 74 34 64 46 C 54 56 38 52 40 40 C 42 32 52 34 50 42', 'M64 46 C 52 64 30 74 36 96 C 40 110 54 112 60 124 C 64 132 62 136 56 138', 'M44 84 C 54 92 66 96 72 112'],
  },
  {
    name: 'cross-dot',
    strokes: ['M18 20 C 40 40 60 70 80 104 C 84 112 76 122 64 120 C 50 118 40 106 42 92', 'M86 14 C 66 30 44 60 26 92'],
    dots: [
      [82, 66],
      [52, 134],
    ],
  },
  {
    name: 'drop',
    strokes: ['M50 6 C 70 30 84 52 76 76 C 70 96 34 96 28 74 C 22 54 34 30 50 6', 'M50 44 L 54 54 L 50 64 L 46 54 Z', 'M58 92 C 70 108 60 126 46 130 C 36 132 34 124 42 118'],
  },
  {
    name: 'anchor-dot',
    strokes: ['M70 6 C 76 40 84 80 94 128', 'M58 42 C 34 30 18 52 34 64 C 52 78 70 94 52 116 C 44 126 30 124 26 116', 'M50 96 C 62 92 76 92 86 96'],
    dots: [[10, 84]],
  },
  {
    name: 'knot',
    strokes: ['M50 10 C 64 40 70 70 50 96 C 30 70 36 40 50 10', 'M14 84 C 40 64 70 62 88 78 C 70 100 38 104 14 84', 'M86 84 C 60 64 30 62 12 78 C 30 100 62 104 86 84'],
  },
  {
    name: 'diamond-leaf',
    strokes: ['M50 6 C 56 30 76 52 92 70 C 74 72 60 84 50 100 C 40 84 26 72 8 70 C 24 52 44 30 50 6', 'M50 46 C 58 60 54 76 46 88', 'M22 104 C 36 110 44 122 50 136 C 56 122 64 110 78 104'],
  },
  {
    name: 'star',
    strokes: ['M50 10 L 56 62 L 50 132 L 44 62 Z', 'M12 70 L 50 64 L 88 70 L 50 76 Z'],
  },
];

export function Rune({ index, size = 48, className = '', glow = true }: { index: number; size?: number; className?: string; glow?: boolean }) {
  const rune = RUNES[((index % RUNES.length) + RUNES.length) % RUNES.length];
  const id = `rune-${rune.name}`;
  return (
    <svg viewBox="-6 -6 112 152" width={size} height={(size * 152) / 112} className={className} aria-hidden style={glow ? { filter: 'drop-shadow(0 0 6px rgba(190,225,255,0.85)) drop-shadow(0 0 18px rgba(140,190,255,0.45))' } : undefined}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#e3f1ff" />
          <stop offset="1" stopColor="#b9d6f2" />
        </linearGradient>
      </defs>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {rune.strokes.map((d, i) => (
          <path key={`o${i}`} d={d} stroke="#4d6b86" strokeWidth={13} />
        ))}
        {rune.strokes.map((d, i) => (
          <path key={`i${i}`} d={d} stroke={`url(#${id})`} strokeWidth={8.5} />
        ))}
      </g>
      {rune.dots?.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={6} fill={`url(#${id})`} stroke="#4d6b86" strokeWidth={2.5} />
      ))}
    </svg>
  );
}
