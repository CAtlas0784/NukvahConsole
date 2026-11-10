/**
 * A typed command line for the Command Codex: completes command names, works out which usage
 * parameter is being typed, and checks the line before it is sent. Driven only by the command
 * metadata the server publishes (`GET /commands`, or the snapshot generated from the same
 * `@Command` annotations), so there is no second hand-written command list. Pure; unit-tested.
 */
import type { CommandInfo } from '@/data/types';
import { normalize } from '@/lib/search';
import { fuzzyScore, kindsForArg, type SuggestKind } from '@/lib/suggest';
import { parseUsage, type UsagePart } from '@/lib/usage';

/**
 * Commands that delete or reset data, act on every entity or player, or change progression in bulk.
 * The Console asks for an explicit acknowledgement before sending them. The server's own allowlist
 * and permission checks still decide whether they run.
 */
export const DANGEROUS_COMMANDS = new Set([
  'clear',
  'killall',
  'killcharacter',
  'resetconst',
  'teleportall',
  'unlockall',
  'resetshoplimit',
  'quest',
  'setprop',
]);

export interface ParsedLine {
  name: string;
  args: string[];
  /** The token under the cursor ('' right after a space). */
  current: string;
  /** True while the first token (the command name) is still being typed. */
  typingName: boolean;
}

export function parseLine(line: string): ParsedLine {
  const text = line.replace(/^\s*\//, '');
  const endsWithSpace = /\s$/.test(text);
  const tokens = text.trim() === '' ? [] : text.trim().split(/\s+/);
  const name = tokens[0] ?? '';
  const args = tokens.slice(1);
  const typingName = tokens.length <= 1 && !endsWithSpace;
  const current = endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '');
  return { name, args, current, typingName };
}

export function findCommand(commands: CommandInfo[], name: string): CommandInfo | undefined {
  const n = name.toLowerCase();
  if (!n) return undefined;
  return commands.find((c) => c.label.toLowerCase() === n) ?? commands.find((c) => c.aliases.some((a) => a.toLowerCase() === n));
}

