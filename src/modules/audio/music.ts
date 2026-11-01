/**
 * Generative music data (Phase 17, D-077): moods, their chord progressions and scales. Pure (no Web Audio), so
 * the choices are testable; `modules/audio` plays them.
 */
export type Mood = 'dawn' | 'day' | 'dusk' | 'night' | 'crisis';

export interface MoodDef {
  /** Seconds per chord. */
  bar: number;
  /** Chords as MIDI notes (root position voicings, mid register). */
  chords: number[][];
  /** Scale degrees (MIDI) the arpeggio picks from, an octave up. */
  scale: number[];
  /** Arpeggio notes per bar (sparser = calmer) and the pad filter cutoff (Hz). */
  notes: number;
  cutoff: number;
}

const C = 60;
export const MOODS: Record<Mood, MoodDef> = {
  dawn: {
    bar: 6,
    chords: [
      [C, C + 4, C + 7, C + 11],
      [C - 3, C + 4, C + 7, C + 12],
      [C + 5, C + 9, C + 12, C + 16],
    ],
    scale: [72, 74, 76, 79, 81, 84],
    notes: 3,
    cutoff: 1400,
  },
  day: {
    bar: 5,
    chords: [
      [C, C + 4, C + 7, C + 11],
      [C + 5, C + 9, C + 12, C + 16],
      [C - 3, C + 4, C + 9, C + 12],
      [C + 7, C + 11, C + 14, C + 17],
    ],
    scale: [72, 74, 76, 79, 81, 84, 86],
    notes: 5,
    cutoff: 2200,
  },
  dusk: {
    bar: 6,
    chords: [
      [C - 3, C, C + 4, C + 7],
      [C + 5, C + 9, C + 12, C + 14],
      [C + 2, C + 5, C + 9, C + 12],
      [C - 5, C + 2, C + 7, C + 11],
    ],
    scale: [69, 71, 72, 76, 79, 81],
    notes: 3,
    cutoff: 1100,
  },
  night: {
    bar: 8,
    chords: [
      [C - 3, C + 4, C + 7, C + 11],
      [C - 7, C + 4, C + 9, C + 12],
      [C - 5, C + 2, C + 7, C + 14],
    ],
    scale: [69, 72, 74, 76, 79],
    notes: 2,
    cutoff: 800,
  },
  crisis: {
    bar: 4,
    chords: [
      [C - 10, C + 2, C + 5, C + 9],
      [C - 14, C - 2, C + 5, C + 10],
      [C - 12, C, C + 3, C + 7],
    ],
    scale: [62, 65, 67, 70, 72],
    notes: 6,
    cutoff: 900,
  },
};

/**
 * The mood for the moment: a crisis under way wins; otherwise the time of day (0..1: dawn 0.2–0.3, day to 0.72,
 * dusk to 0.82, then night).
 */
export function pickMood(timeOfDay: number, crisis: boolean): Mood {
  if (crisis) return 'crisis';
  const t = timeOfDay;
  if (t >= 0.2 && t < 0.3) return 'dawn';
  if (t >= 0.3 && t < 0.72) return 'day';
  if (t >= 0.72 && t < 0.82) return 'dusk';
  return 'night';
}

export const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** A small deterministic generator so the arpeggio doesn't repeat mechanically (render-side, not sim). */
export function makeRandom(seed = 7): () => number {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
