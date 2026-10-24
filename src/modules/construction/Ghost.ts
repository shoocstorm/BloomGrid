import { Color, Group, InstancedMesh, Matrix4, Mesh, PlaneGeometry, type Scene } from 'three/webgpu';
import { getPiece } from '@/assets/kit/pieces';
import { getMaterial } from '@/render/materials/library';
import { U } from '@/render/uniforms';
import type { PlacedPiece } from './BuildingRenderer';

const VALID = new Color(0x7ff7e6);
const INVALID = new Color(0xff7a7a);
const _m = new Matrix4();

/** Translucent placement preview (instanced per piece type) plus a footprint cursor. */
export class Ghost {
  readonly group = new Group();
  readonly cursor: Mesh;
  private pool = new Map<string, InstancedMesh>();
  private tiles: InstancedMesh;

  constructor(scene: Scene) {
    this.group.name = 'ghost';
    this.cursor = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), getMaterial('cursor'));
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    this.tiles = new InstancedMesh(new PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), getMaterial('cursor'), 1024);
    this.tiles.count = 0;
    this.tiles.frustumCulled = false;
    this.tiles.renderOrder = 10;
    scene.add(this.group, this.cursor, this.tiles);
  }

  setValid(ok: boolean): void {
    U.ghost.value.copy(ok ? VALID : INVALID);
  }

  /** Shows a building preview from world-space placed pieces. Meshes are pooled per piece type. */
  showPieces(pieces: PlacedPiece[]): void {
    const counts = new Map<string, number>();
    for (const p of pieces) counts.set(p.piece, (counts.get(p.piece) ?? 0) + 1);
    for (const [id, mesh] of this.pool) if (!counts.has(id)) mesh.count = 0;
    const fill = new Map<string, number>();
    for (const p of pieces) {
      let mesh = this.pool.get(p.piece);
      const need = counts.get(p.piece)!;
      if (!mesh || mesh.instanceMatrix.count < need) {
        if (mesh) {
          this.group.remove(mesh);
          mesh.dispose();
        }
        mesh = new InstancedMesh(getPiece(p.piece).geometry, getMaterial('ghost'), Math.max(need, 32));
        mesh.frustumCulled = false;
        this.pool.set(p.piece, mesh);
        this.group.add(mesh);
      }
      const i = fill.get(p.piece) ?? 0;
      fill.set(p.piece, i + 1);
      mesh.setMatrixAt(i, _m.compose(p.pos, p.quat, p.scale));
      mesh.count = need;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  clearPieces(): void {
    for (const m of this.pool.values()) m.count = 0;
  }

  /** Moves the whole preview by an offset (cheap: avoids re-assembling every frame). */
  setOffset(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  showCursor(x: number, y: number, z: number, w: number, d: number): void {
    this.cursor.visible = true;
    this.cursor.position.set(x + w / 2, y + 0.06, z + d / 2);
    this.cursor.scale.set(w, 1, d);
  }

  hideCursor(): void {
    this.cursor.visible = false;
  }

  /** Per-tile highlights (road preview / bulldoze area). */
  showTiles(tiles: [number, number, number][]): void {
    const n = Math.min(tiles.length, 1024);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = tiles[i]!;
      this.tiles.setMatrixAt(i, _m.makeTranslation(x + 0.5, y + 0.07, z + 0.5));
    }
    this.tiles.count = n;
    this.tiles.instanceMatrix.needsUpdate = true;
  }

  hideAll(): void {
    this.clearPieces();
    this.hideCursor();
    this.tiles.count = 0;
  }
}
