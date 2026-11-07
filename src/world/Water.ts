import { DataTexture, LinearFilter, Mesh, MeshStandardNodeMaterial, PlaneGeometry, RGBAFormat, ClampToEdgeWrapping } from 'three/webgpu';
import {
  abs,
  cameraPosition,
  color,
  dot,
  float,
  floor,
  fract,
  fwidth,
  hash,
  length,
  max,
  mix,
  mx_noise_float,
  normalize,
  positionWorld,
  pow,
  reflect,
  sin,
  smoothstep,
  texture,
  time,
  vec2,
  vec3,
} from 'three/tsl';
import type { Grid } from '@/sim/Grid';
import { U } from '@/render/uniforms';

/**
 * Stylised water: depth-tinted from a baked terrain-height texture (so the surface can rise for
 * floods: depth = water level − ground), animated ripples, shore foam and an algal-bloom tint.
 * Weather shows on the surface: storms darken and roughen the sea and raise whitecaps, rain pocks it with
 * spreading rings, and an algal bloom drifts in as patchy scum rather than a flat tint.
 * D-120: open water reflects the live sky (fresnel toward the horizon colour, so dusk seas blush), a sun-glitter
 * path blooms at low sun, and a foam line washes up and back over the shallows.
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

  // No depth write: fish drawn after the water show through it, tinted by their depth (D-126). Nothing else
  // transparent sits below the surface.
  const m = new MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.15, transparent: true, depthWrite: false });
  const mapUV = vec2(positionWorld.x, positionWorld.z).div(U.mapSize);
  const ground = texture(tex, mapUV).r.mul(8).sub(4);
  const depth = U.waterLevel.sub(ground).div(2).clamp(0, 1);
  const x = positionWorld.x;
  const z = positionWorld.z;
  // World units per pixel: fine patterns fade to their mean before they turn sub-pixel and shimmer (D-064).
  const px = max(fwidth(x), fwidth(z));
  // Storms speed the ripples up and raise them.
  const chop = U.storm.mul(1.6).add(1);
  const ripple = mx_noise_float(vec3(x.mul(0.6), time.mul(chop.mul(0.35)), z.mul(0.6)));
  const ripple2 = mx_noise_float(vec3(x.mul(2.2), time.mul(chop.mul(0.8)), z.mul(2.2)));
  const shallow = color(0x7fe3d2);
  const deep = color(0x1d6a86);
  // Algal bloom: slow-drifting patches with streaks of scum, not a flat tint.
  const patch = smoothstep(-0.25, 0.45, mx_noise_float(vec3(x.mul(0.03), time.mul(0.015), z.mul(0.03))));
  const streak = smoothstep(0.35, 0.7, mx_noise_float(vec3(x.mul(0.14), time.mul(0.03), z.mul(0.5)))).mul(
    smoothstep(1.2, 0.3, px),
  );
  const algae = U.algae.mul(patch.mul(0.75).add(0.2)).add(U.algae.mul(streak).mul(patch).mul(0.3)).min(float(0.95));
  const calm = mix(mix(shallow, deep, smoothstep(0.0, 0.7, depth)), color(0x5aa83e), algae.mul(0.7));
  // Stormy sea: darker, slate grey.
  const base = mix(calm, color(0x2a4a57), U.storm.mul(0.45));
  const foam = smoothstep(0.09, 0.0, depth.add(ripple.mul(0.03))).mul(smoothstep(-0.2, 0.6, ripple2));
  // Whitecaps on open water in a storm: broken crests from a coarse noise, faded at the overview.
  const crest = mx_noise_float(vec3(x.mul(0.22), time.mul(0.5), z.mul(0.22).add(time.mul(0.6))));
  const caps = smoothstep(0.5, 0.68, crest)
    .mul(smoothstep(0.1, 0.5, ripple2.add(0.4)))
    .mul(smoothstep(0.25, 0.8, depth))
    .mul(U.storm.sub(0.3).max(0).mul(1.4).min(1))
    .mul(smoothstep(2.5, 0.8, px));
  // Rain rings: one drop per 1.6-unit cell at a time, each ring spreads and fades, then restarts elsewhere.
  const cellUV = vec2(x, z).div(1.6);
  const cell = floor(cellUV);
  const seed = hash(cell.x.mul(157).add(cell.y.mul(311)).add(1000));
  const phase = fract(time.mul(1.1).add(seed));
  const off = vec2(hash(seed.mul(997).add(1)), hash(seed.mul(613).add(7))).sub(0.5).mul(0.5);
  const dist = length(fract(cellUV).sub(0.5).sub(off));
  const ring = smoothstep(0.05, 0.0, dist.sub(phase.mul(0.42)).abs())
    .mul(phase.oneMinus())
    .mul(U.rain)
    .mul(smoothstep(0.12, 0.04, px));
  // Ripples fade with depth so open ocean reads calm from the overview camera.
  const rippleAmt = mix(float(0.04), float(0.012), smoothstep(0.3, 1.0, depth)).mul(chop);
  // Shore wash: a foam line that runs up the shallows and slips back (≈11 s), broken by the ripples.
  const washAt = sin(time.mul(0.55).add(x.mul(0.045)).add(z.mul(0.03))).mul(0.035).add(0.055);
  const wash = smoothstep(0.014, 0.0, abs(depth.sub(washAt).add(ripple.mul(0.008))))
    .mul(smoothstep(0.13, 0.04, depth))
    .mul(smoothstep(-0.3, 0.4, ripple2))
    .mul(smoothstep(1.2, 0.4, px));
  const white = foam.mul(0.8).add(caps.mul(0.45)).add(wash.mul(0.55)).min(float(1));
  // Sky reflection: grazing views mirror the horizon, steep ones see into the water (open water only).
  const view = normalize(cameraPosition.sub(positionWorld));
  const n = normalize(vec3(ripple.mul(0.12), float(1), ripple2.mul(0.12)));
  const fres = pow(float(1).sub(max(dot(n, view), 0)), 4).mul(0.65).add(0.03).mul(smoothstep(0.15, 0.6, depth));
  const skyRefl = mix(U.horizon, U.zenith, 0.25);
  const lit = mix(base.add(ripple.mul(rippleAmt)).add(ring.mul(0.22)), skyRefl, fres.mul(float(1).sub(U.storm.mul(0.5))));
  m.colorNode = mix(lit, color(0xf4fffb), white);
  // Sun glitter: a path of sparkles toward a low sun, broken by the ripples and faded before it is sub-pixel.
  const r = reflect(view.negate(), n);
  const lowSun = smoothstep(0.85, 0.1, U.sunDir.y).mul(0.7).add(0.3);
  const glint = pow(max(dot(r, U.sunDir), 0), 90)
    .mul(smoothstep(0.1, 0.55, ripple2))
    .mul(float(1).sub(U.night))
    .mul(float(1).sub(U.storm))
    .mul(lowSun)
    .mul(smoothstep(1.5, 0.4, px));
  m.opacityNode = smoothstep(0.0, 0.08, depth).mul(0.75).add(0.2).add(foam.mul(0.3)).min(float(0.96));
  m.roughnessNode = float(0.05).add(ripple2.abs().mul(0.12)).add(U.storm.mul(0.25)).add(ring.mul(0.3));
  m.emissiveNode = color(0x2fd0ff)
    .mul(U.night)
    .mul(0.08)
    .add(color(0x9ff7ff).mul(foam.add(wash.mul(0.5))).mul(U.night).mul(0.25))
    .add(U.sunColor.mul(glint).mul(1.4));

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
