import type { ArtifactData, Character, Material, Monster, Scene, TeleportPoint, Weapon } from '@/data/types';
import { SLOTS } from '@/data/types';
import { normalize } from '@/lib/search';

/** What kind of game entity an ID argument refers to. */
/** 'player': online UIDs (live only). 'point': teleport points, inserted as their x y z coordinates. */
export type SuggestKind = 'avatar' | 'weapon' | 'artifact' | 'material' | 'monster' | 'scene' | 'namecard' | 'player' | 'point';

export interface Suggestion {
  id: number;
  kind: SuggestKind;
  en: string;
  th?: string;
  icon?: string | null;
  rarity?: number;
  /** Small secondary line (type, element, slot...). */
  sub: string;
  /** Lower-cased search text, built once. */
  haystack: string;
  /** Text to insert instead of the id (teleport points insert "x y z"). */
  insert?: string;
  /** Shown but not insertable (e.g. a UID the bridge refuses to modify). */
  disabled?: boolean;
  /** Teleport points: the scene the coordinates belong to. */
  scene?: number;
}

/** Online players as UID suggestions; UIDs the bridge refuses (targets policy) are shown disabled. */
export function playerSuggestions(players: { uid: number; nickname: string; adventureRank: number; writable?: boolean }[]): Suggestion[] {
  return players.map((p) => {
    const s = make(p.uid, 'player', p.nickname || `UID ${p.uid}`, undefined, null, undefined, `AR ${p.adventureRank}`);
    if (p.writable === false) s.disabled = true;
    return s;
  });
}

/**
 * Fuzzy match: every character of the query appears in order (subsequence), or the query is one edit
 * away from a word of the same length (typos such as "teleprot"). Returns a score, lower is better,
 * or -1 for no match.
 */
export function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  let i = 0;
  let gaps = 0;
  let last = -1;
  for (const ch of q) {
    const at = t.indexOf(ch, i);
    if (at < 0) {
      i = -1;
      break;
    }
    if (last >= 0 && at > last + 1) gaps++;
    last = at;
    i = at + 1;
  }
  if (i >= 0) return gaps;
  if (q.length >= 4) {
    for (const w of t.split(/[^a-z0-9]+/)) if (Math.abs(w.length - q.length) <= 1 && editDistance(w, q) <= 1) return 10;
  }
  return -1;
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Which catalogs an argument name should be completed from. Handles names such as "itemId",
 * "<avatarId,...>" and "nameCardId|clear|default". Unknown names return no kinds (plain input).
 */
export function kindsForArg(name: string): SuggestKind[] {
  const n = name.toLowerCase();
  const kinds = new Set<SuggestKind>();
  if (n.includes('avatarid')) kinds.add('avatar');
  if (n.includes('itemid')) ['material', 'weapon', 'artifact'].forEach((k) => kinds.add(k as SuggestKind));
  if (n.includes('artifactid')) kinds.add('artifact');
  if (n.includes('weaponid')) kinds.add('weapon');
  if (n.includes('monsterid')) kinds.add('monster');
  if (n.includes('sceneid')) kinds.add('scene');
  if (n.includes('namecardid')) kinds.add('namecard');
  if (/(^|\W|host |_)uid$/.test(n) || n === 'uid' || n.endsWith(' uid')) kinds.add('player');
  // The first coordinate of "<x> <y> <z>": offer teleport points, which fill all three.
  if (n === 'x') kinds.add('point');
  return [...kinds];
}

function make(id: number, kind: SuggestKind, en: string, th: string | undefined, icon: string | null | undefined, rarity: number | undefined, sub: string): Suggestion {
  return { id, kind, en, th, icon, rarity, sub, haystack: normalize(`${en} ${th ?? ''} ${sub} ${id}`) };
}

export interface SuggestData {
  characters?: Character[];
  weapons?: Weapon[];
  artifacts?: ArtifactData;
  materials?: Material[];
  monsters?: Monster[];
  scenes?: Scene[];
  teleports?: TeleportPoint[];
}

