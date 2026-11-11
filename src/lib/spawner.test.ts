import { describe, expect, it } from 'vitest';
import materials from '../../public/data/materials.json';
import furniture from '../../public/data/furniture.json';
import weapons from '../../public/data/weapons.json';
import type { Furniture, Material, Weapon } from '@/data/types';
import { addLine, applyServerCatalog, batchProblems, buildEntries, checkAmount, maxGive, ownedCounts, quickAmounts } from './spawner';

const entries = buildEntries(materials as Material[], furniture as Furniture[], weapons as Weapon[]);
const byId = new Map(entries.map((e) => [e.id, e]));
const limits = { maxStackAmount: 1_000_000, maxUnstackableAmount: 50 };

describe('spawn entries from the real catalog', () => {
  it('classifies known items with their own ids', () => {
    expect(byId.get(201)).toMatchObject({ category: 'currency', kind: 'currency' }); // Primogem
    expect(byId.get(202)).toMatchObject({ category: 'currency', kind: 'currency' }); // Mora
    expect(byId.get(104003)).toMatchObject({ category: 'enhancement', kind: 'stackable', stackLimit: 99999 }); // Hero's Wit
    expect(byId.get(11509)).toMatchObject({ category: 'weapon', kind: 'weapon' }); // Mistsplitter Reforged
    expect(byId.get(210001)?.kind).toBe('unlock'); // default namecard
    expect(byId.get(140001)?.kind).toBe('unlock'); // Wings of First Flight (glider)
  });
  it('marks what the server cannot give, with a reason', () => {
    const cards = entries.filter((e) => e.reason === 'USE_CHARACTER_BUILDER');
    expect(cards.length).toBeGreaterThan(100);
    expect(cards.every((e) => e.kind === 'unsupported')).toBe(true);
    // Virtual items without a server handler (e.g. 150) are unsupported, the handled ones are not.
    for (const id of [101, 102, 105, 106, 107, 121, 201, 202, 203, 204]) if (byId.has(id)) expect(byId.get(id)!.kind, `#${id}`).toBe('currency');
    expect(entries.filter((e) => e.category === 'currency' && e.kind === 'unsupported').every((e) => e.reason === 'NO_SERVER_HANDLER')).toBe(true);
    expect(byId.get(102)?.countable).toBe(false); // adventure EXP has no balance
  });
  it('every stackable entry has a positive stack limit', () => {
    for (const e of entries) if (e.kind === 'stackable') expect(e.stackLimit, `#${e.id}`).toBeGreaterThanOrEqual(1);
  });
});

describe('quantities', () => {
  const wit = byId.get(104003)!;
  it('respects the stack limit and what the player already has', () => {
    expect(maxGive(wit, 0, limits)).toBe(99999);
    expect(maxGive(wit, 99990, limits)).toBe(9);
    expect(checkAmount(wit, 99990, 10, limits)).toEqual({ code: 'STACK_LIMIT', max: 9 });
    expect(checkAmount(wit, 99990, 9, limits)).toBeNull();
    expect(checkAmount(wit, 0, 0, limits)?.code).toBe('ZERO');
    expect(quickAmounts(wit, 0, limits)).toEqual([1, 10, 100, 1000, 10000, 99999]);
  });
  it('unsupported items accept nothing; unlocks once', () => {
    const card = entries.find((e) => e.reason === 'USE_CHARACTER_BUILDER')!;
    expect(maxGive(card, 0, limits)).toBe(0);
    expect(checkAmount(card, 0, 1, limits)?.code).toBe('UNSUPPORTED');
    expect(maxGive(byId.get(210001)!, undefined, limits)).toBe(1);
  });
  it('weapons are counted per instance and limited per request', () => {
    const owned = ownedCounts([
      { itemId: 11509, count: 1, type: 'ITEM_WEAPON' },
      { itemId: 11509, count: 1, type: 'ITEM_WEAPON' },
      { itemId: 104003, count: 30, type: 'ITEM_MATERIAL' },
    ], { primogems: 5, mora: 7, genesisCrystals: 0 });
    expect(owned.get(11509)).toBe(2);
    expect(owned.get(201)).toBe(5);
    expect(checkAmount(byId.get(11509)!, 2, 51, limits)?.code).toBe('TOO_MANY');
  });
  it('batch lines merge and are checked on their total', () => {
    let batch = addLine([], { itemId: 104003, amount: 60000 }, 50).batch;
    batch = addLine(batch, { itemId: 104003, amount: 50000 }, 50).batch;
    expect(batch).toEqual([{ itemId: 104003, amount: 110000 }]);
    const problems = batchProblems(batch, byId, new Map(), limits);
    expect(problems.get(104003)).toEqual({ code: 'STACK_LIMIT', max: 99999 });
    expect(addLine(batch, { itemId: 202, amount: 1 }, 1).added).toBe(false);
  });
});

describe('server classification wins when connected', () => {
  it('overrides kind, reason and limits', () => {
    const sample = [byId.get(104003)!, byId.get(140001)!, byId.get(201)!];
    const server = [
      { id: 104003, type: 'ITEM_MATERIAL', materialType: 'MATERIAL_EXP_FRUIT', rarity: 4, stackable: true, consumedOnGain: false, kind: 'stackable' as const, supported: true, reason: null, stackLimit: 500, maxAmount: 500 },
      { id: 140001, type: 'ITEM_MATERIAL', materialType: 'MATERIAL_FLYCLOAK', rarity: 4, stackable: true, consumedOnGain: true, kind: 'unsupported' as const, supported: false, reason: 'CONSUMED_ON_GAIN', stackLimit: null, maxAmount: 0 },
    ];
    const out = applyServerCatalog(sample, server);
    expect(out[0]).toMatchObject({ kind: 'stackable', stackLimit: 500, serverChecked: true });
    expect(out[1]).toMatchObject({ kind: 'unsupported', reason: 'CONSUMED_ON_GAIN' });
    expect(out[2]).toMatchObject({ kind: 'unsupported', reason: 'NOT_LOADED' });
  });
});
