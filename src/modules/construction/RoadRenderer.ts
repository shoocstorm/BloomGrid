import { BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, Quaternion, Vector3 } from 'three/webgpu';
import { getMaterial } from '@/render/materials/library';
import { U } from '@/render/uniforms';
import type { Grid } from '@/sim/Grid';
import { BRIDGE, BRIDGE_DECK, ROAD } from '@/sim/City';
import { hash2 } from '@/sim/random';
import { roadLevels } from '@/sim/roads';
import type { InstanceHandle } from '@/render/Instancer';
import type { GameContext } from '@/game/context';

/** Highway surfaces sit this far above the terrain (walkers stand on them, not on the ground below). */
export const ROAD_LIFT = 0.035;
const LIFT = ROAD_LIFT;
const _m = new Matrix4();
const _v = new Vector3();
const _s = new Vector3();
const _q = new Quaternion();
const _c = new Color(0xf1ede2);
const _params = [1, 0, 0, 1];
const _fungusTint = new Color(0xbff6ff);
const _fungusParams = [1, 0, 1, 1];
/** Share of highway tiles that get a roadside cluster of glowing fungi. */
const FUNGI_SHARE = 0.2;
const _treeTint = new Color(0x6b4f3a);
const _leafTints = [0x4e9a3a, 0x6fbf4a, 0x3f8f5f].map((c) => new Color(c));
const _postTint = new Color(0x3b3f42);
const _lampTint = new Color(0xffd9a0);
const _plain = [1, 0, 0, 1];
const _glow = [1, 0, 1, 1];

/**
 * Living Highways: per-chunk meshes whose quads follow the exact terrain corner heights.
 * Each vertex carries a neighbour mask so the shader draws glowing guidelines that connect.
 * Over water the highway becomes a bridge: the deck rises to `BRIDGE_DECK` (ramping on the
 * shore tiles), with an instanced deck slab and pillars underneath. Some kerbs carry clusters of
 * glowing fungi ("fungi paths") whose night glow follows pedestrian activity in the shader.
 */
export class RoadRenderer {
  readonly group = new Group();
  private chunks = new Map<number, Mesh>();
  private bridgeParts = new Map<number, InstanceHandle[]>();
  private fungi = new Map<number, InstanceHandle[]>();

  constructor(
    private ctx: GameContext,
    private chunk = 64,
  ) {
    this.group.name = 'roads';
    ctx.scene.add(this.group);
    ctx.bus.on('road:changed', ({ tiles }) => this.onChanged(tiles, true));
    // Highway levels (D-096): the surface and the verge dressing change with the level.
    ctx.bus.on('road:level', ({ tiles }) => this.onChanged(tiles));
    ctx.bus.on('road:overgrowth', ({ tiles }) => {
      const g = ctx.city.grid;
      const dirty = new Set(tiles.map((t) => this.key(t % g.w, (t / g.w) | 0)));
      for (const k of dirty) this.rebuild(k);
    });
    ctx.bus.on('city:reset', () => {
      for (const m of this.chunks.values()) {
        this.group.remove(m);
        m.geometry.dispose();
      }
      this.chunks.clear();
      for (const hs of this.bridgeParts.values()) hs.forEach((h) => ctx.instancer.remove(h));
      this.bridgeParts.clear();
      for (const hs of this.fungi.values()) hs.forEach((h) => ctx.instancer.remove(h));
      this.fungi.clear();
    });
    // Bulk content (scenario) may exist before this renderer attaches.
    const existing = ctx.city.roadTiles();
    if (existing.length) this.onChanged(existing);
  }

  /** Clock time each recently laid tile builds in (D-128; pruned once long past). */
  private born = new Map<number, number>();
  /** Build delays (seconds from now) of the batch being synced, from the roadworks schedule. */
  private delays: ReadonlyMap<number, number> = new Map();

  private onChanged(tiles: number[], laid = false): void {
    const g = this.ctx.city.grid;
    this.delays = (laid && this.ctx.services.tryGet('roadworks')?.schedule(tiles)) || new Map();
    const now = U.clock.value;
    for (const [t, d] of this.delays) this.born.set(t, now + d);
    const dirty = new Set<number>();
    const kerbs = new Set<number>();
    for (const t of tiles) {
      const x = t % g.w;
      const z = (t / g.w) | 0;
      // Neighbours' masks and ramp heights change too, which may cross chunk borders.
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          if (g.inBounds(x + dx, z + dz)) {
            dirty.add(this.key(x + dx, z + dz));
            if (!dx || !dz) kerbs.add(g.index(x + dx, z + dz));
          }
      this.syncBridge(t, x, z);
    }
    for (const k of dirty) this.rebuild(k);
    for (const t of kerbs) this.syncFungi(t);
    this.delays = new Map();
  }

