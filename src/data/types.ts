/** Shapes of the generated catalog files in public/data (see scripts/build-catalog.mjs). */

export interface Localized {
  en: string;
  th?: string;
}

export type Element = 'pyro' | 'hydro' | 'anemo' | 'electro' | 'dendro' | 'cryo' | 'geo' | 'multi' | 'none';
export type WeaponType = 'sword' | 'claymore' | 'polearm' | 'bow' | 'catalyst' | 'unknown';
export type Slot = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet';
export const SLOTS: Slot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet'];

export interface SkillRef {
  id: number;
  name: Localized | null;
}

export interface Character {
  id: number;
  name: Localized;
  rarity: number;
  element: Element;
  weapon: WeaponType;
  icon: string;
  key: string;
  talents: { normal: SkillRef | null; skill: SkillRef | null; burst: SkillRef | null } | null;
  constellations: { id: number; name: Localized }[];
}

export interface Weapon {
  id: number;
  name: Localized;
  rarity: number;
  type: WeaponType;
  icon: string;
}

export interface ArtifactPiece {
  id: number;
  name: Localized;
  rarity: number;
  icon: string;
  maxLevel: number;
  mainDepot: number;
  subDepot: number;
  initialSubs: number;
}

export interface ArtifactSet {
  id: number;
  name: Localized;
  icon: string;
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
  icon: string;
}

export interface Monster {
  id: number;
  name: Localized;
  key: string;
  type: string;
  icon: string | null;
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
}

export interface CatalogFiles {
  meta: CatalogMeta;
  characters: Character[];
  weapons: Weapon[];
  artifacts: ArtifactData;
  materials: Material[];
  monsters: Monster[];
  scenes: Scene[];
  commands: CommandInfo[];
}

export type CatalogName = keyof CatalogFiles;
