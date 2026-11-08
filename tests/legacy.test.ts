import { describe, expect, it } from 'vitest';
import { LEGACY_RANKS, rankFor, stewardLegacy } from '@/sim/legacy';
import { nextName } from '@/modules/crises/GameOver';
import { makeSim } from './helpers';

describe('steward legacy (game over)', () => {
  it('ranks climb with the score and top out at five stars', () => {
    expect(rankFor(0).stars).toBe(1);
    expect(rankFor(LEGACY_RANKS[2]!.min).stars).toBe(3);
    expect(rankFor(1e9).stars).toBe(LEGACY_RANKS.length);
  });

  it('reads a city without changing it, and names the cause of collapse', () => {
    const s = makeSim(7);
    s.step(50);
    const hash = s.city.hash();
    s.city.pulse.tiers.budget = 4;
    const l = stewardLegacy(s.city, 3);
    expect(l.cause).toBe('budget');
    expect(l.lessons).toHaveLength(3);
    expect(l.score).toBeGreaterThanOrEqual(0);
    expect(l.days).toBe(s.city.day);
    s.city.pulse.tiers.budget = 1;
    expect(s.city.hash()).toBe(hash);
  });

  it('the next island carries the name on', () => {
    expect(nextName('Coralhaven')).toBe('Coralhaven II');
    expect(nextName('Coralhaven II')).toBe('Coralhaven III');
    expect(nextName('Port IX')).toBe('Port X');
    expect(nextName('')).toBe('New Bloom II');
  });
});
