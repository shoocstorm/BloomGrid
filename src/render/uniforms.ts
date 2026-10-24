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
  /** Map size in world units (for terrain-space lookups such as water depth). */
  mapSize: uniform(256),
};
