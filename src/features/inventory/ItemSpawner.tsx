import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Ban, BookmarkPlus, CheckCircle2, CheckSquare, Clock, FolderOpen, Hammer, Info, PackagePlus, Search, Send, Square, Star, Trash2, TriangleAlert, XCircle, Zap } from 'lucide-react';
import { useT } from '@/i18n';
import { useCatalog } from '@/data/catalog';
import { api, type GiveItemsResult } from '@/api/nukva';
import { useInventory, usePlayer, useServerItemCatalog } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { useToasts } from '@/stores/ops';
import { usePresets } from '@/stores/presets';
import { useSpawner } from '@/stores/spawner';
import { Artwork } from '@/components/fx/Artwork';
import { Modal } from '@/components/ui/Overlay';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { EmptyState, ErrorState, IdTag, Panel, RarityStars, SkeletonGrid, Stepper } from '@/components/ui/Primitives';
import { normalize } from '@/lib/search';
import { ease } from '@/lib/motion';
import {
  addLine,
  applyServerCatalog,
  batchProblems,
  buildEntries,
  checkAmount,
  maxGive,
  ownedCounts,
  quickAmounts,
  SPAWN_CATEGORIES,
  type AmountProblem,
  type BatchLine,
  type SpawnCategory,
  type SpawnEntry,
} from '@/lib/spawner';

type Filter = 'all' | 'favorites' | 'recent' | SpawnCategory;
const PAGE = 96;

/**
 * Visual item spawner: search the 7.2 catalog, pick exact items, set amounts, review and give them
 * through POST /players/{uid}/items. The server re-validates everything and reads the inventory back.
 */
