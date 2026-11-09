import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { Play, Radio, ScrollText, Search, Shield, Target, Terminal } from 'lucide-react';
import { useT } from '@/i18n';
import { useCatalog } from '@/data/catalog';
import { useLiveCommands } from '@/api/hooks';
import { api, type ExecuteResult } from '@/api/nukva';
import { useCapability, useSession } from '@/stores/session';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { CopyButton, DenialNotice, EmptyState, ErrorState, PageHeader, Panel, SkeletonGrid } from '@/components/ui/Primitives';
import { buildCommand, isFlag, parseUsage } from '@/lib/usage';
import { normalize } from '@/lib/search';
import type { CommandInfo } from '@/data/types';
import { ease } from '@/lib/motion';

export default function Commands() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const snapshot = useCatalog('commands');
  const live = useLiveCommands();
  const [query, setQuery] = useState('');
  const commands = live.data ?? snapshot.data;
  const isLive = !!live.data;
  const selectedLabel = params.get('cmd');
  const selected = commands?.find((c) => c.label === selectedLabel) ?? commands?.[0];

  const list = useMemo(() => {
    const q = normalize(query);
    return (commands ?? []).filter((c) => !q || normalize(`${c.label} ${c.aliases.join(' ')} ${c.description ?? ''} ${c.permission}`).includes(q));
  }, [commands, query]);

  return (
    <>
      <PageHeader
        eyebrow={t('commands.eyebrow')}
        title={t('commands.title')}
        actions={
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${isLive ? 'border-ok/30 text-ok' : 'border-line text-mist'}`}>
            <Radio size={12} /> {isLive ? t('commands.sourceLive') : t('commands.sourceSnapshot')}
          </span>
        }
      />
      {snapshot.error && !commands ? (
        <ErrorState error={snapshot.error} onRetry={snapshot.retry} />
      ) : !commands ? (
        <SkeletonGrid count={9} className="h-12" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr] xl:grid-cols-[300px_1fr]">
          <div className="min-w-0">
            <div className="relative mb-3">
              <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
              <input className="field pl-9" placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
            </div>
            <ul className="scroll-fade max-h-[72vh] space-y-0.5 overflow-y-auto py-2 pr-1">
              {list.map((c) => (
                <li key={c.label}>
                  <button onClick={() => setParams({ cmd: c.label })} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${selected?.label === c.label ? 'bg-gold/10 text-ivory ring-1 ring-gold/30' : 'text-mist hover:bg-white/[0.03] hover:text-ivory'}`}>
                    <Terminal size={13} className={selected?.label === c.label ? 'text-gold' : 'text-dim'} />
                    <span className="font-mono text-sm">/{c.label}</span>
                    {c.executable && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ok" title="executable" />}
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-dim">{t('search.empty', { q: query })}</li>}
            </ul>
          </div>
          {selected ? <CommandDetail key={selected.label} command={selected} live={isLive} /> : <EmptyState title="—" />}
        </div>
      )}
    </>
  );
}

