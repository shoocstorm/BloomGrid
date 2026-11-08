import {
  BufferGeometry,
  CircleGeometry,
  OctahedronGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
  type ColorRepresentation,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBuilder, tf } from '@/render/bake';
import { SURF_KIND } from '@/render/materials/wonder';
import { hash2 } from '@/sim/random';

/**
 * Shapes and a part helper for the sea wonders (D-146): every part carries a surface (roughness, metalness and a
 * pattern kind read by the `wonder` material), and the custom shapes carry a per-vertex `tint` (pale petal bases,
 * dark wet pillar feet) that `GeoBuilder` folds into the colour. Shapes are cached by their parameters.
 */

export type Surf = readonly [roughness: number, metalness: number, kind: number];
export const SURF = {
  paint: [0.55, 0.02, SURF_KIND.plain],
  matte: [0.9, 0, SURF_KIND.plain],
  stone: [0.92, 0, SURF_KIND.stone],
  pearl: [0.24, 0.12, SURF_KIND.pearl],
  glass: [0.06, 0.45, SURF_KIND.glass],
  leaf: [0.78, 0, SURF_KIND.leaf],
  petal: [0.5, 0, SURF_KIND.plain],
  sand: [0.95, 0, SURF_KIND.sand],
  wood: [0.8, 0, SURF_KIND.wood],
  water: [0.12, 0.15, SURF_KIND.water],
  metal: [0.38, 0.7, SURF_KIND.plain],
  brass: [0.3, 0.88, SURF_KIND.plain],
  solar: [0.18, 0.55, SURF_KIND.glass],
} as const satisfies Record<string, Surf>;

/** A wonder under construction: `GeoBuilder` with the surface attribute. */
export class Kit {
  readonly b = new GeoBuilder({ aSurf: 4 });
  part(g: BufferGeometry, m: Matrix4, col: ColorRepresentation, surf: Surf = SURF.paint, glow = 0): this {
    this.b.add(g, m, col, glow, { aSurf: [surf[0], surf[1], surf[2], 0] });
    return this;
  }
}

// ── Primitives (shared, cloned by the builder) ────────────────────────────────────────────────────────────────
export const BALL = new SphereGeometry(1, 12, 8);
export const BALL_LO = new SphereGeometry(1, 8, 5);
export const ROCKY = new IcosahedronGeometry(1, 1);
export const GEM = new IcosahedronGeometry(1, 0);
export const DOME = new SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
export const CYL = new CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0);
export const CYL8 = new CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
export const CONE = new CylinderGeometry(0, 1, 1, 12).translate(0, 0.5, 0);
/** Cheap shapes for small or thin things (a few pixels on screen): beads, rods without caps, surf flecks. */
export const TINY = new OctahedronGeometry(1, 0);
export const ROD = new CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0);
export const FLECK = new CircleGeometry(1, 6).rotateX(-Math.PI / 2);

const cache = new Map<string, BufferGeometry>();
const cached = (key: string, make: () => BufferGeometry) => {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
};

/** Pushes vertices in or out radially by hashed noise (welded seams stay welded). */
export function craggy(g: BufferGeometry, amount: number, seed: number, vertical = 0): BufferGeometry {
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    const k = Math.round(x * 50) + Math.round(z * 50) * 131 + Math.round(y * 50) * 977;
    const n = (hash2(k, seed, 811) - 0.5) * 2 * amount;
    const len = Math.hypot(x, z) || 1;
    const dy = vertical ? (hash2(k, seed, 823) - 0.5) * 2 * vertical : 0;
    p.setXYZ(i, x + (x / len) * n, y + dy, z + (z / len) * n);
  }
  g.computeVertexNormals();
  return g;
}

/** A craggy boulder (one of a few cached shapes). */
export const boulder = (seed: number, detail = 2) =>
  cached(`boulder${seed % 4},${detail}`, () =>
    craggy(new IcosahedronGeometry(1, detail), 0.16, seed % 4, 0.12),
  );

/**
 * A curved, pointed leaf with thickness: base at the origin, running along +z for `len`, `width` across, its
 * sides cupped up by `cup` and its length curling up (+) or drooping (−) by `curl`. Tint: pale at the base
 * (`base` > 0) or dark (`base` < 0), plain at the tip. Lotus petals, palm fronds, sea fans and solar petals.
 */
