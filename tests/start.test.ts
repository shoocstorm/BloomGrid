import { describe, expect, it } from 'vitest';
import { SHOWCASE_SEED, startFromParams, wantsWelcome } from '@/game/start';
import { MAP_SIZE } from '@/sim/City';
import { MAP_SIZE as LIGHT_MAP_SIZE } from '@/sim/mapSize';

const q = (s: string) => new URLSearchParams(s);

describe('game start (D-148)', () => {
  it('opens the welcome screen only on a plain boot or ?wizard', () => {
    expect(wantsWelcome(q(''))).toBe(true);
    expect(wantsWelcome(q('perf'))).toBe(true);
    expect(wantsWelcome(q('scenario=founding-city'))).toBe(false);
    expect(wantsWelcome(q('scenario=fresh-island&wizard'))).toBe(true);
    expect(wantsWelcome(q('nowizard'))).toBe(false);
  });

  it('reads the start a URL asks for', () => {
    expect(startFromParams(q(''))).toMatchObject({ kind: 'scenario', scenario: 'fresh-island', seed: SHOWCASE_SEED });
    expect(startFromParams(q('scenario=empty&seed=42&difficulty=hard'))).toMatchObject({ scenario: 'empty', seed: 42, difficulty: 'hard' });
  });

  it('keeps the light map size in step with the sim', () => {
    expect(LIGHT_MAP_SIZE).toBe(MAP_SIZE);
  });
});
