import { Color, Euler, Quaternion, Vector3 } from 'three/webgpu';
import type { ChunkedInstancer, InstanceHandle } from '@/render/Instancer';
import { NO_ENTITY, type Grid } from '@/sim/Grid';
import { fbm } from '@/sim/noise';
import { Rng, hash2 } from '@/sim/random';
import { PALETTE, TROPIC } from '@/content/kit';

const _p = new Vector3();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _c = new Color();
const params = new Float32Array(4);

/** What a free tile borders, which decides how it is planted (D-127). */
const enum Setting {
  Wild = 0,
  /** Next to a highway: a planted street verge (palms and rain trees along the kerb). */
  Verge = 1,
  /** Next to a building: a tropical garden (broad leaves, frangipani, flowers). */
  Garden = 2,
}

/**
 * Deterministic wild nature scattered over every free tile, as a rainy, sunny tropical island grows it (D-127):
 * coconut palms along the shore, layered rainforest (emergent rain trees, palms, banana and heliconia understorey)
 * on the hills, tree ferns up high, rain trees, flame trees and bamboo in the open, and planted verges and gardens
 * among the buildings. Tiles are cleared when built on and regrow when freed.
 */
export class Flora {
  private tiles = new Map<number, InstanceHandle[]>();
  /** Wild trees per tile for explore collisions: [x, z, ground, trunk h, trunk r, canopy y, canopy r] each. */
  private trees = new Map<number, number[]>();
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
    this.setting.delete(idx);
    const hs = this.tiles.get(idx);
    if (!hs) return;
    for (const h of hs) this.instancer.remove(h);
    this.tiles.delete(idx);
    this.trees.delete(idx);
  }

  /** Whether a free tile is wild land, a street verge or a garden beside a building (see `Setting`). */
  private settingOf(x: number, z: number): Setting {
    const g = this.grid;
    let garden = false;
    for (let j = z - 1; j <= z + 1; j++)
      for (let i = x - 1; i <= x + 1; i++) {
        if ((i === x && j === z) || !g.inBounds(i, j)) continue;
        const t = g.index(i, j);
        if (g.road[t] && (i === x || j === z)) return Setting.Verge;
        if (g.occupant[t] !== NO_ENTITY) garden = true;
      }
    return garden ? Setting.Garden : Setting.Wild;
  }

  /**
   * Re-plants the free tiles bordering a changed area whose setting changed (a new street makes a verge of
   * the meadow beside it, a new building a garden). Tiles that stay the same keep their plants.
   */
  refreshAround(x0: number, z0: number, x1: number, z1: number, animate = true): void {
    const g = this.grid;
    for (let z = Math.max(0, z0 - 1); z <= Math.min(g.h - 1, z1 + 1); z++)
      for (let x = Math.max(0, x0 - 1); x <= Math.min(g.w - 1, x1 + 1); x++) {
        const idx = g.index(x, z);
        if (g.road[idx] || g.occupant[idx] !== NO_ENTITY) continue;
        if ((this.setting.get(idx) ?? Setting.Wild) === this.settingOf(x, z)) continue;
        this.hideTile(idx);
        this.showTile(idx, animate);
      }
  }

  private setting = new Map<number, Setting>();

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
    const setting = this.settingOf(x, z);
    if (setting !== Setting.Wild) this.setting.set(idx, setting);
    else this.setting.delete(idx);
    const delay = (k: number) => (animate ? k * 0.08 + rng.next() * 0.4 : -1);
    const at = (ox: number, oz: number) => _p.set(x + ox, g.heightAt(x + ox, z + oz), z + oz);
    const add = (piece: string, ox: number, oz: number, scale: Vector3, tint: number, glow: number, d: number, yOff = 0, tilt = 0) => {
      at(ox, oz).y += yOff;
      _q.setFromEuler(_e.set(tilt, rng.next() * Math.PI * 2, 0, 'YXZ'));
      params[0] = 1;
      params[1] = rng.next();
      params[2] = glow;
      params[3] = 1; // vitality: wild nature is healthy
      handles.push(this.instancer.add(piece, _p, _q, scale, _c.setHex(tint), params, delay(d)));
    };
    /** Explore collision: the trunk (the piece is 0.5 wide at its foot) and one sphere for the crown. */
    const collide = (ox: number, oz: number, ground: number, h: number, r: number, crownY: number, crownR: number) => {
      let list = this.trees.get(idx);
      if (!list) this.trees.set(idx, (list = []));
      list.push(x + ox, z + oz, ground, h, r, crownY, crownR);
    };

    // Species. Sized against the buildings (a floor is 0.32): a grown tree stands about 4–7 floors and spreads
    // under a tile, so a street tree doesn't dwarf a home.
    const palm = (ox: number, oz: number, height: number, span: number, tint: number, d = 0) => {
      add('palm', ox, oz, _s.set(span, height, span), tint, rng.next() < 0.08 ? 0.5 : 0, d);
      collide(ox, oz, _p.y, height * 0.86, span * 0.03, _p.y + height * 0.9, span * 0.25);
    };
    const fern = (ox: number, oz: number, size: number) => {
      add('palm', ox, oz, _s.set(size * 1.5, size * 0.75, size * 1.5), rng.pick(TROPIC.forest), rng.next() < 0.15 ? 0.6 : 0, 0);
      collide(ox, oz, _p.y, size * 0.6, size * 0.04, _p.y + size * 0.7, size * 0.3);
    };
    const crowned = (ox: number, oz: number, size: number, shape: 'round' | 'umbrella' | 'bloom' | 'emergent') => {
      const tall = shape === 'emergent' ? rng.range(2.2, 2.8) : shape === 'umbrella' ? rng.range(1.0, 1.3) : rng.range(1.1, 1.8);
      const h = size * tall;
      const girth = size * (shape === 'emergent' ? 0.22 : shape === 'umbrella' ? 0.16 : 0.12);
      add('trunk', ox, oz, _s.set(girth, h, girth), PALETTE.bark, 0, 0);
      const ty = _p.y;
      let crown = 0;
      const blobs = shape === 'umbrella' || shape === 'emergent' ? 3 : 1 + rng.int(0, 2);
      const bloom = rng.pick(TROPIC.bloom);
      for (let i = 0; i < blobs; i++) {
        // A flowering tree is a green crown capped with smaller blossom clusters.
        const r = size * rng.range(0.85, 1.15) * (shape === 'bloom' ? (i ? 0.5 : 0.85) : 1);
        const flat = shape === 'umbrella' || shape === 'emergent';
        const a = (i / blobs) * Math.PI * 2 + rng.next();
        const spread = flat ? size * 0.35 : rng.range(-0.1, 0.1);
        const s = flat ? _s.set(r * 1.3, r * 0.5, r * 1.3) : _s.setScalar(r);
        const tint = shape === 'bloom' && i > 0 ? bloom : flat ? rng.pick(TROPIC.forest) : rng.pick(PALETTE.leaves);
        const glow = rng.next() < (shape === 'bloom' ? 0.25 : 0.12) ? rng.range(0.4, 0.9) : 0;
        const capped = shape === 'bloom' && i > 0;
        const lift = flat ? h * 0.92 + i * r * 0.08 : capped ? h * 0.55 + size * 0.5 : h * 0.55 + i * r * 0.25;
        const off = capped ? size * 0.3 : flat ? spread : 0;
        add('canopy', ox + Math.cos(a) * off + (flat || capped ? 0 : spread), oz + Math.sin(a) * off, s, tint, glow, 1 + i, lift);
        crown = Math.max(crown, flat ? r * 1.3 : r);
      }
      collide(ox, oz, ty, h, size * 0.06, ty + h * 0.8, crown * 0.42);
    };
    const bamboo = (ox: number, oz: number, size: number) => {
      const n = 4 + rng.int(0, 3);
      for (let i = 0; i < n; i++) {
        const h = size * rng.range(1.6, 2.4);
        add('trunk', ox + rng.range(-0.12, 0.12), oz + rng.range(-0.12, 0.12), _s.set(0.025, h, 0.025), TROPIC.stem, 0, 0, 0, rng.range(-0.12, 0.12));
        add('canopy', ox + rng.range(-0.1, 0.1), oz + rng.range(-0.1, 0.1), _s.set(size * 0.35, size * 0.6, size * 0.35), rng.pick(TROPIC.fronds), 0, 1, h * 0.8);
      }
      collide(ox, oz, _p.y, size * 1.6, 0.1, _p.y + size * 1.8, size * 0.2);
    };
    const leafy = (ox: number, oz: number, size: number, tint = rng.pick(TROPIC.fronds)) => add('bush', ox, oz, _s.set(size, size * rng.range(0.8, 1.2), size), tint, 0, 0);
    const banana = (ox: number, oz: number, size: number) => {
      const h = size * rng.range(0.6, 0.9);
      add('trunk', ox, oz, _s.set(size * 0.1, h, size * 0.1), TROPIC.stem, 0, 0);
      add('bush', ox, oz, _s.set(size, size, size), rng.pick(TROPIC.fronds), 0, 1, h * 0.65);
    };

    const high = min > 7;
    const coast = min < 1.2;
    if (setting === Setting.Verge) {
      // Street verge: a palm or a rain tree at the kerb on about half the tiles, a broad-leaf bed on the rest.
      if (slope < 2.5 && rng.next() < 0.55) {
        if (rng.next() < 0.6) palm(rng.range(0.35, 0.65), rng.range(0.35, 0.65), rng.range(1.5, 2.1), rng.range(1.0, 1.3), rng.pick(TROPIC.fronds));
        else crowned(rng.range(0.35, 0.65), rng.range(0.35, 0.65), rng.range(0.4, 0.55), rng.next() < 0.6 ? 'umbrella' : 'bloom');
      } else if (rng.next() < 0.6) leafy(rng.range(0.2, 0.8), rng.range(0.2, 0.8), rng.range(0.28, 0.42));
    } else if (setting === Setting.Garden) {
      // Garden beside a building: banana and heliconia clumps, a frangipani or palm now and then, flowers.
      const r = rng.next();
      if (slope < 2.5 && r < 0.18) palm(rng.range(0.3, 0.7), rng.range(0.3, 0.7), rng.range(1.2, 1.8), rng.range(0.9, 1.2), rng.pick(TROPIC.fronds));
      else if (slope < 2.5 && r < 0.36) crowned(rng.range(0.3, 0.7), rng.range(0.3, 0.7), rng.range(0.3, 0.45), 'bloom');
      else if (r < 0.55) banana(rng.range(0.25, 0.75), rng.range(0.25, 0.75), rng.range(0.35, 0.5));
      const beds = rng.int(1, 3);
      for (let i = 0; i < beds; i++) leafy(rng.next(), rng.next(), rng.range(0.2, 0.36));
    } else if (coast) {
      // Shore: coconut palms leaning out over the sand, sea-grape and pandan clumps between.
      if (slope < 2.5 && rng.next() < 0.3) {
        const n = rng.next() < 0.35 ? 2 : 1;
        for (let k = 0; k < n; k++) palm(rng.range(0.15, 0.85), rng.range(0.15, 0.85), rng.range(1.3, 2.2) * (k ? 0.8 : 1), rng.range(1.0, 1.35), rng.pick(TROPIC.fronds), k);
      } else if (rng.next() < 0.18) leafy(rng.next(), rng.next(), rng.range(0.25, 0.4));
    } else {
      // Inland: closed rainforest where the forest field is high, scattered trees in the open.
      const treeChance = forest > 0.2 ? 0.45 + forest * 0.35 : 0.06;
      if (slope < 2.5 && rng.next() < treeChance) {
        const dense = forest > 0.35;
        const r = rng.next();
        if (high) {
          // Cloud forest: tree ferns under stacked conifer-like crowns.
          if (r < 0.55) fern(rng.range(0.25, 0.75), rng.range(0.25, 0.75), rng.range(0.6, 1.0));
          else crowned(rng.range(0.4, 0.8), rng.range(0.2, 0.6), rng.range(0.4, 0.7), 'round');
          if (rng.next() < 0.5) fern(rng.range(0.1, 0.4), rng.range(0.55, 0.9), rng.range(0.45, 0.7));
        } else if (dense) {
          // Rainforest: an emergent giant, a mid-storey tree or a palm, with a second, smaller tree below.
          if (r < 0.25) crowned(rng.range(0.4, 0.7), rng.range(0.3, 0.7), rng.range(0.55, 0.85), 'emergent');
          else if (r < 0.45) palm(rng.range(0.3, 0.7), rng.range(0.3, 0.7), rng.range(1.4, 2.2), rng.range(1.0, 1.4), rng.pick(TROPIC.forest));
          else if (r < 0.6) fern(rng.range(0.3, 0.7), rng.range(0.3, 0.7), rng.range(0.5, 0.8));
          else crowned(rng.range(0.45, 0.85), rng.range(0.15, 0.6), rng.range(0.42, 0.82), 'round');
          if (rng.next() < 0.6) crowned(rng.range(0.1, 0.4), rng.range(0.55, 0.9), rng.range(0.3, 0.55), rng.next() < 0.15 ? 'bloom' : 'round');
          // Understorey: banana, heliconia and elephant-ear clumps fill the floor.
          const under = rng.next() < 0.5 ? 2 : 1;
          for (let i = 0; i < under; i++) (rng.next() < 0.35 ? banana : leafy)(rng.next(), rng.next(), rng.range(0.25, 0.45));
        } else {
          // Open country: rain trees, flame trees and palms on their own, a bamboo stand now and then.
          if (r < 0.32) crowned(rng.range(0.3, 0.7), rng.range(0.3, 0.7), rng.range(0.5, 0.8), 'umbrella');
          else if (r < 0.56) crowned(rng.range(0.3, 0.7), rng.range(0.3, 0.7), rng.range(0.4, 0.65), 'bloom');
          else if (r < 0.74) palm(rng.range(0.3, 0.7), rng.range(0.3, 0.7), rng.range(1.3, 2.1), rng.range(1.0, 1.3), rng.pick(TROPIC.fronds));
          else if (r < 0.86) bamboo(rng.range(0.3, 0.7), rng.range(0.3, 0.7), rng.range(0.5, 0.75));
          else crowned(rng.range(0.3, 0.7), rng.range(0.3, 0.7), rng.range(0.42, 0.82), 'round');
          if (forest > 0.2 && rng.next() < 0.5) leafy(rng.next(), rng.next(), rng.range(0.25, 0.4));
        }
      } else if (rng.next() < 0.16) {
        (rng.next() < 0.3 ? banana : leafy)(rng.next(), rng.next(), rng.range(0.25, 0.45));
      }
    }

    if (!high) {
      const tufts = rng.next() < 0.35 ? 1 : 0;
      for (let i = 0; i < tufts; i++) add('grass', rng.next(), rng.next(), _s.setScalar(rng.range(0.15, 0.3)), rng.pick(PALETTE.leaves), 0, 0);
      const flowerChance = setting === Setting.Garden ? 0.6 : 0.3 + meadow;
      if ((meadow > 0.1 || setting === Setting.Garden) && rng.next() < flowerChance) {
        const n = 2 + rng.int(0, 2);
        const tint = rng.pick(PALETTE.blossoms);
        for (let i = 0; i < n; i++) {
          const glow = rng.next() < 0.35 ? rng.range(0.5, 1) : 0;
          add('flower', rng.next(), rng.next(), _s.setScalar(rng.range(0.08, 0.14)), rng.next() < 0.7 ? tint : rng.pick(PALETTE.blossoms), glow, 0);
        }
      }
      if (forest > 0.25 && setting === Setting.Wild && rng.next() < 0.08) {
        for (let i = 0; i < 3; i++) add('fungus', rng.next(), rng.next(), _s.setScalar(rng.range(0.08, 0.16)), 0xd7f7ff, 1, 0);
      }
    }
    if (handles.length) this.tiles.set(idx, handles);
  }

  /** Wild trees on a tile (see `trees`), for explore collisions. */
  treesAt(idx: number): readonly number[] | undefined {
    return this.trees.get(idx);
  }

  get instanceCount(): number {
    let n = 0;
    for (const h of this.tiles.values()) n += h.length;
    return n;
  }
}
