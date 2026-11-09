import type { Lang } from '@/stores/settings';

/** Display names for FIGHT_PROP_* stat identifiers used by artifact main/sub stats. */
const LABELS: Record<string, [string, string]> = {
  FIGHT_PROP_HP: ['HP', 'HP'],
  FIGHT_PROP_HP_PERCENT: ['HP%', 'HP%'],
  FIGHT_PROP_ATTACK: ['ATK', 'ATK'],
  FIGHT_PROP_ATTACK_PERCENT: ['ATK%', 'ATK%'],
  FIGHT_PROP_DEFENSE: ['DEF', 'DEF'],
  FIGHT_PROP_DEFENSE_PERCENT: ['DEF%', 'DEF%'],
  FIGHT_PROP_CRITICAL: ['CRIT Rate', 'อัตราคริ'],
  FIGHT_PROP_CRITICAL_HURT: ['CRIT DMG', 'ความแรงคริ'],
  FIGHT_PROP_CHARGE_EFFICIENCY: ['Energy Recharge', 'การฟื้นฟูพลังงาน'],
  FIGHT_PROP_ELEMENT_MASTERY: ['Elemental Mastery', 'ความชำนาญธาตุ'],
  FIGHT_PROP_HEAL_ADD: ['Healing Bonus', 'โบนัสการรักษา'],
  FIGHT_PROP_PHYSICAL_ADD_HURT: ['Physical DMG Bonus', 'โบนัสความเสียหายกายภาพ'],
  FIGHT_PROP_FIRE_ADD_HURT: ['Pyro DMG Bonus', 'โบนัสความเสียหายธาตุไฟ'],
  FIGHT_PROP_WATER_ADD_HURT: ['Hydro DMG Bonus', 'โบนัสความเสียหายธาตุน้ำ'],
  FIGHT_PROP_WIND_ADD_HURT: ['Anemo DMG Bonus', 'โบนัสความเสียหายธาตุลม'],
  FIGHT_PROP_ELEC_ADD_HURT: ['Electro DMG Bonus', 'โบนัสความเสียหายธาตุสายฟ้า'],
  FIGHT_PROP_GRASS_ADD_HURT: ['Dendro DMG Bonus', 'โบนัสความเสียหายธาตุพฤกษา'],
  FIGHT_PROP_ICE_ADD_HURT: ['Cryo DMG Bonus', 'โบนัสความเสียหายธาตุน้ำแข็ง'],
  FIGHT_PROP_ROCK_ADD_HURT: ['Geo DMG Bonus', 'โบนัสความเสียหายธาตุหิน'],
};

export function statName(prop: string, lang: Lang): string {
  const entry = LABELS[prop];
  if (!entry) return prop.replace(/^FIGHT_PROP_/, '').replace(/_/g, ' ').toLowerCase();
  return lang === 'th' ? entry[1] : entry[0];
}

const FLAT = new Set(['FIGHT_PROP_HP', 'FIGHT_PROP_ATTACK', 'FIGHT_PROP_DEFENSE', 'FIGHT_PROP_ELEMENT_MASTERY']);

export function formatStatValue(prop: string, value: number): string {
  if (FLAT.has(prop)) return Math.round(value).toLocaleString();
  return `${(value * 100).toFixed(1)}%`;
}
