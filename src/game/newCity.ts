import { applyScenario } from '@/sim/scenario';
import { DIFFICULTIES, type DifficultyId } from '@/sim/difficulty';
import { PULSE_TICKS } from '@/sim/pulseConst';
import type { GameContext } from './context';

const DIFFICULTY_KEY = 'bloomgrid.difficulty';

/** Difficulty for a new city: `?difficulty=` wins, then the viewer's last choice, then Steward. */
export function preferredDifficulty(params: URLSearchParams): DifficultyId {
  const p = params.get('difficulty');
  if (p && p in DIFFICULTIES) return p as DifficultyId;
  try {
    const saved = localStorage.getItem(DIFFICULTY_KEY);
    if (saved && saved in DIFFICULTIES) return saved as DifficultyId;
  } catch {
    /* storage unavailable */
  }
  return 'steward';
}

/**
 * Founds a city: resets the sim with a seed and difficulty, applies the scenario in bulk and lets
 * the pulse settle. Works before modules load (boot) and at runtime (renderers react to events).
 */
export function foundCity(
  ctx: Pick<GameContext, 'city' | 'engine' | 'commands'> & Partial<Pick<GameContext, 'loading'>>,
  seed: number,
  difficulty: DifficultyId,
  scenario = 'founding-city',
): { buildings: number; roads: number } {
  const { city } = ctx;
  (ctx as GameContext).loading = true;
  try {
    city.reset(seed, difficulty);
    let r = { buildings: 0, roads: 0 };
    if (scenario !== 'empty') {
      r = applyScenario(city, scenario);
      city.credits *= DIFFICULTIES[difficulty].creditMul;
      ctx.engine.stepTicks(PULSE_TICKS * 8); // settle occupancy, utilities and harmony
    } else city.credits *= DIFFICULTIES[difficulty].creditMul;
    ctx.commands.clearHistory();
    try {
      localStorage.setItem(DIFFICULTY_KEY, difficulty);
    } catch {
      /* ignore */
    }
    return r;
  } finally {
    (ctx as GameContext).loading = false;
  }
}
