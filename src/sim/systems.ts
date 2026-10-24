import { query } from 'bitecs';
import type { System } from '@/core/Systems';
import { Greenery, Service } from '@/ecs/components';
import { pulseSystem } from './pulse';
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
      // Greenery grows when watered and dies back during water shortages.
      const v = Greenery.value[eid]!;
      const w = Service.water[eid]!;
      const rate = Greenery.rate[eid]! * f.tickDt;
      if (w >= 0.5) {
        if (v < 1) Greenery.value[eid] = Math.min(1, v + rate * w);
      } else if (v > 0) Greenery.value[eid] = Math.max(0, v - rate * 0.5 * (1 - w));
    }
  },
};

export const simSystems: System<SimCtx>[] = [clockSystem, greenerySystem, pulseSystem];