/** Label prefix, then alias prefix, then label/description substring. */
export function suggestCommands(commands: CommandInfo[], query: string, limit = 12): CommandInfo[] {
  const q = normalize(query.replace(/^\//, ''));
  if (!q) return [...commands].sort((a, b) => a.label.localeCompare(b.label)).slice(0, limit);
  const scored: { c: CommandInfo; s: number }[] = [];
  for (const c of commands) {
    const label = c.label.toLowerCase();
    let s = -1;
    if (label === q) s = 0;
    else if (c.aliases.some((a) => a.toLowerCase() === q)) s = 0.5;
    else if (label.startsWith(q)) s = 1;
    else if (c.aliases.some((a) => a.toLowerCase().startsWith(q))) s = 2;
    else if (label.includes(q)) s = 3;
    else if (normalize(c.description ?? '').includes(q)) s = 4;
    else {
      // Fuzzy: skipped letters ("tlp" -> teleport) or one typo ("teleprot").
      const names = [c.label, ...c.aliases].map((n) => fuzzyScore(n, q)).filter((f) => f >= 0);
      if (names.length) s = 5 + Math.min(...names) / 100;
    }
    if (s >= 0) scored.push({ c, s });
  }
  return scored.sort((a, b) => a.s - b.s || a.c.label.localeCompare(b.c.label)).slice(0, limit).map((x) => x.c);
}

const isPlaceholder = (option: string) => /^<.*>$/.test(option);

export interface ArgState {
  usageIndex: number;
  parts: UsagePart[];
  /** Part the token under the cursor fills, if any. */
  active: UsagePart | null;
  /** Catalog kinds to complete the current token from. */
  kinds: SuggestKind[];
  /** Fixed values offered for the current token (choice options and flags). */
  options: string[];
  /** Required parts not yet given. */
  missing: string[];
  /** Tokens that fit no part of the chosen usage. */
  extra: string[];
}

function partLabel(p: UsagePart): string {
  if (p.type === 'literal') return p.text;
  if (p.type === 'choice') return p.options.join('|');
  return `${p.prefix}<${p.name}>`;
}

/** Matches args against one usage; returns which parts were filled. */
function align(parts: UsagePart[], args: string[]) {
  const filled = new Set<UsagePart>();
  const extra: string[] = [];
  let score = 0;
  const positional = parts.filter((p) => p.type === 'literal' || p.type === 'choice' || (p.type === 'arg' && !p.prefix && !p.flag));
  let cursor = 0;
  for (const arg of args) {
    const lower = arg.toLowerCase();
    const flag = parts.find((p) => p.type === 'arg' && p.flag && p.name.toLowerCase() === lower);
    if (flag) {
      filled.add(flag);
      score += 2;
      continue;
    }
    const prefixed = parts
      .filter((p): p is Extract<UsagePart, { type: 'arg' }> => p.type === 'arg' && !!p.prefix && lower.startsWith(p.prefix.toLowerCase()) && /\d/.test(lower.slice(p.prefix.length, p.prefix.length + 1) || '0'))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];
    if (prefixed && (!filled.has(prefixed) || prefixed.repeat)) {
      filled.add(prefixed);
      score += 2;
      continue;
    }
    const next = positional[cursor];
    if (!next) {
      const last = positional[positional.length - 1];
      if (last && last.type === 'arg' && last.repeat) continue;
      extra.push(arg);
      score -= 2;
      continue;
    }
    if (next.type === 'literal') {
      if (next.text.toLowerCase() === lower) score += 3;
      else score -= 3;
    } else if (next.type === 'choice') {
      const literal = next.options.find((o) => !isPlaceholder(o) && o.toLowerCase() === lower);
      score += literal ? 3 : next.options.some(isPlaceholder) ? 1 : -3;
    } else score += 1;
    filled.add(next);
    if (!(next.type === 'arg' && next.repeat)) cursor++;
  }
  return { filled, extra, score, cursor, positional };
}

/** Picks the usage that best fits what was typed and describes the parameter being typed. */
export function argState(command: CommandInfo, parsed: ParsedLine): ArgState {
  const usages = command.usage.length ? command.usage : [''];
  const done = parsed.current === '' ? parsed.args : parsed.args.slice(0, -1);
  let best = { index: 0, score: -Infinity };
  usages.forEach((u, i) => {
    const { score } = align(parseUsage(u), parsed.args);
    if (score > best.score) best = { index: i, score };
  });
  const parts = parseUsage(usages[best.index]);
  const before = align(parts, done);
  const all = align(parts, parsed.args);

  // Which part is the cursor token for?
  const cur = parsed.current.toLowerCase();
  let active: UsagePart | null = null;
  if (cur) {
    active =
      parts
        .filter((p): p is Extract<UsagePart, { type: 'arg' }> => p.type === 'arg' && !!p.prefix && cur.startsWith(p.prefix.toLowerCase()))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0] ?? null;
  }
  if (!active) active = before.positional[before.cursor] ?? null;
  if (!active && before.positional.length) {
    const last = before.positional[before.positional.length - 1];
    if (last.type === 'arg' && last.repeat) active = last;
  }

  let kinds: SuggestKind[] = [];
  const options: string[] = [];
  if (active?.type === 'arg') kinds = kindsForArg(active.name);
  if (active?.type === 'choice') {
    kinds = kindsForArg(active.options.filter(isPlaceholder).join(' '));
    options.push(...active.options.filter((o) => !isPlaceholder(o)));
  }
  if (active?.type === 'literal') options.push(active.text);
  for (const p of parts) if (p.type === 'arg' && p.flag && !all.filled.has(p)) options.push(p.name);
  // Nothing typed yet: every usage is still possible, so offer the first word of each.
  if (done.length === 0 && usages.length > 1) {
    for (const u of usages) {
      const first = parseUsage(u).find((p) => p.type === 'literal' || p.type === 'choice' || (p.type === 'arg' && !p.prefix && !p.flag));
      if (first?.type === 'literal') options.push(first.text);
      if (first?.type === 'choice') options.push(...first.options.filter((o) => !isPlaceholder(o)));
      if (first?.type === 'arg') kinds = [...new Set([...kinds, ...kindsForArg(first.name)])];
      if (first?.type === 'choice') kinds = [...new Set([...kinds, ...kindsForArg(first.options.filter(isPlaceholder).join(' '))])];
    }
  }

  const missing = parts.filter((p) => p.type !== 'literal' && !p.optional && !all.filled.has(p)).map(partLabel);
  for (const p of parts) if (p.type === 'literal' && !all.filled.has(p) && all.positional.indexOf(p) >= all.cursor) missing.push(p.text);
  return { usageIndex: best.index, parts, active, kinds, options: [...new Set(options)], missing, extra: all.extra };
}

