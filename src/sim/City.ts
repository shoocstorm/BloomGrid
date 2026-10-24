import { addComponent, addEntity, createWorld, query, removeEntity, type World } from 'bitecs';
import type { EventBus } from '@/core/EventBus';
import { Building, Greenery } from '@/ecs/components';
import { buildings } from '@/content';
import type { BuildingDef } from '@/content/types';
import { Grid, NO_ENTITY } from './Grid';
import { generateTerrain } from './terrain';
import { Rng, fnv1a } from './random';
import './events';

export interface BuildingRecord {
  def: string;
  x: number;
  z: number;
  rot: number;
  greenery: number;
}

export interface CityStats {
  population: number;
  jobs: number;
  energyProduced: number;
  energyUsed: number;
  eco: number;
  pollution: number;
  happiness: number;
  income: number;
  buildings: number;
}

export type PlacementResult = { ok: true } | { ok: false; reason: string };

export const MAP_SIZE = 256;
export const START_CREDITS = 2500;
export const DAY_LENGTH = 360; // sim seconds per full day

/**
 * Authoritative simulation state. Renderer-agnostic and deterministic for a given seed and
 * command sequence.
 */
export class City {
  grid!: Grid;
  world!: World;
  rng!: Rng;
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

  reset(seed: number): void {
    this.seed = seed;
    this.grid = new Grid(this.size, this.size);
    generateTerrain(this.grid, seed);
    this.world = createWorld();
    this.rng = new Rng(seed);
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
      }
    }
    if (this.credits < def.stats.cost) return { ok: false, reason: 'Not enough credits' };
    return { ok: true };
  }

  addBuilding(rec: BuildingRecord): number {
    const def = buildings.get(rec.def);
    const [w, d] = this.footprint(def, rec.rot);
    const eid = addEntity(this.world);
    addComponent(this.world, eid, Building);
    addComponent(this.world, eid, Greenery);
    Building.def[eid] = buildings.indexOf(rec.def);
    Building.x[eid] = rec.x;
    Building.z[eid] = rec.z;
    Building.rot[eid] = rec.rot;
    Building.w[eid] = w;
    Building.d[eid] = d;
    Greenery.value[eid] = rec.greenery;
    Greenery.rate[eid] = 1 / def.growthTime;
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
    };
  }

  buildingEntities(): readonly number[] {
    return query(this.world, [Building]) as unknown as readonly number[];
  }

  canRoad(idx: number): boolean {
    const g = this.grid;
    const x = idx % g.w;
    const z = (idx / g.w) | 0;
    if (g.road[idx] || g.occupant[idx] !== NO_ENTITY) return false;
    const { min, max } = g.rangeOver(x, z, 1, 1);
    return min >= 0.05 && max - min <= 0.9;
  }

  setRoads(tiles: number[], on: boolean): void {
    for (const t of tiles) this.grid.road[t] = on ? 1 : 0;
    this.bus.emit('road:changed', { tiles });
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
    const b = this.snapshotBuildings().map((r) => `${r.def}:${r.x},${r.z},${r.rot},${r.greenery.toFixed(4)}`);
    return fnv1a(`${this.seed}|${this.tick}|${this.credits.toFixed(3)}|${b.join(';')}|${this.roadTiles().join(',')}`);
  }
}

function emptyStats(): CityStats {
  return { population: 0, jobs: 0, energyProduced: 0, energyUsed: 0, eco: 0, pollution: 0, happiness: 50, income: 0, buildings: 0 };
}
