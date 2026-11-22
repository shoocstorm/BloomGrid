/**
 * Selection sound signatures (D-189): every kind of thing the steward can pick has its own little sound, so a click
 * on a fishing dock answers with a gull and a ship's bell, a fire station with a siren whoop, a whale pod with song.
 * Pure data (no Web Audio), so the choices are testable; `modules/audio` plays them.
 *
 * Every building category has a family timbre (homes ring a doorbell, tech blips in square waves, industry clanks,
 * nature chirps), transposed per building type by a hash of its id so two homes of different types are told apart.
 * Memorable buildings and the free-standing objects (wonders, ferry, trains, jet) have a hand-written signature
 * instead. The building's state is heard on top: a level adds sparkle, a hero a bell, and trouble a tail (fire
 * crackles, a ruin's falling minor, a switched-off building's power-down, a problem's sour second) while the
 * signature itself is muffled.
 */
import type { BuildingCategory } from '@/content/types';

/** One voice of a cue: a tone (oscillator) or a filtered noise burst. `at` is seconds after the cue starts. */
export type Voice =
  | { t: 'tone'; f: number; len: number; vol: number; wave: OscillatorType; to?: number; at: number }
  | { t: 'noise'; f: number; len: number; vol: number; filter: BiquadFilterType; to?: number; at: number };

export type Cue = Voice[];

export interface Played {
  cue: Cue;
  /** Route the signature through a low-pass at this cutoff (Hz): a building in trouble sounds muffled. */
  muffle?: number;
}

export type BuildingState = 'ok' | 'problem' | 'off' | 'fire' | 'ruin';

export type Selected =
  | {
      kind: 'building';
      def: string;
      category: BuildingCategory;
      tier: number;
      hero: boolean;
      state: BuildingState;
    }
  | { kind: 'object'; key: string }
  | { kind: 'road' }
  | { kind: 'bridge' }
  | { kind: 'group'; count: number };

/** Most voices one selection cue may start (the effects bus holds 14 and other sounds keep playing). */
export const MAX_CUE_VOICES = 9;

const tn = (
  f: number,
  len: number,
  vol: number,
  wave: OscillatorType = 'sine',
  to?: number,
  at = 0,
): Voice => ({
  t: 'tone',
  f,
  len,
  vol,
  wave,
  to,
  at,
});
const nz = (filter: BiquadFilterType, f: number, len: number, vol: number, to?: number, at = 0): Voice => ({
  t: 'noise',
  f,
  len,
  vol,
  filter,
  to,
  at,
});
/** A melody: notes (Hz) spaced `step` seconds apart. */
const run = (
  fs: number[],
  step: number,
  len: number,
  vol: number,
  wave: OscillatorType = 'triangle',
  at = 0,
) => fs.map((f, i) => tn(f, len, vol, wave, undefined, at + i * step));
const semis = (f: number, s: number) => f * 2 ** (s / 12);

