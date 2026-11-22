import { describe, expect, it } from 'vitest';
import { clockRate, nightShare, phaseOf, timeAtPhase } from '@/sim/dayClock';

describe('day clock', () => {
  it('spends about a quarter of the cycle at night', () => {
    expect(nightShare()).toBeGreaterThan(0.2);
    expect(nightShare()).toBeLessThan(0.3);
  });

  it('runs faster at midnight than at noon and keeps the cycle length', () => {
    expect(clockRate(0)).toBeGreaterThan(clockRate(0.5) * 3);
    let s = 0;
    for (let i = 0; i < 10000; i++) s += 1 / clockRate((i + 0.5) / 10000) / 10000;
    expect(s).toBeCloseTo(1, 3);
  });

  it('converts between phase and time of day', () => {
    for (const t of [0, 0.1, 0.3, 0.5, 0.77, 0.95]) expect(timeAtPhase(phaseOf(t))).toBeCloseTo(t, 6);
    expect(phaseOf(0.25)).toBeCloseTo(1 - phaseOf(0.75), 6);
  });
});
