import type { Grid } from './Grid';

/** How far (tiles, square ring round the footprint) a building reaches for a highway's utilities. */
export const ROAD_REACH = 10;

/**
 * Utility networks follow the Living Highways: energy and water conduits run beneath them.
 * Connected road tiles form a network component; a building joins a network with a road within
 * `ROAD_REACH` tiles of its footprint (a short service lane: it need not front the highway). With several in
 * reach it joins the **largest** (the trunk, not a stub of street cut short by lots), then the nearer, then the
 * lower id, for determinism.
 */
export class RoadNetworks {
  comp: Int32Array;
  /** Road tiles per network id (from the last recompute). */
  size: number[] = [];
  count = 0;
  dirty = true;
  private queue: Int32Array;

  constructor(private grid: Grid) {
    this.comp = new Int32Array(grid.w * grid.h).fill(-1);
    this.queue = new Int32Array(grid.w * grid.h);
  }

  recompute(): void {
    const g = this.grid;
    const comp = this.comp.fill(-1);
    const q = this.queue;
    let id = 0;
    this.size = [];
    for (let start = 0; start < comp.length; start++) {
      if (!this.passable(start) || comp[start] !== -1) continue;
      let head = 0;
      let tail = 0;
      q[tail++] = start;
      comp[start] = id;
      while (head < tail) {
        const t = q[head++]!;
        const x = t % g.w;
        const z = (t / g.w) | 0;
        if (x > 0) tail = this.push(t - 1, id, tail);
        if (x < g.w - 1) tail = this.push(t + 1, id, tail);
        if (z > 0) tail = this.push(t - g.w, id, tail);
        if (z < g.h - 1) tail = this.push(t + g.w, id, tail);
      }
      this.size.push(tail);
      id++;
    }
    this.count = id;
    this.dirty = false;
  }

  /** Highways fully reclaimed by nature carry nothing (see `upkeep.ts`). */
  private passable(t: number): boolean {
    const og = this.grid.layer<Uint8Array>('overgrowth');
    return this.grid.road[t]! > 0 && (!og || og[t]! < 255);
  }

  private push(t: number, id: number, tail: number): number {
    if (this.passable(t) && this.comp[t] === -1) {
      this.comp[t] = id;
      this.queue[tail++] = t;
    }
    return tail;
  }

  /**
   * Network id for a footprint, or -1 when no highway lies within `ROAD_REACH` tiles of it: the largest network in
   * reach, then the nearer (rings are visited nearest first, so the first sighting is the nearest), then the
   * lower id.
   */
  networkFor(x: number, z: number, w: number, d: number): number {
    const g = this.grid;
    let best = -1;
    let bestSize = 0;
    let bestRing = Infinity;
    let r = 1;
    const check = (i: number, j: number) => {
      if (i < 0 || j < 0 || i >= g.w || j >= g.h) return;
      const c = this.comp[g.index(i, j)]!;
      if (c === -1 || c === best) return;
      const s = this.size[c] ?? 0;
      if (s > bestSize || (s === bestSize && (r < bestRing || (r === bestRing && c < best)))) {
        best = c;
        bestSize = s;
        bestRing = r;
      }
    };
    for (; r <= ROAD_REACH; r++) ring(x, z, w, d, r, check);
    return best;
  }

  /** True when a highway lies within `ROAD_REACH` tiles of the footprint (no recompute needed). */
  static nearRoad(g: Grid, x: number, z: number, w: number, d: number): boolean {
    let hit = false;
    for (let r = 1; r <= ROAD_REACH && !hit; r++)
      ring(x, z, w, d, r, (i, j) => {
        if (!hit && g.inBounds(i, j) && g.road[g.index(i, j)]) hit = true;
      });
    return hit;
  }

  /** True when any perimeter tile of the footprint is a highway (no recompute needed). */
  static touchesRoad(g: Grid, x: number, z: number, w: number, d: number): boolean {
    for (let i = x; i < x + w; i++) {
      if (z > 0 && g.road[g.index(i, z - 1)]) return true;
      if (z + d < g.h && g.road[g.index(i, z + d)]) return true;
    }
    for (let j = z; j < z + d; j++) {
      if (x > 0 && g.road[g.index(x - 1, j)]) return true;
      if (x + w < g.w && g.road[g.index(x + w, j)]) return true;
    }
    return false;
  }
}

/** Visits the square ring of tiles `r` out from a footprint (r = 1 is its perimeter). */
function ring(
  x: number,
  z: number,
  w: number,
  d: number,
  r: number,
  f: (i: number, j: number) => void,
): void {
  for (let i = x - r; i < x + w + r; i++) {
    f(i, z - r);
    f(i, z + d - 1 + r);
  }
  for (let j = z - r + 1; j < z + d - 1 + r; j++) {
    f(x - r, j);
    f(x + w - 1 + r, j);
  }
}
