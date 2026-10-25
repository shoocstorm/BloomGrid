import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Sphere,
  Vector3,
  type Camera,
  type Object3D,
} from 'three/webgpu';
import { getPiece, type PieceType } from '@/assets/kit/pieces';
import { getMaterial } from './materials/library';

export interface InstanceHandle {
  batch: InstanceBatch | null;
  slot: number;
}

/**
 * Minimum batch capacity. three puts instance matrices that fit in a uniform buffer (≤ 64 KiB,
 * i.e. ≤ 1024 matrices) into a UBO that is re-uploaded every frame, with the array length baked
 * into the shader (one shader variant per capacity). Staying above that size forces the vertex
 * attribute path: one shader for all batches and uploads only of changed ranges.
 */
const INITIAL_CAPACITY = 1040;

/**
 * Tracks which instance slots changed since the last upload. A few scattered slots become
 * individual GPU update ranges; many become one span. Kept per attribute, so a matrix-only
 * tween never re-uploads colours or params.
 */
class DirtySlots {
  private slots: number[] = [];
  private min = Infinity;
  private max = -1;
  private span = false;

  /**
   * Each range is one `writeBuffer` call with fixed IPC overhead, so keep ranges few: beyond
   * `limit` scattered slots, upload one span instead.
   */
  constructor(private limit = 8) {}

  mark(slot: number): void {
    if (slot < this.min) this.min = slot;
    if (slot > this.max) this.max = slot;
    if (!this.span) {
      if (this.slots.length < this.limit) this.slots.push(slot);
      else this.span = true;
    }
  }

  markAll(count: number): void {
    this.min = 0;
    this.max = Math.max(this.max, count - 1);
    this.span = true;
  }

  flush(attr: InstancedBufferAttribute, size: number): void {
    if (this.max < 0) return;
    attr.clearUpdateRanges();
    if (this.span) attr.addUpdateRange(this.min * size, (this.max - this.min + 1) * size);
    else {
      this.slots.sort((a, b) => a - b);
      let start = this.slots[0]!;
      let prev = start;
      for (let i = 1; i <= this.slots.length; i++) {
        const s = this.slots[i];
        // Merge nearby slots: re-uploading a short clean gap is cheaper than another call.
        if (s !== undefined && s <= prev + 16) {
          prev = s;
          continue;
        }
        attr.addUpdateRange(start * size, (prev - start + 1) * size);
        if (s !== undefined) start = prev = s;
      }
    }
    attr.needsUpdate = true;
    this.slots.length = 0;
    this.min = Infinity;
    this.max = -1;
    this.span = false;
  }
}

/** Conservative vertical extent for chunk bounds (terrain + tallest towers). */
const CHUNK_Y_MIN = -12;
const CHUNK_Y_MAX = 40;

/** One InstancedMesh for a (piece, chunk) pair. Swap-remove keeps instances densely packed. */
class InstanceBatch {
  mesh: InstancedMesh;
  params: InstancedBufferAttribute;
  handles: InstanceHandle[] = [];
  capacity = INITIAL_CAPACITY;
  private dMatrix = new DirtySlots();
  private dColor = new DirtySlots();
  private dParams = new DirtySlots();
  private bounds: Sphere;

  constructor(
    readonly piece: PieceType,
    readonly cx: number,
    readonly cz: number,
    chunkSize: number,
    private parent: Object3D,
  ) {
    // Fixed chunk-sized bounds: frustum culling stays per chunk and never needs an O(n) recompute.
    const half = chunkSize / 2;
    const hy = (CHUNK_Y_MAX - CHUNK_Y_MIN) / 2;
    this.bounds = new Sphere(
      new Vector3(cx * chunkSize + half, CHUNK_Y_MIN + hy, cz * chunkSize + half),
      Math.hypot(half, half, hy) + 4,
    );
    const { mesh, params } = this.create(this.capacity);
    this.mesh = mesh;
    this.params = params;
  }

  get count(): number {
    return this.handles.length;
  }

  private create(capacity: number) {
    // Each batch owns a geometry clone so it can carry its own per-instance attribute and be
    // disposed safely (shared GPU buffers would be freed by dispose()).
    const geometry = this.piece.geometry.clone();
    const params = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    geometry.setAttribute('aParams', params);
    const mesh = new InstancedMesh(geometry, getMaterial(this.piece.material), capacity);
    // Static usage on purpose: three re-uploads DynamicDrawUsage attributes in full on *every*
    // frame and pass. Static + version bumps + update ranges uploads only what changed.
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.count = 0;
    mesh.castShadow = this.piece.castShadow;
    mesh.receiveShadow = this.piece.receiveShadow;
    mesh.frustumCulled = true;
    mesh.boundingSphere = this.bounds;
    mesh.name = `${this.piece.id}@${this.cx},${this.cz}`;
    this.parent.add(mesh);
    return { mesh, params };
  }

