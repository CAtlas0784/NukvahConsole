import type { ReactNode } from 'react';
import type { ArtifactData, Character, Slot, Weapon } from '@/data/types';
import type { InventoryItem, MaxChange, OwnedAvatar } from '@/api/nukva';
import { slotOf, type PieceInfo } from '@/lib/builder';
import { statName } from '@/lib/stats';
import type { useT } from '@/i18n';

type T = ReturnType<typeof useT>;

/** Everything a builder tab needs about the selected character. */
export interface TabCtx {
  character: Character;
  owned: OwnedAvatar;
  inventory: InventoryItem[];
  characters: Character[];
  weapons: Weapon[];
  artifacts: ArtifactData | undefined;
  pieces: Map<number, PieceInfo>;
  /** Re-reads the roster and the inventory after a confirmed write. */
  onChanged: () => void;
}

export function weaponName(ctx: Pick<TabCtx, 'weapons'>, t: T, itemId: number): string {
  return t.loc(ctx.weapons.find((w) => w.id === itemId)?.name) || `#${itemId}`;
}

export function pieceName(ctx: Pick<TabCtx, 'pieces'>, t: T, itemId: number): string {
  const info = ctx.pieces.get(itemId);
  return info ? t.loc(info.piece.name) : `#${itemId}`;
}

export function ownerName(ctx: Pick<TabCtx, 'characters'>, t: T, avatarId: number): string {
  return t.loc(ctx.characters.find((c) => c.id === avatarId)?.name) || `#${avatarId}`;
}

export function slotLabel(t: T, slot: Slot): string {
  return t.dyn(`armory.slots.${slot}`);
}

/** Main stat name of an artifact, from the catalog's main-stat pool for that piece. */
export function mainStatName(ctx: Pick<TabCtx, 'artifacts' | 'pieces'>, t: T, itemId: number, mainPropId: number): string {
  const info = ctx.pieces.get(itemId);
  const pool = info ? ctx.artifacts?.mainProps[info.piece.mainDepot] : undefined;
  const entry = pool?.find((m) => m.id === mainPropId);
  return entry ? statName(entry.prop, t.lang) : `#${mainPropId}`;
}

/** One line of the changes shown in a dialog. The field "artifact.<slot>" names an equipped slot. */
export function describeChange(ctx: Pick<TabCtx, 'pieces'>, t: T, change: MaxChange): { label: string; value: ReactNode } {
  if (change.field.startsWith('artifact.')) {
    const slot = change.field.slice('artifact.'.length) as Slot;
    const name = change.itemId ? pieceName(ctx, t, change.itemId) : String(change.to);
    return { label: `${t('builder.field.artifact')} · ${slotLabel(t, slot)}`, value: `${t('builder.none')} → ${name}${typeof change.to === 'string' ? ` (${change.to.split(' ')[0]})` : ''}` };
  }
  return { label: t.dyn(`builder.field.${change.field}`), value: `${change.from ?? '—'} → ${change.to}` };
}

/** Inventory artifacts that fit a slot, best first (rarity unknown here, so level then substat count). */
export function artifactsForSlot(inventory: InventoryItem[], slot: Slot): InventoryItem[] {
  return inventory
    .filter((i) => i.type === 'ITEM_RELIQUARY' && slotOf(i.slot) === slot)
    .sort((a, b) => b.level - a.level || (b.appendPropIds?.length ?? 0) - (a.appendPropIds?.length ?? 0));
}
