import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookmarkPlus, CheckCircle2, FolderOpen, PackageCheck, Pencil, RotateCcw, Search, Shirt, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { useT } from '@/i18n';
import { byId, useCatalog } from '@/data/catalog';
import { api, type GiveArtifactResult, type InventoryItem, type OwnedAvatar } from '@/api/nukva';
import { ApiError } from '@/api/client';
import { useAvatars, useInventory } from '@/api/hooks';
import { useConnection, useSession } from '@/stores/session';
import { usePresets } from '@/stores/presets';
import { useToasts } from '@/stores/ops';
import { Artwork } from '@/components/fx/Artwork';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { EmptyState, ErrorState, IdTag, Panel, RangeField, RarityStars, Segmented, SkeletonGrid } from '@/components/ui/Primitives';
import { SLOTS, type ArtifactData, type ArtifactPiece, type ArtifactSet, type Slot } from '@/data/types';
import { formatStatValue, statName } from '@/lib/stats';
import { normalize } from '@/lib/search';
import { indexPieces, slotOf } from '@/lib/builder';
import {
  allowedMainStats,
  allowedStarts,
  nextRollChoices,
  rollStage,
  rollsFromIds,
  substatTotals,
  SUBSTAT_TYPES,
  tiersFor,
  upgradesAt,
  validateCustom,
  type Roll,
} from '@/lib/artifactRules';

type Mode = 'normal' | 'custom';
type ResultSpec = OperationSpec<unknown>;

