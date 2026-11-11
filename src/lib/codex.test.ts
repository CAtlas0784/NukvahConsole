import { describe, expect, it } from 'vitest';
import commands from '../../public/data/commands.json';
import teleports from '../../public/data/teleports.json';
import type { CommandInfo, TeleportPoint } from '@/data/types';
import { argSpecs, examplesFor, findCommand, suggestCommands, typedAlternatives, validateLine } from './commandLine';
import { buildSuggestions, editDistance, fuzzyScore, kindsForArg, playerSuggestions, rankSuggestions } from './suggest';

const all = commands as CommandInfo[];

describe('fuzzy command search', () => {
  it('finds commands by skipped letters, typos and aliases', () => {
    expect(suggestCommands(all, 'teleprot')[0]?.label).toBe('teleport');
    expect(suggestCommands(all, 'tlprt').map((c) => c.label)).toContain('teleport');
    expect(suggestCommands(all, 'g')[0]?.label).toBe('give'); // alias g / label prefix
    expect(suggestCommands(all, 'zzzzqqq')).toEqual([]);
    expect(editDistance('teleprot', 'teleport')).toBe(1); // transposition
    expect(fuzzyScore('teleport', 'tp')).toBeGreaterThanOrEqual(0);
  });
  it('fuzzy item names still find the exact item', () => {
    const items = buildSuggestions('material', { materials: [{ id: 104003, name: { en: "Hero's Wit" }, type: 'EXP_FRUIT', item: 'material', rarity: 4, icon: 'UI_ItemIcon_104003' }] });
    expect(rankSuggestions(items, 'hrs wt')[0]?.id).toBe(104003); // skipped letters
  });
});

describe('generated examples are valid lines', () => {
  it('every example passes the same check the Execute button uses (no missing parts)', () => {
    let count = 0;
    for (const c of all) {
      for (const ex of examplesFor(c)) {
        const v = validateLine(all, ex);
        expect(v.command?.label, ex).toBe(c.label);
        expect(v.problems.filter((p) => p.code === 'missing' || p.code === 'unknown'), ex).toEqual([]);
        count++;
      }
    }
    expect(count).toBeGreaterThan(40);
  });
  it('uses real catalog ids', () => {
    const give = findCommand(all, 'give')!;
    expect(examplesFor(give)[0]).toMatch(/^give 104003\b/);
    expect(examplesFor(findCommand(all, 'teleport')!)).toEqual(['teleport 2154.55 236.31 -1638.24']);
  });
});

describe('argument metadata', () => {
  it('types, required/optional and kinds come from the usage text', () => {
    const tp = argSpecs('<x> <y> <z> [sceneId]');
    expect(tp.map((a) => [a.name, a.required, a.type])).toEqual([
      ['x', true, 'coordinate'],
      ['y', true, 'coordinate'],
      ['z', true, 'coordinate'],
      ['sceneId', false, 'id'],
    ]);
    const give = argSpecs(findCommand(all, 'give')!.usage[0]);
    expect(give[0].type).toBe('choice');
    expect(give[0].kinds).toEqual(expect.arrayContaining(['material', 'weapon', 'avatar']));
    expect(give.find((a) => a.text === 'lv<level>')).toMatchObject({ required: false, type: 'number' });
  });
  it('uid and coordinate arguments get live players and teleport points', () => {
    expect(kindsForArg('host UID')).toContain('player');
    expect(kindsForArg('uid')).toContain('player');
    expect(kindsForArg('x')).toEqual(['point']);
    const points = buildSuggestions('point', { teleports: teleports as TeleportPoint[] });
    const statue = points.find((s) => s.sub.includes('statue'))!;
    expect(statue.insert).toMatch(/^-?\d+\.\d{2} -?\d+\.\d{2} -?\d+\.\d{2}$/);
    const players = playerSuggestions([
      { uid: 10163, nickname: 'test', adventureRank: 1, writable: true },
      { uid: 10004, nickname: 'real', adventureRank: 60, writable: false },
    ]);
    expect(players.map((p) => [p.id, !!p.disabled])).toEqual([
      [10163, false],
      [10004, true],
    ]);
  });
  it('typed pages are offered for commands that have one', () => {
    expect(typedAlternatives(findCommand(all, 'give')!).map((a) => a.key)).toContain('spawner');
    expect(typedAlternatives(findCommand(all, 'teleport')!).map((a) => a.to)).toEqual(['/world']);
    expect(typedAlternatives(findCommand(all, 'heal')!)).toEqual([]);
  });
});
