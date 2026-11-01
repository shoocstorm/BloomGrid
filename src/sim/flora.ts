import type { CommandStack } from '@/core/Commands';
import type { City } from './City';
import type { SimCtx } from './systems';
import { isOpen } from './growthState';

/**
 * Flora's bill (Phase 16, D-072): on a fresh island the city assistant must be woken (the `flora` project) and
 * every request costs credits: a base fee plus a little per token the turn used. Without progression she is free.
 */
export const FLORA_BASE = 6;
export const FLORA_PER_TOKEN = 0.01;

export const floraCost = (tokens: number): number =>
  Math.round((FLORA_BASE + Math.max(0, tokens) * FLORA_PER_TOKEN) * 10) / 10;

/** Flora can't be used yet (progression on and not woken). */
export const floraLocked = (city: City): boolean => !isOpen(city.growth, 'flora');

/** Flora is billed (progression on). */
export const floraBilled = (city: City): boolean => city.growth.progression;

/** Why Flora can't take a request now, or null. */
export function floraBlocker(city: City): string | null {
  if (floraLocked(city)) return 'Flora is asleep: wake her with the "Wake Flora" project (Goals tab).';
  if (floraBilled(city) && city.credits < FLORA_BASE)
    return `Not enough credits: a request costs at least ${FLORA_BASE}.`;
  return null;
}

export function registerFloraCommands(stack: CommandStack<SimCtx>): void {
  stack.register<{ tokens: number }, { cost: number }>('floraBill', {
    apply({ city }, p) {
      // A well-loved city gets Flora at a discount (consequences, D-074).
      const cost = floraBilled(city) ? Math.round(floraCost(p.tokens) * (1 - city.consequences.mods.floraDiscount) * 10) / 10 : 0;
      if (city.credits < cost) return null;
      city.credits -= cost;
      city.growth.floraRequests++;
      city.growth.floraSpent += cost;
      return { cost };
    },
    revert({ city }, _p, u) {
      city.credits += u.cost;
      city.growth.floraRequests--;
      city.growth.floraSpent -= u.cost;
    },
  });
}
