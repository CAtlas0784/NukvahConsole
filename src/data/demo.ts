import type { AuditEntry, InventoryItem, OnlinePlayer, OwnedAvatar, PlayerSummary, ServerStatus } from '@/api/nukva';

/**
 * SIMULATED data for preview mode only. Every screen that shows it carries the preview banner,
 * and no write operation can be confirmed while in preview. IDs reference real catalog entries.
 */
export const DEMO_UID = 10001;

export const demoStatus: ServerStatus = {
  server: 'SnezhnayaCore (simulated)',
  gameVersion: '7.2.0',
  bridgeVersion: 'preview',
  apiVersion: 1,
  runMode: 'HYBRID',
  onlinePlayers: 1,
  uptimeSeconds: 4 * 3600 + 1260,
  role: 'viewer',
  capabilities: [],
  limits: { maxStackAmount: 1_000_000, maxUnstackableAmount: 50, maxBatchSize: 50, maxEntities: 20 },
};

export const demoPlayers: OnlinePlayer[] = [{ uid: DEMO_UID, nickname: 'Traveler', adventureRank: 58, worldLevel: 8, sceneId: 3 }];

export const demoPlayer: PlayerSummary = {
  ...demoPlayers[0],
  signature: 'Simulated subject for preview mode',
  position: { x: 2747.6, y: 194.6, z: -1719.4 },
  avatarCount: 6,
  currencies: { primogems: 16_000, mora: 4_200_000, genesisCrystals: 0 },
  inventory: { ITEM_MATERIAL: 412, ITEM_WEAPON: 37, ITEM_RELIQUARY: 186, ITEM_FURNITURE: 24 },
};

const subs = [501201, 501222, 501063, 501233];
const demoWornFlower = { guid: '201', itemId: 44544, slot: 'EQUIP_BRACER', level: 21, mainPropId: 14001, appendPropIds: subs };
const demoWornPlume = { guid: '202', itemId: 44524, slot: 'EQUIP_NECKLACE', level: 21, mainPropId: 12001, appendPropIds: subs };

const talents = (n: number, s: number, b: number, lv: [number, number, number]) => ({
  normal: { skillId: n, level: lv[0] },
  skill: { skillId: s, level: lv[1] },
  burst: { skillId: b, level: lv[2] },
});

export const demoAvatars: OwnedAvatar[] = [
  { avatarId: 10000002, guid: '1', level: 90, promoteLevel: 6, constellation: 2, fetterLevel: 10, talents: talents(10024, 10018, 10019, [9, 9, 10]), weapon: { guid: '101', itemId: 11509, level: 90, promoteLevel: 6, refinement: 1 }, artifacts: [demoWornFlower, demoWornPlume] },
  { avatarId: 10000073, guid: '2', level: 90, promoteLevel: 6, constellation: 0, fetterLevel: 8, talents: talents(10731, 10732, 10735, [6, 10, 9]), weapon: null, artifacts: [] },
  { avatarId: 10000052, guid: '3', level: 80, promoteLevel: 5, constellation: 1, fetterLevel: 10, talents: talents(10521, 10522, 10525, [6, 8, 10]), weapon: { itemId: 13509, level: 90, promoteLevel: 6, refinement: 1 }, artifacts: [] },
  { avatarId: 10000030, guid: '4', level: 90, promoteLevel: 6, constellation: 0, fetterLevel: 10, talents: talents(10301, 10302, 10303, [1, 8, 9]), weapon: null, artifacts: [] },
  { avatarId: 10000032, guid: '5', level: 80, promoteLevel: 5, constellation: 6, fetterLevel: 10, talents: talents(10321, 10322, 10323, [1, 9, 12]), weapon: { itemId: 11401, level: 90, promoteLevel: 6, refinement: 5 }, artifacts: [] },
  { avatarId: 10000025, guid: '6', level: 80, promoteLevel: 5, constellation: 6, fetterLevel: 10, talents: talents(10381, 10382, 10385, [1, 9, 12]), weapon: null, artifacts: [] },
];

const now = Date.now();
export const demoAudit: AuditEntry[] = [
  { timestamp: now - 6 * 60_000, tokenId: 'preview', address: '—', origin: null, action: 'items.give', targetUid: DEMO_UID, params: null, success: true, message: 'simulated' },
  { timestamp: now - 22 * 60_000, tokenId: 'preview', address: '—', origin: null, action: 'avatar.update', targetUid: DEMO_UID, params: null, success: true, message: 'simulated' },
  { timestamp: now - 61 * 60_000, tokenId: 'preview', address: '—', origin: null, action: 'world.teleport', targetUid: DEMO_UID, params: null, success: false, message: 'simulated failure example' },
];

/** SIMULATED inventory for the Character Builder in preview mode (gear that can be equipped or edited). */
export const demoInventory: InventoryItem[] = [
  { guid: '101', itemId: 11509, type: 'ITEM_WEAPON', count: 1, level: 90, refinement: 1, equippedAvatarId: 10000002 },
  { guid: '102', itemId: 11401, type: 'ITEM_WEAPON', count: 1, level: 70, refinement: 3 },
  { guid: '103', itemId: 13509, type: 'ITEM_WEAPON', count: 1, level: 90, refinement: 1, equippedAvatarId: 10000052 },
  { guid: '201', itemId: 44544, type: 'ITEM_RELIQUARY', count: 1, level: 21, slot: 'EQUIP_BRACER', mainPropId: 14001, appendPropIds: subs, equippedAvatarId: 10000002 },
  { guid: '202', itemId: 44524, type: 'ITEM_RELIQUARY', count: 1, level: 21, slot: 'EQUIP_NECKLACE', mainPropId: 12001, appendPropIds: subs, equippedAvatarId: 10000002 },
  { guid: '203', itemId: 44554, type: 'ITEM_RELIQUARY', count: 1, level: 21, slot: 'EQUIP_SHOES', mainPropId: 10004, appendPropIds: subs },
  { guid: '204', itemId: 44514, type: 'ITEM_RELIQUARY', count: 1, level: 17, slot: 'EQUIP_RING', mainPropId: 15004, appendPropIds: subs },
  { guid: '205', itemId: 44534, type: 'ITEM_RELIQUARY', count: 1, level: 21, slot: 'EQUIP_DRESS', mainPropId: 13003, appendPropIds: subs },
];