  private grow(): void {
    const old = this.mesh;
    const oldParams = this.params;
    this.capacity *= 2;
    const { mesh, params } = this.create(this.capacity);
    mesh.instanceMatrix.array.set(old.instanceMatrix.array as Float32Array);
    mesh.instanceColor!.array.set(old.instanceColor!.array as Float32Array);
    params.array.set(oldParams.array as Float32Array);
    mesh.count = old.count;
    mesh.visible = old.visible;
    this.parent.remove(old);
    old.geometry.dispose();
    old.dispose();
    this.mesh = mesh;
    this.params = params;
  }

  add(handle: InstanceHandle, m: Matrix4, color: Color, p: ArrayLike<number>): void {
    if (this.count >= this.capacity) this.grow();
    const slot = this.count;
    handle.batch = this;
    handle.slot = slot;
    this.handles.push(handle);
    this.mesh.count = this.handles.length;
    this.writeSlot(slot, m, color, p);
  }

  writeSlot(slot: number, m: Matrix4 | null, color: Color | null, p: ArrayLike<number> | null): void {
    if (m) {
      m.toArray(this.mesh.instanceMatrix.array as Float32Array, slot * 16);
      this.dMatrix.mark(slot);
    }
    if (color) {
      color.toArray(this.mesh.instanceColor!.array as Float32Array, slot * 3);
      this.dColor.mark(slot);
    }
    if (p) {
      const a = this.params.array as Float32Array;
      a[slot * 4] = p[0]!;
      a[slot * 4 + 1] = p[1]!;
      a[slot * 4 + 2] = p[2]!;
      a[slot * 4 + 3] = p[3]!;
      this.dParams.mark(slot);
    }
  }

  setParam(slot: number, component: number, value: number): void {
    (this.params.array as Float32Array)[slot * 4 + component] = value;
    this.dParams.mark(slot);
  }

  remove(handle: InstanceHandle): void {
    const slot = handle.slot;
    const last = this.handles.length - 1;
    if (slot !== last) {
      // Move last instance into the freed slot.
      const mArr = this.mesh.instanceMatrix.array as Float32Array;
      mArr.copyWithin(slot * 16, last * 16, last * 16 + 16);
      const cArr = this.mesh.instanceColor!.array as Float32Array;
      cArr.copyWithin(slot * 3, last * 3, last * 3 + 3);
      const pArr = this.params.array as Float32Array;
      pArr.copyWithin(slot * 4, last * 4, last * 4 + 4);
      const moved = this.handles[last]!;
      moved.slot = slot;
      this.handles[slot] = moved;
      this.dMatrix.mark(slot);
      this.dColor.mark(slot);
      this.dParams.mark(slot);
    }
    this.handles.pop();
    this.mesh.count = this.handles.length;
    handle.batch = null;
    handle.slot = -1;
  }

