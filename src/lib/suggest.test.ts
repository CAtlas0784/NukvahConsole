import { describe, expect, it } from 'vitest';
import type { CommandInfo } from '@/data/types';
import { CATEGORIES, categoryOf, groupByCategory } from './commandCategories';
import { buildSuggestions, kindsForArg, rankSuggestions, splitLastToken } from './suggest';

const cmd = (label: string): CommandInfo => ({ label, aliases: [], usage: [], permission: '', permissionTargeted: '', targetRequirement: 'NONE', description: null });

describe('kindsForArg', () => {
  it('maps ID argument names to catalogs', () => {
    expect(kindsForArg('sceneId')).toEqual(['scene']);
    expect(kindsForArg('monsterId')).toEqual(['monster']);
    expect(kindsForArg('avatarId,...')).toEqual(['avatar']);
    expect(kindsForArg('<itemId> <avatarId>').sort()).toEqual(['artifact', 'avatar', 'material', 'weapon']);
    expect(kindsForArg('nameCardId|clear|default|reset')).toEqual(['namecard']);
  });
  it('returns nothing for plain arguments', () => {
    expect(kindsForArg('x')).toEqual(['point']); // Part 6: the first coordinate offers teleport points
    expect(kindsForArg('level')).toEqual([]);
    expect(kindsForArg('gadgetId')).toEqual([]);
  });
});

describe('buildSuggestions + rankSuggestions', () => {
  const scenes = buildSuggestions('scene', {
    scenes: [
      { id: 3, type: 'world', script: null, name: { en: 'Teyvat', th: 'เทย์วัต' } },
      { id: 1001, type: 'dungeon', script: null, name: null },
      { id: 31, type: 'world', script: null, name: { en: 'Enkanomiya' } },
    ],
  });
  it('names scenes without a catalog name by their ID', () => {
    expect(scenes.find((s) => s.id === 1001)?.en).toBe('Scene 1001');
  });
  it('lists best entries first for an empty query and respects the limit', () => {
    expect(rankSuggestions(scenes, '', 2).map((s) => s.id)).toEqual([3, 31]);
  });
  it('ranks an exact ID, then ID prefix, above substring matches', () => {
    expect(rankSuggestions(scenes, '3').map((s) => s.id)).toEqual([3, 31]);
    expect(rankSuggestions(scenes, '1001')[0].id).toBe(1001);
  });
  it('matches names in English and Thai, ignoring case', () => {
    expect(rankSuggestions(scenes, 'ENKA').map((s) => s.id)).toEqual([31]);
    expect(rankSuggestions(scenes, 'เทย์').map((s) => s.id)).toEqual([3]);
    expect(rankSuggestions(scenes, 'zzz')).toEqual([]);
  });
  it('separates namecards from other materials', () => {
    const materials = [
      { id: 1, name: { en: 'Mora' }, type: 'MATERIAL_NONE', item: 'virtual' as const, rarity: 1, icon: 'a' },
      { id: 2, name: { en: 'Card' }, type: 'NAMECARD', item: 'material' as const, rarity: 4, icon: 'b' },
    ];
    expect(buildSuggestions('material', { materials }).map((s) => s.id)).toEqual([1]);
    expect(buildSuggestions('namecard', { materials }).map((s) => s.id)).toEqual([2]);
  });
});

describe('splitLastToken', () => {
  it('completes the whole value for single fields', () => {
    expect(splitLastToken('1000', false)).toEqual({ head: '', token: '1000' });
  });
  it('completes only the last item of a list', () => {
    expect(splitLastToken('10000002,100', true)).toEqual({ head: '10000002,', token: '100' });
    expect(splitLastToken('a b ', true)).toEqual({ head: 'a b ', token: '' });
    expect(splitLastToken('solo', true)).toEqual({ head: '', token: 'solo' });
  });
});

describe('command categories', () => {
  it('assigns known commands case-insensitively and defaults to tools', () => {
    expect(categoryOf('give')).toBe('items');
    expect(categoryOf('GameSpeed')).toBe('world');
    expect(categoryOf('setStats')).toBe('character');
    expect(categoryOf('quest')).toBe('progress');
    expect(categoryOf('ban')).toBe('server');
    expect(categoryOf('somethingNew')).toBe('tools');
  });
  it('groups every command exactly once', () => {
    const groups = groupByCategory(['give', 'teleport', 'ban', 'mystery'].map(cmd));
    expect(CATEGORIES.map((c) => groups.get(c)!.length)).toEqual([0, 1, 1, 0, 1, 1]);
  });
});
