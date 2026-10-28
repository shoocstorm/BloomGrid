import { query } from 'bitecs';
import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { CommandStack } from '@/core/Commands';
import type { City } from './City';
import { envelope, getCrisis, logIncident, noteHit, registerCrisis } from './crises';
import { idForSelection } from './inventory';
import type { CrisisInstance, FireIncident, Modifiers } from './stewardState';
import { DAY_LENGTH } from './pulseConst';
import type { SimCtx } from './systems';

/**
 * Hazards (D-050): sudden, local disasters on top of the slow crises. Earthquakes shake buildings down,
 * thunderstorms throw lightning at tall ones, and both (with heatwaves and factories) start fires. A fire grows,
 * damages its building and leaps to neighbours unless an Ember Watch station covers it, the steward dispatches
 * crews (`respond`), or rain beats it back. A building reduced to nothing becomes a ruin until repaired
 * (`repair`). Every crisis and fire goes into the incident log with its losses. Deterministic: city RNG,
 * entity and incident order only.
 */

/** "Day 3 · 14:20" for a sim tick (the clock starts at 0.3 of day 1, as `City` does). */
export function clockLabel(tick: number): string {
  const t = 0.3 + tick / 10 / DAY_LENGTH;
  const mins = Math.floor((t % 1) * 24 * 60);
  return `Day ${Math.floor(t) + 1} · ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Credits per crew dispatch. */
export const RESPONSE_COST = 150;
/** Fire dynamics per second: growth, suppression by crews / a station / rain, condition burned at full blaze. */
const GROW = 0.045;
const CREW = 0.15;
const STATION = 0.09;
const RAIN = 0.06;
const BURN = 0.024;
/**
 * Spread: chance per second at full blaze to ignite one neighbour within SPREAD_R tiles, at most MAX_SPREAD times
 * per fire. An ignored fire takes its building and perhaps a neighbour or two, not the district (measured: at 0.07
 * with no cap an earthquake's fires ran away to 40+ at once).
 */
const SPREAD = 0.02;
const MAX_SPREAD = 2;
const SPREAD_R = 5;
/**
 * Damage costs this share of the building's price in emergency repairs and lost goods (0.3 let a strong quake
 * downtown take ~7 000 credits in seconds; 0.18 keeps it painful but recoverable).
 */
const LOSS = 0.18;

const isIndustry = (city: City, eid: number) => city.buildingDef(eid).category === 'industry';
const centre = (eid: number) =>
  [Building.x[eid]! + Building.w[eid]! / 2, Building.z[eid]! + Building.d[eid]! / 2] as const;

/** Live building by saved serial. */
export function eidOfUid(city: City, uid: number): number {
  for (const eid of query(city.world, [Building])) if (Building.uid[eid] === uid) return eid;
  return -1;
}

export const isRuined = (city: City, eid: number) => city.steward.ruins.includes(Building.uid[eid]!);
export const fireAt = (city: City, eid: number) =>
  city.steward.fires.find((f) => f.uid === Building.uid[eid]);

const activeCrisis = (city: City, id?: number) =>
  id === undefined ? undefined : city.steward.crises.find((c) => c.id === id);

/**
 * Damages a building (condition 0..1) and books the loss. At zero it becomes a ruin. Returns credits lost.
 * `crisis` (if any) gets the hit in its log entry.
 */
export function damageBuilding(
  city: City,
  eid: number,
  amount: number,
  cause: string,
  crisis?: CrisisInstance,
): number {
  const before = Service.condition[eid]!;
  const after = Math.max(0, before - amount);
  Service.condition[eid] = after;
  const cost = (before - after) * city.buildingDef(eid).stats.cost * LOSS;
  city.credits -= cost;
  if (crisis) {
    noteHit(crisis, idForSelection(city, { eid }));
    crisis.cost = (crisis.cost ?? 0) + cost;
  }
  if (after <= 0 && !isRuined(city, eid)) ruin(city, eid, cause, crisis);
  return cost;
}

function ruin(city: City, eid: number, cause: string, crisis?: CrisisInstance): number {
  const st = city.buildingDef(eid).stats;
  const displaced = st.population * Service.occupancy[eid]!;
  city.steward.ruins.push(Building.uid[eid]!);
  Service.occupancy[eid] = 0;
  if (crisis) {
    crisis.lost = (crisis.lost ?? 0) + 1;
    crisis.displaced = (crisis.displaced ?? 0) + displaced;
  }
  city.bus.emit('building:ruined', { eid, cause });
  return displaced;
}

/** Sets a building alight (no-op if already burning or ruined). */
export function ignite(
  city: City,
  eid: number,
  cause: FireIncident['cause'],
  intensity = 0.3,
  crisis?: CrisisInstance,
): FireIncident | null {
  if (eid < 0 || isRuined(city, eid) || fireAt(city, eid)) return null;
  const [x, z] = centre(eid);
  const fire: FireIncident = {
    id: city.steward.nextIncidentId++,
    uid: Building.uid[eid]!,
    x,
    z,
    intensity,
    startTick: city.tick,
    crew: false,
    cause,
    cost: 0,
  };
  if (crisis) {
    fire.crisisId = crisis.id;
    crisis.fires = (crisis.fires ?? 0) + 1;
  }
  city.steward.fires.push(fire);
  city.bus.emit('fire:start', { fire, eid });
  return fire;
}

/** Operating Ember Watch stations (powered and staffed) and their reach. */
function stations(city: City, down: Set<number>): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const eid of query(city.world, [Building])) {
    const r = buildings.at(Building.def[eid]!).response;
    if (!r || down.has(eid) || Service.power[eid]! < 0.5 || Service.occupancy[eid]! < 0.3) continue;
    const [x, z] = centre(eid);
    out.push({ x, z, r: r.radius });
  }
  return out;
}

/** Buildings near (x, z) within r tiles, in entity order. */
function near(city: City, x: number, z: number, r: number): number[] {
  const out: number[] = [];
  for (const eid of query(city.world, [Building])) {
    const [bx, bz] = centre(eid);
    if ((bx - x) ** 2 + (bz - z) ** 2 <= r * r) out.push(eid);
  }
  return out;
}

/** A weighted random building (weights by entity), or -1. */
function pick(city: City, ents: number[], weight: (eid: number) => number): number {
  let total = 0;
  for (const e of ents) total += weight(e);
  if (total <= 0) return -1;
  let r = city.rng.next() * total;
  for (const e of ents) if ((r -= weight(e)) <= 0) return e;
  return ents[ents.length - 1]!;
}

/** Lightning favours tall things: towers, turbines, big landmarks. */
const height = (city: City, eid: number) => {
  const d = city.buildingDef(eid);
  return d.tower ? 6 : d.id === 'wind-turbine' ? 4 : d.footprint[0] * d.footprint[1] >= 36 ? 2.5 : 1;
};

/**
 * Hazards per pulse (1 s), after the crises: aftershocks, lightning, heat and factory fires, then every fire
 * grows or dies, burns and spreads. Fills `m.down` with burning and ruined buildings for the pulse.
 */
export function updateHazards(city: City, m: Modifiers): void {
  const st = city.steward;
  for (const c of st.crises) {
    if (c.phase !== 'active') continue;
    const env = envelope((city.tick - c.startTick) / Math.max(1, c.endTick - c.startTick));
    if (c.def === 'earthquake' && c.x !== undefined && city.rng.next() < 0.1 * env)
      shock(city, c, 0.18, true);
    if (c.def === 'thunderstorm' && c.x !== undefined && city.rng.next() < 0.3 * c.severity * env)
      strike(city, c);
    if (c.def === 'heatwave' && city.rng.next() < 0.025 * c.severity * env) {
      const ents = [...query(city.world, [Building])];
      ignite(
        city,
        pick(city, ents, (e) => (isIndustry(city, e) ? 4 : 0.3)),
        'heat',
        0.25,
        c,
      );
    }
  }

  // Burning and ruined buildings are evacuated this pulse.
  const down = m.down;
  for (const uid of st.ruins) {
    const eid = eidOfUid(city, uid);
    if (eid >= 0) {
      down.add(eid);
      Service.condition[eid] = 0;
    }
  }
  if (!st.fires.length) return;
  const covered = stations(city, down);
  const rain = Math.max(m.rain, st.crises.some((c) => c.def === 'monsoon' && c.phase === 'active') ? 0.8 : 0);
  for (let i = st.fires.length - 1; i >= 0; i--) {
    const f = st.fires[i]!;
    const eid = eidOfUid(city, f.uid);
    if (eid < 0) {
      st.fires.splice(i, 1);
      continue;
    }
    down.add(eid);
    const station = covered.some((s) => (s.x - f.x) ** 2 + (s.z - f.z) ** 2 <= s.r * s.r);
    const grow = GROW * (isIndustry(city, eid) ? 1.4 : 1) * (m.energyDemand > 1.05 ? 1.3 : 1);
    f.intensity = Math.min(
      1,
      Math.max(0, f.intensity + grow - (f.crew ? CREW : 0) - (station ? STATION : 0) - RAIN * rain),
    );
    if (f.intensity > 0) {
      const crisis = activeCrisis(city, f.crisisId);
      // Burn damage belongs to the fire's own log entry (not its crisis'), so the log's totals add up.
      f.cost += damageBuilding(city, eid, BURN * f.intensity, 'fire');
      // Fierce fires leap to a neighbour (a few times at most).
      if (f.intensity > 0.5 && (f.spread ?? 0) < MAX_SPREAD && city.rng.next() < SPREAD * f.intensity) {
        const next = near(city, f.x, f.z, SPREAD_R).filter(
          (e) => e !== eid && !fireAt(city, e) && !isRuined(city, e),
        );
        if (
          next.length &&
          ignite(city, next[Math.floor(city.rng.next() * next.length)]!, 'spread', 0.25, crisis)
        )
          f.spread = (f.spread ?? 0) + 1;
      }
    }
    const ruined = isRuined(city, eid);
    if (f.intensity <= 0 || ruined) endFire(city, f, eid, ruined, station);
  }
}

function endFire(city: City, f: FireIncident, eid: number, ruined: boolean, station: boolean): void {
  const st = city.steward;
  st.fires.splice(st.fires.indexOf(f), 1);
  const def = city.buildingDef(eid);
  const id = idForSelection(city, { eid });
  logIncident(city, {
    kind: 'fire',
    name: `Fire: ${def.name}`,
    icon: '🔥',
    startTick: f.startTick,
    endTick: city.tick,
    severity: 1,
    district: city.districtAt(Math.floor(f.x), Math.floor(f.z)),
    x: f.x,
    z: f.z,
    cause: f.cause,
    hits: 1,
    lost: ruined ? 1 : 0,
    fires: 1,
    displaced: ruined ? Math.round(def.stats.population * 0.9) : 0,
    cost: Math.round(f.cost + (f.crew ? RESPONSE_COST : 0)),
    outcome: ruined
      ? 'burned out: ruin awaits repair'
      : f.crew
        ? 'put out by dispatched crews'
        : station
          ? 'put out by Ember Watch'
          : 'died down in the rain',
    objects: id ? [id] : [],
  });
  city.bus.emit('fire:end', { fire: f, ruined });
}

/** One seismic shock round the crisis epicentre: damage falls off with distance; badly shaken buildings may catch fire. */
function shock(city: City, c: CrisisInstance, scale: number, aftershock: boolean): void {
  const r = c.radius ?? 40;
  const mag = c.severity * scale;
  for (const eid of near(city, c.x!, c.z!, r)) {
    const [bx, bz] = centre(eid);
    const k = 1 - Math.hypot(bx - c.x!, bz - c.z!) / r;
    const dmg = 0.42 * mag * k * k * (city.buildingDef(eid).tower ? 1.3 : 1) * (0.7 + 0.6 * city.rng.next());
    if (dmg < 0.02) continue;
    damageBuilding(city, eid, dmg, 'earthquake', c);
    // Broken gas and power lines start fires in the worst-hit buildings.
    if (dmg > 0.3 && city.rng.next() < 0.15) ignite(city, eid, 'earthquake', 0.3, c);
  }
  city.bus.emit('quake:shock', {
    x: c.x!,
    z: c.z!,
    radius: r,
    magnitude: 4.8 + c.severity * 1.6 * Math.sqrt(scale),
    aftershock,
  });
}

/** A lightning strike in the storm cell: tall buildings attract it; it damages and often ignites. */
function strike(city: City, c: CrisisInstance): void {
  const cell = near(city, c.x!, c.z!, c.radius ?? 70);
  const eid = pick(city, cell, (e) => (isRuined(city, e) ? 0 : height(city, e)));
  if (eid < 0) return;
  damageBuilding(city, eid, 0.12 + 0.15 * city.rng.next() * c.severity, 'lightning', c);
  const fire =
    city.rng.next() < (isIndustry(city, eid) ? 0.65 : 0.4) ? ignite(city, eid, 'lightning', 0.35, c) : null;
  const [x, z] = centre(eid);
  city.bus.emit('lightning:strike', {
    x,
    z,
    y: city.grid.rangeOver(Building.x[eid]!, Building.z[eid]!, Building.w[eid]!, Building.d[eid]!).max,
    eid,
    fire: !!fire,
  });
}

/** A random built-up spot for an epicentre or storm cell. */
function hotspot(city: City, c: CrisisInstance, radius: number): void {
  const ents = [...query(city.world, [Building])];
  if (!ents.length) return;
  const [x, z] = centre(ents[Math.floor(city.rng.next() * ents.length)]!);
  [c.x, c.z, c.radius] = [x, z, radius];
}

// ── Crises ───────────────────────────────────────────────────────────────────

registerCrisis({
  id: 'earthquake',
  name: 'Earthquake',
  icon: '🌋',
  description:
    'The ground heaves under part of the island. Buildings near the epicentre are damaged or shaken down, broken lines start fires, aftershocks follow.',
  prep: 'Ember Watch stations put out quake fires; keep credits for repairs. Repair ruins afterwards.',
  lead: 8,
  duration: 30,
  weight: () => 0.45,
  begin(city, c) {
    hotspot(city, c, 30 + 18 * c.severity);
    if (c.x !== undefined) shock(city, c, 1, false);
  },
  apply(_city, c, env, m) {
    m.shake = Math.max(m.shake, Math.min(1, c.severity * (0.25 + 0.75 * env)));
    m.harmony -= 6 * c.severity * env;
  },
});

registerCrisis({
  id: 'thunderstorm',
  name: 'Thunderstorm',
  icon: '⛈',
  description:
    'A violent storm cell parks over the city. Lightning strikes towers, turbines and tall landmarks, damaging them and starting fires; the rain helps put fires out.',
  prep: 'Cover tall districts with Ember Watch stations, and dispatch crews to fires the stations cannot reach.',
  lead: 25,
  duration: 60,
  weight: () => 0.8,
  begin(city, c) {
    hotspot(city, c, 70);
  },
  apply(_city, c, env, m) {
    m.rain = Math.max(m.rain, env);
    m.harmony -= 2 * c.severity * env;
  },
});

registerCrisis({
  id: 'industrial-fire',
  name: 'Industrial fire',
  icon: '🔥',
  description:
    'A furnace or line fault sets a factory alight. Left alone, it grows and spreads to the neighbours.',
  prep: 'Ember Watch stations near the industry zones catch fires early; otherwise dispatch crews before it spreads.',
  lead: 6,
  duration: 20,
  weight: (city) => {
    let n = 0;
    for (const eid of query(city.world, [Building])) if (isIndustry(city, eid)) n++;
    return n ? 0.4 + Math.min(0.8, n / 40) : 0.1;
  },
  begin(city, c) {
    // A factory if the city has any, else any building.
    const ents = [...query(city.world, [Building])];
    const factories = ents.filter((e) => isIndustry(city, e));
    const eid = pick(city, factories.length ? factories : ents, () => 1);
    if (eid < 0) return;
    [c.x, c.z] = centre(eid);
    c.radius = 6;
    ignite(city, eid, 'industrial', 0.45, c);
  },
  apply(_city, c, env, m) {
    m.harmony -= 1.5 * c.severity * env;
  },
});

// ── Commands ─────────────────────────────────────────────────────────────────

export interface RespondPayload {
  /** Fire id; omitted = every fire without crews. */
  id?: number;
}

/** What repairing a building costs: a ruin is rebuilt at half its price; damage costs in proportion. */
export function repairCost(city: City, eid: number): number {
  const price = city.buildingDef(eid).stats.cost;
  return isRuined(city, eid)
    ? Math.round(price * 0.5)
    : Math.round(price * (1 - Service.condition[eid]!) * 0.4);
}

export function registerHazardCommands(stack: CommandStack<SimCtx>): void {
  stack.register<RespondPayload, { ids: number[]; cost: number }>('respond', {
    apply({ city }, p) {
      const targets = city.steward.fires.filter((f) => !f.crew && (p.id === undefined || f.id === p.id));
      const cost = targets.length * RESPONSE_COST;
      if (!targets.length || city.credits < cost) return null;
      for (const f of targets) f.crew = true;
      city.credits -= cost;
      return { ids: targets.map((f) => f.id), cost };
    },
    revert({ city }, _p, u) {
      for (const f of city.steward.fires) if (u.ids.includes(f.id)) f.crew = false;
      city.credits += u.cost;
    },
  });

  stack.register<{ x: number; z: number }, { uid: number; condition: number; ruined: boolean; cost: number }>(
    'repair',
    {
      apply({ city }, p) {
        const eid = city.buildingAt(p.x, p.z);
        if (eid < 0 || fireAt(city, eid)) return null;
        const ruined = isRuined(city, eid);
        const condition = Service.condition[eid]!;
        if (!ruined && condition > 0.95) return null;
        const cost = repairCost(city, eid);
        if (city.credits < cost) return null;
        city.credits -= cost;
        const uid = Building.uid[eid]!;
        if (ruined) city.steward.ruins.splice(city.steward.ruins.indexOf(uid), 1);
        Service.condition[eid] = ruined ? 0.6 : 1;
        return { uid, condition, ruined, cost };
      },
      revert({ city }, _p, u) {
        const eid = eidOfUid(city, u.uid);
        if (eid < 0) return;
        Service.condition[eid] = u.condition;
        if (u.ruined) city.steward.ruins.push(u.uid);
        city.credits += u.cost;
      },
    },
  );
}

/** Crisis by id for UIs (re-exported so modules need one import). */
export { getCrisis };
