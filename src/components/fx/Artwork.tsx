import { useState } from 'react';
import { useSettings } from '@/stores/settings';
import type { Element } from '@/data/types';

const ELEMENT_COLOR: Record<string, string> = {
  pyro: '#ff8a5c',
  hydro: '#4fb3ff',
  anemo: '#5fe0c0',
  electro: '#b48cff',
  dendro: '#9ed65b',
  cryo: '#9fe6ff',
  geo: '#f2c25e',
  multi: '#e2c27d',
  none: '#a9c8ec',
};
const RARITY_COLOR: Record<number, string> = { 1: '#8f97a8', 2: '#6fbf8f', 3: '#6fa3e0', 4: '#a98ae6', 5: '#e2b65f' };

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Artwork for a catalog entry. Uses operator-hosted images when an asset base URL is configured;
 * otherwise draws a deterministic sigil (no game artwork is bundled with the console).
 */
export function Artwork({
  icon,
  name,
  element,
  rarity = 0,
  size = 56,
  rounded = 'rounded-2xl',
  className = '',
}: {
  icon?: string | null;
  name: string;
  element?: Element | string;
  rarity?: number;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const assetBase = useSettings((s) => s.assetBase);
  const [failed, setFailed] = useState(false);
  const color = (element && ELEMENT_COLOR[element]) || RARITY_COLOR[rarity] || '#a9c8ec';
  const seed = hash(icon || name);
  const sides = 5 + (seed % 4);
  const rot = seed % 360;
  const points = Array.from({ length: sides }, (_, i) => {
    const a = ((Math.PI * 2) / sides) * i - Math.PI / 2;
    return `${50 + Math.cos(a) * 34},${50 + Math.sin(a) * 34}`;
  }).join(' ');

  if (assetBase && icon && !failed) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden ${rounded} ${className}`}
        style={{ width: size, height: size, background: `radial-gradient(circle at 50% 30%, ${color}33, transparent 70%), #0b1024` }}
      >
        <img
          src={`${assetBase}/${icon}.png`}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden ${rounded} ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 35%, ${color}38, transparent 65%), linear-gradient(160deg, #111834, #070a17)`,
        boxShadow: `inset 0 0 0 1px ${color}40`,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <g transform={`rotate(${rot} 50 50)`} fill="none" stroke={color} strokeOpacity="0.55" strokeWidth="1.2">
          <polygon points={points} />
          <circle cx="50" cy="50" r="42" strokeOpacity="0.22" strokeDasharray="2 4" />
        </g>
        <path d="M50 18 L53 47 L82 50 L53 53 L50 82 L47 53 L18 50 L47 47 Z" fill={color} fillOpacity="0.12" />
      </svg>
      <span className="relative font-display font-semibold tracking-wider" style={{ color, fontSize: Math.max(11, size * 0.3) }}>
        {initials(name)}
      </span>
    </div>
  );
}

export const elementColor = (element: string) => ELEMENT_COLOR[element] ?? '#a9c8ec';
export const rarityColor = (rarity: number) => RARITY_COLOR[rarity] ?? '#8f97a8';
