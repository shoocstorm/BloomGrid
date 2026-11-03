import { describe, expect, it } from 'vitest';
import { Flow, Problem, Service } from '@/ecs/components';
import { applyScenario } from '@/sim/scenario';
import { buildingReport } from '@/sim/buildingReport';
import { makeSim } from './helpers';

function settled() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(200);
  return s;
}

describe('building report (inspector, D-109)', () => {
  it('live flows add up to the city totals', () => {
    const { city } = settled();
    let made = 0;
    let drawn = 0;
    let smog = 0;
    for (const e of city.buildingEntities()) {
      const v = Flow.energy[e]!;
      if (v > 0) made += v;
      else drawn -= v;
      smog += Flow.pollution[e]!;
    }
    expect(made).toBeCloseTo(city.stats.energyProduced, 1);
    expect(drawn).toBeCloseTo(city.stats.energyUsed, 1);
    // Fireworks add a little smog of their own to the city total.
    expect(smog).toBeLessThanOrEqual(city.stats.pollution + 1e-3);
  });

  it('splits what a building consumes from what it produces', () => {
    const { city } = settled();
    const ents = city.buildingEntities();
    const home = ents.find((e) => city.buildingDef(e).stats.population > 0 && city.buildingDef(e).stats.energy < 0)!;
    const r = buildingReport(city, home);
    expect(r.consumes.map((l) => l.key)).toContain('energy');
    expect(r.produces.map((l) => l.key)).toContain('residents');
    expect(r.fill?.label).toBe('Occupancy');
    const plant = ents.find((e) => city.buildingDef(e).stats.energy > 0)!;
    const p = buildingReport(city, plant);
    const out = p.produces.find((l) => l.key === 'energy')!;
    expect(out.value).toBeGreaterThan(0);
    expect(out.value).toBeLessThanOrEqual(out.max * 1.5);
    expect(p.consumes.some((l) => l.key === 'energy')).toBe(false);
  });

  it('turns problems into a verdict with fixes', () => {
    const { city } = settled();
    const e = city.buildingEntities().find((x) => city.buildingDef(x).stats.energy < 0)!;
    Service.problems[e] = Problem.NO_POWER;
    Service.power[e] = 0.3;
    const r = buildingReport(city, e);
    expect(r.status.tone).toBe('crit');
    expect(r.issues[0]!.text).toMatch(/Brownout: gets 30%/);
    expect(r.issues[0]!.fix).toMatch(/power/);
    Service.problems[e] = Problem.ON_FIRE;
    expect(buildingReport(city, e).status.title).toBe('On fire');
    Service.problems[e] = 0;
    Service.power[e] = 1;
    Service.water[e] = 1;
    Service.condition[e] = 1;
    Service.occupancy[e] = 1;
    expect(buildingReport(city, e).status.tone).toBe('ok');
  });
});