// ── Family timbres (per category), at a root the def's hash transposes ───────────────────────────────────────
const FAMILY: Record<BuildingCategory, (r: number) => Cue> = {
  // A doorbell: ding-dong, a major third falling.
  residential: (r) => [
    tn(r * 2, 0.5, 0.07),
    tn(semis(r * 2, -4), 0.7, 0.07, 'sine', undefined, 0.22),
    tn(r * 4, 0.3, 0.015),
  ],
  // A zap rising into a hum, with a spark.
  energy: (r) => [
    tn(r, 0.25, 0.035, 'sawtooth', r * 3),
    tn(r * 1.5, 0.6, 0.03, 'triangle', undefined, 0.18),
    nz('highpass', 4000, 0.06, 0.05, undefined, 0.02),
  ],
  // Water drops: quick upward bloops.
  utility: (r) => [
    tn(r * 1.2, 0.08, 0.07, 'sine', r * 3.6),
    tn(r * 1.6, 0.08, 0.06, 'sine', r * 4.4, 0.12),
    tn(r * 1.1, 0.1, 0.05, 'sine', r * 3.2, 0.26),
  ],
  // Chiptune blips: a square arpeggio.
  tech: (r) => [
    ...run([r * 2, semis(r * 2, 7), r * 4, semis(r * 4, 4)], 0.06, 0.07, 0.022, 'square'),
    tn(r * 8, 0.25, 0.012, 'sine', undefined, 0.26),
  ],
  // A shop: marimba two-step and a coin.
  commercial: (r) => [
    ...run([r * 2, semis(r * 2, 5)], 0.1, 0.25, 0.06),
    tn(semis(r * 8, 0), 0.18, 0.03, 'triangle', semis(r * 8, 5), 0.22),
  ],
  // A clank: a thud, a metallic ring and its inharmonic partner.
  industry: (r) => [
    nz('bandpass', 1800, 0.06, 0.12),
    tn(r * 0.75, 0.15, 0.06, 'square', r * 0.5),
    tn(r * 3, 0.6, 0.03, 'triangle', undefined, 0.02),
    tn(r * 3 * 2.76, 0.4, 0.012, 'sine', undefined, 0.02),
  ],
  // A whistle trill over a crowd's "hey".
  sports: (r) => [
    nz('bandpass', 900, 0.5, 0.08, 1400),
    tn(2600, 0.08, 0.03, 'sine', 2900, 0.05),
    tn(2600, 0.14, 0.03, 'sine', 2900, 0.16),
    tn(r * 2, 0.3, 0.03, 'triangle', undefined, 0.3),
  ],
  // Birdsong and a leaf rustle.
  nature: (r) => [
    nz('bandpass', 3200, 0.25, 0.025, 1800),
    tn(r * 8, 0.09, 0.03, 'sine', r * 11, 0.05),
    tn(r * 9, 0.09, 0.03, 'sine', r * 12, 0.18),
    tn(r * 8.5, 0.14, 0.025, 'sine', r * 6.5, 0.3),
  ],
  // A wooden tok and a round pluck.
  food: (r) => [
    nz('bandpass', 1200, 0.04, 0.1),
    tn(r * 1.5, 0.35, 0.06, 'triangle', undefined, 0.04),
    tn(r * 2.25, 0.4, 0.04, 'triangle', undefined, 0.16),
  ],
};

/** Family roots (Hz): each sits in the register its timbre suits. */
const ROOT: Record<BuildingCategory, number> = {
  residential: 330,
  energy: 147,
  utility: 330,
  tech: 392,
  commercial: 392,
  industry: 220,
  sports: 330,
  nature: 262,
  food: 220,
};

/** Per-type transposition (semitones), picked by the id's hash: pentatonic steps, so they stay consonant. */
const SHIFTS = [-5, -3, 0, 2, 4, 7];

export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ── Hand-written signatures ──────────────────────────────────────────────────────────────────────────────────
const gull = (at = 0): Cue => [
  tn(1900, 0.18, 0.035, 'triangle', 1300, at),
  tn(1800, 0.25, 0.03, 'triangle', 1100, at + 0.2),
];
const bubbles = (n: number, f = 500, at = 0): Cue =>
  Array.from({ length: n }, (_, i) =>
    tn(f * (1 + ((i * 37) % 5) * 0.18), 0.07, 0.05, 'sine', f * 3, at + i * 0.09),
  );
const buzz = (f: number, len = 0.7): Cue => [
  tn(f, len, 0.02, 'sawtooth', f * 1.05),
  tn(f * 1.03, len, 0.02, 'sawtooth', f * 0.98),
  nz('bandpass', f * 4, len, 0.015),
];
const whoosh = (from: number, to: number, len: number, vol: number, at = 0): Voice =>
  nz('bandpass', from, len, vol, to, at);
const chime = (fs: number[], step = 0.16): Cue => run(fs, step, 0.8, 0.045, 'sine');
const pa = (at = 0): Cue => run([784, 988, 1175], 0.18, 0.6, 0.04, 'sine', at);
const splash = (at = 0, vol = 0.1): Voice => nz('lowpass', 2400, 0.45, vol, 300, at);