  private syncBridge(t: number, x: number, z: number): void {
    const { instancer, city } = this.ctx;
    const old = this.bridgeParts.get(t);
    if (old) {
      old.forEach((h) => instancer.remove(h));
      this.bridgeParts.delete(t);
    }
    if (city.grid.road[t] !== BRIDGE) return;
    const hs: InstanceHandle[] = [];
    const deck = BRIDGE_DECK;
    // On the roadworks timeline (D-128): the pier rises from the water first, then the slab lands on it.
    const d = this.delays.get(t);
    hs.push(instancer.addMatrix('slab', _m.compose(_v.set(x + 0.5, deck - 0.16, z + 0.5), _q.identity(), _s.set(1.02, 0.17, 1.02)), _c, _params, d ?? -1, 0.35));
    if ((x + z) % 3 === 0) {
      const floor = Math.min(0, city.grid.heightAt(x + 0.5, z + 0.5)) - 0.5;
      hs.push(instancer.addMatrix('concreteCyl', _m.compose(_v.set(x + 0.5, floor, z + 0.5), _q.identity(), _s.set(0.32, deck - floor - 0.15, 0.32)), _c, _params, d === undefined ? -1 : Math.max(0, d - 0.4), 0.7));
    }
    this.bridgeParts.set(t, hs);
  }

  /**
   * Verge dressing by level (D-096): a Living Highway gets roadside fungi on a hashed subset of tiles; a Bloom
   * Boulevard gets a street tree or a lamp on every open kerb, alternating; a raw track gets nothing.
   */
  private syncFungi(t: number): void {
    const { instancer, city } = this.ctx;
    const g = city.grid;
    const old = this.fungi.get(t);
    if (old) {
      old.forEach((h) => instancer.remove(h));
      this.fungi.delete(t);
    }
    const x = t % g.w;
    const z = (t / g.w) | 0;
    if (g.road[t] !== ROAD) return;
    const level = roadLevels(city)[t]!;
    const open = (i: number, j: number) => g.inBounds(i, j) && !g.road[g.index(i, j)] && g.occupant[g.index(i, j)] < 0;
    if (level >= 2) return this.dressBoulevard(t, x, z, open);
    if (level < 1 || hash2(x, z, 913) > FUNGI_SHARE) return;
    const sides: [number, number][] = [];
    if (open(x, z - 1)) sides.push([0, -1]);
    if (open(x + 1, z)) sides.push([1, 0]);
    if (open(x, z + 1)) sides.push([0, 1]);
    if (open(x - 1, z)) sides.push([-1, 0]);
    if (!sides.length) return;
    const [nx, nz] = sides[Math.floor(hash2(x, z, 271) * sides.length)]!;
    const hs: InstanceHandle[] = [];
    for (let k = 0; k < 3; k++) {
      const along = (hash2(x, z, 31 + k) - 0.5) * 0.8;
      // On the pavement's outer edge, clear of the walkers (D-134).
      const px = x + 0.5 + nx * 0.475 + (nz ? along : 0);
      const pz = z + 0.5 + nz * 0.475 + (nx ? along : 0);
      const s = 0.07 + hash2(x, z, 57 + k) * 0.06;
      _fungusParams[1] = hash2(x, z, 91 + k);
      hs.push(instancer.addMatrix('fungus', _m.compose(_v.set(px, g.heightAt(px, pz) + LIFT + KERB_H, pz), _q.identity(), _s.set(s, s, s)), _fungusTint, _fungusParams));
    }
    this.fungi.set(t, hs);
  }

