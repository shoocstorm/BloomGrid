import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { netIncome } from '@/sim/finance';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { statGuide } from '@/sim/statGuide';
import { makeSim } from './helpers';

/**
 * Credits actually gained per sim second against the credit flow shown (the top bar, City Pulse, the dashboard),
 * averaged over `pulses`. Fireworks shells are bought one at a time and shown smoothed, so the two agree on average,
 * not pulse by pulse.
 */
function measure(s: ReturnType<typeof makeSim>, pulses: number) {
  const c0 = s.city.credits;
  let shown = 0;
  for (let i = 0; i < pulses; i++) {
    s.step(PULSE_TICKS);
    shown += netIncome(s.city) / pulses;
  }
  return { actual: (s.city.credits - c0) / pulses, shown };
}

function deficit() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(PULSE_TICKS * 20);
  s.city.pulse.taxRate = 0.02;
  return s;
}

describe('credit flow (D-115)', () => {
  it('matches how credits move in a deficit with a loan being repaid and the fireworks factories buying shells', () => {
    const s = deficit();
    expect(s.commands.execute('takeLoan', { amount: 15000 })).toBe(true);
    s.step(PULSE_TICKS * 90); // the fireworks smoothing settles
    const m = measure(s, 120);
    expect(m.shown).toBeLessThan(0);
    expect(s.city.stats.debtService).toBeGreaterThan(0);
    expect(s.city.stats.fireworks).toBeLessThan(0);
    expect(Math.abs(m.shown - m.actual)).toBeLessThan(0.3);
  });

  it('matches in austerity (credits below zero: upkeep only part paid)', () => {
    const s = deficit();
    s.city.credits = -2000;
    s.step(PULSE_TICKS * 90);
    expect(s.city.steward.funding).toBeLessThan(1);
    const m = measure(s, 60);
    expect(Math.abs(m.shown - m.actual)).toBeLessThan(0.3);
  });

  it("the Credits guide's breakdown adds up to the same flow", () => {
    const s = deficit();
    s.commands.execute('takeLoan', { amount: 5000 });
    s.step(PULSE_TICKS * 60);
    const g = statGuide(s.city, 'credits');
    expect(g.parts.reduce((a, p) => a + p.value, 0)).toBeCloseTo(netIncome(s.city), 0);
  });
});
