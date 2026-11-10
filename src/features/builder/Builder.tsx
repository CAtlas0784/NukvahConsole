import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Gem, Loader2, Search, Sparkles, Wand2 } from 'lucide-react';
import { useT } from '@/i18n';
import { byId, useCatalog } from '@/data/catalog';
import { useAvatars, useBuilderInventory } from '@/api/hooks';
import { api, type MaxResult, type OwnedAvatar } from '@/api/nukva';
import { useCapability, useConnection, useSession } from '@/stores/session';
import { describeError, useToasts } from '@/stores/ops';
import { Artwork, elementColor } from '@/components/fx/Artwork';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { DenialNotice, EmptyState, ErrorState, IdTag, PageHeader, RangeField, RarityStars, Segmented, SkeletonGrid, Stepper } from '@/components/ui/Primitives';
import type { Character, Element } from '@/data/types';
import { indexPieces, isMaxed, MAX_ASCENSION, minPromote, planMax } from '@/lib/builder';
import { normalize } from '@/lib/search';
import { ArtifactsTab } from './ArtifactsTab';
import { SummaryTab } from './SummaryTab';
import { WeaponTab } from './WeaponTab';
import { describeChange, type TabCtx } from './shared';

const ELEMENTS: Element[] = ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo'];
const TABS = ['character', 'weapon', 'artifacts', 'constellation', 'talents', 'summary'] as const;
type Tab = (typeof TABS)[number];

