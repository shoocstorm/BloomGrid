import { roadLevels, roadWear } from './roads';
import type { ZoneKind } from '@/content/types';
import { Service } from '@/ecs/components';
import type { BuildingRecord, City } from './City';
import { createPulseState, type PulseState } from './pulseState';
import { createStewardState, type StewardState } from './stewardState';
import { createFireworksState, type FireworksState } from './fireworksState';
import { createGrowthState, type GrowthState } from './growthState';
import { createConsequenceState, neutralMods, type ConsequenceState } from './consequenceState';

export const SAVE_VERSION = 17;

export interface SaveData {
  version: number;
  seed: number;
  tick: number;
  timeOfDay: number;
  day: number;
  credits: number;
  rngState: number;
  /** [def, x, z, rot, greenery, occupancy, condition, level, uid, tier, age, thrive, scorch, off] (tier/age/thrive v12+, scorch/off v14+). */
  buildings: [string, number, number, number, number, number, number, number, number?, number?, number?, number?, number?, number?][];
  /** Next building serial (readable ids are never reused while the game lives). */
  nextUid: number;
  /** Named areas as [name, x0, z0, x1, z1], most specific first. */
  /** Name, inclusive tile rectangle, and (v8+) the zone kind or '' for none. */
  districts: [string, number, number, number, number, (ZoneKind | '')?][];
  roads: number[];
  /** Sparse [tile, value] pairs of highway overgrowth. */
  overgrowth: [number, number][];
  /** v15 (D-096): [tile, level, wear] for highway tiles above raw or with wear. */
  roadLevels: [number, number, number][];
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
  /** Name, unlocks, wonders, fish stock, Flora's bill (v11+, D-072). */
  growth: GrowthState;
  /** Consequence rules, credit rating, reputation, feed (v13+, D-074; modifiers are recomputed). */
  consequences: Omit<ConsequenceState, 'mods'>;
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
  if (data.version === 10) {
    // Progression (v11): older cities keep everything open (no unlock projects, every wonder, free Flora).
    data.growth = createGrowthState();
    data.version = 11;
  }
  if (data.version === 11) {
    // Levels and ageing (v12): every building starts at level 1, new, with no progress (missing fields default).
    data.version = 12;
  }
  if (data.version === 12) {
    // Consequences (v13): a clean slate (no rule in force, AAA credit).
    const { mods, ...rest } = createConsequenceState();
    void mods;
    data.consequences = rest;
    data.version = 13;
  }
  if (data.version === 13) {
    // Damage looks and switches (v14): nothing charred, everything on (missing fields default).
    data.version = 14;
  }
  if (data.version === 14) {
    // Highways before levels were all Living Highways.
    data.roadLevels = data.roads.map((t) => [t, 1, 0]);
    data.version = 15;
  }
  if (data.version === 15) {
    // The food trend (top-bar Food indicator, D-113) starts empty; fireworks' credit flow (D-115) starts at 0.
    (data.pulse.history as Record<string, number[]>).food ??= [];
    data.fireworks.flow ??= 0;
    data.version = 16;
  }
  if (data.version === 16) {
    // Milestones and residents' tips (v17, D-118): nothing claimed or popped yet.
    Object.assign(data.growth, { milestones: data.growth.milestones ?? [], tips: data.growth.tips ?? 0, tipIncome: data.growth.tipIncome ?? 0 });
    data.version = 17;
  }
  if (data.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${data.version}`);
  return data;
}

export function serializeCity(city: City): SaveData {
  const og = city.grid.layer<Uint8Array>('overgrowth');
  const overgrowth: [number, number][] = [];
  if (og) for (let i = 0; i < og.length; i++) if (og[i]) overgrowth.push([i, og[i]!]);
  const lv = roadLevels(city);
  const wear = roadWear(city);
  const levels: [number, number, number][] = [];
  for (const t of city.roadTiles()) if (lv[t] || wear[t]) levels.push([t, lv[t]!, wear[t]!]);
  return {
    version: SAVE_VERSION,
    seed: city.seed,
    tick: city.tick,
    timeOfDay: city.timeOfDay,
    day: city.day,
    credits: city.credits,
    rngState: city.rng.state,
    buildings: city
      .snapshotBuildings()
      .map((b) => [b.def, b.x, b.z, b.rot, b.greenery, b.occupancy ?? 0, b.condition ?? 1, b.level ?? 0, b.uid ?? 0, b.tier ?? 0, round3(b.age ?? 0), round3(b.thrive ?? 0), round3(b.scorch ?? 0), b.off ? 1 : 0]),
    nextUid: city.nextUid,
    districts: city.districts.map((d) => [d.name, d.x0, d.z0, d.x1, d.z1, d.zone ?? '']),
    channels: city.channelTiles(),
    roads: city.roadTiles(),
    overgrowth,
    roadLevels: levels,
    pulse: { taxRate: city.pulse.taxRate, history: structuredClone(city.pulse.history), happiness: city.stats.happiness },
    steward: structuredClone(persistable(city.steward)),
    fireworks: structuredClone(city.fireworks),
    growth: structuredClone(city.growth),
    consequences: (({ mods, ...rest }) => (void mods, structuredClone(rest)))(city.consequences),
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
  Object.assign(city.growth, structuredClone(data.growth));
  Object.assign(city.consequences, structuredClone(data.consequences), { mods: neutralMods() });
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
  if (data.roadLevels.length) {
    const lv = roadLevels(city);
    const wear = roadWear(city);
    for (const [t, l, w] of data.roadLevels) {
      lv[t] = l;
      wear[t] = w;
    }
  }
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
  for (const [def, x, z, rot, greenery, occupancy, condition, level, uid, tier, age, thrive, scorch, off] of data.buildings) {
    const rec: BuildingRecord = { def, x, z, rot, greenery, occupancy, condition, level, uid, tier, age, thrive, scorch, off: off === 1 };
    const eid = city.addBuilding(rec);
    Service.occupancy[eid] = occupancy;
  }
  city.nextUid = Math.max(city.nextUid, data.nextUid);
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
