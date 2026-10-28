import { describe, expect, it } from 'vitest';
import { Problem, Service } from '@/ecs/components';
import { applyScenario } from '@/sim/scenario';
import { findSpot, makeSim } from './helpers';

describe('wind power', () => {
  it('the founding city runs mostly on connected wind and stays in budget', () => {
    // The game's default seed (seed 1337 is a water-short island that runs a deficit with or without wind).
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    s.step(400); // 40 sim-seconds: residents have moved in, so taxes reflect the full city
    const { city } = s;
    const turbines = city.buildingEntities().filter((e) => city.buildingDef(e).id === 'wind-turbine');
    expect(turbines.length).toBeGreaterThanOrEqual(60);
    // Every turbine touches a highway, so its power reaches the city grid.
    expect(turbines.filter((e) => Service.problems[e]! & Problem.NO_ROAD)).toEqual([]);
    expect(city.pulse.cleanShare).toBeGreaterThan(0.95);
    expect(city.stats.energyProduced).toBeGreaterThan(city.stats.energyUsed);
    expect(city.stats.income - city.stats.upkeep).toBeGreaterThan(0);
  });

  it('a Breeze Turbine builds, produces clean power and undoes', () => {
    const s = makeSim(7);
    const { x, z } = findSpot(s.city, 'wind-turbine');
    const before = s.city.buildingEntities().length;
    expect(s.commands.execute('build', { def: 'wind-turbine', x, z, rot: 0 })).toBe(true);
    const eid = s.city.buildingEntities().find((e) => s.city.buildingDef(e).id === 'wind-turbine')!;
    expect(s.city.buildingDef(eid).cleanEnergy).toBe(true);
    s.commands.undo();
    expect(s.city.buildingEntities().length).toBe(before);
  });
});
