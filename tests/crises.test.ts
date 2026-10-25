import { describe, expect, it } from 'vitest';
import { Problem, Service } from '@/ecs/components';
import { applyScenario } from '@/sim/scenario';
import { forecastCrisis } from '@/sim/crises';
import { creditLimit, totalDebt } from '@/sim/finance';
import { FAIL_SECONDS } from '@/sim/steward';
import { deserializeCity, serializeCity } from '@/sim/save';
import { City } from '@/sim/City';
import { EventBus } from '@/core/EventBus';
import { makeSim } from './helpers';

function founded(difficulty: 'steward' | 'sandbox' = 'steward') {
  const s = makeSim(20261024);
  s.city.steward.difficulty = difficulty;
  applyScenario(s.city, 'founding-city');
  s.city.steward.autoCrises = false;
  s.step(100);
  return s;
}

const removeAll = (s: ReturnType<typeof makeSim>, pred: (e: number) => boolean) => {
  for (const e of [...s.city.buildingEntities()]) {
    if (!pred(e)) continue;
    const r = s.city.buildingRecord(e);
    s.commands.execute('demolish', { x: r.x, z: r.z }, false);
  }
};

describe('finance', () => {
  it('loans add credits, are repaid over time, and can be undone or repaid early', () => {
    const s = founded();
    const c0 = s.city.credits;
    expect(creditLimit(s.city)).toBeGreaterThanOrEqual(5000);
    expect(s.commands.execute('takeLoan', { amount: 5000 })).toBe(true);
    expect(s.city.credits).toBeCloseTo(c0 + 5000, 3);
    const owed = totalDebt(s.city);
    expect(owed).toBeGreaterThan(5000); // interest
    s.step(100);
    expect(totalDebt(s.city)).toBeLessThan(owed);
    s.commands.undo();
    expect(s.city.steward.loans.length).toBe(0);
    s.commands.execute('takeLoan', { amount: 5000 });
    const id = s.city.steward.loans[0]!.id;
    expect(s.commands.execute('repayLoan', { id })).toBe(true);
    expect(totalDebt(s.city)).toBe(0);
  });

  it('debt forces austerity: buildings decay and highways overgrow until networks split', () => {
    const s = founded();
    s.city.credits = -2000;
    s.step(10);
    expect(s.city.steward.funding).toBeLessThan(1);
    s.city.credits = -2000;
    // Keep the city in debt for a few minutes.
    for (let i = 0; i < 300; i++) {
      s.step(10);
      s.city.credits = Math.min(s.city.credits, -2000);
    }
    const ents = s.city.buildingEntities();
    const worn = ents.filter((e) => Service.condition[e]! < 0.5).length;
    expect(worn / ents.length).toBeGreaterThan(0.5);
    expect(s.city.steward.overgrown).toBeGreaterThan(10);
    expect(s.city.networks.count).toBeGreaterThan(1); // overgrown highways cut the grid
  });

  it('redrawing a highway clears overgrowth (undoable)', () => {
    const s = founded();
    const t = s.city.roadTiles()[100]!;
    const og = s.city.grid.addLayer('overgrowth', (n) => new Uint8Array(n));
    og[t] = 255;
    s.city.steward.overgrown = 1;
    s.city.networks.dirty = true;
    expect(s.commands.execute('road', { tiles: [t] })).toBe(true);
    expect(og[t]).toBe(0);
    s.commands.undo();
    expect(og[t]).toBe(255);
  });
});