export type LineProblem =
  | { code: 'empty' }
  | { code: 'unknown'; name: string }
  | { code: 'notExecutable'; name: string }
  | { code: 'target'; token: string }
  | { code: 'missing'; parts: string[] };

/** Checks a line before it is offered for execution. The server repeats every check. */
export function validateLine(commands: CommandInfo[], line: string): { command?: CommandInfo; problems: LineProblem[]; dangerous: boolean; normalized: string } {
  const parsed = parseLine(line);
  const normalized = [parsed.name, ...parsed.args].filter(Boolean).join(' ');
  if (!parsed.name) return { problems: [{ code: 'empty' }], dangerous: false, normalized };
  const command = findCommand(commands, parsed.name);
  if (!command) return { problems: [{ code: 'unknown', name: parsed.name }], dangerous: false, normalized };
  const problems: LineProblem[] = [];
  if (!command.executable) problems.push({ code: 'notExecutable', name: command.label });
  // The bridge always targets the player chosen in the Console; '@uid' in the arguments is refused.
  const target = parsed.args.find((a) => a.startsWith('@'));
  if (target) problems.push({ code: 'target', token: target });
  const state = argState(command, { ...parsed, current: '' });
  if (state.missing.length) problems.push({ code: 'missing', parts: state.missing });
  return { command, problems, dangerous: DANGEROUS_COMMANDS.has(command.label.toLowerCase()), normalized };
}