const SIGNATURES: Record<string, Cue> = {
  // Energy
  'wind-turbine': [
    whoosh(300, 900, 0.35, 0.07),
    whoosh(300, 900, 0.35, 0.07, 0.38),
    whoosh(300, 900, 0.35, 0.06, 0.76),
    tn(110, 1.1, 0.025, 'triangle'),
  ],
  'kite-meadow': [
    whoosh(1800, 900, 0.12, 0.05),
    whoosh(1800, 900, 0.12, 0.05, 0.14),
    whoosh(1800, 900, 0.12, 0.045, 0.28),
    tn(880, 0.5, 0.03, 'sine', 1320, 0.1),
  ],
  'aeolian-reeds': [
    tn(294, 1.2, 0.03, 'triangle', 300),
    tn(440, 1.2, 0.025, 'triangle', 446, 0.1),
    whoosh(600, 1200, 1, 0.03),
  ],
  'heliostat-array': [
    ...run([1047, 1319, 1568, 2093], 0.05, 0.5, 0.03, 'sine'),
    nz('highpass', 7000, 0.6, 0.02, undefined, 0.1),
  ],
  'solar-spire': [tn(523, 0.9, 0.04, 'sine', 1047), ...run([1568, 2093], 0.12, 0.6, 0.025, 'sine', 0.3)],
  'helix-spire': [tn(196, 0.8, 0.035, 'sawtooth', 784), tn(1568, 0.5, 0.02, 'sine', 3136, 0.4)],
  'algae-lantern': [...bubbles(3, 420), tn(660, 0.8, 0.03, 'sine', undefined, 0.3)],
  // Food
  'fishing-dock': [
    ...gull(),
    splash(0.1, 0.05),
    tn(1175, 1.2, 0.035, 'triangle', undefined, 0.55),
    tn(1175 * 2.4, 0.8, 0.01, 'sine', undefined, 0.55),
  ],
  'rice-terraces': [
    tn(180, 0.12, 0.04, 'square', 140),
    tn(200, 0.12, 0.035, 'square', 150, 0.22),
    nz('bandpass', 2600, 0.5, 0.02, 1800, 0.05),
  ],
  'corkscrew-orchard': [
    tn(500, 0.12, 0.06, 'sine', 900),
    nz('bandpass', 1200, 0.05, 0.06, undefined, 0.2),
    tn(660, 0.3, 0.03, 'triangle', undefined, 0.24),
  ],
  'hanging-gardens': [
    nz('bandpass', 3000, 0.4, 0.03, 1500),
    ...run([784, 988, 1175], 0.12, 0.4, 0.03, 'triangle', 0.1),
  ],
  // Industry
  'fireworks-factory': [
    nz('highpass', 5000, 0.5, 0.04, 2500),
    tn(500, 0.4, 0.03, 'sine', 1800, 0.1),
    nz('lowpass', 1200, 0.35, 0.16, 150, 0.55),
    nz('highpass', 4000, 0.3, 0.05, undefined, 0.7),
  ],
  'drone-fabricator': [
    ...run([1568, 1175, 1760], 0.08, 0.06, 0.025, 'square'),
    tn(220, 0.4, 0.025, 'sawtooth', 440, 0.28),
  ],
  'kelp-refinery': [
    ...bubbles(3, 380),
    nz('bandpass', 1600, 0.06, 0.1, undefined, 0.3),
    tn(660, 0.5, 0.025, 'triangle', undefined, 0.32),
  ],
  'solar-glass-foundry': [
    nz('lowpass', 600, 0.6, 0.12, 200),
    tn(2637, 0.9, 0.03, 'sine', undefined, 0.35),
    tn(2637 * 2.1, 0.5, 0.01, 'sine', undefined, 0.35),
  ],
  'circular-reclaimery': [
    nz('bandpass', 2200, 0.05, 0.08),
    nz('bandpass', 1500, 0.05, 0.07, undefined, 0.09),
    nz('bandpass', 2600, 0.05, 0.06, undefined, 0.17),
    tn(392, 0.4, 0.03, 'triangle', 523, 0.25),
  ],
  'mycelium-brickworks': [
    nz('lowpass', 400, 0.12, 0.14),
    nz('lowpass', 400, 0.12, 0.12, undefined, 0.24),
    tn(196, 0.3, 0.04, 'triangle', undefined, 0.24),
  ],
  // Utility
  'water-works': [...bubbles(4, 360), whoosh(800, 400, 0.6, 0.03, 0.1)],
  'great-noria': [
    tn(150, 0.4, 0.025, 'sawtooth', 120),
    splash(0.35, 0.08),
    tn(523, 0.5, 0.03, 'triangle', undefined, 0.5),
  ],
  'rain-vortex': [whoosh(400, 1800, 0.8, 0.05), ...bubbles(3, 600, 0.3)],
  'fog-harp': run([523, 587, 659, 784, 880, 1047, 1175], 0.045, 0.7, 0.035, 'triangle'),
  'mangrove-seawall': [nz('lowpass', 1600, 1.0, 0.1, 250), nz('highpass', 3000, 0.6, 0.025, undefined, 0.25)],
  'storm-shelter': [
    nz('lowpass', 250, 0.3, 0.16),
    tn(98, 0.6, 0.05, 'sine', 70),
    tn(196, 0.4, 0.02, 'triangle', undefined, 0.05),
  ],
  'ember-watch': [
    tn(700, 0.35, 0.03, 'sine', 1100),
    tn(1100, 0.35, 0.03, 'sine', 700, 0.35),
    tn(700, 0.3, 0.025, 'sine', 1100, 0.7),
  ],
  'aegis-precinct': [
    tn(960, 0.14, 0.025, 'square'),
    tn(770, 0.14, 0.025, 'square', undefined, 0.16),
    tn(960, 0.14, 0.022, 'square', undefined, 0.32),
    tn(770, 0.14, 0.02, 'square', undefined, 0.48),
  ],
  'pod-dock': [whoosh(700, 2200, 0.45, 0.05), tn(660, 0.3, 0.03, 'sine', 990, 0.25)],
  'pod-interchange': [
    whoosh(700, 2200, 0.45, 0.05),
    whoosh(2200, 700, 0.45, 0.04, 0.3),
    tn(784, 0.4, 0.03, 'sine', undefined, 0.4),
  ],
  'skylane-nexus': [
    whoosh(500, 2400, 0.6, 0.05),
    ...run([523, 784, 1047, 1568], 0.08, 0.5, 0.03, 'sine', 0.2),
  ],
  'dragonfly-port': [...buzz(330, 0.4), whoosh(900, 2600, 0.4, 0.035, 0.2)],
  'aeroline-station': [...pa(), tn(150, 1.0, 0.025, 'sine', 330, 0.1)],
  'zephyr-airport': [...run([659, 523], 0.3, 0.7, 0.04, 'sine'), nz('lowpass', 2200, 1.4, 0.08, 300, 0.5)],
  // Tech
  'weather-radar': [
    tn(1200, 1.0, 0.04, 'sine'),
    tn(1200, 0.7, 0.015, 'sine', undefined, 0.35),
    tn(1200, 0.5, 0.006, 'sine', undefined, 0.7),
  ],
  'starlight-observatory': [
    tn(1568, 1.0, 0.025, 'sine', 3136),
    ...run([2093, 2637, 3136, 2637], 0.11, 0.35, 0.018, 'sine', 0.15),
  ],
  'data-spire': [
    ...run([1760, 880, 1319, 1760, 2349], 0.045, 0.05, 0.02, 'square'),
    nz('bandpass', 3000, 0.2, 0.02, 1200, 0.25),
  ],
  'nautilus-library': [
    nz('bandpass', 3000, 0.14, 0.04, 1600),
    nz('bandpass', 2600, 0.12, 0.03, 1400, 0.12),
    tn(988, 0.9, 0.03, 'sine', undefined, 0.25),
  ],
  bioreactor: [...bubbles(5, 300), tn(196, 0.8, 0.02, 'triangle')],
  'seedpod-labs': [
    tn(300, 0.06, 0.06, 'sine', 1200),
    nz('highpass', 2000, 0.04, 0.05, undefined, 0.05),
    ...run([1047, 1319], 0.08, 0.3, 0.025, 'triangle', 0.12),
  ],
  'lotus-pagoda': [
    tn(392, 1.4, 0.04, 'sine'),
    tn(392 * 2.7, 1.0, 0.012, 'sine'),
    tn(587, 1.0, 0.025, 'sine', undefined, 0.3),
  ],
  'quartz-spire': [
    tn(2093, 0.9, 0.03, 'sine'),
    tn(2093 * 1.5, 0.7, 0.015, 'sine', undefined, 0.08),
    tn(2637, 0.6, 0.02, 'sine', undefined, 0.2),
  ],
  'wavecrest-gallery': [whoosh(600, 1400, 0.6, 0.04), ...run([659, 784, 988], 0.15, 0.6, 0.03, 'sine', 0.2)],
  'mycelium-towers': [
    tn(220, 0.6, 0.03, 'sine', 330),
    tn(277, 0.6, 0.025, 'sine', 415, 0.15),
    nz('bandpass', 800, 0.4, 0.02, 400, 0.1),
  ],
  // Sports
  'bloom-stadium': [
    nz('bandpass', 800, 1.1, 0.12, 1600),
    tn(2600, 0.1, 0.035, 'sine', 3000, 0.1),
    tn(2600, 0.25, 0.035, 'sine', 3000, 0.25),
    ...run([523, 659, 784], 0.12, 0.3, 0.03, 'square', 0.55),
  ],
  'aquatic-centre': [splash(0, 0.12), ...bubbles(3, 500, 0.25)],
  'wind-velodrome': [
    tn(2349, 0.2, 0.035, 'triangle'),
    tn(2349, 0.3, 0.035, 'triangle', undefined, 0.13),
    whoosh(400, 1500, 0.5, 0.04, 0.25),
  ],
  'climbing-tower': [
    tn(3136, 0.25, 0.025, 'triangle'),
    tn(3520, 0.3, 0.02, 'triangle', undefined, 0.07),
    nz('lowpass', 500, 0.1, 0.06, undefined, 0.3),
  ],
  'sports-fields': [tn(2600, 0.5, 0.035, 'sine', 2900), nz('bandpass', 1000, 0.6, 0.06, 1500, 0.2)],
  // Nature
  'honeycomb-apiary': buzz(220),
  'flora-hive': [...buzz(260, 0.5), tn(1319, 0.4, 0.02, 'sine', 1760, 0.3)],
  'pollinator-sanctuary': [
    ...buzz(240, 0.5),
    tn(2093, 0.1, 0.025, 'sine', 2637, 0.3),
    tn(2349, 0.1, 0.025, 'sine', 2793, 0.42),
  ],
  'bamboo-cathedral': run([523, 659, 440, 784, 587], 0.11, 0.3, 0.045, 'triangle'),
  'cloud-domes': [
    tn(523, 1.6, 0.02, 'sine', 540),
    tn(659, 1.6, 0.02, 'sine', 670, 0.1),
    tn(784, 1.6, 0.018, 'sine', undefined, 0.2),
    whoosh(800, 1600, 1.4, 0.02),
  ],
  'travertine-baths': [nz('bandpass', 2200, 0.9, 0.025, 1400), ...bubbles(3, 700, 0.2)],
  'eco-playground': [
    tn(500, 0.6, 0.04, 'triangle', 1400),
    nz('bandpass', 1600, 0.4, 0.03, 2400, 0.15),
    tn(1320, 0.4, 0.025, 'triangle', 900, 0.6),
  ],
  'levitating-gardens': [
    tn(392, 1.2, 0.03, 'sine', 784),
    tn(1568, 0.6, 0.02, 'sine', 2349, 0.4),
    nz('bandpass', 3200, 0.3, 0.02, 1800, 0.1),
  ],
  'canopy-skywalk': [
    tn(3000, 0.08, 0.03, 'sine', 3800),
    tn(3100, 0.08, 0.03, 'sine', 3900, 0.1),
    nz('lowpass', 900, 0.08, 0.05, undefined, 0.25),
    nz('lowpass', 900, 0.08, 0.05, undefined, 0.45),
  ],
  'supertree-grove': [
    nz('bandpass', 2800, 0.6, 0.035, 1400),
    ...run([392, 587, 784], 0.15, 0.8, 0.03, 'sine', 0.15),
  ],
  // Commercial and landmarks
  'aurora-gemini': [
    ...run([262, 392, 523, 659, 784], 0.09, 1.6, 0.03, 'sine'),
    tn(1568, 1.4, 0.015, 'sine', 2093, 0.5),
  ],
  'wellspring-spire': [...bubbles(2, 500), ...run([587, 880, 1175], 0.14, 1.0, 0.03, 'sine', 0.2)],
  'harmony-gate': [
    tn(110, 2.2, 0.05, 'sine', 104),
    tn(110 * 2.4, 1.6, 0.025, 'sine'),
    tn(110 * 4.2, 1.0, 0.012, 'sine'),
    nz('lowpass', 500, 0.3, 0.05),
  ],
  'bloom-clock': chime([659, 523, 587, 392], 0.32),
  bloomtopia: run([523, 659, 784, 659, 880, 784, 1047], 0.1, 0.18, 0.04, 'triangle'),
  'bloom-eye': [
    tn(392, 1.0, 0.035, 'triangle', 784),
    ...run([784, 988, 1175], 0.14, 0.5, 0.03, 'triangle', 0.4),
  ],
  'sunset-amphitheatre': [
    nz('bandpass', 2400, 0.08, 0.05),
    nz('bandpass', 2000, 0.08, 0.05, undefined, 0.09),
    nz('bandpass', 2600, 0.08, 0.05, undefined, 0.17),
    nz('bandpass', 2200, 0.08, 0.04, undefined, 0.24),
    nz('bandpass', 1800, 0.6, 0.05, 1400, 0.3),
  ],
  'moonflower-hall': run([1568, 2093, 1760, 2349, 1976], 0.16, 0.6, 0.022, 'sine'),
  'solar-sail-bazaar': [
    whoosh(500, 1200, 0.5, 0.04),
    tn(1568, 0.12, 0.04, 'triangle'),
    tn(2093, 0.3, 0.04, 'triangle', undefined, 0.08),
  ],
  'elder-banyan': [
    nz('bandpass', 2400, 0.9, 0.035, 1200),
    tn(196, 1.4, 0.035, 'sine'),
    tn(294, 1.2, 0.025, 'sine', undefined, 0.2),
  ],
  'glass-pine': [
    tn(2637, 0.7, 0.025, 'sine'),
    tn(3136, 0.6, 0.02, 'sine', undefined, 0.1),
    nz('bandpass', 3000, 0.4, 0.02, 1600, 0.05),
  ],
  // A shop door's bell over the galleria's hum.
  'bloom-arcade-mall': [nz('lowpass', 700, 0.5, 0.03), ...run([1319, 1661, 1976], 0.07, 0.5, 0.035, 'sine')],
  // A sparkle, like a mirror catching the bulbs.
  'petal-salon': run([2093, 2637, 3136, 2637], 0.06, 0.35, 0.025, 'sine'),
  // The roaster's hiss and a cup on its saucer.
  'copperleaf-coffee': [nz('bandpass', 3200, 0.35, 0.03, 1800), tn(1760, 0.12, 0.04, 'triangle', undefined, 0.3), tn(2349, 0.25, 0.03, 'triangle', undefined, 0.36)],
  'lotus-pavilion': [
    tn(440, 1.2, 0.035, 'sine'),
    tn(660, 1.0, 0.025, 'sine', undefined, 0.2),
    splash(0.05, 0.03),
  ],
  'greenhouse-hub': [nz('highpass', 3500, 0.5, 0.04, 6000), tn(784, 0.4, 0.03, 'triangle', undefined, 0.3)],
  // Residential with a character
  'sky-ark': [tn(196, 1.2, 0.04, 'sawtooth', 200), tn(294, 1.2, 0.03, 'sawtooth', 296, 0.05), ...gull(0.5)],
  'coral-arcology': [
    ...bubbles(3, 450),
    tn(392, 1.0, 0.035, 'sine', undefined, 0.2),
    tn(587, 0.8, 0.03, 'sine', undefined, 0.35),
  ],
  'moss-monolith': [
    tn(130, 1.2, 0.04, 'sine'),
    tn(196, 1.0, 0.03, 'triangle', undefined, 0.1),
    nz('lowpass', 400, 0.4, 0.04),
  ],
};

