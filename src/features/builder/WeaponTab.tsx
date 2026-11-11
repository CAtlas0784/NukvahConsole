import { useEffect, useState } from 'react';
import { Hammer, Replace, Wand2 } from 'lucide-react';
import { Link } from 'react-router';
import { useT } from '@/i18n';
import { api, type ItemPatch } from '@/api/nukva';
import { useCapability } from '@/stores/session';
import { Artwork } from '@/components/fx/Artwork';
import { Modal } from '@/components/ui/Overlay';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { DenialNotice, EmptyState, RangeField, RarityStars, Segmented } from '@/components/ui/Primitives';
import { ownerName, weaponName, type TabCtx } from './shared';
import { fitAscension, levelLabel, levelMarks, maxLevelOf, validAscensions, WEAPON_CAPS_90 } from '@/lib/progression';

export function WeaponTab({ ctx }: { ctx: TabCtx }) {
  const t = useT();
  const { character, owned, inventory, weapons } = ctx;
  const current = owned.weapon;
  const info = current ? weapons.find((w) => w.id === current.itemId) : undefined;
  const editCap = useCapability('items.edit');
  const equipCap = useCapability('avatars.equip');
  const caps = info?.ascensionCaps?.length ? info.ascensionCaps : WEAPON_CAPS_90;
  const maxRef = info?.maxRefinement ?? 5;
  const [level, setLevel] = useState(current?.level ?? 1);
  const [asc, setAsc] = useState(current?.promoteLevel ?? 0);
  const [refinement, setRefinement] = useState(current?.refinement ?? 1);
  const [picking, setPicking] = useState(false);
  const [spec, setSpec] = useState<OperationSpec<unknown> | null>(null);

  useEffect(() => {
    setLevel(current?.level ?? 1);
    setAsc(current?.promoteLevel ?? 0);
    setRefinement(current?.refinement ?? 1);
  }, [current?.guid, current?.level, current?.promoteLevel, current?.refinement, owned.avatarId]);

  const patch: ItemPatch = {};
  if (current && level !== current.level) patch.level = level;
  if (current && (asc !== current.promoteLevel || level !== current.level)) patch.promoteLevel = asc;
  if (current && refinement !== current.refinement) patch.refinement = refinement;
  const dirty = !!current && (level !== current.level || asc !== current.promoteLevel || refinement !== current.refinement);

  const reviewPatch = () => {
    if (!current?.guid) return;
    const guid = current.guid;
    const name = weaponName(ctx, t, current.itemId);
    const lines = [
      { label: t('builder.currentWeapon'), value: name },
      ...(patch.level || asc !== current.promoteLevel
        ? [{ label: t('builder.weaponLevel'), value: `${levelLabel(caps, current.level, current.promoteLevel)} → ${levelLabel(caps, level, asc)}` }]
        : []),
      ...(patch.refinement ? [{ label: t('builder.refinement'), value: `R${current.refinement} → R${refinement}` }] : []),
    ];
    setSpec({
      title: t('builder.editItemTitle', { name }),
      capability: 'items.edit',
      action: 'item.update',
      summary: `${name}: ${Object.entries(patch).map(([k, v]) => `${k} ${v}`).join(', ')}`,
      lines,
      request: { method: 'PATCH', path: `/players/{uid}/items/${guid}`, body: patch },
      run: (conn, uid) => api.patchItem(conn, uid, guid, patch),
    });
  };

  const reviewEquip = (guid: string, itemId: number) => {
    const name = weaponName(ctx, t, itemId);
    const previous = current?.guid;
    setPicking(false);
    setSpec({
      title: t('builder.equipTitle', { name }),
      capability: 'avatars.equip',
      action: 'avatar.equip',
      summary: `${t.loc(character.name)} ← ${name}`,
      lines: [
        { label: t('builder.currentWeapon'), value: `${current ? weaponName(ctx, t, current.itemId) : t('builder.none')} → ${name}` },
        ...(current ? [{ label: '', value: <span className="text-xs text-dim">{t('builder.weaponBackToBag')}</span> }] : []),
      ],
      request: { method: 'POST', path: `/players/{uid}/avatars/${owned.avatarId}/equip`, body: { guid } },
      run: (conn, uid) => api.equipItem(conn, uid, owned.avatarId, guid),
      judge: () => {
        if (previous) setUndoGuid(previous);
        return { status: 'success' };
      },
    });
  };

  // One-step undo of a weapon swap: equip the previous weapon again (it is still in the bag).
  const [undoGuid, setUndoGuid] = useState<string | null>(null);

  const choices = inventory
    .filter((i) => i.type === 'ITEM_WEAPON' && weapons.find((w) => w.id === i.itemId)?.type === character.weapon)
    .sort((a, b) => b.level - a.level);

  return (
    <div className="max-w-2xl">
      <section className="panel space-y-5 p-5">
        <div className="eyebrow">{t('builder.currentWeapon')}</div>
        {current ? (
          <div className="flex items-center gap-4">
            <Artwork icon={info?.icon} name={weaponName(ctx, t, current.itemId)} rarity={info?.rarity} size={96} rounded="rounded-2xl" />
            <div className="min-w-0 space-y-1.5">
              <div className="truncate font-display text-lg text-ivory">{weaponName(ctx, t, current.itemId)}</div>
              {info && <RarityStars rarity={info.rarity} size={12} />}
              <div className="font-mono text-xs text-dim">
                Lv{current.level} · R{current.refinement} · #{current.itemId}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-mist">{t('builder.noWeapon')}</p>
        )}

        {current && (
          <>
            <RangeField
              label={t('builder.weaponLevel')}
              value={level}
              onChange={(v) => {
                setLevel(v);
                setAsc((a) => fitAscension(caps, v, a));
              }}
              min={1}
              max={maxLevelOf(caps)}
              marks={levelMarks(caps)}
            />
            {validAscensions(caps, level).length > 1 ? (
              <Segmented label={t('builder.ascensionLabel')} value={asc} onChange={setAsc} options={validAscensions(caps, level).map((p) => ({ value: p, label: levelLabel(caps, level, p) }))} />
            ) : (
              <span className="inline-block rounded-md border border-line px-2 py-1 font-mono text-xs text-mist">{levelLabel(caps, level, asc)}</span>
            )}
            <div>
              <div className="label">{t('builder.refinement')}</div>
              {maxRef > 1 ? (
                <Segmented label={t('builder.refinement')} value={refinement} onChange={setRefinement} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `R${n}` }))} />
              ) : (
                <p className="text-xs text-dim">{t('armory.noRefinement')}</p>
              )}
            </div>
            {!editCap.allowed && editCap.reason !== 'preview' && <DenialNotice reason={editCap.reason} role={editCap.role} compact />}
            <button className="btn btn-primary w-full" disabled={!dirty || !current.guid} onClick={reviewPatch}>
              <Wand2 size={15} /> {t('builder.saveWeapon')}
            </button>
          </>
        )}
        <button className="btn btn-ghost w-full" onClick={() => setPicking(true)}>
          <Replace size={15} /> {t('builder.change')}
        </button>
        <Link className="btn btn-quiet w-full" to={`/armory?type=${character.weapon}&equip=${owned.avatarId}`}>
          <Hammer size={15} /> {t('builder.forgeForCharacter')}
        </Link>
        {undoGuid && undoGuid !== current?.guid && (
          <button
            className="btn btn-quiet w-full"
            onClick={() => {
              const guid = undoGuid;
              setUndoGuid(null);
              const item = inventory.find((i) => i.guid === guid);
              reviewEquip(guid, item?.itemId ?? 0);
            }}
          >
            {t('builder.undoWeapon')}
          </button>
        )}
        <p className="text-xs text-dim">{t('builder.weaponKeep')}</p>
      </section>

      <Modal open={picking} onClose={() => setPicking(false)} eyebrow={t.dyn(`weapons.${character.weapon}`)} title={t('builder.pickWeaponTitle')} width="max-w-2xl">
        <WeaponList ctx={ctx} choices={choices} onEquip={reviewEquip} equipDisabled={!equipCap.allowed && equipCap.reason !== 'preview'} />
      </Modal>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} onDone={() => ctx.onChanged()} />
    </div>
  );
}

