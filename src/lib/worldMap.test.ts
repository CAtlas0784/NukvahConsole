import { describe, expect, it } from 'vitest';
import teleports from '../../public/data/teleports.json';
import type { TeleportPoint } from '@/data/types';
import { boundsOf, checkPoint, coordProblem, countChecks, project, unproject, type ServerPoint } from './worldMap';

const all = teleports as TeleportPoint[];

describe('coordinate mapping', () => {
  const scene3 = all.filter((p) => p.sceneId === 3);
  const b = boundsOf(scene3)!;

  it('every scene 3 point lands inside the square, X right and Z up', () => {
    for (const p of scene3) {
      const at = project(p.pos, b);
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(1000);
      expect(at.y).toBeGreaterThanOrEqual(0);
      expect(at.y).toBeLessThanOrEqual(1000);
    }
    const east = scene3.reduce((a, p) => (p.pos.x > a.pos.x ? p : a));
    const north = scene3.reduce((a, p) => (p.pos.z > a.pos.z ? p : a));
    // The fit is square: the longer axis spans the square, the other is not stretched.
    const xs = scene3.map((p) => project(p.pos, b).x);
    const ys = scene3.map((p) => project(p.pos, b).y);
    expect(project(east.pos, b).x).toBe(Math.max(...xs)); // east is right-most
    expect(project(north.pos, b).y).toBe(Math.min(...ys)); // north is at the top
    expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeGreaterThan(900);
  });

  it('project and unproject are exact inverses', () => {
    for (const p of scene3.slice(0, 200)) {
      const back = unproject(project(p.pos, b), b);
      expect(back.x).toBeCloseTo(p.pos.x, 6);
      expect(back.z).toBeCloseTo(p.pos.z, 6);
    }
  });

  it('a scene without points has no bounds (the UI shows coordinates only)', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('catalog vs server points', () => {
  const p = all.find((x) => x.sceneId === 3 && x.kind === 'statue')!;
  const server = (over: Partial<ServerPoint>) => new Map<number, ServerPoint>([[p.pointId, { sceneId: 3, pointId: p.pointId, type: p.type, areaId: 0, pos: null, tranPos: p.pos, teleportable: true, ...over }]]);

  it('verified only with the same id, type and destination', () => {
    expect(checkPoint(p, undefined)).toBe('unchecked');
    expect(checkPoint(p, new Map())).toBe('missing');
    expect(checkPoint(p, server({}))).toBe('verified');
    expect(checkPoint(p, server({ type: 'DungeonEntry' }))).toBe('moved');
    expect(checkPoint(p, server({ tranPos: { ...p.pos, x: p.pos.x + 5 } }))).toBe('moved');
    expect(checkPoint(p, server({ teleportable: false }))).toBe('missing');
    expect(countChecks([p], server({}))).toEqual({ verified: 1, moved: 0, missing: 0, unchecked: 0 });
  });
});

describe('coordinate validation', () => {
  it('matches the bridge limits', () => {
    expect(coordProblem({ x: '', y: '', z: '' })).toBeNull();
    expect(coordProblem({ x: '1', y: '', z: '' })).toBe('partial');
    expect(coordProblem({ x: '1', y: 'a', z: '3' })).toBe('nan');
    expect(coordProblem({ x: '25000', y: '1', z: '3' })).toBe('bounds');
    expect(coordProblem({ x: '1', y: '6000', z: '3' })).toBe('bounds');
    expect(coordProblem({ x: '2154.5', y: '234.8', z: '-1638.2' })).toBeNull();
  });
});
