/** Shapes of the generated catalog files in public/data (see scripts/build-catalog.mjs). */

export interface Localized {
  en: string;
  th?: string;
  /** No TextMap entry: the name was taken from an internal key. */
  internal?: boolean;
  /** The Thai TextMap has no entry for this text (th is omitted when merely identical to en). */
  noTh?: boolean;
}

export type Element = 'pyro' | 'hydro' | 'anemo' | 'electro' | 'dendro' | 'cryo' | 'geo' | 'multi' | 'none';
export type WeaponType = 'sword' | 'claymore' | 'polearm' | 'bow' | 'catalyst' | 'unknown';
export type Slot = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet';
export const SLOTS: Slot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet'];

export interface SkillRef {
  id: number;
  name: Localized | null;
}

/** Which icon family an entry's image key belongs to; 'none' means the object has no inventory icon. */
export type ImageType = 'avatar-icon' | 'avatar-costume-icon' | 'weapon-icon' | 'relic-icon' | 'item-icon' | 'monster-icon' | 'none';
/** 'own': the key is the entry's own. 'placeholder-art': the game reuses another object's art, so none is shown. */
export type ImageStatus = 'own' | 'placeholder-art' | 'shared-key';
/** From the game's codex tables. */
export type Release = 'released' | 'disused' | 'not-in-codex' | 'traveler';

export interface Character {
  id: number;
  name: Localized;
  /** 'icon': no TextMap name; the name was taken from the internal icon key. */
  nameSource?: 'textmap' | 'icon';
  rarity: number;
  element: Element;
  weapon: WeaponType;
  initialWeapon?: number | null;
  icon: string | null;
  sideIcon?: string | null;
  imageType?: ImageType;
  imageStatus?: ImageStatus;
  release?: Release;
  key: string;
  talents: { normal: SkillRef | null; skill: SkillRef | null; burst: SkillRef | null } | null;
  constellations: { id: number; name: Localized }[];
}

export interface Weapon {
  id: number;
  name: Localized;
  nameSource?: 'textmap' | 'icon';
  rarity: number;
  type: WeaponType;
  icon: string | null;
  awakenIcon?: string | null;
  /** The game's key for a placeholder-art row (not drawn). */
  gameIcon?: string;
  imageType?: ImageType;
  imageStatus?: ImageStatus;
  release?: Release;
  /** Level cap per ascension (index = ascension), from WeaponPromoteExcelConfigData. */
  ascensionCaps?: number[];
  /** 5 when the weapon has a passive (skillAffix), else 1: 1-2 star weapons cannot be refined. */
  maxRefinement?: number;
}

export interface Costume {
  id: number;
  characterId: number;
  itemId: number | null;
  name: Localized | null;
  isDefault: boolean;
  hidden: boolean;
  /** Null for default outfits: they use the character's own icon. */
  icon: string | null;
  sideIcon: string | null;
  imageType: ImageType;
}

export interface ArtifactPieceRow {
  id: number;
  setId: number;
  slot: Slot;
  name: Localized & { internal?: boolean };
  rarity: number;
  icon: string | null;
  imageType: ImageType;
  maxLevel: number;
  mainDepot: number;
  subDepot: number;
  initialSubs: number;
  randomMain: boolean;
  /** The piece the builder offers for its set/slot/rarity. */
  standard: boolean;
}

export interface Furniture {
  id: number;
  name: Localized;
  rarity: number;
  icon: string | null;
  imageType: ImageType;
  stackLimit?: number;
  spawn?: SpawnKind;
  spawnReason?: SpawnReason;
}

/**
 * How the item spawner may give an item (mirrors the bridge's NukvaItemRules; the server's
 * /catalog/items is authoritative when connected). 'unsupported' items carry a spawnReason.
 */
