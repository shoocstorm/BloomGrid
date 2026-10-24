import type { BuildingRecord, City } from './City';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  seed: number;
  tick: number;
  timeOfDay: number;
  day: number;
  credits: number;
  rngState: number;
  buildings: [string, number, number, number, number][];
  roads: number[];
  /** Feature modules persist their own state under their module id. */
  modules: Record<string, unknown>;
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
    buildings: city.snapshotBuildings().map((b) => [b.def, b.x, b.z, b.rot, b.greenery]),
    roads: city.roadTiles(),
    modules: {},
  };
}

export function deserializeCity(city: City, data: SaveData): void {
  if (data.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${data.version}`);
  city.reset(data.seed);
  city.tick = data.tick;
  city.timeOfDay = data.timeOfDay;
  city.day = data.day;
  city.credits = data.credits;
  city.rng.state = data.rngState;
  if (data.roads.length) city.setRoads(data.roads, true);
  for (const [def, x, z, rot, greenery] of data.buildings) {
    const rec: BuildingRecord = { def, x, z, rot, greenery };
    city.addBuilding(rec);
  }
}
