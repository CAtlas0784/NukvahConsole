#!/usr/bin/env node
/**
 * Generates the Nukvah Console catalog (public/data/*.json) from the SnezhnayaCore server's own
 * resource files, so IDs and names match exactly what the server loads.
 *
 *   node scripts/build-catalog.mjs [--server ../SnezhnayaCore] [--resources <server>/resources]
 *
 * Inputs (read-only):
 *   resources/ExcelBinOutput/*.json      item/avatar/weapon/artifact/monster/scene/gadget definitions
 *   resources/TextMap/TextMap{EN,TH}*    names
 *   resources/BinOutput/Scene/Point/*    teleport points (7.x files use obfuscated keys; the mapping
 *                                        is scripts/point-keys.json, derived by derive-point-keys.mjs)
 *   src/main/java/.../command/commands   @Command annotations (command reference)
 *
 * Rules:
 *   - Every row of every source table is either in a catalog file or in excluded.json with a reason.
 *     Nothing is dropped silently.
 *   - Entries are identified by the game's numeric id. Names are display only.
 *   - An entry's image key is the icon field of its OWN row (no name matching). imageType says which
 *     icon family it is. Default artwork never comes from a costume row.
 *
 * No images are copied: artwork stays out of the public bundle (see docs/DATA_PROVENANCE.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const serverDir = path.resolve(root, args.server ?? '../SnezhnayaCore');
const resDir = path.resolve(args.resources ?? path.join(serverDir, 'resources'));
const excelDir = path.join(resDir, 'ExcelBinOutput');
const textDir = path.join(resDir, 'TextMap');
const pointDir = path.join(resDir, 'BinOutput', 'Scene', 'Point');
const outDir = path.join(root, 'public', 'data');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const excel = (name) => readJson(path.join(excelDir, `${name}.json`));

function loadTextMap(lang) {
  const map = new Map();
  const files = fs
    .readdirSync(textDir)
    .filter((f) => new RegExp(`^TextMap(_Medium)?${lang}(_\\d+)?\\.json$`).test(f))
    .sort();
  for (const f of files) {
    const data = readJson(path.join(textDir, f));
    for (const [k, v] of Object.entries(data)) if (!map.has(k) && typeof v === 'string' && v.trim()) map.set(k, v);
  }
  console.log(`  TextMap ${lang}: ${files.length} file(s), ${map.size} entries`);
  return map;
}

console.log(`Server:    ${serverDir}\nResources: ${resDir}`);
const EN = loadTextMap('EN');
const TH = loadTextMap('TH');

const clean = (s) => (s ? s.replace(/<[^>]+>/g, '').replace(/\{[A-Z_#]+[^}]*\}/g, '').replace(/\\n/g, ' ').trim() : undefined);
const name = (hash) => {
  if (hash === undefined || hash === null) return null;
  const en = clean(EN.get(String(hash)));
  if (!en) return null;
  const th = clean(TH.get(String(hash)));
  // th omitted when identical to en (common for proper names); noTh marks a genuinely missing entry.
  return th ? (th !== en ? { en, th } : { en }) : { en, noTh: true };
};

// Rows that have no TextMap entry: shown with the internal name from their icon, marked internal.
const iconName = (icon, prefix) => {
  if (!icon) return null;
  const raw = icon.replace(prefix, '').split('_').pop();
  return raw ? { en: raw.replace(/([a-z])([A-Z])/g, '$1 $2'), internal: true } : null;
};

/** Icon keys the asset pipeline accepts (same pattern as the dev server's /game-assets route). */
const ICON_KEY = /^UI_[A-Za-z0-9_]+$/;
const iconOrNull = (icon) => (typeof icon === 'string' && ICON_KEY.test(icon) ? icon : null);

const excluded = [];
const exclude = (category, id, reason, extra = {}) => excluded.push({ category, id, reason, ...extra });
const sourceRows = {};

const ELEMENTS = { Fire: 'pyro', Water: 'hydro', Wind: 'anemo', Electric: 'electro', Grass: 'dendro', Ice: 'cryo', Rock: 'geo' };
const WEAPONS = {
  WEAPON_SWORD_ONE_HAND: 'sword',
  WEAPON_CLAYMORE: 'claymore',
  WEAPON_POLE: 'polearm',
  WEAPON_BOW: 'bow',
  WEAPON_CATALYST: 'catalyst',
};
const WEAPON_ID_DIGIT = { sword: 1, claymore: 2, polearm: 3, catalyst: 4, bow: 5 };

// ---------------------------------------------------------------- characters
const skills = new Map(excel('AvatarSkillExcelConfigData').map((s) => [s.id, s]));
const depots = new Map(excel('AvatarSkillDepotExcelConfigData').map((d) => [d.id, d]));
const talents = new Map(excel('AvatarTalentExcelConfigData').map((t) => [t.talentId ?? t.id, t]));
const weaponRows = excel('WeaponExcelConfigData');
const weaponById = new Map(weaponRows.map((w) => [w.id, w]));

