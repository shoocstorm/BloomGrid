import { addComponent, addEntity, createWorld, query, removeEntity, type World } from 'bitecs';
import type { EventBus } from '@/core/EventBus';
import { Building, Greenery, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { BuildingDef } from '@/content/types';
import { Grid, NO_ENTITY, SEA_LEVEL } from './Grid';
import { generateTerrain } from './terrain';
import { Rng, fnv1a } from './random';
import { RoadNetworks } from './networks';
import { createPulseState, type PulseState } from './pulseState';
import { createFields, type Fields } from './fields';
import { createStewardState, type StewardState } from './stewardState';
import { createSoil, initSoilLand, soilChecksum, type SoilState } from './floranet';
import type { DifficultyId } from './difficulty';
import './events';

export interface BuildingRecord {
  def: string;
  x: number;
  z: number;
  rot: number;
  greenery: number;
  /** Residents / staffing fill 0..1. */
  occupancy?: number;
  /** Physical condition 0..1 (default 1). */
  condition?: number;
  /** Retrofit level (0 original, 1 Bloom Retrofit). */
  level?: number;
}

export interface CityStats {
  /** Actual residents (capacity × occupancy). */
  population: number;
  /** Housing capacity. */
  capacity: number;
  jobs: number;
  employed: number;
  energyProduced: number;
  energyUsed: number;
  waterProduced: number;
  waterUsed: number;
  foodProduced: number;
  eco: number;
  pollution: number;
  /** "Harmony" 0..100. */
  happiness: number;
  income: number;
  /** Upkeep actually paid (reduced under austerity). */
  upkeep: number;
  /** Loan repayments per second. */
  debtService: number;
  buildings: number;
  /** Demand meters in [-1, 1]: positive = the city wants more of this. */
  demandHomes: number;
  demandWork: number;
  demandFood: number;
}

export type PlacementResult = { ok: true; warning?: string } | { ok: false; reason: string };

export const MAP_SIZE = 384;
/** Render chunk edge in tiles: 4×4 chunks per map keeps draw calls flat as the map grows. */
export const chunkSizeFor = (size: number) => Math.ceil(size / 4);
export const START_CREDITS = 2500;
export { DAY_LENGTH } from './pulseConst';

export const ROAD = 1;
export const BRIDGE = 2;
/** Bridge deck height above sea level (world units). */
export const BRIDGE_DECK = 0.9;

/**
 * Authoritative simulation state. Renderer-agnostic and deterministic for a given seed and
 * command sequence.
 */
export class City {
  grid!: Grid;
  world!: World;
  rng!: Rng;
  networks!: RoadNetworks;
  pulse!: PulseState;
  fields!: Fields;
  steward!: StewardState;
  /** Flora-Net soil zones (saved). */
  soil!: SoilState;
  /** Channels changed: irrigation must be recomputed on the next pulse. */
  channelsDirty = true;
  /** Number of highway tiles (kept in sync by setRoads). */
  roadCount = 0;
  seed = 0;
  tick = 0;
  /** 0..1, 0 = midnight, 0.5 = noon. */
  timeOfDay = 0.3;
  day = 1;
  credits = START_CREDITS;
  stats: CityStats = emptyStats();

  constructor(
    readonly bus: EventBus,
    seed = 1337,
    readonly size = MAP_SIZE,
  ) {
    this.reset(seed);
  }

  reset(seed: number, difficulty: DifficultyId = this.steward?.difficulty ?? 'steward'): void {
    this.seed = seed;
    this.grid = new Grid(this.size, this.size);
    generateTerrain(this.grid, seed);
    this.world = createWorld();
    this.rng = new Rng(seed);
    this.networks = new RoadNetworks(this.grid);
    this.fields = createFields(this.grid);
    this.soil = createSoil(this.size);
    initSoilLand(this);
    this.steward = createStewardState(difficulty);
    this.roadCount = 0;
    this.channelsDirty = true;
    this.pulse = createPulseState();
    this.tick = 0;
    this.timeOfDay = 0.3;
    this.day = 1;
    this.credits = START_CREDITS;
    this.stats = emptyStats();
    this.bus.emit('city:reset', { seed });
  }

  footprint(def: BuildingDef, rot: number): [number, number] {
    const [w, d] = def.footprint;
    return rot % 2 ? [d, w] : [w, d];
  }

  isWaterTile(x: number, z: number): boolean {
    return this.grid.rangeOver(x, z, 1, 1).min < SEA_LEVEL + 0.05;
  }

  checkPlacement(def: BuildingDef, x: number, z: number, rot: number): PlacementResult {
    const [w, d] = this.footprint(def, rot);
    const g = this.grid;
    if (x < 0 || z < 0 || x + w > g.w || z + d > g.h) return { ok: false, reason: 'Out of bounds' };
    const { min, max } = g.rangeOver(x, z, w, d);
    if (min < 0.05) return { ok: false, reason: 'Needs dry land' };
    if (max - min > 1.6) return { ok: false, reason: 'Too steep' };
    for (let j = z; j < z + d; j++) {
      for (let i = x; i < x + w; i++) {
        const idx = g.index(i, j);
        if (g.occupant[idx] !== NO_ENTITY) return { ok: false, reason: 'Occupied' };
        if (g.road[idx]) return { ok: false, reason: 'Living Highway in the way' };
        if (this.channelAt(idx)) return { ok: false, reason: 'Filtration channel in the way' };
      }
    }
    if (def.placement?.nearWater && !this.touchesWater(x, z, w, d)) return { ok: false, reason: 'Must touch the sea or a reservoir' };
    if (this.credits < def.stats.cost) return { ok: false, reason: 'Not enough credits' };
    if (!RoadNetworks.touchesRoad(g, x, z, w, d)) return { ok: true, warning: 'No highway access: no power or water' };
    return { ok: true };
  }

  private touchesWater(x: number, z: number, w: number, d: number): boolean {
    for (let j = z - 1; j <= z + d; j++)
      for (let i = x - 1; i <= x + w; i++) {
        if (!this.grid.inBounds(i, j) || (i >= x && i < x + w && j >= z && j < z + d)) continue;
        if (this.isWaterTile(i, j) && !this.grid.road[this.grid.index(i, j)]) return true;
      }
    return false;
  }

  addBuilding(rec: BuildingRecord): number {
    const def = buildings.get(rec.def);
    const [w, d] = this.footprint(def, rec.rot);
    const eid = addEntity(this.world);
    addComponent(this.world, eid, Building);
    addComponent(this.world, eid, Greenery);
    addComponent(this.world, eid, Service);
    Building.def[eid] = buildings.indexOf(rec.def);
    Building.x[eid] = rec.x;
    Building.z[eid] = rec.z;
    Building.rot[eid] = rec.rot;
    Building.w[eid] = w;
    Building.d[eid] = d;
    Greenery.value[eid] = rec.greenery;
    Greenery.rate[eid] = 1 / def.growthTime;
    // New homes start partly occupied, workplaces partly staffed; the pulse moves them from here.
    Service.occupancy[eid] = rec.occupancy ?? 0.25;
    Service.power[eid] = 1;
    Service.water[eid] = 1;
    Service.problems[eid] = 0;
    Service.condition[eid] = rec.condition ?? 1;
    Building.level[eid] = rec.level ?? 0;
    Service.paired[eid] = 0;
    Service.bloom[eid] = 0.4;
    Service.network[eid] = this.networks.dirty ? -1 : this.networks.networkFor(rec.x, rec.z, w, d);
    for (let j = rec.z; j < rec.z + d; j++)
      for (let i = rec.x; i < rec.x + w; i++) this.grid.occupant[this.grid.index(i, j)] = eid;
    this.bus.emit('building:added', { eid });
    return eid;
  }

  removeBuilding(eid: number): BuildingRecord {
    const rec = this.buildingRecord(eid);
    const w = Building.w[eid]!;
    const d = Building.d[eid]!;
    for (let j = rec.z; j < rec.z + d; j++)
      for (let i = rec.x; i < rec.x + w; i++) this.grid.occupant[this.grid.index(i, j)] = NO_ENTITY;
    removeEntity(this.world, eid);
    this.bus.emit('building:removed', { eid, record: rec });
    return rec;
  }

  buildingAt(x: number, z: number): number {
    if (!this.grid.inBounds(x, z)) return NO_ENTITY;
    return this.grid.occupant[this.grid.index(x, z)]!;
  }

  buildingDef(eid: number): BuildingDef {
    return buildings.at(Building.def[eid]!);
  }

  buildingRecord(eid: number): BuildingRecord {
    return {
      def: buildings.at(Building.def[eid]!).id,
      x: Building.x[eid]!,
      z: Building.z[eid]!,
      rot: Building.rot[eid]!,
      greenery: Greenery.value[eid]!,
      occupancy: Service.occupancy[eid]!,
      condition: Service.condition[eid]!,
      level: Building.level[eid]!,
    };
  }

  buildingEntities(): readonly number[] {
    return query(this.world, [Building]) as unknown as readonly number[];
  }

  /** Whether a highway can go here. Water tiles need `bridges` (and become bridge decks). */
  canRoad(idx: number, bridges = false): boolean {
    const g = this.grid;
    const x = idx % g.w;
    const z = (idx / g.w) | 0;
    if (g.road[idx] || g.occupant[idx] !== NO_ENTITY || this.channelAt(idx)) return false;
    const { min, max } = g.rangeOver(x, z, 1, 1);
    if (min < SEA_LEVEL + 0.05) return bridges;
    return max - min <= 0.9;
  }

  setRoads(tiles: number[], on: boolean): void {
    const g = this.grid;
    const og = g.layer<Uint8Array>('overgrowth');
    for (const t of tiles) {
      const had = g.road[t]! > 0;
      if (!on) g.road[t] = 0;
      else g.road[t] = this.isWaterTile(t % g.w, (t / g.w) | 0) ? BRIDGE : ROAD;
      this.roadCount += (g.road[t]! > 0 ? 1 : 0) - (had ? 1 : 0);
      if (og && og[t]) {
        // Rebuilt or removed highways start clean.
        og[t] = 0;
        this.steward.overgrown--;
      }
    }
    this.networks.dirty = true;
    this.bus.emit('road:changed', { tiles });
  }

  channelAt(idx: number): number {
    return this.grid.layer<Uint8Array>('channel')?.[idx] ?? 0;
  }

  /** Filtration channels go on dry, gentle, free land. */
  canChannel(idx: number): boolean {
    const g = this.grid;
    const x = idx % g.w;
    const z = (idx / g.w) | 0;
    if (g.road[idx] || g.occupant[idx] !== NO_ENTITY || this.channelAt(idx)) return false;
    const { min, max } = g.rangeOver(x, z, 1, 1);
    return min >= 0.05 && max - min <= 0.9;
  }

  /** Sets channel tiles (0 none, 1 channel, 2 lush) and announces the change. */
  setChannels(values: [number, number][]): void {
    const ch = this.grid.addLayer('channel', (n) => new Uint8Array(n));
    for (const [t, v] of values) ch[t] = v;
    this.channelsDirty = true;
    this.bus.emit('channel:changed', { tiles: values.map(([t]) => t) });
  }

  channelTiles(): [number, number][] {
    const ch = this.grid.layer<Uint8Array>('channel');
    const out: [number, number][] = [];
    if (ch) for (let i = 0; i < ch.length; i++) if (ch[i]) out.push([i, ch[i]!]);
    return out;
  }

  /** Canonical, order-independent snapshot used for saves and determinism checks. */
  snapshotBuildings(): BuildingRecord[] {
    return this.buildingEntities()
      .map((e) => this.buildingRecord(e))
      .sort((a, b) => a.z - b.z || a.x - b.x);
  }

  roadTiles(): number[] {
    const out: number[] = [];
    const r = this.grid.road;
    for (let i = 0; i < r.length; i++) if (r[i]) out.push(i);
    return out;
  }

  hash(): string {
    const b = this.snapshotBuildings().map(
      (r) => `${r.def}:${r.x},${r.z},${r.rot},${r.greenery.toFixed(4)},${(r.occupancy ?? 0).toFixed(4)},${(r.condition ?? 1).toFixed(3)},${r.level ?? 0}`,
    );
    return fnv1a(
      `${this.seed}|${this.tick}|${this.credits.toFixed(3)}|${this.pulse.taxRate}|${this.steward.loans.map((l) => l.remaining.toFixed(2)).join(',')}|${this.steward.crises.map((c) => `${c.def}@${c.startTick}`).join(',')}|${b.join(';')}|${this.roadTiles().join(',')}|${this.channelTiles().join(';')}|${soilChecksum(this.soil)}`,
    );
  }
}

export function emptyStats(): CityStats {
  return {
    population: 0,
    capacity: 0,
    jobs: 0,
    employed: 0,
    energyProduced: 0,
    energyUsed: 0,
    waterProduced: 0,
    waterUsed: 0,
    foodProduced: 0,
    eco: 0,
    pollution: 0,
    happiness: 60,
    income: 0,
    upkeep: 0,
    debtService: 0,
    buildings: 0,
    demandHomes: 0.5,
    demandWork: 0,
    demandFood: 0,
  };
}
