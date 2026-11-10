/**
 * Item spawner model (pure; unit-tested). Turns the catalog's materials, furniture and weapons into
 * one list of spawn entries, with the category, the spawn rule and the quantity checks the bridge
 * also enforces (NukvaItemRules / NukvaOperations.checkGiveFits). The server stays authoritative:
 * when connected, its /catalog/items answer overrides the catalog's own classification.
 */
import type { CatalogItem } from '@/api/generated';
import type { Furniture, Localized, Material, SpawnReason, Weapon } from '@/data/types';

export type SpawnCategory = 'currency' | 'enhancement' | 'consumable' | 'gadget' | 'unlock' | 'housing' | 'weapon' | 'quest' | 'other';
export const SPAWN_CATEGORIES: SpawnCategory[] = ['currency', 'enhancement', 'consumable', 'gadget', 'unlock', 'housing', 'weapon', 'quest', 'other'];

export type EntryKind = 'stackable' | 'currency' | 'unlock' | 'weapon' | 'unsupported';

export interface SpawnEntry {
  id: number;
  name: Localized;
  icon: string | null;
  rarity: number;
  /** Game type without prefix (EXP_FRUIT, FOOD…) or WEAPON / FURNITURE. */
  type: string;
  category: SpawnCategory;
  kind: EntryKind;
  reason?: SpawnReason | string;
  /** Most a player can hold (stackables), 1 for unlocks, null when unlimited/not stacked. */
  stackLimit: number | null;
  /** false when the server keeps no balance (character / adventure EXP). */
  countable: boolean;
  /** Where the description lives ('material-text') when there is one. */
  hasText: boolean;
  source: 'material' | 'furniture' | 'weapon';
  /** Present when the server's /catalog/items answer was applied. */
  serverChecked?: boolean;
}

const ENHANCEMENT = new Set(['EXP_FRUIT', 'WEAPON_EXP_STONE', 'RELIQUARY_MATERIAL', 'AVATAR_MATERIAL', 'ELEM_CRYSTAL', 'RARE_GROWTH_MATERIAL', 'TALENT', 'FIRE_MASTER_AVATAR_TALENT_ITEM', 'AVATAR_TALENT_MATERIAL']);
const CONSUMABLE = new Set(['FOOD', 'SPICE_FOOD', 'NOTICE_ADD_HP', 'CONSUME', 'CONSUME_BATCH_USE', 'CHEST', 'CHEST_BATCH_USE', 'CHEST_BATCH_USE_WITH_GROUP', 'SELECTABLE_CHEST', 'BEYOND_COSTUME_SELECTABLE_CHEST', 'ADSORBATE']);
const GADGET = new Set(['WIDGET', 'FIREWORKS', 'FISH_ROD', 'FISH_BAIT', 'ACTIVITY_GEAR', 'ACTIVITY_ROBOT', 'ACTIVITY_JIGSAW', 'CRICKET', 'SEA_LAMP']);
const HOUSING = new Set(['FURNITURE_FORMULA', 'FURNITURE_SUITE_FORMULA', 'WOOD', 'HOME_SEED']);
const UNLOCK_TYPES = new Set(['NAMECARD', 'FLYCLOAK', 'COSTUME']);

export function categoryOfMaterial(m: Pick<Material, 'type' | 'item' | 'spawn'>): SpawnCategory {
  if (m.item === 'virtual') return 'currency';
  if (m.spawn === 'unlock' || UNLOCK_TYPES.has(m.type)) return 'unlock';
  if (ENHANCEMENT.has(m.type)) return 'enhancement';
  if (CONSUMABLE.has(m.type)) return 'consumable';
  if (GADGET.has(m.type)) return 'gadget';
  if (HOUSING.has(m.type)) return 'housing';
  if (m.type === 'QUEST' || m.type.startsWith('QUEST_')) return 'quest';
  return 'other';
}

export function buildEntries(materials: Material[] = [], furniture: Furniture[] = [], weapons: Weapon[] = [], text?: Record<string, unknown>): SpawnEntry[] {
  const list: SpawnEntry[] = [];
  for (const m of materials) {
    const kind = (m.spawn ?? 'stackable') as EntryKind;
    list.push({
      id: m.id,
      name: m.name,
      icon: m.icon,
      rarity: m.rarity,
      type: m.type,
      category: categoryOfMaterial(m),
      kind,
      reason: m.spawnReason,
      stackLimit: kind === 'unlock' ? 1 : kind === 'stackable' ? (m.stackLimit ?? 1) : null,
      countable: m.countable !== false,
      hasText: !!text?.[m.id],
      source: 'material',
    });
  }
  for (const f of furniture) {
    const kind = f.spawn ?? 'stackable';
    list.push({ id: f.id, name: f.name, icon: f.icon, rarity: f.rarity, type: 'FURNITURE', category: 'housing', kind, reason: f.spawnReason, stackLimit: kind === 'stackable' ? (f.stackLimit ?? 1) : null, countable: true, hasText: false, source: 'furniture' });
  }
  for (const w of weapons) {
    list.push({ id: w.id, name: w.name, icon: w.icon, rarity: w.rarity, type: 'WEAPON', category: 'weapon', kind: 'weapon', stackLimit: null, countable: true, hasText: false, source: 'weapon' });
  }
  return list.sort((a, b) => a.id - b.id);
}