// ── Free-standing objects ────────────────────────────────────────────────────────────────────────────────────
const OBJECTS: Record<string, Cue> = {
  ferry: [tn(98, 1.4, 0.06, 'sawtooth', 96), tn(147, 1.4, 0.04, 'sawtooth', 145, 0.04), ...gull(0.9)],
  aeroline: [...pa(), tn(200, 0.9, 0.03, 'sine', 520, 0.35), whoosh(300, 1500, 0.8, 0.04, 0.35)],
  skyguard: [nz('lowpass', 2600, 1.4, 0.1, 300), whoosh(3200, 900, 1.0, 0.04, 0.1)],
  lighthouse: [
    tn(110, 1.6, 0.06, 'sawtooth', 108),
    tn(165, 1.6, 0.03, 'sawtooth', 163),
    tn(1175, 1.2, 0.03, 'triangle', undefined, 1.0),
  ],
  whales: [
    tn(280, 1.4, 0.05, 'sine', 520),
    tn(520, 1.2, 0.04, 'sine', 240, 1.2),
    nz('lowpass', 300, 1.6, 0.04),
  ],
  dolphins: [
    ...Array.from({ length: 4 }, (_, i) => nz('highpass', 5000, 0.02, 0.05, undefined, i * 0.05)),
    tn(2400, 0.4, 0.03, 'sine', 4200, 0.25),
    tn(4200, 0.3, 0.025, 'sine', 3000, 0.6),
  ],
  tideGates: [nz('lowpass', 1200, 1.2, 0.1, 300), tn(98, 1.0, 0.04, 'sine', 82, 0.2)],
  lotus: [
    ...run([880, 1109, 1319, 1760], 0.12, 1.0, 0.03, 'sine'),
    nz('highpass', 6000, 0.8, 0.015, undefined, 0.2),
  ],
  stacks: [whoosh(400, 900, 1.4, 0.05), tn(147, 1.4, 0.03, 'triangle', 150)],
  dome: [
    tn(880, 1.4, 0.04, 'sine'),
    tn(880, 1.0, 0.015, 'sine', undefined, 0.5),
    nz('lowpass', 200, 1.6, 0.06),
  ],
  turtle: [
    tn(147, 0.6, 0.05, 'triangle'),
    tn(165, 0.6, 0.045, 'triangle', undefined, 0.5),
    splash(0.9, 0.04),
  ],
  colonnade: [
    tn(1319, 0.8, 0.03, 'sine'),
    tn(1319, 0.6, 0.012, 'sine', undefined, 0.3),
    tn(988, 0.8, 0.025, 'sine', undefined, 0.6),
    tn(988, 0.6, 0.01, 'sine', undefined, 0.9),
  ],
  geode: [
    ...run([2637, 3520, 3136, 4186], 0.07, 0.6, 0.02, 'sine'),
    tn(2637 * 1.41, 0.6, 0.01, 'sine', undefined, 0.07),
  ],
};

