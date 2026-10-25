import { DataTexture, LinearFilter, Mesh, MeshStandardNodeMaterial, PlaneGeometry, RGBAFormat, ClampToEdgeWrapping } from 'three/webgpu';
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, texture, time, vec2, vec3 } from 'three/tsl';
import type { Grid } from '@/sim/Grid';
import { U } from '@/render/uniforms';

/**
 * Stylised water: depth-tinted from a baked terrain-height texture (so the surface can rise for
 * floods: depth = water level − ground), animated ripples, shore foam and an algal-bloom tint.
 */
/** Re-bakes the ground-height texel rectangle the water shader reads (after terrain edits). */
export function updateWaterDepth(water: Mesh, grid: Grid, x0 = 0, z0 = 0, x1 = grid.w, z1 = grid.h): void {
  const tex = water.userData.depth as DataTexture;
  const data = tex.image.data as Uint8Array;
  const W = grid.w + 1;
  for (let z = Math.max(0, z0); z <= Math.min(grid.h, z1); z++)
    for (let x = Math.max(0, x0); x <= Math.min(grid.w, x1); x++) {
      const h = grid.corner(x, z);
      // Encoded ground height: (h + 4) / 8 covers -4..4 world units.
      data[(z * W + x) * 4] = Math.round(Math.max(0, Math.min(1, (h + 4) / 8)) * 255);
      data[(z * W + x) * 4 + 3] = 255;
    }
  tex.needsUpdate = true;
}

export function createWater(grid: Grid): Mesh {
  const W = grid.w + 1;
  const data = new Uint8Array(W * W * 4);
  const tex = new DataTexture(data, W, W, RGBAFormat);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;

  const m = new MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.15, transparent: true });
  const mapUV = vec2(positionWorld.x, positionWorld.z).div(U.mapSize);
  const ground = texture(tex, mapUV).r.mul(8).sub(4);
  const depth = U.waterLevel.sub(ground).div(2).clamp(0, 1);
  const ripple = mx_noise_float(vec3(positionWorld.x.mul(0.6), time.mul(0.35), positionWorld.z.mul(0.6)));
  const ripple2 = mx_noise_float(vec3(positionWorld.x.mul(2.2), time.mul(0.8), positionWorld.z.mul(2.2)));
  const shallow = color(0x7fe3d2);
  const deep = color(0x1d6a86);
  const base = mix(mix(shallow, deep, smoothstep(0.0, 0.7, depth)), color(0x5aa83e), U.algae.mul(0.65));
  const foam = smoothstep(0.09, 0.0, depth.add(ripple.mul(0.03))).mul(smoothstep(-0.2, 0.6, ripple2));
  // Ripples fade with depth so open ocean reads calm from the overview camera.
  const rippleAmt = mix(float(0.04), float(0.012), smoothstep(0.3, 1.0, depth));
  m.colorNode = mix(base.add(ripple.mul(rippleAmt)), color(0xf4fffb), foam.mul(0.8));
  m.opacityNode = smoothstep(0.0, 0.08, depth).mul(0.75).add(0.2).add(foam.mul(0.3)).min(float(0.96));
  m.roughnessNode = float(0.05).add(ripple2.abs().mul(0.12));
  m.emissiveNode = color(0x2fd0ff).mul(U.night).mul(0.08).add(color(0x9ff7ff).mul(foam).mul(U.night).mul(0.25));

  const geo = new PlaneGeometry(grid.w * 4, grid.h * 4, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new Mesh(geo, m);
  mesh.position.set(grid.w / 2, 0, grid.h / 2); // y follows U.waterLevel (floods)
  mesh.receiveShadow = true;
  mesh.name = 'water';
  mesh.userData.depth = tex;
  updateWaterDepth(mesh, grid);
  mesh.renderOrder = 1;
  return mesh;
}
