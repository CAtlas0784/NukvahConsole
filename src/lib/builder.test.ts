import { describe, expect, it } from 'vitest';
import type { InventoryItem, OwnedAvatar } from '@/api/nukva';
import type { ArtifactData } from '@/data/types';
import { activeSets, indexPieces, isMaxed, minPromote, planMax, slotOf, summaryText } from './builder';

const piece = (id: number, rarity = 5) => ({ id, name: { en: `p${id}` }, rarity, icon: `i${id}`, maxLevel: 21, mainDepot: 1, subDepot: 2, initialSubs: 4 });
const data: ArtifactData = {
  mainProps: {},
  subProps: {},
  sets: [
    { id: 1, name: { en: 'A' }, icon: 'a', maxRarity: 5, bonuses: [{ pieces: 2, text: { en: 'two' } }, { pieces: 4, text: { en: 'four' } }], pieces: { flower: [piece(11)], plume: [piece(12)], sands: [piece(13)], goblet: [piece(14)], circlet: [piece(15)] } },
    { id: 2, name: { en: 'B' }, icon: 'b', maxRarity: 5, bonuses: [{ pieces: 2, text: { en: 'two' } }], pieces: { flower: [piece(21)], plume: [piece(22)] } },
  ],
};

const worn = (itemId: number, slot: string) => ({ itemId, slot, level: 21, mainPropId: 1, appendPropIds: [] });
const avatar = (over: Partial<OwnedAvatar> = {}): OwnedAvatar => ({
  avatarId: 1,
  guid: '1',
  level: 80,
  promoteLevel: 5,
  constellation: 2,
  fetterLevel: 10,
  talents: { normal: { skillId: 1, level: 9 }, skill: { skillId: 2, level: 10 }, burst: { skillId: 3, level: 4 } },
  weapon: { itemId: 1, level: 70, promoteLevel: 4, refinement: 1 },
  artifacts: [],
  ...over,
});

describe('slotOf', () => {
  it('maps the five engine slots and rejects others', () => {
    expect(['EQUIP_BRACER', 'EQUIP_NECKLACE', 'EQUIP_SHOES', 'EQUIP_RING', 'EQUIP_DRESS'].map(slotOf)).toEqual(['flower', 'plume', 'sands', 'goblet', 'circlet']);
    expect(slotOf('EQUIP_WEAPON')).toBeNull();
    expect(slotOf(undefined)).toBeNull();
  });
});

describe('minPromote', () => {
  it('matches the server ascension rule', () => {
    expect([1, 20, 21, 40, 41, 50, 51, 60, 61, 70, 71, 80, 81, 90].map(minPromote)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
});

describe('activeSets', () => {
  const index = indexPieces(data);
  it('activates 2pc and 4pc by count and ignores single pieces', () => {
    const sets = activeSets([worn(11, 'EQUIP_BRACER'), worn(12, 'EQUIP_NECKLACE'), worn(13, 'EQUIP_SHOES'), worn(14, 'EQUIP_RING'), worn(21, 'EQUIP_BRACER')], index);
    expect(sets).toHaveLength(1);
    expect(sets[0].count).toBe(4);
    expect(sets[0].bonuses.map((b) => b.active)).toEqual([true, true]);
  });
  it('marks the 4pc bonus inactive at two pieces', () => {
    const sets = activeSets([worn(11, 'EQUIP_BRACER'), worn(12, 'EQUIP_NECKLACE')], index);
    expect(sets[0].bonuses.map((b) => b.active)).toEqual([true, false]);
  });
  it('is empty with no matching sets', () => {
    expect(activeSets([worn(999, 'EQUIP_BRACER')], index)).toEqual([]);
  });
});

describe('planMax', () => {
  const inv = (guid: string, itemId: number, slot: string, level: number, equipped = 0): InventoryItem => ({
    guid,
    itemId,
    type: 'ITEM_RELIQUARY',
    count: 1,
    level,
    slot,
    appendPropIds: [1, 2],
    equippedAvatarId: equipped || undefined,
  });
  const rank = (id: number) => (id >= 100 ? 5 : 4);

  it('lists only changes and fills empty slots with the best free artifact', () => {
    const items = [inv('5', 101, 'EQUIP_BRACER', 1), inv('6', 102, 'EQUIP_BRACER', 21), inv('7', 50, 'EQUIP_BRACER', 21), inv('8', 103, 'EQUIP_NECKLACE', 21, 77)];
    const changes = planMax(avatar(), items, rank);
    expect(changes.map((c) => c.field)).toEqual(['level', 'constellation', 'normal', 'burst', 'weapon', 'artifact.flower']);
    expect(changes.find((c) => c.field === 'artifact.flower')?.guid).toBe('6');
  });
  it('never takes an artifact worn by someone else and skips filled slots', () => {
    const changes = planMax(avatar({ artifacts: [worn(11, 'EQUIP_BRACER')] }), [inv('8', 103, 'EQUIP_BRACER', 21), inv('9', 104, 'EQUIP_NECKLACE', 21, 77)], rank);
    expect(changes.some((c) => c.field.startsWith('artifact.'))).toBe(false);
  });
  it('is empty for a fully built character', () => {
    const full = avatar({ level: 90, constellation: 6, talents: { normal: { skillId: 1, level: 10 }, skill: { skillId: 2, level: 10 }, burst: { skillId: 3, level: 10 } }, weapon: { itemId: 1, level: 90, promoteLevel: 6, refinement: 5 } });
    expect(planMax(full, [], rank)).toEqual([]);
    expect(isMaxed(full)).toBe(true);
    expect(isMaxed(avatar())).toBe(false);
  });
});

describe('summaryText', () => {
  const labels = { level: 'Level', talents: 'Talents', weapon: 'Weapon', artifacts: 'Artifacts', none: '—' };
  it('renders a stable block', () => {
    const text = summaryText({ name: 'Diluc', id: 10000016, level: 90, constellation: 6, talents: { normal: 10, skill: 10, burst: 10 }, weapon: 'Wolf Lv90 R5', artifacts: [{ slot: 'Flower', label: '+20' }] }, labels);
    expect(text).toBe('Diluc (#10000016)\nLevel: 90 · C6\nTalents: 10/10/10\nWeapon: Wolf Lv90 R5\nArtifacts:\n  Flower: +20');
  });
  it('says none for an empty build', () => {
    expect(summaryText({ name: 'X', id: 1, level: 1, constellation: 0, talents: null, weapon: null, artifacts: [] }, labels)).toContain('Weapon: —');
  });
});
