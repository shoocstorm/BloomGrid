import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { Greenery } from '@/ecs/components';
import { buildings } from '@/content';
import type { BuildingDef, KitBuilder, PieceSpec } from '@/content/types';
import { Rng, hash2 } from '@/sim/random';
import type { InstanceHandle } from '@/render/Instancer';
import type { GameContext } from '@/game/context';

export interface PlacedPiece {
  piece: string;
  pos: Vector3;
  quat: Quaternion;
  scale: Vector3;
  tint: number;
  glow: number;
  growAt: number;
  seed: number;
}

interface Entry {
  handles: InstanceHandle[];
  /** Membrane pieces whose shader reads live greenery. */
  moss: InstanceHandle[];
  /** Pieces waiting for greenery to reach their threshold, sorted by growAt. */
  pending: PlacedPiece[];
  lastGreenery: number;
}

const _e = new Euler();
const _m = new Matrix4();
const _c = new Color();
const _params = new Float32Array(4);

/** Runs a building recipe into world-space piece placements. Deterministic per (def, x, z). */
export function assembleBuilding(
  grid: GameContext['city']['grid'],
  def: BuildingDef,
  x: number,
  z: number,
  rot: number,
): PlacedPiece[] {
  if (typeof def.recipe !== 'function') return [];
  const [fw, fd] = def.footprint;
  const W = rot % 2 ? fd : fw;
  const D = rot % 2 ? fw : fd;
  const { min, max } = grid.rangeOver(x, z, W, D);
  const baseY = max + 0.02;
  const origin = new Vector3(x + W / 2, baseY, z + D / 2);
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -rot * (Math.PI / 2));
  const rng = new Rng(Math.floor(hash2(x, z, buildings.indexOf(def.id) + 1) * 2 ** 31));
  const out: PlacedPiece[] = [];

  const push = (spec: PieceSpec) => {
    const p = spec.p ?? [0, 0, 0];
    const s = spec.s ?? 1;
    const pos = new Vector3(p[0], p[1], p[2]).applyQuaternion(yaw).add(origin);
    const quat = new Quaternion().setFromEuler(_e.set(spec.rx ?? 0, spec.r ?? 0, spec.rz ?? 0, 'YXZ')).premultiply(yaw);
    const scale = typeof s === 'number' ? new Vector3(s, s, s) : new Vector3(s[0], s[1], s[2]);
    out.push({ piece: spec.piece, pos, quat, scale, tint: spec.tint ?? 0xffffff, glow: spec.glow ?? 0, growAt: spec.growAt ?? 0, seed: rng.next() });
  };

  // Terraced foundation that meets uneven ground.
  const bottom = min - 0.4;
  push({ piece: 'plinth', p: [0, bottom - baseY, 0], s: [fw * 0.98, baseY - bottom, fd * 0.98] });

  const builder: KitBuilder = {
    w: fw,
    d: fd,
    rand: () => rng.next(),
    range: (a, b) => rng.range(a, b),
    pick: (arr) => rng.pick(arr),
    add: push,
  };
  def.recipe(builder);
  return out;
}

/**
 * Mirrors building entities into instanced kit pieces. New buildings grow bottom-up; later
 * plant stages pop in as the sim's greenery value crosses each piece's `growAt` threshold.
 */
export class BuildingRenderer {
  private entries = new Map<number, Entry>();
  private mossTimer = 0;

  constructor(private ctx: GameContext) {
    const { bus } = ctx;
    bus.on('building:added', ({ eid }) => this.add(eid, !ctx.loading));
    bus.on('building:removed', ({ eid }) => this.remove(eid));
    bus.on('city:reset', () => {
      for (const eid of [...this.entries.keys()]) this.remove(eid);
    });
  }

  get count(): number {
    return this.entries.size;
  }

  private add(eid: number, animate: boolean): void {
    const { city, instancer, assets } = this.ctx;
    const rec = city.buildingRecord(eid);
    const def = buildings.get(rec.def);
    const entry: Entry = { handles: [], moss: [], pending: [], lastGreenery: rec.greenery };
    this.entries.set(eid, entry);

    if (typeof def.recipe !== 'function') {
      const recipe = def.recipe;
      void assets.loadGlbPieces(recipe.glb).then((parts) => {
        if (this.entries.get(eid) !== entry) return;
        const [fw, fd] = def.footprint;
        const W = rec.rot % 2 ? fd : fw;
        const D = rec.rot % 2 ? fw : fd;
        const base = new Matrix4().compose(
          new Vector3(rec.x + W / 2, city.grid.rangeOver(rec.x, rec.z, W, D).max, rec.z + D / 2),
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -rec.rot * (Math.PI / 2)),
          new Vector3().setScalar(recipe.scale ?? 1),
        );
        for (const part of parts) {
          const pos = new Vector3();
          const quat = new Quaternion();
          const scale = new Vector3();
          _m.multiplyMatrices(base, part.matrix).decompose(pos, quat, scale);
          _params.set([1, 0, 0, 0]);
          entry.handles.push(instancer.add(part.piece, pos, quat, scale, _c.setHex(0xffffff), _params, animate ? 0 : -1));
        }
      });
      return;
    }

    const pieces = assembleBuilding(city.grid, def, rec.x, rec.z, rec.rot);
    const baseY = pieces[0]?.pos.y ?? 0;
    for (const p of pieces) {
      if (p.growAt <= rec.greenery) {
        const delay = animate ? Math.max(0, p.pos.y - baseY) * 0.35 + Math.random() * 0.08 : -1;
        this.spawn(entry, p, rec.greenery, delay);
      } else {
        entry.pending.push(p);
      }
    }
    entry.pending.sort((a, b) => a.growAt - b.growAt);
  }

  private spawn(entry: Entry, p: PlacedPiece, greenery: number, delay: number): void {
    _params[0] = greenery;
    _params[1] = p.seed;
    _params[2] = p.glow;
    _params[3] = 0;
    const h = this.ctx.instancer.add(p.piece, p.pos, p.quat, p.scale, _c.setHex(p.tint), _params, delay, 0.7);
    entry.handles.push(h);
    if (p.piece === 'mossBox') entry.moss.push(h);
  }

  private remove(eid: number): void {
    const entry = this.entries.get(eid);
    if (!entry) return;
    for (const h of entry.handles) this.ctx.instancer.remove(h);
    this.entries.delete(eid);
  }

  /** Per-frame: stage plant growth and feed live greenery to membrane shaders. */
  update(dt: number): void {
    this.mossTimer += dt;
    const updateMoss = this.mossTimer > 0.25;
    if (updateMoss) this.mossTimer = 0;
    for (const [eid, entry] of this.entries) {
      const g = Greenery.value[eid]!;
      if (g === entry.lastGreenery) continue;
      let spawned = 0;
      while (entry.pending.length && entry.pending[0]!.growAt <= g) {
        this.spawn(entry, entry.pending.shift()!, g, spawned++ * 0.04);
      }
      if (updateMoss) {
        entry.lastGreenery = g;
        for (const h of entry.moss) this.ctx.instancer.setParam(h, 0, g);
      }
    }
  }
}