/** Flattens the catalog files into suggestions for one kind. */
export function buildSuggestions(kind: SuggestKind, data: SuggestData): Suggestion[] {
  switch (kind) {
    case 'avatar':
      return (data.characters ?? []).map((c) => make(c.id, kind, c.name.en, c.name.th, c.icon, c.rarity, `${c.element} · ${c.weapon}`));
    case 'weapon':
      return (data.weapons ?? []).map((w) => make(w.id, kind, w.name.en, w.name.th, w.icon, w.rarity, w.type));
    case 'artifact': {
      const out: Suggestion[] = [];
      for (const set of data.artifacts?.sets ?? []) {
        for (const slot of SLOTS) {
          for (const p of set.pieces[slot] ?? []) out.push(make(p.id, kind, p.name.en, p.name.th, p.icon, p.rarity, `${set.name.en} · ${slot}`));
        }
      }
      return out;
    }
    case 'material':
      return (data.materials ?? []).filter((m) => m.type !== 'NAMECARD').map((m) => make(m.id, kind, m.name.en, m.name.th, m.icon, m.rarity, m.type.toLowerCase()));
    case 'namecard':
      return (data.materials ?? []).filter((m) => m.type === 'NAMECARD').map((m) => make(m.id, kind, m.name.en, m.name.th, m.icon, m.rarity, 'namecard'));
    case 'monster':
      return (data.monsters ?? []).map((m) => make(m.id, kind, m.name.en, m.name.th, m.icon, undefined, m.type));
    case 'scene':
      return (data.scenes ?? []).map((s) => make(s.id, kind, s.name?.en ?? `Scene ${s.id}`, s.name?.th, null, undefined, s.type));
    case 'point':
      return (data.teleports ?? []).map((p) => {
        const s = make(p.pointId, kind, p.area?.en ?? `${p.kind} #${p.pointId}`, p.area?.th, null, undefined, `scene ${p.sceneId} · ${p.kind} #${p.pointId}`);
        // Same landing rule as the World map's coordinate fallback.
        s.insert = `${p.pos.x.toFixed(2)} ${(p.pos.y + 1.5).toFixed(2)} ${p.pos.z.toFixed(2)}`;
        s.scene = p.sceneId;
        return s;
      });
    case 'player':
      return [];
  }
}

/**
 * Picks the suggestions to show for what the user has typed. An empty query lists the best-known
 * entries first (rarity, then id). Otherwise ID prefix and name-prefix matches rank above substring matches.
 */
export function rankSuggestions(all: Suggestion[], query: string, limit = 40): Suggestion[] {
  const q = normalize(query);
  if (!q) {
    return [...all].sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0) || a.id - b.id).slice(0, limit);
  }
  const scored: { s: Suggestion; score: number }[] = [];
  for (const s of all) {
    if (!s.haystack.includes(q)) continue;
    const idText = String(s.id);
    let score = 3;
    if (idText === q) score = 0;
    else if (idText.startsWith(q)) score = 1;
    else if (normalize(s.en).startsWith(q) || (s.th && normalize(s.th).startsWith(q))) score = 1;
    else if (normalize(s.en).split(' ').some((w) => w.startsWith(q))) score = 2;
    scored.push({ s, score });
  }
  // Nothing contains the text: fall back to fuzzy name matching (typos, skipped letters).
  if (scored.length === 0 && q.length >= 3) {
    for (const s of all) {
      const f = fuzzyScore(s.en, q);
      if (f >= 0 && f <= 3) scored.push({ s, score: 4 + f });
      else if (f === 10) scored.push({ s, score: 9 });
    }
  }
  scored.sort((a, b) => a.score - b.score || (b.s.rarity ?? 0) - (a.s.rarity ?? 0) || a.s.id - b.s.id);
  return scored.slice(0, limit).map((x) => x.s);
}

/**
 * Splits a field value into the part that stays and the token being typed. With `multi`, values
 * such as "10000002,10000003" or "a b" complete only the last token.
 */
export function splitLastToken(value: string, multi: boolean): { head: string; token: string } {
  if (!multi) return { head: '', token: value };
  const match = value.match(/^(.*[,\s])([^,\s]*)$/s);
  return match ? { head: match[1], token: match[2] } : { head: '', token: value };
}
