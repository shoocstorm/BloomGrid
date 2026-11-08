import type { Grid } from '@/sim/Grid';
import { BRIDGE } from '@/sim/City';

/**
 * Sea routes for the cruise ferry (D-141): where its pier goes, and a smooth water-only course from the pier to a
 * sea wonder and back. Pure functions of the grid (heights and bridge tiles), so they are tested headless and
 * recomputed when the coast or a bridge changes. Routing runs on a coarse grid of `CELL`-tile cells: a cell is open
 * when all of it is deeper than `DRAUGHT`, and the course keeps `CLEAR` cells of open water on every side (the
 * ferry is 22 tiles long and 4 wide), preferring wider water.
 */

export type P2 = [number, number];

const CELL = 4;
/** Deeper than this everywhere in a cell (the hull's keel sits 0.7 under the surface). */
const DRAUGHT = -0.9;
/** Cells of open water the course keeps round it (one cell is 4 tiles). */
const CLEAR = 2;
/** Pier length (tiles from the shoreline), and the berth: ship centre this far along, this far to the pier's side. */
export const PIER_LEN = 22;
export const BERTH_ALONG = 13;
export const BERTH_SIDE = 3.3;

export interface Pier {
  /** First water tile off the shore (pier root), in tile coordinates. */
  x: number;
  z: number;
  /** Unit cardinal direction out to sea along the pier. */
  dx: number;
  dz: number;
  /** Which side of the pier the ferry berths on: +1 to the pier's right (looking out to sea), −1 to its left. */
  side: number;
}

/** Coarse water map: open cells and their clearance (cells to the nearest closed one). */
export interface SeaMap {
  n: number;
  open: Uint8Array;
  clear: Uint16Array;
}

/** The coarse sea; `obstacles` (Aeroline pylons, x, z) close the cells round them, so courses never thread a viaduct. */
export function seaMap(g: Grid, obstacles: readonly P2[] = []): SeaMap {
  const n = Math.floor(g.w / CELL);
  const open = new Uint8Array(n * n);
  for (let cz = 0; cz < n; cz++)
    for (let cx = 0; cx < n; cx++) {
      let ok = true;
      for (let j = 0; j <= CELL && ok; j++)
        for (let i = 0; i <= CELL && ok; i++)
          if (g.corner(cx * CELL + i, cz * CELL + j) > DRAUGHT) ok = false;
      for (let j = 0; j < CELL && ok; j++)
        for (let i = 0; i < CELL && ok; i++)
          if (g.road[g.index(cx * CELL + i, cz * CELL + j)] === BRIDGE) ok = false;
      open[cz * n + cx] = ok ? 1 : 0;
    }
  for (const [x, z] of obstacles) {
    const [cx, cz] = [Math.floor(x / CELL), Math.floor(z / CELL)];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        if (cx + dx >= 0 && cz + dz >= 0 && cx + dx < n && cz + dz < n) open[(cz + dz) * n + cx + dx] = 0;
  }
  // Clearance: breadth-first from every closed cell (the map's edge counts as open sea).
  const clear = new Uint16Array(n * n).fill(0xffff);
  const queue: number[] = [];
  for (let i = 0; i < n * n; i++)
    if (!open[i]) {
      clear[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % n;
    const z = (i / n) | 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const j = nz * n + nx;
        if (clear[j]! > clear[i]! + 1) {
          clear[j] = clear[i]! + 1;
          queue.push(j);
        }
      }
  }
  return { n, open, clear };
}

const cellOf = (m: SeaMap, p: P2): number =>
  Math.min(m.n - 1, Math.max(0, Math.floor(p[1] / CELL))) * m.n +
  Math.min(m.n - 1, Math.max(0, Math.floor(p[0] / CELL)));
const centre = (m: SeaMap, c: number): P2 => [(c % m.n) * CELL + CELL / 2, ((c / m.n) | 0) * CELL + CELL / 2];
const sails = (m: SeaMap, c: number) => m.clear[c]! >= CLEAR;

/** The nearest cell to `p` the ferry can sail in. */
function nearestSailable(m: SeaMap, p: P2): number {
  const c0 = cellOf(m, p);
  if (sails(m, c0)) return c0;
  const [x0, z0] = [c0 % m.n, (c0 / m.n) | 0];
  for (let r = 1; r < m.n; r++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const [x, z] = [x0 + dx, z0 + dz];
        if (x >= 0 && z >= 0 && x < m.n && z < m.n && sails(m, z * m.n + x)) return z * m.n + x;
      }
  return c0;
}

/** Is the straight line a → b (tile coordinates) over sailable cells? */
function lineClear(m: SeaMap, a: P2, b: P2): boolean {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL * 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (!sails(m, cellOf(m, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]))) return false;
  }
  return true;
}

