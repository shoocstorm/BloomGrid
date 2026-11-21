/**
 * The films' score (D-195): what a cutscene can ask the audio module for, as bus events. A film sets **beds**
 * (continuous layers it fades in and out: the sea, wind, rain, the muffled deep, a tension drone, a choir, a machine
 * hum) and fires **hits** (stingers: the lead-in's iris, risers, impacts, splashes, bubbles, swells, a resolving
 * chord…). While a film plays (`film:state`), the game's music and ambience duck under it. Everything is
 * synthesised in `modules/audio/film.ts`; this file is only the vocabulary, so films never import the audio module.
 */

export type FilmBed = 'sea' | 'wind' | 'rain' | 'deep' | 'drone' | 'choir' | 'hum';

export type FilmHit =
  /** The lead-in: a reversed swell into a deep boom at the black point (~1.1 s). */
  | 'iris'
  /** The film opening out of black: an airy chord. */
  | 'open'
  /** Tension rising over `dur` seconds, cut off at its peak. */
  | 'riser'
  /** A huge impact: a sub drop, a roar of water, a low chord stab. */
  | 'boom'
  | 'splash'
  /** Cut under the sea: a muffled whoomp and bubbles. */
  | 'plunge'
  | 'bubbles'
  | 'heartbeat'
  | 'thunder'
  /** An orchestral swell over `dur` seconds (the score's key). */
  | 'swell'
  /** Voices: the Deep Choir answering. */
  | 'choir'
  | 'shimmer'
  | 'dolphins'
  | 'gulls'
  /** A fishing reel's ratchet. */
  | 'reel'
  /** Tiny plinks on the water (a float nibbled). */
  | 'nibble'
  | 'shutter'
  | 'sneeze'
  | 'thud'
  /** A short suspense sting. */
  | 'sting'
  | 'wings'
  | 'crowd'
  /** The end card: a resolving chord with a bell and a shimmer. */
  | 'resolve';

declare module '@/core/EventBus' {
  interface GameEvents {
    /** A film started or ended: the score begins (in its `key`, semitones from A) or fades out. */
    'film:state': { on: boolean; key?: number };
    /** Fades a bed to `level` (0–1) over `fade` seconds. */
    'film:bed': { bed: FilmBed; level: number; fade?: number };
    /** A stinger, `delay` seconds from now; `dur` for risers and swells. */
    'film:hit': { hit: FilmHit; delay?: number; dur?: number };
  }
}
