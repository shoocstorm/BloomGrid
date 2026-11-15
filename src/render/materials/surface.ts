import type { Node } from 'three/webgpu';
import {
  abs,
  cameraPosition,
  color,
  cross,
  dFdx,
  dFdy,
  dot,
  faceDirection,
  float,
  floor,
  fract,
  fwidth,
  hash,
  length,
  min,
  mix,
  normalView,
  normalWorld,
  positionView,
  positionWorld,
  sign,
  smoothstep,
  step,
  vec2,
  vec3,
} from 'three/tsl';

/**
 * Surface realism helpers (D-160): relief and depth for the procedural materials without textures.
 *
 * `bumped` perturbs the shading normal from a procedural height field (Mikkelsen's surface-gradient bump, with
 * analytic screen derivatives of the height instead of texture taps), so grout, mortar, seams, boards and window
 * frames catch the light like real relief. The height is in world units, so a 1 cm groove reads the same on every
 * piece whatever its instance scale. Relief fades once its features are under a couple of pixels (D-064/D-070):
 * a derivative normal on a sub-pixel stripe would sparkle.
 *
 * `roomInterior` is interior mapping: each window cell is the front of a box-shaped room, and the view ray is
 * traced to the room's back wall, floor, ceiling or side wall. Façades get depth, furniture and ceiling lamps
 * that move with parallax, from one shader and no geometry.
 */

/** View-space normal bent by a world-unit height field. `fade` (0..1) scales the relief down (far away). */
export function bumped(
  height: Node<'float'>,
  fade: Node<'float'> = float(1),
  base: Node<'vec3'> = normalView,
): Node<'vec3'> {
  const sx = dFdx(positionView);
  const sy = dFdy(positionView);
  const hx = dFdx(height).mul(fade);
  const hy = dFdy(height).mul(fade);
  const r1 = cross(sy, base);
  const r2 = cross(base, sx);
  const det = dot(sx, r1).mul(faceDirection);
  const grad = sign(det).mul(r1.mul(hx).add(r2.mul(hy)));
  return abs(det).mul(base).sub(grad).normalize() as Node<'vec3'>;
}

/** 1 while features of `size` world units span several pixels, falling to 0 once they are about one. */
export const reliefFade = (size: number): Node<'float'> =>
  float(1).sub(smoothstep(size * 0.12, size * 0.4, length(fwidth(positionWorld)))) as Node<'float'>;

export interface Room {
  /** Albedo seen through the pane by day (the room in daylight, darker than outside). */
  day: Node<'vec3'>;
  /** Light from the room when it is lit (lamp-lit walls and the ceiling light), before night and lit factors. */
  lamp: Node<'vec3'>;
  /** 1 where a blind or curtain covers the pane (opaque fabric: no parallax). */
  blind: Node<'float'>;
}

/**
 * Traces the view ray into the room behind a window cell. `a` and `b` are the façade's pattern coordinates
 * (one unit per window column and per storey), `ua` the pattern units per world unit along `u = x + z`
 * (the column frequency), `storey` the floor height in world units and `depth` the room depth in world units.
 */
