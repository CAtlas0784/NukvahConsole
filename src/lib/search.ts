/**
 * Universal search: ranked matching over every catalog entry by ID, name (EN/TH), internal key,
 * aliases and category words, with a typo-tolerant subsequence fallback. Pure and dependency-free.
 */

export type SearchKind = 'character' | 'weapon' | 'artifact' | 'material' | 'monster' | 'scene' | 'command' | 'page';

export interface SearchDoc<T = unknown> {
  kind: SearchKind;
  id: number | string;
  title: { en: string; th?: string };
  subtitle?: string;
  /** Extra words that should match (internal names, aliases, categories). */
  terms: string[];
  rarity?: number;
  icon?: string | null;
  /** Higher sorts first on equal scores (e.g. playable content over test data). */
  weight?: number;
  ref: T;
}

interface Prepared {
  doc: SearchDoc;
  idText: string;
  names: string[];
  terms: string[];
  compact: string;
}

export interface SearchIndex {
  entries: Prepared[];
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
}

const PREFIXES: Record<string, SearchKind> = {
  c: 'character',
  char: 'character',
  w: 'weapon',
  weapon: 'weapon',
  a: 'artifact',
  set: 'artifact',
  m: 'material',
  item: 'material',
  mon: 'monster',
  monster: 'monster',
  s: 'scene',
  scene: 'scene',
  cmd: 'command',
  p: 'page',
};

export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    // Keep \p{M}: Thai vowels and tone marks are combining marks.
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

export function buildIndex(docs: SearchDoc[]): SearchIndex {
  return {
    entries: docs.map((doc) => {
      const names = [doc.title.en, doc.title.th].filter(Boolean).map((n) => normalize(n as string));
      const terms = doc.terms.map(normalize).filter(Boolean);
      return { doc, idText: String(doc.id).toLowerCase(), names, terms, compact: names.concat(terms).join(' ').replace(/ /g, '') };
    }),
  };
}

/** Subsequence score in [0, 1]; contiguous runs and early matches score higher. */
export function fuzzy(needle: string, hay: string): number {
  if (!needle) return 0;
  let hi = 0;
  let run = 0;
  let score = 0;
  let first = -1;
  for (let ni = 0; ni < needle.length; ni++) {
    const ch = needle[ni];
    let found = -1;
    for (let k = hi; k < hay.length; k++) {
      if (hay[k] === ch) {
        found = k;
        break;
      }
    }
    if (found < 0) return 0;
    if (first < 0) first = found;
    run = found === hi && ni > 0 ? run + 1 : 1;
    score += run;
    hi = found + 1;
  }
  const maxScore = (needle.length * (needle.length + 1)) / 2;
  const density = needle.length / (hi - first);
  return Math.min(1, (score / maxScore) * 0.7 + density * 0.3) * (first < 3 ? 1 : 0.85);
}

function scoreText(q: string, words: string[], text: string): number {
  if (text === q) return 100;
  if (text.startsWith(q)) return 80 - Math.min(10, text.length - q.length) * 0.5;
  const tokens = text.split(' ');
  if (tokens.some((t) => t === q)) return 75;
  if (words.length > 1 && words.every((w) => tokens.some((t) => t.startsWith(w)))) return 70;
  if (tokens.some((t) => t.startsWith(q))) return 64;
  if (text.includes(q)) return 52;
  return 0;
}

export function parseQuery(raw: string): { kind?: SearchKind; text: string } {
  const m = raw.trim().match(/^([a-z]+):\s*(.*)$/i);
  if (m && PREFIXES[m[1].toLowerCase()]) return { kind: PREFIXES[m[1].toLowerCase()], text: m[2] };
  return { text: raw };
}

export function search(index: SearchIndex, raw: string, opts: { kinds?: SearchKind[]; limit?: number } = {}): SearchHit[] {
  const parsed = parseQuery(raw);
  const q = normalize(parsed.text);
  const kinds = parsed.kind ? [parsed.kind] : opts.kinds;
  if (!q) return [];
  const words = q.split(' ');
  const compactQ = q.replace(/ /g, '');
  const numeric = /^\d+$/.test(compactQ);
  const hits: SearchHit[] = [];

  for (const e of index.entries) {
    if (kinds && kinds.length && !kinds.includes(e.doc.kind)) continue;
    let score = 0;
    if (numeric) {
      if (e.idText === compactQ) score = 120;
      else if (e.idText.startsWith(compactQ)) score = 90 - Math.min(20, e.idText.length - compactQ.length);
      else if (compactQ.length >= 4 && e.idText.includes(compactQ)) score = 40;
    }
    if (score < 100) {
      for (const n of e.names) score = Math.max(score, scoreText(q, words, n));
      for (const t of e.terms) score = Math.max(score, scoreText(q, words, t) * 0.88);
    }
    if (score === 0 && compactQ.length >= 3) {
      const f = fuzzy(compactQ, e.compact);
      if (f >= 0.45) score = f * 45;
    }
    if (score > 0) hits.push({ doc: e.doc, score: score + (e.doc.weight ?? 0) + (e.doc.rarity ?? 0) * 0.15 });
  }
  hits.sort((a, b) => b.score - a.score || String(a.doc.title.en).localeCompare(String(b.doc.title.en)));
  return opts.limit ? hits.slice(0, opts.limit) : hits;
}
