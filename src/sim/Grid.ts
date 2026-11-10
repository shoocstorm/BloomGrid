/**
 * Tile grid. Heights live on tile *corners* ((w+1) x (h+1)) so the terrain mesh, picking and
 * placement all agree exactly. Per-tile data is stored in typed-array layers; feature modules
 * add their own layers (energy, water, pollen…) via `addLayer`.
 */
export type LayerArray = Float32Array | Uint8Array | Int32Array | Uint16Array;

export const SEA_LEVEL = 0;
export const NO_ENTITY = -1;

export class Grid {
  readonly heights: Float32Array;
  /** Entity id occupying each tile, or NO_ENTITY. */
  readonly occupant: Int32Array;
  /** 1 where a Living Highway tile exists. */
  readonly road: Uint8Array;
  private layers = new Map<string, LayerArray>();

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.heights = new Float32Array((w + 1) * (h + 1));
    this.occupant = new Int32Array(w * h).fill(NO_ENTITY);
    this.road = new Uint8Array(w * h);
  }

  addLayer<T extends LayerArray>(name: string, make: (size: number) => T): T {
    if (this.layers.has(name)) return this.layers.get(name) as T;
    const arr = make(this.w * this.h);
    this.layers.set(name, arr);
    return arr;
  }

  layer<T extends LayerArray>(name: string): T | undefined {
    return this.layers.get(name) as T | undefined;
  }

  inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.w && z < this.h;
  }

  index(x: number, z: number): number {
    return z * this.w + x;
  }

  corner(x: number, z: number): number {
    return this.heights[z * (this.w + 1) + x]!;
  }

  /**
   * Height of the drawn ground at a world-space position (1 tile = 1 unit). It follows the terrain mesh's two
   * triangles per tile (split along the (x+1, z)–(x, z+1) diagonal, see `world/Terrain.ts`), not a bilinear blend:
   * on a twisted tile the two differ by up to a quarter of the twist, enough to sink a walker's feet or float a tree.
   */
  heightAt(wx: number, wz: number): number {
    const x = Math.min(Math.max(wx, 0), this.w - 1e-4);
    const z = Math.min(Math.max(wz, 0), this.h - 1e-4);
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const tx = x - xi;
    const tz = z - zi;
    const a = this.corner(xi, zi);
    const b = this.corner(xi + 1, zi);
    const c = this.corner(xi, zi + 1);
    const d = this.corner(xi + 1, zi + 1);
    return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  /** Min/max corner heights over a tile rectangle. */
  rangeOver(x: number, z: number, w: number, d: number): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;
    for (let j = z; j <= z + d; j++) {
      for (let i = x; i <= x + w; i++) {
        const v = this.corner(i, j);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { min, max };
  }

  /**
   * Height a building on the lot (x, z, w × d tiles) stands at: its highest corner, or the highest corner one step
   * outside the lot where that is higher (D-154). Ground right beside a lot that rises above the lot's own top would
   * bury the building's ground floor; standing on the ring's height instead puts it on a plinth that meets that
   * ground flush. Grading keeps the ring at or below the pad wherever it can, so the plinth shows only on lots it
   * could not grade (a bank steeper than a highway allows, a kept terrace, an older save).
   */
  padOver(x: number, z: number, w: number, d: number): number {
    const x0 = Math.max(0, x - 1);
    const z0 = Math.max(0, z - 1);
    const x1 = Math.min(this.w, x + w + 1);
    const z1 = Math.min(this.h, z + d + 1);
    return this.rangeOver(x0, z0, x1 - x0, z1 - z0).max;
  }

  isWater(x: number, z: number): boolean {
    return this.rangeOver(x, z, 1, 1).min < SEA_LEVEL + 0.05;
  }
}