/** Applies the server's own classification (connected mode). Unknown to the server = unsupported. */
export function applyServerCatalog(entries: SpawnEntry[], server: CatalogItem[] | undefined): SpawnEntry[] {
  if (!server) return entries;
  const byId = new Map(server.map((s) => [s.id, s]));
  return entries.map((e) => {
    const s = byId.get(e.id);
    if (!s) return { ...e, kind: 'unsupported', reason: 'NOT_LOADED', serverChecked: true };
    if (!s.supported) return { ...e, kind: 'unsupported', reason: s.reason ?? 'UNSUPPORTED', serverChecked: true };
    const kind: EntryKind = s.kind === 'artifact' ? 'unsupported' : (s.kind as EntryKind);
    return { ...e, kind, reason: undefined, stackLimit: kind === 'stackable' ? (s.stackLimit ?? e.stackLimit) : kind === 'unlock' ? 1 : null, serverChecked: true };
  });
}

/** Total owned per item id from an inventory listing (weapons: number of instances). */
export function ownedCounts(items: { itemId: number; count: number; type: string }[] | undefined, currencies?: { primogems: number; mora: number; genesisCrystals: number }): Map<number, number> {
  const map = new Map<number, number>();
  for (const i of items ?? []) map.set(i.itemId, (map.get(i.itemId) ?? 0) + (i.type === 'ITEM_WEAPON' || i.type === 'ITEM_RELIQUARY' ? 1 : i.count));
  if (currencies) {
    map.set(201, currencies.primogems);
    map.set(202, currencies.mora);
    map.set(203, currencies.genesisCrystals);
  }
  return map;
}

export interface Limits {
  maxStackAmount: number;
  maxUnstackableAmount: number;
}

/**
 * Largest amount the server will accept for one give of this entry, given what the player holds.
 * Mirrors planEntry + checkGiveFits; 0 means nothing more fits.
 */
export function maxGive(entry: SpawnEntry, owned: number | undefined, limits: Limits): number {
  switch (entry.kind) {
    case 'unsupported':
      return 0;
    case 'unlock':
      return owned && owned > 0 ? 0 : 1;
    case 'weapon':
      return limits.maxUnstackableAmount;
    case 'currency':
      return Math.max(0, Math.min(limits.maxStackAmount, 2_147_483_647 - (owned ?? 0)));
    case 'stackable': {
      const limit = entry.stackLimit ?? 1;
      return Math.max(0, Math.min(limits.maxStackAmount, limit - Math.max(0, owned ?? 0)));
    }
  }
}

export type AmountProblem = { code: 'UNSUPPORTED' | 'STACK_LIMIT' | 'ZERO' | 'TOO_MANY'; max: number } | null;

/** Why an amount would be refused, before anything is sent. */
export function checkAmount(entry: SpawnEntry, owned: number | undefined, amount: number, limits: Limits): AmountProblem {
  const max = maxGive(entry, owned, limits);
  if (entry.kind === 'unsupported') return { code: 'UNSUPPORTED', max: 0 };
  if (!Number.isInteger(amount) || amount < 1) return { code: 'ZERO', max };
  if (amount > max) return { code: entry.kind === 'stackable' || entry.kind === 'unlock' ? 'STACK_LIMIT' : 'TOO_MANY', max };
  return null;
}

/** Quick amounts that make sense for this entry (never above what fits). */
export function quickAmounts(entry: SpawnEntry, owned: number | undefined, limits: Limits): number[] {
  const max = maxGive(entry, owned, limits);
  if (max <= 1) return max === 1 ? [1] : [];
  const base = entry.kind === 'weapon' ? [1, 5, 10] : [1, 10, 100, 1000, 10_000, 100_000];
  const list = base.filter((n) => n < max);
  list.push(max);
  return list;
}

export interface BatchLine {
  itemId: number;
  amount: number;
  level?: number;
  refinement?: number;
}

/** Adds to a batch, merging with an existing line for the same item (the server merges too). */
export function addLine(batch: BatchLine[], line: BatchLine, maxLines: number): { batch: BatchLine[]; added: boolean } {
  const existing = batch.find((b) => b.itemId === line.itemId && b.level === line.level && b.refinement === line.refinement);
  if (existing) return { batch: batch.map((b) => (b === existing ? { ...b, amount: b.amount + line.amount } : b)), added: true };
  if (batch.length >= maxLines) return { batch, added: false };
  return { batch: [...batch, line], added: true };
}

/** Batch problems per item id: total amount across lines vs. what fits. */
export function batchProblems(batch: BatchLine[], entries: Map<number, SpawnEntry>, owned: Map<number, number>, limits: Limits): Map<number, AmountProblem> {
  const totals = new Map<number, number>();
  for (const b of batch) totals.set(b.itemId, (totals.get(b.itemId) ?? 0) + b.amount);
  const problems = new Map<number, AmountProblem>();
  for (const [id, total] of totals) {
    const entry = entries.get(id);
    if (!entry) {
      problems.set(id, { code: 'UNSUPPORTED', max: 0 });
      continue;
    }
    const problem = checkAmount(entry, owned.get(id), total, limits);
    if (problem) problems.set(id, problem);
  }
  return problems;
}
