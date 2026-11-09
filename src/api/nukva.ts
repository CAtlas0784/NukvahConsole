import { request, type Connection } from './client';
import type { CommandInfo } from '@/data/types';

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
  // Not provided by the current bridge; listed so the UI can label them as unavailable.
  | 'avatars.equip'
  | 'avatars.fetter';

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
}

export interface PlayerSummary extends OnlinePlayer {
  signature: string | null;
  position: { x: number; y: number; z: number } | null;
  avatarCount: number;
  currencies: { primogems: number; mora: number; genesisCrystals: number };
  inventory: Record<string, number>;
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
  weapon: { itemId: number; level: number; promoteLevel: number; refinement: number } | null;
  artifacts: { itemId: number; slot: string; level: number; mainPropId: number; appendPropIds: number[] }[];
  rejected?: string[];
}

export interface InventoryItem {
  guid: string;
  itemId: number;
  type: string;
  count: number;
  level: number;
  refinement?: number;
  mainPropId?: number;
  appendPropIds?: number[];
  equippedAvatarId?: number;
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

export interface GiveItemsResult {
  success: boolean;
  results: { itemId: number; type: string; requested: number; added: number; success: boolean; note?: string | null }[];
}

export interface ExecuteResult {
  command: string;
  uid: number;
  output: string[];
  note: string;
}

export const api = {
  health: (c: Connection) => request<{ ok: boolean; service: string; apiVersion: number }>({ ...c, token: '' }, 'GET', '/health'),
  status: (c: Connection) => request<ServerStatus>(c, 'GET', '/status'),
  players: (c: Connection) => request<OnlinePlayer[]>(c, 'GET', '/players'),
  player: (c: Connection, uid: number) => request<PlayerSummary>(c, 'GET', `/players/${uid}`),
  avatars: (c: Connection, uid: number) => request<OwnedAvatar[]>(c, 'GET', `/players/${uid}/avatars`),
  inventory: (c: Connection, uid: number, type?: string) =>
    request<InventoryItem[]>(c, 'GET', `/players/${uid}/inventory${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  commands: (c: Connection) => request<CommandInfo[]>(c, 'GET', '/commands'),
  audit: (c: Connection, limit = 30) => request<AuditEntry[]>(c, 'GET', `/audit?limit=${limit}`),

  grantAvatar: (c: Connection, uid: number, body: { avatarId: number; level: number; constellation: number; talentLevel: number }) =>
    request<OwnedAvatar>(c, 'POST', `/players/${uid}/avatars`, body),
  updateAvatar: (
    c: Connection,
    uid: number,
    avatarId: number,
    body: { level?: number; constellation?: number; normal?: number; skill?: number; burst?: number },
  ) => request<OwnedAvatar>(c, 'PATCH', `/players/${uid}/avatars/${avatarId}`, body),
  giveItems: (c: Connection, uid: number, items: { itemId: number; amount: number; level?: number; refinement?: number }[]) =>
    request<GiveItemsResult>(c, 'POST', `/players/${uid}/items`, { items }),
  giveArtifact: (
    c: Connection,
    uid: number,
    body: { itemId: number; level: number; mainPropId?: number; appendPropIds: number[]; amount?: number },
  ) => request<{ itemId: number; requested: number; added: number; success: boolean; rolls: number; expectedRolls: number }>(c, 'POST', `/players/${uid}/artifacts`, body),
  setWorldLevel: (c: Connection, uid: number, worldLevel: number) =>
    request<{ worldLevel: number; success: boolean }>(c, 'POST', `/players/${uid}/world-level`, { worldLevel }),
  teleport: (c: Connection, uid: number, body: { sceneId: number; x?: number; y?: number; z?: number }) =>
    request<{ sceneId: number; success: boolean }>(c, 'POST', `/players/${uid}/teleport`, body),
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
  'items.give': 'operator',
  'weapons.give': 'operator',
  'artifacts.give': 'operator',
  'world.level': 'operator',
  'world.teleport': 'operator',
  'world.spawn': 'operator',
  'commands.execute': 'admin',
};

export const ROLE_RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };
