import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { Building, Greenery, Problem, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { BuildingDef, KitBuilder, PieceSpec } from '@/content/types';
import { Rng, hash2 } from '@/sim/random';
import { PALETTE } from '@/content/kit';
import type { Grid } from '@/sim/Grid';
import type { InstanceHandle } from '@/render/Instancer';
import type { GameContext } from '@/game/context';
import { STYLES, isStyled, pickStyle, restyle, styleIndex, type BuildingStyle } from '@/render/materials/styles';

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
  /** Local bounds of the solid building volume (for façade decoration). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; top: number };
  /** Bloom Retrofit overlay (flower walls, ivy curtains, sunflower roof), built on demand. */
  retrofit?: TemplatePiece[];
  /** Banyan merge overlay (aerial roots, buttresses, crown), built on demand. */
  banyan?: TemplatePiece[];
  rng: Rng;
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
/** Pieces that make up a building's solid volume (for façade bounds). */
// Domes and tanks are excluded: dressing their bounding box would float flowers in mid-air.
const SOLID_PIECES = new Set(['slab', 'glassBox', 'glassCyl', 'concreteCyl', 'mossBox']);

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
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, top: 0 };
  const add = (spec: PieceSpec) => {
    const p = spec.p ?? [0, 0, 0];
    const s = spec.s ?? 1;
    const sv = typeof s === 'number' ? _s.set(s, s, s) : _s.set(s[0], s[1], s[2]);
    _q.setFromEuler(_e.set(spec.rx ?? 0, spec.r ?? 0, spec.rz ?? 0, 'YXZ'));
    const local = new Matrix4().compose(_v.set(p[0], p[1], p[2]), _q, sv);
    height = Math.max(height, p[1] + (spec.piece === 'ivy' ? 0 : sv.y));
    if (SOLID_PIECES.has(spec.piece)) {
      // Rotated half-extents of a unit piece (pivot at base centre).
      const hx = Math.abs(Math.cos(spec.r ?? 0)) * sv.x * 0.5 + Math.abs(Math.sin(spec.r ?? 0)) * sv.z * 0.5;
      const hz = Math.abs(Math.sin(spec.r ?? 0)) * sv.x * 0.5 + Math.abs(Math.cos(spec.r ?? 0)) * sv.z * 0.5;
      bounds.minX = Math.min(bounds.minX, p[0] - hx);
      bounds.maxX = Math.max(bounds.maxX, p[0] + hx);
      bounds.minZ = Math.min(bounds.minZ, p[2] - hz);
      bounds.maxZ = Math.max(bounds.maxZ, p[2] + hz);
      bounds.top = Math.max(bounds.top, p[1] + sv.y);
    }
    pieces.push({ piece: spec.piece, local, tint: spec.tint ?? 0xffffff, glow: spec.glow ?? 0, growAt: spec.growAt ?? 0, seed: rng.next(), y: p[1] });
  };
  const [w, d] = def.footprint;
  const builder: KitBuilder = { w, d, rand: () => rng.next(), range: (a, b) => rng.range(a, b), pick: (arr) => rng.pick(arr), add };
  const recipe = typeof def.recipe === 'function' ? def.recipe : def.recipe.fallback;
  recipe?.(builder);
  if (bounds.minX === Infinity) Object.assign(bounds, { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4, top: 0.5 });
  t = { pieces, height, bounds, rng };
  templates.set(key, t);
  return t;
}

/**
 * Bloom Retrofit overlay for a template: flowering façades and ivy curtains on all four faces,
 * plus a sunflower solar crown on the roof. Generated once per template and cached.
 */
export function retrofitPieces(t: BuildingTemplate): TemplatePiece[] {
  if (t.retrofit) return t.retrofit;
  const out: TemplatePiece[] = [];
  const { minX, maxX, minZ, maxZ, top } = t.bounds;
  const rng = t.rng;
  const push = (piece: string, p: [number, number, number], s: [number, number, number], r: number, tint: number, glow: number, rz = 0) => {
    _q.setFromEuler(_e.set(0, r, rz, 'YXZ'));
    out.push({ piece, local: new Matrix4().compose(_v.set(...p), _q, _s.set(...s)), tint, glow, growAt: 0, seed: rng.next(), y: p[1] });
  };
  const blossoms = PALETTE.blossoms;
  // Faces: [fixed coord, along-axis min, max, outward normal x, z]
  const faces: [number, number, number, number, number][] = [
    [maxX + 0.03, minZ, maxZ, 1, 0],
    [minX - 0.03, minZ, maxZ, -1, 0],
    [maxZ + 0.03, minX, maxX, 0, 1],
    [minZ - 0.03, minX, maxX, 0, -1],
  ];
  // Only buildings with a real box-like volume get flowering façades.
  const hasFacade = maxX - minX > 0.5 && maxZ - minZ > 0.5 && top > 0.4;
  const perFace = Math.max(8, Math.min(18, Math.round(top * 5)));
  for (const [fixed, a, b, nx, nz] of hasFacade ? faces : []) {
    // Blossom clusters climbing the façade, densest low down like a cascading planting.
    for (let i = 0; i < perFace; i++) {
      const u = a + 0.06 + rng.next() * (b - a - 0.12);
      const y = 0.12 + Math.pow(rng.next(), 1.4) * Math.max(0.2, top * 0.95 - 0.12);
      const p: [number, number, number] = nx ? [fixed, y, u] : [u, y, fixed];
      const s = 0.11 + rng.next() * 0.07;
      push('flower', p, [s, s, s], 0, rng.pick(blossoms), rng.next() < 0.6 ? 0.6 + rng.next() * 0.4 : 0);
    }
    // Short ivy fringes under each roof edge.
    for (let i = 0; i < 4; i++) {
      const u = a + ((i + 0.5) / 4) * (b - a);
      const p: [number, number, number] = nx ? [fixed, top, u] : [u, top, fixed];
      push('ivy', p, [0.13, Math.min(1, top * (0.25 + rng.next() * 0.2)), 1], Math.atan2(nx, nz), rng.pick(PALETTE.leaves), rng.next() < 0.3 ? 0.6 : 0);
    }
  }
  // Indoor-outdoor courtyard on taller buildings: a waterfall down one façade into a ground-floor
  // basin, framed by bushes and fungus lamps (their glow follows street activity at night).
  if (hasFacade && top > 1.2) {
    const [fixed, a, b, nx, nz] = faces[Math.floor(rng.next() * 4)]!;
    const mid = (a + b) / 2;
    const width = Math.min(0.55, (b - a) * 0.4);
    const r = Math.atan2(nx, nz);
    const at = (out: number, y: number, along = 0): [number, number, number] => (nx ? [fixed + nx * out, y, mid + along] : [mid + along, y, fixed + nz * out]);
    push('waterfall', at(0.02, 0.04), [width, top * 0.92, 1], r, 0xffffff, 0);
    push('pool', at(0.2, 0.0), [width + 0.18, 0.05, 0.36], r, 0xffffff, 0);
    for (const side of [-1, 1]) {
      push('bush', at(0.24, 0.02, side * (width / 2 + 0.17)), [0.2, 0.18, 0.2], 0, rng.pick(PALETTE.leaves), 0.4);
      push('fungus', at(0.42, 0.02, side * (width / 2 + 0.05)), [0.09, 0.09, 0.09], 0, 0xbff6ff, 1);
    }
  }
  // A ring of blossoms around the base for every retrofitted building (domes included).
  for (let i = 0; i < 12; i++) {
    const ang = rng.next() * Math.PI * 2;
    const rx = (maxX - minX) / 2 + 0.12;
    const rz = (maxZ - minZ) / 2 + 0.12;
    const s = 0.1 + rng.next() * 0.05;
    push('flower', [(minX + maxX) / 2 + Math.cos(ang) * rx, 0.02, (minZ + maxZ) / 2 + Math.sin(ang) * rz], [s, s, s], 0, rng.pick(blossoms), 0.7);
  }
  // Sunflower crown.
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  push('concreteCyl', [cx, top, cz], [0.32, 0.08, 0.32], 0, 0xffe08a, 0.5);
  for (let i = 0; i < 10; i++) push('sunPetal', [cx, top + 0.06, cz], [0.6, 1, 0.6], (i / 10) * Math.PI * 2, 0xffc83a, 0.6, 0.45); // golden sunflower petals
  t.retrofit = out;
  return out;
}

/**
 * Green Weaver banyan merge: aerial roots curtain the façades down to the ground, buttress roots
 * grip the base and a vast canopy crowns the roof. Generated once per template and cached.
 */
export function banyanPieces(t: BuildingTemplate): TemplatePiece[] {
  if (t.banyan) return t.banyan;
  const out: TemplatePiece[] = [];
  const { minX, maxX, minZ, maxZ, top } = t.bounds;
  const rng = t.rng;
  const push = (piece: string, p: [number, number, number], s: [number, number, number], r: number, tint: number, glow: number, rx = 0, rz = 0) => {
    _q.setFromEuler(_e.set(rx, r, rz, 'YXZ'));
    out.push({ piece, local: new Matrix4().compose(_v.set(...p), _q, _s.set(...s)), tint, glow, growAt: 0, seed: rng.next(), y: p[1] });
  };
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const hx = (maxX - minX) / 2 + 0.08;
  const hz = (maxZ - minZ) / 2 + 0.08;
  // Aerial roots around the perimeter, from the crown down to the ground.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng.next() * 0.2;
    const x = cx + Math.max(-hx, Math.min(hx, Math.cos(a) * hx * 1.4));
    const z = cz + Math.max(-hz, Math.min(hz, Math.sin(a) * hz * 1.4));
    const w = 0.03 + rng.next() * 0.035;
    push('trunk', [x, 0, z], [w, top + 0.15, w], 0, PALETTE.bark, 0, (rng.next() - 0.5) * 0.06, (rng.next() - 0.5) * 0.06);
  }
  // Buttress roots flaring out at the base.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    push('trunk', [cx + Math.cos(a) * hx, 0, cz + Math.sin(a) * hz], [0.08, 0.55, 0.08], -a, PALETTE.bark, 0, 0, 0.7);
  }
  // A great crown over the roof.
  for (let i = 0; i < 9; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = Math.sqrt(rng.next());
    const s = 0.75 + rng.next() * 0.6;
    push('canopy', [cx + Math.cos(a) * d * hx, top + 0.15 + rng.next() * 0.35, cz + Math.sin(a) * d * hz], [s * 1.2, s * 0.8, s * 1.2], rng.next() * 6, rng.pick(PALETTE.leaves), rng.next() < 0.35 ? 0.6 : 0);
  }
  t.banyan = out;
  return out;
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
  /** 0..1 how far nature has reclaimed a worn-down building (extra moss). */
  wild: number;
  template: BuildingTemplate | null;
  /** Bloom Retrofit overlay instances (empty when not retrofitted). */
  retro: InstanceHandle[];
  /** Template pieces waiting for greenery to reach their threshold, sorted by growAt. */
  pending: TemplatePiece[];
  base: Matrix4;
  height: number;
  lastGreenery: number;
  /** Window lighting 0..1 (power × occupancy). */
  power: number;
  /** Architectural finish, its index (carried in the seed of styled pieces) and a per-lot wall shade. */
  style: BuildingStyle;
  styleIndex: number;
  shade: number;
  problems: number;
  alert: InstanceHandle | null;
}

