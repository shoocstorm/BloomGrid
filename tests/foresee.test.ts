import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { foresee } from '@/sim/foresee';
import { ignite } from '@/sim/hazards';
import { applyScenario } from '@/sim/scenario';
import { deserializeCity, serializeCity, type SaveData } from '@/sim/save';
import { makeSim } from './helpers';

/** The forward run (plan v7, Phase 34, D-222). Always on a save: never beside a live city (shared ECS stores). */
const saveOf = (city: City): SaveData => JSON.parse(JSON.stringify(serializeCity(city))) as SaveData;

function freshSave(): SaveData {
  const s = makeSim(20261024);
  applyScenario(s.city, 'fresh-island');
  s.step(200);
  return saveOf(s.city);
}

describe('foresee', () => {
  it('is deterministic and plain JSON', () => {
    const save = freshSave();
    const a = foresee(save, { days: 0.5 });
    const b = foresee(save, { days: 0.5 });
    expect(b).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.end.tick - a.start.tick).toBe(1800);
    expect(a.samples.length).toBeGreaterThan(2);
  });

  it('leaves the save as it was and needs no steward input', () => {
    const save = freshSave();
    const before = JSON.stringify(save);
    const days: number[] = [];
    const p = foresee(save, { days: 2, onDay: (d) => days.push(d) });
    expect(JSON.stringify(save)).toBe(before);
    expect(days).toEqual([1, 2]);
    expect(p.end.day).toBeGreaterThan(p.start.day);
    // Replaying the save gives the city it started from (the run worked on its own copy).
    const c = new City(new EventBus(), 1);
    deserializeCity(c, structuredClone(save));
    expect(c.tick).toBe(save.tick);
  });

  it('sees a neglected city decline', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    s.step(400);
    // Every waterworks gone: the taps run dry and the city suffers for it.
    for (const e of [...s.city.buildingEntities()]) if (s.city.buildingDef(e).stats.water > 0) s.city.removeBuilding(e);
    s.step(10);
    const p = foresee(saveOf(s.city), { days: 1 });
    expect(p.start.tiers.water).toBeGreaterThanOrEqual(3);
    expect(p.end.harmony).toBeLessThan(p.start.harmony);
    expect(p.end.residents).toBeLessThan(p.start.residents);
  }, 120_000);

  it('reports the fires and crises ahead, with places', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'fresh-island');
    s.step(50);
    const e = s.city.buildingEntities()[3]!;
    ignite(s.city, e, 'lightning', 1);
    const p = foresee(saveOf(s.city), { days: 0.5 });
    const fire = p.incidents.find((i) => i.kind === 'fire');
    expect(fire).toBeDefined();
    expect(fire!.x).toBeTypeOf('number');
  });
});