export function ItemSpawner() {
  const t = useT();
  const materials = useCatalog('materials');
  const furniture = useCatalog('furniture');
  const weapons = useCatalog('weapons');
  const server = useServerItemCatalog();
  const uid = useSession((s) => s.uid);
  const mode = useSession((s) => s.mode);
  const status = useSession((s) => s.status);
  const inventory = useInventory(uid);
  const player = usePlayer(uid);
  const { favorites, recent, toggleFavorite, pushRecent } = useSpawner();
  const presets = usePresets((s) => s.presets);
  const addPreset = usePresets((s) => s.add);
  const toast = useToasts((s) => s.show);

  const limits = { maxStackAmount: status?.limits.maxStackAmount ?? 1_000_000, maxUnstackableAmount: status?.limits.maxUnstackableAmount ?? 50 };
  const maxLines = status?.limits.maxBatchSize ?? 50;

  const [filter, setFilter] = useState<Filter>('all');
  const [rarity, setRarity] = useState<number | null>(null);
  const [showUnsupported, setShowUnsupported] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<SpawnEntry | null>(null);
  const [batch, setBatch] = useState<BatchLine[]>([]);
  const [spec, setSpec] = useState<OperationSpec<GiveItemsResult> | null>(null);
  const [last, setLast] = useState<GiveItemsResult | null>(null);
  const [bundlesOpen, setBundlesOpen] = useState(false);

  const entries = useMemo(
    () => applyServerCatalog(buildEntries(materials.data, furniture.data, weapons.data), server.data),
    [materials.data, furniture.data, weapons.data, server.data],
  );
  const index = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const owned = useMemo(() => ownedCounts(inventory.data, player.data?.currencies), [inventory.data, player.data]);
  const ownedKnown = mode === 'connected' && !!uid && !!inventory.data;

  const list = useMemo(() => {
    const q = normalize(query);
    const fav = new Set(favorites);
    const order = filter === 'recent' ? recent : null;
    let rows = entries.filter((e) => {
      if (!showUnsupported && e.kind === 'unsupported') return false;
      if (filter === 'favorites' && !fav.has(e.id)) return false;
      if (filter === 'recent' && !recent.includes(e.id)) return false;
      if (filter !== 'all' && filter !== 'favorites' && filter !== 'recent' && e.category !== filter) return false;
      if (rarity && e.rarity !== rarity) return false;
      if (q && !(String(e.id).startsWith(q) || normalize(`${e.name.en} ${e.name.th ?? ''}`).includes(q))) return false;
      return true;
    });
    if (order) rows = rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return rows;
  }, [entries, query, filter, rarity, showUnsupported, favorites, recent]);

  const loading = !materials.data || !furniture.data || !weapons.data;
  const loadError = materials.error ?? furniture.error ?? weapons.error;
  const nameOf = (id: number) => t.loc(index.get(id)?.name) || `#${id}`;
  const selected = new Set(batch.map((b) => b.itemId));
  const problems = batchProblems(batch, index, owned, limits);

  const add = (entry: SpawnEntry, amount: number) => {
    const line: BatchLine = entry.kind === 'weapon' ? { itemId: entry.id, amount, level: 1, refinement: 1 } : { itemId: entry.id, amount };
    const r = addLine(batch, line, maxLines);
    if (!r.added) toast({ tone: 'error', title: t('spawner.selectionFull', { n: maxLines }) });
    setBatch(r.batch);
  };
  const toggleSelect = (entry: SpawnEntry) => {
    if (selected.has(entry.id)) setBatch((cur) => cur.filter((b) => b.itemId !== entry.id));
    else add(entry, 1);
  };

  const giveSpec = (lines: BatchLine[]): OperationSpec<GiveItemsResult> => ({
    title: lines.length === 1 ? `${t('spawner.give')} — ${nameOf(lines[0].itemId)}` : t('spawner.giveSelected', { n: lines.length }),
    capability: 'items.give',
    action: 'items.give',
    summary: lines.map((e) => `${nameOf(e.itemId)} ×${e.amount}`).join(', '),
    lines: lines.map((e) => {
      const entry = index.get(e.itemId);
      const have = owned.get(e.itemId);
      const after = entry?.kind === 'stackable' || entry?.kind === 'currency' ? (have ?? 0) + e.amount : null;
      return {
        label: `#${e.itemId}`,
        value: (
          <span>
            {nameOf(e.itemId)} × {t.num(e.amount)}
            {entry?.kind === 'weapon' && <span className="text-dim"> · Lv1 R1 · {t('spawner.instances', { n: e.amount })}</span>}
            {ownedKnown && after !== null && <span className="text-dim"> · {t.num(have ?? 0)} → {t.num(after)}</span>}
          </span>
        ),
      };
    }),
    request: { method: 'POST', path: '/players/{uid}/items', body: { items: lines } },
    run: (conn, target) => api.giveItems(conn, target, lines),
    judge: (r) => {
      const failed = r.results.filter((x) => !x.success);
      if (failed.length === 0) return { status: 'success', detail: r.results.map((x) => `#${x.itemId} ${x.verification}`).join(', ') };
      if (failed.length === r.results.length) return { status: 'failed', detail: failed.map((f) => f.note).filter(Boolean)[0] ?? 'server added nothing' };
      return { status: 'partial', detail: `not added: ${failed.map((f) => `#${f.itemId}${f.note ? ` (${f.note})` : ''}`).join(', ')}` };
    },
  });

  const filters: Filter[] = ['all', 'favorites', 'recent', ...SPAWN_CATEGORIES];
  const bundles = presets.filter((p) => p.kind === 'bundle');

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
      <div className="min-w-0">
        <div className="panel mb-5 space-y-3 p-4">
          <div className="relative">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
            <input
              className="field pl-9"
              placeholder={t('spawner.searchPlaceholder')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              aria-label={t('common.search')}
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('inventory.category')}>
            {filters.map((f) => (
              <button
                key={f}
                className="chip"
                aria-pressed={filter === f}
                onClick={() => {
                  setFilter(f);
                  setLimit(PAGE);
                }}
              >
                {f === 'favorites' && <Star size={11} />}
                {f === 'recent' && <Clock size={11} />}
                {t.dyn(`spawner.categories.${f}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-mist">
            {[5, 4, 3, 2, 1].map((r) => (
              <button key={r} className="chip" aria-pressed={rarity === r} onClick={() => setRarity(rarity === r ? null : r)}>
                {t('common.stars', { n: r })}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={showUnsupported} onChange={(e) => setShowUnsupported(e.target.checked)} />
              {t('spawner.showUnsupported')}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-dim">
            <span>{mode === 'connected' && uid ? t('spawner.target', { uid }) : t('states.needPlayer')}</span>
            <span>{server.data ? t('spawner.serverChecked') : t('spawner.catalogOnly')}</span>
            <Link to="/armory" className="inline-flex items-center gap-1 underline decoration-dotted hover:text-gold">
              <Hammer size={11} /> {t('spawner.artifactsHere')}
            </Link>
          </div>
        </div>

        {loadError ? (
          <ErrorState error={loadError} onRetry={() => (materials.retry(), furniture.retry(), weapons.retry())} />
        ) : loading ? (
          <SkeletonGrid count={12} className="h-36" />
        ) : list.length === 0 ? (
          <EmptyState title={filter === 'favorites' ? t('spawner.noFavorites') : filter === 'recent' ? t('spawner.noRecent') : t('search.empty', { q: query })} />
        ) : (
          <>
            <div className="mb-3 text-xs text-dim">{t('common.showing', { n: Math.min(limit, list.length), total: list.length })}</div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {list.slice(0, limit).map((e) => (
                <SpawnCard
                  key={e.id}
                  entry={e}
                  owned={ownedKnown ? owned.get(e.id) ?? 0 : undefined}
                  favorite={favorites.includes(e.id)}
                  selected={selected.has(e.id)}
                  onOpen={() => setDetail(e)}
                  onToggle={() => toggleSelect(e)}
                  onFavorite={() => toggleFavorite(e.id)}
                />
              ))}
            </ul>
            {list.length > limit && (
              <div className="mt-5 text-center">
                <button className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE * 2)}>
                  {t('common.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Selection tray */}
      <aside className="space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
        <Panel corners className="p-5" eyebrow={t('spawner.selection')} title={`${batch.length} / ${maxLines}`}>
          {batch.length === 0 ? (
            <p className="py-6 text-center text-sm text-dim">{t('spawner.selectionEmpty')}</p>
          ) : (
            <ul className="scroll-fade -mx-1 max-h-[44vh] space-y-2 overflow-y-auto px-1 py-2">
              <AnimatePresence initial={false}>
                {batch.map((line) => {
                  const entry = index.get(line.itemId);
                  const problem = problems.get(line.itemId);
                  const max = entry ? maxGive(entry, owned.get(line.itemId), limits) : 0;
                  return (
                    <motion.li
                      key={`${line.itemId}:${line.level ?? ''}`}
                      layout
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.25, ease }}
                      className={`flex items-center gap-2.5 rounded-xl border bg-abyss/40 p-2 ${problem ? 'border-danger/50' : 'border-line'}`}
                    >
                      <Artwork icon={entry?.icon} name={entry?.name.en ?? `#${line.itemId}`} rarity={entry?.rarity} size={34} rounded="rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-ivory">{nameOf(line.itemId)}</div>
                        <div className="mt-1 w-[120px]">
                          <Stepper
                            value={line.amount}
                            onChange={(v) => setBatch((cur) => cur.map((x) => (x === line ? { ...x, amount: v } : x)))}
                            min={1}
                            max={Math.max(1, entry?.kind === 'stackable' || entry?.kind === 'currency' ? limits.maxStackAmount : max)}
                            label={t('common.amount')}
                          />
                        </div>
                        {problem && <div className="mt-1 text-[11px] text-danger">{problemText(t, problem)}</div>}
                      </div>
                      <button className="btn btn-quiet btn-icon" onClick={() => setBatch((cur) => cur.filter((x) => x !== line))} aria-label={t('common.remove')}>
                        <Trash2 size={14} />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-primary flex-1" disabled={batch.length === 0 || problems.size > 0} onClick={() => setSpec(giveSpec(batch))}>
              <Send size={15} /> {t('spawner.giveSelected', { n: batch.length })}
            </button>
            <button
              className="btn btn-ghost btn-icon"
              disabled={batch.length === 0}
              title={t('spawner.saveBundle')}
              aria-label={t('spawner.saveBundle')}
              onClick={() => {
                addPreset({ kind: 'bundle', name: `${t('presets.kinds.bundle')} · ${batch.map((b) => nameOf(b.itemId)).slice(0, 2).join(', ')}${batch.length > 2 ? '…' : ''}`, payload: { items: batch.map((b) => ({ itemId: b.itemId, amount: b.amount })) } });
                toast({ tone: 'info', title: t('spawner.saveBundle'), body: t('spawner.lines', { n: batch.length }) });
              }}
            >
              <BookmarkPlus size={15} />
            </button>
            <button className="btn btn-ghost btn-icon" title={t('spawner.loadBundle')} aria-label={t('spawner.loadBundle')} onClick={() => setBundlesOpen(true)}>
              <FolderOpen size={15} />
            </button>
            <button className="btn btn-quiet btn-icon" disabled={batch.length === 0} onClick={() => setBatch([])} aria-label={t('common.clear')}>
              <Trash2 size={15} />
            </button>
          </div>
          {problems.size > 0 && <p className="mt-2 text-[11px] text-danger">{t('spawner.fixProblems')}</p>}
          <p className="mt-2 text-[11px] text-dim">{t('spawner.noUndo')}</p>
        </Panel>

        {last && <ResultPanel result={last} nameOf={nameOf} onClose={() => setLast(null)} />}
      </aside>

      <ItemDetail
        entry={detail}
        owned={detail && ownedKnown ? owned.get(detail.id) ?? 0 : undefined}
        limits={limits}
        favorite={!!detail && favorites.includes(detail.id)}
        onFavorite={() => detail && toggleFavorite(detail.id)}
        onClose={() => setDetail(null)}
        onGive={(entry, amount) => {
          setDetail(null);
          const line: BatchLine = entry.kind === 'weapon' ? { itemId: entry.id, amount, level: 1, refinement: 1 } : { itemId: entry.id, amount };
          setSpec(giveSpec([line]));
        }}
        onSelect={(entry, amount) => {
          add(entry, amount);
          setDetail(null);
        }}
      />

      <Modal open={bundlesOpen} onClose={() => setBundlesOpen(false)} title={t('spawner.loadBundle')} eyebrow={t('presets.kinds.bundle')}>
        {bundles.length === 0 ? (
          <EmptyState title={t('spawner.noBundles')} />
        ) : (
          <ul className="space-y-2">
            {bundles.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-xl border border-line bg-abyss/40 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ivory">{b.name}</div>
                  <div className="truncate text-[11px] text-dim">{b.payload.items.map((i) => `${nameOf(i.itemId)} ×${i.amount}`).join(', ')}</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    let next = batch;
                    for (const i of b.payload.items) next = addLine(next, { itemId: i.itemId, amount: i.amount, ...(index.get(i.itemId)?.kind === 'weapon' ? { level: 1, refinement: 1 } : {}) }, maxLines).batch;
                    setBatch(next);
                    setBundlesOpen(false);
                  }}
                >
                  {t('spawner.loadIntoSelection')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <OperationDialog
        spec={spec}
        onClose={() => setSpec(null)}
        onDone={(result) => {
          setLast(result);
          pushRecent(result.results.filter((r) => r.success).map((r) => r.itemId));
          if (spec && spec.request.body && (spec.request.body as { items: BatchLine[] }).items === batch) setBatch([]);
          inventory.refresh();
          player.refresh();
        }}
      />
    </div>
  );
}

function problemText(t: ReturnType<typeof useT>, p: NonNullable<AmountProblem>): string {
  switch (p.code) {
    case 'UNSUPPORTED':
      return t('spawner.problem.unsupported');
    case 'STACK_LIMIT':
      return p.max === 0 ? t('spawner.problem.full') : t('spawner.problem.stack', { n: t.num(p.max) });
    case 'TOO_MANY':
      return t('spawner.problem.tooMany', { n: t.num(p.max) });
    case 'ZERO':
      return t('spawner.problem.zero');
  }
}

function SpawnCard({
  entry: e,
  owned,
  favorite,
  selected,
  onOpen,
  onToggle,
  onFavorite,
}: {
  entry: SpawnEntry;
  owned: number | undefined;
  favorite: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onFavorite: () => void;
}) {
  const t = useT();
  const unsupported = e.kind === 'unsupported';
  return (
    <li className={`panel relative flex flex-col gap-2.5 p-3 ${selected ? 'ring-1 ring-gold/60' : ''} ${unsupported ? 'opacity-60' : 'panel-interactive'}`}>
      <button className="flex items-start gap-3 text-left" onClick={onOpen} aria-label={t('spawner.details', { name: t.loc(e.name) })}>
        <Artwork icon={e.icon} name={e.name.en} rarity={e.rarity} size={48} rounded="rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-sm font-medium text-ivory" title={t.loc(e.name)}>
            {t.loc(e.name)}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <IdTag id={e.id} />
            <RarityStars rarity={e.rarity} size={8} />
          </span>
        </span>
      </button>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="rounded-md border border-line px-1.5 py-0.5 text-mist">{t.dyn(`spawner.categories.${e.category}`)}</span>
        {owned !== undefined && e.countable && e.kind !== 'unlock' && <span className="font-mono text-pale">{t('spawner.ownedShort', { n: t.num(owned) })}</span>}
        <span className="ml-auto flex items-center gap-1">
          <button className="btn btn-quiet btn-icon h-7 w-7" onClick={onFavorite} aria-pressed={favorite} aria-label={t('spawner.favorite')} title={t('spawner.favorite')}>
            <Star size={14} className={favorite ? 'fill-gold text-gold' : ''} />
          </button>
          {!unsupported && (
            <button className="btn btn-quiet btn-icon h-7 w-7" onClick={onToggle} aria-pressed={selected} aria-label={t('spawner.select')} title={t('spawner.select')}>
              {selected ? <CheckSquare size={15} className="text-gold" /> : <Square size={15} />}
            </button>
          )}
        </span>
      </div>
      {unsupported && (
        <div className="flex items-start gap-1.5 text-[11px] text-warn">
          <Ban size={12} className="mt-0.5 shrink-0" /> {t.dyn(`spawner.reasons.${e.reason ?? 'UNSUPPORTED'}`)}
        </div>
      )}
    </li>
  );
}

function ItemDetail({
  entry,
  owned,
  limits,
  favorite,
  onFavorite,
  onClose,
  onGive,
  onSelect,
}: {
  entry: SpawnEntry | null;
  owned: number | undefined;
  limits: { maxStackAmount: number; maxUnstackableAmount: number };
  favorite: boolean;
  onFavorite: () => void;
  onClose: () => void;
  onGive: (e: SpawnEntry, amount: number) => void;
  onSelect: (e: SpawnEntry, amount: number) => void;
}) {
  const t = useT();
  const text = useCatalog('material-text');
  const [amount, setAmount] = useState(1);
  const [forId, setForId] = useState<number | null>(null);
  if (entry && forId !== entry.id) {
    setForId(entry.id);
    setAmount(1);
  }
  if (!entry) return null;
  const max = maxGive(entry, owned, limits);
  const problem = checkAmount(entry, owned, amount, limits);
  const desc = entry.source === 'material' ? text.data?.[entry.id] : undefined;
  const quick = quickAmounts(entry, owned, limits);
  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={t.dyn(`spawner.categories.${entry.category}`)}
      title={t.loc(entry.name)}
      width="max-w-2xl"
      footer={
        entry.kind === 'unsupported' ? null : (
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn btn-ghost" disabled={!!problem} onClick={() => onSelect(entry, amount)}>
              <PackagePlus size={15} /> {t('spawner.addToSelection')}
            </button>
            <button className="btn btn-primary" disabled={!!problem} onClick={() => onGive(entry, amount)}>
              <Zap size={15} /> {t('spawner.give')}
            </button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="shrink-0 self-center">
          <Artwork icon={entry.icon} name={entry.name.en} rarity={entry.rarity} size={128} rounded="rounded-2xl" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <IdTag id={entry.id} />
            <RarityStars rarity={entry.rarity} size={11} />
            <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-mist">{entry.type}</span>
            <button className="btn btn-quiet btn-sm ml-auto" onClick={onFavorite} aria-pressed={favorite}>
              <Star size={13} className={favorite ? 'fill-gold text-gold' : ''} /> {t('spawner.favorite')}
            </button>
          </div>
          {entry.source === 'material' && (
            <p className="text-sm leading-relaxed text-mist">{text.data ? (desc ? t.loc(desc) : <span className="text-dim">{t('spawner.noDescription')}</span>) : t('common.loading')}</p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-line p-2">
              <dt className="text-dim">{t('spawner.owned')}</dt>
              <dd className="font-mono text-ivory">{owned === undefined ? '—' : !entry.countable ? t('spawner.noBalance') : t.num(owned)}</dd>
            </div>
            <div className="rounded-lg border border-line p-2">
              <dt className="text-dim">{t('spawner.stackLimit')}</dt>
              <dd className="font-mono text-ivory">{entry.kind === 'weapon' ? t('spawner.perInstance') : entry.stackLimit ? t.num(entry.stackLimit) : '—'}</dd>
            </div>
          </dl>
          {entry.serverChecked && (
            <p className="flex items-center gap-1.5 text-[11px] text-ok">
              <CheckCircle2 size={12} /> {t('spawner.serverCheckedItem')}
            </p>
          )}
          {entry.kind === 'unsupported' ? (
            <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/[0.06] p-3 text-sm text-warn">
              <Ban size={16} className="mt-0.5 shrink-0" />
              <div>
                <div>{t.dyn(`spawner.reasons.${entry.reason ?? 'UNSUPPORTED'}`)}</div>
                {entry.reason === 'USE_CHARACTER_BUILDER' && (
                  <Link to="/builder" className="mt-1 inline-block underline">
                    {t('nav.builder')}
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="label">{t('common.amount')}</div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-[150px]">
                  <Stepper value={amount} onChange={setAmount} min={1} max={Math.max(1, max)} label={t('common.amount')} />
                </div>
                {quick.map((n) => (
                  <button key={n} className="chip" aria-pressed={amount === n} onClick={() => setAmount(n)}>
                    {n === max && n > 1 ? `${t('spawner.max')} ${t.num(n)}` : t.num(n)}
                  </button>
                ))}
              </div>
              {problem && (
                <p className="flex items-center gap-1.5 text-xs text-danger">
                  <TriangleAlert size={12} /> {problemText(t, problem)}
                </p>
              )}
              {entry.kind === 'weapon' && (
                <p className="flex items-start gap-1.5 text-xs text-dim">
                  <Info size={12} className="mt-0.5 shrink-0" />
                  <span>
                    {t('spawner.weaponNote')}{' '}
                    <Link to={`/armory?weapon=${entry.id}`} className="underline hover:text-gold">
                      {t('spawner.openWeaponBuilder')}
                    </Link>
                  </span>
                </p>
              )}
              {entry.kind === 'unlock' && <p className="text-xs text-dim">{t('spawner.unlockNote')}</p>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ResultPanel({ result, nameOf, onClose }: { result: GiveItemsResult; nameOf: (id: number) => string; onClose: () => void }) {
  const t = useT();
  return (
    <Panel className="p-4" eyebrow={t('spawner.lastResult')} actions={<button className="btn btn-quiet btn-sm" onClick={onClose}>{t('common.close')}</button>}>
      <ul className="space-y-2 text-xs">
        {result.results.map((r, i) => (
          <li key={`${r.itemId}:${i}`} className="flex items-start gap-2">
            {r.success ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-ok" /> : <XCircle size={14} className="mt-0.5 shrink-0 text-danger" />}
            <div className="min-w-0">
              <div className="text-ivory">
                {nameOf(r.itemId)} <span className="font-mono text-dim">#{r.itemId}</span>
              </div>
              <div className="text-dim">
                {t('spawner.addedOf', { n: t.num(r.added), total: t.num(r.requested) })} · {t.dyn(`spawner.verification.${r.verification}`)}
                {r.before !== undefined && r.after !== undefined && ` · ${t.num(r.before)} → ${t.num(r.after)}`}
                {r.guids.length > 0 && ` · GUID ${r.guids.slice(0, 3).join(', ')}${r.guids.length > 3 ? '…' : ''}`}
              </div>
              {r.note && <div className="text-warn">{r.note}</div>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
