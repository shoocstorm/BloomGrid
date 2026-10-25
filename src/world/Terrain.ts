import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshStandardNodeMaterial } from 'three/webgpu';
import { color, fract, max, mix, mx_noise_float, positionWorld, smoothstep, vertexColor, abs, float } from 'three/tsl';
import type { Grid } from '@/sim/Grid';
import { terrainHeight } from '@/sim/terrain';
import { fbm } from '@/sim/noise';
import { U } from '@/render/uniforms';
import { withOverlay } from '@/render/materials/overlay';

const C = {
  deep: new Color(0x5b7f6a),
  sand: new Color(0xe3d3a0),
  grassA: new Color(0x7cbb4c),
  grassB: new Color(0x5a9a3d),
  meadow: new Color(0xa3d164),
  rock: new Color(0x9a8f80),
  mossRock: new Color(0x6e8a58),
  snow: new Color(0xf4f6f8),
};
const tmp = new Color();
const tmp2 = new Color();

function shade(out: Color, h: number, slope: number, x: number, z: number, seed: number): Color {
  if (h < 0) return out.copy(C.sand).lerp(C.deep, Math.min(1, -h / 1.5));
  const n = fbm(x * 0.04, z * 0.04, seed + 41, 3) * 0.5 + 0.5;
  out.copy(C.grassA).lerp(C.grassB, n);
  const meadow = fbm(x * 0.02, z * 0.02, seed + 33, 2);
  if (meadow > 0.15) out.lerp(C.meadow, Math.min(1, (meadow - 0.15) * 3));
  if (h < 0.35) out.lerp(C.sand, 1 - h / 0.35);
  if (slope > 0.5) out.lerp(tmp.copy(C.mossRock).lerp(C.rock, Math.min(1, h / 18)), Math.min(1, (slope - 0.5) * 2));
  if (h > 24) out.lerp(C.snow, Math.min(1, (h - 24) / 6) * (slope < 1.6 ? 1 : 0.4));
  return out;
}

function material(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  const detail = mx_noise_float(positionWorld.mul(0.9)).mul(0.035).add(mx_noise_float(positionWorld.mul(7)).mul(0.02));
  const base = vertexColor().xyz.add(detail);
  // Build-mode tile grid overlay.
  const gx = abs(fract(positionWorld.x).sub(0.5));
  const gz = abs(fract(positionWorld.z).sub(0.5));
  const line = smoothstep(0.46, 0.5, max(gx, gz)).mul(U.grid);
  m.colorNode = withOverlay(mix(base, color(0xeafff6), line.mul(0.5)), false);
  m.emissiveNode = color(0x7ff7e6).mul(line).mul(U.night).mul(0.25).add(float(0));
  return m;
}

/** Chunked terrain mesh for the playable map, plus a low-res scenic ring around it. */
export class Terrain {
  readonly group = new Group();
  readonly material = material();
  private chunks = new Map<string, Mesh>();

  constructor(
    private grid: Grid,
    private seed: number,
    private chunk = 64,
  ) {
    this.group.name = 'terrain';
    this.build();
  }

  private build(): void {
    const g = this.grid;
    for (let cz = 0; cz < g.h; cz += this.chunk)
      for (let cx = 0; cx < g.w; cx += this.chunk) {
        const m = this.chunkMesh(cx, cz);
        this.chunks.set(`${cx},${cz}`, m);
        this.group.add(m);
      }
    this.group.add(this.outerRing());
    this.group.add(this.skirt());
  }

  /** Rebuilds the chunk meshes touching a corner rectangle (after land reclamation). */
  rebuildRegion(x0: number, z0: number, x1: number, z1: number): void {
    const c = this.chunk;
    for (let cz = Math.floor(Math.max(0, z0 - 1) / c) * c; cz <= Math.min(this.grid.h - 1, z1 + 1); cz += c)
      for (let cx = Math.floor(Math.max(0, x0 - 1) / c) * c; cx <= Math.min(this.grid.w - 1, x1 + 1); cx += c) {
        const key = `${cx},${cz}`;
        const old = this.chunks.get(key);
        if (old) {
          this.group.remove(old);
          old.geometry.dispose();
        }
        const m = this.chunkMesh(cx, cz);
        this.chunks.set(key, m);
        this.group.add(m);
      }
  }

