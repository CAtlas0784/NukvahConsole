import { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, CheckCircle2, FolderOpen, Hammer, Search, Shirt } from 'lucide-react';
import { useT } from '@/i18n';
import { byId, useCatalog } from '@/data/catalog';
import { api, type GiveItemsResult, type OwnedAvatar } from '@/api/nukva';
import { useAvatars } from '@/api/hooks';
import { useCapability, useSession } from '@/stores/session';
import { usePresets } from '@/stores/presets';
import { useToasts } from '@/stores/ops';
import { Artwork } from '@/components/fx/Artwork';
import { Modal } from '@/components/ui/Overlay';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { DenialNotice, EmptyState, ErrorState, IdTag, Panel, RangeField, RarityStars, Segmented, SkeletonGrid, Stepper } from '@/components/ui/Primitives';
import type { Weapon, WeaponType } from '@/data/types';
import { normalize } from '@/lib/search';
import { fitAscension, levelLabel, levelMarks, maxLevelOf, validAscensions, WEAPON_CAPS_90 } from '@/lib/progression';

const WEAPON_TYPES: WeaponType[] = ['sword', 'claymore', 'polearm', 'bow', 'catalyst'];

/**
 * Weapon Builder: pick the exact weapon, set level / ascension / refinement within its own limits
 * (WeaponPromote caps, refinement only with a passive), create it through POST /players/{uid}/items
 * (the server validates and reads back every new guid), then equip it on a compatible character.
 */
