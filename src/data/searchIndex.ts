import { useEffect, useState } from 'react';
import { loadCatalog } from './catalog';
import { buildIndex, type SearchDoc, type SearchIndex } from '@/lib/search';
import type { ArtifactSet, Character, CommandInfo, Material, Monster, Scene, Weapon } from './types';

export interface PageRef {
  path: string;
  key: string;
}

export const PAGES: { path: string; key: string; terms: string[] }[] = [
  { path: '/', key: 'nav.dashboard', terms: ['dashboard', 'home', 'status', 'overview'] },
  { path: '/search', key: 'nav.search', terms: ['search', 'find', 'lookup', 'id'] },
  { path: '/characters', key: 'nav.characters', terms: ['avatar', 'character', 'constellation', 'talent', 'level'] },
  { path: '/inventory', key: 'nav.inventory', terms: ['items', 'give', 'materials', 'batch', 'mora', 'primogem'] },
  { path: '/armory', key: 'nav.armory', terms: ['weapon', 'artifact', 'reliquary', 'refine', 'substat', 'builder'] },
  { path: '/world', key: 'nav.world', terms: ['world level', 'teleport', 'spawn', 'scene', 'monster'] },
  { path: '/commands', key: 'nav.commands', terms: ['commands', 'gm', 'console', 'help'] },
  { path: '/presets', key: 'nav.presets', terms: ['presets', 'import', 'export', 'json'] },
  { path: '/settings', key: 'nav.settings', terms: ['settings', 'language', 'thai', 'motion', 'connection'] },
];

const ELEMENT_WORDS: Record<string, string[]> = {
  pyro: ['pyro', 'fire', 'ไฟ'],
  hydro: ['hydro', 'water', 'น้ำ'],
  anemo: ['anemo', 'wind', 'ลม'],
  electro: ['electro', 'lightning', 'สายฟ้า'],
  dendro: ['dendro', 'grass', 'พฤกษา'],
  cryo: ['cryo', 'ice', 'น้ำแข็ง'],
  geo: ['geo', 'rock', 'หิน'],
  multi: ['traveler'],
  none: [],
};

const splitCamel = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');

export async function buildCatalogIndex(pageTitle: (key: string) => { en: string; th?: string }): Promise<SearchIndex> {
  const [characters, weapons, artifacts, materials, monsters, scenes, commands] = await Promise.all([
    loadCatalog('characters'),
    loadCatalog('weapons'),
    loadCatalog('artifacts'),
    loadCatalog('materials'),
    loadCatalog('monsters'),
    loadCatalog('scenes'),
    loadCatalog('commands'),
  ]);

  const docs: SearchDoc[] = [];
  for (const p of PAGES) docs.push({ kind: 'page', id: p.path, title: pageTitle(p.key), terms: p.terms, weight: 6, ref: p });
  for (const c of characters as Character[]) {
    docs.push({
      kind: 'character',
      id: c.id,
      title: c.name,
      subtitle: `${c.element} · ${c.weapon}`,
      terms: [c.key, splitCamel(c.key), ...(ELEMENT_WORDS[c.element] ?? []), c.weapon, 'character', 'avatar'],
      rarity: c.rarity,
      icon: c.icon,
      weight: 8,
      ref: c,
    });
  }
  for (const w of weapons as Weapon[]) {
    docs.push({ kind: 'weapon', id: w.id, title: w.name, subtitle: w.type, terms: [w.type, 'weapon', (w.icon ?? w.gameIcon ?? '').replace('UI_EquipIcon_', '')], rarity: w.rarity, icon: w.icon, weight: 5, ref: w });
  }
  for (const s of (artifacts as { sets: ArtifactSet[] }).sets) {
    const pieceNames = Object.values(s.pieces).flatMap((list) => (list ?? []).slice(0, 1).map((p) => p.name.en));
    docs.push({ kind: 'artifact', id: s.id, title: s.name, subtitle: 'artifact set', terms: ['artifact', 'set', 'reliquary', ...pieceNames], rarity: s.maxRarity, icon: s.icon, weight: 5, ref: s });
  }
  for (const m of materials as Material[]) {
    docs.push({ kind: 'material', id: m.id, title: m.name, subtitle: splitCamel(m.type.toLowerCase()), terms: [m.type.replace(/_/g, ' ').toLowerCase(), m.item], rarity: m.rarity, icon: m.icon, weight: m.type === 'QUEST' || m.type.startsWith('GCG') ? -2 : 2, ref: m });
  }
  for (const m of monsters as Monster[]) {
    docs.push({ kind: 'monster', id: m.id, title: m.name, subtitle: m.type, terms: [m.key, splitCamel(m.key), m.type, 'monster', 'enemy'], icon: m.icon, weight: m.type === 'boss' ? 2 : 0, ref: m });
  }
  for (const s of scenes as Scene[]) {
    const title = s.name ?? { en: s.script ? splitCamel(s.script.replace(/_LevelStreaming$/, '')) : `Scene ${s.id}` };
    docs.push({ kind: 'scene', id: s.id, title, subtitle: s.type, terms: [s.type, s.script ?? '', 'scene', 'teleport'], weight: s.type === 'world' ? 3 : -1, ref: s });
  }
  for (const c of commands as CommandInfo[]) {
    docs.push({ kind: 'command', id: c.label, title: { en: c.label }, subtitle: c.description ?? c.usage[0] ?? '', terms: [...c.aliases, c.description ?? '', 'command'], weight: 4, ref: c });
  }
  return buildIndex(docs);
}

let shared: Promise<SearchIndex> | null = null;
let sharedLang = '';

/** Builds the universal index once per language and shares it between palette and search page. */
export function useSearchIndex(lang: string, pageTitle: (key: string) => { en: string; th?: string }) {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!shared || sharedLang !== lang) {
      sharedLang = lang;
      shared = buildCatalogIndex(pageTitle);
      shared.catch(() => {
        shared = null;
      });
    }
    let alive = true;
    shared.then(
      (i) => alive && setIndex(i),
      (e) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  return { index, error };
}
