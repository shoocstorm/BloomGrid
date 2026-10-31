import type { ZoneKind } from '@/content/types';
import { Service } from '@/ecs/components';
import type { BuildingRecord, City } from './City';
import { createPulseState, type PulseState } from './pulseState';
import { createStewardState, type StewardState } from './stewardState';
import { createFireworksState, type FireworksState } from './fireworksState';

export const SAVE_VERSION = 10;

export interface SaveData {
  version: number;
  seed: number;
  tick: number;
  timeOfDay: number;
  day: number;
  credits: number;
  rngState: number;
  /** [def, x, z, rot, greenery, occupancy, condition, level, uid] */
  buildings: [string, number, number, number, number, number, number, number, number?][];
  /** Next building serial (readable ids are never reused while the game lives). */
  nextUid: number;
  /** Named areas as [name, x0, z0, x1, z1], most specific first. */
  /** Name, inclusive tile rectangle, and (v8+) the zone kind or '' for none. */
  districts: [string, number, number, number, number, (ZoneKind | '')?][];
  roads: number[];
  /** Sparse [tile, value] pairs of highway overgrowth. */
  overgrowth: [number, number][];
  /** Sparse [tile, value] filtration channels (1 channel, 2 lush). */
  channels: [number, number][];
  pulse: Pick<PulseState, 'taxRate' | 'history'> & { happiness: number };
  steward: Omit<StewardState, 'modifiers' | 'overgrown'>;
  /** Flora-Net soil per zone (row-major, 3 decimals); empty = defaults. */
  soil: { hydration: number[]; nutrients: number[] };
  /** Sparse [corner, height] terrain edits on top of the generated terrain (land reclamation). */
  terrain: [number, number][];
  /** Green Weaver sky-bridges as [ax, az, bx, bz] tower anchors. */
  bridges: [number, number, number, number][];
  /** Fireworks stock, show and afterglow (v10+, D-068). */
  fireworks: FireworksState;
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
    data.buildings = data.buildings.map((b) => [b[0], b[1], b[2], b[3], b[4], b[5] ?? 0.6, 1, 0]);
    const p = createPulseState();
    data.pulse = { taxRate: p.taxRate, history: p.history, happiness: 60 };
    data.version = 2;
  }
  if (data.version === 2) {
    data.buildings = data.buildings.map((b) => [b[0], b[1], b[2], b[3], b[4], b[5], b[6] ?? 1, 0]);
    data.overgrowth = [];
    data.steward = persistable(createStewardState('steward'));
    data.version = 3;
  }
  if (data.version === 3) {
    data.buildings = data.buildings.map((b) => [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7] ?? 0]);
    data.channels = [];
    (data.pulse.history as Record<string, number[]>).bloom ??= [];
    data.version = 4;
  }
  if (data.version === 4) {
    data.soil = { hydration: [], nutrients: [] };
    data.version = 5;
  }
  if (data.version === 5) {
    data.terrain = [];
    data.bridges = [];
    data.steward.seaRise ??= 0;
    data.version = 6;
  }
  if (data.version === 6) {
    // Serials in canonical (row-major) order; older saves have no named areas.
    data.buildings = data.buildings.map((b, i) => [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], i + 1]);
    data.nextUid = data.buildings.length + 1;
    data.districts = [];
    data.version = 7;
  }
  if (data.version === 7) {
    // Zones arrived with v8: older named areas simply have none.
    data.version = 8;
  }
  if (data.version === 8) {
    // Hazards (v9): no fires, ruins or incident log yet.
    Object.assign(data.steward, { fires: [], ruins: [], history: [], nextIncidentId: 1 });
    data.version = 9;
  }
  if (data.version === 9) {
    // Fireworks (v10): no factories built yet, so nothing in stock.
    data.fireworks = createFireworksState();
    data.version = 10;
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
    buildings: city.snapshotBuildings().map((b) => [b.def, b.x, b.z, b.rot, b.greenery, b.occupancy ?? 0, b.condition ?? 1, b.level ?? 0, b.uid ?? 0]),
    nextUid: city.nextUid,
    districts: city.districts.map((d) => [d.name, d.x0, d.z0, d.x1, d.z1, d.zone ?? '']),
    channels: city.channelTiles(),
    roads: city.roadTiles(),
    overgrowth,
    pulse: { taxRate: city.pulse.taxRate, history: structuredClone(city.pulse.history), happiness: city.stats.happiness },
    steward: structuredClone(persistable(city.steward)),
    fireworks: structuredClone(city.fireworks),
    bridges: city.weaver.bridges.map((b) => [b.ax, b.az, b.bx, b.bz]),
    terrain: [...city.terrainEdits].map(([c, h]) => [c, round3(h)]),
    soil: { hydration: [...city.soil.hydration].map(round3), nutrients: [...city.soil.nutrients].map(round3) },
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
  Object.assign(city.fireworks, structuredClone(data.fireworks));
  // Terrain first: highways, channels and buildings sit on the edited ground.
  if (data.terrain.length) {
    for (const [c, h] of data.terrain) {
      city.grid.heights[c] = h;
      city.terrainEdits.set(c, h);
    }
    city.refreshTerrainDerived();
    city.bus.emit('terrain:changed', { x0: 0, z0: 0, x1: city.grid.w, z1: city.grid.h });
  }
  city.weaver.bridges = data.bridges.map(([ax, az, bx, bz]) => ({ ax, az, bx, bz }));
  if (data.roads.length) city.setRoads(data.roads, true);
  if (data.overgrowth.length) {
    const og = city.grid.addLayer('overgrowth', (n) => new Uint8Array(n));
    for (const [t, v] of data.overgrowth) og[t] = v;
    city.steward.overgrown = data.overgrowth.length;
    city.networks.dirty = true;
  }
  if (data.channels.length) city.setChannels(data.channels);
  if (data.soil.hydration.length === city.soil.hydration.length) {
    city.soil.hydration.set(data.soil.hydration);
    city.soil.nutrients.set(data.soil.nutrients);
  }
  city.districts = data.districts.map(([name, x0, z0, x1, z1, zone]) => ({ name, ...(zone ? { zone } : {}), x0, z0, x1, z1 }));
  for (const [def, x, z, rot, greenery, occupancy, condition, level, uid] of data.buildings) {
    const rec: BuildingRecord = { def, x, z, rot, greenery, occupancy, condition, level, uid };
    const eid = city.addBuilding(rec);
    Service.occupancy[eid] = occupancy;
  }
  city.nextUid = Math.max(city.nextUid, data.nextUid);
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
