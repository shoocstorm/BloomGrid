import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { deserializeCity, migrateSave, serializeCity, SAVE_VERSION, type SaveData } from '@/sim/save';
import { POLICIES, POLICY_COOLDOWN, applyPolicies, isActive, policyBlock, sectorOf } from '@/sim/policies';
import { neutralMods } from '@/sim/consequenceState';
import { taxHarmony } from '@/sim/pulse';
import { netIncome, taxSplit } from '@/sim/finance';
import { Service } from '@/ecs/components';
import { plainIntent } from '@/ai/agent';
import { makeSim } from './helpers';

function founded(seed = 20261024) {
  const s = makeSim(seed);
  applyScenario(s.city, 'founding-city');
  s.step(40 * PULSE_TICKS);
  return s;
}

describe('ordinances (plan v5, Phase 25)', () => {
  it('each one changes at least one modifier', () => {
    const s = founded();
    const base = JSON.stringify(neutralMods());
    for (const p of POLICIES) {
      const m = neutralMods();
      p.apply(m, s.city);
      expect(JSON.stringify(m), p.id).not.toBe(base);
      expect(p.upside.length).toBeGreaterThan(10);
      expect(p.downside.length).toBeGreaterThan(10);
    }
  });

  it('enacting charges the fee and undo refunds it; the cooldown holds a change back', () => {
    const s = founded();
    const before = s.city.credits;
    expect(s.commands.execute('setPolicy', { id: 'four-day-week', on: true })).toBe(true);
    expect(isActive(s.city, 'four-day-week')).toBe(true);
    expect(s.city.credits).toBeCloseTo(before - 1000, 6);
    // Too soon to repeal.
    expect(policyBlock(s.city, 'four-day-week', false)).toMatch(/wait/);
    expect(s.commands.execute('setPolicy', { id: 'four-day-week', on: false })).toBe(false);
    s.commands.undo();
    expect(isActive(s.city, 'four-day-week')).toBe(false);
    expect(s.city.credits).toBeCloseTo(before, 6);
    s.commands.redo();
    expect(isActive(s.city, 'four-day-week')).toBe(true);
    s.step((POLICY_COOLDOWN + 1) * PULSE_TICKS);
    expect(s.commands.execute('setPolicy', { id: 'four-day-week', on: false })).toBe(true);
  });

  it('take effect through the modifiers: harmony up, business tax down', () => {
    const s = founded();
    const tax0 = taxSplit(s.city).business;
    s.commands.execute('setPolicy', { id: 'four-day-week', on: true });
    s.step(2 * PULSE_TICKS);
    expect(s.city.consequences.mods.harmony).toBeGreaterThanOrEqual(4);
    expect(taxSplit(s.city).business).toBeLessThan(tax0 * 0.95);
  });

  it('a running cost lands in the credit flow', () => {
    const s = founded();
    s.commands.execute('setPolicy', { id: 'rainwater-code', on: true });
    s.step(2 * PULSE_TICKS);
    expect(s.city.stats.policyCost).toBeCloseTo(3, 6);
    const st = s.city.stats;
    expect(netIncome(s.city)).toBeCloseTo(
      st.income + st.fishing + st.tourism + st.fireworks - st.insurance - st.upkeep - st.debtService - 3,
      6,
    );
  });

  it('requirements and fresh-island locks block enacting', () => {
    const s = makeSim(3);
    applyScenario(s.city, 'fresh-island');
    s.step(5 * PULSE_TICKS);
    expect(policyBlock(s.city, 'four-day-week', true)).toMatch(/residents/);
    expect(s.commands.execute('setPolicy', { id: 'four-day-week', on: true })).toBe(false);
  });

  it('rainwater code raises water supply', () => {
    const run = (on: boolean) => {
      const s = founded();
      if (on) s.commands.execute('setPolicy', { id: 'rainwater-code', on: true });
      s.step(5 * PULSE_TICKS);
      return s.city.stats.waterProduced;
    };
    expect(run(true)).toBeGreaterThan(run(false) * 1.05);
  });
});