const avatarRows = excel('AvatarExcelConfigData');
sourceRows.characters = avatarRows.length;
const characters = [];
for (const a of avatarRows) {
  if (a.useType !== 'AVATAR_FORMAL') {
    // 1100xxxx trial/test copies and abandoned rows: not playable.
    exclude('characters', a.id, `useType ${a.useType ?? 'none'}`, { icon: a.iconName ?? null });
    continue;
  }
  // Same exclusion range the server's own `give avatars` uses (UGC / test avatars).
  if (a.id < 10000002 || a.id >= 10000900) {
    exclude('characters', a.id, 'formal but outside the playable id range (UGC/test)', { icon: a.iconName ?? null });
    continue;
  }
  const textName = name(a.nameTextMapHash);
  const n = textName ?? iconName(a.iconName, 'UI_AvatarIcon_');
  if (!n) {
    exclude('characters', a.id, 'no name and no icon');
    continue;
  }
  const depot = depots.get(a.skillDepotId);
  const isTraveler = (a.candSkillDepotIds ?? []).length > 0;
  const energy = depot ? skills.get(depot.energySkill) : undefined;
  const element = isTraveler ? 'multi' : ELEMENTS[energy?.costElemType] ?? 'none';
  const skillInfo = (id) => (id && skills.get(id) ? { id, name: name(skills.get(id).nameTextMapHash) } : null);
  const cons = (depot?.talents ?? [])
    .filter(Boolean)
    .map((id, i) => ({ id, name: name(talents.get(id)?.nameTextMapHash) ?? { en: `C${i + 1}`, internal: true } }));
  characters.push({
    id: a.id,
    name: n,
    nameSource: textName ? 'textmap' : 'icon',
    rarity: a.qualityType?.startsWith('QUALITY_ORANGE') ? 5 : 4,
    element,
    weapon: WEAPONS[a.weaponType] ?? 'unknown',
    initialWeapon: a.initialWeapon ?? null,
    icon: iconOrNull(a.iconName),
    sideIcon: iconOrNull(a.sideIconName),
    imageType: 'avatar-icon',
    key: a.iconName?.replace('UI_AvatarIcon_', '') ?? '',
    talents:
      depot && !isTraveler
        ? { normal: skillInfo(depot.skills?.[0]), skill: skillInfo(depot.skills?.[1]), burst: skillInfo(depot.energySkill) }
        : null,
    constellations: isTraveler ? [] : cons,
  });
}
const avatarCodex = new Set(excel('AvatarCodexExcelConfigData').map((r) => r.avatarId));
for (const c of characters) {
  const traveler = (avatarRows.find((a) => a.id === c.id)?.candSkillDepotIds ?? []).length > 0;
  // The travelers are never codex entries; other rows absent from the codex are flagged for review.
  c.release = avatarCodex.has(c.id) ? 'released' : traveler ? 'traveler' : 'not-in-codex';
  c.imageStatus = 'own';
}
characters.sort((x, y) => y.rarity - x.rarity || x.name.en.localeCompare(y.name.en) || x.id - y.id);

// ---------------------------------------------------------------- costumes (skins)
const costumeRows = excel('AvatarCostumeExcelConfigData');
sourceRows.costumes = costumeRows.length;
const playableIds = new Set(characters.map((c) => c.id));
const costumes = [];
for (const c of costumeRows) {
  const id = c.skinId ?? c.costumeId;
  if (!playableIds.has(c.characterId)) {
    exclude('costumes', id, `character ${c.characterId} is not a playable character`);
    continue;
  }
  costumes.push({
    id,
    characterId: c.characterId,
    itemId: c.itemId || null,
    // Rows without TextMap text (e.g. the 7.2 characters' default outfits) get a marked internal label.
    name:
      name(c.nameTextMapHash) ??
      (c.isDefault
        ? { en: `${characters.find((x) => x.id === c.characterId)?.name.en ?? c.characterId} (default outfit)`, internal: true }
        : { en: c.jsonName || `Costume ${id}`, internal: true }),
    isDefault: Boolean(c.isDefault),
    hidden: Boolean(c.hide),
    // Default outfits have no icon of their own: they use the character's own icon.
    icon: c.isDefault ? null : iconOrNull(c.frontIconName),
    sideIcon: c.isDefault ? null : iconOrNull(c.sideIconName),
    imageType: 'avatar-costume-icon',
  });
}
costumes.sort((a, b) => a.characterId - b.characterId || a.id - b.id);

