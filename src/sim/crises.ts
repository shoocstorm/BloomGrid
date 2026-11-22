import { query } from 'bitecs';
import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { DAY_LENGTH, type City } from './City';
import { DIFFICULTIES } from './difficulty';
import { slopeRisk } from './slopes';
import { neutralModifiers, type CrisisInstance, type IncidentRecord, type Modifiers } from './stewardState';
import { PULSE_TICKS } from './pulseConst';
import { seasonAt } from './seasons';
import { CHAIN_GAP, DRIFT, MIN_GAP, directing, driftNow, queueCrisis } from './directorCore';

/**
 * Crises: forecast → active → over. Definitions are data plus pure functions; scheduling uses
 * the city RNG so a seed + command log replays identically. Effects flow into the pulse only
 * through `Modifiers`.
 */

/**
 * Crises the weather and the earth bring, not the city (D-208). They roll at NATURAL_ODDS of their weight, in the
 * scheduler and as chain links, so a steward isn't hit by one storm after another; neglect still escalates in full.
 */
export const NATURAL_CRISES: ReadonlySet<string> = new Set(['monsoon', 'king-tide', 'heatwave', 'tornado', 'tsunami', 'landslide', 'earthquake', 'thunderstorm']);
export const NATURAL_ODDS = 0.5;
const naturalOdds = (id: string) => (NATURAL_CRISES.has(id) ? NATURAL_ODDS : 1);

export interface CrisisDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** What the steward can do while it is forecast / active. */
  prep: string;
  /** Seconds of warning before it starts. */
  lead: number;
  /** Seconds it lasts. */
  duration: number;
  /** Relative likelihood right now (0 = cannot happen). */
  weight(city: City): number;
  /** Called once when it becomes active (pick targets). */
  begin?(city: City, c: CrisisInstance): void;
  /** Adds this crisis' effects; `env` ramps 0→1→0 over the active period. */
  apply(city: City, c: CrisisInstance, env: number, m: Modifiers): void;
  /**
   * Chains (plan v5, Phase 27): what may follow when it ends. `chance` is scaled by the crisis' severity; `when`
   * holds the link back unless the city is exposed (bare slopes for a landslide). `why` reads "the quake cracked
   * the grid" in the forecast and the almanac.
   */
  followUps?: { crisis: string; chance: number; why: string; when?(city: City): boolean }[];
}

const defs = new Map<string, CrisisDef>();
export const registerCrisis = (d: CrisisDef) => void defs.set(d.id, d);
export const getCrisis = (id: string) => defs.get(id)!;
export const allCrises = () => [...defs.values()];

/** Incident log length kept in saves (oldest dropped first). */
export const HISTORY_MAX = 80;

/** Appends a finished crisis or fire to the steward's incident log (D-050). */
export function logIncident(city: City, rec: Omit<IncidentRecord, 'id'>): IncidentRecord {
  const st = city.steward;
  const full = { id: st.nextIncidentId++, ...rec };
  st.history.push(full);
  if (st.history.length > HISTORY_MAX) st.history.splice(0, st.history.length - HISTORY_MAX);
  city.bus.emit('incident:logged', { record: full });
  return full;
}

/** Notes a building hit by a crisis (for its log entry): counts it and keeps the first few ids. */
export function noteHit(c: CrisisInstance, id: string | null): void {
  c.hits = (c.hits ?? 0) + 1;
  if (id && !(c.objects ??= []).includes(id) && c.objects.length < 6) c.objects.push(id);
}

/** Storms and waves a Weather Radar sees coming (D-076): their warning doubles while one is working. */
const RADAR_SEES = new Set(['thunderstorm', 'tornado', 'tsunami', 'monsoon', 'king-tide']);
export function leadFor(city: City, id: string): number {
  const d = getCrisis(id);
  if (!RADAR_SEES.has(id)) return d.lead;
  const radar = city.buildingEntities().some((e) => city.buildingDef(e).radar && !Service.off[e] && Service.condition[e]! > 0.2);
  return d.lead * (radar ? 2 : 1);
}


/** Smooth rise over the first 15% and fall over the last 25% of the active window. */
export function envelope(t: number): number {
  const s = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  return s(0, 0.15, t) * (1 - s(0.75, 1, t));
}

/** Schedules a crisis now (forecast phase). Used by the scheduler, drills and tests. */
export function forecastCrisis(
  city: City,
  defId: string,
  severity?: number,
  leadOverride?: number,
  cause?: string,
): CrisisInstance {
  const d = getCrisis(defId);
  const st = city.steward;
  const start = city.tick + Math.round((leadOverride ?? d.lead) * PULSE_TICKS);
  const c: CrisisInstance = {
    id: st.nextCrisisId++,
    def: defId,
    phase: 'forecast',
    startTick: start,
    endTick: start + Math.round(d.duration * PULSE_TICKS),
    severity: severity ?? DIFFICULTIES[st.difficulty].severity * (0.8 + 0.4 * city.rng.next()),
    ...(cause ? { cause } : {}),
  };
  st.crises.push(c);
  city.bus.emit('crisis:forecast', { crisis: c });
  return c;
}

