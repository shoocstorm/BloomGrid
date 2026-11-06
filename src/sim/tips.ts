import type { CommandStack } from '@/core/Commands';
import { NO_ENTITY } from './Grid';
import type { City } from './City';
import type { SimCtx } from './systems';

/**
 * Residents' tips (D-118): now and then a happy building floats a bubble (the `juice` module picks where and when,
 * cosmetically); popping it pays a small tip. The value is the sim's, so a replayed command log pays the same:
 * it grows with the square root of the population (worth a click at 100 residents and at 10,000, never the
 * economy), with Harmony, and with a short combo of quick pops.
 */
export const TIP_COMBO_MAX = 5;

export function tipValue(city: City, combo = 1): number {
  const mood = Math.min(1.5, Math.max(0.5, city.stats.happiness / 60));
  const k = 1 + 0.25 * (Math.min(TIP_COMBO_MAX, Math.max(1, Math.floor(combo))) - 1);
  return Math.round((15 + Math.sqrt(Math.max(0, city.stats.population)) * 0.9) * mood * k);
}

export function registerTipCommands(stack: CommandStack<SimCtx>): void {
  stack.register<{ uid: number; combo: number }, { amount: number }>('collectTip', {
    apply({ city }, p) {
      const eid = city.buildingByUid(p.uid);
      if (eid === NO_ENTITY) return null;
      const amount = tipValue(city, p.combo);
      city.credits += amount;
      city.growth.tips++;
      city.growth.tipIncome += amount;
      city.bus.emit('tip:collected', {
        eid,
        amount,
        combo: Math.min(TIP_COMBO_MAX, Math.max(1, Math.floor(p.combo))),
      });
      return { amount };
    },
    revert({ city }, _p, u) {
      city.credits -= u.amount;
      city.growth.tips--;
      city.growth.tipIncome -= u.amount;
    },
  });
}