export default function Builder() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const characters = useCatalog('characters');
  const uid = useSession((s) => s.uid);
  const avatars = useAvatars(uid);
  const [query, setQuery] = useState('');
  const [element, setElement] = useState<Element | null>(null);
  const [rarity, setRarity] = useState<number | null>(null);
  const [ownedOnly, setOwnedOnly] = useState(true);

  const owned = useMemo(() => new Map((avatars.data ?? []).map((a) => [a.avatarId, a])), [avatars.data]);
  const selectedId = Number(params.get('id')) || null;
  const selected = selectedId ? byId(characters.data).get(selectedId) ?? null : null;

  const list = useMemo(() => {
    const q = normalize(query);
    return (characters.data ?? []).filter((c) => {
      if (ownedOnly && !owned.has(c.id)) return false;
      if (element && c.element !== element) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (q && !normalize(`${c.name.en} ${c.name.th ?? ''} ${c.key} ${c.id}`).includes(q)) return false;
      return true;
    });
  }, [characters.data, query, element, rarity, ownedOnly, owned]);

  return (
    <>
      <PageHeader eyebrow={t('builder.eyebrow')} title={t('builder.title')} lead={uid ? t('builder.lead') : t('builder.noPlayer')} />
      {avatars.error ? (
        <div className="mb-5">
          <ErrorState error={avatars.error} onRetry={avatars.refresh} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="panel flex min-h-0 flex-col gap-3 p-3 lg:max-h-[calc(100dvh-9rem)]" aria-label={t('builder.roster')}>
          <div className="relative">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
            <input className="field pl-9" placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {ELEMENTS.map((e) => (
              <button key={e} className="chip" aria-pressed={element === e} onClick={() => setElement(element === e ? null : e)} style={element === e ? undefined : { color: elementColor(e) }}>
                {t.dyn(`elements.${e}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[5, 4].map((r) => (
              <button key={r} className="chip" aria-pressed={rarity === r} onClick={() => setRarity(rarity === r ? null : r)}>
                {t('common.stars', { n: r })}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-mist">
              <input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} />
              {t('builder.ownedOnly')}
            </label>
          </div>
          <div className="text-[11px] text-dim">{t('builder.count', { n: list.length })}</div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {characters.error ? (
              <ErrorState error={characters.error} onRetry={characters.retry} />
            ) : !characters.data ? (
              <SkeletonGrid count={9} className="h-24" />
            ) : list.length === 0 ? (
              <EmptyState title={t('builder.emptyRoster')} />
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                {list.map((c) => (
                  <li key={c.id}>
                    <RosterCard character={c} owned={owned.get(c.id)} active={c.id === selectedId} onOpen={() => setParams({ id: String(c.id) })} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="min-w-0">
          {!selected ? (
            <EmptyState icon={<Sparkles size={22} />} title={t('builder.pick')} />
          ) : (
            <Workbench key={selected.id} character={selected} owned={owned.get(selected.id)} characters={characters.data ?? []} onRosterChanged={avatars.refresh} />
          )}
        </div>
      </div>
    </>
  );
}

function RosterCard({ character: c, owned, active, onOpen }: { character: Character; owned?: OwnedAvatar; active: boolean; onOpen: () => void }) {
  const t = useT();
  return (
    <button
      onClick={onOpen}
      aria-pressed={active}
      className={`relative flex w-full flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors ${active ? 'border-gold/60 bg-gold/[0.08]' : 'border-line bg-abyss/40 hover:border-gold/30'} ${owned ? '' : 'opacity-55'}`}
    >
      <Artwork icon={c.icon} name={c.name.en} element={c.element} rarity={c.rarity} size={56} rounded="rounded-full" />
      <span className="w-full truncate text-[11px] font-semibold text-ivory">{t.loc(c.name)}</span>
      {owned && (
        <span className={`rounded-md border px-1 font-mono text-[10px] ${isMaxed(owned) ? 'border-gold/50 text-gold' : 'border-ok/30 text-ok'}`}>
          {owned.level} · C{owned.constellation}
        </span>
      )}
    </button>
  );
}

function Workbench({ character, owned, characters, onRosterChanged }: { character: Character; owned?: OwnedAvatar; characters: Character[]; onRosterChanged: () => void }) {
  const t = useT();
  const uid = useSession((s) => s.uid);
  const mode = useSession((s) => s.mode);
  const conn = useConnection();
  const toast = useToasts((s) => s.show);
  const weapons = useCatalog('weapons');
  const artifacts = useCatalog('artifacts');
  const inventory = useBuilderInventory(uid);
  const levelCap = useCapability('avatars.level');
  const maxCap = useCapability('avatars.max');
  const [tab, setTab] = useState<Tab>('character');
  const [spec, setSpec] = useState<OperationSpec<unknown> | null>(null);
  const [planning, setPlanning] = useState(false);

  const [level, setLevel] = useState(owned?.level ?? 90);
  const [cons, setCons] = useState(owned?.constellation ?? 0);
  const [normal, setNormal] = useState(owned?.talents?.normal.level ?? 10);
  const [skill, setSkill] = useState(owned?.talents?.skill.level ?? 10);
  const [burst, setBurst] = useState(owned?.talents?.burst.level ?? 10);

  useEffect(() => {
    if (!owned) return;
    setLevel(owned.level);
    setCons(owned.constellation);
    setNormal(owned.talents?.normal.level ?? 10);
    setSkill(owned.talents?.skill.level ?? 10);
    setBurst(owned.talents?.burst.level ?? 10);
  }, [owned]);

  const pieces = useMemo(() => indexPieces(artifacts.data), [artifacts.data]);
  const name = t.loc(character.name);
  const refresh = () => {
    onRosterChanged();
    inventory.refresh();
  };

  if (!owned) {
    return (
      <div className="panel flex items-center gap-3 border-gold/20 bg-gold/[0.04] p-5 text-sm text-gold">
        <Sparkles size={16} /> {t('builder.notOwned')}
      </div>
    );
  }

  const ctx: TabCtx = {
    character,
    owned,
    inventory: inventory.data ?? [],
    characters,
    weapons: weapons.data ?? [],
    artifacts: artifacts.data,
    pieces,
    onChanged: refresh,
  };

  // Pending level / constellation / talent edits shared by three tabs.
  const pending: { label: string; value: string }[] = [];
  const body: Record<string, number> = {};
  if (level !== owned.level) {
    body.level = level;
    pending.push({ label: t('common.level'), value: `${owned.level} → ${level}` });
  }
  if (cons !== owned.constellation) {
    body.constellation = cons;
    pending.push({ label: t('characters.constellation'), value: `C${owned.constellation} → C${cons}` });
  }
  if (owned.talents) {
    for (const [key, value] of [['normal', normal], ['skill', skill], ['burst', burst]] as const) {
      if (value !== owned.talents[key].level) {
        body[key] = value;
        pending.push({ label: t.dyn(`characters.${key}`), value: `${owned.talents[key].level} → ${value}` });
      }
    }
  }

  const reviewUpdate = () =>
    setSpec({
      title: t('builder.updateTitle', { name }),
      capability: 'avatars.level',
      action: 'avatar.update',
      summary: `${name}: ${pending.map((x) => `${x.label} ${x.value}`).join(', ')}`,
      lines: pending,
      request: { method: 'PATCH', path: `/players/{uid}/avatars/${owned.avatarId}`, body },
      run: (c, target) => api.updateAvatar(c, target, owned.avatarId, body),
      judge: (result) => {
        const r = result as OwnedAvatar;
        return r.rejected && r.rejected.length ? { status: 'partial', detail: `rejected: ${r.rejected.join(', ')}` } : { status: 'success', detail: `Lv${r.level} C${r.constellation}` };
      },
    });

  const discard = () => {
    setLevel(owned.level);
    setCons(owned.constellation);
    setNormal(owned.talents?.normal.level ?? 10);
    setSkill(owned.talents?.skill.level ?? 10);
    setBurst(owned.talents?.burst.level ?? 10);
  };

  const openMax = (plan: MaxResult | { changes: MaxResult['changes']; noop: boolean }) => {
    if (plan.noop) {
      toast({ tone: 'info', title: t('builder.maxNothing'), body: name });
      return;
    }
    setSpec({
      title: t('builder.maxTitle', { name }),
      capability: 'avatars.max',
      action: 'avatar.max',
      summary: `${name}: ${t('builder.oneClickMax')}`,
      lines: [...plan.changes.map((c) => describeChange(ctx, t, c)), { label: '', value: <span className="text-xs text-dim">{t('builder.maxNote')}</span> }],
      request: { method: 'POST', path: `/players/{uid}/avatars/${owned.avatarId}/max`, body: { apply: true } },
      run: (c, target) => api.maxAvatar(c, target, owned.avatarId, true),
      judge: (result) => {
        const r = result as MaxResult;
        return r.rejected && r.rejected.length ? { status: 'partial', detail: `rejected: ${r.rejected.join(', ')}` } : { status: 'success', detail: `Lv${r.avatar.level} C${r.avatar.constellation}` };
      },
    });
  };

  // Connected: ask the server for its plan (a dry run that writes nothing). Preview: local plan, nothing is sent.
  const oneClickMax = async () => {
    if (mode === 'preview' || !conn || !uid) {
      const changes = planMax(owned, inventory.data ?? [], (id) => pieces.get(id)?.piece.rarity ?? 0);
      openMax({ changes, noop: changes.length === 0 });
      return;
    }
    setPlanning(true);
    try {
      openMax(await api.maxAvatar(conn, uid, owned.avatarId, false));
    } catch (error) {
      toast({ tone: 'error', title: t('op.failed'), body: describeError(error) });
    } finally {
      setPlanning(false);
    }
  };

  const maxBlocked = !maxCap.allowed && maxCap.reason !== 'preview';
  const pendingBar = (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-cyan/20 bg-cyan/[0.04] px-4 py-3">
      <div className="min-w-0 flex-1 text-xs text-cyan">
        {pending.length === 0 ? <span className="text-dim">{t('builder.noPending')}</span> : `${t('builder.pending')}: ${pending.map((x) => `${x.label} ${x.value}`).join(' · ')}`}
      </div>
      <button className="btn btn-ghost" disabled={pending.length === 0} onClick={discard}>
        {t('builder.discard')}
      </button>
      <button className="btn btn-primary" disabled={pending.length === 0} onClick={reviewUpdate}>
        <Wand2 size={15} /> {t('builder.review')}
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="panel flex flex-wrap items-center gap-4 p-4">
        <Artwork icon={character.icon} name={character.name.en} element={character.element} rarity={character.rarity} size={64} rounded="rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl text-ivory">{name}</h2>
            <IdTag id={character.id} />
            <RarityStars rarity={character.rarity} size={11} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-mist">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${mode === 'connected' ? 'bg-ok' : 'bg-warn'}`} />
              {mode === 'connected' ? `UID ${uid}` : t('common.preview')}
            </span>
            <span>
              {t.dyn(`elements.${character.element}`)} · {t.dyn(`weapons.${character.weapon}`)}
            </span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={oneClickMax} disabled={planning || maxBlocked} title={maxBlocked ? t('states.permissionText', { role: maxCap.role ?? '' }) : undefined}>
          {planning ? <Loader2 size={15} className="animate-spin" /> : <Gem size={15} />} {planning ? t('builder.maxPlanning') : t('builder.oneClickMax')}
        </button>
      </div>
      {mode === 'preview' && <p className="text-xs text-dim">{t('builder.previewNote')}</p>}
      {maxBlocked && <DenialNotice reason={maxCap.reason} role={maxCap.role} compact />}

      <div role="tablist" aria-label={t('builder.title')} className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-abyss/50 p-1">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`shrink-0 grow rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${tab === id ? 'bg-gradient-to-b from-gold-bright to-gold text-abyss' : 'text-mist hover:text-ivory'}`}
          >
            {t.dyn(`builder.tabs.${id}`)}
          </button>
        ))}
      </div>

      {tab === 'character' && (
        <section className="panel space-y-6 p-5">
          <RangeField label={t('common.level')} value={level} onChange={setLevel} min={1} max={90} marks={[1, 20, 40, 50, 60, 70, 80, 90]} />
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-ghost" onClick={() => setLevel(90)} disabled={level === 90}>
              {t('builder.max')}
            </button>
            <span className="rounded-md border border-line px-2 py-1 font-mono text-xs text-mist">{t('builder.ascension', { n: minPromote(level), max: MAX_ASCENSION })}</span>
            <span className="text-xs text-dim">
              {t('characters.friendship')}: {owned.fetterLevel}
            </span>
          </div>
          {!levelCap.allowed && levelCap.reason !== 'preview' && <DenialNotice reason={levelCap.reason} role={levelCap.role} compact />}
          {pendingBar}
        </section>
      )}

      {tab === 'weapon' && <WeaponTab ctx={ctx} />}
      {tab === 'artifacts' && <ArtifactsTab ctx={ctx} />}

      {tab === 'constellation' && (
        <section className="panel p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <span className="eyebrow">{t('characters.constellation')}</span>
            <span className="font-mono text-lg text-gold-bright">C{cons}</span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label={t('characters.constellation')}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => {
              const on = n > 0 && n <= cons;
              const label = n === 0 ? 'C0' : t.loc(character.constellations[n - 1]?.name) || `C${n}`;
              return (
                <li key={n}>
                  <button
                    role="radio"
                    aria-checked={cons === n}
                    onClick={() => setCons(n)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${on ? 'border-gold/60 bg-gold/15' : cons === n ? 'border-cyan/50 bg-cyan/10' : 'border-line bg-abyss/40 hover:border-gold/30'}`}
                  >
                    <svg viewBox="0 0 24 24" className={`h-6 w-6 shrink-0 ${on ? 'text-gold-bright drop-shadow-[0_0_6px_rgba(247,228,176,0.8)]' : 'text-dim'}`} aria-hidden>
                      {n === 0 ? <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" /> : <path d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z" fill="currentColor" />}
                    </svg>
                    <span className="min-w-0">
                      <span className="block font-mono text-[11px] text-gold">C{n}</span>
                      <span className="block truncate text-sm text-ivory">{label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-dim">{t('builder.constellationHint')}</p>
          {pendingBar}
        </section>
      )}

      {tab === 'talents' && (
        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="eyebrow">{t('characters.talents')}</span>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setNormal(10);
                setSkill(10);
                setBurst(10);
              }}
            >
              {t('builder.maxAll')}
            </button>
          </div>
          {owned.talents ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ['normal', normal, setNormal],
                  ['skill', skill, setSkill],
                  ['burst', burst, setBurst],
                ] as const
              ).map(([key, value, setter]) => (
                <div key={key} className="rounded-xl border border-line bg-abyss/40 p-3">
                  <div className="mb-1 text-xs text-mist">{t.dyn(`characters.${key}`)}</div>
                  <div className="mb-2 truncate text-sm text-ivory" title={t.loc(character.talents?.[key]?.name)}>
                    {t.loc(character.talents?.[key]?.name) || '—'}
                  </div>
                  <Segmented label={t.dyn(`characters.${key}`)} value={value} onChange={setter} options={[1, 5, 8, 9, 10].map((n) => ({ value: n, label: n }))} />
                  <div className="mt-3">
                    <Stepper value={value} onChange={setter} min={1} max={10} label={t.dyn(`characters.${key}`)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-mist">{t('builder.none')}</p>
          )}
          {pendingBar}
        </section>
      )}

      {tab === 'summary' && <SummaryTab ctx={ctx} />}

      <OperationDialog spec={spec} onClose={() => setSpec(null)} onDone={() => refresh()} />
    </div>
  );
}
