import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Play, TerminalSquare } from 'lucide-react';
import { Link } from 'react-router';
import { useOnlinePlayers } from '@/api/hooks';
import { useT } from '@/i18n';
import { api, type ExecuteResult } from '@/api/nukva';
import { useCapability, useSession } from '@/stores/session';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { Artwork } from '@/components/fx/Artwork';
import { DenialNotice, Panel } from '@/components/ui/Primitives';
import { loadKind } from '@/components/ui/IdInput';
import { playerSuggestions, rankSuggestions, type Suggestion } from '@/lib/suggest';
import { argState, completeToken, findCommand, parseLine, suggestCommands, typedAlternatives, validateLine, type LineProblem } from '@/lib/commandLine';
import type { CommandInfo } from '@/data/types';

interface Item {
  key: string;
  insert: string;
  title: string;
  sub: string;
  icon?: string | null;
  rarity?: number;
  mono?: boolean;
  command?: string;
  /** Shown but cannot be inserted (e.g. a UID the bridge refuses). */
  disabled?: boolean;
  badge?: string;
}

/**
 * One-line command entry with completion, like a game console: command names first, then each
 * parameter of the matching usage (fixed words, flags, and game IDs from the catalog). The line is
 * checked before it can be sent; dangerous commands need an explicit acknowledgement.
 */