const ROAD: Cue = [
  nz('lowpass', 700, 0.08, 0.08),
  tn(165, 0.15, 0.04, 'triangle'),
  nz('lowpass', 700, 0.08, 0.06, undefined, 0.14),
];
const BRIDGE: Cue = [
  tn(196, 0.9, 0.04, 'triangle', 190),
  tn(294, 0.7, 0.025, 'triangle', 290, 0.08),
  whoosh(500, 1000, 0.6, 0.03, 0.1),
];
const FALLBACK: Cue = [tn(880, 0.2, 0.04, 'triangle'), tn(1320, 0.3, 0.03, 'triangle', undefined, 0.08)];

/** Trouble tails, heard over the muffled signature. */
const TROUBLE: Record<Exclude<BuildingState, 'ok'>, { cue: Cue; muffle: number }> = {
  // A sour minor second, a beat after.
  problem: {
    cue: [tn(466, 0.35, 0.03, 'triangle', undefined, 0.35), tn(494, 0.35, 0.03, 'triangle', undefined, 0.35)],
    muffle: 2400,
  },
  // A power-down glide.
  off: { cue: [tn(660, 0.5, 0.04, 'sine', 120, 0.05)], muffle: 700 },
  // Crackles and a low alarm.
  fire: {
    cue: [
      ...Array.from({ length: 4 }, (_, i) => nz('bandpass', 2200 + i * 900, 0.04, 0.06, undefined, i * 0.07)),
      tn(220, 0.3, 0.035, 'square', undefined, 0.1),
      tn(185, 0.3, 0.035, 'square', undefined, 0.42),
    ],
    muffle: 1500,
  },
  // A falling minor triad and dust.
  ruin: {
    cue: [...run([392, 311, 262], 0.16, 0.5, 0.04, 'triangle', 0.1), nz('lowpass', 600, 0.6, 0.06, 150)],
    muffle: 500,
  },
};