  flush(): void {
    this.dMatrix.flush(this.mesh.instanceMatrix, 16);
    this.dColor.flush(this.mesh.instanceColor!, 3);
    this.dParams.flush(this.params, 4);
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

interface Tween {
  handle: InstanceHandle;
  /** Final transform; the tween scales it about the piece pivot (M · S(e)). */
  matrix: Matrix4;
  start: number;
  duration: number;
}

const _m = new Matrix4();
const _m2 = new Matrix4();
const _s = new Vector3();
const _v = new Vector3();

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Spatially chunked instancing for every kit piece. Chunks give per-region frustum culling
 * and distance LOD (small pieces like grass and flowers are dropped far from the camera)
 * while keeping draw calls proportional to *visible* chunks × piece types.
 */
export class ChunkedInstancer {
  private batches = new Map<string, InstanceBatch>();
  private tweens: Tween[] = [];
  lodScale = 1;
  time = 0;
  /** Batches farther than this from `shadowFocus` (xz) stop casting shadows. */
  shadowRadius = Infinity;
  readonly shadowFocus = new Vector3();

  constructor(
    private parent: Object3D,
    readonly chunkSize = 64,
  ) {}

  get instanceCount(): number {
    let n = 0;
    for (const b of this.batches.values()) n += b.count;
    return n;
  }

  /** True while growth tweens are playing (shadows should refresh). */
  get animating(): boolean {
    return this.tweens.length > 0;
  }

  get batchCount(): number {
    return this.batches.size;
  }

  private batchFor(pieceId: string, x: number, z: number): InstanceBatch {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    const key = `${pieceId}|${cx}|${cz}`;
    let b = this.batches.get(key);
    if (!b) {
      b = new InstanceBatch(getPiece(pieceId), cx, cz, this.chunkSize, this.parent);
      this.batches.set(key, b);
    }
    return b;
  }

  /**
   * Adds an instance from a world matrix. With `growDelay >= 0` it pops in with an elastic
   * scale tween (about the piece pivot) after that many seconds; otherwise it appears at once.
   */
  addMatrix(pieceId: string, matrix: Matrix4, color: Color, params: ArrayLike<number>, growDelay = -1, growDuration = 0.6): InstanceHandle {
    const handle: InstanceHandle = { batch: null, slot: -1 };
    const e = matrix.elements;
    const batch = this.batchFor(pieceId, e[12]!, e[14]!);
    if (growDelay >= 0) {
      batch.add(handle, _m.copy(matrix).scale(_s.setScalar(1e-4)), color, params);
      this.tweens.push({ handle, matrix: matrix.clone(), start: this.time + growDelay, duration: growDuration });
    } else {
      batch.add(handle, matrix, color, params);
    }
    return handle;
  }

  /** Convenience wrapper over `addMatrix` for position / rotation / scale. */
  add(
    pieceId: string,
    pos: Vector3,
    quat: Quaternion,
    scale: Vector3,
    color: Color,
    params: ArrayLike<number>,
    growDelay = -1,
    growDuration = 0.6,
  ): InstanceHandle {
    return this.addMatrix(pieceId, _m2.compose(pos, quat, scale), color, params, growDelay, growDuration);
  }

  remove(handle: InstanceHandle): void {
    handle.batch?.remove(handle);
  }

  /**
   * Compiles every piece pipeline up front (one temporary instance each at `at`), so the first
   * placement of a building type never stalls on shader compilation — notably on WebGL2.
   * `compile` must build for the render path frames use (see `PostFX.compile`).
   */
  async warmup(compile: () => Promise<void>, camera: Camera, pieceIds: string[], at: Vector3): Promise<void> {
    const params = [0, 0, 0, 0];
    const white = new Color(1, 1, 1);
    const q = new Quaternion();
    const s = new Vector3(1, 1, 1);
    const handles = pieceIds.map((id) => this.add(id, at, q, s, white, params));
    this.update(0, camera);
    // three keys node builds by InstancedMesh uuid, so every (piece, chunk) batch builds its own
    // graph. Build them all here, not just those in view: the boot camera starts over the whole
    // island, and the first frame otherwise built ~250 graphs synchronously (≈1 s stall).
    for (const b of this.batches.values()) {
      b.mesh.visible = b.count > 0;
      b.mesh.frustumCulled = false;
    }
    await compile();
    for (const b of this.batches.values()) b.mesh.frustumCulled = true;
    handles.forEach((h) => this.remove(h));
    this.update(0, camera);
  }

  setParam(handle: InstanceHandle, component: number, value: number): void {
    if (handle.batch) handle.batch.setParam(handle.slot, component, value);
  }

  clear(): void {
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    this.tweens.length = 0;
  }

  update(dt: number, camera: Camera): void {
    this.time += dt;
    // Growth tweens (swap-remove from the tween list when done).
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i]!;
      if (!t.handle.batch) {
        this.tweens[i] = this.tweens[this.tweens.length - 1]!;
        this.tweens.pop();
        continue;
      }
      const k = (this.time - t.start) / t.duration;
      if (k <= 0) continue;
      const done = k >= 1;
      const e = done ? 1 : Math.max(1e-4, easeOutBack(k));
      _m.copy(t.matrix).scale(_s.setScalar(e));
      t.handle.batch.writeSlot(t.handle.slot, _m, null, null);
      if (done) {
        this.tweens[i] = this.tweens[this.tweens.length - 1]!;
        this.tweens.pop();
      }
    }

    // Bounds, distance LOD and shadow LOD per batch.
    const cam = camera.position;
    const half = this.chunkSize / 2;
    const sf = this.shadowFocus;
    for (const b of this.batches.values()) {
      b.flush();
      if (b.piece.castShadow) {
        const sx = Math.max(0, Math.abs(sf.x - (b.cx * this.chunkSize + half)) - half);
        const sz = Math.max(0, Math.abs(sf.z - (b.cz * this.chunkSize + half)) - half);
        b.mesh.castShadow = Math.hypot(sx, sz) < this.shadowRadius;
      }
      if (b.piece.lod !== Infinity) {
        _v.set(b.cx * this.chunkSize + half, 0, b.cz * this.chunkSize + half);
        const dx = Math.max(0, Math.abs(cam.x - _v.x) - half);
        const dz = Math.max(0, Math.abs(cam.z - _v.z) - half);
        const d = Math.hypot(dx, dz, cam.y * 0.5);
        b.mesh.visible = b.count > 0 && d < b.piece.lod * this.lodScale;
      } else {
        b.mesh.visible = b.count > 0;
      }
    }
  }
}