export type SpawnKind = 'stackable' | 'currency' | 'unlock' | 'unsupported';
export type SpawnReason = 'NO_SERVER_HANDLER' | 'CONSUMED_ON_GAIN' | 'USE_CHARACTER_BUILDER' | 'SERVER_REFUSES' | 'ZERO_STACK_LIMIT' | 'NOT_A_COMBAT_WEAPON' | 'NOT_A_SET_PIECE' | 'NO_ITEM_TYPE' | 'UNSUPPORTED_TYPE';

export interface Gadget {
  id: number;
  name: Localized;
  type: string | null;
  key: string | null;
  icon: null;
  imageType: 'none';
}

export type TeleportKind = 'statue' | 'waypoint' | 'domain' | 'virtual' | 'scene-jump' | 'other';
export interface TeleportPoint {
  sceneId: number;
  pointId: number;
  type: string;
  kind: TeleportKind;
  gadgetId: number | null;
  gadgetType: string | null;
  gadgetName: Localized | null;
  areaId: number | null;
  area: Localized | null;
  dungeonIds: number[];
  tranSceneId: number | null;
  pos: { x: number; y: number; z: number };
}

export interface ArtifactPiece {
  id: number;
  name: Localized;
  rarity: number;
  icon: string | null;
  imageType?: ImageType;
  maxLevel: number;
  mainDepot: number;
  subDepot: number;
  initialSubs: number;
}

export interface ArtifactSet {
  id: number;
  name: Localized;
  icon: string | null;
  imageType?: ImageType;
  pieceCount?: number;
  release?: Release;
  bonuses: { pieces: number; text: Localized }[];
  pieces: Partial<Record<Slot, ArtifactPiece[]>>;
  maxRarity: number;
}

export interface ArtifactData {
  sets: ArtifactSet[];
  mainProps: Record<string, { id: number; prop: string }[]>;
  subProps: Record<string, { id: number; prop: string; value: number }[]>;
}

export interface Material {
  id: number;
  name: Localized;
  type: string;
  item: 'material' | 'virtual';
  rarity: number;
  icon: string | null;
  imageType?: ImageType;
  imageStatus?: ImageStatus;
  /** Most of this item a player can hold (null for virtual currencies). */
  stackLimit?: number | null;
  spawn?: SpawnKind;
  spawnReason?: SpawnReason;
  /** false: applied on gain with no stored balance (character / adventure EXP). */
  countable?: false;
}

export interface Monster {
  id: number;
  name: Localized;
  key: string;
  type: string;
  icon: string | null;
  imageType?: ImageType;
  imageStatus?: ImageStatus;
  gameIcon?: string;
}

export interface Scene {
  id: number;
  type: string;
  script: string | null;
  name: Localized | null;
}

export interface CommandInfo {
  label: string;
  aliases: string[];
  usage: string[];
  permission: string;
  permissionTargeted: string;
  targetRequirement: 'NONE' | 'OFFLINE' | 'PLAYER' | 'ONLINE' | string;
  description: string | null;
  threading?: boolean;
  executable?: boolean;
}

export interface CatalogMeta {
  schema: number;
  generatedAt: string;
  gameVersion: string | null;
  source: string;
  counts: Record<string, number>;
  /** Per category: rows in the server tables, rows in the catalog, rows excluded (with reasons). */
  coverage?: Record<string, { sourceRows: number; included: number; excluded: number; excludedReasons: Record<string, number> }>;
}

export interface CatalogFiles {
  meta: CatalogMeta;
  characters: Character[];
  costumes: Costume[];
  weapons: Weapon[];
  artifacts: ArtifactData;
  'artifact-pieces': ArtifactPieceRow[];
  materials: Material[];
  /** Item descriptions, loaded only when an item's details are opened. */
  'material-text': Record<string, Localized>;
  furniture: Furniture[];
  gadgets: Gadget[];
  monsters: Monster[];
  scenes: Scene[];
  teleports: TeleportPoint[];
  commands: CommandInfo[];
}

export type CatalogName = keyof CatalogFiles;