describe('crises', () => {
  it('follow forecast → active → over', () => {
    const s = founded();
    const events: string[] = [];
    for (const e of ['crisis:forecast', 'crisis:start', 'crisis:end'] as const) s.bus.on(e, () => events.push(e));
    forecastCrisis(s.city, 'heatwave', 1, 5);
    s.step(5 * 10 + 20);
    expect(s.city.steward.crises[0]!.phase).toBe('active');
    s.step(90 * 10);
    expect(s.city.steward.crises.length).toBe(0);
    expect(events).toEqual(['crisis:forecast', 'crisis:start', 'crisis:end']);
  });

  it('heatwave raises demand; monsoon floods low buildings; grid failure trips the biggest plant', () => {
    const s = founded();
    const used = s.city.stats.energyUsed;
    forecastCrisis(s.city, 'heatwave', 1, 0);
    s.step(400);
    expect(s.city.stats.energyUsed).toBeGreaterThan(used * 1.1);
    s.step(600);

    forecastCrisis(s.city, 'monsoon', 1.2, 0);
    s.step(400);
    const floodedNow = s.city.buildingEntities().filter((e) => Service.problems[e]! & Problem.FLOODED).length;
    expect(floodedNow).toBeGreaterThan(0);
    s.step(500);

    forecastCrisis(s.city, 'grid-failure', 1, 0);
    s.step(100);
    const c = s.city.steward.crises[0]!;
    expect(c.target).toBeGreaterThanOrEqual(0);
    expect(Service.problems[c.target!]! & Problem.OFFLINE).toBeTruthy();
  });

  it('the scheduler is deterministic and produces crises over a sim day', () => {
    const run = () => {
      const s = founded();
      s.city.steward.autoCrises = true;
      const seen: string[] = [];
      s.bus.on('crisis:forecast', ({ crisis }) => seen.push(`${crisis.def}@${crisis.startTick}`));
      s.step(3600 * 2);
      return seen;
    };
    const a = run();
    expect(a.length).toBeGreaterThan(1);
    expect(run()).toEqual(a);
  }, 30_000); // two sim days on the 512 map, twice
});

describe('stewardship', () => {
  const collapse = (s: ReturnType<typeof makeSim>) => removeAll(s, (e) => s.city.buildingDef(e).stats.energy > 0 || s.city.buildingDef(e).stats.water > 0);

  it('neglect reaches Collapse and the steward is replaced (deterministically)', () => {
    const run = () => {
      const s = founded();
      let replacedAt = -1;
      s.bus.on('steward:replaced', () => (replacedAt = s.city.tick));
      collapse(s);
      s.city.pulse.taxRate = 0.25;
      for (let i = 0; i < 900 && replacedAt < 0; i++) s.step(10);
      return replacedAt;
    };
    const t = run();
    expect(t).toBeGreaterThan(0);
    expect(run()).toBe(t);
  });

  it('sandbox never fails', () => {
    const s = founded('sandbox');
    collapse(s);
    s.city.pulse.taxRate = 0.25;
    s.step(9000);
    expect(s.city.steward.failed).toBe(false);
  });

  it('a timely response recovers: the fail clock unwinds', () => {
    const s = founded();
    const snap = s.city.snapshotBuildings().filter((b) => {
      const st = s.city.buildingDef(s.city.buildingAt(b.x, b.z)).stats;
      return st.energy > 0 || st.water > 0;
    });
    collapse(s);
    s.city.pulse.taxRate = 0.25;
    let clock = 0;
    for (let i = 0; i < 600 && clock === 0; i++) {
      s.step(10);
      clock = s.city.steward.failClock;
    }
    expect(clock).toBeGreaterThan(0);
    // Respond: rebuild utilities, normal taxes, money to do it.
    s.city.credits = 1e6;
    s.city.pulse.taxRate = 0.1;
    for (const b of snap) s.commands.execute('build', { def: b.def, x: b.x, z: b.z, rot: b.rot });
    for (let i = 0; i < FAIL_SECONDS * 3 && s.city.steward.failClock > 0; i++) s.step(10);
    expect(s.city.steward.failed).toBe(false);
    expect(s.city.steward.failClock).toBe(0);
  });
});

describe('save v3', () => {
  it('round-trips loans, crises and overgrowth', () => {
    const s = founded();
    s.commands.execute('takeLoan', { amount: 5000 });
    forecastCrisis(s.city, 'blight', 1, 3);
    const og = s.city.grid.addLayer('overgrowth', (n) => new Uint8Array(n));
    og[s.city.roadTiles()[5]!] = 128;
    s.city.steward.overgrown = 1;
    s.step(50);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city)));
    const c = new City(new EventBus(), 1);
    deserializeCity(c, data);
    expect(c.hash()).toBe(s.city.hash());
    expect(c.steward.loans.length).toBe(1);
    expect(c.steward.crises[0]!.def).toBe('blight');
  });
});
