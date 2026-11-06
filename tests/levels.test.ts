import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { Building, Greenery, Service } from '@/ecs/components';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { DAY_LENGTH } from '@/sim/pulseConst';
import { LEVEL_DAYS, MAX_TIER, renovateCost, upgradeAdvice, upgradeCost, upkeepMul } from '@/sim/levels';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { makeSim } from './helpers';

const seconds = (s: ReturnType<typeof makeSim>, n: number) => s.step(n * 10);

function settled() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(200);
  s.city.credits += 1e5;
  return s;
}
/** A powered, watered home made full, green and sound (thriving) for the test. */
const thrivingHome = (s: ReturnType<typeof makeSim>) => {
  const e = s.city
    .buildingEntities()
    .filter((x) => s.city.buildingDef(x).stats.population > 0)
    .sort(
      (a, b) =>
        Math.min(Service.power[b]!, Service.water[b]!) - Math.min(Service.power[a]!, Service.water[a]!) ||
        a - b,
    )[0]!;
  Service.occupancy[e] = 1;
  Service.condition[e] = 1;
  Greenery.value[e] = 1;
  return e;
};

describe('building levels and ageing (Phase 18, D-073)', () => {
  it('a thriving home grows a level, holding more residents', () => {
    const s = settled();
    const e = thrivingHome(s);
    expect(e).toBeDefined();
    const cap = s.city.stats.capacity;
    const tiers: number[] = [];
    s.bus.on('building:tier', ({ eid, tier }) => eid === e && tiers.push(tier));
    Service.thrive[e] = LEVEL_DAYS[0] * DAY_LENGTH - 3;
    seconds(s, 6);
    expect(Building.tier[e]).toBe(1);
    expect(tiers).toEqual([1]);
    expect(s.city.stats.capacity).toBeGreaterThan(cap);
  });

  it('the steward can pay for an upgrade; undo takes it back', () => {
    const s = settled();
    const e = thrivingHome(s);
    const [x, z] = [Building.x[e]!, Building.z[e]!];
    const credits = s.city.credits;
    const cost = upgradeCost(s.city, e);
    expect(s.commands.execute('upgradeBuilding', { x, z })).toBe(true);
    expect(Building.tier[e]).toBe(1);
    expect(s.city.credits).toBe(credits - cost);
    s.commands.undo();
    expect(Building.tier[e]).toBe(0);
    expect(s.city.credits).toBe(credits);
  });

  it('age raises upkeep and wear; renovation resets it', () => {
    const s = settled();
    const e = thrivingHome(s);
    expect(upkeepMul(e)).toBeCloseTo(1, 1);
    Service.age[e] = 10 * DAY_LENGTH;
    expect(upkeepMul(e)).toBeCloseTo(1.15, 2);
    const cost = renovateCost(s.city, e);
    const credits = s.city.credits;
    expect(s.commands.execute('renovate', { x: Building.x[e]!, z: Building.z[e]! })).toBe(true);
    expect(Service.age[e]).toBe(0);
    expect(s.city.credits).toBe(credits - cost);
    s.commands.undo();
    expect(Service.age[e]).toBe(10 * DAY_LENGTH);
    // A brand-new, sound building needs no renovation.
    Service.age[e] = 0;
    Service.condition[e] = 1;
    expect(s.commands.execute('renovate', { x: Building.x[e]!, z: Building.z[e]! })).toBe(false);
  });

  it('saves level, age and progress; v11 saves start every building new at level 1', () => {
    const s = settled();
    const e = thrivingHome(s);
    s.commands.execute('upgradeBuilding', { x: Building.x[e]!, z: Building.z[e]! });
    seconds(s, 5);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    expect(data.version).toBe(SAVE_VERSION);
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.hash()).toBe(s.city.hash());
    const v11 = structuredClone(data);
    v11.version = 11;
    v11.buildings = v11.buildings.map((b) => b.slice(0, 9) as SaveData['buildings'][number]);
    const back = new City(new EventBus(), 1);
    deserializeCity(back, migrateSave(v11));
    expect(back.buildingEntities().every((b) => Building.tier[b] === 0 && Service.age[b] === 0)).toBe(true);
  });

  it('explains a blocked upgrade and names the fix (D-117)', () => {
    const s = settled();
    const { city } = s;
    const e = thrivingHome(s);
    Building.tier[e] = 0;
    expect(upgradeAdvice(city, e)).toBeNull();
    Service.condition[e] = 0.3;
    expect(upgradeAdvice(city, e)).toMatchObject({ act: 'renovate', reason: 'Too run down: renovate it first' });
    expect(upgradeAdvice(city, e)!.fix).toContain(`◈${renovateCost(city, e).toLocaleString()}`);
    Service.condition[e] = 1;
    city.credits = upgradeCost(city, e) - 120;
    expect(upgradeAdvice(city, e)).toMatchObject({ act: 'credits', short: 120 });
    expect(upgradeAdvice(city, e)!.fix).toContain('◈120 short');
    Building.tier[e] = MAX_TIER;
    expect(upgradeAdvice(city, e)?.act).toBeUndefined();
  });
});
