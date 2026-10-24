import { BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, Quaternion, Vector3 } from 'three/webgpu';
import { getMaterial } from '@/render/materials/library';
import type { Grid } from '@/sim/Grid';
import { BRIDGE, BRIDGE_DECK } from '@/sim/City';
import type { InstanceHandle } from '@/render/Instancer';
import type { GameContext } from '@/game/context';

const LIFT = 0.035;
const _m = new Matrix4();
const _v = new Vector3();
const _s = new Vector3();
const _q = new Quaternion();
const _c = new Color(0xf1ede2);
const _params = [1, 0, 0, 1];

/**
 * Living Highways: per-chunk meshes whose quads follow the exact terrain corner heights.
 * Each vertex carries a neighbour mask so the shader draws glowing guidelines that connect.
 * Over water the highway becomes a bridge: the deck rises to `BRIDGE_DECK` (ramping on the
 * shore tiles), with an instanced deck slab and pillars underneath.
 */
export class RoadRenderer {
  readonly group = new Group();
  private chunks = new Map<number, Mesh>();
  private bridgeParts = new Map<number, InstanceHandle[]>();

  constructor(
    private ctx: GameContext,
    private chunk = 64,
  ) {
    this.group.name = 'roads';
    ctx.scene.add(this.group);
    ctx.bus.on('road:changed', ({ tiles }) => this.onChanged(tiles));
    ctx.bus.on('city:reset', () => {
      for (const m of this.chunks.values()) {
        this.group.remove(m);
        m.geometry.dispose();
      }
      this.chunks.clear();
      for (const hs of this.bridgeParts.values()) hs.forEach((h) => ctx.instancer.remove(h));
      this.bridgeParts.clear();
    });
    // Bulk content (scenario) may exist before this renderer attaches.
    const existing = ctx.city.roadTiles();
    if (existing.length) this.onChanged(existing);
  }

  private onChanged(tiles: number[]): void {
    const g = this.ctx.city.grid;
    const dirty = new Set<number>();
    for (const t of tiles) {
      const x = t % g.w;
      const z = (t / g.w) | 0;
      // Neighbours' masks and ramp heights change too, which may cross chunk borders.
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) if (g.inBounds(x + dx, z + dz)) dirty.add(this.key(x + dx, z + dz));
      this.syncBridge(t, x, z);
    }
    for (const k of dirty) this.rebuild(k);
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
    hs.push(instancer.addMatrix('slab', _m.compose(_v.set(x + 0.5, deck - 0.16, z + 0.5), _q.identity(), _s.set(1.02, 0.17, 1.02)), _c, _params));
    if ((x + z) % 3 === 0) {
      const floor = Math.min(0, city.grid.heightAt(x + 0.5, z + 0.5)) - 0.5;
      hs.push(instancer.addMatrix('concreteCyl', _m.compose(_v.set(x + 0.5, floor, z + 0.5), _q.identity(), _s.set(0.32, deck - floor - 0.15, 0.32)), _c, _params));
    }
    this.bridgeParts.set(t, hs);
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
    const idx: number[] = [];
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
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new Mesh(geo, getMaterial('road'));
    mesh.receiveShadow = true;
    mesh.name = `roads@${cx},${cz}`;
    this.group.add(mesh);
    this.chunks.set(key, mesh);
  }
}
