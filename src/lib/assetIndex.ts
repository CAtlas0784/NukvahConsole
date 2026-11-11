import { useEffect, useState } from 'react';

/**
 * The list of image keys whose files were verified by `npm run assets:verify` (scripts/verify-assets.mjs):
 * present, hash-checked against the download manifest, decodable PNG, right key family, and not
 * byte-identical to another key. Served as `<asset base>/index.json`. A key that is not listed is
 * never drawn; the UI shows the explicit missing-image placeholder instead.
 */
export type AssetIndex = ReadonlyMap<string, { w: number; h: number; sha256: string }>;

const loaded = new Map<string, AssetIndex>();
const pending = new Map<string, Promise<AssetIndex>>();

export function loadAssetIndex(base: string): Promise<AssetIndex> {
  const done = loaded.get(base);
  if (done) return Promise.resolve(done);
  let p = pending.get(base);
  if (!p) {
    p = fetch(`${base}/index.json`, { credentials: 'omit', cache: 'no-cache' })
      .then((res) => (res.ok ? (res.json() as Promise<Record<string, { w: number; h: number; sha256: string }>>) : {}))
      .catch(() => ({}))
      .then((json) => {
        const map: AssetIndex = new Map(Object.entries(json ?? {}));
        loaded.set(base, map);
        return map;
      });
    pending.set(base, p);
  }
  return p;
}

/** The verified-key index for an asset base: undefined while loading, empty when there is none. */
export function useAssetIndex(base: string): AssetIndex | undefined {
  const [index, setIndex] = useState<AssetIndex | undefined>(() => loaded.get(base));
  useEffect(() => {
    let alive = true;
    if (loaded.has(base)) setIndex(loaded.get(base));
    else loadAssetIndex(base).then((i) => alive && setIndex(i));
    return () => {
      alive = false;
    };
  }, [base]);
  return index;
}

/** Why an entry shows no image (for the placeholder's label and tooltip). */
export type MissingReason = 'no-key' | 'unverified' | 'load-failed';
