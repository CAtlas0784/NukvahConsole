#!/usr/bin/env node
/**
 * Generates the Nukva Console catalog (public/data/*.json) from the SnezhnayaCore server's own
 * resource files, so IDs and names match exactly what the server loads.
 *
 *   node scripts/build-catalog.mjs [--server ../SnezhnayaCore] [--resources <server>/resources]
 *
 * Inputs (read-only):
 *   resources/ExcelBinOutput/*.json   item/avatar/weapon/artifact/monster/scene definitions
 *   resources/TextMap/TextMap{EN,TH}*.json and TextMap_Medium*  names
 *   src/main/java/.../command/commands/*.java   @Command annotations (command reference)
 *   src/main/resources/languages/en-US.json      command descriptions
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
  return th && th !== en ? { en, th } : { en };
};

const ELEMENTS = { Fire: 'pyro', Water: 'hydro', Wind: 'anemo', Electric: 'electro', Grass: 'dendro', Ice: 'cryo', Rock: 'geo' };
const WEAPONS = {
  WEAPON_SWORD_ONE_HAND: 'sword',
  WEAPON_CLAYMORE: 'claymore',
  WEAPON_POLE: 'polearm',
  WEAPON_BOW: 'bow',
  WEAPON_CATALYST: 'catalyst',
};

// ---------------------------------------------------------------- characters
const skills = new Map(excel('AvatarSkillExcelConfigData').map((s) => [s.id, s]));
const depots = new Map(excel('AvatarSkillDepotExcelConfigData').map((d) => [d.id, d]));
const talents = new Map(excel('AvatarTalentExcelConfigData').map((t) => [t.talentId ?? t.id, t]));

const characters = [];
for (const a of excel('AvatarExcelConfigData')) {
  if (a.useType !== 'AVATAR_FORMAL') continue;
  // Same exclusion range the server's own `give avatars` uses (UGC / test avatars).
  if (a.id < 10000002 || a.id >= 10000900) continue;
  const n = name(a.nameTextMapHash);
  if (!n) continue;
  const depot = depots.get(a.skillDepotId);
  const isTraveler = (a.candSkillDepotIds ?? []).length > 0;
  const energy = depot ? skills.get(depot.energySkill) : undefined;
  const element = isTraveler ? 'multi' : ELEMENTS[energy?.costElemType] ?? 'none';
  const skillInfo = (id) => (id && skills.get(id) ? { id, name: name(skills.get(id).nameTextMapHash) } : null);
  const cons = (depot?.talents ?? [])
    .filter(Boolean)
    .map((id) => ({ id, name: name(talents.get(id)?.nameTextMapHash) }))
    .filter((c) => c.name);
  characters.push({
    id: a.id,
    name: n,
    rarity: a.qualityType?.startsWith('QUALITY_ORANGE') ? 5 : 4,
    element,
    weapon: WEAPONS[a.weaponType] ?? 'unknown',
    icon: a.iconName,
    key: a.iconName?.replace('UI_AvatarIcon_', '') ?? '',
    talents:
      depot && !isTraveler
        ? { normal: skillInfo(depot.skills?.[0]), skill: skillInfo(depot.skills?.[1]), burst: skillInfo(depot.energySkill) }
        : null,
    constellations: isTraveler ? [] : cons,
  });
}
characters.sort((x, y) => y.rarity - x.rarity || x.name.en.localeCompare(y.name.en));

// ---------------------------------------------------------------- weapons
const weapons = [];
for (const w of excel('WeaponExcelConfigData')) {
  const n = name(w.nameTextMapHash);
  if (!n || !w.icon) continue;
  weapons.push({ id: w.id, name: n, rarity: w.rankLevel, type: WEAPONS[w.weaponType] ?? 'unknown', icon: w.icon });
}
weapons.sort((x, y) => y.rarity - x.rarity || x.id - y.id);

// ---------------------------------------------------------------- artifacts
const affixGroups = new Map();
for (const e of excel('EquipAffixExcelConfigData')) {
  if (!affixGroups.has(e.id)) affixGroups.set(e.id, []);
  affixGroups.get(e.id).push(e);
}
const SLOTS = { EQUIP_BRACER: 'flower', EQUIP_NECKLACE: 'plume', EQUIP_SHOES: 'sands', EQUIP_RING: 'goblet', EQUIP_DRESS: 'circlet' };
const setMeta = new Map();
for (const s of excel('ReliquarySetExcelConfigData')) {
  const group = (affixGroups.get(s.equipAffixId) ?? []).sort((a, b) => a.level - b.level);
  const n = name(group[0]?.nameTextMapHash);
  if (!n) continue;
  setMeta.set(s.setId, {
    id: s.setId,
    name: n,
    icon: s.setIcon,
    bonuses: group.map((g, i) => ({ pieces: s.setNeedNum?.[i] ?? null, text: name(g.descTextMapHash) })).filter((b) => b.pieces && b.text),
    pieces: {},
  });
}
// Depot sizes, so the standard (randomisable) piece wins over fixed-stat event variants.
const mainDepotSize = new Map();
for (const m of excel('ReliquaryMainPropExcelConfigData')) mainDepotSize.set(m.propDepotId, (mainDepotSize.get(m.propDepotId) ?? 0) + 1);
const subDepotSize = new Map();
for (const a of excel('ReliquaryAffixExcelConfigData')) subDepotSize.set(a.depotId, (subDepotSize.get(a.depotId) ?? 0) + 1);
const pieceScore = (r) => (mainDepotSize.get(r.mainPropDepotId) ?? 0) * 10_000 + (subDepotSize.get(r.appendPropDepotId) ?? 0) * 10 + r.appendPropNum;

const pieceCandidates = new Map();
for (const r of excel('ReliquaryExcelConfigData')) {
  const set = setMeta.get(r.setId);
  const slot = SLOTS[r.equipType];
  if (!set || !slot) continue;
  const n = name(r.nameTextMapHash);
  if (!n) continue;
  const key = `${r.setId}:${slot}:${r.rankLevel}`;
  const prev = pieceCandidates.get(key);
  const better = !prev || pieceScore(r) > pieceScore(prev) || (pieceScore(r) === pieceScore(prev) && r.id < prev.id);
  if (better) pieceCandidates.set(key, { ...r, slot, n });
}
for (const r of pieceCandidates.values()) {
  const set = setMeta.get(r.setId);
  set.pieces[r.slot] ??= [];
  set.pieces[r.slot].push({
    id: r.id,
    name: r.n,
    rarity: r.rankLevel,
    icon: r.icon,
    maxLevel: r.maxLevel,
    mainDepot: r.mainPropDepotId,
    subDepot: r.appendPropDepotId,
    initialSubs: r.appendPropNum,
  });
}
const artifactSets = [...setMeta.values()]
  .filter((s) => Object.keys(s.pieces).length > 0)
  .map((s) => {
    const maxRarity = Math.max(...Object.values(s.pieces).flat().map((p) => p.rarity));
    for (const list of Object.values(s.pieces)) list.sort((a, b) => b.rarity - a.rarity);
    return { ...s, maxRarity };
  })
  .sort((a, b) => b.maxRarity - a.maxRarity || a.name.en.localeCompare(b.name.en));

const mainProps = {};
// *_SUB_HURT (elemental resistance) rows exist in the Sands depot but never roll in the game.
for (const m of excel('ReliquaryMainPropExcelConfigData')) {
  if (m.propType.endsWith('_SUB_HURT')) continue;
  (mainProps[m.propDepotId] ??= []).push({ id: m.id, prop: m.propType });
}
const subProps = {};
for (const a of excel('ReliquaryAffixExcelConfigData')) (subProps[a.depotId] ??= []).push({ id: a.id, prop: a.propType, value: a.propValue });
for (const list of Object.values(subProps)) list.sort((a, b) => a.prop.localeCompare(b.prop) || a.value - b.value);

// ---------------------------------------------------------------- materials
const materials = [];
for (const m of excel('MaterialExcelConfigData')) {
  const n = name(m.nameTextMapHash);
  if (!n || !m.icon) continue;
  materials.push({
    id: m.id,
    name: n,
    type: (m.materialType ?? 'MATERIAL_NONE').replace(/^MATERIAL_/, ''),
    item: m.itemType === 'ITEM_VIRTUAL' ? 'virtual' : 'material',
    rarity: m.rankLevel ?? 0,
    icon: m.icon,
  });
}
materials.sort((a, b) => a.id - b.id);

// ---------------------------------------------------------------- monsters
const describes = new Map(excel('MonsterDescribeExcelConfigData').map((d) => [d.id, d]));
const monsters = [];
for (const m of excel('MonsterExcelConfigData')) {
  const d = describes.get(m.describeId);
  const n = name(d?.nameTextMapHash) ?? name(m.nameTextMapHash);
  if (!n) continue;
  monsters.push({
    id: m.id,
    name: n,
    key: m.monsterName,
    type: (m.type ?? 'MONSTER_ORDINARY').replace(/^MONSTER_/, '').toLowerCase(),
    icon: d?.icon ?? null,
  });
}
monsters.sort((a, b) => a.id - b.id);

// ---------------------------------------------------------------- scenes
const dungeonNames = new Map();
for (const d of excel('DungeonExcelConfigData')) {
  const n = name(d.displayNameTextMapHash) ?? name(d.nameTextMapHash);
  if (n && !dungeonNames.has(d.sceneId)) dungeonNames.set(d.sceneId, n);
}
const scenes = excel('SceneExcelConfigData')
  .map((s) => ({
    id: s.id,
    type: (s.type ?? 'SCENE_NONE').replace(/^SCENE_/, '').toLowerCase(),
    script: s.scriptData || null,
    name: dungeonNames.get(s.id) ?? null,
  }))
  .sort((a, b) => a.id - b.id);

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
const version = fs.readFileSync(path.join(serverDir, 'src/main/java/emu/grasscutter/GameConstants.java'), 'utf8').match(/VERSION\s*=\s*"([^"]+)"/)?.[1];
const out = {
  characters,
  weapons,
  artifacts: { sets: artifactSets, mainProps, subProps },
  materials,
  monsters,
  scenes,
  commands,
};
fs.mkdirSync(outDir, { recursive: true });
for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(outDir, `${k}.json`), JSON.stringify(v));
const meta = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  gameVersion: version ?? null,
  source: 'SnezhnayaCore resources (ExcelBinOutput + TextMap) and command sources',
  counts: {
    characters: characters.length,
    weapons: weapons.length,
    artifactSets: artifactSets.length,
    materials: materials.length,
    monsters: monsters.length,
    scenes: scenes.length,
    commands: commands.length,
  },
};
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(meta.counts);
for (const k of Object.keys(out)) console.log(`  ${k}.json  ${(fs.statSync(path.join(outDir, `${k}.json`)).size / 1024).toFixed(0)} KB`);
