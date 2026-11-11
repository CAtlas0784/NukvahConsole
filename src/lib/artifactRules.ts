/**
 * Artifact rules (pure; unit-tested). Mirrors the server's NukvaArtifactRules, which is
 * authoritative and re-checks everything. Used to only ever offer legal choices in the builder.
 *
 * How the game builds a piece: it starts with N distinct substats (5★: 3 or 4, 4★: 2 or 3,
 * 3★: 1 or 2, 2★: 0 or 1, 1★: 0). Every 4 levels adds one roll: a NEW substat type while fewer
 * than 4 exist, otherwise an upgrade of an existing one. No substat may share the main stat's type.
 */
import type { Slot } from '@/data/types';

/** Main stats each slot can have in the game. */
export const SLOT_MAIN_STATS: Record<Slot, readonly string[]> = {
  flower: ['FIGHT_PROP_HP'],
  plume: ['FIGHT_PROP_ATTACK'],
  sands: ['FIGHT_PROP_HP_PERCENT', 'FIGHT_PROP_ATTACK_PERCENT', 'FIGHT_PROP_DEFENSE_PERCENT', 'FIGHT_PROP_ELEMENT_MASTERY', 'FIGHT_PROP_CHARGE_EFFICIENCY'],
  goblet: [
    'FIGHT_PROP_HP_PERCENT',
    'FIGHT_PROP_ATTACK_PERCENT',
    'FIGHT_PROP_DEFENSE_PERCENT',
    'FIGHT_PROP_ELEMENT_MASTERY',
    'FIGHT_PROP_FIRE_ADD_HURT',
    'FIGHT_PROP_WATER_ADD_HURT',
    'FIGHT_PROP_WIND_ADD_HURT',
    'FIGHT_PROP_ELEC_ADD_HURT',
    'FIGHT_PROP_GRASS_ADD_HURT',
    'FIGHT_PROP_ICE_ADD_HURT',
    'FIGHT_PROP_ROCK_ADD_HURT',
    'FIGHT_PROP_PHYSICAL_ADD_HURT',
  ],
  circlet: [
    'FIGHT_PROP_HP_PERCENT',
    'FIGHT_PROP_ATTACK_PERCENT',
    'FIGHT_PROP_DEFENSE_PERCENT',
    'FIGHT_PROP_ELEMENT_MASTERY',
    'FIGHT_PROP_CRITICAL',
    'FIGHT_PROP_CRITICAL_HURT',
    'FIGHT_PROP_HEAL_ADD',
  ],
};

/** The ten substat types, in the order the builder lists them. */
export const SUBSTAT_TYPES = [
  'FIGHT_PROP_CRITICAL',
  'FIGHT_PROP_CRITICAL_HURT',
  'FIGHT_PROP_ATTACK_PERCENT',
  'FIGHT_PROP_HP_PERCENT',
  'FIGHT_PROP_DEFENSE_PERCENT',
  'FIGHT_PROP_ELEMENT_MASTERY',
  'FIGHT_PROP_CHARGE_EFFICIENCY',
  'FIGHT_PROP_ATTACK',
  'FIGHT_PROP_HP',
  'FIGHT_PROP_DEFENSE',
] as const;

export type MainStatOption = { id: number; prop: string };

/** Main stats from the piece's own depot that are legal for its slot (never a global table). */
export function allowedMainStats(slot: Slot, depot: MainStatOption[]): MainStatOption[] {
  const legal = new Set(SLOT_MAIN_STATS[slot]);
  return depot.filter((m) => legal.has(m.prop));
}

/** Starting substat counts (standard rows: rarity-2 or rarity-1; fixed reward variants: their appendPropNum). */
export function allowedStarts(rarity: number, appendPropNum: number): number[] {
  const high = Math.max(0, rarity - 1);
  if (appendPropNum < high) return [Math.max(0, appendPropNum)];
  const low = Math.max(0, rarity - 2);
  return low === high ? [high] : [low, high];
}

/** Upgrade rolls at +plus (one per 4 levels). */
export const upgradesAt = (plus: number) => Math.max(0, Math.floor(plus / 4));

export interface Roll {
  id: number;
  prop: string;
  value: number;
  /** 1 = lowest value of that stat's depot entries. */
  tier: number;
}

export type RollPhase = 'initial' | 'new-type' | 'upgrade' | 'done';

/**
 * What the next roll may be. Initial substats are distinct and not the main stat; each upgrade
 * adds a new type while fewer than 4 exist, otherwise it raises one of the existing four.
 */