describe('sector budgets and the business tax', () => {
  it('a lower maintenance budget pays less upkeep and wears buildings down; above plan mends faster', () => {
    const run = (b: number) => {
      const s = founded();
      // Knock everything down a little so mending shows.
      for (const e of s.city.buildingEntities()) Service.condition[e] = 0.8;
      s.commands.execute('setBudget', { sector: 'maintenance', value: b });
      s.step(20 * PULSE_TICKS);
      const ents = s.city.buildingEntities();
      return {
        upkeep: s.city.stats.upkeep,
        cond: ents.reduce((a, e) => a + Service.condition[e]!, 0) / ents.length,
      };
    };
    const low = run(0.6);
    const plan = run(1);
    const high = run(1.25);
    expect(low.upkeep).toBeLessThan(plan.upkeep);
    expect(high.upkeep).toBeGreaterThan(plan.upkeep);
    expect(low.cond).toBeLessThan(plan.cond);
    expect(high.cond).toBeGreaterThan(plan.cond);
  });

  it('budgets clamp to 50–125% and undo', () => {
    const s = founded();
    s.commands.execute('setBudget', { sector: 'response', value: 3 });
    expect(s.city.policies.budget.response).toBe(1.25);
    s.commands.undo();
    expect(s.city.policies.budget.response).toBe(1);
  });

  it('the response and ecology budgets move fire spread and bloom', () => {
    const s = founded();
    s.city.policies.budget.response = 0.5;
    s.city.policies.budget.ecology = 0.5;
    const m = neutralMods();
    applyPolicies(s.city, m);
    expect(m.fireSpread).toBeGreaterThan(1);
    expect(m.bloomLoss).toBeGreaterThan(0);
    expect(m.natureEco).toBeLessThan(1);
    expect(sectorOf({ category: 'nature' })).toBe('ecology');
    expect(sectorOf({ category: 'commercial', response: {} })).toBe('response');
  });

  it('the resident tax costs harmony as before up to 16%, steeper above', () => {
    for (const r of [0.04, 0.1, 0.12, 0.16]) expect(taxHarmony(r, 0)).toBeCloseTo(-(r - 0.1) * 150, 6);
    expect(taxHarmony(0.22, 0)).toBeLessThan(-(0.22 - 0.1) * 150);
    // A happy streak softens only the steep part.
    expect(taxHarmony(0.12, 100)).toBe(taxHarmony(0.12, 0));
    expect(taxHarmony(0.22, 100)).toBeGreaterThan(taxHarmony(0.22, 0));
  });

  it('a steep business tax brings in more per worker but squeezes shops and works', () => {
    const run = (rate: number) => {
      const s = founded();
      s.commands.execute('setBusinessTax', { rate });
      s.step(60 * PULSE_TICKS);
      return { tax: taxSplit(s.city).business, employed: s.city.stats.employed };
    };
    const normal = run(0.12);
    const steep = run(0.25);
    expect(steep.tax).toBeGreaterThan(normal.tax);
    expect(steep.employed).toBeLessThan(normal.employed);
  });
});

describe('policy saves and determinism', () => {
  it('round-trip, and v19 saves migrate with no ordinances and the old single tax', () => {
    const s = founded();
    s.commands.execute('setPolicy', { id: 'night-sky', on: true });
    s.commands.execute('setBudget', { sector: 'ecology', value: 0.8 });
    s.commands.execute('setBusinessTax', { rate: 0.14 });
    s.step(3 * PULSE_TICKS);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    expect(data.version).toBe(SAVE_VERSION);
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.policies).toEqual(s.city.policies);
    expect(other.hash()).toBe(s.city.hash());

    const v19 = structuredClone(data) as Partial<SaveData> & { version: number };
    delete v19.policies;
    v19.version = 19;
    const m = migrateSave(v19 as SaveData);
    expect(m.policies.active).toEqual({});
    expect(m.policies.businessRate).toBe(data.pulse.taxRate);
  });

  it('the same commands give the same hash', () => {
    const run = () => {
      const s = founded(9);
      s.commands.execute('setPolicy', { id: 'car-free-core', on: true });
      s.commands.execute('setBudget', { sector: 'maintenance', value: 0.75 });
      s.step(30 * PULSE_TICKS);
      return s.city.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('Flora routes policy requests', () => {
  it('commands, budgets and questions', () => {
    expect(plainIntent('enact the rainwater code')).toBe('set_policy');
    expect(plainIntent('ban cars downtown')).toBe('set_policy');
    expect(plainIntent('repeal the four-day week')).toBe('set_policy');
    expect(plainIntent('should I ban cars downtown?')).toBe('policies_status');
    expect(plainIntent('what policies are in force?')).toBe('policies_status');
    expect(plainIntent('cut the ecology budget to 80%')).toBe('set_budget');
    expect(plainIntent('where does the money go?')).toBe('budget_breakdown');
    expect(plainIntent("how's the budget?")).toBe('budget_breakdown');
  });
});
