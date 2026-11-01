import type { CommandStack } from '@/core/Commands';
import type { City } from './City';
import type { SimCtx } from './systems';
import { isOpen } from './growthState';
import { PROJECTS, projectProgress, projectStatus, type Criterion } from './projects';
import { DAY_LENGTH } from './pulseConst';

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

export type FloraPhase = 'asleep' | 'ready' | 'waking' | 'awake';

export interface FloraWake {
  phase: FloraPhase;
  /** What waking her needs (the "Wake Flora" project's criteria), each with how to meet it. */
  criteria: Criterion[];
  cost: number;
  /** 0..1 while waking. */
  progress: number;
  /** Sim seconds left while waking. */
  secondsLeft: number;
}

/**
 * Where Flora stands on a fresh island (D-092): asleep (criteria unmet or credits short), ready to wake, waking
 * (the project is running), or awake. Without progression she is always awake.
 */
export function floraWake(city: City): FloraWake {
  const def = PROJECTS.flora;
  const st = projectStatus(city, 'flora');
  const run = city.growth.projects.find((p) => p.id === 'flora');
  const phase: FloraPhase = st === 'open' ? 'awake' : st === 'running' ? 'waking' : st === 'ready' ? 'ready' : 'asleep';
  return {
    phase,
    criteria: phase === 'awake' ? [] : def.criteria(city),
    cost: def.cost,
    progress: run ? projectProgress(city, run) : phase === 'awake' ? 1 : 0,
    secondsLeft: run ? Math.max(0, (run.endTick - city.tick) / 10) : phase === 'awake' ? 0 : def.days * DAY_LENGTH,
  };
}
