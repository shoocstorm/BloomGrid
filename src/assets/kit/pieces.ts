import {
  BoxGeometry,
  TorusGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BufferAttribute, BufferGeometry as Geo } from 'three/webgpu';

/**
 * Procedural modular kit. Every piece is a unit-sized geometry with its pivot at the base
 * centre, rendered through the shared material library. Building recipes compose pieces;
 * GLB hero assets register additional pieces at runtime via `registerPiece`.
 */
export interface PieceType {
  id: string;
  geometry: BufferGeometry;
  material: string;
  castShadow: boolean;
  receiveShadow: boolean;
  /** Cull distance in world units (before quality scaling). */
  lod: number;
  /**
   * A simplified model drawn from `at` world units out (before quality scaling) up to `lod` (D-150). Same pivot,
   * size and attribute layout (`uv` tags included) as `geometry`, so the material reads it the same way. Wild
   * greenery is most of the island's triangles; a distant palm a few pixels tall does not need 332.
   */
  far?: { geometry: BufferGeometry; at: number };
}

const pieces = new Map<string, PieceType>();

export function registerPiece(p: Omit<PieceType, 'castShadow' | 'receiveShadow' | 'lod'> & Partial<PieceType>): PieceType {
  const full: PieceType = { castShadow: true, receiveShadow: true, lod: Infinity, ...p };
  pieces.set(p.id, full);
  return full;
}

export function getPiece(id: string): PieceType {
  const p = pieces.get(id);
  if (!p) throw new Error(`Unknown piece "${id}"`);
  return p;
}

export function pieceIds(): string[] {
  return [...pieces.keys()];
}

export function hasPiece(id: string): boolean {
  return pieces.has(id);
}

/** Deterministic vertex jitter so low-poly foliage looks organic (shared vertices stay welded). */
function jitter(g: BufferGeometry, amount: number): BufferGeometry {
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719) * 43758.5453;
    const n = (k - Math.floor(k) - 0.5) * amount;
    const len = Math.hypot(x, y, z) || 1;
    pos.setXYZ(i, x + (x / len) * n, y + (y / len) * n, z + (z / len) * n);
  }
  g.computeVertexNormals();
  return g;
}

const base = (g: BufferGeometry, y = 0.5) => g.translate(0, y, 0);

function grassGeometry(): BufferGeometry {
  const verts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const c = Math.cos(a) * 0.18;
    const s = Math.sin(a) * 0.18;
    const lean = 0.15 * (i - 1);
    verts.push(-c, 0, -s, c, 0, s, lean, 1, lean * 0.5);
  }
  const g = new Geo();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((verts.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

function petalGeometry(): BufferGeometry {
  const g = new PlaneGeometry(1, 0.38, 8, 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5;
    const taper = Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.92 + 0.08)), 0.7);
    pos.setXYZ(i, u, Math.sin(u * Math.PI) * 0.06, pos.getZ(i) * taper);
  }
  g.computeVertexNormals();
  return g;
}

function fungusGeometry(): BufferGeometry {
  const stem = new CylinderGeometry(0.1, 0.14, 0.42, 6).translate(0, 0.21, 0);
  const cap = new SphereGeometry(0.42, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.38, 0);
  return mergeGeometries([stem.toNonIndexed(), cap.toNonIndexed()])!;
}

/** Collects flat triangles with a `uv` tag (x = part, y = how far out along a leaf, for sway). */
class Tris {
  pos: number[] = [];
  uv: number[] = [];
  tri(a: number[], b: number[], c: number[], part: number, ta: number, tb = ta, tc = ta): void {
    this.pos.push(...a, ...b, ...c);
    this.uv.push(part, ta, part, tb, part, tc);
  }
  quad(a: number[], b: number[], c: number[], d: number[], part: number, ta: number, tb: number): void {
    this.tri(a, b, c, part, ta, ta, tb);
    this.tri(a, c, d, part, ta, tb, tb);
  }
  build(): BufferGeometry {
    const g = new Geo();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.computeVertexNormals();
    return g;
  }
}

/** Part tags in a tropical piece's `uv.x` (the `palm` material colours by them). */
export const PART = { trunk: 0, leaf: 1, nut: 2 } as const;

