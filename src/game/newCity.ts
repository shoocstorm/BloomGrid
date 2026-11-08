import { applyScenario } from '@/sim/scenario';
import { DIFFICULTIES, type DifficultyId } from '@/sim/difficulty';
import { PULSE_TICKS } from '@/sim/pulseConst';
import type { GameContext } from './context';
import { rememberDifficulty } from './start';

export { SHOWCASE_SEED, preferredDifficulty } from './start';

/** One stage of founding a city, for a loading screen (`foundCityStaged`). */
export interface FoundStage {
  label: string;
  /** Progress when the stage starts (0..1). */
  progress: number;
}

type FoundCtx = Pick<GameContext, 'city' | 'engine' | 'commands'> & Partial<Pick<GameContext, 'loading'>>;
type Founded = { buildings: number; roads: number };

/**
 * Founds a city: resets the sim with a seed and difficulty, applies the scenario in bulk and lets
 * the pulse settle. Works before modules load (boot) and at runtime (renderers react to events).
 */
export function foundCity(ctx: FoundCtx, seed: number, difficulty: DifficultyId, scenario = 'founding-city'): Founded {
  const it = foundSteps(ctx, seed, difficulty, scenario);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/**
 * `foundCity` with a pause before each stage, so a loading screen can paint its progress. The caller keeps the
 * engine from ticking meanwhile (the loader sets its speed to 0); the result is the same city tick for tick.
 */
export async function foundCityStaged(
  ctx: FoundCtx,
  seed: number,
  difficulty: DifficultyId,
  scenario: string,
  stage: (label: string, progress: number) => Promise<void>,
): Promise<Founded> {
  const it = foundSteps(ctx, seed, difficulty, scenario);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    await stage(r.value.label, r.value.progress);
  }
}

/** Settling runs in slices so the loading bar moves while the pulse settles. */
const SETTLE_SLICES = 4;

function* foundSteps(ctx: FoundCtx, seed: number, difficulty: DifficultyId, scenario: string): Generator<FoundStage, Founded> {
  const { city } = ctx;
  (ctx as GameContext).loading = true;
  try {
    yield { label: 'Raising the island', progress: 0.08 };
    city.reset(seed, difficulty);
    let r = { buildings: 0, roads: 0 };
    if (scenario !== 'empty') {
      yield { label: scenario === 'fresh-island' ? 'Settling the first hamlet' : 'Raising streets and towers', progress: 0.3 };
      r = applyScenario(city, scenario);
      city.credits *= DIFFICULTIES[difficulty].creditMul;
      // Settle occupancy, utilities and harmony.
      for (let i = 0; i < SETTLE_SLICES; i++) {
        yield { label: i === 0 ? 'Connecting power and water' : i === 1 ? 'Moving residents in' : 'Balancing the city pulse', progress: 0.55 + (i / SETTLE_SLICES) * 0.35 };
        ctx.engine.stepTicks((PULSE_TICKS * 8) / SETTLE_SLICES);
      }
    } else city.credits *= DIFFICULTIES[difficulty].creditMul;
    ctx.commands.clearHistory();
    rememberDifficulty(difficulty);
    return r;
  } finally {
    (ctx as GameContext).loading = false;
  }
}
