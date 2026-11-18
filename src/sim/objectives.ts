import { scenarios } from '@/content';
import type { ChallengeDef, ObjectiveSpec } from '@/content/types';
import { Building } from '@/ecs/components';
import type { City } from './City';
import { SYSTEMS } from './pulseState';
import { PULSE_TICKS } from './pulseConst';

/**
 * Challenge scenarios (plan v5, Phase 28): a scenario with a `challenge` starts from a city with something wrong (a
 * water network cut back, a loan already owed) and states how to win or lose (`ObjectiveSpec` in content types). The
 * setup runs once after the scenario is built; the objectives are checked every pulse until the challenge is won or
 * lost (`objective:won` / `objective:lost`). Losing does not end the game: the city plays on as free play.
 */

/** Seconds a `reach-tier` goal must hold to count, and a `keep-tiers` breach to lose. */
export const HOLD_WIN = 20;
export const HOLD_LOSE = 15;

export const challengeOf = (city: City): ChallengeDef | null => {
  const c = city.charters.challenge;
  return c ? (scenarios.has(c.scenario) ? (scenarios.get(c.scenario).challenge ?? null) : null) : null;
};

/** Applies a challenge's setup to a freshly built scenario city and starts its clock. */
export function setupChallenge(city: City, scenario: string, def: ChallengeDef): void {
  const s = def.setup;
  if (s.remove) {
    const key = s.remove.resource;
    const producers = city
      .buildingEntities()
      .filter((e) => city.buildingDef(e).stats[key] > 0)
      .sort((a, b) => Building.uid[a]! - Building.uid[b]!);
    // Every k-th producer, so the cut is spread over the island rather than one district.
    const n = Math.round(producers.length * s.remove.share);
    for (let i = 0; i < n; i++) {
      const e = producers[Math.floor((i * producers.length) / n)]!;
      city.releaseUid(city.removeBuilding(e).uid!);
    }
    city.networks.dirty = true;
  }
  if (s.loan) {
    const st = city.steward;
    st.loans.push({ id: st.nextLoanId++, principal: s.loan.amount, remaining: s.loan.amount, payment: s.loan.payment });
  }
  city.charters.challenge = {
    scenario,
    status: 'playing',
    startTick: city.tick,
    endTick: 0,
    held: def.objectives.map(() => 0),
  };
}

export interface ObjectiveView {
  spec: ObjectiveSpec;
  /** Done (win goals), or how it stands. */
  done: boolean;
  /** Seconds left (`reach-tier`), or null. */
  left: number | null;
  /** Progress line ("Water Critical → needs Stable", "◈18,200 owed"). */
  status: string;
}

const TIER_WORDS = ['Thriving', 'Stable', 'Strained', 'Critical', 'Collapse'];

const winGoal = (o: ObjectiveSpec) => o.kind !== 'keep-tiers';

/** How each objective stands now (Goals tab, Flora). */
export function objectiveViews(city: City): ObjectiveView[] {
  const def = challengeOf(city);
  const run = city.charters.challenge;
  if (!def || !run) return [];
  const t = (run.status === 'playing' ? city.tick : run.endTick) - run.startTick;
  return def.objectives.map((o, i) => {
    if (o.kind === 'reach-tier') {
      const now = city.pulse.tiers[o.system];
      return {
        spec: o,
        done: run.held[i]! >= HOLD_WIN,
        left: Math.max(0, o.within - t / PULSE_TICKS),
        status: `${o.system[0]!.toUpperCase()}${o.system.slice(1)} ${TIER_WORDS[now]}: needs ${TIER_WORDS[o.tier]} or better`,
      };
    }
    if (o.kind === 'clear-debt') {
      const owed = city.steward.loans.reduce((a, l) => a + l.remaining, 0);
      return {
        spec: o,
        done: owed <= 0 && city.credits >= 0,
        left: null,
        status: owed > 0 ? `◈${Math.ceil(owed).toLocaleString('en-US')} still owed` : 'No loans outstanding',
      };
    }
    const worst = worstTier(city);
    return { spec: o, done: false, left: null, status: `Worst system now: ${TIER_WORDS[worst]}` };
  });
}

function worstTier(city: City): number {
  let w = 0;
  for (const k of SYSTEMS) if (k !== 'ecology') w = Math.max(w, city.pulse.tiers[k]);
  return w;
}

/** Once per pulse: steps each objective and settles the challenge. */
export function updateObjectives(city: City): void {
  const run = city.charters.challenge;
  if (!run || run.status !== 'playing') return;
  const def = challengeOf(city);
  if (!def) return;
  const t = (city.tick - run.startTick) / PULSE_TICKS;
  let lost: string | null = null;
  let won = true;
  def.objectives.forEach((o, i) => {
    if (o.kind === 'reach-tier') {
      run.held[i] = city.pulse.tiers[o.system] <= o.tier ? run.held[i]! + 1 : 0;
      if (run.held[i]! < HOLD_WIN) {
        won = false;
        if (t >= o.within) lost ??= `Out of time: ${o.label}`;
      }
    } else if (o.kind === 'clear-debt') {
      run.held[i] = city.steward.loans.length === 0 && city.credits >= 0 ? 1 : 0;
      if (!run.held[i]) won = false;
    } else {
      run.held[i] = worstTier(city) > o.worst ? run.held[i]! + 1 : 0;
      if (run.held[i]! >= HOLD_LOSE) lost ??= `Broke the rule: ${o.label}`;
    }
  });
  const name = scenarios.has(run.scenario) ? scenarios.get(run.scenario).name : run.scenario;
  if (lost) {
    run.status = 'lost';
    run.endTick = city.tick;
    city.bus.emit('objective:lost', { scenario: name, reason: lost });
  } else if (won && def.objectives.some(winGoal)) {
    run.status = 'won';
    run.endTick = city.tick;
    city.bus.emit('objective:won', { scenario: name, seconds: Math.round(t) });
  }
}
