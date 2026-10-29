import { Color, Euler, Quaternion, Vector3 } from 'three/webgpu';
import type { ChunkedInstancer, InstanceHandle } from '@/render/Instancer';
import { NO_ENTITY, type Grid } from '@/sim/Grid';
import { fbm } from '@/sim/noise';
import { Rng, hash2 } from '@/sim/random';
import { PALETTE } from '@/content/kit';

const _p = new Vector3();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _c = new Color();
const params = new Float32Array(4);

/**
 * Deterministic wild nature scattered over every free tile: forests, meadows of glowing
 * flowers, grass and fungi. Tiles are cleared when built on and regrow when freed.
 */
export class Flora {
  private tiles = new Map<number, InstanceHandle[]>();
  density = 1;

  constructor(
    private grid: Grid,
    private instancer: ChunkedInstancer,
    private seed: number,
  ) {}

  private disposed = false;

  /**
   * Scatters wild nature over every free tile. The first `syncRows` rows are done immediately;
   * the rest follow in slices on later tasks, so boot doesn't block on a 512² map (they fill in
   * behind the boot screen during shader warm-up). Built-on tiles are skipped as usual.
   */
  populate(syncRows = 0, sliceRows = 48): void {
    const g = this.grid;
    const rows = (z0: number, z1: number) => {
      for (let z = z0; z < Math.min(g.h, z1); z++) for (let x = 0; x < g.w; x++) this.showTile(g.index(x, z), false);
    };
    rows(0, syncRows);
    const next = (z: number) => {
      if (this.disposed || z >= g.h) return;
      rows(z, z + sliceRows);
      setTimeout(() => next(z + sliceRows), 0);
    };
    if (syncRows < g.h) setTimeout(() => next(syncRows), 0);
  }

  /** Removes every flora instance and stops any population still in progress. */
  dispose(): void {
    this.disposed = true;
    for (const idx of [...this.tiles.keys()]) this.hideTile(idx);
  }

  hideTile(idx: number): void {
    const hs = this.tiles.get(idx);
    if (!hs) return;
    for (const h of hs) this.instancer.remove(h);
    this.tiles.delete(idx);
  }

  showTile(idx: number, animate = true): void {
    const g = this.grid;
    if (this.tiles.has(idx) || g.road[idx] || g.occupant[idx] !== NO_ENTITY) return;
    const x = idx % g.w;
    const z = (idx / g.w) | 0;
    const { min, max } = g.rangeOver(x, z, 1, 1);
    if (min < 0.1) return;
    const slope = max - min;
    const rng = new Rng(Math.floor(hash2(x, z, this.seed) * 2 ** 31));
    if (rng.next() > this.density) return;
    const handles: InstanceHandle[] = [];
    // The central hills are a protected forest reserve.
    const forest = fbm(x * 0.03, z * 0.03, this.seed + 21, 3) + (min > 2.5 ? 0.45 : 0);
    const meadow = fbm(x * 0.05, z * 0.05, this.seed + 33, 2);
    const delay = (k: number) => (animate ? k * 0.08 + rng.next() * 0.4 : -1);
    const at = (ox: number, oz: number) => _p.set(x + ox, g.heightAt(x + ox, z + oz), z + oz);
    const add = (piece: string, ox: number, oz: number, scale: Vector3, tint: number, glow: number, d: number, yOff = 0) => {
      at(ox, oz).y += yOff;
      _q.setFromEuler(_e.set(0, rng.next() * Math.PI * 2, 0));
      params[0] = 1;
      params[1] = rng.next();
      params[2] = glow;
      params[3] = 1; // vitality: wild nature is healthy
      handles.push(this.instancer.add(piece, _p, _q, scale, _c.setHex(tint), params, delay(d)));
    };

    const high = min > 7;
    // Trees: dense where the forest field is high; sparse elsewhere. Sized against the buildings (a floor is
    // 0.32): a grown tree stands about 4–7 floors and spreads under a tile, so a street tree doesn't dwarf a home.
    const treeChance = forest > 0.2 ? 0.28 + forest * 0.3 : 0.015;
    if (slope < 2.5 && rng.next() < treeChance) {
      // Dense forest packs a second, smaller tree into the tile so the canopy still closes at street scale.
      const trees = forest > 0.35 && rng.next() < 0.6 ? 2 : 1;
      for (let k = 0; k < trees; k++) {
        const size = rng.range(0.42, 0.82) * (high ? 0.85 : 1) * (k ? 0.8 : 1);
        const ox = k ? rng.range(0.1, 0.4) : rng.range(0.45, 0.85);
        const oz = k ? rng.range(0.55, 0.9) : rng.range(0.15, 0.6);
        const h = size * rng.range(1.1, 1.8);
        add('trunk', ox, oz, _s.set(size * 0.12, h, size * 0.12), PALETTE.bark, 0, 0);
        const blobs = high ? 3 : 1 + rng.int(0, 2);
        for (let i = 0; i < blobs; i++) {
          const r = high ? size * (1.1 - i * 0.3) : size * rng.range(0.85, 1.15);
          const s = high ? _s.set(r * 0.8, r * 1.3, r * 0.8) : _s.setScalar(r);
          const tint = high ? 0x3f7a4f : rng.pick(PALETTE.leaves);
          const glow = rng.next() < 0.12 ? rng.range(0.4, 0.9) : 0;
          add('canopy', ox + rng.range(-0.1, 0.1), oz + rng.range(-0.1, 0.1), s, tint, glow, 1 + i, h * 0.55 + i * r * (high ? 0.5 : 0.25));
        }
      }
    } else if (rng.next() < 0.07) {
      add('bush', rng.next(), rng.next(), _s.setScalar(rng.range(0.25, 0.45)), rng.pick(PALETTE.leaves), 0, 0);
    }

    if (!high) {
      const tufts = rng.next() < 0.35 ? 1 : 0;
      for (let i = 0; i < tufts; i++) add('grass', rng.next(), rng.next(), _s.setScalar(rng.range(0.15, 0.3)), rng.pick(PALETTE.leaves), 0, 0);
      if (meadow > 0.1 && rng.next() < 0.3 + meadow) {
        const n = 2 + rng.int(0, 2);
        const tint = rng.pick(PALETTE.blossoms);
        for (let i = 0; i < n; i++) {
          const glow = rng.next() < 0.35 ? rng.range(0.5, 1) : 0;
          add('flower', rng.next(), rng.next(), _s.setScalar(rng.range(0.08, 0.14)), rng.next() < 0.7 ? tint : rng.pick(PALETTE.blossoms), glow, 0);
        }
      }
      if (forest > 0.25 && rng.next() < 0.08) {
        for (let i = 0; i < 3; i++) add('fungus', rng.next(), rng.next(), _s.setScalar(rng.range(0.08, 0.16)), 0xd7f7ff, 1, 0);
      }
    }
    if (handles.length) this.tiles.set(idx, handles);
  }

  get instanceCount(): number {
    let n = 0;
    for (const h of this.tiles.values()) n += h.length;
    return n;
  }
}
