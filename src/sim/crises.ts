import { query } from 'bitecs';
import { Building } from '@/ecs/components';
import { buildings } from '@/content';
import { DAY_LENGTH, type City } from './City';
import { DIFFICULTIES } from './difficulty';
import { neutralModifiers, type CrisisInstance, type Modifiers } from './stewardState';
import { PULSE_TICKS } from './pulseConst';
import { seasonAt } from './seasons';

/**
 * Crises: forecast → active → over. Definitions are data plus pure functions; scheduling uses
 * the city RNG so a seed + command log replays identically. Effects flow into the pulse only
 * through `Modifiers`.
 */
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
}

const defs = new Map<string, CrisisDef>();
export const registerCrisis = (d: CrisisDef) => void defs.set(d.id, d);
export const getCrisis = (id: string) => defs.get(id)!;
export const allCrises = () => [...defs.values()];

/** Minimum calm between crises (seconds). */
const MIN_GAP = 75;

/** Smooth rise over the first 15% and fall over the last 25% of the active window. */
export function envelope(t: number): number {
  const s = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  return s(0, 0.15, t) * (1 - s(0.75, 1, t));
}

/** Schedules a crisis now (forecast phase). Used by the scheduler, drills and tests. */
export function forecastCrisis(city: City, defId: string, severity?: number, leadOverride?: number): CrisisInstance {
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
      city.bus.emit('crisis:end', { crisis: c });
    }
  }
  for (const c of st.crises) {
    if (c.phase !== 'active') continue;
    const t = (city.tick - c.startTick) / Math.max(1, c.endTick - c.startTick);
    getCrisis(c.def).apply(city, c, envelope(t), m);
  }

  // Scheduler: at most one crisis forecast or active at a time, with a calm gap between them.
  if (st.autoCrises && st.crises.length === 0 && city.tick - st.lastCrisisEndTick > MIN_GAP * PULSE_TICKS) {
    const rate = DIFFICULTIES[st.difficulty].eventRate / DAY_LENGTH; // per second
    if (city.rng.next() < rate) {
      const season = seasonAt(city.tick).season;
      const pool = allCrises().map((d) => [d, Math.max(0, d.weight(city)) * (season.crisis[d.id] ?? 1)] as const);
      const total = pool.reduce((a, [, w]) => a + w, 0);
      let r = city.rng.next() * total;
      for (const [d, w] of pool) {
        if ((r -= w) <= 0) {
          forecastCrisis(city, d.id);
          break;
        }
      }
    }
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