  private dressBoulevard(t: number, x: number, z: number, open: (i: number, j: number) => boolean): void {
    const { instancer, city } = this.ctx;
    const g = city.grid;
    const hs: InstanceHandle[] = [];
    const sides: [number, number][] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    for (const [nx, nz] of sides) {
      // Only kerbs facing open ground (not a road, a building or the map edge); trees and lamps alternate.
      if (!open(x + nx, z + nz)) continue;
      // In the planting strip just behind the kerb; walkers keep to the pavement beyond it (D-134).
      const px = x + 0.5 + nx * 0.385;
      const pz = z + 0.5 + nz * 0.385;
      const y = g.heightAt(px, pz) + LIFT + KERB_H;
      const tree = (x + z + (nx ? 1 : 0)) % 2 === 0;
      _plain[1] = hash2(x, z, 77 + nx + nz * 3);
      if (tree) {
        const s = 0.22 + hash2(x, z, 19) * 0.08;
        hs.push(instancer.addMatrix('trunk', _m.compose(_v.set(px, y, pz), _q.identity(), _s.set(s * 0.18, s * 1.6, s * 0.18)), _treeTint, _plain));
        hs.push(instancer.addMatrix('canopy', _m.compose(_v.set(px, y + s * 1.2, pz), _q.identity(), _s.set(s, s * 0.95, s)), _leafTints[(x * 7 + z) % 3]!, _plain));
      } else {
        hs.push(instancer.addMatrix('timberBox', _m.compose(_v.set(px, y, pz), _q.identity(), _s.set(0.03, 0.42, 0.03)), _postTint, _plain));
        hs.push(instancer.addMatrix('lumenRib', _m.compose(_v.set(px, y + 0.4, pz), _q.identity(), _s.set(0.06, 0.05, 0.06)), _lampTint, _glow));
      }
    }
    if (hs.length) this.fungi.set(t, hs);
  }

  private key(x: number, z: number): number {
    return Math.floor(z / this.chunk) * 1024 + Math.floor(x / this.chunk);
  }

  /** Corner height: terrain, raised to deck level where any touching tile is a bridge. */
  private cornerHeight(g: Grid, x: number, z: number): number {
    const h = g.corner(x, z);
    for (let dz = -1; dz <= 0; dz++)
      for (let dx = -1; dx <= 0; dx++) {
        const i = x + dx;
        const j = z + dz;
        if (g.inBounds(i, j) && g.road[g.index(i, j)] === BRIDGE) return Math.max(h, BRIDGE_DECK);
      }
    return h;
  }

  private rebuild(key: number): void {
    const g: Grid = this.ctx.city.grid;
    const cx = (key % 1024) * this.chunk;
    const cz = Math.floor(key / 1024) * this.chunk;
    const b = new TileBuilder();
    const now = U.clock.value;
    const lv = roadLevels(this.ctx.city);
    const og = g.layer<Uint8Array>('overgrowth');
    const road = (x: number, z: number) => (g.inBounds(x, z) && g.road[g.index(x, z)] ? 1 : 0);
    const links = (x: number, z: number) => road(x, z - 1) + road(x + 1, z) + road(x, z + 1) + road(x - 1, z);
    const junction = (x: number, z: number) => (road(x, z) && links(x, z) >= 3 ? 1 : 0);
    const levelAt = (t: number) => (g.road[t] === BRIDGE ? (lv[t]! >= 2 ? 2 : 1) : lv[t]!);
    for (let z = cz; z < Math.min(cz + this.chunk, g.h); z++)
      for (let x = cx; x < Math.min(cx + this.chunk, g.w); x++) {
        const t = g.index(x, z);
        if (!g.road[t]) continue;
        // Bits 0–3: road neighbours N/E/S/W (guidelines join them); 4–7: that neighbour is a junction (zebra crossing).
        const m =
          road(x, z - 1) |
          (road(x + 1, z) << 1) |
          (road(x, z + 1) << 2) |
          (road(x - 1, z) << 3) |
          (junction(x, z - 1) << 4) |
          (junction(x + 1, z) << 5) |
          (junction(x, z + 1) << 6) |
          (junction(x - 1, z) << 7);
        // A bridge deck is always paved: Standard and Lantern decks read as a Living Highway, Grand as a boulevard.
        const l = levelAt(t);
        // Build-in time (D-128): the road material raises the tile out of the ground with a flash after it.
        let born = this.born.get(t) ?? 0;
        if (born && born < now - 10) {
          this.born.delete(t);
          born = 0;
        }
        const h = (i: number, j: number) => this.cornerHeight(g, i, j) + LIFT;
        b.attr = [m, og ? og[t]! / 255 : 0, l, born];
        const corners: Corners = [h(x, z), h(x + 1, z), h(x, z + 1), h(x + 1, z + 1)];
        const w = PAVE_W[l] ?? 0;
        const open = [!road(x, z - 1), !road(x + 1, z), !road(x, z + 1), !road(x - 1, z)] as const;
        if (!w || !(open[0] || open[1] || open[2] || open[3])) {
          b.flat(x, z, corners);
          continue;
        }
        // A neighbour's pavement carries straight on only if it is a paved tile of the same width with the same side
        // open and not a junction (whose crossing drops the kerb).
        const carries = (nx: number, nz: number, sx: number, sz: number) => {
          if (!road(nx, nz) || junction(nx, nz) || road(nx + sx, nz + sz)) return false;
          return (PAVE_W[levelAt(g.index(nx, nz))] ?? 0) === w;
        };
        b.paved(x, z, corners, w, open, carries);
      }
    const old = this.chunks.get(key);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.chunks.delete(key);
    }
    if (!b.idx.length) return;
    const geo = b.geometry();
    const mesh = new Mesh(geo, getMaterial('road'));
    mesh.receiveShadow = true;
    mesh.name = `roads@${cx},${cz}`;
    this.group.add(mesh);
    this.chunks.set(key, mesh);
  }
}