// ---------------------------------------------------------------- weapons
sourceRows.weapons = weaponRows.length;
const weapons = [];
// Level cap per ascension from WeaponPromoteExcelConfigData (1-2 star weapons stop at 70).
const weaponCapsById = new Map();
for (const p of excel('WeaponPromoteExcelConfigData')) {
  const caps = weaponCapsById.get(p.weaponPromoteId) ?? weaponCapsById.set(p.weaponPromoteId, []).get(p.weaponPromoteId);
  caps[p.promoteLevel ?? 0] = p.unlockMaxLevel;
}
for (const w of weaponRows) {
  const type = WEAPONS[w.weaponType];
  if (!type) {
    exclude('weapons', w.id, `weaponType ${w.weaponType} is not a combat weapon`, { icon: w.icon ?? null });
    continue;
  }
  // Combat weapons are numbered 1TXXX with T = 1 sword, 2 claymore, 3 polearm, 4 catalyst, 5 bow.
  if (Math.floor(w.id / 1000) !== 10 + WEAPON_ID_DIGIT[type]) {
    if (!/Template$/.test(w.icon ?? '')) {
      exclude('weapons', w.id, `id ${w.id} is outside the ${type} range ${10 + WEAPON_ID_DIGIT[type]}xxx (utility row, e.g. fishing rod)`, { icon: w.icon ?? null });
      continue;
    }
  }
  if (/Template$/.test(w.icon ?? '')) {
    exclude('weapons', w.id, 'template weapon (icon *_Template)', { icon: w.icon });
    continue;
  }
  const textName = name(w.nameTextMapHash);
  const n = textName ?? iconName(w.icon, 'UI_EquipIcon_');
  if (!n || !w.icon) {
    exclude('weapons', w.id, 'no name and no icon');
    continue;
  }
  weapons.push({
    id: w.id,
    name: n,
    nameSource: textName ? 'textmap' : 'icon',
    rarity: w.rankLevel,
    type,
    icon: iconOrNull(w.icon),
    awakenIcon: iconOrNull(w.awakenIcon),
    imageType: 'weapon-icon',
    ascensionCaps: (weaponCapsById.get(w.weaponPromoteId) ?? []).filter((x) => x != null),
    // Refinement needs a passive (skillAffix); 1-2 star weapons have none.
    maxRefinement: (w.skillAffix ?? []).some((a) => a) ? 5 : 1,
  });
}
// Release status from the game's own codex: released (listed, not disused), disused, or absent.
const weaponCodex = new Map(excel('WeaponCodexExcelConfigData').map((r) => [r.weaponId, r]));
for (const w of weapons) {
  const c = weaponCodex.get(w.id);
  w.release = !c ? 'not-in-codex' : c.isDisuse ? 'disused' : 'released';
}
/**
 * Image identity for shared icon keys. Several unreleased rows reuse a starter weapon's icon as
 * placeholder art (e.g. 11506 uses UI_EquipIcon_Sword_Blunt, the Dull Blade's). A key shared by
 * weapons with DIFFERENT name hashes belongs only to its released owner(s); the other rows get
 * imageStatus "placeholder-art" and the UI shows the missing-image placeholder for them. Rows with
 * the same name hash are variants of one weapon and keep the image.
 */
for (const field of ['icon', 'awakenIcon']) {
  const groups = new Map();
  for (const w of weapons) if (w[field]) (groups.get(w[field]) ?? groups.set(w[field], []).get(w[field])).push(w);
  for (const list of groups.values()) {
    // Same object = same name hash, or the same resolved text (quest variants such as 11419/11421
    // carry different hashes with identical names). This only stops a false downgrade; it never
    // chooses an image: every key still comes from the row's own icon field.
    const hashes = new Set(list.map((w) => weaponById.get(w.id)?.nameTextMapHash));
    const texts = new Set(list.map((w) => (w.nameSource === 'textmap' ? w.name.en : `#${w.id}`)));
    if (hashes.size <= 1 || texts.size <= 1) continue;
    const owners = list.filter((w) => w.release === 'released');
    for (const w of list) if (!owners.includes(w)) w.imageStatus = 'placeholder-art';
  }
}
for (const w of weapons) {
  w.imageStatus ??= 'own';
  if (w.imageStatus === 'placeholder-art') {
    // Keep the game's key for transparency, but give the UI nothing to draw: it shows the
    // explicit missing-image placeholder instead of another weapon's picture.
    w.gameIcon = w.icon;
    w.icon = null;
    w.awakenIcon = null;
  }
}
weapons.sort((x, y) => y.rarity - x.rarity || x.id - y.id);

