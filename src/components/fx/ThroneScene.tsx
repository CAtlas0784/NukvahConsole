import { useMemo, type CSSProperties, type ReactNode } from 'react';

/**
 * The Divine Throne: the inside of a domed amphitheatre built from real CSS 3D panels — tiers of
 * arched alcoves, each holding a glowing lantern — around a column of light. The camera is driven by
 * `pitch` (look up, degrees), `rise` (vertical travel, px) and `spin` (slow turn); change them and
 * the scene glides there (`travelMs`). Lightweight: ~200 GPU-composited panels, no WebGL.
 */

const SIDES = 26;
const TIERS = 7;
const RADIUS = 900;
const TIER_H = 230;

// One panel's texture: two arched alcoves with warm lanterns on dark stone with gold trims.
const ALCOVE_SVG = encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='240' height='230' viewBox='0 0 240 230'>
  <defs>
    <linearGradient id='s' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#4b3a2c'/><stop offset='1' stop-color='#21170f'/>
    </linearGradient>
    <radialGradient id='l' cx='.5' cy='.5' r='.5'>
      <stop offset='0' stop-color='#fff1c4'/><stop offset='.25' stop-color='#ffb44d'/>
      <stop offset='.6' stop-color='#ff7a18' stop-opacity='.55'/><stop offset='1' stop-color='#ff7a18' stop-opacity='0'/>
    </radialGradient>
    <linearGradient id='a' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#120b06'/><stop offset='1' stop-color='#2d1f13'/>
    </linearGradient>
  </defs>
  <rect width='240' height='230' fill='url(#s)'/>
  <rect y='0' width='240' height='14' fill='#7a5a34'/>
  <rect y='12' width='240' height='3' fill='#e2c27d' opacity='.55'/>
  <rect y='200' width='240' height='30' fill='#5a4430'/>
  <rect y='198' width='240' height='3' fill='#e2c27d' opacity='.45'/>
  <g>
    <path d='M22 198 L22 92 Q22 46 62 46 Q102 46 102 92 L102 198 Z' fill='url(#a)'/>
    <path d='M22 198 L22 92 Q22 46 62 46 Q102 46 102 92 L102 198' fill='none' stroke='#c9a35e' stroke-opacity='.55' stroke-width='3'/>
    <ellipse cx='62' cy='150' rx='34' ry='26' fill='url(#l)'/>
    <circle cx='62' cy='150' r='6' fill='#fff4d2'/>
  </g>
  <g>
    <path d='M138 198 L138 92 Q138 46 178 46 Q218 46 218 92 L218 198 Z' fill='url(#a)'/>
    <path d='M138 198 L138 92 Q138 46 178 46 Q218 46 218 92 L218 198' fill='none' stroke='#c9a35e' stroke-opacity='.55' stroke-width='3'/>
    <ellipse cx='178' cy='150' rx='34' ry='26' fill='url(#l)'/>
    <circle cx='178' cy='150' r='6' fill='#fff4d2'/>
  </g>
  <rect x='112' y='20' width='16' height='180' fill='#6b5139'/>
  <rect x='118' y='20' width='4' height='180' fill='#e2c27d' opacity='.35'/>
</svg>`);

export interface ThroneCamera {
  pitch: number;
  rise: number;
  spin: number;
  /** 0–1 — how strongly the light from the oculus floods the scene. */
  light: number;
}

export function ThroneScene({
  camera,
  travelMs = 6000,
  className = '',
  children,
  dim = 0,
}: {
  camera: ThroneCamera;
  travelMs?: number;
  className?: string;
  children?: ReactNode;
  /** Extra darkening 0–1 for use as a background. */
  dim?: number;
}) {
  const width = useMemo(() => 2 * RADIUS * Math.tan(Math.PI / SIDES) + 2, []);
  const panels = useMemo(() => {
    const out: { key: string; style: CSSProperties; shade: number }[] = [];
    for (let t = 0; t < TIERS; t++) {
      for (let s = 0; s < SIDES; s++) {
        out.push({
          key: `${t}-${s}`,
          shade: t / (TIERS - 1),
          style: {
            width,
            height: TIER_H,
            marginLeft: -width / 2,
            marginTop: -TIER_H / 2,
            transform: `translateY(${-t * TIER_H}px) rotateY(${(s * 360) / SIDES}deg) translateZ(${-RADIUS}px)`,
          },
        });
      }
    }
    return out;
  }, [width]);

  const ease = 'cubic-bezier(0.45, 0, 0.15, 1)';
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#0b0704] ${className}`} aria-hidden>
      <div className="absolute inset-0" style={{ perspective: '820px', perspectiveOrigin: '50% 58%' }}>
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            transformStyle: 'preserve-3d',
            transition: `transform ${travelMs}ms ${ease}`,
            transform: `rotateX(${camera.pitch}deg) translateY(${camera.rise}px)`,
          }}
        >
          <div style={{ transformStyle: 'preserve-3d', transform: `rotateY(${camera.spin}deg)`, transition: `transform ${travelMs}ms ${ease}` }}>
          <div className="nk-throne-spin" style={{ transformStyle: 'preserve-3d' }}>
            {panels.map((p) => (
              <div
                key={p.key}
                className="absolute top-0 left-0"
                style={{
                  ...p.style,
                  backgroundImage: `url("data:image/svg+xml,${ALCOVE_SVG}")`,
                  backgroundSize: '100% 100%',
                  backfaceVisibility: 'hidden',
                  filter: `brightness(${0.55 + p.shade * 0.9})`,
                }}
              />
            ))}
            {/* oculus — the light above the top tier */}
            <div
              className="absolute top-0 left-0 rounded-full"
              style={{
                width: RADIUS * 2.2,
                height: RADIUS * 2.2,
                marginLeft: -RADIUS * 1.1,
                marginTop: -RADIUS * 1.1,
                transform: `translateY(${-(TIERS - 0.5) * TIER_H}px) rotateX(90deg)`,
                background: 'radial-gradient(circle, #fffdf5 0%, #fff1cf 30%, #ffd690 55%, rgba(255,200,120,0.0) 72%)',
              }}
            />
          </div>
          </div>
        </div>
      </div>
      {/* atmosphere: light shafts and bloom, intensity follows camera.light */}
      <div
        className="absolute inset-0"
        style={{
          transition: `opacity ${travelMs}ms ${ease}`,
          opacity: 0.35 + camera.light * 0.65,
          background:
            'radial-gradient(70% 55% at 50% -5%, rgba(255,250,235,0.95), rgba(255,226,170,0.55) 35%, rgba(255,190,110,0.12) 62%, transparent 75%)',
          mixBlendMode: 'screen',
        }}
      />
      <div className="nk-shafts absolute inset-0 opacity-60 mix-blend-screen" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,transparent_35%,rgba(10,6,3,0.85)_100%)]" />
      {dim > 0 && <div className="absolute inset-0 bg-abyss" style={{ opacity: dim }} />}
      {children}
    </div>
  );
}
