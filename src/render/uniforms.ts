import { Color, Vector2, Vector3, Vector4 } from 'three/webgpu';
import { renderGroup, uniform } from 'three/tsl';

/**
 * Global shader uniforms shared by every material. Updated once per frame by the atmosphere
 * and feature modules; materials read them directly so there is zero per-object CPU cost.
 */
export const U = {
  /** 0 = full daylight, 1 = deep night. Drives bioluminescence everywhere. */
  night: uniform(0),
  /** 0 through the evening, 1 in the small hours (≈01:30–04:30): homes and offices switch their lights off. */
  lateNight: uniform(0),
  /** Build-mode grid overlay strength 0..1. */
  grid: uniform(0),
  wind: uniform(1),
  sunDir: uniform(new Vector3(0.4, 0.8, 0.3)),
  zenith: uniform(new Color(0x5fb0ff)),
  horizon: uniform(new Color(0xcfeaff)),
  sunColor: uniform(new Color(0xfff2d6)),
  /** Placement ghost / cursor colour (valid = cyan, invalid = coral). */
  ghost: uniform(new Color(0x7ff7e6)),
  /** Data-lens overlay strength 0..1 (animated), and its 3-stop colour ramp (low → high). */
  overlay: uniform(0),
  ovLow: uniform(new Color(0xff5a6e)),
  ovMid: uniform(new Color(0xffd166)),
  ovHigh: uniform(new Color(0x3ccf8e)),
  /** Water surface height (sea level 0; raised during floods). */
  waterLevel: uniform(0),
  /** Weather / crisis atmosphere 0..1. */
  storm: uniform(0),
  heat: uniform(0),
  algae: uniform(0),
  rain: uniform(0),
  /** Lightning flash lighting the clouds from inside: centre x, z, radius and strength 0..1 (crises/Weather). */
  flash: uniform(new Vector4(0, 0, 1, 0)),
  /** Season look: tint colour and strength for flowers and canopies. */
  seasonTint: uniform(new Color(0xffb7d5)),
  seasonAmount: uniform(0),
  /** Pollen particle density 0..1 (season, bloom bursts). */
  pollen: uniform(0.6),
  /** World offset of the pollen particle box (follows the camera target). */
  pollenOrigin: uniform(new Vector3()),
  /** How strongly night glow follows pedestrian activity (0 = uniform glow, 1 = full). */
  nightlife: uniform(1),
  /** Seconds of animation clock shared with the CPU (explore follow-cam rides pods on it). */
  clock: uniform(0),
  /** Firework spark size multiplier: grows with camera distance so bursts read from the island view (D-068). */
  sparkScale: uniform(1),
  /** Map size in world units (for terrain-space lookups such as water depth). */
  mapSize: uniform(256),
  /** Explore walker's feet (xyz) and the radius (w) in which grass and flowers bend away from them; w = 0 is off. */
  walker: uniform(new Vector4(0, 0, 0, 0)),
  /**
   * Colour grade in display space (D-120), set from the time-of-day ramp by the atmosphere and pushed by
   * weather: lift (added to shadows), gain (multiplies highlights), saturation, contrast round mid-grey,
   * and vignette strength.
   */
  gradeLift: uniform(new Vector3(0, 0, 0)),
  gradeGain: uniform(new Vector3(1, 1, 1)),
  gradeSat: uniform(1),
  gradeCon: uniform(1),
  vignette: uniform(0.18),
  /** Selective bloom strength: soft at noon, stronger at night (set by the atmosphere). */
  bloom: uniform(0.6),
  /** Tint on the noon-baked environment light so reflections follow the sky through the day. */
  envTint: uniform(new Color(1, 1, 1)),
  /** Fog colour, start and end distance (the atmosphere and weather drive them). */
  fogColor: uniform(new Color(0xcfeaff)),
  fogNear: uniform(180),
  fogFar: uniform(900),
  /**
   * The viewer's eye (the city or explore camera), for effects that must measure from it in every pass: the shadow
   * pass renders from the sun, so `cameraPosition` there is the light's (D-162).
   */
  eye: uniform(new Vector3()),
  /**
   * Where the sun's shadows fade out (D-231): inner and outer radius from the shadow map's centre, in map half-sizes
   * (1 = the map's edge across the middle). Chunks stop casting only well beyond the outer radius (in the same light
   * space), so no switch shows. The default never fades (side renders with their own lights).
   */
  shadowFade: uniform(new Vector2(2, 3)),
  /** Frame counter (0..63) that moves dither patterns each frame under temporal AA, so they average out (D-162). */
  frame: uniform(0),
  /**
   * Visual style (D-243): 0 = Bloom (the stylised solarpunk look), 1 = Natural (realistic light, colour and air).
   * Every library material, the sky, water, terrain, fog and grade blend on it, so switching rebuilds no shader; the
   * style module eases it (and `painted` / `cel`, at most one style weight is 1).
   */
  realism: uniform(0),
  /** Painted style weight 0..1 (D-244): a watercolour wash, paper grain and pooled pigment at edges. */
  painted: uniform(0),
  /** Ink style weight 0..1 (D-244): cel-banded light, flat saturated colour and ink outlines. */
  cel: uniform(0),
  /** Synthwave style weight (D-247): an 80s sunset palette, neon outlines and scanlines (replaced Noir). */
  synth: uniform(0),
  /** Blueprint style weight (D-245): white linework on blue drafting paper. */
  blueprint: uniform(0),
  /** Pixel style weight (D-245): chunky pixels and a dithered, limited palette. */
  pixel: uniform(0),
  /** Miniature style weight (D-245): tilt-shift blur and toy-bright colour. */
  mini: uniform(0),
  /**
   * Surface colour per style (D-245), blended on the CPU by the style module (`render/materials/looks.ts`): saturation,
   * curve a·c² + b·c, macro-variation amount, unused; lift colour (rgb) and amount; overall gain; emissive gain. The
   * defaults are the Bloom style (identity).
   */
  alb: uniform(new Vector4(1, 0, 1, 0)),
  albLift: uniform(new Vector4(1, 1, 1, 0)),
  albGain: uniform(1),
  glowGain: uniform(1),
  /** Strength of drifting cloud shadows on lit surfaces (0 at night, ≤ 0.15 by day). */
  cloudShadow: uniform(0.12),
};

// Shared by every material and only written between frames: one upload per render instead of a per-draw
// check (the per-object default cost ≈1.5% main thread once fog, sun and grade inputs joined, D-120).
for (const u of Object.values(U)) u.setGroup(renderGroup);