// ---------------------------------------------------------------- artifacts
const affixGroups = new Map();
for (const e of excel('EquipAffixExcelConfigData')) {
  if (!affixGroups.has(e.id)) affixGroups.set(e.id, []);
  affixGroups.get(e.id).push(e);
}
const SLOTS = { EQUIP_BRACER: 'flower', EQUIP_NECKLACE: 'plume', EQUIP_SHOES: 'sands', EQUIP_RING: 'goblet', EQUIP_DRESS: 'circlet' };
/** The game's own icon suffix for each slot (checked against every row by validate-catalog). */
export const SLOT_ICON_SUFFIX = { flower: 4, plume: 2, sands: 5, goblet: 1, circlet: 3 };
const setRows = excel('ReliquarySetExcelConfigData');
sourceRows.artifactSets = setRows.length;
const setMeta = new Map();
for (const s of setRows) {
  const group = (affixGroups.get(s.equipAffixId) ?? []).sort((a, b) => a.level - b.level);
  const n = name(group[0]?.nameTextMapHash);
  if (!n) {
    exclude('artifactSets', s.setId, 'set has no named set bonus');
    continue;
  }
  setMeta.set(s.setId, {
    id: s.setId,
    name: n,
    icon: iconOrNull(s.setIcon),
    imageType: 'relic-icon',
    bonuses: group.map((g, i) => ({ pieces: s.setNeedNum?.[i] ?? null, text: name(g.descTextMapHash) })).filter((b) => b.pieces && b.text),
    pieces: {},
    pieceCount: 0,
  });
}
// Depot sizes, so the standard (randomisable) piece wins over fixed-stat event variants.
const mainDepotSize = new Map();
for (const m of excel('ReliquaryMainPropExcelConfigData')) mainDepotSize.set(m.propDepotId, (mainDepotSize.get(m.propDepotId) ?? 0) + 1);
const subDepotSize = new Map();
for (const a of excel('ReliquaryAffixExcelConfigData')) subDepotSize.set(a.depotId, (subDepotSize.get(a.depotId) ?? 0) + 1);
const pieceScore = (r) => (mainDepotSize.get(r.mainPropDepotId) ?? 0) * 10_000 + (subDepotSize.get(r.appendPropDepotId) ?? 0) * 10 + r.appendPropNum;

const relicRows = excel('ReliquaryExcelConfigData');
sourceRows.artifactPieces = relicRows.length;
const artifactPieces = [];
const pieceCandidates = new Map();
for (const r of relicRows) {
  const slot = SLOTS[r.equipType];
  if (!slot) {
    exclude('artifactPieces', r.id, `equipType ${r.equipType} is not an artifact slot`);
    continue;
  }
  const set = setMeta.get(r.setId);
  if (!r.setId) {
    exclude('artifactPieces', r.id, 'piece belongs to no set', { icon: r.icon ?? null });
    continue;
  }
  if (!set) {
    exclude('artifactPieces', r.id, `set ${r.setId} is excluded (see artifactSets)`, { icon: r.icon ?? null });
    continue;
  }
  const n = name(r.nameTextMapHash);
  const piece = {
    id: r.id,
    setId: r.setId,
    slot,
    name: n ?? { en: `${set.name.en} (${slot})`, internal: true },
    rarity: r.rankLevel,
    icon: iconOrNull(r.icon),
    imageType: 'relic-icon',
    maxLevel: r.maxLevel,
    mainDepot: r.mainPropDepotId,
    subDepot: r.appendPropDepotId,
    initialSubs: r.appendPropNum,
    randomMain: (mainDepotSize.get(r.mainPropDepotId) ?? 0) > 1,
  };
  artifactPieces.push(piece);
  set.pieceCount++;
  const key = `${r.setId}:${slot}:${r.rankLevel}`;
  const prev = pieceCandidates.get(key);
  const better = !prev || pieceScore(r) > pieceScore(prev.row) || (pieceScore(r) === pieceScore(prev.row) && r.id < prev.row.id);
  if (better) pieceCandidates.set(key, { row: r, piece });
}
const standardIds = new Set([...pieceCandidates.values()].map((c) => c.piece.id));
for (const p of artifactPieces) p.standard = standardIds.has(p.id);
for (const { piece } of pieceCandidates.values()) {
  const set = setMeta.get(piece.setId);
  set.pieces[piece.slot] ??= [];
  set.pieces[piece.slot].push({
    id: piece.id,
    name: piece.name,
    rarity: piece.rarity,
    icon: piece.icon,
    imageType: 'relic-icon',
    maxLevel: piece.maxLevel,
    mainDepot: piece.mainDepot,
    subDepot: piece.subDepot,
    initialSubs: piece.initialSubs,
  });
}
const relicCodex = new Map(excel('ReliquaryCodexExcelConfigData').map((r) => [r.suitId, r]));
const artifactSets = [];
for (const s of setMeta.values()) {
  const codexRows = [...relicCodex.values()].filter((r) => r.suitId === s.id);
  s.release = codexRows.length === 0 ? 'not-in-codex' : codexRows.every((r) => r.isDisuse) ? 'disused' : 'released';
  if (Object.keys(s.pieces).length === 0) {
    exclude('artifactSets', s.id, 'set has no artifact pieces in ReliquaryExcelConfigData');
    continue;
  }
  const maxRarity = Math.max(...Object.values(s.pieces).flat().map((p) => p.rarity));
  for (const list of Object.values(s.pieces)) list.sort((a, b) => b.rarity - a.rarity);
  artifactSets.push({ ...s, maxRarity });
}
artifactSets.sort((a, b) => b.maxRarity - a.maxRarity || a.name.en.localeCompare(b.name.en) || a.id - b.id);
artifactPieces.sort((a, b) => a.id - b.id);