export function ArtifactForge({ initial }: { initial: number | null }) {
  const t = useT();
  const artifacts = useCatalog('artifacts');
  const [view, setView] = useState<'build' | 'owned'>('build');
  const [editing, setEditing] = useState<{ item: InventoryItem; info: { set: ArtifactSet; piece: ArtifactPiece; slot: Slot } } | null>(null);

  if (artifacts.error) return <ErrorState error={artifacts.error} onRetry={artifacts.retry} />;
  if (!artifacts.data) return <SkeletonGrid count={12} className="h-20" />;

  return (
    <div className="space-y-5">
      <Segmented
        label="artifact-view"
        value={view}
        onChange={setView}
        options={[
          { value: 'build', label: t('forge.viewBuild') },
          { value: 'owned', label: t('forge.viewOwned') },
        ]}
      />
      {view === 'build' ? (
        <Builder data={artifacts.data} initial={initial} editing={editing} onEditDone={() => setEditing(null)} />
      ) : (
        <Owned
          data={artifacts.data}
          onEdit={(item, info) => {
            setEditing({ item, info });
            setView('build');
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ builder

function Builder({
  data,
  initial,
  editing,
  onEditDone,
}: {
  data: ArtifactData;
  initial: number | null;
  editing: { item: InventoryItem; info: { set: ArtifactSet; piece: ArtifactPiece; slot: Slot } } | null;
  onEditDone: () => void;
}) {
  const t = useT();
  const uid = useSession((s) => s.uid);
  const conn = useConnection();
  const presets = usePresets((s) => s.presets);
  const addPreset = usePresets((s) => s.add);
  const toast = useToasts((s) => s.show);
  const [query, setQuery] = useState('');
  const [rarityFilter, setRarityFilter] = useState<number | null>(null);
  const [set, setSet] = useState<ArtifactSet | null>(null);
  const [slot, setSlot] = useState<Slot>('flower');
  const [rarity, setRarity] = useState(5);
  const [plus, setPlus] = useState(20);
  const [mode, setMode] = useState<Mode>('normal');
  const [mainPropId, setMainPropId] = useState<number | null>(null);
  const [start, setStart] = useState(4);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [spec, setSpec] = useState<ResultSpec | null>(null);
  const [created, setCreated] = useState<GiveArtifactResult | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  useEffect(() => {
    if (initial) setSet(data.sets.find((s) => s.id === initial) ?? null);
  }, [initial, data]);

  // Editing an existing artifact: load its exact rolls into custom mode.
  useEffect(() => {
    if (!editing) return;
    const { item, info } = editing;
    setSet(info.set);
    setSlot(info.slot);
    setRarity(info.piece.rarity);
    setMode('custom');
    setPlus(item.level - 1);
    setMainPropId(item.mainPropId ?? null);
    const loaded = rollsFromIds(item.appendPropIds ?? [], data.subProps[info.piece.subDepot] ?? []);
    setStart(Math.max(0, loaded.length - upgradesAt(item.level - 1)));
    setRolls(loaded);
    setCreated(null);
  }, [editing, data]);

  const pieces = set?.pieces[slot] ?? [];
  const piece: ArtifactPiece | undefined = pieces.find((p) => p.rarity === rarity) ?? pieces[0];
  useEffect(() => {
    if (piece && piece.rarity !== rarity) setRarity(piece.rarity);
  }, [piece, rarity]);

  const maxPlus = piece ? piece.maxLevel - 1 : 20;
  const starts = piece ? allowedStarts(piece.rarity, piece.initialSubs) : [0];
  const upgrades = upgradesAt(plus);
  const mains = piece ? allowedMainStats(slot, data.mainProps[piece.mainDepot] ?? []) : [];
  const subs = piece ? data.subProps[piece.subDepot] ?? [] : [];
  const mainProp = mains.find((m) => m.id === mainPropId)?.prop ?? null;

  // A new piece resets the configuration (but not while loading an edit).
  useEffect(() => {
    if (editing && piece?.id === editing.item.itemId) return;
    setPlus((p) => Math.min(p, maxPlus));
    setMainPropId(mains[0]?.id ?? null);
    setStart(starts[starts.length - 1]);
    setRolls([]);
    setCreated(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece?.id]);
  // Fewer levels or a different start can make later rolls impossible: trim them.
  useEffect(() => setRolls((r) => (r.length > start + upgrades ? r.slice(0, start + upgrades) : r)), [start, upgrades]);
  useEffect(() => setRolls((r) => (mainProp && r.some((x) => x.prop === mainProp) ? [] : r)), [mainProp]);

  const choices = nextRollChoices(rolls, start, upgrades, mainProp);
  const issues = mode === 'custom' ? validateCustom({ slot, mainProp, start, plus, rolls }) : [];
  const totals = substatTotals(rolls);

  const filteredSets = useMemo(() => {
    const q = normalize(query);
    return data.sets.filter(
      (s) =>
        (!rarityFilter || SLOTS.some((sl) => s.pieces[sl]?.some((p) => p.rarity === rarityFilter))) &&
        (!q || String(s.id).startsWith(q) || normalize(`${s.name.en} ${s.name.th ?? ''}`).includes(q)),
    );
  }, [data.sets, query, rarityFilter]);
  const rarities = useMemo(() => [...new Set(data.sets.flatMap((s) => SLOTS.flatMap((sl) => (s.pieces[sl] ?? []).map((p) => p.rarity))))].sort((a, b) => b - a), [data.sets]);

  const artifactPresets = presets.flatMap((p) =>
    p.kind === 'equipment' ? p.payload.artifacts.map((a, i) => ({ key: `${p.id}:${i}`, name: p.name, entry: a })) : [],
  );
  const pieceIndex = useMemo(() => indexPieces(data), [data]);

  const loadPreset = (entry: (typeof artifactPresets)[number]['entry']) => {
    const info = pieceIndex.get(entry.itemId);
    if (!info) {
      toast({ tone: 'error', title: t('forge.presetMissing'), body: `#${entry.itemId}` });
      return;
    }
    setSet(info.set);
    setSlot(info.slot);
    setRarity(info.piece.rarity);
    // Applied after the piece-reset effect above has run.
    setTimeout(() => {
      setPlus(entry.level - 1);
      setMainPropId(entry.mainPropId);
      const m: Mode = entry.mode === 'normal' ? 'normal' : 'custom';
      setMode(m);
      const loaded = rollsFromIds(entry.appendPropIds, data.subProps[info.piece.subDepot] ?? []);
      setStart(entry.initialSubstats ?? Math.max(0, loaded.length - upgradesAt(entry.level - 1)));
      setRolls(m === 'custom' ? loaded : []);
    });
    setShowPresets(false);
  };

  const review = () => {
    if (!piece) return;
    const name = t.loc(piece.name);
    const lines = [
      { label: t('forge.piece'), value: `${name} · ${t.loc(set?.name)} (#${piece.id}, set #${set?.id})` },
      { label: t('common.level'), value: `+${plus}` },
      { label: t('forge.mode'), value: mode === 'normal' ? t('forge.modeNormal') : t('forge.modeCustom') },
      { label: t('armory.mainStat'), value: mainProp ? `${statName(mainProp, t.lang)} (#${mainPropId})` : t('armory.randomMain') },
      {
        label: t('armory.substats'),
        value:
          mode === 'normal'
            ? t('forge.serverRolls', { start, up: upgrades })
            : totals.map((x) => `${statName(x.prop, t.lang)} ${formatStatValue(x.prop, x.total)} (${x.rolls}×)`).join(', '),
      },
    ];
    if (editing) {
      const patch = { level: plus + 1, ...(mainPropId ? { mainPropId } : {}), appendPropIds: rolls.map((r) => r.id), mode: 'custom' as const };
      setSpec({
        title: `${t('forge.saveEdit')} — ${name}`,
        capability: 'items.edit',
        action: 'item.update',
        summary: `${name} #${editing.item.guid} +${plus}`,
        lines: [{ label: 'GUID', value: editing.item.guid }, ...lines],
        request: { method: 'PATCH', path: `/players/{uid}/items/${editing.item.guid}`, body: patch },
        run: (c, u) => api.patchItem(c, u, editing.item.guid, patch),
      });
      return;
    }
    const body =
      mode === 'normal'
        ? { itemId: piece.id, level: plus + 1, mode: 'normal' as const, initialSubstats: start, ...(mainPropId ? { mainPropId } : {}) }
        : { itemId: piece.id, level: plus + 1, mode: 'custom' as const, mainPropId: mainPropId ?? undefined, appendPropIds: rolls.map((r) => r.id) };
    setSpec({
      title: `${t('armory.giveArtifact')} — ${name}`,
      capability: 'artifacts.give',
      action: 'artifact.give',
      summary: `${name} +${plus} (${mode})`,
      lines,
      request: { method: 'POST', path: '/players/{uid}/artifacts', body },
      run: (c, u) => api.giveArtifact(c, u, body),
      judge: (r) => {
        const res = r as GiveArtifactResult;
        return res.success && res.artifacts.length === 1 ? { status: 'success', detail: `guid ${res.artifacts[0].guid}` } : { status: 'failed', detail: 'not stored' };
      },
    });
  };

  const savePreset = () => {
    if (!piece) return;
    addPreset({
      kind: 'equipment',
      name: `${t.loc(piece.name)} +${plus} (${mode})`,
      payload: {
        weapon: null,
        artifacts: [{ itemId: piece.id, level: plus + 1, mainPropId, appendPropIds: mode === 'custom' ? rolls.map((r) => r.id) : [], mode, initialSubstats: start }],
      },
    });
    toast({ tone: 'info', title: t('characters.saveAsPreset'), body: t.loc(piece.name) });
  };

  const canCreate = !!piece && (mode === 'normal' ? true : issues.length === 0);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
      <div className="min-w-0">
        <div className="relative mb-3">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
          <input className="field pl-9" placeholder={t('armory.pickSet')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('armory.pickSet')} />
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {rarities.map((r) => (
            <button key={r} className="chip" aria-pressed={rarityFilter === r} onClick={() => setRarityFilter(rarityFilter === r ? null : r)}>
              {r}★
            </button>
          ))}
        </div>
        <ul className="scroll-fade max-h-[38vh] space-y-1.5 overflow-y-auto py-2 pr-1 xl:max-h-[70vh]">
          {filteredSets.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => {
                  setSet(s);
                  if (editing) onEditDone();
                  if (rarityFilter) setRarity(rarityFilter);
                }}
                className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${set?.id === s.id ? 'border-gold/50 bg-gold/[0.08]' : 'border-transparent hover:bg-white/[0.03]'}`}
              >
                <Artwork icon={s.icon} name={s.name.en} rarity={s.maxRarity} size={40} rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ivory">{t.loc(s.name)}</div>
                  <RarityStars rarity={s.maxRarity} size={8} />
                </div>
                <IdTag id={s.id} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Panel corners className="p-6">
        {!set || !piece ? (
          <EmptyState icon={<Sparkles size={22} />} title={t('armory.pickSet')} />
        ) : (
          <div className="grid grid-cols-1 gap-8 2xl:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              {editing && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan/30 bg-cyan/[0.05] px-3 py-2 text-xs text-cyan">
                  <span>
                    <Pencil size={13} className="mr-1.5 inline" />
                    {t('forge.editingGuid', { guid: editing.item.guid })}
                  </span>
                  <button className="btn btn-quiet btn-icon p-1" onClick={onEditDone} aria-label={t('common.cancel')}>
                    <X size={13} />
                  </button>
                </div>
              )}
              <div>
                <div className="title-display text-gilded text-2xl">{t.loc(set.name)}</div>
                <div className="mt-3 space-y-1.5">
                  {set.bonuses.map((b) => (
                    <p key={b.pieces} className="text-xs leading-relaxed text-mist">
                      <span className="mr-1.5 font-semibold text-gold">{b.pieces}×</span>
                      {t.loc(b.text)}
                    </p>
                  ))}
                </div>
              </div>

              <div>
                <div className="label">{t('armory.slot')}</div>
                <div className="grid grid-cols-5 gap-2">
                  {SLOTS.map((s) => {
                    const p = set.pieces[s]?.find((x) => x.rarity === rarity) ?? set.pieces[s]?.[0];
                    return (
                      <button
                        key={s}
                        disabled={!p || !!editing}
                        onClick={() => setSlot(s)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] transition-colors disabled:opacity-30 ${slot === s ? 'border-gold/60 bg-gold/10 text-ivory' : 'border-line text-mist hover:border-gold/30'}`}
                      >
                        <Artwork icon={p?.icon} name={p?.name.en ?? s} rarity={p?.rarity} size={40} rounded="rounded-lg" />
                        {t.dyn(`armory.slots.${s}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Segmented
                  label="artifact-rarity"
                  value={rarity}
                  onChange={(r) => !editing && setRarity(r)}
                  options={[...new Set(pieces.map((p) => p.rarity))].map((r) => ({ value: r, label: `${r}★` }))}
                />
                <span className="text-sm text-ivory">{t.loc(piece.name)}</span>
                <span className="font-mono text-[11px] text-dim">
                  item #{piece.id} · set #{set.id} · main depot {piece.mainDepot} · sub depot {piece.subDepot}
                </span>
              </div>

              <RangeField
                label={`${t('common.level')} (+${plus} / +${maxPlus})`}
                value={plus}
                onChange={setPlus}
                min={0}
                max={maxPlus}
                marks={Array.from({ length: Math.floor(maxPlus / 4) + 1 }, (_, i) => i * 4)}
              />

              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <div className="label">{t('forge.mode')}</div>
                  <Segmented
                    label="artifact-mode"
                    value={mode}
                    onChange={(m) => !editing && setMode(m)}
                    options={[
                      { value: 'normal', label: t('forge.modeNormal') },
                      { value: 'custom', label: t('forge.modeCustom') },
                    ]}
                  />
                </div>
                <div>
                  <div className="label">{t('forge.initialSubstats')}</div>
                  <Segmented label="initial-substats" value={start} onChange={(s) => { setStart(s); setRolls([]); }} options={starts.map((s) => ({ value: s, label: String(s) }))} />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="main-stat">
                  {t('armory.mainStat')}
                </label>
                <select id="main-stat" className="field" value={mainPropId ?? ''} onChange={(e) => setMainPropId(e.target.value ? Number(e.target.value) : null)}>
                  {mode === 'normal' && <option value="">{t('armory.randomMain')}</option>}
                  {mains.map((m) => (
                    <option key={m.id} value={m.id}>
                      {statName(m.prop, t.lang)} · #{m.id}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-dim">{t('forge.mainRule', { slot: t.dyn(`armory.slots.${slot}`) })}</p>
              </div>

              {mode === 'normal' ? (
                <p className="rounded-xl border border-line px-4 py-3 text-sm text-mist">{t('forge.normalNote', { start, up: upgrades })}</p>
              ) : (
                <RollBuilder subs={subs} rolls={rolls} setRolls={setRolls} choices={choices} start={start} upgrades={upgrades} />
              )}

              {issues.length > 0 && (
                <ul className="space-y-1">
                  {issues.map((i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-danger">
                      <AlertTriangle size={13} /> {t.dyn(`forge.issues.${i}`)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <aside className="space-y-4">
              <Preview piece={piece} set={set} plus={plus} mainProp={mainProp} totals={mode === 'custom' ? totals : null} start={start} upgrades={upgrades} />
              <div className="flex gap-2">
                <button className="btn btn-primary flex-1" disabled={!canCreate} onClick={review}>
                  <Sparkles size={15} /> {editing ? t('forge.saveEdit') : t('armory.giveArtifact')}
                </button>
                <button className="btn btn-ghost btn-icon" disabled={mode === 'custom' && issues.length > 0} title={t('characters.saveAsPreset')} aria-label={t('characters.saveAsPreset')} onClick={savePreset}>
                  <BookmarkPlus size={15} />
                </button>
                <button className="btn btn-ghost btn-icon" title={t('forge.loadPreset')} aria-label={t('forge.loadPreset')} onClick={() => setShowPresets((v) => !v)}>
                  <FolderOpen size={15} />
                </button>
              </div>
              {showPresets && (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                  {artifactPresets.length === 0 && <li className="px-2 py-1 text-xs text-dim">{t('forge.noPresets')}</li>}
                  {artifactPresets.map((p) => (
                    <li key={p.key}>
                      <button className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-mist hover:bg-white/[0.04] hover:text-ivory" onClick={() => loadPreset(p.entry)}>
                        {p.name} <span className="font-mono text-dim">#{p.entry.itemId}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {created && conn && uid && <CreatedResult result={created} data={data} uid={uid} />}
            </aside>
          </div>
        )}
      </Panel>
      <OperationDialog
        spec={spec}
        onClose={() => setSpec(null)}
        onDone={(r) => {
          if (editing) onEditDone();
          else setCreated(r as GiveArtifactResult);
        }}
      />
    </div>
  );
}

function RollBuilder({
  subs,
  rolls,
  setRolls,
  choices,
  start,
  upgrades,
}: {
  subs: { id: number; prop: string; value: number }[];
  rolls: Roll[];
  setRolls: (fn: (r: Roll[]) => Roll[]) => void;
  choices: ReturnType<typeof nextRollChoices>;
  start: number;
  upgrades: number;
}) {
  const t = useT();
  const allowed = new Set(choices.props);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="label mb-0">{t('armory.substats')}</span>
        <span className="font-mono text-xs text-mist">
          {t('armory.rolls', { n: rolls.length, max: start + upgrades })} · {t.dyn(`forge.phase.${choices.phase}`)}
        </span>
      </div>
      <ul className="space-y-1.5">
        {SUBSTAT_TYPES.map((prop) => {
          const tiers = tiersFor(prop, subs);
          const mine = rolls.filter((r) => r.prop === prop);
          const enabled = allowed.has(prop);
          return (
            <li key={prop} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${mine.length ? 'border-cyan/30 bg-cyan/[0.04]' : 'border-line'} ${enabled || mine.length ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ivory">{statName(prop, t.lang)}</div>
                <div className="font-mono text-[11px] text-dim">
                  {mine.length
                    ? `${formatStatValue(prop, mine.reduce((a, r) => a + r.value, 0))} · ${mine.length}× (T${mine.map((r) => r.tier).join('+T')})`
                    : tiers.map((x) => formatStatValue(prop, x.value)).join(' / ')}
                </div>
              </div>
              <div className="flex gap-1">
                {tiers.map((tier) => (
                  <button
                    key={tier.id}
                    disabled={!enabled}
                    title={`T${tier.tier} · ${formatStatValue(prop, tier.value)} · affix #${tier.id} (${tier.value})`}
                    aria-label={`${t('armory.addRoll')} ${statName(prop, t.lang)} T${tier.tier}`}
                    onClick={() => setRolls((r) => [...r, tier])}
                    className="grid h-7 min-w-7 place-items-center rounded-lg border border-line px-1 text-[10px] text-mist transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-25"
                  >
                    {formatStatValue(prop, tier.value)}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label mb-0">{t('forge.rollHistory')}</span>
          <div className="flex gap-1">
            <button className="btn btn-quiet btn-icon p-1.5" disabled={!rolls.length} onClick={() => setRolls((r) => r.slice(0, -1))} aria-label={t('forge.undo')} title={t('forge.undo')}>
              <Undo2 size={13} />
            </button>
            <button className="btn btn-quiet btn-icon p-1.5" disabled={!rolls.length} onClick={() => setRolls(() => [])} aria-label={t('common.clear')} title={t('common.clear')}>
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
        <ol className="space-y-0.5 font-mono text-[11px]">
          {rolls.length === 0 && <li className="text-dim">{t('forge.noRolls')}</li>}
          {rolls.map((r, i) => (
            <li key={`${i}-${r.id}`} className="flex justify-between gap-3 text-mist">
              <span className="w-14 text-dim">{rollStage(i, start) === 'initial' ? t('forge.stageInitial') : rollStage(i, start)}</span>
              <span className="flex-1 text-ivory">{statName(r.prop, t.lang)}</span>
              <span>T{r.tier}</span>
              <span className="w-16 text-right">{formatStatValue(r.prop, r.value)}</span>
              <span className="w-16 text-right text-dim">#{r.id}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Preview({
  piece,
  set,
  plus,
  mainProp,
  totals,
  start,
  upgrades,
}: {
  piece: ArtifactPiece;
  set: ArtifactSet;
  plus: number;
  mainProp: string | null;
  totals: ReturnType<typeof substatTotals> | null;
  start: number;
  upgrades: number;
}) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/[0.07] to-transparent p-4">
      <div className="flex items-center gap-3">
        <Artwork icon={piece.icon} name={piece.name.en} rarity={piece.rarity} size={72} rounded="rounded-xl" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ivory">{t.loc(piece.name)}</div>
          <div className="truncate text-[11px] text-mist">{t.loc(set.name)}</div>
          <div className="mt-1 flex items-center gap-2">
            <RarityStars rarity={piece.rarity} size={9} />
            <span className="font-mono text-xs text-gold">+{plus}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-3 text-sm">
        <div className="text-[11px] tracking-wider text-dim uppercase">{t('armory.mainStat')}</div>
        <div className="text-ivory">{mainProp ? statName(mainProp, t.lang) : t('armory.randomMain')}</div>
        <p className="mt-0.5 text-[10px] text-dim">{t('forge.mainValueNote')}</p>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {totals === null ? (
          <li className="text-xs text-mist">{t('forge.serverRolls', { start, up: upgrades })}</li>
        ) : totals.length === 0 ? (
          <li className="text-xs text-dim">{t('forge.noRolls')}</li>
        ) : (
          totals.map((x) => (
            <li key={x.prop} className="flex justify-between">
              <span className="text-mist">· {statName(x.prop, t.lang)}</span>
              <span className="font-mono text-ivory">
                +{formatStatValue(x.prop, x.total)} <span className="text-dim">({x.rolls}×)</span>
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** After creation: what the server stored, confirmed again from the inventory, and equip. */
function CreatedResult({ result, data, uid }: { result: GiveArtifactResult; data: ArtifactData; uid: number }) {
  const t = useT();
  const conn = useConnection();
  const item = result.artifacts[0];
  const [verified, setVerified] = useState<'checking' | 'ok' | 'missing'>('checking');
  const [spec, setSpec] = useState<ResultSpec | null>(null);
  const avatars = useAvatars(uid);
  const characters = useCatalog('characters');
  const [avatarId, setAvatarId] = useState<number | null>(null);
  const info = useMemo(() => indexPieces(data).get(item?.itemId ?? 0), [data, item?.itemId]);

  useEffect(() => {
    if (!conn || !item) return;
    let alive = true;
    api.playerArtifacts(conn, uid).then(
      (list) => alive && setVerified(list.some((a) => a.guid === item.guid && a.mainPropId === item.mainPropId) ? 'ok' : 'missing'),
      () => alive && setVerified('missing'),
    );
    return () => {
      alive = false;
    };
  }, [conn, uid, item]);

  if (!item || !info) return null;
  const rolls = rollsFromIds(item.appendPropIds ?? [], data.subProps[info.piece.subDepot] ?? []);
  const main = data.mainProps[info.piece.mainDepot]?.find((m) => m.id === item.mainPropId);
  return (
    <div className="space-y-3 rounded-2xl border border-ok/30 bg-ok/[0.04] p-4 text-sm">
      <div className="flex items-center gap-2 text-ok">
        {verified === 'ok' ? <CheckCircle2 size={15} /> : <PackageCheck size={15} />}
        {verified === 'ok' ? t('forge.verified') : verified === 'checking' ? t('forge.verifying') : t('forge.notFound')}
      </div>
      <div className="font-mono text-[11px] text-mist">GUID {item.guid}</div>
      <div className="text-ivory">{main ? statName(main.prop, t.lang) : `#${item.mainPropId}`}</div>
      <ul className="space-y-0.5">
        {substatTotals(rolls).map((x) => (
          <li key={x.prop} className="flex justify-between text-xs">
            <span className="text-mist">{statName(x.prop, t.lang)}</span>
            <span className="font-mono text-ivory">
              +{formatStatValue(x.prop, x.total)} ({x.rolls}×)
            </span>
          </li>
        ))}
      </ul>
      <EquipControl
        item={item}
        slot={info.slot}
        avatars={avatars.data ?? []}
        names={byId(characters.data)}
        avatarId={avatarId}
        setAvatarId={setAvatarId}
        onSpec={setSpec}
      />
      <OperationDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}

/** Equip with an explicit, confirmed replacement when the slot is taken. */
function EquipControl({
  item,
  slot,
  avatars,
  names,
  avatarId,
  setAvatarId,
  onSpec,
}: {
  item: InventoryItem;
  slot: Slot;
  avatars: OwnedAvatar[];
  names: Map<number, { name: { en: string; th?: string } }>;
  avatarId: number | null;
  setAvatarId: (id: number | null) => void;
  onSpec: (s: ResultSpec) => void;
}) {
  const t = useT();
  const target = avatars.find((a) => a.avatarId === avatarId);
  const occupant = target?.artifacts.find((a) => slotOf(a.slot) === slot && a.guid !== item.guid);
  const nameOf = (id: number) => t.loc(names.get(id)?.name) || `#${id}`;
  return (
    <div className="flex gap-2">
      <select className="field flex-1" value={avatarId ?? ''} onChange={(e) => setAvatarId(e.target.value ? Number(e.target.value) : null)} aria-label={t('forge.equipTo')}>
        <option value="">{t('forge.equipTo')}</option>
        {avatars.map((a) => (
          <option key={a.avatarId} value={a.avatarId}>
            {nameOf(a.avatarId)} · Lv{a.level}
          </option>
        ))}
      </select>
      <button
        className="btn btn-ghost"
        disabled={!avatarId}
        onClick={() => {
          if (!avatarId) return;
          const replace = !!occupant;
          onSpec({
            title: `${t('forge.equip')} — ${nameOf(avatarId)}`,
            capability: 'avatars.equip',
            action: 'artifact.equip',
            summary: `#${item.guid} → ${nameOf(avatarId)} (${slot})`,
            lines: [
              { label: 'GUID', value: item.guid },
              { label: t('armory.slot'), value: t.dyn(`armory.slots.${slot}`) },
              ...(occupant ? [{ label: t('forge.replaces'), value: <span className="text-warn">{t('forge.replacesValue', { guid: occupant.guid ?? '?', level: occupant.level - 1 })}</span> }] : []),
            ],
            request: { method: 'POST', path: `/players/{uid}/artifacts/${item.guid}/equip`, body: replace ? { avatarId, replace } : { avatarId } },
            run: (c, u) => api.equipArtifact(c, u, item.guid, avatarId, replace),
          });
        }}
      >
        <Shirt size={14} /> {t('forge.equip')}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ owned artifacts

function Owned({ data, onEdit }: { data: ArtifactData; onEdit: (item: InventoryItem, info: { set: ArtifactSet; piece: ArtifactPiece; slot: Slot }) => void }) {
  const t = useT();
  const uid = useSession((s) => s.uid);
  const mode = useSession((s) => s.mode);
  const inv = useInventory(uid, mode === 'connected');
  const avatars = useAvatars(uid);
  const characters = useCatalog('characters');
  const index = useMemo(() => indexPieces(data), [data]);
  const allPieces = useCatalog('artifact-pieces');
  const pieceRows = useMemo(() => byId(allPieces.data), [allPieces.data]);
  const [slotFilter, setSlotFilter] = useState<Slot | null>(null);
  const [spec, setSpec] = useState<ResultSpec | null>(null);
  const [equipFor, setEquipFor] = useState<string | null>(null);
  const [avatarId, setAvatarId] = useState<number | null>(null);

  if (mode !== 'connected' || !uid) return <EmptyState icon={<Shirt size={22} />} title={t('forge.connectForOwned')} />;
  if (inv.error) return <ErrorState error={inv.error} onRetry={inv.refresh} />;
  if (!inv.data) return <SkeletonGrid count={6} className="h-24" />;
  const names = byId(characters.data);
  const nameOf = (id: number) => t.loc(names.get(id)?.name) || `#${id}`;
  const relics = inv.data.filter((i) => i.type === 'ITEM_RELIQUARY' && (!slotFilter || slotOf(i.slot) === slotFilter));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {SLOTS.map((s) => (
          <button key={s} className="chip" aria-pressed={slotFilter === s} onClick={() => setSlotFilter(slotFilter === s ? null : s)}>
            {t.dyn(`armory.slots.${s}`)}
          </button>
        ))}
        <span className="ml-auto font-mono text-xs text-dim">{t('forge.ownedCount', { n: relics.length })}</span>
      </div>
      {relics.length === 0 && <EmptyState icon={<Shirt size={22} />} title={t('forge.noOwned')} />}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {relics.map((item) => {
          const row = pieceRows.get(item.itemId);
          const info = index.get(item.itemId);
          const slot = slotOf(item.slot);
          const subDepot = row?.subDepot ?? info?.piece.subDepot;
          const mainDepot = row?.mainDepot ?? info?.piece.mainDepot;
          const main = mainDepot ? data.mainProps[mainDepot]?.find((m) => m.id === item.mainPropId) : undefined;
          const rolls = subDepot ? rollsFromIds(item.appendPropIds ?? [], data.subProps[subDepot] ?? []) : [];
          const setInfo = row ? data.sets.find((s) => s.id === row.setId) : info?.set;
          return (
            <li key={item.guid} className="panel space-y-2 p-3">
              <div className="flex items-center gap-3">
                <Artwork icon={row?.icon ?? info?.piece.icon} name={row?.name.en ?? `#${item.itemId}`} rarity={row?.rarity} size={48} rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ivory">{row ? t.loc(row.name) : `#${item.itemId}`}</div>
                  <div className="truncate text-[11px] text-mist">{setInfo ? t.loc(setInfo.name) : '—'}</div>
                  <div className="font-mono text-[10px] text-dim">
                    +{item.level - 1} · GUID {item.guid}
                  </div>
                </div>
              </div>
              <div className="text-xs text-ivory">{main ? statName(main.prop, t.lang) : `main #${item.mainPropId}`}</div>
              <ul className="space-y-0.5">
                {substatTotals(rolls).map((x) => (
                  <li key={x.prop} className="flex justify-between text-[11px]">
                    <span className="text-mist">{statName(x.prop, t.lang)}</span>
                    <span className="font-mono text-ivory">+{formatStatValue(x.prop, x.total)}</span>
                  </li>
                ))}
              </ul>
              <div className="text-[11px] text-dim">{item.equippedAvatarId ? t('forge.wornBy', { name: nameOf(item.equippedAvatarId) }) : t('forge.inBag')}</div>
              <div className="flex flex-wrap gap-1.5">
                {info && slot && (
                  <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => onEdit(item, { set: info.set, piece: row ? { ...info.piece, id: row.id, subDepot: row.subDepot, mainDepot: row.mainDepot, maxLevel: row.maxLevel, initialSubs: row.initialSubs, rarity: row.rarity } : info.piece, slot })}>
                    <Pencil size={12} /> {t('forge.edit')}
                  </button>
                )}
                {item.equippedAvatarId ? (
                  <button
                    className="btn btn-ghost px-2 py-1 text-xs"
                    onClick={() =>
                      setSpec({
                        title: `${t('forge.unequip')} — ${nameOf(item.equippedAvatarId!)}`,
                        capability: 'avatars.equip',
                        action: 'avatar.unequip',
                        summary: `#${item.guid}`,
                        lines: [{ label: 'GUID', value: item.guid }, { label: t('armory.slot'), value: slot ?? '?' }],
                        request: { method: 'POST', path: `/players/{uid}/avatars/${item.equippedAvatarId}/unequip`, body: { slot } },
                        run: (c, u) => api.unequipItem(c, u, item.equippedAvatarId!, slot ?? ''),
                      })
                    }
                  >
                    {t('forge.unequip')}
                  </button>
                ) : (
                  <>
                    <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setEquipFor(equipFor === item.guid ? null : item.guid)}>
                      <Shirt size={12} /> {t('forge.equip')}
                    </button>
                    <button
                      className="btn btn-ghost border-bad/40 px-2 py-1 text-xs text-bad"
                      onClick={() =>
                        setSpec({
                          title: `${t('forge.delete')} — ${row ? t.loc(row.name) : item.itemId}`,
                          capability: 'artifacts.give',
                          action: 'item.delete',
                          summary: `#${item.guid}`,
                          lines: [
                            { label: 'GUID', value: item.guid },
                            { label: t('forge.delete'), value: <span className="text-danger">{t('forge.deleteWarning')}</span> },
                          ],
                          request: { method: 'DELETE', path: `/players/{uid}/items/${item.guid}?confirm=${item.guid}`, body: null },
                          run: (c, u) => api.deleteItem(c, u, item.guid),
                        })
                      }
                    >
                      <Trash2 size={12} /> {t('forge.delete')}
                    </button>
                  </>
                )}
              </div>
              {equipFor === item.guid && slot && (
                <EquipControl item={item} slot={slot} avatars={avatars.data ?? []} names={names} avatarId={avatarId} setAvatarId={setAvatarId} onSpec={setSpec} />
              )}
            </li>
          );
        })}
      </ul>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}

export function isSlotOccupiedError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'SLOT_OCCUPIED';
}