/**
 * A water-only course from `a` to `b` (tile coordinates): A* over sailable cells (8 neighbours, narrow water costs
 * more), then pulled straight wherever the line is clear. Both ends are kept even when they sit closer to the coast
 * than the course may (the pier's offing, a wonder's loop); null if the sea doesn't connect them.
 */
export function seaRoute(m: SeaMap, a: P2, b: P2): P2[] | null {
  const s = nearestSailable(m, a);
  const t = nearestSailable(m, b);
  const N = m.n * m.n;
  const gs = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  const [tx, tz] = [t % m.n, (t / m.n) | 0];
  const hz = (c: number) => {
    const dx = Math.abs((c % m.n) - tx);
    const dz = Math.abs(((c / m.n) | 0) - tz);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  // A binary heap of [f, cell].
  const heap: [number, number][] = [];
  const push = (f: number, c: number) => {
    heap.push([f, c]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let k = i;
        if (l < heap.length && heap[l]![0] < heap[k]![0]) k = l;
        if (r < heap.length && heap[r]![0] < heap[k]![0]) k = r;
        if (k === i) break;
        [heap[k], heap[i]] = [heap[i]!, heap[k]!];
        i = k;
      }
    }
    return top;
  };
  gs[s] = 0;
  push(hz(s), s);
  while (heap.length) {
    const [, c] = pop();
    if (done[c]) continue;
    done[c] = 1;
    if (c === t) break;
    const [x, z] = [c % m.n, (c / m.n) | 0];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const [nx, nz] = [x + dx, z + dz];
        if (nx < 0 || nz < 0 || nx >= m.n || nz >= m.n) continue;
        const j = nz * m.n + nx;
        if (done[j] || !sails(m, j)) continue;
        // Narrow water costs more: the course keeps to open sea where it can.
        const g = gs[c]! + (dx && dz ? 1.414 : 1) * (1 + 2.5 / Math.min(m.clear[j]!, 6));
        if (g < gs[j]!) {
          gs[j] = g;
          from[j] = c;
          push(g + hz(j), j);
        }
      }
  }
  if (!done[t]) return null;
  const cells: number[] = [];
  for (let c = t; c !== -1; c = from[c]!) cells.push(c);
  cells.reverse();
  const pts: P2[] = [a, ...cells.slice(1, -1).map((c) => centre(m, c)), b];
  // String-pull: from each kept point, jump to the furthest point still in clear sight (the ends exempt).
  const out: P2[] = [pts[0]!];
  let i = 0;
  while (i < pts.length - 1) {
    let k = pts.length - 1;
    while (
      k > i + 1 &&
      !lineClear(m, i === 0 ? centre(m, s) : pts[i]!, k === pts.length - 1 ? centre(m, t) : pts[k]!)
    )
      k--;
    out.push(pts[k]!);
    i = k;
  }
  return out;
}

/**
 * Chaikin corner cutting, `n` rounds; the end points stay put. Long legs are split into `step`-tile pieces first:
 * a cut reaches a quarter of a leg in from each corner, which on a long leg would swing the course across the headland
 * it was pulled tight round.
 */
export function smooth(pts: P2[], n = 3, step = 6): P2[] {
  let p: P2[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 1; j <= k; j++) p.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  for (let r = 0; r < n; r++) {
    if (p.length < 3) return p;
    const q: P2[] = [p[0]!];
    for (let i = 0; i < p.length - 1; i++) {
      const [a, b] = [p[i]!, p[i + 1]!];
      if (i > 0) q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      if (i < p.length - 2) q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]!);
    p = q;
  }
  return p;
}

/**
 * Where the ferry's pier goes: the shore point nearest `prefer` with a clear run of deep water straight out to sea
 * along a cardinal direction (the pier, then the berth beside it, then room to turn), and no bridge or land in the
 * strip. Null on a coast with no such place.
 */
