import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { FIRSTS, FIRST_IDS } from '@/modules/juice/firsts';
import { makeSim } from './helpers';

describe('Firsts (D-173)', () => {
  it('have unique ids, a title, a line and an icon each', () => {
    expect(FIRST_IDS.size).toBe(FIRSTS.length);
    for (const f of FIRSTS) {
      expect(f.title.length).toBeGreaterThan(2);
      expect(f.line.length).toBeGreaterThan(5);
      expect(f.icon).toBeTruthy();
    }
  });

  it('a fresh island has none of its city Firsts at the start: each is something to reach', () => {
    for (const seed of [20261024, 1337, 7]) {
      const s = makeSim(seed);
      applyScenario(s.city, 'fresh-island');
      s.step(20);
      const met = FIRSTS.filter((f) => f.check?.(s.city)).map((f) => f.id);
      expect(met).toEqual([]);
    }
  });
});
