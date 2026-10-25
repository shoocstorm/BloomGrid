import { BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, Quaternion, Vector3 } from 'three/webgpu';
import { getMaterial } from '@/render/materials/library';
import { hash2 } from '@/sim/random';
import type { InstanceHandle } from '@/render/Instancer';
import type { GameContext } from '@/game/context';

const SINK = 0.08;
const _m = new Matrix4();
const _v = new Vector3();
const _s = new Vector3();
const _q = new Quaternion();
const _c = new Color();
const UP = new Vector3(0, 1, 0);

/**
 * Filtration channels: per-chunk sunken water ribbons following the terrain, with reeds on every
 * tile and, once a district is retrofitted (lush), lily pads and koi.
 */
export class ChannelRenderer {
  readonly group = new Group();
  private chunks = new Map<number, Mesh>();
  private decor = new Map<number, InstanceHandle[]>();

  constructor(
    private ctx: GameContext,
    private chunk: number,
  ) {
    this.group.name = 'channels';
    ctx.scene.add(this.group);
    ctx.bus.on('channel:changed', ({ tiles }) => this.onChanged(tiles));
    ctx.bus.on('city:reset', () => {
      for (const m of this.chunks.values()) {
        this.group.remove(m);
        m.geometry.dispose();
      }
      this.chunks.clear();
      for (const hs of this.decor.values()) hs.forEach((h) => ctx.instancer.remove(h));
      this.decor.clear();
    });
    const existing = ctx.city.channelTiles().map(([t]) => t);
    if (existing.length) this.onChanged(existing);
  }

  private key(x: number, z: number): number {
    return Math.floor(z / this.chunk) * 1024 + Math.floor(x / this.chunk);
  }

  private onChanged(tiles: number[]): void {
    const g = this.ctx.city.grid;
    const dirty = new Set<number>();
    for (const t of tiles) {
      dirty.add(this.key(t % g.w, (t / g.w) | 0));
      this.syncDecor(t);
    }
    for (const k of dirty) this.rebuild(k);
  }

  private syncDecor(t: number): void {
    const { instancer, city } = this.ctx;
    const old = this.decor.get(t);
    if (old) {
      old.forEach((h) => instancer.remove(h));
      this.decor.delete(t);
    }
    const v = city.channelAt(t);
    if (!v) return;
    const g = city.grid;
    const x = t % g.w;
    const z = (t / g.w) | 0;
    const y = g.rangeOver(x, z, 1, 1).min - SINK + 0.02;
    const hs: InstanceHandle[] = [];
    const r = (k: number) => hash2(x * 7 + k, z * 13 - k, 99);
    const params = [1, 0, 0, 1];
    for (let i = 0; i < 2; i++) {
      params[1] = r(i);
      _q.setFromAxisAngle(UP, r(i + 5) * 6.28);
      hs.push(instancer.addMatrix('grass', _m.compose(_v.set(x + 0.15 + r(i + 1) * 0.7, y, z + (i ? 0.85 : 0.15)), _q, _s.setScalar(0.3 + r(i + 2) * 0.2)), _c.setHex(0x8fae4a), params, this.ctx.loading ? -1 : 0.3 * i));
    }
    if (v === 2) {
      params[1] = r(9);
      params[2] = 0.6;
      hs.push(instancer.addMatrix('lily', _m.compose(_v.set(x + 0.3 + r(10) * 0.4, y + 0.04, z + 0.3 + r(11) * 0.4), _q.setFromAxisAngle(UP, r(12) * 6.28), _s.setScalar(0.28)), _c.setHex(r(13) > 0.5 ? 0xffb7d5 : 0xfff4f0), params, this.ctx.loading ? -1 : 0.2));
      if (r(14) > 0.45) {
        params[1] = r(15);
        params[2] = 0;
        hs.push(instancer.addMatrix('koi', _m.compose(_v.set(x + 0.5, y - 0.04, z + 0.5), _q.setFromAxisAngle(UP, r(16) * 6.28), _s.setScalar(0.22)), _c.setHex(r(17) > 0.5 ? 0xff7a2a : 0xffffff), params, this.ctx.loading ? -1 : 0.5));
      }
    }
    this.decor.set(t, hs);
  }

  private rebuild(key: number): void {
    const g = this.ctx.city.grid;
    const ch = g.layer<Uint8Array>('channel');
    const cx = (key % 1024) * this.chunk;
    const cz = Math.floor(key / 1024) * this.chunk;
    const pos: number[] = [];
    const lush: number[] = [];
    const idx: number[] = [];
    if (ch)
      for (let z = cz; z < Math.min(cz + this.chunk, g.h); z++)
        for (let x = cx; x < Math.min(cx + this.chunk, g.w); x++) {
          const v = ch[g.index(x, z)]!;
          if (!v) continue;
          const y = g.rangeOver(x, z, 1, 1).min - SINK;
          const b = pos.length / 3;
          pos.push(x, y, z, x + 1, y, z, x, y, z + 1, x + 1, y, z + 1);
          const l = v === 2 ? 1 : 0;
          lush.push(l, l, l, l);
          idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
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
    geo.setAttribute('aLush', new BufferAttribute(new Float32Array(lush), 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new Mesh(geo, getMaterial('channel'));
    mesh.receiveShadow = true;
    mesh.name = `channels@${cx},${cz}`;
    this.group.add(mesh);
    this.chunks.set(key, mesh);
  }
}
