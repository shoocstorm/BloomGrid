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
