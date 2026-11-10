import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Replace, Trash2, X } from 'lucide-react';
import { useT } from '@/i18n';
import { api, type InventoryItem, type ItemPatch } from '@/api/nukva';
import { useCapability } from '@/stores/session';
import { Artwork } from '@/components/fx/Artwork';
import { Modal } from '@/components/ui/Overlay';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { EmptyState, Stepper } from '@/components/ui/Primitives';
import { SLOTS, type Slot } from '@/data/types';
import { activeSets, slotOf } from '@/lib/builder';
import { formatStatValue, statName } from '@/lib/stats';
import { artifactsForSlot, mainStatName, ownerName, pieceName, slotLabel, type TabCtx } from './shared';

type Worn = TabCtx['owned']['artifacts'][number];

export function ArtifactsTab({ ctx }: { ctx: TabCtx }) {
  const t = useT();
  const { owned, inventory } = ctx;
  const equipCap = useCapability('avatars.equip');
  const [slot, setSlot] = useState<Slot>('flower');
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [spec, setSpec] = useState<OperationSpec<unknown> | null>(null);

  const bySlot = useMemo(() => {
    const map = new Map<Slot, Worn>();
    for (const a of owned.artifacts) {
      const s = slotOf(a.slot);
      if (s) map.set(s, a);
    }
    return map;
  }, [owned.artifacts]);
  const sets = useMemo(() => activeSets(owned.artifacts, ctx.pieces), [owned.artifacts, ctx.pieces]);
  const selected = bySlot.get(slot);
  const equipBlocked = !equipCap.allowed && equipCap.reason !== 'preview';

  const reviewEquip = (item: InventoryItem) => {
    const name = pieceName(ctx, t, item.itemId);
    setPicking(false);
    setSpec({
      title: t('builder.equipTitle', { name }),
      capability: 'avatars.equip',
      action: 'avatar.equip',
      summary: `${t.loc(ctx.character.name)} ← ${name}`,
      lines: [
        { label: `${t('builder.field.artifact')} · ${slotLabel(t, slot)}`, value: `${selected ? pieceName(ctx, t, selected.itemId) : t('builder.none')} → ${name}` },
      ],
      request: { method: 'POST', path: `/players/{uid}/avatars/${owned.avatarId}/equip`, body: { guid: item.guid } },
      run: (conn, uid) => api.equipItem(conn, uid, owned.avatarId, item.guid),
    });
  };

  const reviewUnequip = () => {
    if (!selected) return;
    const name = pieceName(ctx, t, selected.itemId);
    setSpec({
      title: t('builder.unequipTitle', { slot: slotLabel(t, slot) }),
      capability: 'avatars.equip',
      action: 'avatar.unequip',
      summary: `${t.loc(ctx.character.name)} ✕ ${name}`,
      lines: [{ label: `${t('builder.field.artifact')} · ${slotLabel(t, slot)}`, value: `${name} → ${t('builder.none')}` }],
      request: { method: 'POST', path: `/players/{uid}/avatars/${owned.avatarId}/unequip`, body: { slot } },
      run: (conn, uid) => api.unequipItem(conn, uid, owned.avatarId, slot),
    });
  };

  const reviewPatch = (worn: Worn, patch: ItemPatch, lines: { label: string; value: string }[]) => {
    if (!worn.guid) return;
    const guid = worn.guid;
    const name = pieceName(ctx, t, worn.itemId);
    setEditing(false);
    setSpec({
      title: t('builder.editArtifactTitle', { slot: slotLabel(t, slot) }),
      capability: 'items.edit',
      action: 'item.update',
      summary: `${name}: ${lines.map((l) => `${l.label} ${l.value}`).join(', ')}`,
      lines,
      request: { method: 'PATCH', path: `/players/{uid}/items/${guid}`, body: patch },
      run: (conn, uid) => api.patchItem(conn, uid, guid, patch),
    });
  };

  const choices = artifactsForSlot(inventory, slot);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="panel p-5">
        <div className="eyebrow mb-4">{t('builder.tabs.artifacts')}</div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('armory.slot')}>
          {SLOTS.map((s) => {
            const worn = bySlot.get(s);
            const info = worn ? ctx.pieces.get(worn.itemId) : undefined;
            const active = s === slot;
            return (
              <li key={s}>
                <button
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSlot(s)}
                  className={`flex h-full w-full flex-col items-center gap-2 rounded-2xl border border-dashed p-3 text-center transition-colors ${active ? 'border-gold/60 bg-gold/[0.06]' : 'border-line bg-abyss/40 hover:border-gold/30'}`}
                >
                  <Artwork icon={info?.piece.icon} name={worn ? pieceName(ctx, t, worn.itemId) : slotLabel(t, s)} rarity={info?.piece.rarity ?? 0} size={72} rounded="rounded-2xl" />
                  <div className="text-xs font-semibold text-mist">{slotLabel(t, s)}</div>
                  {worn ? (
                    <>
                      <div className="w-full truncate text-[11px] text-ivory">{pieceName(ctx, t, worn.itemId)}</div>
                      <div className="font-mono text-[11px] text-gold">+{worn.level - 1}</div>
                    </>
                  ) : (
                    <div className="text-[11px] text-dim">+ {t('builder.slotEmpty')}</div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 rounded-2xl border border-line bg-abyss/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-ivory">{slotLabel(t, slot)}</div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={equipBlocked} onClick={() => setPicking(true)}>
                <Replace size={15} /> {t('builder.change')}
              </button>
              <button className="btn btn-ghost" disabled={!selected?.guid} onClick={() => setEditing(true)}>
                <Pencil size={15} /> {t('builder.edit')}
              </button>
              <button className="btn btn-ghost border-bad/40 text-bad" disabled={!selected || equipBlocked} onClick={reviewUnequip}>
                <Trash2 size={15} /> {t('builder.unequip')}
              </button>
            </div>
          </div>
          {selected ? (
            <div className="space-y-1 text-sm">
              <div className="text-mist">
                {t('builder.mainStat')}: <span className="text-ivory">{mainStatName(ctx, t, selected.itemId, selected.mainPropId)}</span>
              </div>
              <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {selected.appendPropIds.map((id, i) => {
                  const sub = lookupSub(ctx, selected.itemId, id);
                  return (
                    <li key={`${id}-${i}`} className="flex justify-between gap-3 text-xs text-mist">
                      <span>{sub ? statName(sub.prop, t.lang) : `#${id}`}</span>
                      <span className="font-mono text-ivory">{sub ? formatStatValue(sub.prop, sub.value) : ''}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-dim">{t('builder.slotEmpty')}</p>
          )}
        </div>
      </section>

      <section className="panel p-5">
        <div className="eyebrow mb-4">{t('builder.setEffects')}</div>
        {sets.length === 0 ? (
          <p className="text-sm text-dim">{t('builder.noSetEffects')}</p>
        ) : (
          <ul className="space-y-5">
            {sets.map((s) => (
              <li key={s.set.id}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-semibold text-gold">{t.loc(s.set.name)}</span>
                  <span className="rounded-md border border-cyan/30 bg-cyan/10 px-1.5 py-0.5 font-mono text-[11px] text-cyan">{t('builder.pieces', { n: s.count })}</span>
                </div>
                <ul className="space-y-2 border-l border-gold/20 pl-3">
                  {s.bonuses.map((b) => (
                    <li key={b.pieces} className={b.active ? 'text-xs text-ivory' : 'text-xs text-dim opacity-60'}>
                      <span className="mr-1 font-semibold text-cyan">{t('builder.pieces', { n: b.pieces })}:</span>
                      {t.loc(b.text)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={picking} onClose={() => setPicking(false)} eyebrow={slotLabel(t, slot)} title={t('builder.pickArtifactTitle', { slot: slotLabel(t, slot) })} width="max-w-2xl">
        {choices.length === 0 ? (
          <EmptyState title={t('builder.noArtifactsOwned')} />
        ) : (
          <ul className="space-y-2">
            {choices.map((item) => {
              const info = ctx.pieces.get(item.itemId);
              const name = pieceName(ctx, t, item.itemId);
              const here = item.equippedAvatarId === owned.avatarId;
              const elsewhere = !!item.equippedAvatarId && !here;
              return (
                <li key={item.guid} className="flex items-center gap-3 rounded-xl border border-line bg-abyss/40 p-2.5">
                  <Artwork icon={info?.piece.icon} name={name} rarity={info?.piece.rarity ?? 0} size={48} rounded="rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ivory">{name}</div>
                    <div className="truncate font-mono text-[11px] text-dim">
                      {info ? `${t.loc(info.set.name)} · ` : ''}+{item.level - 1} · {mainStatName(ctx, t, item.itemId, item.mainPropId ?? 0)}
                      {item.equippedAvatarId ? ` · ${t('builder.equippedOn', { name: here ? t.loc(ctx.character.name) : ownerName(ctx, t, item.equippedAvatarId) })}` : ''}
                    </div>
                    {elsewhere && <div className="text-[11px] text-warn">{t('builder.equippedElsewhere')}</div>}
                  </div>
                  <button className="btn btn-ghost" disabled={here || elsewhere} onClick={() => reviewEquip(item)}>
                    {t('builder.equip')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      {editing && selected && <ArtifactEditor ctx={ctx} worn={selected} slot={slot} onClose={() => setEditing(false)} onReview={(patch, lines) => reviewPatch(selected, patch, lines)} />}
      <OperationDialog spec={spec} onClose={() => setSpec(null)} onDone={() => ctx.onChanged()} />
    </div>
  );
}

function lookupSub(ctx: Pick<TabCtx, 'artifacts' | 'pieces'>, itemId: number, id: number) {
  const info = ctx.pieces.get(itemId);
  return info ? ctx.artifacts?.subProps[info.piece.subDepot]?.find((s) => s.id === id) : undefined;
}

function ArtifactEditor({
  ctx,
  worn,
  slot,
  onClose,
  onReview,
}: {
  ctx: TabCtx;
  worn: Worn;
  slot: Slot;
  onClose: () => void;
  onReview: (patch: ItemPatch, lines: { label: string; value: string }[]) => void;
}) {
  const t = useT();
  const info = ctx.pieces.get(worn.itemId);
  const mains = info ? ctx.artifacts?.mainProps[info.piece.mainDepot] ?? [] : [];
  const subs = info ? ctx.artifacts?.subProps[info.piece.subDepot] ?? [] : [];
  const [level, setLevel] = useState(worn.level);
  const [main, setMain] = useState(worn.mainPropId);
  const [rolls, setRolls] = useState<number[]>(worn.appendPropIds);

  useEffect(() => {
    setLevel(worn.level);
    setMain(worn.mainPropId);
    setRolls(worn.appendPropIds);
  }, [worn.guid, worn.level, worn.mainPropId, worn.appendPropIds]);

  const propOf = (id: number) => subs.find((s) => s.id === id)?.prop;
  const mainProp = mains.find((m) => m.id === main)?.prop;
  const maxRolls = info ? info.piece.initialSubs + Math.floor((level - 1) / 4) : 0;
  const distinct = new Set(rolls.map(propOf));
  const problems: string[] = [];
  if (distinct.size > 4) problems.push(t('armory.validation.maxStats'));
  if (mainProp && distinct.has(mainProp)) problems.push(t('armory.validation.sameAsMain'));
  if (rolls.length > maxRolls) problems.push(t('armory.validation.tooManyRolls'));

  const patch: ItemPatch = {};
  const lines: { label: string; value: string }[] = [];
  if (level !== worn.level) {
    patch.level = level;
    lines.push({ label: t('common.level'), value: `+${worn.level - 1} → +${level - 1}` });
  }
  if (main !== worn.mainPropId) {
    patch.mainPropId = main;
    lines.push({ label: t('builder.mainStat'), value: `${mainStatName(ctx, t, worn.itemId, worn.mainPropId)} → ${mainProp ? statName(mainProp, t.lang) : `#${main}`}` });
  }
  if (rolls.length !== worn.appendPropIds.length || rolls.some((r, i) => r !== worn.appendPropIds[i])) {
    patch.appendPropIds = rolls;
    lines.push({ label: t('builder.substats'), value: `${worn.appendPropIds.length} → ${rolls.length}` });
  }
  const valid = problems.length === 0 && Object.keys(patch).length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={slotLabel(t, slot)}
      title={t('builder.editArtifactTitle', { slot: slotLabel(t, slot) })}
      width="max-w-xl"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onReview(patch, lines)}>
            {t('builder.review')}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="label">{t('common.level')} (+{level - 1})</div>
          <div className="max-w-[180px]">
            <Stepper value={level} onChange={setLevel} min={1} max={info?.piece.maxLevel ?? 21} label={t('common.level')} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="builder-main">
            {t('builder.mainStat')}
          </label>
          <select id="builder-main" className="field" value={main} onChange={(e) => setMain(Number(e.target.value))}>
            {mains.map((m) => (
              <option key={m.id} value={m.id}>
                {statName(m.prop, t.lang)} · #{m.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">{t('builder.substats')}</span>
            <span className="font-mono text-[11px] text-dim">{t('builder.rolls', { n: rolls.length, max: maxRolls, d: distinct.size })}</span>
          </div>
          <ul className="space-y-2">
            {rolls.map((id, i) => (
              <li key={i} className="flex items-center gap-2">
                <select className="field" aria-label={`${t('builder.substats')} ${i + 1}`} value={id} onChange={(e) => setRolls((r) => r.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
                  {subs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {statName(s.prop, t.lang)} {formatStatValue(s.prop, s.value)}
                    </option>
                  ))}
                </select>
                <button className="btn btn-quiet btn-icon" aria-label={t('common.remove')} onClick={() => setRolls((r) => r.filter((_, j) => j !== i))}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
          <button className="btn btn-ghost mt-2" disabled={rolls.length >= maxRolls || subs.length === 0} onClick={() => setRolls((r) => [...r, subs[0].id])}>
            <Plus size={15} /> {t('builder.addRoll')}
          </button>
        </div>
        {problems.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-xs text-warn">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
