import { DIFFICULTIES, type DifficultyId } from '@/sim/difficulty';
import type { SaveData } from '@/sim/save';

/**
 * How a session starts (D-148): a scenario (fresh island, the showcase, a script's) or a saved city. The welcome
 * screen picks one before the engine boots, so the boot builds only the city the player asked for. This file stays
 * light (no content, no three): the welcome chunk imports it.
 */
export type GameStart =
  | {
      kind: 'scenario';
      scenario: string;
      seed: number;
      difficulty: DifficultyId;
      /** City name (a new island named in the welcome dialog). */
      name?: string;
      /** Start the how-to-play guide once the city is in view. */
      guide?: boolean;
      /** Chosen in the welcome dialog: greet the player with a toast once it is in view. */
      chosen?: boolean;
    }
  | { kind: 'save'; slot: string; data: SaveData };

/** The default island: the showcase city's, which the founding-city balance is tuned on (D-072). */
export const SHOWCASE_SEED = 20261024;

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

/** Remembers the difficulty a city was founded on (the next new city offers it first). */
export function rememberDifficulty(d: DifficultyId): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, d);
  } catch {
    /* ignore */
  }
}

/** The start a URL asks for: `?scenario=` (default a fresh island), `?seed=`, `?difficulty=`. */
export function startFromParams(params: URLSearchParams): GameStart {
  return {
    kind: 'scenario',
    scenario: params.get('scenario') ?? 'fresh-island',
    seed: Number(params.get('seed')) || SHOWCASE_SEED,
    difficulty: preferredDifficulty(params),
  };
}

/** A plain boot (the player's, not a script's) opens on the welcome screen; `?wizard` asks for it, `?nowizard` skips it. */
export function wantsWelcome(params: URLSearchParams): boolean {
  return (!params.has('scenario') || params.has('wizard')) && !params.has('nowizard');
}