export function findPier(g: Grid, prefer: P2, radius = 90, obstacles: readonly P2[] = []): Pier | null {
  const DIRS: P2[] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  const centre = (x: number, z: number) => g.heightAt(x + 0.5, z + 0.5);
  /** Water at (x, z): its centre below `d`, or (for deep needs) every corner; never a bridge. */
  const near = (x: number, z: number) =>
    obstacles.some(([ox, oz]) => Math.abs(ox - x - 0.5) < 6 && Math.abs(oz - z - 0.5) < 6);
  const water = (x: number, z: number, d: number) =>
    !near(x, z) &&
    g.inBounds(x, z) &&
    g.inBounds(x + 1, z + 1) &&
    g.road[g.index(x, z)] !== BRIDGE &&
    (d >= 0 ? centre(x, z) < d : g.rangeOver(x, z, 1, 1).max < d);
  let best: Pier | null = null;
  let bestD = Infinity;
  const [px, pz] = [Math.round(prefer[0]), Math.round(prefer[1])];
  for (let z = pz - radius; z <= pz + radius; z++)
    for (let x = px - radius; x <= px + radius; x++) {
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 >= bestD || !g.inBounds(x, z) || centre(x, z) < 0.05) continue;
      for (const [dx, dz] of DIRS) {
        // The first tile off this land tile must be water: the pier's root.
        if (!water(x + dx, z + dz, 0.05)) continue;
        let found = false;
        for (const side of [1, -1]) {
          // The pier's right, looking out to sea.
          const [rx, rz] = [-dz * side, dx * side];
          let ok = true;
          for (let k = 1; k <= PIER_LEN + 34 && ok; k++)
            for (let l = -2; l <= 7 && ok; l++) {
              if (l < 0 && k > PIER_LEN) continue;
              // The pier may start in the shallows; beside it the berth and the turning water must be deep.
              const need = k <= 3 || l < 1 ? 0.05 : k <= 6 ? -0.4 : DRAUGHT;
              if (!water(x + dx * k + rx * l, z + dz * k + rz * l, need)) ok = false;
            }
          if (!ok) continue;
          best = { x: x + dx, z: z + dz, dx, dz, side };
          bestD = d2;
          found = true;
          break;
        }
        if (found) break;
      }
    }
  return best;
}

/** The pier's frame: a point `along` tiles out from its root and `across` to its berth side, at tile centres. */
export function pierPoint(p: Pier, along: number, across: number): P2 {
  const [rx, rz] = [-p.dz * p.side, p.dx * p.side];
  return [p.x + 0.5 + p.dx * along + rx * across, p.z + 0.5 + p.dz * along + rz * across];
}

/** A course sampled by arc length: positions and headings anywhere along it. */
export class Course {
  readonly pts: P2[];
  readonly at: Float32Array;
  readonly length: number;

  constructor(pts: P2[]) {
    this.pts = pts;
    this.at = new Float32Array(pts.length);
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      s += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
      this.at[i] = s;
    }
    this.length = s;
  }

  /** Position at arc length `s` into `out` [x, z]; returns the heading (atan2(dz, dx)) there. */
  sample(s: number, out: P2): number {
    const { at, pts } = this;
    const v = Math.min(this.length, Math.max(0, s));
    let lo = 0;
    let hi = at.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (at[mid]! <= v) lo = mid;
      else hi = mid;
    }
    const seg = at[hi]! - at[lo]! || 1;
    const t = (v - at[lo]!) / seg;
    const [a, b] = [pts[lo]!, pts[hi]!];
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    // Heading eased across the joint ahead, so the bow swings rather than snaps (points are a tile or so apart).
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
}

/**
 * One voyage's course from the turning point off the pier, out to wonder `site` (a full sightseeing loop of radius
 * `r` round it, clockwise) and back in to the berth. `loop` gives where the loop starts and ends along it.
 */
export function voyageCourse(
  m: SeaMap,
  pier: Pier,
  site: P2,
  r: number,
): { course: Course; loop: [number, number] } | null {
  const turn = pierPoint(pier, BERTH_ALONG + 18, BERTH_SIDE);
  const offing = pierPoint(pier, BERTH_ALONG + 34, BERTH_SIDE);
  const berth = pierPoint(pier, BERTH_ALONG, BERTH_SIDE);
  // Enter the loop on the side facing the offing.
  const a0 = Math.atan2(offing[1] - site[1], offing[0] - site[0]);
  const entry: P2 = [site[0] + Math.cos(a0) * r, site[1] + Math.sin(a0) * r];
  const out = seaRoute(m, offing, entry);
  if (!out) return null;
  const loop: P2[] = [];
  const K = Math.max(24, Math.round((Math.PI * 2 * r) / 3));
  for (let k = 1; k < K; k++) {
    const a = a0 + (k / K) * Math.PI * 2;
    loop.push([site[0] + Math.cos(a) * r, site[1] + Math.sin(a) * r]);
  }
  const back = [...out].reverse();
  const head = smooth([turn, ...out], 3);
  const tail = smooth([entry, ...back.slice(1)], 3);
  const pts: P2[] = [...head, ...loop, ...tail, turn, berth];
  // Drop near-duplicates (a zero-length segment has no heading).
  const clean: P2[] = [pts[0]!];
  for (const p of pts.slice(1)) {
    const q = clean[clean.length - 1]!;
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) clean.push(p);
  }
  const course = new Course(clean);
  const s0 = new Course([...head]).length;
  const s1 = s0 + new Course([entry, ...loop, entry]).length;
  return { course, loop: [s0, s1] };
}