/**
 * One leaf as a folded blade: a raised midrib and two lowered edges, so it reads as a leaf (not a sheet) from the
 * side and catches light on both halves. `path(t)` is the midrib, `width(t)` the half-width; `side` is a horizontal
 * unit vector across the blade.
 */
function blade(out: Tris, path: (t: number) => number[], width: (t: number) => number, side: number[], fold: number, segs: number, part = 1, flat = false): void {
  let prev: number[][] | null = null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const m = path(t);
    const w = width(t);
    const l = [m[0]! - side[0]! * w, m[1]! - w * fold, m[2]! - side[2]! * w];
    const r = [m[0]! + side[0]! * w, m[1]! - w * fold, m[2]! + side[2]! * w];
    const row = [l, m, r];
    if (prev) {
      const t0 = (i - 1) / segs;
      // Far models skip the midrib: one quad edge to edge (the fold is invisible at a few pixels).
      if (flat) out.quad(prev[0]!, row[0]!, row[2]!, prev[2]!, part, t0, t);
      else {
        out.quad(prev[0]!, row[0]!, row[1]!, prev[1]!, part, t0, t);
        out.quad(prev[1]!, row[1]!, row[2]!, prev[2]!, part, t0, t);
      }
    }
    prev = row;
  }
}

/**
 * Coconut palm, about 1 unit tall: a slim ringed trunk curving to +x, a crown of arching folded fronds that droop
 * at the tips, and a cluster of nuts under them. Trunk, fronds and nuts are one mesh (one draw per chunk), told
 * apart by `uv.x` (see `PART`). Scaled flat and wide it doubles as a tree fern. `far` is the distant model
 * (D-150): the same trunk curve and fronds in a fraction of the triangles (≈ 50 instead of 332), no nuts.
 */
function palmGeometry(far = false): BufferGeometry {
  const out = new Tris();
  const lean = 0.16;
  const trunkAt = (t: number) => [lean * t * t, t * 0.86, 0];
  const R = far ? 3 : 6;
  const SEG = far ? 2 : 7;
  for (let i = 0; i < SEG; i++) {
    const [t0, t1] = [i / SEG, (i + 1) / SEG];
    const [c0, c1] = [trunkAt(t0), trunkAt(t1)];
    // Rings: each segment flares slightly at its foot, like old frond scars.
    const [r0, r1] = [0.042 - 0.016 * t0, 0.034 - 0.016 * t1];
    for (let k = 0; k < R; k++) {
      const [a0, a1] = [(k / R) * Math.PI * 2, ((k + 1) / R) * Math.PI * 2];
      const p = (c: number[], r: number, a: number) => [c[0]! + Math.cos(a) * r, c[1]!, c[2]! + Math.sin(a) * r];
      out.quad(p(c0, r0, a0), p(c1, r1, a0), p(c1, r1, a1), p(c0, r0, a1), PART.trunk, t0 * 0.3, t1 * 0.3);
    }
  }
  const top = trunkAt(1);
  // Fronds: two whorls, the lower drooping further. Golden-angle spacing so no two line up.
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = i * 2.39996;
    const low = i % 2;
    const len = 0.5 + 0.08 * Math.sin(i * 1.7) - low * 0.05;
    const rise = low ? 0.04 : 0.12;
    const droop = low ? 0.42 : 0.3;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    const side = [-dz, 0, dx];
    const path = (t: number) => [top[0]! + dx * len * t, top[1]! + rise * t * 2 - droop * t * t - 0.01, top[2]! + dz * len * t];
    blade(out, path, (t) => 0.075 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)) * (1 - t * 0.25), side, 0.45, far ? 2 : 6, 1, far);
  }
  if (far) return out.build();
  // A short spike of new leaf at the centre.
  blade(out, (t) => [top[0]! + 0.02 * t, top[1]! + 0.14 * t, top[2]!], (t) => 0.03 * (1 - t), [1, 0, 0], 0.2, 2);
  // Nuts: three small diamonds under the crown.
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4;
    const c = [top[0]! + Math.cos(a) * 0.035, top[1]! - 0.035, top[2]! + Math.sin(a) * 0.035];
    const r = 0.026;
    const pts = [
      [c[0]! + r, c[1]!, c[2]!],
      [c[0]!, c[1]!, c[2]! + r],
      [c[0]! - r, c[1]!, c[2]!],
      [c[0]!, c[1]!, c[2]! - r],
    ];
    const up = [c[0]!, c[1]! + r, c[2]!];
    const dn = [c[0]!, c[1]! - r, c[2]!];
    for (let k = 0; k < 4; k++) {
      out.tri(pts[k]!, up, pts[(k + 1) % 4]!, PART.nut, 0.3);
      out.tri(pts[(k + 1) % 4]!, dn, pts[k]!, PART.nut, 0.3);
    }
  }
  return out.build();
}

