import type { Grid } from './Grid';

/**
 * Utility networks follow the Living Highways: energy and water conduits run beneath them.
 * Connected road tiles form a network component; a building joins the network of any road
 * tile touching its footprint perimeter (lowest id wins, for determinism).
 */
export class RoadNetworks {
  comp: Int32Array;
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
    for (let start = 0; start < comp.length; start++) {
      if (!g.road[start] || comp[start] !== -1) continue;
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
      id++;
    }
    this.count = id;
    this.dirty = false;
  }

  private push(t: number, id: number, tail: number): number {
    if (this.grid.road[t] && this.comp[t] === -1) {
      this.comp[t] = id;
      this.queue[tail++] = t;
    }
    return tail;
  }

  /** Network id for a footprint, or -1 when no highway touches it. */
  networkFor(x: number, z: number, w: number, d: number): number {
    const g = this.grid;
    let best = -1;
    const check = (i: number, j: number) => {
      if (i < 0 || j < 0 || i >= g.w || j >= g.h) return;
      const c = this.comp[g.index(i, j)]!;
      if (c !== -1 && (best === -1 || c < best)) best = c;
    };
    for (let i = x; i < x + w; i++) {
      check(i, z - 1);
      check(i, z + d);
    }
    for (let j = z; j < z + d; j++) {
      check(x - 1, j);
      check(x + w, j);
    }
    return best;
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
