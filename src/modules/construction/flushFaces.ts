/**
 * Flush faces (D-237, D-238). Recipes often stack or butt pieces whose faces meet exactly: a glass drum inside a
 * concrete ring, a rail on a moss bed, seating slabs of two colours, a pool's water level with its deck, a glazed
 * colonnade flush with its podium's front. Two coplanar faces of different looks z-fight at any distance and flash as
 * the camera moves. Rather than nudge every recipe by hand, templates move the smaller piece's face out by a few
 * millimetres (invisible, but a margin the depth buffer resolves): its top up, a wall out (the piece widens about its
 * centre), a cylinder's radius out.
 */
import type { Matrix4 } from 'three/webgpu';

const BOXES = new Set(['slab', 'plinth', 'glassBox', 'mossBox', 'pitch', 'pool', 'timberBox', 'screen']);
const CYLINDERS = new Set(['glassCyl', 'concreteCyl', 'algaeTank']);
/** Faces closer than this count as flush. */
const FLUSH = 0.003;
/** How far a covered face moves out per layer, and the most layers stacked. */
export const FACE_LIFT = 0.004;
const MAX_LAYERS = 4;

interface Flat {
  piece: string;
  local: Matrix4;
  tint: number;
  door?: unknown;
  spin?: unknown;
}

/** One planar face: plane `n · p = d` (n horizontal for walls, up for tops), extent along the plane's axes. */
interface Face {
  p: Flat;
  /** Which local axis the face sits across (0 = x, 1 = y top, 2 = z) and the piece's cylinder flag. */
  axis: number;
  nx: number;
  nz: number;
  d: number;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  area: number;
  layer: number;
}

const differ = (a: Flat, b: Flat) => a.piece !== b.piece || a.tint !== b.tint;

/** Upright pieces only (turned about y alone), with their columns. */
function upright(p: Flat): readonly number[] | null {
  if (p.door || p.spin) return null;
  const e = p.local.elements;
  const h = Math.hypot(e[4]!, e[5]!, e[6]!);
  return h > 1e-6 && e[5]! / h >= 0.999 ? e : null;
}

function facesOf(p: Flat): Face[] {
  const e = upright(p);
  if (!e || !BOXES.has(p.piece)) return [];
  const [cx, cz, y0, y1] = [e[12]!, e[14]!, e[13]!, e[13]! + e[5]!];
  const out: Face[] = [];
  // Top: across y, extent the footprint (a conservative box for turned pieces).
  const hx = (Math.abs(e[0]!) + Math.abs(e[8]!)) * 0.5;
  const hz = (Math.abs(e[2]!) + Math.abs(e[10]!)) * 0.5;
  out.push({ p, axis: 1, nx: 0, nz: 0, d: y1, a0: cx - hx, a1: cx + hx, b0: cz - hz, b1: cz + hz, area: 4 * hx * hz, layer: 0 });
  // Walls: ± each horizontal local axis; extent along the other axis and in height.
  for (const [axis, i, j] of [[0, 0, 8], [2, 8, 0]] as const) {
    const len = Math.hypot(e[i]!, e[i + 2]!);
    const wid = Math.hypot(e[j]!, e[j + 2]!);
    if (len < 1e-6 || wid < 1e-6) continue;
    const [ux, uz] = [e[i]! / len, e[i + 2]! / len];
    for (const s of [1, -1]) {
      const [nx, nz] = [ux * s, uz * s];
      const t = cx * -nz + cz * nx;
      out.push({ p, axis, nx, nz, d: cx * nx + cz * nz + len / 2, a0: t - wid / 2, a1: t + wid / 2, b0: y0, b1: y1, area: wid * (y1 - y0), layer: 0 });
    }
  }
  return out;
}