/**
 * Broad-leaf tropical clump (banana, heliconia, elephant ear, bird-of-paradise): big paddle leaves rising from the
 * centre and arching out, within the old round bush's unit volume (radius 0.5, height 1) so every planter, verge
 * and garden that used a round shrub now grows tropical understorey without a new draw call. `far` keeps the
 * leaves' arcs in two flat segments each (28 triangles instead of 168, D-150).
 */
function broadleafGeometry(far = false): BufferGeometry {
  const out = new Tris();
  const N = 7;
  for (let i = 0; i < N; i++) {
    const a = i * 2.39996 + 0.3;
    const inner = i >= 5;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    const side = [-dz, 0, dx];
    const reach = inner ? 0.16 : 0.34 + 0.06 * Math.sin(i * 2.3);
    const height = inner ? 0.95 : 0.62 + 0.12 * Math.cos(i * 1.3);
    // Leaf stalk then blade: up steeply, out and over; outer leaves sag at the tip.
    const path = (t: number) => {
      const out = reach * Math.sin(t * Math.PI * 0.5);
      const y = height * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) - (inner ? 0 : 0.18 * t * t * t);
      return [dx * out, y, dz * out];
    };
    const w = inner ? 0.07 : 0.13;
    // Far: sample the blade, not the thin stalk (t ≥ 0.3), so two segments still read as a leaf.
    if (far) blade(out, (t) => path(0.3 + t * 0.7), (t) => w * Math.pow(Math.sin(Math.PI * Math.min(0.95, t + 0.05)), 0.6) + 0.006, side, 0.3, 2, 1, true);
    else blade(out, path, (t) => (t < 0.3 ? 0.012 : w * Math.pow(Math.sin(Math.PI * ((t - 0.3) / 0.7)), 0.6) + 0.006), side, 0.3, 6);
  }
  return out.build();
}

