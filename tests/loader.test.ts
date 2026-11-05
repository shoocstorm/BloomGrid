import { describe, expect, it } from 'vitest';
import { foundCity, foundCityStaged } from '@/game/newCity';
import { makeSim } from './helpers';

/** The engine slice `foundCity` needs: `stepTicks` runs the sim systems, like the Engine. */
function ctxOf(seed: number) {
  const s = makeSim(seed);
  return { city: s.city, commands: s.commands, engine: { stepTicks: (n: number) => s.step(n) } } as unknown as Parameters<typeof foundCity>[0];
}

describe('city loader (D-111)', () => {
  it('founds the same city staged as at once, and reports rising progress', async () => {
    const a = ctxOf(1);
    foundCity(a, 20261024, 'steward', 'fresh-island');
    const b = ctxOf(2);
    const seen: number[] = [];
    await foundCityStaged(b, 20261024, 'steward', 'fresh-island', async (_label, p) => void seen.push(p));
    expect(b.city.hash()).toBe(a.city.hash());
    expect(b.city.tick).toBe(a.city.tick);
    expect(seen.length).toBeGreaterThan(3);
    expect([...seen].sort((x, y) => x - y)).toEqual(seen);
    expect(b.loading).toBe(false);
  });
});
