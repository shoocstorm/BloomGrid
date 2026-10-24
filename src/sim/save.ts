import { Service } from '@/ecs/components';
import type { BuildingRecord, City } from './City';
import { createPulseState, type PulseState } from './pulseState';

export const SAVE_VERSION = 2;

export interface SaveData {
  version: number;
  seed: number;
  tick: number;
  timeOfDay: number;
  day: number;
  credits: number;
  rngState: number;
  /** [def, x, z, rot, greenery, occupancy] */
  buildings: [string, number, number, number, number, number][];
  roads: number[];
  pulse: Pick<PulseState, 'taxRate' | 'history'> & { happiness: number };
  /** Feature modules persist their own state under their module id. */
  modules: Record<string, unknown>;
}

/** Upgrades older saves in place. Add a step here whenever SAVE_VERSION is bumped. */
export function migrateSave(data: SaveData): SaveData {
  if (data.version === 1) {
    data.buildings = data.buildings.map((b) => [b[0], b[1], b[2], b[3], b[4], b[5] ?? 0.6]);
    const p = createPulseState();
    data.pulse = { taxRate: p.taxRate, history: p.history, happiness: 60 };
    data.version = 2;
  }
  if (data.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${data.version}`);
  return data;
}

export function serializeCity(city: City): SaveData {
  return {
    version: SAVE_VERSION,
    seed: city.seed,
    tick: city.tick,
    timeOfDay: city.timeOfDay,
    day: city.day,
    credits: city.credits,
    rngState: city.rng.state,
    buildings: city.snapshotBuildings().map((b) => [b.def, b.x, b.z, b.rot, b.greenery, b.occupancy ?? 0]),
    roads: city.roadTiles(),
    pulse: { taxRate: city.pulse.taxRate, history: structuredClone(city.pulse.history), happiness: city.stats.happiness },
    modules: {},
  };
}

export function deserializeCity(city: City, input: SaveData): void {
  const data = migrateSave(input);
  city.reset(data.seed);
  city.tick = data.tick;
  city.timeOfDay = data.timeOfDay;
  city.day = data.day;
  city.credits = data.credits;
  city.rng.state = data.rngState;
  city.pulse.taxRate = data.pulse.taxRate;
  city.pulse.history = structuredClone(data.pulse.history);
  city.stats.happiness = data.pulse.happiness;
  if (data.roads.length) city.setRoads(data.roads, true);
  for (const [def, x, z, rot, greenery, occupancy] of data.buildings) {
    const rec: BuildingRecord = { def, x, z, rot, greenery, occupancy };
    const eid = city.addBuilding(rec);
    Service.occupancy[eid] = occupancy;
  }
}
