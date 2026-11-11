import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useAssetBase } from '@/stores/settings';
import { useAssetIndex, type MissingReason } from '@/lib/assetIndex';
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

const MISSING_TEXT: Record<MissingReason, string> = {
  'no-key': 'No image for this object',
  unverified: 'Image not available or not verified',
  'load-failed': 'Image failed to load',
};

/**
 * Artwork for a catalog entry. `icon` must be the entry's OWN image key from the catalog (never a
 * key looked up by name). The image is drawn only when that key is in the verified asset index;
 * otherwise an explicit "no image" placeholder is shown, never a substitute picture.
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
  const assetBase = useAssetBase();
  const index = useAssetIndex(assetBase);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const color = (element && ELEMENT_COLOR[element]) || RARITY_COLOR[rarity] || '#a9c8ec';
  const frame = { width: size, height: size };

  const verified = Boolean(icon && index?.has(icon));
  const failed = failedKey !== null && failedKey === icon;

  if (icon && index === undefined) {
    // Index still loading: neutral skeleton, no picture yet.
    return <div className={`shrink-0 animate-pulse bg-white/5 ${rounded} ${className}`} style={frame} aria-hidden />;
  }

  if (icon && verified && !failed) {
    const loaded = loadedKey === icon;
    return (
      <div
        className={`relative shrink-0 overflow-hidden ${rounded} ${className}`}
        style={{ ...frame, background: `radial-gradient(circle at 50% 30%, ${color}33, transparent 70%), #0b1024` }}
      >
        {!loaded && <div className="absolute inset-0 animate-pulse bg-white/5" aria-hidden />}
        <img
          src={`${assetBase}/${icon}.png`}
          alt={name}
          title={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          data-image-key={icon}
          onLoad={() => setLoadedKey(icon)}
          onError={() => setFailedKey(icon)}
          className={`h-full w-full object-contain transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>
    );
  }

  const reason: MissingReason = !icon ? 'no-key' : failed ? 'load-failed' : 'unverified';
  const label = `${name}: ${MISSING_TEXT[reason]}${icon ? ` (${icon})` : ''}`;
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      data-missing-image={reason}
      className={`relative grid shrink-0 place-items-center overflow-hidden border border-dashed ${rounded} ${className}`}
      style={{ ...frame, borderColor: `${color}55`, background: 'repeating-linear-gradient(135deg, #0b1024, #0b1024 6px, #0e1430 6px, #0e1430 12px)' }}
    >
      <div className="flex flex-col items-center gap-0.5 text-center" style={{ color: `${color}cc` }}>
        <ImageOff size={Math.max(12, Math.round(size * 0.32))} strokeWidth={1.5} aria-hidden />
        {size >= 56 && <span className="px-1 text-[9px] font-medium uppercase leading-tight tracking-wider opacity-80">no image</span>}
      </div>
    </div>
  );
}

export const elementColor = (element: string) => ELEMENT_COLOR[element] ?? '#a9c8ec';
export const rarityColor = (rarity: number) => RARITY_COLOR[rarity] ?? '#8f97a8';
