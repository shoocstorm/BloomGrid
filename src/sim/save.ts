import { Service } from '@/ecs/components';
import type { BuildingRecord, City } from './City';
import { createPulseState, type PulseState } from './pulseState';
import { createStewardState, type StewardState } from './stewardState';

export const SAVE_VERSION = 3;

export interface SaveData {
  version: number;
  seed: number;
  tick: number;
  timeOfDay: number;
  day: number;
  credits: number;
  rngState: number;
  /** [def, x, z, rot, greenery, occupancy, condition] */
  buildings: [string, number, number, number, number, number, number][];
  roads: number[];
  /** Sparse [tile, value] pairs of highway overgrowth. */
  overgrowth: [number, number][];
  pulse: Pick<PulseState, 'taxRate' | 'history'> & { happiness: number };
  steward: Omit<StewardState, 'modifiers' | 'overgrown'>;
  /** Feature modules persist their own state under their module id. */
  modules: Record<string, unknown>;
}

/** Steward state minus derived fields (recomputed every pulse / on load). */
function persistable(st: StewardState): SaveData['steward'] {
  const { modifiers, overgrown, ...rest } = st;
  void modifiers;
  void overgrown;
  return rest;
}

/** Upgrades older saves in place. Add a step here whenever SAVE_VERSION is bumped. */
export function migrateSave(data: SaveData): SaveData {
  if (data.version === 1) {
    data.buildings = data.buildings.map((b) => [b[0], b[1], b[2], b[3], b[4], b[5] ?? 0.6, 1]);
    const p = createPulseState();
    data.pulse = { taxRate: p.taxRate, history: p.history, happiness: 60 };
    data.version = 2;
  }
  if (data.version === 2) {
    data.buildings = data.buildings.map((b) => [b[0], b[1], b[2], b[3], b[4], b[5], b[6] ?? 1]);
    data.overgrowth = [];
    data.steward = persistable(createStewardState('steward'));
    data.version = 3;
  }
  if (data.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${data.version}`);
  return data;
}

export function serializeCity(city: City): SaveData {
  const og = city.grid.layer<Uint8Array>('overgrowth');
  const overgrowth: [number, number][] = [];
  if (og) for (let i = 0; i < og.length; i++) if (og[i]) overgrowth.push([i, og[i]!]);
  return {
    version: SAVE_VERSION,
    seed: city.seed,
    tick: city.tick,
    timeOfDay: city.timeOfDay,
    day: city.day,
    credits: city.credits,
    rngState: city.rng.state,
    buildings: city.snapshotBuildings().map((b) => [b.def, b.x, b.z, b.rot, b.greenery, b.occupancy ?? 0, b.condition ?? 1]),
    roads: city.roadTiles(),
    overgrowth,
    pulse: { taxRate: city.pulse.taxRate, history: structuredClone(city.pulse.history), happiness: city.stats.happiness },
    steward: structuredClone(persistable(city.steward)),
    modules: {},
  };
}

export function deserializeCity(city: City, input: SaveData): void {
  const data = migrateSave(input);
  city.reset(data.seed, data.steward.difficulty);
  city.tick = data.tick;
  city.timeOfDay = data.timeOfDay;
  city.day = data.day;
  city.credits = data.credits;
  city.rng.state = data.rngState;
  city.pulse.taxRate = data.pulse.taxRate;
  city.pulse.history = structuredClone(data.pulse.history);
  city.stats.happiness = data.pulse.happiness;
  Object.assign(city.steward, structuredClone(data.steward));
  if (data.roads.length) city.setRoads(data.roads, true);
  if (data.overgrowth.length) {
    const og = city.grid.addLayer('overgrowth', (n) => new Uint8Array(n));
    for (const [t, v] of data.overgrowth) og[t] = v;
    city.steward.overgrown = data.overgrowth.length;
    city.networks.dirty = true;
  }
  for (const [def, x, z, rot, greenery, occupancy, condition] of data.buildings) {
    const rec: BuildingRecord = { def, x, z, rot, greenery, occupancy, condition };
    const eid = city.addBuilding(rec);
    Service.occupancy[eid] = occupancy;
  }
}
