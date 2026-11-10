import { request, type Connection } from './client';
import type { ServerPoint } from '@/lib/worldMap';
import type { CommandInfo } from '@/data/types';
import type {
  ArtifactCatalogSet,
  ArtifactPieceOptions,
  CatalogCharacter,
  CatalogItem,
  CatalogWeapon,
  GiveArtifactResult,
  GiveItemsResult as GeneratedGiveItemsResult,
  RouteInfo,
} from './generated';

export type { ArtifactCatalogSet, ArtifactPieceOptions, CatalogCharacter, CatalogItem, CatalogWeapon, GiveArtifactResult, RouteInfo };

/** Capabilities the bridge reports; the UI only enables what is listed. */
export type Capability =
  | 'players.read'
  | 'avatars.read'
  | 'avatars.grant'
  | 'avatars.level'
  | 'avatars.constellation'
  | 'avatars.talents'
  | 'inventory.read'
  | 'items.give'
  | 'weapons.give'
  | 'artifacts.give'
  | 'world.level'
  | 'world.teleport'
  | 'world.spawn'
  | 'commands.list'
  | 'commands.execute'
  | 'audit.read'
  | 'avatars.equip'
  | 'avatars.max'
  | 'items.edit'
  | 'avatars.fetter'
  | 'catalog.loaded'
  | 'catalog.read'
  | 'artifacts.read'
  | 'artifacts.equip'
  | 'artifacts.delete'
  | 'artifacts.custom'
  | 'world.points'
  | 'world.teleport.point';

export type Role = 'viewer' | 'operator' | 'admin';

export interface ServerStatus {
  server: string;
  gameVersion: string;
  bridgeVersion: string;
  apiVersion: number;
  runMode: string;
  onlinePlayers: number;
  uptimeSeconds: number;
  role: Role;
  capabilities: Capability[];
  limits: { maxStackAmount: number; maxUnstackableAmount: number; maxBatchSize: number; maxEntities: number };
}

export interface OnlinePlayer {
  uid: number;
  nickname: string;
  adventureRank: number;
  worldLevel: number;
  sceneId: number;
  /** False when nukva.json targets refuse writes to this UID. Absent on older servers. */
  writable?: boolean;
}

export interface PlayerSummary extends OnlinePlayer {
  signature: string | null;
  position: { x: number; y: number; z: number } | null;
  avatarCount: number;
  currencies: { primogems: number; mora: number; genesisCrystals: number };
  inventory: Record<string, number>;
  /** Waypoints/statues the player unlocked in the current scene, and points the server knows there. */
  unlockedPoints?: number;
  scenePoints?: number;
}

export interface TalentLevel {
  skillId: number;
  level: number;
}

export interface OwnedAvatar {
  avatarId: number;
  guid: string;
  level: number;
  promoteLevel: number;
  constellation: number;
  fetterLevel: number;
  talents: { normal: TalentLevel; skill: TalentLevel; burst: TalentLevel } | null;
  weapon: { guid?: string; itemId: number; level: number; promoteLevel: number; refinement: number } | null;
  artifacts: { guid?: string; itemId: number; slot: string; level: number; mainPropId: number; appendPropIds: number[] }[];
  rejected?: string[];
  /** Set by the update endpoint when lowering constellations made the server reload the scene. */
  sceneReloaded?: boolean;
  /** Set by the equip endpoint when the item was already on this character. */
  alreadyEquipped?: boolean;
}

export interface InventoryItem {
  guid: string;
  itemId: number;
  type: string;
  count: number;
  level: number;
  refinement?: number;
  /** Weapons only. */
  promoteLevel?: number;
  mainPropId?: number;
  appendPropIds?: number[];
  slot?: string;
  equippedAvatarId?: number;
}

/** One line of the one-click max plan. Artifact lines carry the guid and itemId that would be equipped. */
export interface MaxChange {
  field: string;
  from: string | number | null;
  to: string | number;
  guid?: string;
  itemId?: number;
}

