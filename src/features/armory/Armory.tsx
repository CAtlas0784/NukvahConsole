import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, BookmarkPlus, Hammer, Minus, Search, Sparkles, X } from 'lucide-react';
import { useT } from '@/i18n';
import { byId, useCatalog } from '@/data/catalog';
import { api, type GiveItemsResult } from '@/api/nukva';
import { useSession } from '@/stores/session';
import { usePresets } from '@/stores/presets';
import { useToasts } from '@/stores/ops';
import { Artwork } from '@/components/fx/Artwork';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { EmptyState, ErrorState, IdTag, PageHeader, Panel, RangeField, RarityStars, Segmented, SkeletonGrid, Stepper } from '@/components/ui/Primitives';
import { SLOTS, type ArtifactPiece, type ArtifactSet, type Slot, type Weapon, type WeaponType } from '@/data/types';
import { formatStatValue, statName } from '@/lib/stats';
import { normalize } from '@/lib/search';
import { ease } from '@/lib/motion';

export default function Armory() {
  const t = useT();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'weapon' | 'artifact'>(params.get('set') ? 'artifact' : 'weapon');
  return (
    <>
      <PageHeader
        eyebrow={t('armory.eyebrow')}
        title={t('armory.title')}
        actions={<Segmented label="armory-tab" value={tab} onChange={setTab} options={[{ value: 'weapon', label: t('armory.weaponTab') }, { value: 'artifact', label: t('armory.artifactTab') }]} />}
      />
      {tab === 'weapon' ? <WeaponForge initial={Number(params.get('weapon')) || null} /> : <ArtifactForge initial={Number(params.get('set')) || null} />}
    </>
  );
}

// ------------------------------------------------------------------ weapons

const WEAPON_TYPES: WeaponType[] = ['sword', 'claymore', 'polearm', 'bow', 'catalyst'];