export function CommandLine({ commands, live, onCommand }: { commands: CommandInfo[]; live: boolean; onCommand: (label: string) => void }) {
  const t = useT();
  const uid = useSession((s) => s.uid);
  const cap = useCapability('commands.execute');
  const [line, setLine] = useState('/');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [ids, setIds] = useState<Suggestion[]>([]);
  const [ack, setAck] = useState(false);
  const [spec, setSpec] = useState<OperationSpec<ExecuteResult> | null>(null);
  const [output, setOutput] = useState<ExecuteResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const players = useOnlinePlayers();

  const parsed = useMemo(() => parseLine(line), [line]);
  const command = parsed.typingName ? undefined : findCommand(commands, parsed.name);
  const state = command ? argState(command, parsed) : null;
  const check = useMemo(() => validateLine(commands, line), [commands, line]);
  const kindKey = state?.kinds.join(',') ?? '';

  useEffect(() => {
    if (!state || state.kinds.length === 0) return setIds([]);
    let alive = true;
    Promise.all(state.kinds.map(loadKind)).then(
      (lists) => alive && setIds(lists.flat()),
      () => alive && setIds([]),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindKey]);
  useEffect(() => setAck(false), [check.command?.label]);
  useEffect(() => {
    if (command) onCommand(command.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.label]);

  const items: Item[] = useMemo(() => {
    if (parsed.typingName) {
      return suggestCommands(commands, parsed.name).map((c) => ({
        key: `c-${c.label}`,
        insert: c.label,
        title: `/${c.label}`,
        sub: c.description ?? (c.aliases.length ? c.aliases.map((a) => `/${a}`).join(' ') : ''),
        mono: true,
        command: c.label,
        // Permission-aware: commands the bridge will not run are still listed, but marked.
        badge: c.executable ? undefined : t('commands.notAllowlistedShort'),
      }));
    }
    if (!state) return [];
    const cur = parsed.current;
    const prefix = state.active?.type === 'arg' ? state.active.prefix : '';
    const bare = prefix && cur.toLowerCase().startsWith(prefix.toLowerCase()) ? cur.slice(prefix.length) : cur;
    const fixed = state.options
      .filter((o) => !cur || o.toLowerCase().startsWith(cur.toLowerCase()))
      .map((o) => ({ key: `o-${o}`, insert: o, title: o, sub: t('commands.lineOption'), mono: true }));
    const pool = state.kinds.includes('player') ? [...ids, ...playerSuggestions(players.data ?? [])] : ids;
    const found = pool.length ? rankSuggestions(pool, bare, 30) : [];
    const teleportCmd = command?.label === 'teleport';
    return [
      ...fixed,
      ...found.map((s) => ({
        key: `i-${s.kind}-${s.scene ?? ''}-${s.id}`,
        // Teleport points fill x y z (and the scene for /teleport); everything else inserts its id.
        insert: s.insert ? `${s.insert}${teleportCmd && s.scene ? ` ${s.scene}` : ''}` : `${prefix}${s.id}`,
        title: t.loc({ en: s.en, th: s.th }),
        sub: s.kind === 'point' ? s.sub : `${s.id} · ${s.sub}`,
        icon: s.kind === 'player' || s.kind === 'point' || s.kind === 'scene' ? undefined : s.icon,
        rarity: s.rarity,
        disabled: s.disabled,
        badge: s.disabled ? t('commands.uidRefused') : undefined,
      })),
    ].slice(0, 40);
  }, [parsed, state, ids, commands, t, players.data, command?.label]);

  useEffect(() => setActive(0), [line]);

  const pick = (item: Item) => {
    if (item.disabled) return;
    setLine(completeToken(line, item.insert));
    setOpen(true);
    inputRef.current?.focus();
  };

  const canRun = live && cap.allowed && !!uid && !!check.command && check.problems.length === 0 && (!check.dangerous || ack);
  const run = () => {
    if (!canRun || !check.command) return;
    const text = check.normalized;
    setSpec({
      title: t('commands.execute'),
      capability: 'commands.execute',
      action: 'command.execute',
      summary: `/${text}`,
      lines: [
        { label: 'Command', value: <code className="font-mono text-cyan">/{text}</code> },
        ...(check.dangerous ? [{ label: t('commands.dangerTitle'), value: <span className="text-danger">{t('commands.dangerText')}</span> }] : []),
      ],
      request: { method: 'POST', path: '/commands/execute', body: { uid, command: text } },
      run: (conn, target) => api.execute(conn, target, text),
      judge: (r) => ({ status: 'success', detail: r.output.slice(0, 2).join(' / ') || '(no output)' }),
      successLabel: t('op.executed'),
    });
  };

  const problemText = (p: LineProblem) => {
    switch (p.code) {
      case 'empty':
        return t('commands.problem.empty');
      case 'unknown':
        return t('commands.problem.unknown', { name: p.name });
      case 'notExecutable':
        return t('commands.problem.notExecutable', { name: p.name });
      case 'target':
        return t('commands.problem.target', { token: p.token });
      case 'missing':
        return t('commands.problem.missing', { parts: p.parts.join(', ') });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = items.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === 'Tab' && open && n > 0) {
      e.preventDefault();
      pick(items[Math.min(active, n - 1)]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && n > 0 && parsed.current !== '') pick(items[Math.min(active, n - 1)]);
      else run();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const usage = command && state ? command.usage[state.usageIndex] ?? '' : '';
  return (
    <Panel className="p-6" eyebrow={<span className="flex items-center gap-2"><TerminalSquare size={13} /> {t('commands.lineTitle')}</span>}>
      <div className="relative">
        <input
          ref={inputRef}
          className="field font-mono text-base"
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-autocomplete="list"
          aria-controls="cmdline-list"
          aria-label={t('commands.lineTitle')}
          spellCheck={false}
          autoComplete="off"
          placeholder={t('commands.linePlaceholder')}
          value={line}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setLine(e.target.value.startsWith('/') ? e.target.value : `/${e.target.value}`);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {open && items.length > 0 && (
          <ul id="cmdline-list" role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-gold/25 bg-night py-1 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
            {items.map((it, i) => (
              <li
                key={it.key}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(it);
                }}
                onMouseMove={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 ${i === active ? 'bg-gold/10' : ''}`}
              >
                {it.icon !== undefined && <Artwork icon={it.icon} name={it.title} rarity={it.rarity ?? 0} size={28} rounded="rounded-md" />}
                <span className={`shrink-0 text-sm text-ivory ${it.mono ? 'font-mono' : ''}`}>{it.title}</span>
                <span className="min-w-0 flex-1 truncate text-right text-[11px] text-dim">{it.sub}</span>
                {it.badge && <span className="shrink-0 rounded border border-warn/40 px-1 text-[10px] text-warn">{it.badge}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-dim">{t('commands.lineHint')}</p>

      {command && (
        <div className="mt-4 rounded-xl border border-line bg-abyss/60 px-4 py-3">
          <div className="font-mono text-xs text-mist">
            /{command.label}{' '}
            {state?.parts.map((p, i) => {
              const text = p.type === 'literal' ? p.text : p.type === 'choice' ? `(${p.options.join('|')})` : `${p.optional ? '[' : ''}${p.prefix}<${p.name}>${p.optional ? ']' : ''}`;
              return (
                <span key={i} className={p === state.active ? 'rounded bg-gold/15 px-1 text-gold' : ''}>
                  {text}{' '}
                </span>
              );
            })}
          </div>
          {command.usage.length > 1 && <div className="mt-1 text-[11px] text-dim">{t('commands.lineVariant', { n: (state?.usageIndex ?? 0) + 1, total: command.usage.length, usage })}</div>}
          {command.description && <p className="mt-1.5 text-xs text-mist">{command.description}</p>}
          {typedAlternatives(command).length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cyan">
              <span>{t('commands.preferTyped')}</span>
              {typedAlternatives(command).map((a) => (
                <Link key={a.to} to={a.to} className="inline-flex items-center gap-1 rounded-md border border-cyan/30 px-2 py-0.5 hover:bg-cyan/10">
                  {t.dyn(`commands.typed.${a.key}`)} <ArrowRight size={11} />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {line.trim() !== '/' && check.problems.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-warn">
          {check.problems.map((p, i) => (
            <li key={i}>• {problemText(p)}</li>
          ))}
        </ul>
      )}
      {check.dangerous && (
        <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/[0.06] px-3 py-2.5 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{t('commands.dangerText')}</span>
          <input type="checkbox" className="mt-1 accent-[#ff6b6b]" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-label={t('commands.dangerAck')} />
        </label>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={!canRun} onClick={run}>
          <Play size={14} /> {t('commands.execute')}
        </button>
        {!live ? (
          <span className="text-xs text-dim">{t('commands.executeDisabled')}</span>
        ) : !cap.allowed ? (
          <DenialNotice reason={cap.reason} role={cap.role} compact />
        ) : !uid ? (
          <span className="text-xs text-dim">{t('commands.needPlayer')}</span>
        ) : null}
      </div>

      {output && (
        <div className="mt-5">
          <div className="label">{t('commands.result')}</div>
          <pre className="max-h-60 overflow-auto rounded-xl border border-line bg-abyss/80 p-3 font-mono text-xs whitespace-pre-wrap text-pale">{output.output.length ? output.output.join('\n') : '(no output)'}</pre>
          <p className="mt-1 text-[11px] text-dim">{output.note}</p>
        </div>
      )}
      <OperationDialog spec={spec} onClose={() => setSpec(null)} onDone={setOutput} />
    </Panel>
  );
}