/** Road surface heights at a tile's corners: (x, z), (x + 1, z), (x, z + 1), (x + 1, z + 1). */
type Corners = [number, number, number, number];
/** Open (non-road) sides N, E, S, W. */
type Sides = readonly [boolean, boolean, boolean, boolean];

/** Pavement width per highway level (a raw track has none) and its kerb's height over the carriageway (D-134). */
export const PAVE_W = [0, 0.13, 0.17];
export const KERB_H = 0.028;
/** Horizontal run of the kerb face, the dropped kerb's ramp where a pavement meets a crossing, the skirt's depth. */
const KERB_RUN = 0.012;
const DROP = 0.14;
const SKIRT = 0.1;

/** Height of the road surface at (u, v) in a tile, on the same two triangles a plain tile draws. */
function plane(c: Corners, u: number, v: number): number {
  return u + v <= 1 ? c[0] + u * (c[1] - c[0]) + v * (c[2] - c[0]) : c[3] + (1 - u) * (c[2] - c[3]) + (1 - v) * (c[1] - c[3]);
}

/** Whether a point lies on a raised pavement (walkers and verge dressing stand on its top, D-134). */
export function paveRise(city: { grid: Grid }, x: number, z: number, levels: ArrayLike<number>): number {
  const g = city.grid;
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  if (!g.inBounds(tx, tz)) return 0;
  const t = g.index(tx, tz);
  if (!g.road[t]) return 0;
  const l = g.road[t] === BRIDGE ? (levels[t]! >= 2 ? 2 : 1) : levels[t]!;
  const w = PAVE_W[l] ?? 0;
  if (!w) return 0;
  const open = (i: number, j: number) => !g.inBounds(i, j) || !g.road[g.index(i, j)];
  const u = x - tx;
  const v = z - tz;
  const on = (v < w && open(tx, tz - 1)) || (u > 1 - w && open(tx + 1, tz)) || (v > 1 - w && open(tx, tz + 1)) || (u < w && open(tx - 1, tz));
  return on ? KERB_H : 0;
}

/**
 * Highway tile geometry for one chunk (D-134). A paved tile is a 6×6 vertex grid: the carriageway in the middle,
 * a pavement band raised by `KERB_H` along each side that faces open ground (a near-vertical kerb face between
 * them), the kerb dropping to the carriageway where the pavement meets a crossing road, and a skirt down into the
 * ground under each open edge. Raw tracks and junction interiors stay a single quad. `aRoad` packs the material's
 * per-tile data: neighbour mask, overgrowth, level and build-in time.
 */