/** Replaces the token under the cursor with `value` (and a trailing space). */
export function completeToken(line: string, value: string): string {
  const prefix = line.startsWith('/') ? '/' : '';
  const body = line.replace(/^\//, '');
  if (/\s$/.test(body) || body === '') return `${prefix}${body}${value} `;
  return `${prefix}${body.replace(/\S+$/, value)} `;
}

/**
 * Pages that do the same job through a typed API (validated, read back). The Codex points there
 * first; the raw command stays available for advanced use.
 */
export const TYPED_ALTERNATIVES: Record<string, { to: string; key: string }[]> = {
  give: [
    { to: '/inventory', key: 'spawner' },
    { to: '/armory', key: 'weaponBuilder' },
    { to: '/armory?tab=artifact', key: 'artifactBuilder' },
  ],
  giveall: [{ to: '/inventory', key: 'spawner' }],
  setconst: [{ to: '/builder', key: 'characterBuilder' }],
  talent: [{ to: '/builder', key: 'characterBuilder' }],
  setfetterlevel: [{ to: '/builder', key: 'characterBuilder' }],
  setstats: [{ to: '/builder', key: 'characterBuilder' }],
  teleport: [{ to: '/world', key: 'worldTeleport' }],
  sceneteleporter: [{ to: '/world', key: 'worldTeleport' }],
  spawn: [{ to: '/world', key: 'worldSpawn' }],
};

export function typedAlternatives(command: CommandInfo): { to: string; key: string }[] {
  return TYPED_ALTERNATIVES[command.label.toLowerCase()] ?? [];
}

export type ArgType = 'id' | 'number' | 'coordinate' | 'flag' | 'choice' | 'text' | 'player';

export interface ArgSpec {
  /** As written in the usage, e.g. "lv<level>" or "(n|e|q|all)". */
  text: string;
  name: string;
  required: boolean;
  repeat: boolean;
  type: ArgType;
  /** Catalog kinds an id argument is completed from. */
  kinds: SuggestKind[];
  options: string[];
}

const NUMERIC = /^(level|amount|refinement|constellation|skilllevel|times|state|maxhp|hp|atk|def|blockid|groupid|configid|aiid|rotx|roty|rotz|talentid|.*id)$/i;

/** The parameters of one usage line with required/optional, repetition and expected type. */
export function argSpecs(usage: string): ArgSpec[] {
  const out: ArgSpec[] = [];
  for (const p of parseUsage(usage)) {
    if (p.type === 'literal') continue;
    if (p.type === 'choice') {
      const placeholders = p.options.filter(isPlaceholder);
      out.push({
        text: `(${p.options.join('|')})`,
        name: p.options.join('|'),
        required: !p.optional,
        repeat: false,
        type: 'choice',
        kinds: kindsForArg(placeholders.join(' ')),
        options: p.options.filter((o) => !isPlaceholder(o)),
      });
      continue;
    }
    const kinds = kindsForArg(p.name);
    const bare = p.name.replace(/[^a-z0-9]/gi, '');
    const type: ArgType = p.flag
      ? 'flag'
      : kinds.includes('player')
        ? 'player'
        : kinds.length && !kinds.includes('point')
          ? 'id'
          : /^[xyz]$/i.test(p.name) || kinds.includes('point')
            ? 'coordinate'
            : NUMERIC.test(bare)
              ? 'number'
              : 'text';
    out.push({ text: `${p.prefix}<${p.name}>`, name: p.name, required: !p.optional, repeat: !!p.repeat, type, kinds, options: [] });
  }
  return out;
}

/** Sample values for generated examples: real ids from the 7.2 catalog. */
export const SAMPLE_VALUES: Partial<Record<SuggestKind, string>> = {
  material: '104003',
  avatar: '10000002',
  weapon: '11509',
  artifact: '75544',
  monster: '21010101',
  scene: '3',
  namecard: '210001',
  player: '',
};

const KIND_ORDER: SuggestKind[] = ['material', 'weapon', 'artifact', 'avatar', 'monster', 'scene', 'namecard', 'player', 'point'];
const preferred = (kinds: SuggestKind[]) => [...kinds].sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));

/**
 * One runnable example per usage line, built only from the usage text and real catalog ids (never a
 * hand-written list). Optional parts are left out unless they are prefixed numbers worth showing.
 */
export function examplesFor(command: CommandInfo): string[] {
  const out: string[] = [];
  for (const usage of command.usage.length ? command.usage : ['']) {
    const words: string[] = [command.label];
    let ok = true;
    for (const p of parseUsage(usage)) {
      if (p.type === 'literal') {
        words.push(p.text);
        continue;
      }
      if (p.type === 'choice') {
        if (p.optional) continue;
        const literal = p.options.find((o) => !isPlaceholder(o));
        const kinds = preferred(kindsForArg(p.options.filter(isPlaceholder).join(' ')));
        const sample = kinds.map((k) => SAMPLE_VALUES[k]).find(Boolean);
        if (sample) words.push(sample);
        else if (literal) words.push(literal);
        else ok = false;
        continue;
      }
      if (p.flag) continue;
      const kinds = kindsForArg(p.name);
      if (p.prefix) {
        if (/^(lv|x)$/i.test(p.prefix)) words.push(`${p.prefix}${p.prefix.toLowerCase() === 'lv' ? 90 : 10}`);
        continue;
      }
      if (p.optional) continue;
      if (kinds.includes('point')) {
        words.push('2154.55', '236.31', '-1638.24');
        continue;
      }
      if (/^[yz]$/i.test(p.name)) continue; // filled together with x
      const sample = preferred(kinds).map((k) => SAMPLE_VALUES[k]).find(Boolean);
      if (sample) words.push(sample);
      else if (/level/i.test(p.name)) words.push('10');
      else {
        ok = false;
        break;
      }
    }
    if (ok) out.push(words.join(' '));
  }
  return [...new Set(out)];
}