export function roomInterior(
  a: Node<'float'>,
  b: Node<'float'>,
  ua: Node<'float'>,
  storey: number,
  depth: number,
  seed: Node<'float'>,
): Room {
  const N = normalWorld;
  const V = positionWorld.sub(cameraPosition).normalize();
  const vn = dot(V, N);
  const vp = V.sub(N.mul(vn));
  // Ray direction in room units: across the cell (along u), up the storey, and into the building.
  const d0 = vec3(vp.x.add(vp.z).mul(ua), vp.y.div(storey), vn.negate().max(0.02).div(depth));
  // Keep each component off zero (a ray parallel to a wall never reaches it): sign-preserving nudge.
  const d = d0.add(vec3(step(0, d0.x), step(0, d0.y), 1).mul(2).sub(1).mul(1e-4));
  const p = vec3(fract(a), fract(b), 0);
  const tx = step(0, d.x).sub(p.x).div(d.x);
  const ty = step(0, d.y).sub(p.y).div(d.y);
  const tz = float(1).div(d.z);
  const t = min(min(tx, ty), tz);
  const hit = p.add(d.mul(t));
  const isBack = step(tz, min(tx, ty));
  const isFlat = float(1).sub(isBack).mul(step(ty, tx));
  const isSide = float(1).sub(isBack).sub(isFlat).max(0);
  const isFloor = isFlat.mul(step(d.y, 0));
  const isCeil = isFlat.sub(isFloor);

  // One room per cell: its own paint, floor and furniture.
  const id = floor(a).mul(7.13).add(floor(b).mul(31.7)).add(seed.mul(17.3));
  const h1 = hash(id);
  const h2 = hash(id.add(3.1));
  const h3 = hash(id.add(7.7));
  const h4 = hash(id.add(11.3));
  const paint = mix(mix(color(0xefe6d6), color(0xd7e4e2), step(0.6, h1)), color(0xe9cfc0), step(0.85, h1));
  const floorCol = mix(mix(color(0x7a5a40), color(0xb08b62), h2), color(0x8f9496), step(0.75, h2));
  const ceilCol = color(0xf4f1ea);

  // Back wall: a furniture band (desk, sofa or shelving) and a picture or screen above it.
  const fx = hit.x;
  const fy = hit.y;
  const span = step(h3.mul(0.3).add(0.08), fx).mul(step(fx, h3.mul(0.3).add(0.55)));
  const furniture = span.mul(step(fy, h4.mul(0.18).add(0.22)));
  const frameR = abs(vec2(fx.sub(h4.mul(0.4).add(0.3)), fy.sub(0.6)));
  const picture = step(frameR.x, 0.09).mul(step(frameR.y, 0.07)).mul(step(0.35, h3));
  const furnCol = mix(mix(color(0x4a5a64), color(0x8a6a4c), h4), color(0x5f7d45), step(0.8, h4));
  const picCol = mix(color(0x3e7f8a), color(0xd98a62), h2);
  let back = mix(paint, furnCol, furniture) as Node<'vec3'>;
  back = mix(back, picCol, picture) as Node<'vec3'>;
  // A potted plant by the window on some floors (side walls carry a narrow plant silhouette).
  const plant = step(0.6, h2).mul(step(hit.z, 0.35)).mul(step(hit.y, 0.42));
  const side = mix(paint.mul(0.86), color(0x4f7d3a), plant);

  const surf = back.mul(isBack).add(floorCol.mul(isFloor)).add(ceilCol.mul(isCeil)).add(side.mul(isSide));
  // Corners and the far wall are darker (no light reaches them from the window): soft fake occlusion.
  const edge = min(min(hit.x, float(1).sub(hit.x)), min(hit.y, float(1).sub(hit.y)));
  const corner = smoothstep(0, 0.18, edge).mul(0.3).add(0.7);
  const deep = float(1).sub(hit.z.mul(0.45));
  const daylight = surf.mul(corner).mul(deep);

  // Lamp-lit at night: a ceiling light pools on the floor and the back wall, warm or cool per room.
  const lampXY = vec2(hit.x.sub(0.5), hit.z.sub(0.5));
  const pool = float(1)
    .sub(smoothstep(0.0, 0.6, length(lampXY)))
    .mul(isFloor.add(isCeil.mul(0.5)));
  const fixture = isCeil.mul(float(1).sub(smoothstep(0.06, 0.12, length(lampXY)))).mul(4);
  const wash = float(1)
    .sub(smoothstep(0.2, 1.0, float(1).sub(fy)))
    .mul(isBack.add(isSide))
    .mul(0.6);
  const lampTone = mix(color(0xffb36b), color(0xffe2b0), h3)
    .mul(mix(float(1), float(0.0), step(0.9, h4)))
    .add(color(0xa8d4ff).mul(step(0.9, h4)));
  const lamp = surf.mul(lampTone).mul(corner).mul(pool.add(wash).add(0.25)).add(lampTone.mul(fixture));

  // Blinds on about a third of the windows, drawn to a per-room height.
  const blindAt = float(1).sub(h1.mul(h2).mul(1.4).add(0.08));
  const blind = step(0.66, h3).mul(step(blindAt, fract(b)));

  return { day: daylight.mul(0.42) as Node<'vec3'>, lamp: lamp as Node<'vec3'>, blind };
}
