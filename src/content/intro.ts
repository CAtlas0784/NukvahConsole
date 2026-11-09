/**
 * Intro cinematic script — EDIT THIS FILE when the game's story moves on.
 *
 * Each entry describes the intro for one game version. The console plays the entry whose
 * `version` matches the linked server (or `CURRENT_INTRO` before linking). Add a new entry at the
 * top for a new version; older ones are kept so the history stays browsable.
 *
 * Line styles:
 *   'subtitle'  — narrator subtitle: gold speaker name with star rules, small title, then the line
 *   'celestial' — a centred line inside the starry blue celestial banner
 *   'caption'   — quiet centred caption (no speaker)
 *
 * `scene` picks the staging of each line in the Divine Throne:
 *   'ascend' — camera rises through the tiers toward the light
 *   'throne' — Nukvah's spire in view, crown turning
 *   'bloom'  — the light swells to white (use for the last line)
 */

export type IntroLineStyle = 'subtitle' | 'celestial' | 'caption';
export type IntroScene = 'ascend' | 'throne' | 'bloom';

export interface IntroLine {
  style: IntroLineStyle;
  scene: IntroScene;
  /** Speaker id from `speakers`; omit for celestial/caption lines. */
  speaker?: string;
  text: { en: string; th: string };
  /** Milliseconds before the line auto-advances (click / Enter / Space always advances). */
  hold?: number;
}

export interface IntroScript {
  version: string;
  /** Short label of where the story is, shown on the loading veil. */
  chapter: { en: string; th: string };
  speakers: Record<string, { name: string; title: { en: string; th: string } }>;
  lines: IntroLine[];
}

export const INTRO_SCRIPTS: IntroScript[] = [
  {
    version: '7.2',
    chapter: { en: 'Chapter — The Divine Throne of Celestia', th: 'บท — บัลลังก์เทพแห่ง Celestia' },
    speakers: {
      nukvah: { name: 'Nukvah', title: { en: 'Narrator of Eternity', th: 'ผู้เล่าขานนิรันดร์' } },
    },
    lines: [
      {
        style: 'caption',
        scene: 'ascend',
        text: { en: 'Beyond the firmament, the light that never sets…', th: 'เหนือฟากฟ้า แสงที่ไม่เคยดับลง…' },
        hold: 3200,
      },
      {
        style: 'subtitle',
        scene: 'throne',
        speaker: 'nukvah',
        text: {
          en: 'Welcome to the "Divine Throne" — the unified processing system of Celestia.',
          th: 'ยินดีต้อนรับสู่ "บัลลังก์เทพ" ระบบประมวลผลรวมของ Celestia',
        },
        hold: 4600,
      },
      {
        style: 'celestial',
        scene: 'bloom',
        text: { en: 'Celestia welcomes you.', th: 'Celestia ยินดีต้อนรับพวกคุณ' },
        hold: 3600,
      },
    ],
  },
];

export const CURRENT_INTRO = INTRO_SCRIPTS[0];

/** Picks the script for a server game version like "7.2.0"; falls back to the newest. */
export function introFor(gameVersion?: string | null): IntroScript {
  if (!gameVersion) return CURRENT_INTRO;
  return INTRO_SCRIPTS.find((s) => gameVersion.startsWith(s.version)) ?? CURRENT_INTRO;
}