export function WeaponForge({ initial, initialType, equipTo }: { initial: number | null; initialType: string | null; equipTo: number | null }) {
  const t = useT();
  const weapons = useCatalog('weapons');
  const characters = useCatalog('characters');
  const status = useSession((s) => s.status);
  const uid = useSession((s) => s.uid);
  const avatars = useAvatars(uid);
  const presets = usePresets((s) => s.presets);
  const addPreset = usePresets((s) => s.add);
  const toast = useToasts((s) => s.show);
  const equipCap = useCapability('avatars.equip');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<WeaponType | null>(WEAPON_TYPES.includes(initialType as WeaponType) ? (initialType as WeaponType) : null);
  const [rarity, setRarity] = useState<number | null>(null);
  const [showUnreleased, setShowUnreleased] = useState(false);
  const [selected, setSelected] = useState<Weapon | null>(null);
  const [level, setLevel] = useState(90);
  const [asc, setAsc] = useState(6);
  const [refinement, setRefinement] = useState(1);
  const [amount, setAmount] = useState(1);
  const [spec, setSpec] = useState<OperationSpec<unknown> | null>(null);
  const [created, setCreated] = useState<{ weapon: Weapon; guids: string[]; label: string } | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const caps = selected?.ascensionCaps?.length ? selected.ascensionCaps : WEAPON_CAPS_90;
  const maxRef = selected?.maxRefinement ?? 5;
  const choose = (w: Weapon, opts?: { level?: number; promoteLevel?: number; refinement?: number }) => {
    const c = w.ascensionCaps?.length ? w.ascensionCaps : WEAPON_CAPS_90;
    const lv = Math.min(opts?.level ?? maxLevelOf(c), maxLevelOf(c));
    setSelected(w);
    setLevel(lv);
    setAsc(opts?.promoteLevel !== undefined && validAscensions(c, lv).includes(opts.promoteLevel) ? opts.promoteLevel : fitAscension(c, lv, c.length - 1));
    setRefinement(Math.min(opts?.refinement ?? 1, w.maxRefinement ?? 5));
    setCreated(null);
  };

  useEffect(() => {
    if (initial && weapons.data) {
      const w = byId(weapons.data).get(initial);
      if (w) choose(w);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, weapons.data]);

  const list = useMemo(() => {
    const q = normalize(query);
    return (weapons.data ?? []).filter(
      (w) =>
        (!type || w.type === type) &&
        (!rarity || w.rarity === rarity) &&
        (showUnreleased || w.release !== 'not-in-codex') &&
        (!q || String(w.id).startsWith(q) || normalize(`${w.name.en} ${w.name.th ?? ''}`).includes(q)),
    );
  }, [weapons.data, query, type, rarity, showUnreleased]);

  if (weapons.error) return <ErrorState error={weapons.error} onRetry={weapons.retry} />;
  const maxAmount = status?.limits.maxUnstackableAmount ?? 50;
  const charIndex = byId(characters.data);
  const compatible = (avatars.data ?? []).filter((a) => selected && charIndex.get(a.avatarId)?.weapon === selected.type);
  const weaponPresets = presets.filter((p) => p.kind === 'equipment' && p.payload.weapon);

  const reviewCreate = () => {
    if (!selected) return;
    const w = selected;
    const entry = { itemId: w.id, amount, level, promoteLevel: asc, refinement };
    const name = t.loc(w.name);
    const label = `${levelLabel(caps, level, asc)} R${refinement}`;
    setSpec({
      title: `${t('armory.giveWeapon')} — ${name}`,
      capability: 'weapons.give',
      action: 'items.give',
      summary: `${name} ${label} ×${amount}`,
      lines: [
        { label: t('armory.weaponTab'), value: `${name} (#${w.id})` },
        { label: t('common.level'), value: levelLabel(caps, level, asc) },
        { label: t('armory.refinement'), value: `R${refinement}` },
        { label: t('common.amount'), value: amount > 1 ? t('spawner.instances', { n: amount }) : '1' },
      ],
      request: { method: 'POST', path: '/players/{uid}/items', body: { items: [entry] } },
      run: (conn, target) => api.giveItems(conn, target, [entry]),
      judge: (result) => {
        const r = result as GiveItemsResult;
        const line = r.results[0];
        if (r.success && line) {
          setCreated({ weapon: w, guids: line.guids, label });
          return { status: 'success', detail: `GUID ${line.guids.join(', ')}` };
        }
        return line?.added ? { status: 'partial', detail: `${line.added}/${amount}` } : { status: 'failed', detail: line?.note ?? 'server added nothing' };
      },
    });
  };

  const reviewEquip = (avatar: OwnedAvatar, guid: string) => {
    if (!created) return;
    const charName = t.loc(charIndex.get(avatar.avatarId)?.name) || `#${avatar.avatarId}`;
    const before = avatar.weapon ? t.loc(byId(weapons.data).get(avatar.weapon.itemId)?.name) || `#${avatar.weapon.itemId}` : t('builder.none');
    setSpec({
      title: t('builder.equipTitle', { name: t.loc(created.weapon.name) }),
      capability: 'avatars.equip',
      action: 'avatar.equip',
      summary: `${charName} ← ${t.loc(created.weapon.name)}`,
      lines: [
        { label: t('characters.title'), value: charName },
        { label: t('builder.currentWeapon'), value: `${before} → ${t.loc(created.weapon.name)} (${created.label})` },
        ...(avatar.weapon ? [{ label: '', value: <span className="text-xs text-dim">{t('builder.weaponBackToBag')}</span> }] : []),
      ],
      request: { method: 'POST', path: `/players/{uid}/avatars/${avatar.avatarId}/equip`, body: { guid } },
      run: (conn, target) => api.equipItem(conn, target, avatar.avatarId, guid),
      judge: (result) => {
        const r = result as OwnedAvatar;
        return r.weapon?.guid === guid ? { status: 'success', detail: `${charName}: Lv${r.weapon.level} R${r.weapon.refinement}` } : { status: 'failed', detail: 'weapon not in the slot after equip' };
      },
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
      <div className="min-w-0">
        <div className="panel mb-4 space-y-3 p-4">
          <div className="relative">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
            <input className="field pl-9" placeholder={t('armory.searchWeapon')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('armory.pickWeapon')} />
          </div>
          <div className="flex flex-wrap gap-2">
            {WEAPON_TYPES.map((w) => (
              <button key={w} className="chip" aria-pressed={type === w} onClick={() => setType(type === w ? null : w)}>
                {t.dyn(`weapons.${w}`)}
              </button>
            ))}
            <span className="mx-1 h-4 w-px self-center bg-line" />
            {[5, 4, 3, 2, 1].map((r) => (
              <button key={r} className="chip" aria-pressed={rarity === r} onClick={() => setRarity(rarity === r ? null : r)}>
                {t('common.stars', { n: r })}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-mist">
              <input type="checkbox" checked={showUnreleased} onChange={(e) => setShowUnreleased(e.target.checked)} />
              {t('builder.showUnreleased')}
            </label>
          </div>
          {equipTo && <p className="text-xs text-cyan">{t('armory.forCharacter', { name: t.loc(charIndex.get(equipTo)?.name) || `#${equipTo}` })}</p>}
        </div>
        {!weapons.data ? (
          <SkeletonGrid count={12} className="h-16" />
        ) : list.length === 0 ? (
          <EmptyState title={t('search.empty', { q: query })} />
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
            {list.map((w) => (
              <li key={w.id}>
                <button onClick={() => choose(w)} className={`panel panel-interactive tilt flex w-full items-center gap-3 p-3 text-left ${selected?.id === w.id ? 'ring-1 ring-gold/60' : ''}`}>
                  <Artwork icon={w.icon} name={w.name.en} rarity={w.rarity} size={48} rounded="rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ivory">{t.loc(w.name)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <RarityStars rarity={w.rarity} size={8} />
                      <span className="text-[11px] text-dim">{t.dyn(`weapons.${w.type}`)}</span>
                      {w.release === 'not-in-codex' && <span className="text-[10px] text-warn">{t('builder.unreleased')}</span>}
                    </div>
                  </div>
                  <IdTag id={w.id} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <Panel corners className="p-6">
          {!selected ? (
            <EmptyState icon={<Hammer size={22} />} title={t('armory.pickWeapon')}>
              <button className="btn btn-ghost btn-sm mt-3" onClick={() => setPresetsOpen(true)}>
                <FolderOpen size={14} /> {t('armory.loadWeaponPreset')}
              </button>
            </EmptyState>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <Artwork icon={selected.icon} name={selected.name.en} rarity={selected.rarity} size={88} rounded="rounded-2xl" />
                <div className="min-w-0">
                  <div className="title-display text-lg leading-snug">{t.loc(selected.name)}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <RarityStars rarity={selected.rarity} />
                    <IdTag id={selected.id} />
                    <span className="text-[11px] text-dim">{t.dyn(`weapons.${selected.type}`)}</span>
                  </div>
                </div>
              </div>
              <RangeField
                label={t('common.level')}
                value={level}
                onChange={(v) => {
                  setLevel(v);
                  setAsc((a) => fitAscension(caps, v, a));
                }}
                min={1}
                max={maxLevelOf(caps)}
                marks={levelMarks(caps)}
              />
              <div className="flex flex-wrap items-center gap-2">
                {validAscensions(caps, level).length > 1 ? (
                  <Segmented label={t('builder.ascensionLabel')} value={asc} onChange={setAsc} options={validAscensions(caps, level).map((p) => ({ value: p, label: levelLabel(caps, level, p) }))} />
                ) : (
                  <span className="rounded-md border border-line px-2 py-1 font-mono text-xs text-mist">{levelLabel(caps, level, asc)}</span>
                )}
                <span className="font-mono text-[11px] text-dim">{t('builder.ascension', { n: asc, max: caps.length - 1 })}</span>
              </div>
              <div>
                <div className="label">{t('armory.refinement')}</div>
                {maxRef > 1 ? (
                  <Segmented label="refinement" value={refinement} onChange={setRefinement} options={[1, 2, 3, 4, 5].map((r) => ({ value: r, label: `R${r}` }))} />
                ) : (
                  <p className="text-xs text-dim">{t('armory.noRefinement')}</p>
                )}
              </div>
              <div className="max-w-[160px]">
                <div className="label">{t('common.amount')}</div>
                <Stepper value={amount} onChange={setAmount} min={1} max={maxAmount} label={t('common.amount')} />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary flex-1" onClick={reviewCreate}>
                  <Hammer size={15} /> {t('armory.giveWeapon')}
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  title={t('characters.saveAsPreset')}
                  aria-label={t('characters.saveAsPreset')}
                  onClick={() => {
                    addPreset({ kind: 'equipment', name: `${t.loc(selected.name)} ${levelLabel(caps, level, asc)} R${refinement}`, payload: { weapon: { itemId: selected.id, level, promoteLevel: asc, refinement }, artifacts: [] } });
                    toast({ tone: 'info', title: t('characters.saveAsPreset'), body: t.loc(selected.name) });
                  }}
                >
                  <BookmarkPlus size={15} />
                </button>
                <button className="btn btn-ghost btn-icon" title={t('armory.loadWeaponPreset')} aria-label={t('armory.loadWeaponPreset')} onClick={() => setPresetsOpen(true)}>
                  <FolderOpen size={15} />
                </button>
              </div>
            </div>
          )}
        </Panel>

        {created && (
          <Panel className="p-5" eyebrow={t('armory.created')}>
            <div className="mb-3 flex items-center gap-2 text-sm text-ok">
              <CheckCircle2 size={15} /> {t('armory.createdVerified', { n: created.guids.length })}
            </div>
            <div className="mb-4 font-mono text-[11px] break-all text-dim">GUID {created.guids.join(', ')}</div>
            <div className="label">{t('armory.equipTo')}</div>
            {!uid ? (
              <p className="text-xs text-dim">{t('states.needPlayer')}</p>
            ) : compatible.length === 0 ? (
              <p className="text-xs text-dim">{t('armory.noCompatible', { type: t.dyn(`weapons.${created.weapon.type}`) })}</p>
            ) : (
              <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto">
                {[...compatible]
                  .sort((a, b) => (a.avatarId === equipTo ? -1 : b.avatarId === equipTo ? 1 : 0))
                  .map((a) => {
                    const c = charIndex.get(a.avatarId);
                    return (
                      <li key={a.avatarId} className="flex items-center gap-2.5 rounded-xl border border-line bg-abyss/40 p-2">
                        <Artwork icon={c?.icon} name={c?.name.en ?? `#${a.avatarId}`} element={c?.element} rarity={c?.rarity} size={36} rounded="rounded-full" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs text-ivory">{t.loc(c?.name) || `#${a.avatarId}`}</div>
                          <div className="truncate text-[11px] text-dim">{a.weapon ? `${t.loc(byId(weapons.data).get(a.weapon.itemId)?.name) || `#${a.weapon.itemId}`} Lv${a.weapon.level}` : t('builder.none')}</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" disabled={!equipCap.allowed && equipCap.reason !== 'preview'} onClick={() => reviewEquip(a, created.guids[0])}>
                          <Shirt size={13} /> {t('builder.equip')}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
            {!equipCap.allowed && equipCap.reason !== 'preview' && <DenialNotice reason={equipCap.reason} role={equipCap.role} compact />}
          </Panel>
        )}
      </aside>

      <Modal open={presetsOpen} onClose={() => setPresetsOpen(false)} title={t('armory.loadWeaponPreset')} eyebrow={t('presets.kinds.equipment')}>
        {weaponPresets.length === 0 ? (
          <EmptyState title={t('armory.noWeaponPresets')} />
        ) : (
          <ul className="space-y-2">
            {weaponPresets.map((p) => {
              if (p.kind !== 'equipment' || !p.payload.weapon) return null;
              const pw = p.payload.weapon;
              const w = byId(weapons.data).get(pw.itemId);
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-abyss/40 p-3">
                  <Artwork icon={w?.icon} name={w?.name.en ?? `#${pw.itemId}`} rarity={w?.rarity} size={40} rounded="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ivory">{p.name}</div>
                    <div className="font-mono text-[11px] text-dim">
                      #{pw.itemId} · Lv{pw.level} R{pw.refinement}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={!w}
                    onClick={() => {
                      if (!w) return;
                      choose(w, pw);
                      setPresetsOpen(false);
                    }}
                  >
                    {w ? t('builder.loadIntoEditor') : t('armory.unknownWeapon')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} onDone={() => avatars.refresh()} />
    </div>
  );
}
