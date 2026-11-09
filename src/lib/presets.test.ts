import { describe, expect, it } from 'vitest';
import { buildPresetFile, PRESET_FORMAT, validatePresetFile, type KnownIds, type Preset } from './presets';

const known: KnownIds = {
  avatars: new Set([10000002]),
  items: new Set([202, 11509, 94544]),
  mainProps: new Set([14001]),
  subProps: new Set([501204]),
  gameVersion: '7.2.0',
};
let n = 0;
const id = () => `id-${++n}`;

const file = (presets: unknown[], extra: Record<string, unknown> = {}) => ({ format: PRESET_FORMAT, schema: 1, gameVersion: '7.2.0', exportedAt: '', presets, ...extra });

describe('validatePresetFile', () => {
  it('accepts valid presets of every kind', () => {
    const r = validatePresetFile(
      file([
        { name: 'Ayaka', kind: 'character', payload: { avatarId: 10000002, level: 90, constellation: 2, talents: { normal: 9, skill: 9, burst: 10 } } },
        { name: 'Blade', kind: 'equipment', payload: { weapon: { itemId: 11509, level: 90, refinement: 1 }, artifacts: [{ itemId: 94544, level: 21, mainPropId: 14001, appendPropIds: [501204] }] } },
        { name: 'Mora', kind: 'bundle', payload: { items: [{ itemId: 202, amount: 1000000 }] } },
      ]),
      known,
      id,
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.presets.map((p) => p.kind)).toEqual(['character', 'equipment', 'bundle']);
  });

  it('rejects wrong formats and future schemas', () => {
    expect(validatePresetFile({ format: 'other' }, known, id).errors).toHaveLength(1);
    expect(validatePresetFile(file([], { schema: 99 }), known, id).errors[0].message).toMatch(/unsupported schema/);
  });

  it('rejects out-of-range values per preset without dropping valid ones', () => {
    const r = validatePresetFile(
      file([
        { name: 'Bad', kind: 'character', payload: { avatarId: 10000002, level: 120, constellation: 2, talents: { normal: 1, skill: 1, burst: 1 } } },
        { name: 'Huge', kind: 'bundle', payload: { items: [{ itemId: 202, amount: 5_000_000 }] } },
        { name: 'Ok', kind: 'bundle', payload: { items: [{ itemId: 202, amount: 1 }] } },
        { name: 'Weird', kind: 'spell', payload: {} },
      ]),
      known,
      id,
    );
    expect(r.presets.map((p) => p.name)).toEqual(['Ok']);
    expect(r.errors.map((e) => e.name)).toEqual(['Bad', 'Huge', 'Weird']);
  });

  it('warns about unknown ids and version mismatch', () => {
    const r = validatePresetFile(file([{ name: 'Old', kind: 'bundle', payload: { items: [{ itemId: 999999, amount: 1 }] } }], { gameVersion: '6.0.0' }), known, id);
    expect(r.presets).toHaveLength(1);
    expect(r.warnings.map((w) => w.message).join(' ')).toMatch(/6\.0\.0.*|999999/);
    expect(r.warnings).toHaveLength(2);
  });
});

describe('buildPresetFile', () => {
  it('round-trips through validation', () => {
    const presets: Preset[] = [{ id: 'x', name: 'Mora', kind: 'bundle', createdAt: 1, payload: { items: [{ itemId: 202, amount: 5 }] } }];
    const out = buildPresetFile(presets, '7.2.0');
    expect(out.presets[0]).not.toHaveProperty('id');
    const r = validatePresetFile(JSON.parse(JSON.stringify(out)), known, id);
    expect(r.presets[0].payload).toEqual(presets[0].payload);
  });
});