function CommandDetail({ command: c, live }: { command: CommandInfo; live: boolean }) {
  const t = useT();
  const uid = useSession((s) => s.uid);
  const cap = useCapability('commands.execute');
  const [usageIndex, setUsageIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [spec, setSpec] = useState<OperationSpec<ExecuteResult> | null>(null);
  const [output, setOutput] = useState<ExecuteResult | null>(null);
  const usage = c.usage[usageIndex] ?? '';
  const parts = useMemo(() => parseUsage(usage), [usage]);
  const built = buildCommand(c.label, parts, values);
  useEffect(() => setValues({}), [usageIndex]);

  const target = (t.dyn(`commands.targets.${c.targetRequirement}`) as string) || c.targetRequirement;
  const executable = live && c.executable;

  return (
    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease }} className="space-y-5">
      <Panel corners className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-3xl text-gilded">/{c.label}</div>
            <p className="mt-2 max-w-2xl text-sm text-mist">{c.description ?? t('commands.noDescription')}</p>
          </div>
          <ScrollText className="text-gold/50" size={28} />
        </div>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="label">{t('commands.aliases')}</dt>
            <dd className="font-mono text-ivory">{c.aliases.length ? c.aliases.map((a) => `/${a}`).join(' ') : '—'}</dd>
          </div>
          <div>
            <dt className="label flex items-center gap-1"><Shield size={11} /> {t('commands.permission')}</dt>
            <dd className="font-mono text-xs text-ivory">{c.permission || '—'}</dd>
          </div>
          <div>
            <dt className="label">{t('commands.permissionTargeted')}</dt>
            <dd className="font-mono text-xs text-ivory">{c.permissionTargeted || '—'}</dd>
          </div>
          <div>
            <dt className="label flex items-center gap-1"><Target size={11} /> {t('commands.target')}</dt>
            <dd className="text-ivory">{target}</dd>
          </div>
        </dl>
        <div className="mt-6">
          <div className="label">{t('commands.usage')}</div>
          <ul className="space-y-1.5">
            {c.usage.map((u, i) => (
              <li key={i}>
                <button onClick={() => setUsageIndex(i)} className={`w-full rounded-lg border px-3 py-2 text-left font-mono text-xs transition-colors ${i === usageIndex ? 'border-gold/40 bg-gold/[0.06] text-ivory' : 'border-line text-mist hover:border-gold/25'}`}>
                  /{c.label} {u}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel className="p-6" eyebrow={t('commands.builder')}>
        <p className="-mt-1 mb-5 text-sm text-mist">{t('commands.builderLead')}</p>
        {parts.filter((p) => p.type !== 'literal').length === 0 ? null : (
          <div className="grid gap-4 sm:grid-cols-2">
            {parts.map((part, i) => {
              if (part.type === 'literal') return null;
              const id = `${c.label}-${part.key}`;
              if (part.type === 'choice') {
                return (
                  <div key={i}>
                    <label className="label" htmlFor={id}>
                      <span className="font-mono tracking-normal normal-case text-gold">{part.options.join(' | ')}</span> <span className="font-normal normal-case text-dim">· {part.optional ? t('commands.optional') : t('commands.choose')}</span>
                    </label>
                    <select id={id} className="field font-mono text-sm" value={values[part.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [part.key]: e.target.value }))}>
                      <option value="">—</option>
                      {part.options.map((o) => (
                        <option key={o} value={/^<.*>$/.test(o) ? '' : o} disabled={/^<.*>$/.test(o)}>
                          {o}
                        </option>
                      ))}
                    </select>
                    {part.options.some((o) => /^<.*>$/.test(o)) && (
                      <input className="field mt-2 font-mono text-sm" placeholder={part.options.filter((o) => /^<.*>$/.test(o)).join(' / ')} value={values[part.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [part.key]: e.target.value }))} aria-label={part.options.join(' | ')} />
                    )}
                  </div>
                );
              }
              if (isFlag(part)) {
                return (
                  <label key={i} className="flex items-center gap-3 self-end rounded-xl border border-line px-3 py-2.5 text-sm">
                    <input type="checkbox" className="accent-[#e2c27d]" checked={values[part.key] === 'on'} onChange={(e) => setValues((v) => ({ ...v, [part.key]: e.target.checked ? 'on' : '' }))} />
                    <span className="font-mono">{part.name}</span>
                    <span className="text-xs text-dim">{t('commands.optional')}</span>
                  </label>
                );
              }
              return (
                <div key={i}>
                  <label className="label" htmlFor={id}>
                    <span className="font-mono tracking-normal normal-case text-gold">{part.prefix}&lt;{part.name}&gt;</span>
                    <span className="font-normal normal-case text-dim"> · {part.optional ? t('commands.optional') : t('commands.required')}{part.repeat ? ' · …' : ''}</span>
                  </label>
                  <input id={id} className="field font-mono text-sm" placeholder={`<${part.name}>`} value={values[part.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [part.key]: e.target.value }))} />
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-6">
          <div className="label">{t('commands.output')}</div>
          <div className="flex items-center gap-2 rounded-xl border border-cyan/25 bg-abyss/80 px-4 py-3">
            <code className="min-w-0 flex-1 overflow-x-auto font-mono text-sm whitespace-nowrap text-cyan">/{built.command}</code>
            <CopyButton value={`/${built.command}`} label={t('common.copy')} />
          </div>
          {built.missing.length > 0 && <p className="mt-2 text-xs text-warn">{t('commands.required')}: {built.missing.join(', ')}</p>}
        </div>
        <div className="mt-5 space-y-3">
          {!live || !cap.allowed ? (
            cap.reason === 'unsupported' || cap.reason === null ? <p className="text-xs text-dim">{t('commands.executeDisabled')}</p> : <DenialNotice reason={cap.reason} role={cap.role} compact />
          ) : !c.executable ? (
            <p className="text-xs text-dim">{t('commands.notAllowlisted')}</p>
          ) : null}
          <button
            className="btn btn-ghost"
            disabled={!executable || !cap.allowed || built.missing.length > 0 || !uid}
            onClick={() =>
              setSpec({
                title: t('commands.execute'),
                capability: 'commands.execute',
                action: 'command.execute',
                summary: `/${built.command}`,
                lines: [{ label: 'Command', value: <code className="font-mono text-cyan">/{built.command}</code> }],
                request: { method: 'POST', path: '/commands/execute', body: { uid, command: built.command } },
                run: (conn, target) => api.execute(conn, target, built.command),
                judge: (r) => ({ status: 'success', detail: r.output.slice(0, 2).join(' / ') || '(no output)' }),
                successLabel: t('op.executed'),
              })
            }
          >
            <Play size={14} /> {t('commands.execute')}
          </button>
        </div>
        {output && (
          <div className="mt-5">
            <div className="label">{t('commands.result')}</div>
            <pre className="max-h-60 overflow-auto rounded-xl border border-line bg-abyss/80 p-3 font-mono text-xs whitespace-pre-wrap text-pale">{output.output.length ? output.output.join('\n') : '(no output)'}</pre>
            <p className="mt-1 text-[11px] text-dim">{output.note}</p>
          </div>
        )}
      </Panel>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} onDone={setOutput} />
    </motion.div>
  );
}