/** Advances crisis lifecycles, maybe schedules a new one, and rebuilds this pulse's modifiers. */
export function updateCrises(city: City): Modifiers {
  const st = city.steward;
  const m = neutralModifiers();
  for (let i = st.crises.length - 1; i >= 0; i--) {
    const c = st.crises[i]!;
    if (c.phase === 'forecast' && city.tick >= c.startTick) {
      c.phase = 'active';
      getCrisis(c.def).begin?.(city, c);
      city.bus.emit('crisis:start', { crisis: c });
    }
    if (c.phase === 'active' && city.tick >= c.endTick) {
      st.crises.splice(i, 1);
      st.lastCrisisEndTick = city.tick;
      const d = getCrisis(c.def);
      const fires = c.fires ?? 0;
      logIncident(city, {
        kind: c.def,
        name: d.name,
        icon: d.icon,
        startTick: c.startTick,
        endTick: city.tick,
        severity: c.severity,
        district: c.x !== undefined ? city.districtAt(Math.floor(c.x), Math.floor(c.z!)) : null,
        ...(c.x !== undefined ? { x: c.x, z: c.z! } : {}),
        hits: c.hits ?? 0,
        lost: c.lost ?? 0,
        fires,
        displaced: Math.round(c.displaced ?? 0),
        cost: Math.round(c.cost ?? 0),
        outcome:
          (c.lost ?? 0) > 0
            ? `${c.lost} building${c.lost === 1 ? '' : 's'} ruined`
            : fires > 0
              ? `${fires} fire${fires === 1 ? '' : 's'} started`
              : (c.hits ?? 0) > 0
                ? 'damage contained'
                : 'weathered',
        objects: c.objects ?? [],
        ...(c.prevented?.length ? { prevented: c.prevented } : {}),
        ...(c.cause ? { cause: c.cause } : {}),
      });
      city.bus.emit('crisis:end', { crisis: c });
      // Chains: one link may follow, drawn while crises run on their own (drills in tests stay single).
      if (st.autoCrises)
        for (const f of d.followUps ?? [])
          if (city.rng.next() < f.chance * Math.min(1.5, c.severity) * naturalOdds(f.crisis) && (f.when?.(city) ?? true)) {
            queueCrisis(city, { crisis: f.crisis, gap: CHAIN_GAP, severity: c.severity * 0.8, cause: `${d.name}: ${f.why}`, kind: 'chain' });
            break;
          }
    }
  }
  for (const c of st.crises) {
    if (c.phase !== 'active') continue;
    const t = (city.tick - c.startTick) / Math.max(1, c.endTick - c.startTick);
    getCrisis(c.def).apply(city, c, envelope(t), m);
  }

  // Scheduler: at most one crisis forecast or active at a time, with a calm gap between them. What the director
  // owes the city (escalations, chain links) comes first; otherwise the odds roll, paced by the director.
  const dir = st.director;
  if (st.autoCrises && st.crises.length === 0) {
    const calm = (city.tick - st.lastCrisisEndTick) / PULSE_TICKS;
    const next = dir.queue[0];
    if (next) {
      if (calm >= next.gap) {
        dir.queue.shift();
        forecastCrisis(city, next.crisis, next.severity, leadFor(city, next.crisis), next.cause);
      }
    } else if (calm > MIN_GAP * dir.calm) {
      const rate = (DIFFICULTIES[st.difficulty].eventRate * dir.pace) / DAY_LENGTH; // per second
      if (city.rng.next() < rate) {
        const season = seasonAt(city.tick).season;
        // Consequences (D-074) tilt the odds: a dirty coast breeds algal blooms, a heat island heatwaves.
        const tilt = city.consequences.mods.crisis;
        const pool = allCrises().map((d) => [d, Math.max(0, d.weight(city)) * (season.crisis[d.id] ?? 1) * (tilt[d.id] ?? 1)] as const);
        // Natural disasters keep only NATURAL_ODDS of their share; the rest of it is a roll where nothing comes
        // (D-208), so fewer storms and quakes don't mean more of the man-made crises.
        let total = 0;
        let spared = 0;
        for (const [d, w] of pool) {
          total += w;
          spared += w * (1 - naturalOdds(d.id));
        }
        let r = city.rng.next() * total - spared;
        for (const [d, w] of pool) {
          if (r <= 0) break;
          if ((r -= w * naturalOdds(d.id)) <= 0) {
            forecastCrisis(city, d.id, undefined, leadFor(city, d.id));
            break;
          }
        }
      }
    }
  }
  // Structural drift (the director pulling a self-running city up): homes and shops want more power and water.
  if (directing(city)) {
    const k = driftNow(city);
    m.energyDemand *= 1 + DRIFT.energyDemand * k;
    m.waterDemand *= 1 + DRIFT.waterDemand * k;
  }
  // Tides and floods stack on top of the risen sea.
  m.floodLevel += st.seaRise;
  st.modifiers = m;
  return m;
}

// ── Definitions ──────────────────────────────────────────────────────────────

