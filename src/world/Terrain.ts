import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshStandardNodeMaterial } from 'three/webgpu';
import { color, cross, dFdx, dFdy, floor, fract, max, mix, mx_noise_float, normalFlat, normalGeometry, normalView, positionWorld, smoothstep, step, vertexColor, abs, float } from 'three/tsl';
import { stripes } from '@/render/materials/library';
import type { Grid } from '@/sim/Grid';
import { terrainHeight } from '@/sim/terrain';
import { fbm } from '@/sim/noise';
import { U } from '@/render/uniforms';
import { withOverlay } from '@/render/materials/overlay';
import { cloudShade } from '@/render/grade';

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

/** Embankment courses (world units): stone block height and length on steep faces. */
const COURSE = 0.17;
const BLOCK = 0.42;

function material(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  const detail = mx_noise_float(positionWorld.mul(0.9)).mul(0.035).add(mx_noise_float(positionWorld.mul(7)).mul(0.02));
  // Wet sand (D-120): a darker band just above the sea that the shore wash keeps damp; it follows floods.
  const wet = smoothstep(0.32, 0.04, positionWorld.y.sub(U.waterLevel)).mul(smoothstep(-0.3, 0.0, positionWorld.y.sub(U.waterLevel)));
  const base = vertexColor().xyz.add(detail).mul(float(1).sub(wet.mul(0.22)));
  // Steep faces (D-140): where a terrace meets a reservoir, river or the sea the ground drops a storey or more inside
  // one tile. Vertex normals are smoothed with the flat ground round them, so such a face was lit like level grass
  // and its colour blended sand into grass: from the water it read as a pale, see-through sheet with trees floating
  // on top. The true face normal (screen derivatives, exact on a planar triangle) finds those faces; they are drawn
  // as a stone embankment, lit by that face normal, with a mossy coping and a waterline stain.
  const face = cross(dFdx(positionWorld), dFdy(positionWorld)).normalize();
  const steep = smoothstep(0.6, 0.4, abs(face.y));
  const row = positionWorld.y.div(COURSE);
  // Along the wall, so joints stand plumb: terraces follow the tile grid, so a wall runs along x or z. The smoothed
  // vertex normal says which (per-pixel derivatives are too noisy for it, and its lean wanders across a wall).
  const facesX = step(abs(normalGeometry.z), abs(normalGeometry.x));
  const along = mix(positionWorld.x, positionWorld.z, facesX).div(BLOCK).add(floor(row).mul(0.5));
  const mortar = max(stripes(row, 0.9), stripes(along, 0.94));
  const block = mx_noise_float(floor(along).add(floor(row).mul(17.3)).mul(0.71)).mul(0.06);
  const stone = mix(color(0x8a8172).add(block).add(mx_noise_float(positionWorld.mul(0.9)).mul(0.04)), color(0x5c574d), mortar.mul(0.7));
  const moss = smoothstep(0.55, 0.15, fract(positionWorld.y.mul(0.37)).mul(0.3).add(mx_noise_float(positionWorld.mul(1.7)).mul(0.25)).add(0.35));
  const stain = smoothstep(0.6, 0.0, positionWorld.y.sub(U.waterLevel));
  const wall = mix(mix(stone, color(0x5f7d45), moss.mul(0.35)), color(0x4b5a4c), stain.mul(0.45));
  const ground = mix(base, wall, steep);
  // Build-mode tile grid overlay (not on walls).
  const gx = abs(fract(positionWorld.x).sub(0.5));
  const gz = abs(fract(positionWorld.z).sub(0.5));
  const line = smoothstep(0.46, 0.5, max(gx, gz)).mul(U.grid).mul(float(1).sub(steep));
  m.colorNode = withOverlay(mix(ground, color(0xeafff6), line.mul(0.5)), false).mul(cloudShade());
  m.normalNode = mix(normalView, normalFlat, steep).normalize();
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
    // One height sample per vertex (the noise-heavy height function dominated boot when it was
    // sampled three times per vertex for slope); slope comes from neighbouring samples instead.
    const hs = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hs[j * n + i] = terrainHeight(min + i * step, min + j * step, this.seed, g.w);
    const at = (i: number, j: number) => hs[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))]!;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = min + i * step;
        const z = min + j * step;
        const h = hs[j * n + i]!;
        // Per-unit slope matching the old ±1 sampling: difference across 2·step, scaled to 2 units.
        const sx = (at(i + 1, j) - at(i - 1, j)) / step;
        const sz = (at(i, j + 1) - at(i, j - 1)) / step;
        const k = (j * n + i) * 3;
        pos[k] = x;
        pos[k + 1] = h;
        pos[k + 2] = z;
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