class TileBuilder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly info: number[] = [];
  readonly idx: number[] = [];
  attr: number[] = [0, 0, 0, 0];
  private readonly rise = new Float32Array(36);
  private readonly xs = new Float32Array(6);
  private readonly zs = new Float32Array(6);

  private vert(x: number, y: number, z: number, u: number, v: number, nx: number, ny: number, nz: number): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.info.push(this.attr[0]!, this.attr[1]!, this.attr[2]!, this.attr[3]!);
    return i;
  }

  /** Surface vertex with the tile's (bilinear) slope as its normal. */
  private top(x: number, z: number, c: Corners, u: number, v: number, lift: number): number {
    const du = (1 - v) * (c[1] - c[0]) + v * (c[3] - c[2]);
    const dv = (1 - u) * (c[2] - c[0]) + u * (c[3] - c[1]);
    const l = Math.hypot(du, 1, dv);
    return this.vert(x + u, plane(c, u, v) + lift, z + v, u, v, -du / l, 1 / l, -dv / l);
  }

  flat(x: number, z: number, c: Corners): void {
    const v = this.top(x, z, c, 0, 0, 0);
    this.top(x, z, c, 1, 0, 0);
    this.top(x, z, c, 0, 1, 0);
    this.top(x, z, c, 1, 1, 0);
    this.idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
  }

  /**
   * `carries(nx, nz, sx, sz)`: the pavement on side (sx, sz) of the road neighbour at (nx, nz) continues this
   * tile's (otherwise the kerb drops at the shared edge, as at a crossing).
   */
  paved(x: number, z: number, c: Corners, w: number, open: Sides, carries: (nx: number, nz: number, sx: number, sz: number) => boolean): void {
    const [oN, oE, oS, oW] = open;
    const { xs, zs, rise } = this;
    xs.set([0, oW ? w : DROP / 2, oW ? w + KERB_RUN : DROP, oE ? 1 - w - KERB_RUN : 1 - DROP, oE ? 1 - w : 1 - DROP / 2, 1]);
    zs.set([0, oN ? w : DROP / 2, oN ? w + KERB_RUN : DROP, oS ? 1 - w - KERB_RUN : 1 - DROP, oS ? 1 - w : 1 - DROP / 2, 1]);
    const base = this.pos.length / 3;
    for (let j = 0; j < 6; j++)
      for (let i = 0; i < 6; i++) {
        const inW = i <= 1 && oW;
        const inE = i >= 4 && oE;
        const inN = j <= 1 && oN;
        const inS = j >= 4 && oS;
        let up = inW || inE || inN || inS;
        // On an edge shared with a road, keep the kerb up only where the neighbour's pavement carries on.
        if (up && j === 0 && !oN) up = (inW && carries(x, z - 1, -1, 0)) || (inE && carries(x, z - 1, 1, 0));
        if (up && j === 5 && !oS) up = (inW && carries(x, z + 1, -1, 0)) || (inE && carries(x, z + 1, 1, 0));
        if (up && i === 0 && !oW) up = (inN && carries(x - 1, z, 0, -1)) || (inS && carries(x - 1, z, 0, 1));
        if (up && i === 5 && !oE) up = (inN && carries(x + 1, z, 0, -1)) || (inS && carries(x + 1, z, 0, 1));
        rise[j * 6 + i] = up ? KERB_H : 0;
        this.top(x, z, c, xs[i]!, zs[j]!, rise[j * 6 + i]!);
      }
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 5; i++) {
        const a = base + j * 6 + i;
        this.idx.push(a, a + 6, a + 1, a + 1, a + 6, a + 7);
      }
    if (oN) this.skirt(base, [0, 1, 2, 3, 4, 5], 0, -1, c, x, z);
    if (oE) this.skirt(base, [5, 11, 17, 23, 29, 35], 1, 0, c, x, z);
    if (oS) this.skirt(base, [30, 31, 32, 33, 34, 35], 0, 1, c, x, z);
    if (oW) this.skirt(base, [0, 6, 12, 18, 24, 30], -1, 0, c, x, z);
  }

  /** A vertical strip under the grid vertices `ks` (an open edge), facing (nx, nz). */
  private skirt(base: number, ks: number[], nx: number, nz: number, c: Corners, x: number, z: number): void {
    const p = this.pos;
    const first = this.pos.length / 3;
    for (const k of ks) {
      const i = k % 6;
      const j = (k / 6) | 0;
      const u = this.xs[i]!;
      const v = this.zs[j]!;
      const o = (base + k) * 3;
      this.vert(p[o]!, p[o + 1]!, p[o + 2]!, u, v, nx, 0, nz);
      this.vert(x + u, plane(c, u, v) - SKIRT, z + v, u, v, nx, 0, nz);
    }
    // Wind each quad so it faces outward.
    const ax = p[(first + 2) * 3]! - p[first * 3]!;
    const az = p[(first + 2) * 3 + 2]! - p[first * 3 + 2]!;
    // (top_k → top_k+1) × (top_k → bottom_k): y-down component makes the normal (az, ·, -ax) for a downward edge.
    const out = az * nx - ax * nz > 0;
    for (let k = 0; k < ks.length - 1; k++) {
      const t0 = first + k * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      if (out) this.idx.push(t0, t1, b0, t1, b1, b0);
      else this.idx.push(t0, b0, t1, t1, b0, b1);
    }
  }

  geometry(): BufferGeometry {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    geo.setAttribute('aRoad', new BufferAttribute(new Float32Array(this.info), 4));
    geo.setIndex(this.idx);
    return geo;
  }
}