export interface MaxResult {
  preview: boolean;
  applied: boolean;
  noop: boolean;
  changes: MaxChange[];
  avatar: OwnedAvatar;
  rejected?: string[];
}

export interface AuditEntry {
  timestamp: number;
  tokenId: string;
  address: string;
  origin: string | null;
  action: string;
  targetUid: number | null;
  params: unknown;
  success: boolean;
  message: string;
}

/** Per-item results; each item is verified by read-back (see GiveItemResult.verification). */
export type GiveItemsResult = GeneratedGiveItemsResult;

export interface ExecuteResult {
  command: string;
  uid: number;
  output: string[];
  note: string;
}

export interface ItemPatch {
  level?: number;
  /** Weapons: ascension, valid for the level (20/40/…/80 allow before or after ascending). */
  promoteLevel?: number;
  refinement?: number;
  mainPropId?: number;
  appendPropIds?: number[];
  /** 'custom': the final roll list is checked exactly like a custom creation. */
  mode?: 'custom';
}

export const api = {
  health: (c: Connection) => request<{ ok: boolean; service: string; apiVersion: number }>(c, 'GET', '/health'),
  status: (c: Connection) => request<ServerStatus>(c, 'GET', '/status'),
  players: (c: Connection) => request<OnlinePlayer[]>(c, 'GET', '/players'),
  player: (c: Connection, uid: number) => request<PlayerSummary>(c, 'GET', `/players/${uid}`),
  avatars: (c: Connection, uid: number) => request<OwnedAvatar[]>(c, 'GET', `/players/${uid}/avatars`),
  inventory: (c: Connection, uid: number, type?: string) =>
    request<InventoryItem[]>(c, 'GET', `/players/${uid}/inventory${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  commands: (c: Connection) => request<CommandInfo[]>(c, 'GET', '/commands'),
  audit: (c: Connection, limit = 30) => request<AuditEntry[]>(c, 'GET', `/audit?limit=${limit}`),

  grantAvatar: (c: Connection, uid: number, body: { avatarId: number; level: number; promoteLevel?: number; constellation: number; talentLevel?: number; normal?: number; skill?: number; burst?: number }) =>
    request<OwnedAvatar>(c, 'POST', `/players/${uid}/avatars`, body),
  updateAvatar: (
    c: Connection,
    uid: number,
    avatarId: number,
    body: { level?: number; promoteLevel?: number; constellation?: number; normal?: number; skill?: number; burst?: number; fetter?: number },
  ) => request<OwnedAvatar>(c, 'PATCH', `/players/${uid}/avatars/${avatarId}`, body),
  /** replace: confirm that an artifact already in the slot goes back to the bag (else SLOT_OCCUPIED). */
  equipItem: (c: Connection, uid: number, avatarId: number, guid: string, replace = false) =>
    request<OwnedAvatar>(c, 'POST', `/players/${uid}/avatars/${avatarId}/equip`, replace ? { guid, replace } : { guid }),
  unequipItem: (c: Connection, uid: number, avatarId: number, slot: string) =>
    request<OwnedAvatar>(c, 'POST', `/players/${uid}/avatars/${avatarId}/unequip`, { slot }),
  patchItem: (c: Connection, uid: number, guid: string, body: ItemPatch) =>
    request<InventoryItem>(c, 'PATCH', `/players/${uid}/items/${guid}`, body),
  /** With apply false the server only returns the plan and writes nothing. */
  maxAvatar: (c: Connection, uid: number, avatarId: number, apply: boolean) =>
    request<MaxResult>(c, 'POST', `/players/${uid}/avatars/${avatarId}/max`, { apply }),
  giveItems: (c: Connection, uid: number, items: { itemId: number; amount: number; level?: number; promoteLevel?: number; refinement?: number }[]) =>
    request<GiveItemsResult>(c, 'POST', `/players/${uid}/items`, { items }),
  giveArtifact: (
    c: Connection,
    uid: number,
    body: { itemId: number; level: number; mainPropId?: number; appendPropIds?: number[]; amount?: number; mode?: 'normal' | 'custom'; initialSubstats?: number },
  ) => request<GiveArtifactResult>(c, 'POST', `/players/${uid}/artifacts`, body),
  /** Deletes an unequipped artifact; the guid is repeated as confirmation. */
  deleteItem: (c: Connection, uid: number, guid: string) =>
    request<{ deleted: InventoryItem; success: boolean }>(c, 'DELETE', `/players/${uid}/items/${guid}?confirm=${encodeURIComponent(guid)}`),
  /** Equips an owned artifact (by guid) on a character; the read-back must show it in the slot. */
  equipArtifact: (c: Connection, uid: number, guid: string, avatarId: number, replace = false) =>
    request<OwnedAvatar>(c, 'POST', `/players/${uid}/artifacts/${guid}/equip`, replace ? { avatarId, replace } : { avatarId }),
  playerArtifacts: (c: Connection, uid: number) => request<InventoryItem[]>(c, 'GET', `/players/${uid}/artifacts`),
  catalogCharacters: (c: Connection) => request<CatalogCharacter[]>(c, 'GET', '/catalog/characters'),
  catalogItems: (c: Connection, type?: string) =>
    request<CatalogItem[]>(c, 'GET', `/catalog/items${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  catalogWeapons: (c: Connection) => request<CatalogWeapon[]>(c, 'GET', '/catalog/weapons'),
  artifactCatalog: (c: Connection) => request<ArtifactCatalogSet[]>(c, 'GET', '/artifacts/catalog'),
  /** Server-side rules for one artifact piece: allowed main stats, substat rolls, levels. */
  artifactOptions: (c: Connection, itemId: number) => request<ArtifactPieceOptions>(c, 'GET', `/artifacts/pieces/${itemId}/options`),
  routes: (c: Connection) => request<RouteInfo[]>(c, 'GET', '/routes'),
  setWorldLevel: (c: Connection, uid: number, worldLevel: number) =>
    request<{ worldLevel: number; success: boolean }>(c, 'POST', `/players/${uid}/world-level`, { worldLevel }),
  /** pointId: the server resolves the point from its own data and lands on its tranPos (never sent with x/y/z). */
  teleport: (c: Connection, uid: number, body: { sceneId: number; pointId?: number; x?: number; y?: number; z?: number }) =>
    request<{ sceneId: number; success: boolean; position?: { x: number; y: number; z: number }; destination?: { x: number; y: number; z: number }; point?: ServerPoint }>(c, 'POST', `/players/${uid}/teleport`, body),
  scenes: (c: Connection) => request<{ sceneId: number; type: string | null; points: number }[]>(c, 'GET', '/scenes'),
  scenePoints: (c: Connection, sceneId: number) => request<{ sceneId: number; points: ServerPoint[] }>(c, 'GET', `/scenes/${sceneId}/points`),
  spawn: (c: Connection, uid: number, body: { monsterId: number; amount: number; level: number }) =>
    request<{ monsterId: number; spawned: number; success: boolean }>(c, 'POST', `/players/${uid}/spawn`, body),
  execute: (c: Connection, uid: number, command: string) => request<ExecuteResult>(c, 'POST', '/commands/execute', { uid, command }),
};

/** Minimum role per capability (mirrors the bridge's server-side checks). */
export const CAPABILITY_ROLE: Partial<Record<Capability, Role>> = {
  'avatars.grant': 'operator',
  'avatars.level': 'operator',
  'avatars.constellation': 'operator',
  'avatars.talents': 'operator',
  'avatars.fetter': 'operator',
  'artifacts.equip': 'operator',
  'artifacts.delete': 'operator',
  'avatars.equip': 'operator',
  'avatars.max': 'operator',
  'items.edit': 'operator',
  'items.give': 'operator',
  'weapons.give': 'operator',
  'artifacts.give': 'operator',
  'world.level': 'operator',
  'world.teleport': 'operator',
  'world.spawn': 'operator',
  'commands.execute': 'admin',
};

export const ROLE_RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };
