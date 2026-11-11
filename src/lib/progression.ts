/**
 * Level / ascension rules (pure; unit-tested). Same as the bridge's NukvaProgression: ascension p
 * allows levels up to caps[p] and is reached at caps[p-1], so a level exactly on a cap (20, 40, …, 80)
 * has two valid ascensions: before ascending (e.g. 80/80) and after (80/90).
 */

/** Characters: every released character uses these caps (AvatarPromoteExcelConfigData). */
export const AVATAR_CAPS = [20, 40, 50, 60, 70, 80, 90];
/** Weapons with no promote data in the catalog fall back to the 3-5 star caps. */
export const WEAPON_CAPS_90 = [20, 40, 50, 60, 70, 80, 90];

export function validAscensions(caps: number[], level: number): number[] {
  const valid: number[] = [];
  for (let p = 0; p < caps.length; p++) {
    const floor = p === 0 ? 1 : caps[p - 1];
    if (level >= floor && level <= caps[p]) valid.push(p);
  }
  return valid;
}

export function maxLevelOf(caps: number[]): number {
  return caps.length ? caps[caps.length - 1] : 0;
}

/** Keeps the ascension if still valid at the new level, else the lowest valid one. */
export function fitAscension(caps: number[], level: number, current: number): number {
  const valid = validAscensions(caps, level);
  return valid.includes(current) ? current : valid[0] ?? 0;
}

/** "80/90": the level and the cap of its ascension (the game's own way to show it). */
export function levelLabel(caps: number[], level: number, ascension: number): string {
  return `${level}/${caps[ascension] ?? '?'}`;
}

/** Level marks for sliders: 1 and every cap. */
export function levelMarks(caps: number[]): number[] {
  return [1, ...caps];
}
