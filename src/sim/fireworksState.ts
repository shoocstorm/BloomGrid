/**
 * Fireworks state (D-068): shells in stock per kind, the show in the sky, and the residents' mood after it.
 * Plain data in its own module (no imports) so `City` can hold it without an import cycle; logic lives in
 * `sim/fireworks.ts`.
 */
export const FIREWORK_KINDS = ['peony', 'willow', 'ring', 'palm', 'crackle'] as const;
export type FireworkKind = (typeof FIREWORK_KINDS)[number];

export type Stock = Record<FireworkKind, number>;

/** Shaped shells (D-071): a show mixes them in; a steward's show can feature one. */
export const FIREWORK_SHAPES = ['heart', 'rings', 'butterfly'] as const;
export type FireworkShape = (typeof FIREWORK_SHAPES)[number];

export interface FireworkShow {
  id: number;
  startTick: number;
  endTick: number;
  /** Launch site (a fireworks factory's centre). */
  x: number;
  z: number;
  /** Shells loaded at launch and still to go up, per kind; totals. */
  load: Stock;
  left: Stock;
  shells: number;
  fired: number;
  /** Crew fee paid at launch (refunded on undo). */
  fee: number;
  grand: boolean;
  /** `night`: the nightly show the factories put on; `steward`: launched by the steward (button or Flora). */
  cause: 'night' | 'steward';
  /** A message written in the sky (cleaned by `skyText`), and a shape the show features (D-071). */
  text?: string;
  shape?: FireworkShape;
}

/** A finished show, for the dashboard (newest last, capped). */
export interface ShowRecord {
  id: number;
  day: number;
  /** Time of day at launch, 0..1. */
  time: number;
  shells: number;
  grand: boolean;
  cause: FireworkShow['cause'];
  text?: string;
  shape?: FireworkShape;
}

export interface FireworksState {
  stock: Stock;
  /** Factories fire the nightly show on their own (the steward can switch it off). */
  auto: boolean;
  show: FireworkShow | null;
  /** Shows put on so far, and the last few. */
  shows: number;
  history: ShowRecord[];
  nextShowId: number;
  /** Day of the last nightly show (one per night). */
  lastNight: number;
  /** Lifetime totals: shells made and fired, credits spent (materials and crews) and earned (visitors). */
  produced: number;
  fired: number;
  spent: number;
  revenue: number;
  /** Production carry (fractional shells) and the round-robin kind the factories make next. */
  progress: number;
  nextKind: number;
  /** Afterglow 0..1: delight that lingers after a show and fades over hours. */
  glow: number;
  /** Novelty fatigue: rises with every show, fades by day. Past ~1.7 the noise starts to grate. */
  fatigue: number;
  /** Smoke hanging over the city 0..1 (adds to pollution while it clears). */
  smog: number;
}

export const emptyStock = (): Stock => ({ peony: 0, willow: 0, ring: 0, palm: 0, crackle: 0 });

export function createFireworksState(): FireworksState {
  return {
    stock: emptyStock(),
    auto: true,
    show: null,
    shows: 0,
    history: [],
    nextShowId: 1,
    lastNight: 0,
    produced: 0,
    fired: 0,
    spent: 0,
    revenue: 0,
    progress: 0,
    nextKind: 0,
    glow: 0,
    fatigue: 0,
    smog: 0,
  };
}
