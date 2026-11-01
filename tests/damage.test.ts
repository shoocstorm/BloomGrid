import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { Building, Service } from '@/ecs/components';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { ignite } from '@/sim/hazards';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { stockTotal } from '@/sim/fireworks';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { makeSim } from './helpers';

const seconds = (s: ReturnType<typeof makeSim>, n: number) => s.step(n * PULSE_TICKS);

function settled() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(200);
  s.city.credits += 1e5;
  return s;
}
const first = (s: ReturnType<typeof makeSim>, id: string) =>
  s.city.buildingEntities().find((e) => s.city.buildingDef(e).id === id)!;

describe('visible damage and switches (Phase 19, D-075)', () => {
  it('fire chars a building; repair cleans it, undo brings the char back', () => {
    const s = settled();
    const e = s.city.buildingEntities().find((x) => s.city.buildingDef(x).stats.population > 0)!;
    ignite(s.city, e, 'heat', 0.6);
    seconds(s, 6);
    expect(Service.scorch[e]).toBeGreaterThan(0.3);
    s.city.steward.fires.length = 0;
    seconds(s, 1);
    const scorch = Service.scorch[e]!;
    const at = { x: Building.x[e]!, z: Building.z[e]! };
    expect(s.commands.execute('repair', at)).toBe(true);
    expect(Service.scorch[e]).toBe(0);
    s.commands.undo();
    expect(Service.scorch[e]).toBe(scorch);
  });

  it('a feathered turbine makes no power; switching back restores it; undo too', () => {
    const s = settled();
    const turbines = s.city.buildingEntities().filter((e) => s.city.buildingDef(e).id === 'wind-turbine');
    const made = s.city.stats.energyProduced;
    for (const e of turbines)
      expect(s.commands.execute('toggleBuilding', { x: Building.x[e]!, z: Building.z[e]! })).toBe(true);
    seconds(s, 2);
    expect(s.city.stats.energyProduced).toBeLessThan(made * 0.8);
    for (let i = 0; i < turbines.length; i++) s.commands.undo();
    seconds(s, 2);
    expect(s.city.stats.energyProduced).toBeGreaterThan(made * 0.9);
    // Buildings without a switch refuse.
    const home = s.city.buildingEntities().find((x) => s.city.buildingDef(x).stats.population > 0)!;
    expect(s.commands.execute('toggleBuilding', { x: Building.x[home]!, z: Building.z[home]! })).toBe(false);
  });

  it('a paused fireworks factory makes no shells', () => {
    const run = (pause: boolean) => {
      const t = makeSim(20261024);
      applyScenario(t.city, 'founding-city');
      t.step(200);
      if (pause)
        for (const e of t.city
          .buildingEntities()
          .filter((x) => t.city.buildingDef(x).id === 'fireworks-factory'))
          t.commands.execute('toggleBuilding', { x: Building.x[e]!, z: Building.z[e]! });
      const before = stockTotal(t.city.fireworks.stock);
      seconds(t, 60);
      return stockTotal(t.city.fireworks.stock) - before;
    };
    expect(run(true)).toBe(0);
    expect(run(false)).toBeGreaterThan(0);
  });

  it('saves char and switches; v13 saves load clean and on', () => {
    const s = settled();
    const tb = first(s, 'wind-turbine');
    s.commands.execute('toggleBuilding', { x: Building.x[tb]!, z: Building.z[tb]! });
    Service.scorch[first(s, 'garden-residence')] = 0.4;
    seconds(s, 2);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    expect(data.version).toBe(SAVE_VERSION);
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.hash()).toBe(s.city.hash());
    const v13 = structuredClone(data);
    v13.version = 13;
    v13.buildings = v13.buildings.map((b) => b.slice(0, 12) as SaveData['buildings'][number]);
    const back = new City(new EventBus(), 1);
    deserializeCity(back, migrateSave(v13));
    expect(back.buildingEntities().every((b) => Service.off[b] === 0 && Service.scorch[b] === 0)).toBe(true);
  });
});
