/**
 * Coordinate map maths and the catalog <-> server point check (pure; unit-tested).
 *
 * Game coordinates: X east, Z north, Y up. The map draws X to the right and Z up, so screen y is
 * inverted. Everything is fitted into a square of `size` units with a small margin; no imagery is
 * involved, so a position on the map is exactly the point's coordinate, scaled.
 */
import type { TeleportPoint } from '@/data/types';

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function boundsOf(points: { pos: Vec3 }[], padRatio = 0.05): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.pos.x);
    maxX = Math.max(maxX, p.pos.x);
    minZ = Math.min(minZ, p.pos.z);
    maxZ = Math.max(maxZ, p.pos.z);
  }
  const pad = Math.max(maxX - minX, maxZ - minZ, 50) * padRatio;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

const spanOf = (b: Bounds) => Math.max(b.maxX - b.minX, b.maxZ - b.minZ);

/** Game (x, z) -> map units. */
export function project(pos: { x: number; z: number }, b: Bounds, size = 1000): { x: number; y: number } {
  const span = spanOf(b);
  return { x: ((pos.x - b.minX) / span) * size, y: ((b.maxZ - pos.z) / span) * size };
}

/** Map units -> game (x, z). Inverse of project. */
export function unproject(at: { x: number; y: number }, b: Bounds, size = 1000): { x: number; z: number } {
  const span = spanOf(b);
  return { x: b.minX + (at.x / size) * span, z: b.maxZ - (at.y / size) * span };
}

/** The point's own landing position, as the server would use it (tranPos is already folded into pos by the catalog). */
export function landingOf(p: { pos: Vec3 }): Vec3 {
  return { x: Number(p.pos.x.toFixed(2)), y: Number((p.pos.y + 1.5).toFixed(2)), z: Number(p.pos.z.toFixed(2)) };
}

/** What the server reported for one scene (GET /scenes/{id}/points). */
export interface ServerPoint {
  sceneId: number;
  pointId: number;
  type: string | null;
  areaId: number;
  pos: Vec3 | null;
  tranPos: Vec3 | null;
  /** Where the server lands for this point (tranPos, or pos when tranPos is unset / zero). */
  destination?: Vec3 | null;
  teleportable: boolean;
}

export type PointCheck = 'verified' | 'moved' | 'missing' | 'unchecked';

/**
 * Compares a catalog point with the server's loaded data for the same id. 'verified' means the
 * server knows the point with the same type and a destination within 1 m of the catalog's; only
 * those are teleported by id. 'moved' and 'missing' fall back to coordinates with a warning.
 */
export function checkPoint(p: TeleportPoint, server: Map<number, ServerPoint> | undefined): PointCheck {
  if (!server) return 'unchecked';
  const s = server.get(p.pointId);
  if (!s || !s.teleportable) return 'missing';
  const dest = s.destination !== undefined ? s.destination : s.tranPos ?? s.pos;
  if (!dest || s.type !== p.type) return 'moved';
  const d = Math.hypot(dest.x - p.pos.x, dest.y - p.pos.y, dest.z - p.pos.z);
  return d <= 1 ? 'verified' : 'moved';
}

export function countChecks(points: TeleportPoint[], server: Map<number, ServerPoint> | undefined): Record<PointCheck, number> {
  const out: Record<PointCheck, number> = { verified: 0, moved: 0, missing: 0, unchecked: 0 };
  for (const p of points) out[checkPoint(p, server)]++;
  return out;
}

/** Bounds a teleport by coordinates must respect (same as the bridge's INVALID_POSITION / OUT_OF_BOUNDS). */
export const COORD_LIMITS = { horizontal: 20000, minY: -2000, maxY: 5000 };

export function coordProblem(c: { x: string; y: string; z: string }): 'partial' | 'nan' | 'bounds' | null {
  const vals = [c.x, c.y, c.z].map((v) => v.trim());
  if (vals.every((v) => v === '')) return null;
  if (vals.some((v) => v === '')) return 'partial';
  const [x, y, z] = vals.map(Number);
  if (![x, y, z].every(Number.isFinite)) return 'nan';
  if (Math.abs(x) > COORD_LIMITS.horizontal || Math.abs(z) > COORD_LIMITS.horizontal || y < COORD_LIMITS.minY || y > COORD_LIMITS.maxY) return 'bounds';
  return null;
}
