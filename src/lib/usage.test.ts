import { describe, expect, it } from 'vitest';
import { buildCommand, isFlag, parseUsage } from './usage';

describe('parseUsage', () => {
  it('parses choices, prefixed args and optional args', () => {
    const parts = parseUsage('(<itemId>|<avatarId>|all|weapons) [lv<level>] [r<refinement>] [x<amount>]');
    expect(parts[0]).toMatchObject({ type: 'choice', options: ['<itemId>', '<avatarId>', 'all', 'weapons'], optional: false });
    expect(parts[1]).toMatchObject({ type: 'arg', prefix: 'lv', name: 'level', optional: true });
    expect(parts[3]).toMatchObject({ type: 'arg', prefix: 'x', name: 'amount' });
  });

  it('handles literals, required args and repeats', () => {
    const parts = parseUsage('set <talentId> <level>');
    expect(parts[0]).toEqual({ type: 'literal', text: 'set' });
    expect(parts[1]).toMatchObject({ type: 'arg', name: 'talentId', optional: false });
    const rep = parseUsage('<artifactId> [<appendPropId>[,<times>]]...');
    expect(rep[1]).toMatchObject({ type: 'arg', repeat: true, optional: true });
  });

  it('treats bare optional words as flags', () => {
    const parts = parseUsage('[all]');
    expect(isFlag(parts[0])).toBe(true);
  });
});

describe('buildCommand', () => {
  it('assembles values with prefixes and reports missing required fields', () => {
    const parts = parseUsage('(<itemId>|all) [lv<level>] [x<amount>]');
    const built = buildCommand('give', parts, { p0: '11509', p1: '90', p2: '' });
    expect(built.command).toBe('give 11509 lv90');
    expect(built.missing).toEqual([]);
    expect(buildCommand('give', parts, {}).missing).toEqual(['<itemId>|all']);
  });

  it('expands repeated arguments', () => {
    const parts = parseUsage('<artifactId> [<appendPropId>]...');
    expect(buildCommand('give', parts, { p0: '94544', p1: '501204 501064' }).command).toBe('give 94544 501204 501064');
  });
});
