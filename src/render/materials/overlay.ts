import { ClampToEdgeWrapping, DataTexture, LinearFilter, NearestFilter, RGBAFormat } from 'three/webgpu';
import { dot, float, instanceColor, max, mix, positionWorld, smoothstep, step, texture, vec2, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { MAP_SIZE } from '@/sim/City';
import { U } from '../uniforms';

/**
 * Data-lens texture: one texel per tile. R = value (0..1), G = has-data mask. Written by the
 * overlays module; sampled in world space by every lit material via `withOverlay`.
 */
export const overlayTexture = new DataTexture(new Uint8Array(MAP_SIZE * MAP_SIZE * 4), MAP_SIZE, MAP_SIZE, RGBAFormat);
overlayTexture.wrapS = overlayTexture.wrapT = ClampToEdgeWrapping;
overlayTexture.magFilter = overlayTexture.minFilter = NearestFilter;
overlayTexture.needsUpdate = true;

export function setOverlaySmooth(smooth: boolean): void {
  const f = smooth ? LinearFilter : NearestFilter;
  if (overlayTexture.magFilter === f) return;
  overlayTexture.magFilter = overlayTexture.minFilter = f;
  overlayTexture.needsUpdate = true;
}

type N = Node<'vec3'>;

const sample = texture(overlayTexture, vec2(positionWorld.x, positionWorld.z).div(U.mapSize));

/**
 * Blends a material's base colour toward the active lens: ramp colour where the lens has data,
 * desaturated base elsewhere. For instanced materials the instance tint (multiplied in after
 * `colorNode`) is divided out so lens colours read true.
 */
export function withOverlay(base: N, instanced: boolean): N {
  const v = sample.r;
  // No data outside the playable map (the scenic ring would otherwise smear edge texels).
  const wx = positionWorld.x;
  const wz = positionWorld.z;
  const inside = step(0, wx).mul(step(wx, U.mapSize)).mul(step(0, wz)).mul(step(wz, U.mapSize));
  const m = sample.g.mul(inside);
  const ramp = mix(mix(U.ovLow, U.ovMid, smoothstep(0, 0.5, v)), U.ovHigh, smoothstep(0.5, 1, v));
  const grey = vec3(dot(base, vec3(0.3, 0.59, 0.11))).mul(0.5).add(0.32);
  let target: N = mix(grey, ramp, m) as N;
  if (instanced) target = target.div(max(instanceColor, vec3(0.08))) as N;
  return mix(base, target, U.overlay) as N;
}

/** Dims emissive glow while a lens is shown, so data colours dominate. */
export const overlayDim = (emissive: N): N => emissive.mul(float(1).sub(U.overlay.mul(0.85))) as N;

/**
 * Living-field texture: R = bloom 0..1 per tile (Seasonal Bloom Engine), G = pedestrian activity
 * 0..1 (night life), each uploaded when the sim recomputes its field. Flowers open with bloom;
 * night glow (flowers, fungi, guidelines, canopies) scales with activity.
 */
export const bloomTexture = new DataTexture(new Uint8Array(MAP_SIZE * MAP_SIZE * 4), MAP_SIZE, MAP_SIZE, RGBAFormat);
bloomTexture.wrapS = bloomTexture.wrapT = ClampToEdgeWrapping;
bloomTexture.magFilter = bloomTexture.minFilter = LinearFilter;
bloomTexture.needsUpdate = true;

/** Bloom at a world xz (node). */
export const bloomAt = (x: Node<'float'>, z: Node<'float'>) => texture(bloomTexture, vec2(x, z).div(U.mapSize)).r;

/** Pedestrian activity at a world xz (node). */
export const activityAt = (x: Node<'float'>, z: Node<'float'>) => texture(bloomTexture, vec2(x, z).div(U.mapSize)).g;

/**
 * Night-glow gain from activity at the fragment: quiet areas keep a dim ember (0.35), busy
 * districts glow up to 1.5× (contrast-stretched: most of the founding city sits at 0.3–0.8). `U.nightlife` (0 → flat 1) lets the effect be disabled.
 */
export const activityGlow = () =>
  mix(float(1), mix(float(0.35), float(1.5), smoothstep(0.25, 0.85, activityAt(positionWorld.x, positionWorld.z))), U.nightlife);
