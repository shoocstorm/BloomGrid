import { dot, float, instanceColor, max, mix, mx_noise_float, positionWorld, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { U } from '../uniforms';

type N = Node<'vec3'>;

/**
 * The Natural style's surfaces (D-243). The Bloom style paints with saturated, pastel albedos that read as a
 * storybook; real materials are duller and darker (most sit between 0.1 and 0.6 reflectance) and never one flat
 * colour across a façade. `naturalAlbedo` takes a third of the chroma out, compresses the highlights toward a
 * measured range and adds a broad, low-frequency variation in brightness and warmth (features several tiles across,
 * so it never flickers, D-070). Blended on `U.realism`: at 0 it returns the input exactly.
 *
 * `tinted`: the material's per-instance colour is multiplied in after `colorNode` (instanced pieces), so the curve
 * is applied to the tinted colour and the tint divided back out, or a saturated tint would pass through untouched.
 */
export function naturalAlbedo(c: N, tinted = false): N {
  const tint = tinted ? (max(instanceColor, vec3(0.08)) as unknown as N) : null;
  const full = (tint ? c.mul(tint) : c) as N;
  const lum = dot(full, vec3(0.2126, 0.7152, 0.0722));
  let o = mix(vec3(lum), full, 0.66) as N;
  // Darken the mid-tones a little and hold whites below paper-white.
  o = o.mul(o.mul(0.24).add(0.66)) as N;
  // One octave: it runs on every lit fragment in both styles (the blend computes both sides).
  const n = mx_noise_float(positionWorld.mul(0.23)).mul(1.3);
  o = o.mul(vec3(n.mul(0.07).add(1), n.mul(0.06).add(1), n.mul(-0.03).add(1))) as N;
  if (tint) o = o.div(tint) as N;
  return mix(c, o, U.realism) as N;
}

/** Emissive under the Natural style: bioluminescence and lit windows glow, but as lamps, not neon. */
export const naturalGlow = (e: N): N => e.mul(float(1).sub(U.realism.mul(0.32))) as N;