registerCrisis({
  id: 'monsoon',
  name: 'Monsoon flood',
  icon: '🌧',
  description: 'Torrential rain raises the river, reservoirs and low coast. Flooded buildings stop working and take damage.',
  prep: 'Keep reserves and spare capacity; avoid building on low riverbanks. Reservoirs fill, so water supply rises.',
  lead: 45,
  duration: 80,
  weight: () => 1,
  followUps: [{ crisis: 'landslide', chance: 0.5, why: 'sodden, bare hillsides give way', when: (city) => slopeRisk(city) > 0 }],
  apply(_city, c, env, m) {
    m.floodLevel = Math.max(m.floodLevel, 0.45 * c.severity * env);
    m.waterSupply *= 1 + 0.4 * env;
    m.harmony -= 3 * env;
  },
});

registerCrisis({
  id: 'king-tide',
  name: 'King tide',
  icon: '🌊',
  description: 'An extreme tide floods the lowest coastal land for a short while.',
  prep: 'Low coastal buildings will be inundated briefly; keep their districts connected elsewhere.',
  lead: 30,
  duration: 40,
  weight: () => 0.7,
  apply(_city, c, env, m) {
    m.floodLevel = Math.max(m.floodLevel, 0.35 * c.severity * env);
  },
});

registerCrisis({
  id: 'heatwave',
  name: 'Heatwave',
  icon: '☀',
  description: 'Cooling demand spikes power and water use. Green, shaded districts suffer far less.',
  prep: 'Build spare power and water. Mature greenery (watered living walls, parks) blunts the harmony loss.',
  lead: 60,
  duration: 90,
  weight: () => 1,
  followUps: [{ crisis: 'industrial-fire', chance: 0.3, why: 'the heat left the works tinder-dry' }],
  apply(city, c, env, m) {
    m.energyDemand *= 1 + 0.35 * c.severity * env;
    m.waterDemand *= 1 + 0.3 * c.severity * env;
    m.harmony -= 9 * c.severity * env * (1 - city.pulse.avgGreenery);
  },
});

registerCrisis({
  id: 'algal-bloom',
  name: 'Algal bloom',
  icon: '🦠',
  description: 'Warm, polluted water clogs reclamation intakes: water output falls.',
  prep: 'Cut pollution near the coast and keep spare water capacity.',
  lead: 30,
  duration: 60,
  weight: (city) => 0.3 + 2 * city.pulse.coastalPollution,
  apply(city, c, env, m) {
    m.waterSupply *= 1 - 0.45 * c.severity * env * (0.4 + 0.6 * Math.min(1, city.pulse.coastalPollution * 2));
  },
});

registerCrisis({
  id: 'grid-failure',
  name: 'Grid failure',
  icon: '⚡',
  description: 'The largest power plant trips offline. Overloaded grids fail more often.',
  prep: 'Keep a power margin (spread generation across several plants).',
  lead: 20,
  duration: 45,
  weight: (city) => 0.25 + (city.pulse.energyRatio < 1.1 ? 1.2 : 0),
  begin(city, c) {
    let best = -1;
    let bestE = 0;
    for (const eid of query(city.world, [Building])) {
      const e = buildings.at(Building.def[eid]!).stats.energy;
      if (e > bestE || (e === bestE && eid < best)) {
        bestE = e;
        best = eid;
      }
    }
    c.target = best;
    if (best >= 0) {
      c.x = Building.x[best]! + Building.w[best]! / 2;
      c.z = Building.z[best]! + Building.d[best]! / 2;
    }
  },
  apply(_city, c, env, m) {
    if (env > 0.05 && c.target !== undefined) m.offline = c.target;
  },
});

registerCrisis({
  id: 'blight',
  name: 'Plant blight',
  icon: '🍂',
  description: 'A plant disease spreads through one district. Living walls and roof gardens die back.',
  prep: 'Biodiverse, ecologically rich districts resist. Keep greenery watered so it regrows.',
  lead: 40,
  duration: 70,
  weight: () => 0.6,
  begin(city, c) {
    const ents = query(city.world, [Building]);
    if (!ents.length) return;
    const eid = ents[Math.floor(city.rng.next() * ents.length)]!;
    c.x = Building.x[eid]! + Building.w[eid]! / 2;
    c.z = Building.z[eid]! + Building.d[eid]! / 2;
    c.radius = 28;
  },
  apply(city, c, env, m) {
    if (c.x === undefined) return;
    const eco = city.fields.ecology[city.grid.index(Math.floor(c.x), Math.floor(c.z!))] ?? 0.5;
    m.blight = { x: c.x, z: c.z!, radius: c.radius ?? 28, rate: 0.012 * c.severity * env * (1.2 - eco) };
  },
});

/** Greenery loss for a building under blight this pulse (seconds = 1). */
export function blightLoss(m: Modifiers, eid: number): number {
  const b = m.blight;
  if (!b) return 0;
  const dx = Building.x[eid]! + Building.w[eid]! / 2 - b.x;
  const dz = Building.z[eid]! + Building.d[eid]! / 2 - b.z;
  return dx * dx + dz * dz < b.radius * b.radius ? b.rate : 0;
}