  /** Vertical walls around the map edge hide cracks between the fine map and coarse ring. */
  private skirt(): Mesh {
    const g = this.grid;
    const edge: [number, number][] = [];
    for (let i = 0; i < g.w; i++) edge.push([i, 0]);
    for (let j = 0; j < g.h; j++) edge.push([g.w, j]);
    for (let i = g.w; i > 0; i--) edge.push([i, g.h]);
    for (let j = g.h; j >= 0; j--) edge.push([0, j]);
    const n = edge.length;
    const pos = new Float32Array(n * 2 * 3);
    const col = new Float32Array(n * 2 * 3);
    edge.forEach(([x, z], k) => {
      const h = g.corner(x, z);
      pos.set([x, h, z, x, h - 4, z], k * 6);
      shade(tmp2, h, 0, x, z, this.seed);
      tmp2.toArray(col, k * 6);
      tmp2.toArray(col, k * 6 + 3);
    });
    const idx: number[] = [];
    for (let k = 0; k < n - 1; k++) {
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const mesh = this.makeMesh(pos, col, new Uint32Array(idx));
    const mat = this.material.clone();
    mat.side = DoubleSide;
    mesh.material = mat;
    mesh.name = 'terrain-skirt';
    return mesh;
  }

  private makeMesh(positions: Float32Array, colors: Float32Array, index: Uint32Array): Mesh {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.setIndex(new BufferAttribute(index, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.material);
    mesh.receiveShadow = true;
    return mesh;
  }

  private gridIndex(nx: number, nz: number): Uint32Array {
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let k = 0;
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        idx.set([a, c, b, b, c, d], k);
        k += 6;
      }
    return idx;
  }

  private chunkMesh(x0: number, z0: number): Mesh {
    const g = this.grid;
    const n = this.chunk + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = x0 + i;
        const z = z0 + j;
        const h = g.corner(x, z);
        const sx = g.corner(Math.min(g.w, x + 1), z) - g.corner(Math.max(0, x - 1), z);
        const sz = g.corner(x, Math.min(g.h, z + 1)) - g.corner(x, Math.max(0, z - 1));
        const k = (j * n + i) * 3;
        pos[k] = x;
        pos[k + 1] = h;
        pos[k + 2] = z;
        shade(tmp2, h, Math.hypot(sx, sz) / 2, x, z, this.seed).toArray(col, k);
      }
    const mesh = this.makeMesh(pos, col, this.gridIndex(n, n));
    mesh.name = `terrain@${x0},${z0}`;
    return mesh;
  }

  /** Scenic surroundings beyond the map, at 4-tile resolution, with a hole for the map. */
  private outerRing(): Mesh {
    const g = this.grid;
    const step = 4;
    const margin = g.w * 1.5;
    const min = -margin;
    const max = g.w + margin;
    const n = Math.round((max - min) / step) + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = min + i * step;
        const z = min + j * step;
        const h = terrainHeight(x, z, this.seed, g.w);
        const sx = terrainHeight(x + 1, z, this.seed, g.w) - terrainHeight(x - 1, z, this.seed, g.w);
        const sz = terrainHeight(x, z + 1, this.seed, g.w) - terrainHeight(x, z - 1, this.seed, g.w);
        const k = (j * n + i) * 3;
        pos.set([x, h, z], k);
        shade(tmp2, h, Math.hypot(sx, sz) / 2, x, z, this.seed).toArray(col, k);
      }
    // Index, skipping quads fully inside the playable map.
    const idx: number[] = [];
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const x = min + i * step;
        const z = min + j * step;
        if (x >= 0 && z >= 0 && x + step <= g.w && z + step <= g.h) continue;
        const a = j * n + i;
        idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
    const mesh = this.makeMesh(pos, col, new Uint32Array(idx));
    mesh.position.y = -0.02; // avoid z-fighting at the seam
    mesh.name = 'terrain-outer';
    return mesh;
  }
}