function WeaponList({
  ctx,
  choices,
  onEquip,
  equipDisabled,
}: {
  ctx: TabCtx;
  choices: TabCtx['inventory'];
  onEquip: (guid: string, itemId: number) => void;
  equipDisabled: boolean;
}) {
  const t = useT();
  if (choices.length === 0) return <EmptyState title={t('builder.noWeaponsOwned')} />;
  return (
    <ul className="space-y-2">
      {choices.map((item) => {
        const info = ctx.weapons.find((w) => w.id === item.itemId);
        const here = item.equippedAvatarId === ctx.owned.avatarId;
        const elsewhere = !!item.equippedAvatarId && !here;
        const name = weaponName(ctx, t, item.itemId);
        return (
          <li key={item.guid} className="flex items-center gap-3 rounded-xl border border-line bg-abyss/40 p-2.5">
            <Artwork icon={info?.icon} name={name} rarity={info?.rarity} size={48} rounded="rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ivory">{name}</div>
              <div className="font-mono text-[11px] text-dim">
                Lv{item.level} · R{item.refinement ?? 1}
                {item.equippedAvatarId ? ` · ${t('builder.equippedOn', { name: here ? t.loc(ctx.character.name) : ownerName(ctx, t, item.equippedAvatarId) })}` : ''}
              </div>
              {elsewhere && <div className="text-[11px] text-warn">{t('builder.equippedElsewhere')}</div>}
            </div>
            <button className="btn btn-ghost" disabled={here || elsewhere || equipDisabled} onClick={() => onEquip(item.guid, item.itemId)}>
              {t('builder.equip')}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
