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

  /** Bilinear height at a world-space position (1 tile = 1 unit). */
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
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
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

  isWater(x: number, z: number): boolean {
    return this.rangeOver(x, z, 1, 1).min < SEA_LEVEL + 0.05;
  }
}
