import {
  clamp,
  dot,
  float,
  length,
  mix,
  mx_noise_float,
  positionWorld,
  smoothstep,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { U } from './uniforms';

/**
 * Display-space colour grade and atmosphere helpers (D-120). The grade runs inside the post pipeline's
 * output node after tone mapping, so it costs no extra pass: lift / gain per channel (warm light and cool
 * shadow at golden hour, a blue lift at night), saturation, gentle contrast and a soft vignette. Values come
 * from `U`, which the atmosphere sets from its time-of-day keys and weather pushes.
 */
export function grade(c: Node<'vec3'>): Node<'vec3'> {
  const lift = U.gradeLift as unknown as Node<'vec3'>;
  const gain = U.gradeGain as unknown as Node<'vec3'>;
  let o = c.mul(gain).add(lift.mul(float(1).sub(c)));
  o = o.sub(0.5).mul(U.gradeCon).add(0.5);
  const lum = dot(o, vec3(0.2126, 0.7152, 0.0722));
  o = mix(vec3(lum), o, U.gradeSat);
  // Vignette: a soft fall-off toward the corners (aspect-independent enough at 16:9 and phones).
  const d = length(uv().sub(0.5).mul(vec2(1.0, 0.8)));
  o = o.mul(float(1).sub(smoothstep(0.35, 0.85, d).mul(U.vignette)));
  return clamp(o, 0, 1) as Node<'vec3'>;
}

/**
 * Drifting cloud shadows: a broad noise field that slides east with the clouds (`scenery/Clouds.ts` drift),
 * returned as a multiplier for lit albedo. Features are ~80 tiles wide, so it never flickers (D-070).
 */
export function cloudShade(): Node<'float'> {
  const p = vec2(positionWorld.x.sub(U.clock.mul(0.7)), positionWorld.z).mul(0.011);
  const n = mx_noise_float(p).add(mx_noise_float(p.mul(2.3).add(7.1)).mul(0.4));
  const cover = smoothstep(0.12, 0.5, n);
  return float(1).sub(cover.mul(U.cloudShadow).mul(float(1).sub(U.overlay))) as Node<'float'>;
}
