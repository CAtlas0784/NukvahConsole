import { describe, expect, it } from 'vitest';
import { buildIndex, fuzzy, normalize, parseQuery, search, type SearchDoc } from './search';

const doc = (kind: SearchDoc['kind'], id: number | string, en: string, terms: string[] = [], extra: Partial<SearchDoc> = {}): SearchDoc => ({
  kind,
  id,
  title: { en },
  terms,
  ref: null,
  ...extra,
});

const index = buildIndex([
  doc('character', 10000046, 'Hu Tao', ['Hutao', 'pyro', 'polearm'], { rarity: 5, weight: 8 }),
  doc('material', 1046, 'Hu Tao', ['avatar']),
  doc('character', 10000002, 'Kamisato Ayaka', ['Ayaka', 'cryo', 'sword'], { rarity: 5, weight: 8 }),
  doc('character', 10000073, 'Nahida', ['Nahida', 'dendro'], { rarity: 5, weight: 8 }),
  doc('material', 202, 'Mora', ['adsorbate', 'virtual']),
  doc('weapon', 11509, 'Mistsplitter Reforged', ['sword']),
  doc('command', 'give', 'give', ['g', 'item', 'giveitem']),
  doc('scene', 3, 'Big World', ['world', 'teleport']),
]);

describe('normalize', () => {
  it('lowercases, strips accents and punctuation, keeps Thai', () => {
    expect(normalize("Amos' Bow")).toBe('amos bow');
    expect(normalize('Pokémon-Ćafé')).toBe('pokemon cafe');
    expect(normalize('ดาบ ใหญ่')).toBe('ดาบ ใหญ่');
  });
});

describe('search', () => {
  it('ranks exact IDs first', () => {
    expect(search(index, '10000073')[0].doc.id).toBe(10000073);
    expect(search(index, '202')[0].doc.title.en).toBe('Mora');
  });

  it('matches partial names and prefers characters on ties', () => {
    const hits = search(index, 'hu tao');
    expect(hits[0].doc.kind).toBe('character');
    expect(hits.map((h) => h.doc.id)).toContain(1046);
  });

  it('matches internal names and aliases', () => {
    expect(search(index, 'ayaka')[0].doc.id).toBe(10000002);
    expect(search(index, 'giveitem')[0].doc.id).toBe('give');
  });

  it('matches categories', () => {
    expect(search(index, 'dendro')[0].doc.id).toBe(10000073);
  });

  it('tolerates typos via subsequence matching', () => {
    expect(search(index, 'mstsplitr')[0].doc.id).toBe(11509);
  });

  it('supports kind prefixes', () => {
    expect(parseQuery('w: mist')).toEqual({ kind: 'weapon', text: 'mist' });
    expect(search(index, 'c: hu').every((h) => h.doc.kind === 'character')).toBe(true);
    expect(search(index, 'cmd:give')[0].doc.kind).toBe('command');
  });

  it('returns nothing for empty or unmatched queries', () => {
    expect(search(index, '   ')).toEqual([]);
    expect(search(index, 'zzzzqqq')).toEqual([]);
  });

  it('fuzzy scores are bounded and zero for non-subsequences', () => {
    expect(fuzzy('abc', 'xyz')).toBe(0);
    const s = fuzzy('nah', 'nahida');
    expect(s).toBeGreaterThan(0.8);
    expect(s).toBeLessThanOrEqual(1);
  });
});
