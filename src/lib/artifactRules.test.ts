import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  allowedMainStats,
  allowedStarts,
  nextRollChoices,
  rollStage,
  rollsFromIds,
  SLOT_MAIN_STATS,
  substatTotals,
  SUBSTAT_TYPES,
  tiersFor,
  upgradesAt,
  validateCustom,
  type Roll,
} from './artifactRules';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const artifacts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/artifacts.json'), 'utf8')) as {
  sets: { id: number; pieces: Record<string, { id: number; rarity: number; mainDepot: number; subDepot: number; initialSubs: number }[]> }[];
  mainProps: Record<string, { id: number; prop: string }[]>;
  subProps: Record<string, { id: number; prop: string; value: number }[]>;
};
const gladiator = artifacts.sets.find((s) => s.id === 15001)!;
const piece = (slot: string) => gladiator.pieces[slot].find((p) => p.rarity === 5)!;
const subs = artifacts.subProps[String(piece('sands').subDepot)];
const roll = (prop: string, tier = 4): Roll => tiersFor(prop, subs)[tier - 1];

describe('main stats come from the piece depot and the slot rule', () => {
  it('each of the five 5★ slots offers exactly its legal main stats', () => {
    for (const slot of ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const) {
      const p = piece(slot);
      const options = allowedMainStats(slot, artifacts.mainProps[String(p.mainDepot)] ?? []);
      expect(options.map((o) => o.prop).sort(), slot).toEqual([...SLOT_MAIN_STATS[slot]].sort());
    }
  });
  it('flat stats and resistance never appear for sands', () => {
    const options = allowedMainStats('sands', artifacts.mainProps[String(piece('sands').mainDepot)]).map((o) => o.prop);
    expect(options).not.toContain('FIGHT_PROP_HP');
    expect(options).not.toContain('FIGHT_PROP_ATTACK');
    expect(options.some((p) => p.endsWith('_SUB_HURT'))).toBe(false);
  });
});

describe('substat depot', () => {
  it('has exactly the ten substat types, each with its own tiers (5★: 4 tiers)', () => {
    expect([...new Set(subs.map((s) => s.prop))].sort()).toEqual([...SUBSTAT_TYPES].sort());
    for (const prop of SUBSTAT_TYPES) {
      const tiers = tiersFor(prop, subs);
      expect(tiers.length, prop).toBe(4);
      expect(tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4]);
      expect(tiers.every((t, i) => i === 0 || t.value > tiers[i - 1].value)).toBe(true);
    }
  });
});

describe('starts and levels', () => {
  it('derives starting counts and upgrades', () => {
    expect(allowedStarts(5, 4)).toEqual([3, 4]);
    expect(allowedStarts(4, 3)).toEqual([2, 3]);
    expect(allowedStarts(1, 0)).toEqual([0]);
    expect(allowedStarts(5, 1)).toEqual([1]);
    expect(upgradesAt(0)).toBe(0);
    expect(upgradesAt(3)).toBe(0);
    expect(upgradesAt(4)).toBe(1);
    expect(upgradesAt(20)).toBe(5);
    expect(rollStage(3, 4)).toBe('initial');
    expect(rollStage(4, 4)).toBe('+4');
    expect(rollStage(8, 4)).toBe('+20');
  });
});

describe('roll sequencing', () => {
  it('only offers legal next rolls', () => {
    const main = 'FIGHT_PROP_ATTACK_PERCENT';
    let rolls: Roll[] = [];
    expect(nextRollChoices(rolls, 3, 5, main)).toMatchObject({ phase: 'initial' });
    expect(nextRollChoices(rolls, 3, 5, main).props).not.toContain(main);
    rolls = [roll('FIGHT_PROP_CRITICAL'), roll('FIGHT_PROP_CRITICAL_HURT'), roll('FIGHT_PROP_HP')];
    const afterThree = nextRollChoices(rolls, 3, 5, main);
    expect(afterThree.phase).toBe('new-type');
    expect(afterThree.props).not.toContain('FIGHT_PROP_CRITICAL');
    rolls.push(roll('FIGHT_PROP_CHARGE_EFFICIENCY'));
    const afterFour = nextRollChoices(rolls, 3, 5, main);
    expect(afterFour.phase).toBe('upgrade');
    expect(afterFour.props.sort()).toEqual(['FIGHT_PROP_CHARGE_EFFICIENCY', 'FIGHT_PROP_CRITICAL', 'FIGHT_PROP_CRITICAL_HURT', 'FIGHT_PROP_HP'].sort());
    for (let i = 0; i < 4; i++) rolls.push(roll('FIGHT_PROP_CRITICAL'));
    expect(nextRollChoices(rolls, 3, 5, main).phase).toBe('done');
    expect(validateCustom({ slot: 'sands', mainProp: main, start: 3, plus: 20, rolls })).toEqual([]);
    const totals = substatTotals(rolls);
    const crit = totals.find((t) => t.prop === 'FIGHT_PROP_CRITICAL')!;
    expect(crit.rolls).toBe(5);
    expect(crit.total).toBeCloseTo(tiersFor('FIGHT_PROP_CRITICAL', subs)[3].value * 5, 6);
  });

  it('rejects impossible configurations', () => {
    const base = { slot: 'sands' as const, mainProp: 'FIGHT_PROP_ATTACK_PERCENT', start: 4, plus: 0 };
    expect(validateCustom({ ...base, rolls: [roll('FIGHT_PROP_ATTACK_PERCENT'), roll('FIGHT_PROP_HP'), roll('FIGHT_PROP_DEFENSE'), roll('FIGHT_PROP_CRITICAL')] })).toContain('SUBSTAT_EQUALS_MAIN');
    expect(validateCustom({ ...base, rolls: [roll('FIGHT_PROP_HP'), roll('FIGHT_PROP_HP'), roll('FIGHT_PROP_DEFENSE'), roll('FIGHT_PROP_CRITICAL')] })).toContain('DUPLICATE_INITIAL_SUBSTAT');
    expect(validateCustom({ ...base, rolls: [roll('FIGHT_PROP_HP'), roll('FIGHT_PROP_DEFENSE'), roll('FIGHT_PROP_CRITICAL')] })).toContain('ROLL_COUNT_MISMATCH');
    expect(validateCustom({ ...base, start: 3, plus: 4, rolls: [roll('FIGHT_PROP_HP'), roll('FIGHT_PROP_DEFENSE'), roll('FIGHT_PROP_CRITICAL'), roll('FIGHT_PROP_CRITICAL')] })).toContain('UPGRADE_BEFORE_FOUR_TYPES');
    expect(validateCustom({ ...base, mainProp: 'FIGHT_PROP_HP', rolls: [] })).toContain('MAIN_STAT_NOT_ALLOWED_FOR_SLOT');
    expect(validateCustom({ ...base, mainProp: null, rolls: [] })).toContain('MAIN_STAT_REQUIRED');
  });

  it('reads stored affix ids back into rolls with their tiers', () => {
    const r = [roll('FIGHT_PROP_CRITICAL', 2), roll('FIGHT_PROP_HP', 1)];
    expect(rollsFromIds(r.map((x) => x.id), subs)).toEqual(r);
  });
});
