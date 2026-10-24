import { Color, Vector3 } from 'three/webgpu';
import { uniform } from 'three/tsl';

/**
 * Global shader uniforms shared by every material. Updated once per frame by the atmosphere
 * and feature modules; materials read them directly so there is zero per-object CPU cost.
 */
export const U = {
  /** 0 = full daylight, 1 = deep night. Drives bioluminescence everywhere. */
  night: uniform(0),
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
  /** Season look: tint colour and strength for flowers and canopies. */
  seasonTint: uniform(new Color(0xffb7d5)),
  seasonAmount: uniform(0),
  /** Pollen particle density 0..1 (season, bloom bursts). */
  pollen: uniform(0.6),
  /** World offset of the pollen particle box (follows the camera target). */
  pollenOrigin: uniform(new Vector3()),
  /** Map size in world units (for terrain-space lookups such as water depth). */
  mapSize: uniform(256),
};
