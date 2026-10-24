import { BufferAttribute, BufferGeometry, Group, Mesh } from 'three/webgpu';
import { getMaterial } from '@/render/materials/library';
import type { Grid } from '@/sim/Grid';
import type { GameContext } from '@/game/context';

const LIFT = 0.035;

/**
 * Living Highways: per-chunk meshes whose quads follow the exact terrain corner heights.
 * Each vertex carries a neighbour mask so the shader draws glowing guidelines that connect.
 */
export class RoadRenderer {
  readonly group = new Group();
  private chunks = new Map<number, Mesh>();

  constructor(
    private ctx: GameContext,
    private chunk = 32,
  ) {
    this.group.name = 'roads';
    ctx.scene.add(this.group);
    ctx.bus.on('road:changed', ({ tiles }) => {
      const dirty = new Set<number>();
      const g = ctx.city.grid;
      for (const t of tiles) {
        const x = t % g.w;
        const z = (t / g.w) | 0;
        // Neighbours' masks change too, which may cross chunk borders.
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (g.inBounds(x + dx, z + dz)) dirty.add(this.key(x + dx, z + dz));
        }
      }
      for (const k of dirty) this.rebuild(k);
    });
    ctx.bus.on('city:reset', () => {
      for (const m of this.chunks.values()) {
        this.group.remove(m);
        m.geometry.dispose();
      }
      this.chunks.clear();
    });
  }

  private key(x: number, z: number): number {
    return Math.floor(z / this.chunk) * 1024 + Math.floor(x / this.chunk);
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
        pos.push(x, g.corner(x, z) + LIFT, z, x + 1, g.corner(x + 1, z) + LIFT, z, x, g.corner(x, z + 1) + LIFT, z + 1, x + 1, g.corner(x + 1, z + 1) + LIFT, z + 1);
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
