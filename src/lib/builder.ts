import type { InventoryItem, MaxChange, OwnedAvatar } from '@/api/nukva';
import type { ArtifactData, ArtifactPiece, ArtifactSet, Slot } from '@/data/types';
import { SLOTS } from '@/data/types';

/** Engine slot names the bridge reports for artifacts, mapped to the five Genshin slots. */
const SLOT_BY_ENGINE: Record<string, Slot> = {
  EQUIP_BRACER: 'flower',
  EQUIP_NECKLACE: 'plume',
  EQUIP_SHOES: 'sands',
  EQUIP_RING: 'goblet',
  EQUIP_DRESS: 'circlet',
};

export function slotOf(engineSlot: string | undefined): Slot | null {
  return (engineSlot && SLOT_BY_ENGINE[engineSlot]) || null;
}

/** Same rule as the server: the lowest ascension that allows a level. */
export function minPromote(level: number): number {
  if (level > 80) return 6;
  if (level > 70) return 5;
  if (level > 60) return 4;
  if (level > 50) return 3;
  if (level > 40) return 2;
  if (level > 20) return 1;
  return 0;
}

export const MAX_ASCENSION = 6;

export interface PieceInfo {
  piece: ArtifactPiece;
  set: ArtifactSet;
  slot: Slot;
}

/** itemId → piece/set/slot, built once per catalog. */
export function indexPieces(data: ArtifactData | undefined): Map<number, PieceInfo> {
  const index = new Map<number, PieceInfo>();
  for (const set of data?.sets ?? []) {
    for (const slot of SLOTS) for (const piece of set.pieces[slot] ?? []) index.set(piece.id, { piece, set, slot });
  }
  return index;
}

export interface ActiveSet {
  set: ArtifactSet;
  count: number;
  /** Every bonus of the set, flagged by whether the worn count reaches it. */
  bonuses: { pieces: number; text: ArtifactSet['bonuses'][number]['text']; active: boolean }[];
}

/** Sets worn by at least two pieces, with which 2pc / 4pc bonuses are active. */
export function activeSets(artifacts: OwnedAvatar['artifacts'], index: Map<number, PieceInfo>): ActiveSet[] {
  const counts = new Map<number, { set: ArtifactSet; count: number }>();
  for (const a of artifacts) {
    const info = index.get(a.itemId);
    if (!info) continue;
    const entry = counts.get(info.set.id) ?? { set: info.set, count: 0 };
    entry.count += 1;
    counts.set(info.set.id, entry);
  }
  return [...counts.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count)
    .map((e) => ({ ...e, bonuses: e.set.bonuses.map((b) => ({ ...b, active: e.count >= b.pieces })) }));
}

/**
 * Client-side mirror of the server's one-click max plan, used only in preview mode where nothing is
 * sent. Connected mode asks the server for the real plan instead.
 */
export function planMax(avatar: OwnedAvatar, inventory: InventoryItem[], rankOf: (itemId: number) => number): MaxChange[] {
  const changes: MaxChange[] = [];
  if (avatar.level !== 90) changes.push({ field: 'level', from: avatar.level, to: 90 });
  if (avatar.constellation !== 6) changes.push({ field: 'constellation', from: avatar.constellation, to: 6 });
  for (const key of ['normal', 'skill', 'burst'] as const) {
    const level = avatar.talents?.[key].level;
    if (level != null && level !== 10) changes.push({ field: key, from: level, to: 10 });
  }
  const w = avatar.weapon;
  if (w && (w.level !== 90 || w.refinement !== 5)) changes.push({ field: 'weapon', from: `Lv${w.level} R${w.refinement}`, to: 'Lv90 R5' });

  const worn = new Set(avatar.artifacts.map((a) => slotOf(a.slot)));
  for (const slot of SLOTS) {
    if (worn.has(slot)) continue;
    const free = inventory.filter((i) => i.type === 'ITEM_RELIQUARY' && !i.equippedAvatarId && slotOf(i.slot) === slot);
    free.sort(
      (a, b) =>
        rankOf(b.itemId) - rankOf(a.itemId) ||
        b.level - a.level ||
        (b.appendPropIds?.length ?? 0) - (a.appendPropIds?.length ?? 0) ||
        Number(BigInt(a.guid) - BigInt(b.guid)),
    );
    const best = free[0];
    if (best) changes.push({ field: `artifact.${slot}`, from: null, to: `Lv${best.level} #${best.itemId}`, guid: best.guid, itemId: best.itemId });
  }
  return changes;
}

export interface SummaryInput {
  name: string;
  id: number;
  level: number;
  constellation: number;
  talents: { normal: number; skill: number; burst: number } | null;
  weapon: string | null;
  artifacts: { slot: string; label: string }[];
}

/** Plain text for Copy text. Stable layout so it can be pasted into chat. */
export function summaryText(
  s: SummaryInput,
  labels: { level: string; talents: string; weapon: string; artifacts: string; none: string },
): string {
  const lines = [`${s.name} (#${s.id})`, `${labels.level}: ${s.level} · C${s.constellation}`];
  if (s.talents) lines.push(`${labels.talents}: ${s.talents.normal}/${s.talents.skill}/${s.talents.burst}`);
  lines.push(`${labels.weapon}: ${s.weapon ?? labels.none}`);
  lines.push(`${labels.artifacts}:`);
  if (s.artifacts.length === 0) lines.push(`  ${labels.none}`);
  for (const a of s.artifacts) lines.push(`  ${a.slot}: ${a.label}`);
  return lines.join('\n');
}

/** Whether a roster entry is fully built (level 90 and C6). */
export function isMaxed(a: Pick<OwnedAvatar, 'level' | 'constellation'>): boolean {
  return a.level === 90 && a.constellation === 6;
}
