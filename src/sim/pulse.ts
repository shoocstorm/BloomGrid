import { query } from 'bitecs';
import type { System } from '@/core/Systems';
import { Building, Greenery, Problem, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { SimCtx } from './systems';
import { HISTORY_LENGTH, HISTORY_METRICS, SYSTEMS, tierFromRatio, type SystemKey, type Tier } from './pulseState';
import { FIELD_PULSES, computeFields } from './fields';
import { blightLoss, updateCrises } from './crises';
import { updateFinance } from './finance';
import { updateCondition, updateOvergrowth } from './upkeep';
import { updateStewardship } from './steward';
import { LABOUR_SHARE, PULSE_TICKS } from './pulseConst';
import { bloomLayers, computeBloom, computeIrrigation, computePairing } from './bloom';
import { computeActivity } from './nightlife';
import { computeMobility } from './mobility';
import { computeFloraNet, farmSoilMul } from './floranet';
import { defenceList, isProtected, updateSeaRise } from './coast';
import { BANYAN_LEVEL, bridgeEnds } from './weaver';
import { seasonAt } from './seasons';
import { MAX_ENTITIES } from '@/ecs/components';

export { PULSE_TICKS };

const HISTORY_EVERY = 10; // pulses
/** Credits per taxed resident-second; tuned so a mature city nets a modest surplus at 12% tax. */
export const INCOME_SCALE = 0.06;

// Scratch buffers reused across pulses (no per-pulse allocation for typical network counts).
let prodE = new Float64Array(64);
let demE = new Float64Array(64);
let prodW = new Float64Array(64);
let demW = new Float64Array(64);
/** Per-entity flood flag for the current pulse (pass 1 → pass 2). */
const flooded = new Uint8Array(MAX_ENTITIES);

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
    const { season, index: seasonIdx } = seasonAt(city.tick);
    if (pulse.season !== seasonIdx) {
      if (pulse.season >= 0) city.bus.emit('season:changed', { index: seasonIdx });
      pulse.season = seasonIdx;
    }
    if (city.channelsDirty) {
      computeIrrigation(city);
      city.channelsDirty = false;
    }
    // Field work is staggered across pulses so no single frame carries it all.
    const phase = pulse.count++ % FIELD_PULSES;
    if (phase === 0) {
      computePairing(city);
      computeFields(city, city.fields);
    } else if (phase === 1) {
      computeMobility(city);
      city.bus.emit('mobility:updated', undefined);
    } else if (phase === 2) {
      computeBloom(city, city.fields);
      city.bus.emit('bloom:updated', undefined);
    } else if (phase === 3) {
      computeFloraNet(city);
      city.bus.emit('floranet:updated', undefined);
    } else if (phase === 4) {
      computeActivity(city, city.fields);
      city.bus.emit('activity:updated', undefined);
    }
    const desirability = city.fields.desirability;
    const bloomField = bloomLayers(city).bloom;

    if (networks.dirty) {
      networks.recompute();
      for (const eid of ents)
        Service.network[eid] = networks.networkFor(Building.x[eid]!, Building.z[eid]!, Building.w[eid]!, Building.d[eid]!);
    }
    updateSeaRise(city);
    const mod = updateCrises(city);
    const defences = mod.floodLevel > 0 ? defenceList(city) : [];
    const bridges = city.weaver.bridges.length ? bridgeEnds(city) : null;
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
      const def0 = buildings.at(Building.def[eid]!);
      const st = def0.stats;
      const occ = Service.occupancy[eid]!;
      const net = Service.network[eid]!;
      capacity += st.population;
      population += st.population * occ;
      jobsTotal += st.jobs;
      staffedJobs += st.jobs * occ;
      upkeep += st.upkeep;
      // Retrofits, banyan merges and woven sky-bridges delight residents.
      const lvl = Building.level[eid]!;
      amenity += st.happiness + (lvl === BANYAN_LEVEL ? 4 : lvl > 0 ? 2 : 0) + (bridges?.get(eid) ?? 0) * 3;
      // Flooded buildings are evacuated: they neither produce nor consume. Offline plants trip.
      // Seawalls keep water out of what they protect (up to their height).
      const fl =
        mod.floodLevel > 0 &&
        !def0.floodproof &&
        city.grid.rangeOver(Building.x[eid]!, Building.z[eid]!, Building.w[eid]!, Building.d[eid]!).min < mod.floodLevel &&
        !isProtected(defences, Building.x[eid]! + Building.w[eid]! / 2, Building.z[eid]! + Building.d[eid]! / 2, mod.floodLevel);
      flooded[eid] = fl ? 1 : 0;
      const centre = city.grid.index(Building.x[eid]! + (Building.w[eid]! >> 1), Building.z[eid]! + (Building.d[eid]! >> 1));
      Service.bloom[eid] = bloomField[centre]!;
      if (fl || eid === mod.offline) continue;
      // Worn-down buildings work at reduced capacity.
      const activity = (st.population > 0 ? 0.3 + 0.7 * occ : st.jobs > 0 ? 0.4 + 0.6 * occ : 1) * (0.4 + 0.6 * Service.condition[eid]!);
      // Pollinated farms yield more; seasons shift harvests.
      // Soil nutrients and hydration (Flora-Net) and drone harvesting shift yields too.
      if (st.food > 0)
        food += st.food * (st.jobs > 0 ? occ : 1) * Service.power[eid]! * (0.7 + 0.5 * Service.bloom[eid]!) * season.foodMul * farmSoilMul(city, Building.x[eid]! + Building.w[eid]! / 2, Building.z[eid]! + Building.d[eid]! / 2);
      if (net < 0) continue;
      const retro = Building.level[eid]! > 0;
      const sym = def0.symbiosis && Service.paired[eid] ? def0.symbiosis.outputMul : 1;
      if (st.energy > 0) prodE[net] += st.energy * activity * mod.energySupply * sym;
      else demE[net] -= st.energy * activity * mod.energyDemand * (retro ? 0.8 : 1);
      // Water works need power to pump.
      if (st.water > 0) prodW[net] += st.water * activity * Service.power[eid]! * mod.waterSupply * season.waterMul;
      else demW[net] -= st.water * activity * mod.waterDemand * (retro ? 0.85 : 1);
    }
    const netStats = pulse.networks;
    netStats.length = n;
    for (let i = 0; i < n; i++) {
      netStats[i] = { buildings: 0, energyProduced: prodE[i]!, energyUsed: demE[i]!, waterProduced: prodW[i]!, waterUsed: demW[i]! };
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
    let greenSum = 0;
    let condSum = 0;
    const harmony01 = s.happiness / 100;
    const funding = city.steward.funding;
    const floodSev = city.steward.crises.reduce((a, c) => (c.phase === 'active' ? Math.max(a, c.severity) : a), 0);
    for (const eid of ents) {
      const def = buildings.at(Building.def[eid]!);
      const st = def.stats;
      const net = Service.network[eid]!;
      if (net >= 0) netStats[net]!.buildings++;
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
      const isFlooded = flooded[eid] === 1;
      const isOffline = eid === mod.offline;
      if (isFlooded) p |= Problem.FLOODED;
      if (isOffline) p |= Problem.OFFLINE;
      const occ = Service.occupancy[eid]!;
      const cond = updateCondition(eid, funding, isFlooded, (st.population > 0 || st.jobs > 0) && occ < 0.1, floodSev);
      if (cond < 0.35) p |= Problem.NEGLECTED;
      const service = isFlooded ? 0 : Math.min(power, water);
      if (st.population > 0) {
        const jobFactor = workers > jobsTotal ? 0.6 + 0.4 * (jobsTotal / Math.max(1, workers)) : 1;
        // Desirable land (green, clean, coastal, connected) fills up more readily.
        const desire = 0.85 + 0.3 * desirability[city.grid.index(Building.x[eid]!, Building.z[eid]!)]!;
        const target = isFlooded
          ? 0
          : clamp(0.1 + 0.9 * service * jobFactor * clamp(harmony01 * 1.4, 0.2, 1) * clamp(foodRatio, 0.5, 1) * desire * (0.5 + 0.5 * cond), 0, 1);
        // Residents arrive faster than they leave: a crisis gives the steward ~1–2 minutes to act.
        Service.occupancy[eid] = approach(occ, target, 0.015, 0.008);
        resServices += service * st.population;
        resWeight += st.population;
      } else if (st.jobs > 0) {
        const target = isFlooded || isOffline ? 0 : staffing * clamp(service + 0.2, 0, 1);
        Service.occupancy[eid] = approach(occ, target, 0.03, 0.02);
        if (Service.occupancy[eid]! < 0.5) p |= Problem.UNSTAFFED;
      }
      Service.problems[eid] = p;
      const blight = blightLoss(mod, eid);
      if (blight > 0) Greenery.value[eid] = Math.max(0, Greenery.value[eid]! - blight);
      const g = Greenery.value[eid]!;
      greenSum += g;
      condSum += cond;
      const retro = Building.level[eid]! > 0;
      s.eco += st.eco * (0.3 + 0.7 * g) * (Building.level[eid] === BANYAN_LEVEL ? 2 : retro ? 1.5 : 1) + (bridges?.get(eid) ?? 0) * 2;
      const pairMul = def.symbiosis && Service.paired[eid] ? def.symbiosis.pollutionMul : 1;
      s.pollution += Math.max(0, st.pollution * (1 - 0.4 * g) * pairMul * (retro ? 0.7 : 1));
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
    // Amenities only delight when maintained.
    h.amenities = clamp((amenity / per) * 2, -10, 15) * (condSum / per);
    h.crises = mod.harmony;
    h.bloom = clamp((pulse.bloomIndex - 0.4) * 16, -4, 6);
    // Jammed commutes wear residents down (flow 0.9+ is free; 0.5 means trips take twice as long).
    h.traffic = -clamp((0.9 - pulse.flow) * 25, 0, 12);
    const target = clamp(h.base + h.ecology + h.services + h.jobs + h.food + h.taxes + h.amenities + h.crises + h.bloom + h.traffic, 0, 100);
    pulse.avgGreenery = greenSum / per;
    s.happiness += (target - s.happiness) * 0.06;

    // Budget.
    s.income = (population * 0.6 + s.employed * 0.4) * pulse.taxRate * INCOME_SCALE;
    city.credits += s.income;
    s.debtService = updateFinance(city, upkeep);
    s.upkeep = upkeep * city.steward.funding;

    // Health tiers.
    const net = s.income - s.upkeep - s.debtService;
    const tiers: Record<SystemKey, Tier> = {
      energy: s.energyUsed > 0 ? tierFromRatio(pulse.energyRatio, [0.6, 0.85, 1, 1.15]) : 1,
      water: s.waterUsed > 0 ? tierFromRatio(pulse.waterRatio, [0.6, 0.85, 1, 1.15]) : 1,
      food: population > 1 ? tierFromRatio(foodRatio, [0.5, 0.75, 0.95, 1.15]) : 1,
      jobs: tierFromRatio(1 - unemployment, [0.65, 0.8, 0.9, 0.95]),
      ecology: tierFromRatio(s.eco / per, [-4, -1, 1, 4]),
      harmony: tierFromRatio(s.happiness, [25, 40, 55, 75]),
      mobility: pulse.commuters > 50 ? tierFromRatio(pulse.flow, [0.45, 0.6, 0.75, 0.9]) : 1,
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
    updateOvergrowth(city);
    updateStewardship(city);

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
        bloom: pulse.bloomIndex,
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
