import { query } from 'bitecs';
import type { System } from '@/core/Systems';
import { Building, Greenery } from '@/ecs/components';
import { buildings } from '@/content';
import { DAY_LENGTH, type City } from './City';

export interface SimCtx {
  city: City;
}

export const clockSystem: System<SimCtx> = {
  id: 'sim.clock',
  phase: 'sim',
  order: -100,
  update({ city }, f) {
    city.tick++;
    city.timeOfDay += f.tickDt / DAY_LENGTH;
    if (city.timeOfDay >= 1) {
      city.timeOfDay -= 1;
      city.day++;
    }
  },
};

export const greenerySystem: System<SimCtx> = {
  id: 'sim.greenery',
  phase: 'sim',
  update({ city }, f) {
    for (const eid of query(city.world, [Greenery])) {
      const v = Greenery.value[eid]!;
      if (v < 1) Greenery.value[eid] = Math.min(1, v + Greenery.rate[eid]! * f.tickDt);
    }
  },
};

const STATS_INTERVAL = 10; // ticks

export const economySystem: System<SimCtx> = {
  id: 'sim.economy',
  phase: 'sim',
  order: 10,
  update({ city }, f) {
    if (city.tick % STATS_INTERVAL !== 0) return;
    const s = city.stats;
    s.population = s.jobs = s.energyProduced = s.energyUsed = s.eco = s.pollution = s.buildings = 0;
    let happy = 0;
    for (const eid of query(city.world, [Building])) {
      const st = buildings.at(Building.def[eid]!).stats;
      const g = Greenery.value[eid]!;
      s.buildings++;
      s.population += st.population;
      s.jobs += st.jobs;
      if (st.energy > 0) s.energyProduced += st.energy;
      else s.energyUsed -= st.energy;
      // Greenery amplifies ecological value and dampens pollution.
      s.eco += st.eco * (0.3 + 0.7 * g);
      s.pollution += Math.max(0, st.pollution * (1 - 0.4 * g));
      happy += st.happiness;
    }
    s.eco -= s.pollution;
    const n = Math.max(1, s.buildings);
    const energyPenalty = s.energyUsed > s.energyProduced ? 15 : 0;
    s.happiness = Math.max(0, Math.min(100, 55 + ((happy + s.eco) / n) * 4 - energyPenalty));
    const employed = Math.min(s.population, s.jobs);
    s.income = (s.population * 0.04 + employed * 0.06) * (0.5 + s.happiness / 100);
    city.credits += s.income * STATS_INTERVAL * f.tickDt;
    city.bus.emit('stats:updated', undefined);
  },
};

export const simSystems: System<SimCtx>[] = [clockSystem, greenerySystem, economySystem];
