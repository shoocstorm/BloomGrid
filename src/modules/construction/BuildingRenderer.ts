import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { Greenery, Problem, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { BuildingDef, KitBuilder, PieceSpec } from '@/content/types';
import { Rng, hash2 } from '@/sim/random';
import type { Grid } from '@/sim/Grid';
import type { InstanceHandle } from '@/render/Instancer';
import type { GameContext } from '@/game/context';

/** One piece of a cached recipe run, in building-local space (origin = footprint centre at ground). */
export interface TemplatePiece {
  piece: string;
  local: Matrix4;
  tint: number;
  glow: number;
  growAt: number;
  seed: number;
  /** Local base height, used to stagger the bottom-up construction animation. */
  y: number;
}

export interface BuildingTemplate {
  pieces: TemplatePiece[];
  /** Top of the tallest piece (local), for placing alert markers. */
  height: number;
}

/** World-space placement of a building: template + base transform + terrain plinth. */
export interface Placement {
  template: BuildingTemplate;
  base: Matrix4;
  plinth: Matrix4;
}

const _e = new Euler();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _m = new Matrix4();
const _c = new Color();
const _params = new Float32Array(4);
const UP = new Vector3(0, 1, 0);

const templates = new Map<string, BuildingTemplate>();
/** Pieces whose materials read vitality from aParams.w. */
const PLANT_PIECES = new Set(['mossBox', 'canopy', 'bush', 'grass', 'ivy', 'flower', 'fungus']);

/**
 * Runs a recipe once per (definition, variant) and caches the result. Thousands of buildings
 * then cost only a matrix multiply per piece, instead of re-running recipes and allocating.
 */
export function buildingTemplate(def: BuildingDef, variant: number): BuildingTemplate {
  const key = `${def.id}#${variant}`;
  let t = templates.get(key);
  if (t) return t;
  const rng = new Rng(Math.floor(hash2(variant, 7, buildings.indexOf(def.id) + 1) * 2 ** 31));
  const pieces: TemplatePiece[] = [];
  let height = 0.5;
  const add = (spec: PieceSpec) => {
    const p = spec.p ?? [0, 0, 0];
    const s = spec.s ?? 1;
    const sv = typeof s === 'number' ? _s.set(s, s, s) : _s.set(s[0], s[1], s[2]);
    _q.setFromEuler(_e.set(spec.rx ?? 0, spec.r ?? 0, spec.rz ?? 0, 'YXZ'));
    const local = new Matrix4().compose(_v.set(p[0], p[1], p[2]), _q, sv);
    height = Math.max(height, p[1] + (spec.piece === 'ivy' ? 0 : sv.y));
    pieces.push({ piece: spec.piece, local, tint: spec.tint ?? 0xffffff, glow: spec.glow ?? 0, growAt: spec.growAt ?? 0, seed: rng.next(), y: p[1] });
  };
  const [w, d] = def.footprint;
  const builder: KitBuilder = { w, d, rand: () => rng.next(), range: (a, b) => rng.range(a, b), pick: (arr) => rng.pick(arr), add };
  if (typeof def.recipe === 'function') def.recipe(builder);
  t = { pieces, height };
  templates.set(key, t);
  return t;
}

export function variantFor(def: BuildingDef, x: number, z: number): number {
  return Math.floor(hash2(x, z, buildings.indexOf(def.id) + 1) * (def.variants ?? 3));
}

/** Flattens a placement into world matrices (for previews). */
export function placementMatrices(place: Placement): { piece: string; matrix: Matrix4 }[] {
  return [
    { piece: 'plinth', matrix: place.plinth },
    ...place.template.pieces.map((p) => ({ piece: p.piece, matrix: new Matrix4().multiplyMatrices(place.base, p.local) })),
  ];
}

/** Base transform and terrain-meeting plinth for a building at (x, z, rot). */
export function placeBuilding(grid: Grid, def: BuildingDef, x: number, z: number, rot: number): Placement {
  const [fw, fd] = def.footprint;
  const W = rot % 2 ? fd : fw;
  const D = rot % 2 ? fw : fd;
  const { min, max } = grid.rangeOver(x, z, W, D);
  const baseY = max + 0.02;
  const base = new Matrix4().compose(_v.set(x + W / 2, baseY, z + D / 2), _q.setFromAxisAngle(UP, -rot * (Math.PI / 2)), _s.set(1, 1, 1));
  const bottom = min - 0.4;
  const plinth = new Matrix4().multiplyMatrices(base, _m.compose(_v.set(0, bottom - baseY, 0), _q.identity(), _s.set(fw * 0.98, baseY - bottom, fd * 0.98)));
  return { template: buildingTemplate(def, variantFor(def, x, z)), base, plinth };
}

interface Entry {
  handles: InstanceHandle[];
  /** Membrane pieces whose shader reads live greenery. */
  moss: InstanceHandle[];
  /** Glass pieces whose lit windows follow power and occupancy (aParams.w). */
  glass: InstanceHandle[];
  /** Plant and membrane pieces that wilt with low vitality (aParams.w). */
  plants: InstanceHandle[];
  vitality: number;
  /** Template pieces waiting for greenery to reach their threshold, sorted by growAt. */
  pending: TemplatePiece[];
  base: Matrix4;
  height: number;
  lastGreenery: number;
  /** Window lighting 0..1 (power × occupancy). */
  power: number;
  problems: number;
  alert: InstanceHandle | null;
}

const ALERT_COLORS: [number, number][] = [
  [Problem.NO_ROAD, 0xe8e8e8],
  [Problem.NO_POWER, 0xffcf3a],
  [Problem.NO_WATER, 0x4ab8ff],
  [Problem.UNSTAFFED, 0xc9a6ff],
];

/**
 * Mirrors building entities into instanced kit pieces. New buildings grow bottom-up; later
 * plant stages pop in as the sim's greenery crosses each piece's `growAt`. Service state is
 * reflected visually: windows dim without power, and a floating marker flags problems.
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
    bus.on('stats:updated', () => this.syncService());
    // Bulk content (scenario) may exist before this renderer attaches.
    for (const eid of ctx.city.buildingEntities()) this.add(eid, false);
  }

  get count(): number {
    return this.entries.size;
  }

  private add(eid: number, animate: boolean): void {
    const { city, instancer, assets } = this.ctx;
    const rec = city.buildingRecord(eid);
    const def = buildings.get(rec.def);
    const place = placeBuilding(city.grid, def, rec.x, rec.z, rec.rot);
    const entry: Entry = {
      handles: [],
      moss: [],
      glass: [],
      plants: [],
      vitality: 1,
      pending: [],
      base: place.base,
      height: place.template.height,
      lastGreenery: rec.greenery,
      power: 1,
      problems: 0,
      alert: null,
    };
    this.entries.set(eid, entry);
    _params.set([rec.greenery, 0.5, 0, 1]);
    entry.handles.push(instancer.addMatrix('plinth', place.plinth, _c.setHex(0xffffff), _params, animate ? 0 : -1));

    if (typeof def.recipe !== 'function') {
      const recipe = def.recipe;
      void assets.loadGlbPieces(recipe.glb).then((parts) => {
        if (this.entries.get(eid) !== entry) return;
        const scaled = _m.copy(place.base).scale(_s.setScalar(recipe.scale ?? 1)).clone();
        for (const part of parts) {
          _params.set([1, 0, 0, 1]);
          const world = new Matrix4().multiplyMatrices(scaled, part.matrix);
          entry.handles.push(instancer.addMatrix(part.piece, world, _c.setHex(0xffffff), _params, animate ? 0 : -1));
        }
      });
      return;
    }

    for (const p of place.template.pieces) {
      if (p.growAt <= rec.greenery) this.spawn(entry, p, rec.greenery, animate ? p.y * 0.35 + Math.random() * 0.08 : -1);
      else entry.pending.push(p);
    }
    entry.pending.sort((a, b) => a.growAt - b.growAt);
  }

  private spawn(entry: Entry, p: TemplatePiece, greenery: number, delay: number): void {
    _params[0] = greenery;
    _params[1] = p.seed;
    _params[2] = p.glow;
    const glass = p.piece === 'glassBox' || p.piece === 'glassCyl';
    const plant = PLANT_PIECES.has(p.piece);
    _params[3] = glass ? entry.power : plant ? entry.vitality : 1;
    const world = _m.multiplyMatrices(entry.base, p.local);
    const h = this.ctx.instancer.addMatrix(p.piece, world, _c.setHex(p.tint), _params, delay, 0.7);
    entry.handles.push(h);
    if (p.piece === 'mossBox') entry.moss.push(h);
    if (glass) entry.glass.push(h);
    else if (plant) entry.plants.push(h);
  }

  private remove(eid: number): void {
    const entry = this.entries.get(eid);
    if (!entry) return;
    for (const h of entry.handles) this.ctx.instancer.remove(h);
    if (entry.alert) this.ctx.instancer.remove(entry.alert);
    this.entries.delete(eid);
  }

  /**
   * Once per pulse: windows light with power and occupancy, plants wilt without water (or when
   * a home is all but abandoned), and problem markers appear.
   */
  private syncService(): void {
    const { instancer, city } = this.ctx;
    for (const [eid, entry] of this.entries) {
      const st = city.buildingDef(eid).stats;
      const occ = Service.occupancy[eid]!;
      const occupied = st.population > 0 || st.jobs > 0 ? 0.2 + 0.8 * occ : 1;
      const power = Service.power[eid]! * occupied;
      if (Math.abs(power - entry.power) > 0.03) {
        entry.power = power;
        for (const h of entry.glass) instancer.setParam(h, 3, power);
      }
      const abandoned = st.population > 0 && occ < 0.2 ? 0.55 : 1;
      const vitality = (st.water < 0 ? Service.water[eid]! : 1) * abandoned;
      if (Math.abs(vitality - entry.vitality) > 0.04) {
        entry.vitality = vitality;
        for (const h of entry.plants) instancer.setParam(h, 3, vitality);
      }
      const problems = Service.problems[eid]!;
      if (problems === entry.problems) continue;
      entry.problems = problems;
      if (entry.alert) {
        instancer.remove(entry.alert);
        entry.alert = null;
      }
      const hit = ALERT_COLORS.find(([bit]) => problems & bit);
      if (!hit) continue;
      _params.set([0, (eid % 97) / 97, 1, 1]);
      const e = entry.base.elements;
      const world = _m.compose(_v.set(e[12]!, e[13]! + entry.height + 0.8, e[14]!), _q.identity(), _s.setScalar(0.6));
      entry.alert = instancer.addMatrix('alert', world, _c.setHex(hit[1]), _params, 0, 0.4);
    }
  }

  /** Per-frame: stage plant growth and feed live greenery to membrane shaders. */
  update(dt: number): void {
    // Greenery changes slowly (~1%/s), so check at 2 Hz and only re-upload moss coverage once it
    // has visibly moved: every param write is GPU upload traffic.
    this.mossTimer += dt;
    if (this.mossTimer < 0.5) return;
    this.mossTimer = 0;
    for (const [eid, entry] of this.entries) {
      const g = Greenery.value[eid]!;
      let spawned = 0;
      while (entry.pending.length && entry.pending[0]!.growAt <= g) {
        this.spawn(entry, entry.pending.shift()!, g, spawned++ * 0.04);
      }
      if (Math.abs(g - entry.lastGreenery) >= 0.03 || (g >= 1 && entry.lastGreenery < 1)) {
        entry.lastGreenery = g;
        for (const h of entry.moss) this.ctx.instancer.setParam(h, 0, g);
      }
    }
  }
}
