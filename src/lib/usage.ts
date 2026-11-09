/**
 * Parses Grasscutter-style usage strings, e.g.
 *   "(<itemId>|<avatarId>|all) [lv<level>] [x<amount>] [<mainPropId>] [<appendPropId>[,<times>]]..."
 * into form fields, and assembles a command from field values. Pure; unit-tested.
 */

export type UsagePart =
  | { type: 'literal'; text: string }
  | { type: 'arg'; name: string; prefix: string; optional: boolean; repeat: boolean; key: string; flag?: boolean }
  | { type: 'choice'; options: string[]; optional: boolean; key: string };

function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '[' || ch === '(' || ch === '<') depth++;
    if (ch === ']' || ch === ')' || ch === '>') depth--;
    if (ch === ' ' && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export function parseUsage(usage: string): UsagePart[] {
  const parts: UsagePart[] = [];
  let n = 0;
  for (let token of splitTop(usage.trim())) {
    let repeat = false;
    if (token.endsWith('...')) {
      repeat = true;
      token = token.slice(0, -3);
    }
    let optional = false;
    if (token.startsWith('[') && token.endsWith(']')) {
      optional = true;
      token = token.slice(1, -1);
    }
    if (token.startsWith('(') && token.endsWith(')')) {
      const options = token
        .slice(1, -1)
        .split('|')
        .map((o) => o.trim())
        .filter(Boolean);
      parts.push({ type: 'choice', options, optional, key: `p${n++}` });
      continue;
    }
    const arg = token.match(/^([^<\s]*)<([^>]+)>(.*)$/);
    if (arg) {
      const [, prefix, name, rest] = arg;
      parts.push({ type: 'arg', name: rest ? `${name}${rest.replace(/[<>[\]]/g, '')}` : name, prefix, optional, repeat, key: `p${n++}` });
      continue;
    }
    if (optional) {
      parts.push({ type: 'arg', name: token, prefix: '', optional: true, repeat, key: `p${n++}`, flag: true });
      continue;
    }
    parts.push({ type: 'literal', text: token });
  }
  return parts;
}

/** A literal optional token such as "[all]" behaves as an on/off flag. */
export function isFlag(part: UsagePart): boolean {
  return part.type === 'arg' && part.flag === true;
}

export function buildCommand(label: string, parts: UsagePart[], values: Record<string, string>): { command: string; missing: string[] } {
  const out: string[] = [label];
  const missing: string[] = [];
  for (const part of parts) {
    if (part.type === 'literal') {
      out.push(part.text);
      continue;
    }
    const value = (values[part.key] ?? '').trim();
    if (part.type === 'choice') {
      if (value) out.push(value);
      else if (!part.optional) missing.push(part.options.join('|'));
      continue;
    }
    if (isFlag(part)) {
      if (value === 'on') out.push(part.name);
      continue;
    }
    if (!value) {
      if (!part.optional) missing.push(part.name);
      continue;
    }
    const pieces = part.repeat ? value.split(/\s+/) : [value];
    for (const piece of pieces) out.push(`${part.prefix}${piece}`);
  }
  return { command: out.filter(Boolean).join(' '), missing };
}