export function initPieces(): void {
  if (pieces.size) return;
  const box = () => base(new BoxGeometry(1, 1, 1));
  const cyl = (seg = 16) => base(new CylinderGeometry(0.5, 0.5, 1, seg));

  registerPiece({ id: 'slab', geometry: box(), material: 'concrete' });
  registerPiece({ id: 'plinth', geometry: box(), material: 'plinth', castShadow: false });
  registerPiece({ id: 'glassBox', geometry: box(), material: 'glass' });
  registerPiece({ id: 'glassCyl', geometry: cyl(20), material: 'glass' });
  registerPiece({ id: 'concreteCyl', geometry: cyl(16), material: 'concrete' });
  registerPiece({ id: 'mossBox', geometry: box(), material: 'moss' });
  registerPiece({ id: 'algaeTank', geometry: cyl(16), material: 'algae' });
  registerPiece({ id: 'pool', geometry: box(), material: 'pool', castShadow: false });
  registerPiece({ id: 'dome', geometry: new SphereGeometry(0.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), material: 'dome', castShadow: false });
  // Clear glazing for a ribbed dome (one building's skin, not the frosted shared `dome`).
  registerPiece({ id: 'glassDome', geometry: new SphereGeometry(0.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), material: 'domeClear', castShadow: false });
  // A lit device screen (laptops, kiosks): glows in its tint.
  registerPiece({ id: 'screen', geometry: box(), material: 'screen', castShadow: false, lod: 160 });
  registerPiece({ id: 'solarLeaf', geometry: petalGeometry(), material: 'solar' });
  // Living sunflower petal (Bloom Retrofit crowns): flower material, opens and glows with bloom.
  registerPiece({ id: 'sunPetal', geometry: petalGeometry(), material: 'flower' });

  registerPiece({ id: 'trunk', geometry: base(new CylinderGeometry(0.32, 0.5, 1, 6)), material: 'bark', lod: 260 });
  // Far models (D-150): wild greenery is most of a frame's triangles; beyond `at` it draws a fraction of them.
  registerPiece({
    id: 'canopy',
    geometry: base(jitter(new IcosahedronGeometry(0.5, 1), 0.12)),
    material: 'canopy',
    lod: 320,
    far: { geometry: base(jitter(new IcosahedronGeometry(0.5, 0), 0.08)), at: 110 },
  });
  registerPiece({ id: 'bush', geometry: broadleafGeometry(), material: 'bush', lod: 160, far: { geometry: broadleafGeometry(true), at: 60 } });
  // Tropical palm (trunk + fronds + nuts in one mesh, D-127); a tree fern when squashed.
  registerPiece({ id: 'palm', geometry: palmGeometry(), material: 'palm', lod: 280, far: { geometry: palmGeometry(true), at: 80 } });
  registerPiece({ id: 'ivy', geometry: new PlaneGeometry(1, 1, 1, 3).translate(0, -0.5, 0.01), material: 'ivy', castShadow: false, lod: 140 });
  registerPiece({ id: 'grass', geometry: grassGeometry(), material: 'grass', castShadow: false, receiveShadow: false, lod: 90 });
  registerPiece({ id: 'flower', geometry: base(new IcosahedronGeometry(0.5, 0).scale(1, 0.7, 1), 0.35), material: 'flower', castShadow: false, lod: 110 });
  // Lily pad (flat disc) with a small raised flower in the middle.
  const lily = mergeGeometries([
    new CylinderGeometry(0.5, 0.5, 0.04, 10).translate(0, 0.02, 0).toNonIndexed(),
    new IcosahedronGeometry(0.12, 0).scale(1, 0.6, 1).translate(0.08, 0.1, 0.04), // already non-indexed
  ])!;
  registerPiece({ id: 'lily', geometry: lily, material: 'lily', castShadow: false, lod: 120 });
  registerPiece({ id: 'koi', geometry: new IcosahedronGeometry(0.5, 1).scale(1, 0.35, 0.4).translate(0, 0.1, 0), material: 'koi', castShadow: false, lod: 90 });
  registerPiece({ id: 'alert', geometry: base(new OctahedronGeometry(0.5, 0)), material: 'alert', castShadow: false, receiveShadow: false, lod: 400 });
  registerPiece({ id: 'fungus', geometry: fungusGeometry(), material: 'fungus', castShadow: false, lod: 140 });
  // Commuter pod: a rounded capsule (long axis +X) berthed at Pod Docks.
  registerPiece({ id: 'pod', geometry: new SphereGeometry(0.5, 12, 8).scale(1, 0.42, 0.5).translate(0, 0.21, 0), material: 'pod', lod: 200 });
  // Living timber (shaped-wood frames of Living Studios).
  registerPiece({ id: 'timberBox', geometry: box(), material: 'timber' });
  // Woven willow arch (eco-playgrounds): a half torus standing on the ground, spanning x.
  registerPiece({ id: 'willowArch', geometry: new TorusGeometry(0.5, 0.07, 5, 14, Math.PI), material: 'bark', castShadow: false, lod: 180 });
  // Hummingbird drone at rest (Drone Hives): a glossy teardrop with glowing wings.
  registerPiece({ id: 'drone', geometry: base(new OctahedronGeometry(0.5, 0).scale(1, 0.5, 0.45), 0.25), material: 'pod', castShadow: false, lod: 140 });
  // Façade waterfall sheet: unit plane facing +Z with its pivot at the bottom edge.
  // Landmark light-work (Wellspring Spire): a flat halo ring, a tapered spire and thin light ribs.
  registerPiece({ id: 'haloRing', geometry: new TorusGeometry(0.5, 0.025, 8, 72).rotateX(Math.PI / 2), material: 'lumenThin', castShadow: false });
  registerPiece({ id: 'spireCone', geometry: base(new CylinderGeometry(0.02, 0.5, 1, 12)), material: 'glass', castShadow: false });
  registerPiece({ id: 'lumenRib', geometry: cyl(6), material: 'lumen', castShadow: false, lod: 600 });
  registerPiece({ id: 'waterfall', geometry: new PlaneGeometry(1, 1).translate(0, 0.5, 0), material: 'waterfall', castShadow: false, lod: 220 });
}