/** The cue for what was just selected (null for nothing). */
export function selectionCue(sel: Selected): Played | null {
  if (sel.kind === 'road') return { cue: ROAD };
  if (sel.kind === 'bridge') return { cue: BRIDGE };
  if (sel.kind === 'group') {
    // A quick sweep up, one note per building (to six).
    const n = Math.max(2, Math.min(6, sel.count));
    return {
      cue: [
        ...run([523, 587, 659, 784, 880, 1047].slice(0, n), 0.04, 0.2, 0.035, 'triangle'),
        whoosh(600, 2400, 0.3, 0.03),
      ],
    };
  }
  if (sel.kind === 'object') {
    const key = sel.key.startsWith('wonder:') ? sel.key.slice(7).replace(/-\d+$/, '') : sel.key;
    return { cue: OBJECTS[key] ?? FALLBACK };
  }
  let cue = SIGNATURES[sel.def];
  if (!cue) {
    const shift = SHIFTS[hashId(sel.def) % SHIFTS.length]!;
    cue = FAMILY[sel.category](semis(ROOT[sel.category], shift));
  }
  cue = cue.slice(0, MAX_CUE_VOICES - 2);
  const end = Math.min(0.6, Math.max(...cue.map((v) => v.at)) + 0.1);
  if (sel.state !== 'ok') {
    const t = TROUBLE[sel.state];
    return {
      cue: [
        ...cue.map((v) => ({ ...v, vol: v.vol * 0.6 })),
        ...t.cue.map((v) => ({ ...v, at: v.at + end * 0.5 })),
      ].slice(0, MAX_CUE_VOICES),
      muffle: t.muffle,
    };
  }
  // Levels sparkle (one high note per level above the first); heroes ring a bell.
  const extra: Cue = [];
  for (let i = 0; i < Math.min(2, sel.tier); i++)
    extra.push(tn(i ? 2637 : 2093, 0.35, 0.018, 'sine', undefined, end + i * 0.07));
  if (sel.hero)
    extra.push(
      tn(1568, 1.2, 0.02, 'sine', undefined, end),
      tn(1568 * 2.76, 0.7, 0.006, 'sine', undefined, end),
    );
  return { cue: [...cue, ...extra].slice(0, MAX_CUE_VOICES) };
}
