import { EventBus } from '@/core/EventBus';
import { SystemRegistry } from '@/core/Systems';
import { Building } from '@/ecs/components';
import { City } from './City';
import { deserializeCity, type SaveData } from './save';
import { simSystems, type SimCtx } from './systems';
import { PULSE_TICKS } from './pulseConst';
import { getCrisis } from './crises';

/**
 * The forward run (plan v7, Phase 34, D-222): a copy of the city played on with no steward input, "if nothing
 * changes", to see where it is heading. Crises, the director, happenings and stories run as the save has them set,
 * from the save's own rng state, so the same save and horizon always give the same future.
 *
 * **Run it in a worker** (`modules/future/forward.worker.ts`), never beside the live city: ECS component stores are
 * global arrays shared by every `City` in one JS realm (AGENTS.md §8), so a second city in the page would write over
 * the live one's buildings. Tests run it on a save, with no live city around.
 */

export interface Snapshot {
  tick: number;
  day: number;
  residents: number;
  credits: number;
  harmony: number;
  buildings: number;
  ruins: number;
  /** Supply tiers by system (0 thriving … 4 collapse), as City Pulse shows them. */
  tiers: Record<string, number>;
}

export interface ProjectedIncident {
  kind: string;
  name: string;
  icon: string;
  tick: number;
  district: string | null;
  x?: number;
  z?: number;
  /** Buildings it ruined. */
  lost: number;
}

export interface Projection {
  days: number;
  start: Snapshot;
  end: Snapshot;
  /** [tick, day, residents, credits, harmony, buildings] about once a sim minute. */
  samples: [number, number, number, number, number, number][];
  /** Level changes as [uid, tick, tier]. */
  tiers: [number, number, number][];
  /** Buildings ruined (fire, quake, storm…) as [uid, tick], and ones taken off the map as [uid, tick]. */
  ruined: [number, number][];
  removed: [number, number][];
  incidents: ProjectedIncident[];
  /** Era / wonder / project marks the run reached: [tick, kind, id]. */
  marks: [number, string, string][];
  seaRise: [number, number];
  /** The day the council would replace the steward, or null. */
  replacedDay: number | null;
  /** Wall-clock milliseconds the run took (the worker measures it: no clocks in sim code). */
  ms?: number;
}

export interface ForeseeOptions {
  days: number;
  /** After each simulated day (a worker posts progress). */
  onDay?: (day: number, of: number) => void;
}

const SAMPLE_TICKS = 600;
const DAY_TICKS = 3600;

function snapshot(city: City): Snapshot {
  return {
    tick: city.tick,
    day: city.day,
    residents: Math.round(city.stats.population),
    credits: Math.round(city.credits),
    harmony: Math.round(city.stats.happiness),
    buildings: city.buildingEntities().length,
    ruins: city.steward.ruins.length,
    tiers: { ...city.pulse.tiers },
  };
}

/** Plays a copy of the saved city `days` in-game days on (see the file note: in a worker only). */
export function foresee(save: SaveData, opts: ForeseeOptions): Projection {
  const city = new City(new EventBus(), save.seed);
  deserializeCity(city, structuredClone(save));
  const ctx: SimCtx = { city };
  const systems = new SystemRegistry<SimCtx>();
  simSystems.forEach((s) => systems.add(s));
  const frame = { dt: 0.1, tickDt: 0.1, alpha: 0, elapsed: 0, tick: 0 };
  // One pulse first, so the snapshot's stats and tiers are the settled ones the steward sees (a save holds no stats).
  for (let i = 0; i < PULSE_TICKS; i++) systems.run('sim', ctx, frame);
  const start = snapshot(city);

  const tiers: Projection['tiers'] = [];
  const removed: Projection['removed'] = [];
  const marks: Projection['marks'] = [];
  city.bus.on('building:tier', ({ eid, tier }) => tiers.push([Building.uid[eid]!, city.tick, tier]));
  city.bus.on('building:removed', ({ record }) => removed.push([record.uid ?? 0, city.tick]));
  city.bus.on('era:advanced', ({ id }) => marks.push([city.tick, 'era', id]));
  city.bus.on('wonder:discovered', ({ id }) => marks.push([city.tick, 'wonder', id]));
  city.bus.on('project:done', ({ id }) => marks.push([city.tick, 'project', id]));
  const firstIncident = city.steward.nextIncidentId;
  const ruinedSet = new Set(city.steward.ruins);
  const ruined: Projection['ruined'] = [];
  const samples: Projection['samples'] = [];
  const sample = () => samples.push([city.tick, city.day, Math.round(city.stats.population), Math.round(city.credits), Math.round(city.stats.happiness), city.buildingEntities().length]);
  sample();
  const seaFrom = city.steward.seaRise;
  let replacedDay: number | null = null;

  const total = Math.max(0, Math.round(opts.days * DAY_TICKS));
  for (let t = 1; t <= total; t++) {
    systems.run('sim', ctx, frame);
    if (t % PULSE_TICKS === 0) {
      for (const uid of city.steward.ruins)
        if (!ruinedSet.has(uid)) {
          ruinedSet.add(uid);
          ruined.push([uid, city.tick]);
        }
      if (replacedDay === null && city.steward.failed) replacedDay = city.day;
    }
    if (t % SAMPLE_TICKS === 0) sample();
    if (t % DAY_TICKS === 0) opts.onDay?.(t / DAY_TICKS, opts.days);
  }

  const incidents: ProjectedIncident[] = city.steward.history
    .filter((r) => r.id >= firstIncident)
    .map((r) => ({ kind: r.kind, name: r.name, icon: r.icon, tick: r.startTick, district: r.district, x: r.x, z: r.z, lost: r.lost }));
  // Crises still running at the horizon are not in the log yet: they count too.
  for (const c of city.steward.crises) {
    if (c.startTick > city.tick || incidents.some((i) => i.tick === c.startTick && i.kind === c.def)) continue;
    const d = getCrisis(c.def);
    incidents.push({ kind: c.def, name: d?.name ?? c.def, icon: d?.icon ?? 'storm', tick: c.startTick, district: c.x !== undefined && c.z !== undefined ? city.districtAt(c.x, c.z) : null, x: c.x, z: c.z, lost: c.lost ?? 0 });
  }
  return {
    days: opts.days,
    start,
    end: snapshot(city),
    samples,
    tiers,
    ruined,
    removed,
    incidents,
    marks,
    seaRise: [seaFrom, city.steward.seaRise],
    replacedDay,
  };
}