export function nextRollChoices(rolls: Roll[], start: number, upgrades: number, mainProp: string | null): { phase: RollPhase; props: string[] } {
  const have = new Set(rolls.map((r) => r.prop));
  const fresh = SUBSTAT_TYPES.filter((p) => p !== mainProp && !have.has(p));
  if (rolls.length < start) return { phase: 'initial', props: fresh };
  if (rolls.length >= start + upgrades) return { phase: 'done', props: [] };
  if (have.size < 4) return { phase: 'new-type', props: fresh };
  return { phase: 'upgrade', props: [...have] };
}

/** Label of a roll's position: "initial" or the level that added it (+4, +8, ...). */
export function rollStage(index: number, start: number): string {
  return index < start ? 'initial' : `+${(index - start + 1) * 4}`;
}

export type RollIssue =
  | 'SUBSTAT_EQUALS_MAIN'
  | 'INVALID_SUBSTAT'
  | 'DUPLICATE_INITIAL_SUBSTAT'
  | 'UPGRADE_BEFORE_FOUR_TYPES'
  | 'TOO_MANY_SUBSTAT_TYPES'
  | 'ROLL_COUNT_MISMATCH'
  | 'MAIN_STAT_NOT_ALLOWED_FOR_SLOT'
  | 'MAIN_STAT_REQUIRED';

/** Same checks as the server's custom mode, for one fixed start count. */
export function validateCustom(opts: { slot: Slot; mainProp: string | null; start: number; plus: number; rolls: Roll[] }): RollIssue[] {
  const issues = new Set<RollIssue>();
  if (!opts.mainProp) issues.add('MAIN_STAT_REQUIRED');
  else if (!SLOT_MAIN_STATS[opts.slot].includes(opts.mainProp)) issues.add('MAIN_STAT_NOT_ALLOWED_FOR_SLOT');
  const seen = new Set<string>();
  opts.rolls.forEach((r, i) => {
    if (!(SUBSTAT_TYPES as readonly string[]).includes(r.prop)) issues.add('INVALID_SUBSTAT');
    if (r.prop === opts.mainProp) issues.add('SUBSTAT_EQUALS_MAIN');
    const isNew = !seen.has(r.prop);
    if (i < opts.start) {
      if (!isNew) issues.add('DUPLICATE_INITIAL_SUBSTAT');
    } else if (seen.size < 4 && !isNew) issues.add('UPGRADE_BEFORE_FOUR_TYPES');
    else if (seen.size >= 4 && isNew) issues.add('TOO_MANY_SUBSTAT_TYPES');
    seen.add(r.prop);
  });
  if (opts.rolls.length !== opts.start + upgradesAt(opts.plus)) issues.add('ROLL_COUNT_MISMATCH');
  return [...issues];
}

/** Per-stat totals in roll order of first appearance (what the game shows on the piece). */
export function substatTotals(rolls: Roll[]): { prop: string; total: number; rolls: number; tiers: number[] }[] {
  const out = new Map<string, { prop: string; total: number; rolls: number; tiers: number[] }>();
  for (const r of rolls) {
    const e = out.get(r.prop) ?? { prop: r.prop, total: 0, rolls: 0, tiers: [] };
    e.total += r.value;
    e.rolls += 1;
    e.tiers.push(r.tier);
    out.set(r.prop, e);
  }
  return [...out.values()];
}

/** Turns stored affix ids back into rolls (for previews of server results and for editing). */
export function rollsFromIds(ids: number[], subs: { id: number; prop: string; value: number }[]): Roll[] {
  const byId = new Map(subs.map((s) => [s.id, s]));
  const tierOf = new Map<number, number>();
  const byProp = new Map<string, { id: number; value: number }[]>();
  for (const s of subs) byProp.set(s.prop, [...(byProp.get(s.prop) ?? []), s]);
  for (const list of byProp.values()) list.sort((a, b) => a.value - b.value).forEach((s, i) => tierOf.set(s.id, i + 1));
  return ids.map((id) => {
    const s = byId.get(id);
    return { id, prop: s?.prop ?? 'UNKNOWN', value: s?.value ?? 0, tier: tierOf.get(id) ?? 0 };
  });
}

/** Tier choices (ascending value) for one substat type in a depot. */
export function tiersFor(prop: string, subs: { id: number; prop: string; value: number }[]): Roll[] {
  return subs
    .filter((s) => s.prop === prop)
    .sort((a, b) => a.value - b.value)
    .map((s, i) => ({ id: s.id, prop, value: s.value, tier: i + 1 }));
}