function WeaponForge({ initial }: { initial: number | null }) {
  const t = useT();
  const weapons = useCatalog('weapons');
  const status = useSession((s) => s.status);
  const addPreset = usePresets((s) => s.add);
  const toast = useToasts((s) => s.show);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<WeaponType | null>(null);
  const [rarity, setRarity] = useState<number | null>(null);
  const [selected, setSelected] = useState<Weapon | null>(null);
  const [level, setLevel] = useState(90);
  const [refinement, setRefinement] = useState(1);
  const [amount, setAmount] = useState(1);
  const [spec, setSpec] = useState<OperationSpec<GiveItemsResult> | null>(null);

  useEffect(() => {
    if (initial && weapons.data) setSelected(byId(weapons.data).get(initial) ?? null);
  }, [initial, weapons.data]);

  const list = useMemo(() => {
    const q = normalize(query);
    return (weapons.data ?? []).filter((w) => (!type || w.type === type) && (!rarity || w.rarity === rarity) && (!q || String(w.id).startsWith(q) || normalize(`${w.name.en} ${w.name.th ?? ''}`).includes(q)));
  }, [weapons.data, query, type, rarity]);

  if (weapons.error) return <ErrorState error={weapons.error} onRetry={weapons.retry} />;
  const maxAmount = status?.limits.maxUnstackableAmount ?? 50;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
      <div className="min-w-0">
        <div className="panel mb-4 space-y-3 p-4">
          <div className="relative">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
            <input className="field pl-9" placeholder={t('armory.pickWeapon')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('armory.pickWeapon')} />
          </div>
          <div className="flex flex-wrap gap-2">
            {WEAPON_TYPES.map((w) => (
              <button key={w} className="chip" aria-pressed={type === w} onClick={() => setType(type === w ? null : w)}>
                {t.dyn(`weapons.${w}`)}
              </button>
            ))}
            <span className="mx-1 h-4 w-px self-center bg-line" />
            {[5, 4, 3].map((r) => (
              <button key={r} className="chip" aria-pressed={rarity === r} onClick={() => setRarity(rarity === r ? null : r)}>
                {t('common.stars', { n: r })}
              </button>
            ))}
          </div>
        </div>
        {!weapons.data ? (
          <SkeletonGrid count={12} className="h-16" />
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
            {list.map((w) => (
              <li key={w.id}>
                <button onClick={() => setSelected(w)} className={`panel panel-interactive flex w-full items-center gap-3 p-3 text-left ${selected?.id === w.id ? 'ring-1 ring-gold/60' : ''}`}>
                  <Artwork icon={w.icon} name={w.name.en} rarity={w.rarity} size={44} rounded="rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ivory">{t.loc(w.name)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <RarityStars rarity={w.rarity} size={8} />
                      <span className="text-[11px] text-dim">{t.dyn(`weapons.${w.type}`)}</span>
                    </div>
                  </div>
                  <IdTag id={w.id} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Panel corners className="p-6">
          {!selected ? (
            <EmptyState icon={<Hammer size={22} />} title={t('armory.pickWeapon')} />
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <Artwork icon={selected.icon} name={selected.name.en} rarity={selected.rarity} size={72} rounded="rounded-2xl" />
                <div className="min-w-0">
                  <div className="title-display text-lg leading-snug">{t.loc(selected.name)}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <RarityStars rarity={selected.rarity} />
                    <IdTag id={selected.id} />
                  </div>
                </div>
              </div>
              <RangeField label={t('common.level')} value={level} onChange={setLevel} min={1} max={90} marks={[1, 20, 40, 50, 60, 70, 80, 90]} />
              <div>
                <div className="label">{t('armory.refinement')}</div>
                <Segmented label="refinement" value={refinement} onChange={setRefinement} options={[1, 2, 3, 4, 5].map((r) => ({ value: r, label: `R${r}` }))} />
              </div>
              <div className="max-w-[160px]">
                <div className="label">{t('common.amount')}</div>
                <Stepper value={amount} onChange={setAmount} min={1} max={maxAmount} label={t('common.amount')} />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-primary flex-1"
                  onClick={() => {
                    const entry = { itemId: selected.id, amount, level, refinement };
                    const name = t.loc(selected.name);
                    setSpec({
                      title: `${t('armory.giveWeapon')} — ${name}`,
                      capability: 'weapons.give',
                      action: 'items.give',
                      summary: `${name} Lv${level} R${refinement} ×${amount}`,
                      lines: [
                        { label: t('armory.weaponTab'), value: `${name} (#${selected.id})` },
                        { label: t('common.level'), value: String(level) },
                        { label: t('armory.refinement'), value: `R${refinement}` },
                        { label: t('common.amount'), value: String(amount) },
                      ],
                      request: { method: 'POST', path: '/players/{uid}/items', body: { items: [entry] } },
                      run: (conn, uid) => api.giveItems(conn, uid, [entry]),
                      judge: (r) => (r.success ? { status: 'success' } : r.results[0]?.added ? { status: 'partial', detail: `${r.results[0].added}/${amount}` } : { status: 'failed', detail: 'server added nothing' }),
                    });
                  }}
                >
                  <Hammer size={15} /> {t('armory.giveWeapon')}
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  title={t('characters.saveAsPreset')}
                  aria-label={t('characters.saveAsPreset')}
                  onClick={() => {
                    addPreset({ kind: 'equipment', name: `${t.loc(selected.name)} R${refinement}`, payload: { weapon: { itemId: selected.id, level, refinement }, artifacts: [] } });
                    toast({ tone: 'info', title: t('characters.saveAsPreset'), body: t.loc(selected.name) });
                  }}
                >
                  <BookmarkPlus size={15} />
                </button>
              </div>
            </div>
          )}
        </Panel>
      </aside>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ artifacts

interface Roll {
  key: string;
  id: number;
  prop: string;
  value: number;
}

function ArtifactForge({ initial }: { initial: number | null }) {
  const t = useT();
  const artifacts = useCatalog('artifacts');
  const addPreset = usePresets((s) => s.add);
  const toast = useToasts((s) => s.show);
  const [query, setQuery] = useState('');
  const [set, setSet] = useState<ArtifactSet | null>(null);
  const [slot, setSlot] = useState<Slot>('flower');
  const [rarity, setRarity] = useState(5);
  const [plus, setPlus] = useState(20);
  const [mainPropId, setMainPropId] = useState<number | null>(null);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [spec, setSpec] = useState<OperationSpec<{ added: number; requested: number; success: boolean; itemId: number; rolls: number; expectedRolls: number }> | null>(null);

  useEffect(() => {
    if (initial && artifacts.data) setSet(artifacts.data.sets.find((s) => s.id === initial) ?? null);
  }, [initial, artifacts.data]);

  const pieces = set?.pieces[slot] ?? [];
  const piece: ArtifactPiece | undefined = pieces.find((p) => p.rarity === rarity) ?? pieces[0];
  useEffect(() => {
    if (piece && piece.rarity !== rarity) setRarity(piece.rarity);
  }, [piece, rarity]);

  const maxPlus = piece ? piece.maxLevel - 1 : 20;
  useEffect(() => setPlus((p) => Math.min(p, maxPlus)), [maxPlus]);
  const mains = piece && artifacts.data ? artifacts.data.mainProps[piece.mainDepot] ?? [] : [];
  const subs = piece && artifacts.data ? artifacts.data.subProps[piece.subDepot] ?? [] : [];
  useEffect(() => {
    setMainPropId(mains[0]?.id ?? null);
    setRolls([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece?.id]);

  const mainProp = mains.find((m) => m.id === mainPropId)?.prop ?? null;
  const subProps = [...new Set(subs.map((s) => s.prop))];
  const maxRolls = piece ? piece.initialSubs + Math.floor(plus / 4) : 0;
  const distinct = new Set(rolls.map((r) => r.prop));
  const problems: string[] = [];
  if (distinct.size > 4) problems.push(t('armory.validation.maxStats'));
  if (mainProp && distinct.has(mainProp)) problems.push(t('armory.validation.sameAsMain'));
  if (rolls.length > maxRolls) problems.push(t('armory.validation.tooManyRolls'));

  const addRoll = (prop: string, tier: number) => {
    const options = subs.filter((s) => s.prop === prop).sort((a, b) => a.value - b.value);
    const pick = options[Math.min(tier, options.length - 1)];
    if (pick) setRolls((r) => [...r, { key: crypto.randomUUID(), id: pick.id, prop, value: pick.value }]);
  };

  const filteredSets = useMemo(() => {
    const q = normalize(query);
    return (artifacts.data?.sets ?? []).filter((s) => !q || String(s.id).startsWith(q) || normalize(`${s.name.en} ${s.name.th ?? ''}`).includes(q));
  }, [artifacts.data, query]);

  if (artifacts.error) return <ErrorState error={artifacts.error} onRetry={artifacts.retry} />;
  if (!artifacts.data) return <SkeletonGrid count={12} className="h-20" />;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
      <div className="min-w-0">
        <div className="relative mb-3">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
          <input className="field pl-9" placeholder={t('armory.pickSet')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('armory.pickSet')} />
        </div>
        <ul className="scroll-fade max-h-[38vh] space-y-1.5 overflow-y-auto py-2 pr-1 xl:max-h-[70vh]">
          {filteredSets.map((s) => (
            <li key={s.id}>
              <button onClick={() => { setSet(s); if (window.innerWidth < 1280) requestAnimationFrame(() => document.getElementById('artifact-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${set?.id === s.id ? 'border-gold/50 bg-gold/[0.08]' : 'border-transparent hover:bg-white/[0.03]'}`}>
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

      <Panel corners className="scroll-mt-24 p-6">
        <div id="artifact-builder" />
        {!set ? (
          <EmptyState icon={<Sparkles size={22} />} title={t('armory.pickSet')} />
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <div>
                <div className="title-display text-gilded text-2xl">{t.loc(set.name)}</div>
                <div className="mt-3 space-y-2">
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
                    const p = set.pieces[s]?.[0];
                    return (
                      <button key={s} disabled={!p} onClick={() => setSlot(s)} className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] transition-colors disabled:opacity-30 ${slot === s ? 'border-gold/60 bg-gold/10 text-ivory' : 'border-line text-mist hover:border-gold/30'}`}>
                        <Artwork icon={p?.icon} name={p?.name.en ?? s} rarity={p?.rarity} size={36} rounded="rounded-lg" />
                        {t.dyn(`armory.slots.${s}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              {piece && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <Segmented label="artifact-rarity" value={rarity} onChange={setRarity} options={[...new Set(pieces.map((p) => p.rarity))].map((r) => ({ value: r, label: `${r}★` }))} />
                    <IdTag id={piece.id} />
                    <span className="text-sm text-ivory">{t.loc(piece.name)}</span>
                  </div>
                  <RangeField label={`${t('common.level')} (+${plus})`} value={plus} onChange={setPlus} min={0} max={maxPlus} marks={Array.from({ length: Math.floor(maxPlus / 4) + 1 }, (_, i) => i * 4)} />
                  <div>
                    <label className="label" htmlFor="main-stat">
                      {t('armory.mainStat')}
                    </label>
                    <select id="main-stat" className="field" value={mainPropId ?? ''} onChange={(e) => setMainPropId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">{t('armory.randomMain')}</option>
                      {mains.map((m) => (
                        <option key={m.id} value={m.id}>
                          {statName(m.prop, t.lang)} · #{m.id}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {piece && (
              <div className="space-y-5">
                <div className="flex items-baseline justify-between">
                  <span className="label mb-0">{t('armory.substats')}</span>
                  <span className="font-mono text-xs text-mist">
                    {t('armory.rolls', { n: rolls.length, max: maxRolls })} · {t('armory.distinct', { n: distinct.size })}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {subProps.map((prop) => {
                    const mine = rolls.filter((r) => r.prop === prop);
                    const total = mine.reduce((a, r) => a + r.value, 0);
                    const tiers = subs.filter((s) => s.prop === prop).sort((a, b) => a.value - b.value);
                    const blocked = prop === mainProp || (!distinct.has(prop) && distinct.size >= 4) || rolls.length >= maxRolls;
                    return (
                      <li key={prop} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${mine.length ? 'border-cyan/30 bg-cyan/[0.04]' : 'border-line'}`}>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-ivory">{statName(prop, t.lang)}</div>
                          <div className="font-mono text-[11px] text-dim">{mine.length ? `${formatStatValue(prop, total)} · ${mine.length}×` : tiers.map((x) => formatStatValue(prop, x.value)).join(' / ')}</div>
                        </div>
                        {mine.length > 0 && (
                          <button className="btn btn-quiet btn-icon p-1.5" aria-label={`${t('common.remove')} ${statName(prop, t.lang)}`} onClick={() => setRolls((r) => { const i = r.map((x) => x.prop).lastIndexOf(prop); return r.filter((_, j) => j !== i); })}>
                            <Minus size={13} />
                          </button>
                        )}
                        <div className="flex gap-1">
                          {tiers.map((tier, i) => (
                            <button key={tier.id} disabled={blocked} title={`${formatStatValue(prop, tier.value)} · #${tier.id}`} aria-label={`${t('armory.addRoll')} ${statName(prop, t.lang)} ${formatStatValue(prop, tier.value)}`} onClick={() => addRoll(prop, i)} className="grid h-7 w-7 place-items-center rounded-lg border border-line text-[10px] text-mist transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-25">
                              {i + 1}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <AnimatePresence>
                  {problems.map((p) => (
                    <motion.div key={p} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ ease }} className="flex items-center gap-2 text-xs text-danger">
                      <AlertTriangle size={13} /> {p}
                    </motion.div>
                  ))}
                </AnimatePresence>
                <p className="text-xs text-dim">{t('armory.fillNote')}</p>
                <div className="flex gap-2">
                  {rolls.length > 0 && (
                    <button className="btn btn-quiet btn-icon" onClick={() => setRolls([])} aria-label={t('common.clear')}>
                      <X size={15} />
                    </button>
                  )}
                  <button
                    className="btn btn-primary flex-1"
                    disabled={problems.length > 0}
                    onClick={() => {
                      const body = { itemId: piece.id, level: plus + 1, ...(mainPropId ? { mainPropId } : {}), appendPropIds: rolls.map((r) => r.id), amount: 1 };
                      const name = t.loc(piece.name);
                      setSpec({
                        title: `${t('armory.giveArtifact')} — ${name}`,
                        capability: 'artifacts.give',
                        action: 'artifact.give',
                        summary: `${name} +${plus}`,
                        lines: [
                          { label: t('armory.slot'), value: `${name} (#${piece.id})` },
                          { label: t('common.level'), value: `+${plus}` },
                          { label: t('armory.mainStat'), value: mainProp ? statName(mainProp, t.lang) : t('armory.randomMain') },
                          { label: t('armory.substats'), value: rolls.length ? [...distinct].map((p) => `${statName(p, t.lang)} ×${rolls.filter((r) => r.prop === p).length}`).join(', ') : '—' },
                        ],
                        request: { method: 'POST', path: '/players/{uid}/artifacts', body },
                        run: (conn, uid) => api.giveArtifact(conn, uid, body),
                        judge: (r) =>
                          !r.success
                            ? { status: 'failed', detail: 'server added nothing' }
                            : r.rolls < r.expectedRolls
                              ? { status: 'partial', detail: `${r.rolls}/${r.expectedRolls} substat rolls — the server could not roll the rest` }
                              : { status: 'success', detail: `${r.rolls} substat rolls` },
                      });
                    }}
                  >
                    <Sparkles size={15} /> {t('armory.giveArtifact')}
                  </button>
                  <button
                    className="btn btn-ghost btn-icon"
                    disabled={problems.length > 0}
                    title={t('characters.saveAsPreset')}
                    aria-label={t('characters.saveAsPreset')}
                    onClick={() => {
                      addPreset({ kind: 'equipment', name: `${t.loc(piece.name)} +${plus}`, payload: { weapon: null, artifacts: [{ itemId: piece.id, level: plus + 1, mainPropId, appendPropIds: rolls.map((r) => r.id) }] } });
                      toast({ tone: 'info', title: t('characters.saveAsPreset'), body: t.loc(piece.name) });
                    }}
                  >
                    <BookmarkPlus size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
