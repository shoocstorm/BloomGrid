import type { City } from './City';
import { MILESTONES } from './milestones';
import { PROJECTS } from './projects';
import { FAIL_SECONDS } from './steward';
import { WONDERS, startWonders } from './wonders';

/**
 * The steward's legacy: what a city amounted to when the council replaced its steward. The game-over screen turns it
 * into a chronicle (rank, record tiles, highlights, what tipped it over and what to try next), so losing reads as the
 * end of a chapter worth beating rather than a dead end. Pure: reads the city, changes nothing.
 */
export interface LegacyRank {
  title: string;
  /** One line in the council's voice. */
  line: string;
}

export interface Legacy {
  name: string;
  days: number;
  peakPopulation: number;
  buildings: number;
  /** Buildings the steward placed by hand. */
  built: number;
  /** Crises lived through (fires counted apart). */
  crises: number;
  fires: number;
  milestones: number;
  /** Sea wonders that rose beyond the ones there from the start. */
  wonders: number;
  unlocks: number;
  score: number;
  /** 1..5. */
  stars: number;
  rank: LegacyRank;
  /** What drove the city into collapse. */
  cause: 'harmony' | 'budget' | 'both' | 'unknown';
  /** A few proud moments, newest-feeling first. */
  highlights: string[];
  /** What to try on the next island. */
  lessons: string[];
}

/** Score needed for each rank (index = stars − 1). */
export const LEGACY_RANKS: readonly (LegacyRank & { min: number })[] = [
  { min: 0, title: 'Seedling Steward', line: 'A brief tenure, but every grove starts with a seed.' },
  { min: 600, title: 'Sprout Keeper', line: 'The island remembers the streets you laid.' },
  { min: 1800, title: 'Grove Warden', line: 'A real town grew under your watch.' },
  { min: 4500, title: 'Canopy Custodian', line: 'Few stewards carry a city this far.' },
  { min: 10000, title: 'Bloom Sovereign', line: 'The council will be telling stories about this one.' },
];

const LESSONS: Record<'harmony' | 'budget', string[]> = {
  harmony: [
    'Harmony slips when homes go without power, water, food or work: keep every supply above demand before you add houses.',
    'Parks and gardens beside dense housing lift Harmony quickly and cost little.',
    'Click Harmony in the top bar: its card lists exactly what is pulling it down.',
  ],
  budget: [
    'Watch credit flow, not just the balance: every building adds upkeep.',
    'Grow jobs alongside homes: workplaces pay the taxes that keep the books in the green.',
    'A loan buys time, not a fix: cut what drains credits before the repayments land.',
  ],
};

const GENERAL = [
  'Pause with Space when a crisis lands: plan the response, then let the clock run.',
  `The council gives you ${FAIL_SECONDS} seconds once a system collapses: act on the red warning straight away.`,
  'Ask Flora (bottom right) what is wrong: she reads the city and proposes builds.',
];

export function scoreLegacy(l: Omit<Legacy, 'score' | 'stars' | 'rank' | 'cause' | 'highlights' | 'lessons'>): number {
  return Math.round(
    l.peakPopulation / 4 +
      l.days * 60 +
      l.built * 6 +
      l.crises * 50 +
      l.milestones * 80 +
      l.wonders * 150 +
      l.unlocks * 250,
  );
}

export function rankFor(score: number): { stars: number; rank: LegacyRank } {
  let i = 0;
  while (i + 1 < LEGACY_RANKS.length && score >= LEGACY_RANKS[i + 1]!.min) i++;
  const { title, line } = LEGACY_RANKS[i]!;
  return { stars: i + 1, rank: { title, line } };
}

/** The chronicle of a city's stewardship (`seed` picks which tips show, so a retry may read a different one). */
export function stewardLegacy(city: City, seed = 0): Legacy {
  const st = city.steward;
  const g = city.growth;
  let built = 0;
  for (const by of city.builders.values()) if (by === 'player') built++;
  const crises = st.history.filter((r) => r.kind !== 'fire').length;
  const fires = st.history.length - crises;
  const start = new Set(startWonders());
  const wonderIds = g.wonders.filter((w) => !start.has(w));
  const base = {
    name: g.name,
    days: city.day,
    peakPopulation: Math.round(Math.max(st.peakPopulation, city.stats.population)),
    buildings: city.uids.size,
    built,
    crises,
    fires,
    milestones: g.milestones.length,
    wonders: wonderIds.length,
    unlocks: g.progression ? g.unlocked.length : 0,
  };
  const score = scoreLegacy(base);
  const { stars, rank } = rankFor(score);

  const harmony = city.pulse.tiers.harmony === 4;
  const budget = city.pulse.tiers.budget === 4;
  const cause = harmony && budget ? 'both' : harmony ? 'harmony' : budget ? 'budget' : 'unknown';

  const highlights: string[] = [];
  if (g.progression) for (const id of g.unlocked) highlights.push(`Unlocked ${PROJECTS[id].name}`);
  for (const id of wonderIds) {
    const w = WONDERS.find((d) => d.id === id);
    if (w) highlights.push(`Saw the ${w.name} rise`);
  }
  if (crises) highlights.push(`Weathered ${crises} crisis${crises === 1 ? '' : 'es'}`);
  const lastMilestone = MILESTONES.find((m) => m.id === g.milestones[g.milestones.length - 1]);
  if (lastMilestone) highlights.push(`Reached “${lastMilestone.title}”`);
  if (g.tips >= 10) highlights.push(`Collected ${g.tips} tips from residents`);
  if (!highlights.length && built) highlights.push(`Raised ${built} building${built === 1 ? '' : 's'} by hand`);

  const pick = (list: string[], n: number) => {
    const out: string[] = [];
    for (let i = 0; i < list.length && out.length < n; i++) out.push(list[(seed + i) % list.length]!);
    return out;
  };
  const lessons =
    cause === 'both'
      ? [...pick(LESSONS.harmony, 1), ...pick(LESSONS.budget, 1), ...pick(GENERAL, 1)]
      : cause === 'unknown'
        ? pick(GENERAL, 3)
        : [...pick(LESSONS[cause], 2), ...pick(GENERAL, 1)];

  return { ...base, score, stars, rank, cause, highlights: highlights.slice(0, 4), lessons };
}
