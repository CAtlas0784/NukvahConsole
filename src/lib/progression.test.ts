import { describe, expect, it } from 'vitest';
import { AVATAR_CAPS, fitAscension, levelLabel, maxLevelOf, validAscensions } from './progression';
import weapons from '../../public/data/weapons.json';

describe('ascension rules', () => {
  it('breakpoints have two valid ascensions', () => {
    expect(validAscensions(AVATAR_CAPS, 1)).toEqual([0]);
    expect(validAscensions(AVATAR_CAPS, 20)).toEqual([0, 1]);
    expect(validAscensions(AVATAR_CAPS, 80)).toEqual([5, 6]);
    expect(validAscensions(AVATAR_CAPS, 90)).toEqual([6]);
    expect(validAscensions(AVATAR_CAPS, 91)).toEqual([]);
  });
  it('keeps a still-valid ascension and labels like the game', () => {
    expect(fitAscension(AVATAR_CAPS, 80, 6)).toBe(6);
    expect(fitAscension(AVATAR_CAPS, 81, 5)).toBe(6);
    expect(levelLabel(AVATAR_CAPS, 80, 5)).toBe('80/80');
    expect(levelLabel(AVATAR_CAPS, 80, 6)).toBe('80/90');
  });
  it('weapon caps come from the real promote table', () => {
    const byId = new Map(weapons.map((w) => [w.id, w]));
    const dull = byId.get(11101)!;
    expect(maxLevelOf(dull.ascensionCaps!)).toBe(70);
    expect(dull.maxRefinement).toBe(1);
    const mistsplitter = byId.get(11509)!;
    expect(maxLevelOf(mistsplitter.ascensionCaps!)).toBe(90);
    expect(mistsplitter.maxRefinement).toBe(5);
    // Every catalog weapon has caps; 1-2 star weapons are the only ones without refinement.
    for (const w of weapons) {
      expect(w.ascensionCaps?.length, `#${w.id}`).toBeGreaterThan(0);
      if (w.rarity <= 2) expect(w.maxRefinement, `#${w.id}`).toBe(1);
    }
  });
});
