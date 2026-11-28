import { dot, instanceColor, max, mix, mx_noise_float, positionWorld, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { U } from '../uniforms';

type N = Node<'vec3'>;

/**
 * Surface colour per visual style (D-243, D-244, D-245). One parametric curve whose parameters the style module blends
 * on the CPU from the styles' weights (`SURFACES` in `modules/style`), so a fragment pays for one curve however many
 * styles there are: saturation round the luminance, a tone curve a·c² + b·c (Natural darkens mid-tones and holds
 * whites below paper-white), a broad low-frequency variation in brightness and warmth (features several tiles across:
 * no flicker, D-070), a lift toward a colour (Painted's paper white) and a gain. Bloom's parameters are the identity.
 * Applied in `define()` for every lit library material and on the terrain, before the data lens, so lens colours read
 * true in every style.
 *
 * `tinted`: the material's per-instance colour is multiplied in after `colorNode` (instanced pieces), so the curve is
 * applied to the tinted colour and the tint divided back out, or a saturated tint would pass through untouched.
 */
export function styleAlbedo(c: N, tinted = false): N {
  const tint = tinted ? (max(instanceColor, vec3(0.08)) as unknown as N) : null;
  const full = (tint ? c.mul(tint) : c) as N;
  const lum = vec3(dot(full, vec3(0.2126, 0.7152, 0.0722)));
  let o = mix(lum, full, U.alb.x).max(0) as N;
  o = o.mul(o.mul(U.alb.y).add(U.alb.z)) as N;
  const n = mx_noise_float(positionWorld.mul(0.23)).mul(1.3).mul(U.alb.w);
  o = o.mul(vec3(n.add(1), n.mul(0.86).add(1), n.mul(-0.43).add(1))) as N;
  o = mix(o, U.albLift.xyz, U.albLift.w).mul(U.albGain) as N;
  if (tint) o = o.div(tint) as N;
  return o;
}

/** Emissive per style (`U.glowGain`): Natural lamps rather than neon, Painted a softer glow, Ink at full strength. */
export const styleGlow = (e: N): N => e.mul(U.glowGain) as N;
