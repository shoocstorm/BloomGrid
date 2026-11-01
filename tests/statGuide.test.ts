import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { buildings } from '@/content';
import { lockReason } from '@/sim/projects';
import { STAT_IDS, netIncome, statGuide } from '@/sim/statGuide';
import { makeSim } from './helpers';

function founded(seed = 20261024) {
  const s = makeSim(seed);
  applyScenario(s.city, 'founding-city');
  s.step(40);
  return s;
}

describe('stat guides (D-092)', () => {
  it('explains every top-bar indicator with ranked, valid levers', () => {
    const { city } = founded();
    for (const id of STAT_IDS) {
      const g = statGuide(city, id);
      expect(g.status.length, id).toBeGreaterThan(10);
      expect(g.meaning.length, id).toBeGreaterThan(40);
      expect(g.parts.length, id).toBeGreaterThan(0);
      expect(g.levers.length, id).toBeGreaterThan(0);
      for (let i = 1; i < g.levers.length; i++) expect(g.levers[i - 1]!.weight).toBeGreaterThanOrEqual(g.levers[i]!.weight);
      for (const l of g.levers) {
        if (l.action.kind === 'place') {
          expect(buildings.has(l.action.def)).toBe(true);
          expect(lockReason(city, l.action.def)).toBeNull();
        }
      }
    }
  });

  it('adds up: cash flow is the net income, harmony factors are its target', () => {
    const { city } = founded();
    const c = statGuide(city, 'credits');
    expect(c.parts.reduce((a, p) => a + p.value, 0)).toBeCloseTo(netIncome(city), 1);
    const h = statGuide(city, 'happy');
    const target = Object.values(city.pulse.harmony).reduce((a, v) => a + v, 0);
    expect(h.parts.reduce((a, p) => a + p.value, 0)).toBeCloseTo(target, 0);
  });

  it('a city in debt is told to raise taxes or borrow first', () => {
    const { city } = founded();
    city.credits = -2000;
    const g = statGuide(city, 'credits');
    expect(['tax', 'loan']).toContain(g.levers[0]!.action.kind);
    expect(g.levers.some((l) => l.action.kind === 'loan')).toBe(true);
    expect(g.status).toMatch(/debt/);
  });

  it('suggests only what a fresh island has unlocked', () => {
    const s = makeSim(7);
    applyScenario(s.city, 'fresh-island');
    s.step(20);
    for (const id of STAT_IDS)
      for (const l of statGuide(s.city, id).levers) if (l.action.kind === 'place') expect(lockReason(s.city, l.action.def), `${id}: ${l.action.def}`).toBeNull();
  });
});
