/** Preset model, JSON schema validation and catalog compatibility checks (pure; unit-tested). */

export const PRESET_FORMAT = 'nukva-presets';
export const PRESET_SCHEMA = 1;

export interface CharacterPayload {
  avatarId: number;
  level: number;
  constellation: number;
  talents: { normal: number; skill: number; burst: number };
}
export interface EquipmentPayload {
  weapon: { itemId: number; level: number; refinement: number } | null;
  artifacts: { itemId: number; level: number; mainPropId: number | null; appendPropIds: number[] }[];
}
export interface BundlePayload {
  items: { itemId: number; amount: number }[];
}

export type Preset =
  | { id: string; name: string; kind: 'character'; createdAt: number; payload: CharacterPayload }
  | { id: string; name: string; kind: 'equipment'; createdAt: number; payload: EquipmentPayload }
  | { id: string; name: string; kind: 'bundle'; createdAt: number; payload: BundlePayload };

export interface PresetFile {
  format: typeof PRESET_FORMAT;
  schema: number;
  gameVersion: string | null;
  exportedAt: string;
  presets: Preset[];
}

export interface KnownIds {
  avatars: Set<number>;
  items: Set<number>;
  mainProps: Set<number>;
  subProps: Set<number>;
  gameVersion: string | null;
}

type Issue = { index: number; name: string; message: string };

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function checkPayload(kind: string, p: unknown): string | null {
  if (!isObj(p)) return 'payload must be an object';
  if (kind === 'character') {
    if (!isInt(p.avatarId, 1, 99_999_999)) return 'avatarId must be an integer';
    if (!isInt(p.level, 1, 90)) return 'level must be 1–90';
    if (!isInt(p.constellation, 0, 6)) return 'constellation must be 0–6';
    const t = p.talents;
    if (!isObj(t) || !isInt(t.normal, 1, 15) || !isInt(t.skill, 1, 15) || !isInt(t.burst, 1, 15)) return 'talents must be 1–15';
    return null;
  }
  if (kind === 'equipment') {
    if (p.weapon !== null && p.weapon !== undefined) {
      const w = p.weapon;
      if (!isObj(w) || !isInt(w.itemId, 1, 99_999_999) || !isInt(w.level, 1, 90) || !isInt(w.refinement, 1, 5)) {
        return 'weapon needs itemId, level 1–90 and refinement 1–5';
      }
    }
    if (!Array.isArray(p.artifacts) || p.artifacts.length > 5) return 'artifacts must be a list of at most 5';
    for (const a of p.artifacts) {
      if (!isObj(a) || !isInt(a.itemId, 1, 99_999_999) || !isInt(a.level, 1, 21)) return 'each artifact needs itemId and level 1–21';
      if (a.mainPropId !== null && a.mainPropId !== undefined && !isInt(a.mainPropId, 1, 99_999_999)) return 'mainPropId must be an integer or null';
      if (!Array.isArray(a.appendPropIds) || a.appendPropIds.length > 9 || !a.appendPropIds.every((x) => isInt(x, 1, 99_999_999))) {
        return 'appendPropIds must be up to 9 integers';
      }
    }
    if (!p.weapon && p.artifacts.length === 0) return 'equipment preset is empty';
    return null;
  }
  if (kind === 'bundle') {
    if (!Array.isArray(p.items) || p.items.length === 0 || p.items.length > 50) return 'items must contain 1–50 entries';
    for (const i of p.items) if (!isObj(i) || !isInt(i.itemId, 1, 99_999_999) || !isInt(i.amount, 1, 1_000_000)) return 'each item needs itemId and amount 1–1,000,000';
    return null;
  }
  return `unknown kind "${kind}"`;
}

/** Ids referenced by a preset, grouped so they can be checked against the catalog. */
export function referencedIds(preset: Preset): { avatars: number[]; items: number[]; mainProps: number[]; subProps: number[] } {
  switch (preset.kind) {
    case 'character':
      return { avatars: [preset.payload.avatarId], items: [], mainProps: [], subProps: [] };
    case 'equipment':
      return {
        avatars: [],
        items: [...(preset.payload.weapon ? [preset.payload.weapon.itemId] : []), ...preset.payload.artifacts.map((a) => a.itemId)],
        mainProps: preset.payload.artifacts.flatMap((a) => (a.mainPropId ? [a.mainPropId] : [])),
        subProps: preset.payload.artifacts.flatMap((a) => a.appendPropIds),
      };
    case 'bundle':
      return { avatars: [], items: preset.payload.items.map((i) => i.itemId), mainProps: [], subProps: [] };
  }
}

export interface ImportReport {
  presets: Preset[];
  errors: Issue[];
  warnings: Issue[];
}

/** Validates an imported file. Structurally invalid presets are rejected; unknown IDs are warnings. */
export function validatePresetFile(input: unknown, known: KnownIds, newId: () => string = () => crypto.randomUUID()): ImportReport {
  const report: ImportReport = { presets: [], errors: [], warnings: [] };
  if (!isObj(input) || input.format !== PRESET_FORMAT) {
    report.errors.push({ index: -1, name: 'file', message: `not a ${PRESET_FORMAT} file` });
    return report;
  }
  if (typeof input.schema !== 'number' || input.schema > PRESET_SCHEMA) {
    report.errors.push({ index: -1, name: 'file', message: `unsupported schema ${String(input.schema)} (this console reads ${PRESET_SCHEMA})` });
    return report;
  }
  if (input.gameVersion && known.gameVersion && input.gameVersion !== known.gameVersion) {
    report.warnings.push({ index: -1, name: 'file', message: `made for game ${String(input.gameVersion)}, catalog is ${known.gameVersion}` });
  }
  if (!Array.isArray(input.presets)) {
    report.errors.push({ index: -1, name: 'file', message: 'presets must be a list' });
    return report;
  }
  input.presets.forEach((raw, index) => {
    const name = isObj(raw) && typeof raw.name === 'string' ? raw.name.slice(0, 80) : `#${index + 1}`;
    if (!isObj(raw) || typeof raw.name !== 'string' || !raw.name.trim()) {
      report.errors.push({ index, name, message: 'missing name' });
      return;
    }
    const problem = checkPayload(String(raw.kind), raw.payload);
    if (problem) {
      report.errors.push({ index, name, message: problem });
      return;
    }
    const preset = { id: newId(), name: raw.name.trim().slice(0, 80), kind: raw.kind, createdAt: Date.now(), payload: raw.payload } as Preset;
    const ids = referencedIds(preset);
    const unknown = [
      ...ids.avatars.filter((id) => !known.avatars.has(id)),
      ...ids.items.filter((id) => !known.items.has(id)),
      ...ids.mainProps.filter((id) => !known.mainProps.has(id)),
      ...ids.subProps.filter((id) => !known.subProps.has(id)),
    ];
    if (unknown.length) report.warnings.push({ index, name, message: `unknown ids: ${unknown.join(', ')}` });
    report.presets.push(preset);
  });
  return report;
}

export function buildPresetFile(presets: Preset[], gameVersion: string | null): PresetFile {
  return {
    format: PRESET_FORMAT,
    schema: PRESET_SCHEMA,
    gameVersion,
    exportedAt: new Date().toISOString(),
    presets: presets.map(({ id: _id, createdAt: _c, ...rest }) => rest as Preset),
  };
}