/** Greedy layers: each face takes the lowest layer none of the larger differing faces it overlaps holds. */
function layer(faces: Face[], same: (a: Face, b: Face) => boolean): void {
  faces.sort((a, b) => a.d - b.d || b.area - a.area);
  for (let i = 0; i < faces.length; i++) {
    const a = faces[i]!;
    const taken = new Set<number>();
    for (let j = i - 1; j >= 0 && a.d - faces[j]!.d <= FLUSH; j--) {
      const b = faces[j]!;
      if (!same(a, b) || !differ(a.p, b.p)) continue;
      if (Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0) <= 0.01 || Math.min(a.b1, b.b1) - Math.max(a.b0, b.b0) <= 0.01) continue;
      taken.add(b.layer);
    }
    while (taken.has(a.layer) && a.layer < MAX_LAYERS) a.layer++;
  }
}

/** Moves flush faces of differing pieces apart in place (the larger stays); returns how many pieces moved. */
export function separateFlushFaces(pieces: readonly Flat[]): number {
  const faces = pieces.flatMap(facesOf);
  // Tops: one plane family. Walls: grouped by direction (rounded), then by offset.
  layer(faces.filter((f) => f.axis === 1), () => true);
  const walls = faces.filter((f) => f.axis !== 1);
  const byDir = new Map<string, Face[]>();
  for (const f of walls) {
    const k = `${Math.round(f.nx * 1e3)},${Math.round(f.nz * 1e3)}`;
    (byDir.get(k) ?? byDir.set(k, []).get(k)!).push(f);
  }
  for (const group of byDir.values()) layer(group, () => true);
  // Coaxial cylinders of one radius: the shorter one's radius grows.
  const cyls = pieces
    .map((p) => ({ p, e: CYLINDERS.has(p.piece) ? upright(p) : null }))
    .filter((c): c is { p: Flat; e: readonly number[] } => c.e !== null)
    .map(({ p, e }) => ({ p, x: e[12]!, z: e[14]!, r: Math.hypot(e[0]!, e[2]!) / 2, y0: e[13]!, y1: e[13]! + e[5]!, layer: 0 }));
  cyls.sort((a, b) => a.r - b.r || b.y1 - b.y0 - (a.y1 - a.y0));
  for (let i = 0; i < cyls.length; i++) {
    const a = cyls[i]!;
    const taken = new Set<number>();
    for (let j = i - 1; j >= 0 && a.r - cyls[j]!.r <= FLUSH; j--) {
      const b = cyls[j]!;
      if (!differ(a.p, b.p) || Math.hypot(a.x - b.x, a.z - b.z) > FLUSH) continue;
      if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 0.01) continue;
      taken.add(b.layer);
    }
    while (taken.has(a.layer) && a.layer < MAX_LAYERS) a.layer++;
  }

  const moved = new Set<Flat>();
  // Per piece and axis, the largest move any of its faces needs (both walls of an axis move together).
  const grow = new Map<Flat, [number, number, number]>();
  const need = (p: Flat, axis: number, by: number) => {
    const g = grow.get(p) ?? grow.set(p, [0, 0, 0]).get(p)!;
    g[axis] = Math.max(g[axis]!, by);
  };
  for (const f of faces) if (f.layer) need(f.p, f.axis, f.layer * FACE_LIFT);
  for (const c of cyls)
    if (c.layer) {
      need(c.p, 0, c.layer * FACE_LIFT);
      need(c.p, 2, c.layer * FACE_LIFT);
    }
  for (const [p, [gx, gy, gz]] of grow) {
    const e = p.local.elements;
    // Top: stretch y about the base. Walls: widen the axis about the centre by twice the move (each face moves out).
    if (gy) scaleColumn(e, 4, (e[5]! + gy) / e[5]!);
    if (gx) scaleColumn(e, 0, 1 + (2 * gx) / Math.hypot(e[0]!, e[2]!));
    if (gz) scaleColumn(e, 8, 1 + (2 * gz) / Math.hypot(e[8]!, e[10]!));
    moved.add(p);
  }
  return moved.size;
}

function scaleColumn(e: number[], i: number, k: number): void {
  e[i]! *= k;
  e[i + 1]! *= k;
  e[i + 2]! *= k;
}