export function petal(
  len: number,
  width: number,
  cup = 0.2,
  curl = 0.15,
  base = 0,
  nu = 6,
  nv = 3,
): BufferGeometry {
  return cached(`petal${len},${width},${cup},${curl},${base},${nu},${nv}`, () => {
    const pos: number[] = [];
    const tint: number[] = [];
    const idx: number[] = [];
    const th = Math.max(0.02, width * 0.06);
    for (const side of [0, 1])
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const w = width * Math.sin(Math.PI * Math.pow(u, 0.75)) ** 0.85 * (i === nu ? 0 : 1);
        for (let j = 0; j <= nv; j++) {
          const v = (j / nv) * 2 - 1;
          const y = cup * v * v * (w / width) + curl * u * u * len - side * th;
          pos.push(v * w * 0.5, y, u * len);
          tint.push(base * (1 - u) ** 1.5);
        }
      }
    const row = nv + 1;
    const half = (nu + 1) * row;
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a = i * row + j;
        const [b, c, d] = [a + row, a + 1, a + row + 1];
        idx.push(a, c, b, c, d, b); // top faces up
        idx.push(half + a, half + b, half + c, half + c, half + b, half + d); // underside faces down
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('tint', new Float32BufferAttribute(tint, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * A karst sea stack `H` tall above the water and `r` across at the foot: tapering, bulging and ribbed with height,
 * cut in by the waves just above the waterline, flaring a little under its crown, craggy all over; dark and wet at
 * the foot, banded above.
 */
export function pillar(r: number, H: number, seed: number): BufferGeometry {
  return cached(`pillar${r.toFixed(2)},${H.toFixed(2)},${seed}`, () => {
    const depth = 5;
    const g = new CylinderGeometry(1, 1, H + depth, 14, 14).translate(0, (H + depth) / 2 - depth, 0);
    const p = g.attributes.position!;
    const tint: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
      const t = Math.max(0, y) / H;
      const a = Math.atan2(z, x);
      const notch = 1 - 0.2 * Math.exp(-(((y - 0.9) / 0.9) ** 2));
      const crown = 1 + 0.12 * Math.exp(-(((t - 0.93) / 0.07) ** 2));
      const rib = 1 + 0.07 * Math.sin(a * 5 + seed + t * 3) + 0.05 * Math.sin(t * 13 + seed * 2);
      const prof = (1 - 0.38 * t) * notch * crown * rib * (y < 0 ? 1.08 : 1);
      const rr = Math.hypot(x, z) ? r * prof : 0;
      const len = Math.hypot(x, z) || 1;
      p.setXYZ(i, (x / len) * rr, y, (z / len) * rr);
      tint.push(y < 1.4 ? -0.3 : (Math.sin(y * 1.7 + seed) > 0.6 ? 0.1 : 0) - (t > 0.97 ? 0.1 : 0));
    }
    craggy(g, r * 0.07, seed, 0.15);
    g.setAttribute('tint', new Float32BufferAttribute(tint, 1));
    return g;
  });
}

/** `g` with a second, inward-facing copy: an open bowl or sheet that reads from both sides. */
export function twoSided(g: BufferGeometry): BufferGeometry {
  const a = g.index ? g.toNonIndexed() : g.clone();
  a.deleteAttribute('uv');
  const b = a.clone();
  const p = b.attributes.position!;
  const n = b.attributes.normal!;
  for (let i = 0; i < p.count; i += 3) {
    // Swap the 2nd and 3rd corner of each triangle (reversed winding) and turn the normals round.
    for (const attr of [p, n]) {
      const [x, y, z] = [attr.getX(i + 1), attr.getY(i + 1), attr.getZ(i + 1)];
      attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
      attr.setXYZ(i + 2, x, y, z);
    }
  }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return mergeGeometries([a, b])!;
}

/** A triangle (both faces): a sail or a pennant, `w` along +x at its foot and `h` up. */
export const sail = (w: number, h: number) =>
  cached(`sail${w},${h}`, () => {
    const g = new BufferGeometry();
    const v = [0, 0, 0, w, 0, 0, 0, h, 0];
    g.setAttribute('position', new Float32BufferAttribute([...v, ...v], 3));
    g.setIndex([0, 1, 2, 3, 5, 4]);
    g.computeVertexNormals();
    return g;
  });

const _m = new Matrix4();
const _q = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);

/** A matrix that stands a +y-up unit part (`CYL`) from `a` to `b` with radius `r`. */
export function span(a: Vector3, b: Vector3, r: number, rz = r): Matrix4 {
  _a.subVectors(b, a);
  const len = _a.length();
  _q.setFromUnitVectors(UP, _a.normalize());
  return _m.compose(a, _q, _s.set(r, len, rz));
}

/** A rope (or a chain of planks' rail) as `n` straight pieces sagging by `sag` between `a` and `b`. */
export function rope(
  k: Kit,
  a: Vector3,
  b: Vector3,
  sag: number,
  r: number,
  col: ColorRepresentation,
  n = 8,
): void {
  for (let i = 0; i < n; i++) {
    const p0 = _a.lerpVectors(a, b, i / n).clone();
    p0.y -= sag * 4 * (i / n) * (1 - i / n);
    const p1 = _b.lerpVectors(a, b, (i + 1) / n);
    p1.y -= sag * 4 * ((i + 1) / n) * (1 - (i + 1) / n);
    k.part(ROD, span(p0, p1, r), col, SURF.matte);
  }
}

/** A palm: a curving trunk of tapering segments leaning by `lean` toward `dir`, a crown of drooping fronds. */
export function palm(k: Kit, x: number, y: number, z: number, h: number, dir: number, seed: number): void {
  const segs = 6;
  const lean = 0.18 + hash2(seed, 1, 31) * 0.2;
  let [px, py, pz] = [x, y, z];
  for (let i = 0; i < segs; i++) {
    const t = (i + 1) / segs;
    const off = lean * h * t * t;
    const nx = x + Math.sin(dir) * off;
    const nz = z + Math.cos(dir) * off;
    const ny = y + h * t;
    k.part(
      CYL8,
      span(_a.set(px, py, pz).clone(), _b.set(nx, ny, nz), 0.17 * (1.25 - t * 0.45)),
      0x8b6b48,
      SURF.wood,
    );
    [px, py, pz] = [nx, ny, nz];
  }
  const fronds = 8;
  for (let f = 0; f < fronds; f++) {
    const ry = (f / fronds) * Math.PI * 2 + seed;
    k.part(
      petal(h * 0.48, h * 0.16, -0.06, -0.55, -0.25, 5, 2),
      tf(px, py, pz, -0.35, ry, 0),
      f % 2 ? 0x4f9e48 : 0x5fb352,
      SURF.leaf,
    );
  }
  for (let c = 0; c < 3; c++)
    k.part(
      TINY,
      tf(px + Math.cos(c * 2.1) * 0.22, py - 0.25, pz + Math.sin(c * 2.1) * 0.22, 0, 0, 0, 0.16),
      0x6b4a2a,
      SURF.wood,
    );
}

/** A broad-leaf tree: trunk and a clumped canopy of three craggy lobes in two greens. */
export function tree(k: Kit, x: number, y: number, z: number, h: number, seed: number): void {
  const H = (q: number) => hash2(seed, q, 47);
  k.part(CYL8, tf(x, y, z, 0, 0, 0, 0.16 * h * 0.3, h * 0.6, 0.16 * h * 0.3), 0x7a5a3a, SURF.wood);
  const greens = [0x3f8f4a, 0x56a84f, 0x6dbb5a, 0x2f7a45];
  for (let l = 0; l < 3; l++) {
    const a = l * 2.1 + H(1) * 6;
    const s = h * (0.34 + H(2 + l) * 0.12);
    k.part(
      boulder(seed + l, 1),
      tf(
        x + Math.cos(a) * h * 0.18,
        y + h * (0.62 + l * 0.08),
        z + Math.sin(a) * h * 0.18,
        0,
        a,
        0,
        s,
        s * 0.78,
        s,
      ),
      greens[(seed + l) % 4]!,
      SURF.leaf,
    );
  }
}

/** A branching coral: a trunk splitting twice into tapering, upturned branches, with glowing tips at night. */
export function coral(k: Kit, x: number, y: number, z: number, s: number, col: number, seed: number): void {
  const branch = (p: Vector3, dir: Vector3, len: number, r: number, depth: number) => {
    const end = p.clone().addScaledVector(dir, len);
    k.part(ROD, span(p, end, r), col, SURF.matte, 0.15);
    if (depth === 0) {
      k.part(TINY, tf(end.x, end.y, end.z, 0, 0, 0, r * 1.5), col, SURF.matte, 0.9);
      return;
    }
    for (let b = 0; b < 2; b++) {
      const a = hash2(seed, depth * 7 + b, 59) * 6.28;
      const d = new Vector3(dir.x + Math.cos(a) * 0.6, dir.y + 0.25, dir.z + Math.sin(a) * 0.6).normalize();
      branch(end, d, len * 0.72, r * 0.7, depth - 1);
    }
  };
  branch(new Vector3(x, y, z), new Vector3(0, 1, 0), s, s * 0.14, 2);
}
