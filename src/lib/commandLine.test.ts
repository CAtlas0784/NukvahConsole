import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { CommandInfo } from '@/data/types';
import { argState, completeToken, findCommand, parseLine, suggestCommands, validateLine } from './commandLine';

// Real command metadata, generated from the server's @Command annotations.
const commands: CommandInfo[] = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/data/commands.json'), 'utf8')) as CommandInfo[]).map((c) => ({
  ...c,
  executable: c.label !== 'stop',
}));
const give = findCommand(commands, 'give')!;

describe('command line', () => {
  it('parses name, args and the token under the cursor', () => {
    expect(parseLine('/give 1000')).toMatchObject({ name: 'give', args: ['1000'], current: '1000', typingName: false });
    expect(parseLine('/gi')).toMatchObject({ name: 'gi', typingName: true });
    expect(parseLine('give 11509 ')).toMatchObject({ current: '' });
  });

  it('finds commands by label or alias and ranks prefixes first', () => {
    expect(findCommand(commands, 'G')?.label).toBe('give');
    expect(findCommand(commands, 'tp')?.label).toBe('teleport');
    expect(suggestCommands(commands, 'te')[0].label).toMatch(/^te/);
    expect(suggestCommands(commands, '/gi').map((c) => c.label)).toContain('give');
  });

  it('knows which parameter is typed and what catalog completes it', () => {
    const first = argState(give, parseLine('/give 1150'));
    expect(first.kinds).toEqual(expect.arrayContaining(['avatar', 'weapon']));
    const level = argState(give, parseLine('/give 11509 lv'));
    expect(level.active?.type === 'arg' && level.active.prefix).toBe('lv');
    const talent = findCommand(commands, 'talent')!;
    expect(argState(talent, parseLine('/talent ')).options).toEqual(expect.arrayContaining(['set', 'n', 'e', 'q', 'all', 'getid']));
  });

  it('validates required arguments, targets and executability', () => {
    expect(validateLine(commands, '/give').problems.map((p) => p.code)).toContain('missing');
    expect(validateLine(commands, '/give 11509 lv90 r5').problems).toEqual([]);
    expect(validateLine(commands, '/teleport 1 2 3').problems).toEqual([]);
    expect(validateLine(commands, '/teleport 1 2').problems.map((p) => p.code)).toContain('missing');
    expect(validateLine(commands, '/give 202 @10004').problems.map((p) => p.code)).toContain('target');
    expect(validateLine(commands, '/nosuch').problems[0].code).toBe('unknown');
    expect(validateLine(commands, '/stop').problems.map((p) => p.code)).toContain('notExecutable');
  });

  it('flags dangerous commands', () => {
    expect(validateLine(commands, '/clear all').dangerous).toBe(true);
    expect(validateLine(commands, '/give 202 x10').dangerous).toBe(false);
  });

  it('completes the token under the cursor', () => {
    expect(completeToken('/gi', 'give')).toBe('/give ');
    expect(completeToken('/give 115', '11509')).toBe('/give 11509 ');
    expect(completeToken('/give ', '202')).toBe('/give 202 ');
  });
});
