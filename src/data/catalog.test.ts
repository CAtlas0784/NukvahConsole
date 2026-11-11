/**
 * Acceptance checks for the generated catalog (public/data) and, when present, the local icon cache.
 * Run `npm run catalog` (and `npm run assets && npm run assets:verify` for the image checks) first.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = <T,>(rel: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;
const maybe = <T,>(rel: string): T | null => (fs.existsSync(path.join(ROOT, rel)) ? read<T>(rel) : null);

type Entry = { id: number; name: { en: string; th?: string; internal?: boolean; noTh?: boolean }; icon: string | null; imageType?: string; imageStatus?: string; gameIcon?: string };
const characters = read<(Entry & { weapon: string; initialWeapon: number | null; release: string })[]>('public/data/characters.json');
const weapons = read<(Entry & { type: string; awakenIcon: string | null; rarity: number })[]>('public/data/weapons.json');
const costumes = read<(Entry & { characterId: number; isDefault: boolean })[]>('public/data/costumes.json');
const pieces = read<(Entry & { setId: number; slot: string; rarity: number })[]>('public/data/artifact-pieces.json');
const artifacts = read<{ sets: (Entry & { pieces: Record<string, (Entry & { rarity: number })[]> })[] }>('public/data/artifacts.json');
const materials = read<Entry[]>('public/data/materials.json');
const furniture = read<Entry[]>('public/data/furniture.json');
const monsters = read<Entry[]>('public/data/monsters.json');
const teleports = read<{ sceneId: number; pointId: number; kind: string; pos: { x: number; y: number; z: number } }[]>('public/data/teleports.json');
const meta = read<{ coverage: Record<string, { sourceRows: number; included: number; excluded: number }> }>('public/data/meta.json');

const ICON_KEY = /^UI_[A-Za-z0-9_]+$/;
const FAMILY: Record<string, RegExp> = {
  'avatar-icon': /^UI_AvatarIcon_(?!Side_)/,
  'avatar-costume-icon': /^UI_AvatarIcon_(?!Side_)/,
  'weapon-icon': /^UI_EquipIcon_/,
  'relic-icon': /^UI_RelicIcon_\d+_[1-5]$/,
  'monster-icon': /^UI_MonsterIcon_/,
};
const SLOT_SUFFIX: Record<string, number> = { flower: 4, plume: 2, sands: 5, goblet: 1, circlet: 3 };
const WEAPON_DIGIT: Record<string, number> = { sword: 1, claymore: 2, polearm: 3, catalyst: 4, bow: 5 };
const ALL: Record<string, Entry[]> = { characters, weapons, costumes, artifactPieces: pieces, materials, furniture, monsters };

const dupes = (ids: (number | string)[]) => ids.filter((id, i) => ids.indexOf(id) !== i);

describe('catalog: ids', () => {
  it.each(Object.entries(ALL))('%s has no duplicate game ids', (_, list) => {
    expect(dupes(list.map((e) => e.id))).toEqual([]);
  });
  it('artifact sets have no duplicate ids', () => expect(dupes(artifacts.sets.map((s) => s.id))).toEqual([]));
  it('teleport points are unique per scene', () => expect(dupes(teleports.map((t) => `${t.sceneId}:${t.pointId}`))).toEqual([]));
});

describe('catalog: nothing is dropped silently', () => {
  it('every source row is either included or listed in excluded.json', () => {
    const excluded = read<{ category: string; id: number; reason: string }[]>('reports/catalog/excluded.json');
    for (const [cat, c] of Object.entries(meta.coverage)) {
      expect(c.included + c.excluded, cat).toBe(c.sourceRows);
      expect(excluded.filter((e) => e.category === cat).length, cat).toBe(c.excluded);
    }
    expect(excluded.every((e) => typeof e.reason === 'string' && e.reason.length > 0)).toBe(true);
  });
  it('every id the server loaded is in the catalog or explained (when a server snapshot exists)', () => {
    const cov = maybe<{ apiSnapshot: boolean; categories: Record<string, { loadedButUnexplained: number | null; inCatalogButNotLoaded: number | null }> }>('reports/catalog/coverage.json');
    if (!cov?.apiSnapshot) return;
    for (const [cat, c] of Object.entries(cov.categories)) {
      if (c.loadedButUnexplained !== null) expect(c.loadedButUnexplained, cat).toBe(0);
      if (c.inCatalogButNotLoaded !== null) expect(c.inCatalogButNotLoaded, cat).toBe(0);
    }
  });
});

describe('catalog: image mappings', () => {
  it.each(Object.entries(ALL))('%s image keys are route-safe and in the right family', (_, list) => {
    for (const e of list) {
      if (!e.icon) continue;
      expect(e.icon, `${e.id}`).toMatch(ICON_KEY);
      const family = e.imageType ? FAMILY[e.imageType] : undefined;
      if (family) expect(e.icon, `${e.id} (${e.imageType})`).toMatch(family);
    }
  });
  it('every character has its own, unshared portrait key', () => {
    expect(characters.every((c) => c.icon)).toBe(true);
    expect(dupes(characters.map((c) => c.icon!))).toEqual([]);
  });
  it('weapons never share an icon across different weapons (placeholder art is withheld)', () => {
    const byKey = new Map<string, string[]>();
    for (const w of weapons) for (const k of [w.icon, w.awakenIcon]) if (k) byKey.set(k, [...(byKey.get(k) ?? []), w.name.en]);
    for (const [key, names] of byKey) expect(new Set(names).size, key).toBe(1);
    for (const w of weapons.filter((x) => x.imageStatus === 'placeholder-art')) {
      expect(w.icon).toBeNull();
      expect(w.awakenIcon).toBeNull();
      expect(w.gameIcon).toMatch(ICON_KEY);
    }
  });
  it('monsters never show an icon that belongs to a differently named monster', () => {
    const byKey = new Map<string, string[]>();
    for (const m of monsters) if (m.icon) byKey.set(m.icon, [...(byKey.get(m.icon) ?? []), m.name.en]);
    for (const [key, names] of byKey) expect(new Set(names).size, key).toBe(1);
    for (const m of monsters.filter((x) => x.imageStatus === 'placeholder-art')) expect(m.gameIcon).toMatch(ICON_KEY);
  });
  it('items that reuse art across differently named rows are marked shared-key', () => {
    for (const list of [materials, furniture]) {
      const byKey = new Map<string, Entry[]>();
      for (const e of list) if (e.icon) byKey.set(e.icon, [...(byKey.get(e.icon) ?? []), e]);
      for (const group of byKey.values()) {
        if (new Set(group.map((e) => e.name.en)).size > 1) for (const e of group) expect(e.imageStatus, `${e.id}`).toBe('shared-key');
      }
    }
  });
  it('skins never replace default character artwork', () => {
    const portraits = new Set(characters.map((c) => c.icon));
    for (const c of costumes) {
      if (c.isDefault) expect(c.icon).toBeNull();
      else if (c.icon) expect(portraits.has(c.icon), `${c.id} ${c.icon}`).toBe(false);
    }
  });
});

describe('catalog: artifacts', () => {
  it('each piece icon is its own set and slot (UI_RelicIcon_<setId>_<slot digit>)', () => {
    for (const p of pieces) {
      const m = /^UI_RelicIcon_(\d+)_(\d)$/.exec(p.icon ?? '');
      expect(m, `${p.id}`).not.toBeNull();
      expect(Number(m![1]), `${p.id} set`).toBe(p.setId);
      expect(Number(m![2]), `${p.id} slot ${p.slot}`).toBe(SLOT_SUFFIX[p.slot]);
    }
  });
  it('set listings only offer pieces of that set in the matching slot', () => {
    const byId = new Map(pieces.map((p) => [p.id, p]));
    for (const s of artifacts.sets) {
      for (const [slot, list] of Object.entries(s.pieces)) {
        for (const p of list) {
          expect(byId.get(p.id)?.setId, `${s.id}/${p.id}`).toBe(s.id);
          expect(byId.get(p.id)?.slot, `${s.id}/${p.id}`).toBe(slot);
        }
      }
    }
  });
});

describe('catalog: weapons and characters', () => {
  it('weapon ids follow the game numbering for their type (1TXXX)', () => {
    for (const w of weapons) expect(Math.floor(w.id / 1000), `${w.id} ${w.type}`).toBe(10 + WEAPON_DIGIT[w.type]);
  });
  it("a character's starting weapon is of the character's weapon type", () => {
    const byId = new Map(weapons.map((w) => [w.id, w]));
    for (const c of characters) {
      const w = c.initialWeapon ? byId.get(c.initialWeapon) : undefined;
      if (w) expect(w.type, `${c.id} ${c.name.en}`).toBe(c.weapon);
    }
  });
});

describe('catalog: names', () => {
  it.each(Object.entries(ALL))('%s entries all have an English name', (_, list) => {
    expect(list.filter((e) => !e.name?.en).map((e) => e.id)).toEqual([]);
  });
  it('rows without TextMap names are marked internal, never shown as official names', () => {
    for (const e of [...characters, ...weapons]) if ((e as { nameSource?: string }).nameSource === 'icon') expect(e.name.internal).toBe(true);
  });
  it('missing Thai translations stay rare (regression guard)', () => {
    const missing = Object.values(ALL).flat().filter((e) => e.name?.noTh).length;
    expect(missing).toBeLessThanOrEqual(13);
  });
});

describe('teleports', () => {
  it('every point has finite coordinates and a known kind', () => {
    for (const t of teleports) {
      expect([t.pos.x, t.pos.y, t.pos.z].every(Number.isFinite), `${t.sceneId}:${t.pointId}`).toBe(true);
      expect(['statue', 'waypoint', 'domain', 'virtual', 'scene-jump', 'other']).toContain(t.kind);
    }
  });
});

// ------------------------------------------------------------------ local icon cache (optional)
const CACHE = path.join(ROOT, '.cache', 'game-assets');
const index = maybe<Record<string, { w: number; h: number; sha256: string }>>('.cache/game-assets/index.json');
const manifest = maybe<{ entries: Record<string, { status: string; sha256?: string }> }>('.cache/game-assets/manifest.json');
const accuracy = maybe<{ orphans: string[]; sharedContent: string[][] }>('reports/assets/image-accuracy.json');

describe.skipIf(!index || !manifest)('icon cache', () => {
  it('every verified file still matches its manifest SHA-256 (no corruption)', () => {
    const bad: string[] = [];
    for (const [key, v] of Object.entries(index!)) {
      const file = path.join(CACHE, `${key}.png`);
      const digest = fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
      if (digest !== v.sha256 || manifest!.entries[key]?.sha256 !== v.sha256) bad.push(key);
    }
    expect(bad).toEqual([]);
  }, 30_000);
  it('verified images are square', () => {
    expect(Object.entries(index!).filter(([, v]) => v.w !== v.h).map(([k]) => k)).toEqual([]);
  });
  it('no orphaned images and no image reused under another key', () => {
    expect(accuracy?.orphans ?? []).toEqual([]);
    expect(accuracy?.sharedContent ?? []).toEqual([]);
  });
  it('every verified key is used by a catalog entry', () => {
    const used = new Set<string>();
    for (const list of Object.values(ALL)) for (const e of list) if (e.icon) used.add(e.icon);
    for (const w of weapons) if (w.awakenIcon) used.add(w.awakenIcon);
    for (const s of artifacts.sets) if (s.icon) used.add(s.icon);
    expect(Object.keys(index!).filter((k) => !used.has(k))).toEqual([]);
  });
});
