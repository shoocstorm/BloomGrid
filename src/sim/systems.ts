import { query } from 'bitecs';
import type { System } from '@/core/Systems';
import { Building, Greenery, Service } from '@/ecs/components';
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
    const irrigation = city.grid.layer<Float32Array>('irrigation');
    for (const eid of query(city.world, [Greenery])) {
      // Greenery grows when watered and dies back during water shortages.
      const v = Greenery.value[eid]!;
      // Filtration channels irrigate nearby gardens even when the network runs dry.
      const irr = irrigation ? irrigation[city.grid.index(Building.x[eid]!, Building.z[eid]!)]! : 0;
      const w = Math.max(Service.water[eid]!, irr * 0.9);
      // Bloom (pollination) and retrofits speed growth.
      const rate = Greenery.rate[eid]! * f.tickDt * (0.5 + Service.bloom[eid]!) * (Building.level[eid]! > 0 ? 1.5 : 1);
      if (w >= 0.5) {
        if (v < 1) Greenery.value[eid] = Math.min(1, v + rate * w);
      } else if (v > 0) Greenery.value[eid] = Math.max(0, v - rate * 0.5 * (1 - w));
    }
  },
};

export const simSystems: System<SimCtx>[] = [clockSystem, greenerySystem, pulseSystem];
