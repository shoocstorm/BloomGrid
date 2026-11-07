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
      const px = x + 0.5 + nx * 0.42 + (nz ? along : 0);
      const pz = z + 0.5 + nz * 0.42 + (nx ? along : 0);
      const s = 0.07 + hash2(x, z, 57 + k) * 0.06;
      _fungusParams[1] = hash2(x, z, 91 + k);
      hs.push(instancer.addMatrix('fungus', _m.compose(_v.set(px, g.heightAt(px, pz) + LIFT, pz), _q.identity(), _s.set(s, s, s)), _fungusTint, _fungusParams));
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
      const px = x + 0.5 + nx * 0.43;
      const pz = z + 0.5 + nz * 0.43;
      const y = g.heightAt(px, pz) + LIFT;
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
    const pos: number[] = [];
    const uv: number[] = [];
    const mask: number[] = [];
    const cond: number[] = [];
    const lvl: number[] = [];
    const born: number[] = [];
    const now = U.clock.value;
    const lv = roadLevels(this.ctx.city);
    const idx: number[] = [];
    const og = g.layer<Uint8Array>('overgrowth');
    const road = (x: number, z: number) => (g.inBounds(x, z) && g.road[g.index(x, z)] ? 1 : 0);
    for (let z = cz; z < Math.min(cz + this.chunk, g.h); z++)
      for (let x = cx; x < Math.min(cx + this.chunk, g.w); x++) {
        if (!g.road[g.index(x, z)]) continue;
        const m = road(x, z - 1) | (road(x + 1, z) << 1) | (road(x, z + 1) << 2) | (road(x - 1, z) << 3);
        const v = pos.length / 3;
        const h = (i: number, j: number) => this.cornerHeight(g, i, j) + LIFT;
        pos.push(x, h(x, z), z, x + 1, h(x + 1, z), z, x, h(x, z + 1), z + 1, x + 1, h(x + 1, z + 1), z + 1);
        uv.push(0, 0, 1, 0, 0, 1, 1, 1);
        mask.push(m, m, m, m);
        const o = og ? og[g.index(x, z)]! / 255 : 0;
        cond.push(o, o, o, o);
        const t = g.index(x, z);
        // A bridge deck is always paved: Standard and Lantern decks read as a Living Highway, Grand as a boulevard.
        const l = g.road[t] === BRIDGE ? (lv[t]! >= 2 ? 2 : 1) : lv[t]!;
        lvl.push(l, l, l, l);
        // Build-in time (D-128): the road material raises the tile out of the ground with a flash after it.
        let b = this.born.get(t) ?? 0;
        if (b && b < now - 10) {
          this.born.delete(t);
          b = 0;
        }
        born.push(b, b, b, b);
        idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    const old = this.chunks.get(key);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.chunks.delete(key);
    }
    if (!idx.length) return;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    geo.setAttribute('aMask', new BufferAttribute(new Float32Array(mask), 1));
    geo.setAttribute('aOvergrowth', new BufferAttribute(new Float32Array(cond), 1));
    geo.setAttribute('aLevel', new BufferAttribute(new Float32Array(lvl), 1));
    geo.setAttribute('aBorn', new BufferAttribute(new Float32Array(born), 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new Mesh(geo, getMaterial('road'));
    mesh.receiveShadow = true;
    mesh.name = `roads@${cx},${cz}`;
    this.group.add(mesh);
    this.chunks.set(key, mesh);
  }
}