const mainProps = {};
// *_SUB_HURT (elemental resistance) rows exist in the Sands depot but never roll in the game.
for (const m of excel('ReliquaryMainPropExcelConfigData')) {
  if (m.propType.endsWith('_SUB_HURT')) continue;
  (mainProps[m.propDepotId] ??= []).push({ id: m.id, prop: m.propType });
}
const subProps = {};
for (const a of excel('ReliquaryAffixExcelConfigData')) (subProps[a.depotId] ??= []).push({ id: a.id, prop: a.propType, value: a.propValue });
for (const list of Object.values(subProps)) list.sort((a, b) => a.prop.localeCompare(b.prop) || a.value - b.value);

// ---------------------------------------------------------------- materials (incl. virtual items)
const materialRows = excel('MaterialExcelConfigData');
sourceRows.materials = materialRows.length;
const materials = [];
/**
 * Spawn policy: the same rules as the bridge's NukvaItemRules (server truth in connected mode via
 * /catalog/items). It mirrors what the server's Inventory does with the item: Inventory.putItem,
 * addVirtualItem and InventorySystem.useItemDirect. Material types the server's MaterialType enum
 * does not know load as null there, so they are read from that enum here too.
 */
const SERVER_MATERIAL_TYPES = new Set(
  fs.readFileSync(path.join(serverDir, 'src/main/java/emu/grasscutter/game/inventory/MaterialType.java'), 'utf8').match(/MATERIAL_[A-Z_]+(?=\()/g),
);
const HANDLED_VIRTUAL = new Set([101, 102, 105, 106, 107, 121, 201, 202, 203, 204]);
const COUNTABLE_VIRTUAL = new Set([106, 107, 201, 202, 203, 204]);
const flycloakIds = new Set(excel('AvatarFlycloakExcelConfigData').map((f) => f.flycloakId ?? f.BMHJMHKFHCC));
const costumeIds = new Set(excel('AvatarCostumeExcelConfigData').map((c) => c.skinId ?? c.costumeId));
const UNLOCK_OPS = { MATERIAL_NAMECARD: 'ITEM_USE_GAIN_NAME_CARD', MATERIAL_FLYCLOAK: 'ITEM_USE_GAIN_FLYCLOAK', MATERIAL_COSTUME: 'ITEM_USE_GAIN_COSTUME' };
function unlockTarget(m, op) {
  const use = (m.itemUse ?? []).find((u) => u.useOp === op);
  if (!use) return -1;
  if (op === 'ITEM_USE_GAIN_NAME_CARD') return m.id;
  const id = Number.parseInt(String(use.useParam?.[0] ?? '').trim(), 10);
  if (!Number.isFinite(id)) return -1;
  if (op === 'ITEM_USE_GAIN_FLYCLOAK' && !flycloakIds.has(id)) return -1;
  if (op === 'ITEM_USE_GAIN_COSTUME' && !costumeIds.has(id)) return -1;
  return id;
}
function spawnPolicy(m) {
  if (m.itemType === 'ITEM_VIRTUAL') {
    if (!HANDLED_VIRTUAL.has(m.id)) return { kind: 'unsupported', reason: 'NO_SERVER_HANDLER' };
    return { kind: 'currency', countable: COUNTABLE_VIRTUAL.has(m.id) };
  }
  const material = SERVER_MATERIAL_TYPES.has(m.materialType) ? m.materialType : null;
  if (m.useOnGain) {
    if (material === 'MATERIAL_AVATAR') return { kind: 'unsupported', reason: 'USE_CHARACTER_BUILDER' };
    const op = material && UNLOCK_OPS[material];
    if (!op || unlockTarget(m, op) <= 0) return { kind: 'unsupported', reason: 'CONSUMED_ON_GAIN' };
    return { kind: 'unlock' };
  }
  if (['MATERIAL_AVATAR', 'MATERIAL_FLYCLOAK', 'MATERIAL_COSTUME', 'MATERIAL_NAMECARD'].includes(material)) return { kind: 'unsupported', reason: 'SERVER_REFUSES' };
  if ((m.stackLimit ?? 1) <= 0) return { kind: 'unsupported', reason: 'ZERO_STACK_LIMIT' };
  return { kind: 'stackable' };
}
const materialText = {};
for (const m of materialRows) {
  const n = name(m.nameTextMapHash);
  if (!n) {
    exclude('materials', m.id, 'no TextMap name', { type: m.materialType ?? null, icon: m.icon ?? null });
    continue;
  }
  const policy = spawnPolicy(m);
  const desc = name(m.descTextMapHash);
  if (desc && !desc.internal) materialText[m.id] = desc.th ? { en: desc.en, th: desc.th } : { en: desc.en };
  materials.push({
    id: m.id,
    name: n,
    type: (m.materialType ?? 'MATERIAL_NONE').replace(/^MATERIAL_/, ''),
    item: m.itemType === 'ITEM_VIRTUAL' ? 'virtual' : 'material',
    rarity: m.rankLevel ?? 0,
    icon: iconOrNull(m.icon),
    imageType: 'item-icon',
    // ItemData defaults a missing stackLimit to 1.
    stackLimit: m.itemType === 'ITEM_VIRTUAL' ? null : Math.max(0, m.stackLimit ?? 1),
    spawn: policy.kind,
    ...(policy.reason ? { spawnReason: policy.reason } : {}),
    ...(policy.countable === false ? { countable: false } : {}),
  });
}
materials.sort((a, b) => a.id - b.id);

// ---------------------------------------------------------------- furniture (ITEM_FURNITURE)
const furnitureRows = excel('HomeWorldFurnitureExcelConfigData');
sourceRows.furniture = furnitureRows.length;
const furniture = [];
for (const f of furnitureRows) {
  const n = name(f.nameTextMapHash);
  if (!n) {
    exclude('furniture', f.id, 'no TextMap name', { icon: f.itemIcon ?? f.icon ?? null });
    continue;
  }
  const policy = spawnPolicy(f);
  furniture.push({ id: f.id, name: n, rarity: f.rankLevel ?? 0, icon: iconOrNull(f.itemIcon ?? f.icon), imageType: 'item-icon', stackLimit: Math.max(0, f.stackLimit ?? 1), spawn: policy.kind, ...(policy.reason ? { spawnReason: policy.reason } : {}) });
}
furniture.sort((a, b) => a.id - b.id);

// ---------------------------------------------------------------- gadgets (world objects; no inventory icon)
const gadgetRows = excel('GadgetExcelConfigData');
sourceRows.gadgets = gadgetRows.length;
const gadgetById = new Map(gadgetRows.map((g) => [g.id, g]));
const gadgets = [];
for (const g of gadgetRows) {
  const n = name(g.nameTextMapHash) ?? name(g.interactNameTextMapHash);
  if (!n) {
    exclude('gadgets', g.id, 'no TextMap name', { type: g.type ?? null, key: g.jsonName || null });
    continue;
  }
  gadgets.push({ id: g.id, name: n, type: g.type ?? null, key: g.jsonName || null, icon: null, imageType: 'none' });
}
gadgets.sort((a, b) => a.id - b.id);

// ---------------------------------------------------------------- monsters
const describes = new Map(excel('MonsterDescribeExcelConfigData').map((d) => [d.id, d]));
const monsterRows = excel('MonsterExcelConfigData');
sourceRows.monsters = monsterRows.length;
const monsters = [];
for (const m of monsterRows) {
  const d = describes.get(m.describeId);
  const n = name(d?.nameTextMapHash) ?? name(m.nameTextMapHash);
  if (!n) {
    exclude('monsters', m.id, 'no TextMap name', { key: m.monsterName ?? null });
    continue;
  }
  monsters.push({
    id: m.id,
    name: n,
    key: m.monsterName,
    type: (m.type ?? 'MONSTER_ORDINARY').replace(/^MONSTER_/, '').toLowerCase(),
    icon: iconOrNull(d?.icon),
    imageType: 'monster-icon',
  });
}
monsters.sort((a, b) => a.id - b.id);

/**
 * Shared image keys outside weapons (weapons have their own codex-based rule above).
 *  - Monsters: a key used by monsters with different names (e.g. the Pyro Slime icon on "Hydro
 *    Hypostasis Summon", a Kairagi icon on "Spirit of Omen: Pyro Scorpion") is kept only by its owner,
 *    the lowest id using it; the rest get placeholder-art (icon null, gameIcon kept).
 *  - Materials and furniture: the game deliberately reuses art across item variants (blueprints,
 *    food qualities, currency variants). The row's own key is kept, but marked "shared-key" so the
 *    reuse is visible in reports and can be tightened later.
 */
const sharedKeyGroups = (list) => {
  const groups = new Map();
  for (const e of list) if (e.icon) (groups.get(e.icon) ?? groups.set(e.icon, []).get(e.icon)).push(e);
  return [...groups.values()].filter((g) => new Set(g.map((e) => e.name.en)).size > 1);
};
for (const group of sharedKeyGroups(monsters)) {
  const owner = group.reduce((a, b) => (a.id < b.id ? a : b));
  for (const m of group) {
    if (m.name.en === owner.name.en) continue;
    m.imageStatus = 'placeholder-art';
    m.gameIcon = m.icon;
    m.icon = null;
  }
}
for (const list of [materials, furniture]) for (const group of sharedKeyGroups(list)) for (const e of group) e.imageStatus = 'shared-key';
for (const list of [monsters, materials, furniture]) for (const e of list) e.imageStatus ??= 'own';

// ---------------------------------------------------------------- scenes
const dungeonNames = new Map();
for (const d of excel('DungeonExcelConfigData')) {
  const n = name(d.displayNameTextMapHash) ?? name(d.nameTextMapHash);
  if (n && !dungeonNames.has(d.sceneId)) dungeonNames.set(d.sceneId, n);
}
const sceneRows = excel('SceneExcelConfigData');
sourceRows.scenes = sceneRows.length;
const scenes = sceneRows
  .map((s) => ({
    id: s.id,
    type: (s.type ?? 'SCENE_NONE').replace(/^SCENE_/, '').toLowerCase(),
    script: s.scriptData || null,
    name: dungeonNames.get(s.id) ?? null,
  }))
  .sort((a, b) => a.id - b.id);

// ---------------------------------------------------------------- teleport points
const pointKeys = readJson(path.join(here, 'point-keys.json'));
const acceptedKey = (entry) => (entry?.accepted ? entry.key : null);
const containerKeys = [pointKeys.plainAliases.container, acceptedKey(pointKeys.container)].filter(Boolean);
const fieldKeys = Object.fromEntries(
  Object.entries(pointKeys.fields).map(([f, v]) => [f, [pointKeys.plainAliases.fields[f], acceptedKey(v)].filter(Boolean)]),
);
const typeByKey = new Map();
for (const [type, v] of Object.entries(pointKeys.types)) for (const k of v.keys ?? []) typeByKey.set(k.key, type);
const TELEPORT_TYPES = new Set(['SceneTransPoint', 'VirtualTransPoint', 'DungeonEntry', 'PersonalSceneJumpPoint']);
const pick = (obj, field) => {
  for (const k of fieldKeys[field] ?? []) if (obj[k] !== undefined) return obj[k];
  return undefined;
};
const vec = (v) => (v && typeof v === 'object' ? { x: Number(v.x ?? v._x ?? 0), y: Number(v.y ?? v._y ?? 0), z: Number(v.z ?? v._z ?? 0) } : null);
const areaNames = new Map();
for (const w of excel('WorldAreaConfigData')) {
  if (w.areaType !== 'LEVEL_1') continue;
  const n = name(w.areaNameTextMapHash);
  if (n) areaNames.set(`${w.sceneID}:${w.areaID1}`, n);
}
const teleports = [];
const pointStats = { files: 0, points: 0, unknownType: 0, noContainer: 0 };
if (fs.existsSync(pointDir)) {
  for (const file of fs.readdirSync(pointDir).filter((f) => /^scene\d+_point\.json$/.test(f))) {
    const sceneId = Number(file.match(/^scene(\d+)_/)[1]);
    let data;
    try {
      data = readJson(path.join(pointDir, file));
    } catch {
      continue;
    }
    if (!data || Array.isArray(data)) continue;
    const container = containerKeys.map((k) => data[k]).find((c) => c && typeof c === 'object' && !Array.isArray(c));
    pointStats.files++;
    if (!container) {
      pointStats.noContainer++;
      continue;
    }
    for (const [pointId, p] of Object.entries(container)) {
      pointStats.points++;
      const type = typeByKey.get(p.$type) ?? (TELEPORT_TYPES.has(p.$type) ? p.$type : null);
      if (!type) {
        pointStats.unknownType++;
        continue;
      }
      if (!TELEPORT_TYPES.has(type)) continue;
      const pos = vec(pick(p, 'pos'));
      const tranPos = vec(pick(p, 'tranPos'));
      const target = tranPos && (tranPos.x || tranPos.y || tranPos.z) ? tranPos : pos;
      if (!target) continue;
      const gadgetId = pick(p, 'gadgetId') ?? null;
      const gadget = gadgetId ? gadgetById.get(gadgetId) : null;
      const areaId = pick(p, 'areaId') ?? null;
      // Kind comes from the point type and its gadget's type field, never from a name.
      const kind =
        type === 'DungeonEntry'
          ? 'domain'
          : type === 'VirtualTransPoint'
            ? 'virtual'
            : type === 'PersonalSceneJumpPoint'
              ? 'scene-jump'
              : gadget?.type === 'TransPointFirst'
                ? 'statue'
                : gadget?.type === 'TransPointSecond'
                  ? 'waypoint'
                  : 'other';
      teleports.push({
        sceneId,
        pointId: Number(pointId),
        type,
        kind,
        gadgetId,
        gadgetType: gadget?.type ?? null,
        gadgetName: gadget ? name(gadget.nameTextMapHash) : null,
        areaId,
        area: areaId ? areaNames.get(`${sceneId}:${areaId}`) ?? null : null,
        dungeonIds: pick(p, 'dungeonIds') ?? [],
        tranSceneId: pick(p, 'tranSceneId') ?? null,
        pos: target,
      });
    }
  }
}
teleports.sort((a, b) => a.sceneId - b.sceneId || a.pointId - b.pointId);
console.log(`  points: ${JSON.stringify(pointStats)}, teleport-type points ${teleports.length}`);

// ---------------------------------------------------------------- commands (source snapshot)
const cmdDir = path.join(serverDir, 'src/main/java/emu/grasscutter/command/commands');
const lang = readJson(path.join(serverDir, 'src/main/resources/languages/en-US.json'));
const strList = (src) => (src ? [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"')) : []);
const field = (body, key) => {
  const arr = body.match(new RegExp(`\\b${key}\\s*=\\s*\\{([\\s\\S]*?)\\}`));
  if (arr) return strList(arr[1]);
  const single = body.match(new RegExp(`\\b${key}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`));
  return single ? strList(single[1]) : [];
};
const commands = [];
for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith('.java')).sort()) {
  const src = fs.readFileSync(path.join(cmdDir, file), 'utf8');
  const m = src.match(/@Command\s*\(([\s\S]*?)\)\s*(?:@\w+\s*)*public\s+(?:final\s+)?class/);
  if (!m) continue;
  const body = m[1];
  const label = field(body, 'label')[0];
  if (!label) continue;
  const tr = body.match(/targetRequirement\s*=\s*(?:Command\.)?TargetRequirement\.(\w+)/)?.[1] ?? 'ONLINE';
  const desc = lang?.commands?.[label]?.description;
  commands.push({
    label,
    aliases: field(body, 'aliases'),
    usage: field(body, 'usage'),
    permission: field(body, 'permission')[0] ?? '',
    permissionTargeted: field(body, 'permissionTargeted')[0] ?? '',
    targetRequirement: tr,
    description: typeof desc === 'string' && desc.trim() ? desc : null,
    threading: /threading\s*=\s*true/.test(body),
  });
}
commands.sort((a, b) => a.label.localeCompare(b.label));

// ---------------------------------------------------------------- write
excluded.sort((a, b) => a.category.localeCompare(b.category) || a.id - b.id);
const version = fs.readFileSync(path.join(serverDir, 'src/main/java/emu/grasscutter/GameConstants.java'), 'utf8').match(/VERSION\s*=\s*"([^"]+)"/)?.[1];
const out = {
  characters,
  costumes,
  weapons,
  artifacts: { sets: artifactSets, mainProps, subProps },
  'artifact-pieces': artifactPieces,
  materials,
  'material-text': materialText,
  furniture,
  gadgets,
  monsters,
  scenes,
  teleports,
  commands,
};
fs.mkdirSync(outDir, { recursive: true });
for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(outDir, `${k}.json`), JSON.stringify(v));
// The full exclusion list (mostly unnamed gadgets) is a report, not part of the public bundle.
const reportDir = path.join(root, 'reports', 'catalog');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'excluded.json'), JSON.stringify(excluded, null, 1));

const excludedBy = (cat) => excluded.filter((e) => e.category === cat).length;
const included = {
  characters: characters.length,
  costumes: costumes.length,
  weapons: weapons.length,
  artifactSets: artifactSets.length,
  artifactPieces: artifactPieces.length,
  materials: materials.length,
  furniture: furniture.length,
  gadgets: gadgets.length,
  monsters: monsters.length,
  scenes: scenes.length,
};
const meta = {
  schema: 2,
  generatedAt: new Date().toISOString(),
  gameVersion: version ?? null,
  source: 'SnezhnayaCore resources (ExcelBinOutput + TextMap + BinOutput/Scene/Point) and command sources',
  counts: { ...included, teleports: teleports.length, commands: commands.length },
  coverage: Object.fromEntries(
    Object.entries(included).map(([k, n]) => {
      const reasons = {};
      for (const e of excluded) if (e.category === k) reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
      return [k, { sourceRows: sourceRows[k], included: n, excluded: excludedBy(k), excludedReasons: reasons }];
    }),
  ),
  points: pointStats,
};
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(meta.counts);
for (const k of Object.keys(out)) console.log(`  ${k}.json  ${(fs.statSync(path.join(outDir, `${k}.json`)).size / 1024).toFixed(0)} KB`);