// Marker colour by most urgent problem first.
const ALERT_COLORS: [number, number][] = [
  [Problem.FLOODED, 0x2fe6c8],
  [Problem.OFFLINE, 0xff8a3a],
  [Problem.NO_ROAD, 0xe8e8e8],
  [Problem.NO_POWER, 0xffcf3a],
  [Problem.NO_WATER, 0x4ab8ff],
  [Problem.NEGLECTED, 0x8a6a3a],
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
    // District transformation wave: overlays pop in by distance from the retrofit origin.
    bus.on('buildings:level', ({ eids, origin }) => {
      for (const eid of eids) {
        const entry = this.entries.get(eid);
        if (!entry) continue;
        if (Building.level[eid]) {
          const e = entry.base.elements;
          const dist = origin ? Math.hypot(e[12]! - origin.x, e[14]! - origin.z) : 0;
          // Re-grow the overlay so a banyan merge (level 2) adds its roots and crown.
          this.removeRetrofit(entry);
          this.addRetrofit(entry, ctx.loading ? -1 : dist * 0.09, Building.level[eid]!);
        } else this.removeRetrofit(entry);
      }
    });
    // Bulk content (scenario) may exist before this renderer attaches.
    for (const eid of ctx.city.buildingEntities()) this.add(eid, false);
  }

  get count(): number {
    return this.entries.size;
  }

  /**
   * The building as it is drawn now (grown pieces, GLB parts and retrofit overlay; not its alert marker): world
   * matrices, tints and shader params read back from the instancer, for the inspector's 3D preview.
   */
  /**
   * A building type as the Build tab's preview stage draws it (D-069): variant 0, fully grown and lit, on its
   * plinth, standing at `at`. A GLB hero comes back empty until its model has loaded (the stage retries); if
   * the model fails, its procedural fallback stands in.
   */
  designParts(def: BuildingDef, at: Vector3): { piece: string; matrix: Matrix4; color: Color; params: number[] }[] {
    const base = new Matrix4().makeTranslation(at.x, at.y, at.z);
    const [fw, fd] = def.footprint;
    const out = [
      {
        piece: 'plinth',
        matrix: new Matrix4().multiplyMatrices(base, new Matrix4().compose(_v.set(0, -0.4, 0), _q.identity(), _s.set(fw * 0.98, 0.42, fd * 0.98))),
        color: new Color(0xffffff),
        params: [1, 0.5, 0, 1],
      },
    ];
    if (typeof def.recipe !== 'function') {
      const recipe = def.recipe;
      const glb = this.designGlbs.get(recipe.glb);
      if (glb === undefined) {
        this.designGlbs.set(recipe.glb, null);
        void this.ctx.assets.loadGlbPieces(recipe.glb).then(
          (parts) => this.designGlbs.set(recipe.glb, parts),
          () => this.designGlbs.set(recipe.glb, 'failed'),
        );
      }
      if (glb === undefined || glb === null) return [];
      if (glb !== 'failed') {
        const scaled = base.clone().scale(_s.setScalar(recipe.scale ?? 1));
        for (const part of glb)
          out.push({ piece: part.piece, matrix: new Matrix4().multiplyMatrices(scaled, part.matrix), color: new Color(0xffffff), params: [1, 0.5, 0.4, 1] });
        return out;
      }
      if (!recipe.fallback) return out;
    }
    const style = def.style ?? 'classic';
    for (const p of buildingTemplate(def, 0).pieces) {
      const styled = isStyled(p.piece);
      out.push({
        piece: p.piece,
        matrix: new Matrix4().multiplyMatrices(base, p.local),
        color: new Color(styled ? restyle(p.piece, p.tint, STYLES[style], 1) : p.tint),
        params: [1, styled ? styleIndex(style) + p.seed * 0.999 : p.seed, p.glow, 1],
      });
    }
    return out;
  }

  /** GLB parts for design previews: null while loading. */
  private designGlbs = new Map<string, Awaited<ReturnType<GameContext['assets']['loadGlbPieces']>> | null | 'failed'>();

  snapshot(eid: number): { piece: string; matrix: Matrix4; color: Color; params: number[] }[] {
    const entry = this.entries.get(eid);
    if (!entry) return [];
    const out: { piece: string; matrix: Matrix4; color: Color; params: number[] }[] = [];
    for (const h of [...entry.handles, ...entry.retro]) {
      const b = h.batch;
      if (!b) continue;
      out.push({
        piece: b.piece.id,
        matrix: new Matrix4().fromArray(b.mesh.instanceMatrix.array as Float32Array, h.slot * 16),
        color: new Color().fromArray(b.mesh.instanceColor!.array as Float32Array, h.slot * 3),
        params: Array.from((b.params.array as Float32Array).subarray(h.slot * 4, h.slot * 4 + 4)),
      });
    }
    return out;
  }

  private add(eid: number, animate: boolean): void {
    const { city, instancer, assets } = this.ctx;
    const rec = city.buildingRecord(eid);
    const def = buildings.get(rec.def);
    const place = placeBuilding(city.grid, def, rec.x, rec.z, rec.rot);
    const style = pickStyle(def, rec.x, rec.z);
    const entry: Entry = {
      handles: [],
      moss: [],
      glass: [],
      plants: [],
      vitality: 1,
      wild: 0,
      template: typeof def.recipe === 'function' || def.recipe.fallback ? place.template : null,
      retro: [],
      pending: [],
      base: place.base,
      height: place.template.height,
      lastGreenery: rec.greenery,
      power: 1,
      style: STYLES[style],
      styleIndex: styleIndex(style),
      shade: 0.93 + hash2(rec.x, rec.z, 4259) * 0.12,
      problems: 0,
      alert: null,
    };
    this.entries.set(eid, entry);
    _params.set([rec.greenery, 0.5, 0, 1]);
    entry.handles.push(instancer.addMatrix('plinth', place.plinth, _c.setHex(0xffffff), _params, animate ? 0 : -1));

    const spawnTemplate = () => {
      for (const p of place.template.pieces) {
        if (p.growAt <= rec.greenery) this.spawn(entry, p, rec.greenery, animate ? p.y * 0.35 + Math.random() * 0.08 : -1);
        else entry.pending.push(p);
      }
      entry.pending.sort((a, b) => a.growAt - b.growAt);
    };

    if (typeof def.recipe !== 'function') {
      // Hero model: GLB parts become instanced pieces; the procedural fallback stands in if the
      // file is missing or fails to load (the game must work without optional assets).
      const recipe = def.recipe;
      void assets.loadGlbPieces(recipe.glb).then(
        (parts) => {
          if (this.entries.get(eid) !== entry) return;
          const scaled = _m.copy(place.base).scale(_s.setScalar(recipe.scale ?? 1)).clone();
          for (const part of parts) {
            _params.set([1, 0.5, 0.4, 1]);
            const world = new Matrix4().multiplyMatrices(scaled, part.matrix);
            entry.handles.push(instancer.addMatrix(part.piece, world, _c.setHex(0xffffff), _params, animate ? 0 : -1, 1.2));
          }
          this.ctx.services.tryGet('world')?.atmosphere.invalidateShadows();
        },
        () => {
          if (this.entries.get(eid) === entry && recipe.fallback) spawnTemplate();
        },
      );
    } else spawnTemplate();
    if (Building.level[eid]) this.addRetrofit(entry, animate ? 0.3 : -1, Building.level[eid]!);
  }

  /** Adds the retrofit (and, at level 2, banyan) overlay; `delay` < 0 = instant, else pop-in bottom-up. */
  private addRetrofit(entry: Entry, delay: number, level = 1): void {
    if (!entry.template || entry.retro.length) return;
    const pieces = level >= 2 ? [...retrofitPieces(entry.template), ...banyanPieces(entry.template)] : retrofitPieces(entry.template);
    for (const p of pieces) {
      _params.set([1, p.seed, p.glow, 1]);
      const world = _m.multiplyMatrices(entry.base, p.local);
      const d = delay < 0 ? -1 : delay + p.y * 0.25 + Math.random() * 0.25;
      entry.retro.push(this.ctx.instancer.addMatrix(p.piece, world, _c.setHex(p.tint), _params, d, 0.8));
    }
  }

  private removeRetrofit(entry: Entry): void {
    for (const h of entry.retro) this.ctx.instancer.remove(h);
    entry.retro = [];
  }

  private spawn(entry: Entry, p: TemplatePiece, greenery: number, delay: number): void {
    _params[0] = greenery;
    const styled = isStyled(p.piece);
    // Styled pieces carry the style index in the seed's integer part (the shaders split it off).
    _params[1] = styled ? entry.styleIndex + p.seed * 0.999 : p.seed;
    _params[2] = p.glow;
    const glass = p.piece === 'glassBox' || p.piece === 'glassCyl';
    const plant = PLANT_PIECES.has(p.piece);
    _params[3] = glass ? entry.power : plant ? entry.vitality : 1;
    const world = _m.multiplyMatrices(entry.base, p.local);
    const tint = styled ? restyle(p.piece, p.tint, entry.style, entry.shade) : p.tint;
    const h = this.ctx.instancer.addMatrix(p.piece, world, _c.setHex(tint), _params, delay, 0.7);
    entry.handles.push(h);
    if (p.piece === 'mossBox') entry.moss.push(h);
    if (glass) entry.glass.push(h);
    else if (plant) entry.plants.push(h);
  }

  private remove(eid: number): void {
    const entry = this.entries.get(eid);
    if (!entry) return;
    for (const h of entry.handles) this.ctx.instancer.remove(h);
    this.removeRetrofit(entry);
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
      const cond = Service.condition[eid]!;
      const power = Service.power[eid]! * occupied * (0.3 + 0.7 * cond);
      if (Math.abs(power - entry.power) > 0.03) {
        entry.power = power;
        for (const h of entry.glass) instancer.setParam(h, 3, power);
      }
      // Nature reclaims worn-down buildings: moss spreads over every surface.
      const wild = cond < 0.6 ? (0.6 - cond) / 0.6 : 0;
      if (Math.abs(wild - entry.wild) > 0.05) {
        entry.wild = wild;
        const g = Math.min(1.4, Greenery.value[eid]! + wild);
        for (const h of entry.moss) instancer.setParam(h, 0, g);
      }
      const abandoned = st.population > 0 && occ < 0.2 ? 0.55 : 1;
      // Plants wilt with dry taps and with parched soil (Flora-Net hydration below ~0.35).
      const vitality = (st.water < 0 ? Service.water[eid]! : 1) * abandoned * Math.min(1, 0.35 + Service.soil[eid]! * 1.9);
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
        for (const h of entry.moss) this.ctx.instancer.setParam(h, 0, Math.min(1.4, g + entry.wild));
      }
    }
  }
}
