import { query } from 'bitecs';
import type { System } from '@/core/Systems';
import { Building, Greenery, Problem, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { SimCtx } from './systems';
import { HISTORY_LENGTH, HISTORY_METRICS, SYSTEMS, tierFromRatio, type SystemKey, type Tier } from './pulseState';

export const PULSE_TICKS = 10; // one pulse per sim second
const HISTORY_EVERY = 10; // pulses
const LABOUR_SHARE = 0.65;
/** Credits per taxed resident-second; tuned so a mature city nets a modest surplus at 12% tax. */
const INCOME_SCALE = 0.06;

// Scratch buffers reused across pulses (no per-pulse allocation for typical network counts).
let prodE = new Float64Array(64);
let demE = new Float64Array(64);
let prodW = new Float64Array(64);
let demW = new Float64Array(64);

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const approach = (v: number, target: number, up: number, down: number) =>
  v < target ? Math.min(target, v + up) : Math.max(target, v - down);

/**
 * City Pulse: once per sim second, solve utilities per highway network, update occupancy and
 * staffing, demand, harmony, the budget and system health tiers. Deterministic: iteration is in
 * entity order and uses no randomness.
 */
export const pulseSystem: System<SimCtx> = {
  id: 'sim.pulse',
  phase: 'sim',
  order: 10,
  update({ city }) {
    if (city.tick % PULSE_TICKS !== 0) return;
    const { networks, pulse, stats: s } = city;
    const ents = query(city.world, [Building]);

    if (networks.dirty) {
      networks.recompute();
      for (const eid of ents)
        Service.network[eid] = networks.networkFor(Building.x[eid]!, Building.z[eid]!, Building.w[eid]!, Building.d[eid]!);
    }
    const n = networks.count;
    if (prodE.length < n) {
      const size = Math.max(n, prodE.length * 2);
      prodE = new Float64Array(size);
      demE = new Float64Array(size);
      prodW = new Float64Array(size);
      demW = new Float64Array(size);
    }
    prodE.fill(0, 0, n);
    demE.fill(0, 0, n);
    prodW.fill(0, 0, n);
    demW.fill(0, 0, n);

    // Pass 1: totals and per-network supply/demand.
    let capacity = 0;
    let jobsTotal = 0;
    let population = 0;
    let staffedJobs = 0;
    let food = 0;
    let upkeep = 0;
    let amenity = 0;
    s.energyProduced = s.energyUsed = s.waterProduced = s.waterUsed = 0;
    for (const eid of ents) {
      const st = buildings.at(Building.def[eid]!).stats;
      const occ = Service.occupancy[eid]!;
      const net = Service.network[eid]!;
      capacity += st.population;
      population += st.population * occ;
      jobsTotal += st.jobs;
      staffedJobs += st.jobs * occ;
      upkeep += st.upkeep;
      amenity += st.happiness;
      const activity = st.population > 0 ? 0.3 + 0.7 * occ : st.jobs > 0 ? 0.4 + 0.6 * occ : 1;
      if (st.food > 0) food += st.food * (st.jobs > 0 ? occ : 1) * Service.power[eid]!;
      if (net < 0) continue;
      if (st.energy > 0) prodE[net] += st.energy * activity;
      else demE[net] -= st.energy * activity;
      // Water works need power to pump.
      if (st.water > 0) prodW[net] += st.water * activity * Service.power[eid]!;
      else demW[net] -= st.water * activity;
    }
    for (let i = 0; i < n; i++) {
      s.energyProduced += prodE[i]!;
      s.energyUsed += demE[i]!;
      s.waterProduced += prodW[i]!;
      s.waterUsed += demW[i]!;
    }

    const workers = population * LABOUR_SHARE;
    const staffing = jobsTotal > 0 ? Math.min(1, workers / jobsTotal) : 1;
    const unemployment = workers > 1 ? clamp(1 - staffedJobs / workers, 0, 1) : 0;
    const foodRatio = population > 1 ? Math.min(1.5, food / population) : 1;

    // Pass 2: per-building service levels, problems, occupancy/staffing.
    let resServices = 0;
    let resWeight = 0;
    s.eco = 0;
    s.pollution = 0;
    let built = 0;
    const harmony01 = s.happiness / 100;
    for (const eid of ents) {
      const def = buildings.at(Building.def[eid]!);
      const st = def.stats;
      const net = Service.network[eid]!;
      const needsGrid = st.energy < 0 || st.water < 0 || st.population > 0 || st.jobs > 0;
      const power = st.energy < 0 ? (net < 0 ? 0 : demE[net]! > 0 ? Math.min(1, prodE[net]! / demE[net]!) : 1) : 1;
      const water = st.water < 0 ? (net < 0 ? 0 : demW[net]! > 0 ? Math.min(1, prodW[net]! / demW[net]!) : 1) : 1;
      Service.power[eid] = power;
      Service.water[eid] = water;
      let p = 0;
      if (needsGrid && net < 0) p |= Problem.NO_ROAD;
      // Flag only shortages severe enough to matter locally; mild deficits show as system tiers.
      if (power < 0.8) p |= Problem.NO_POWER;
      if (water < 0.8) p |= Problem.NO_WATER;
      const service = Math.min(power, water);
      const occ = Service.occupancy[eid]!;
      if (st.population > 0) {
        const jobFactor = workers > jobsTotal ? 0.6 + 0.4 * (jobsTotal / Math.max(1, workers)) : 1;
        const target = clamp(0.1 + 0.9 * service * jobFactor * clamp(harmony01 * 1.4, 0.2, 1) * clamp(foodRatio, 0.5, 1), 0, 1);
        // Residents arrive faster than they leave: a crisis gives the steward ~1–2 minutes to act.
        Service.occupancy[eid] = approach(occ, target, 0.015, 0.008);
        resServices += service * st.population;
        resWeight += st.population;
      } else if (st.jobs > 0) {
        const target = staffing * clamp(service + 0.2, 0, 1);
        Service.occupancy[eid] = approach(occ, target, 0.03, 0.02);
        if (Service.occupancy[eid]! < 0.5) p |= Problem.UNSTAFFED;
      }
      Service.problems[eid] = p;
      const g = Greenery.value[eid]!;
      s.eco += st.eco * (0.3 + 0.7 * g);
      s.pollution += Math.max(0, st.pollution * (1 - 0.4 * g));
      built++;
    }

    // Aggregate stats.
    s.buildings = built;
    s.capacity = capacity;
    s.population = population;
    s.jobs = jobsTotal;
    s.employed = Math.min(workers, staffedJobs);
    s.foodProduced = food;
    s.eco -= s.pollution;
    s.demandHomes = clamp((jobsTotal - capacity * LABOUR_SHARE) / Math.max(150, jobsTotal) + 0.25, -1, 1);
    s.demandWork = clamp((workers - jobsTotal) / Math.max(150, workers), -1, 1);
    s.demandFood = clamp((population - food) / Math.max(150, population), -1, 1);
    pulse.energyRatio = s.energyUsed > 0 ? s.energyProduced / s.energyUsed : 2;
    pulse.waterRatio = s.waterUsed > 0 ? s.waterProduced / s.waterUsed : 2;
    pulse.foodRatio = foodRatio;
    pulse.unemployment = unemployment;

    // Harmony.
    const per = Math.max(1, built);
    const h = pulse.harmony;
    h.base = 55;
    h.ecology = clamp((s.eco / per) * 3, -20, 15);
    h.services = resWeight > 0 ? -30 * (1 - resServices / resWeight) : 0;
    h.jobs = -25 * unemployment;
    h.food = population > 1 ? -20 * (1 - Math.min(1, foodRatio)) : 0;
    h.taxes = -(pulse.taxRate - 0.1) * 150;
    h.amenities = clamp((amenity / per) * 2, -10, 15);
    const target = clamp(h.base + h.ecology + h.services + h.jobs + h.food + h.taxes + h.amenities, 0, 100);
    s.happiness += (target - s.happiness) * 0.06;

    // Budget.
    s.income = (population * 0.6 + s.employed * 0.4) * pulse.taxRate * INCOME_SCALE;
    s.upkeep = upkeep;
    city.credits += s.income - s.upkeep;

    // Health tiers.
    const net = s.income - s.upkeep;
    const tiers: Record<SystemKey, Tier> = {
      energy: s.energyUsed > 0 ? tierFromRatio(pulse.energyRatio, [0.6, 0.85, 1, 1.15]) : 1,
      water: s.waterUsed > 0 ? tierFromRatio(pulse.waterRatio, [0.6, 0.85, 1, 1.15]) : 1,
      food: population > 1 ? tierFromRatio(foodRatio, [0.5, 0.75, 0.95, 1.15]) : 1,
      jobs: tierFromRatio(1 - unemployment, [0.65, 0.8, 0.9, 0.95]),
      ecology: tierFromRatio(s.eco / per, [-4, -1, 1, 4]),
      harmony: tierFromRatio(s.happiness, [25, 40, 55, 75]),
      budget: city.credits < -5000 ? 4 : city.credits < 0 ? 3 : net < 0 ? 2 : net > s.upkeep * 0.25 ? 0 : 1,
    };
    for (const k of SYSTEMS) {
      const prev = pulse.tiers[k];
      if (prev !== tiers[k]) {
        pulse.tiers[k] = tiers[k];
        if (pulse.primed) city.bus.emit('pulse:tier', { system: k, tier: tiers[k], prev });
      }
    }
    pulse.primed = true;

    // History.
    if ((city.tick / PULSE_TICKS) % HISTORY_EVERY === 0) {
      const sample: Record<(typeof HISTORY_METRICS)[number], number> = {
        population,
        credits: city.credits,
        happiness: s.happiness,
        energyBalance: s.energyProduced - s.energyUsed,
        waterBalance: s.waterProduced - s.waterUsed,
        eco: s.eco,
        net,
      };
      for (const m of HISTORY_METRICS) {
        const arr = pulse.history[m];
        arr.push(sample[m]);
        if (arr.length > HISTORY_LENGTH) arr.shift();
      }
    }
    city.bus.emit('stats:updated', undefined);
  },
};
