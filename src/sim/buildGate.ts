import { buildings } from '@/content';
import type { BuildingCategory } from '@/content/types';
import type { City } from './City';
import { creditLimit, LOAN_SIZES, netIncome } from './finance';
import { isOpen, type UnlockId } from './growthState';
import { limitReason, limitStatus } from './limits';
import { PROJECTS, projectProgress, projectStatus } from './projects';

/**
 * The build gate (D-130): why a building can't be placed right now, and what the steward can do about it.
 * "At most 3" or "Locked" stops a player; every block here comes with the next steps (the population that opens
 * the next fishing dock and the homes that bring it, the project that unlocks a building and what it still needs,
 * how soon the credits arrive and where to find more), each with an action the HUD turns into a button. Read
 * by the Build panel's cards and explanation card, the placement tooltip and the milestone card; the planners
 * (`proposals`, `statGuide`, `seasonGuide`) skip buildings that are `unavailable`.
 */
export type GateAction =
  /** Open the Build panel on a category. */
  | { kind: 'category'; category: BuildingCategory }
  /** Pick up a building to place. */
  | { kind: 'place'; def: string }
  /** Start an unlock project (it is ready). */
  | { kind: 'start'; project: UnlockId }
  /** Open the Goals tab. */
  | { kind: 'goals' }
  /** Open the credits guide (ways to earn, loans). */
  | { kind: 'credits' };

export interface GateStep {
  text: string;
  /** Button label and what it does; a step without one is advice. */
  act?: { label: string; action: GateAction };
}

export interface BuildBlock {
  kind: 'capped' | 'locked' | 'credits';
  /** A few words for a card ("3 / 3 · next at 1,200 pop"). */
  short: string;
  /** One line for a tooltip. */
  reason: string;
  steps: GateStep[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtK = (n: number) =>
  n >= 10000
    ? `${Math.round(n / 1000)}k`
    : n >= 1000
      ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
      : fmt(n);
const fmtTime = (s: number) =>
  s < 90
    ? `${Math.max(1, Math.round(s))} s`
    : s < 5400
      ? `${Math.round(s / 60)} min`
      : `${Math.round(s / 3600)} h`;
/** The cheapest home the city may build (what "grow the town" should pick). */
const cheapestHome = (city: City) =>
  buildings
    .all()
    .filter(
      (d) => d.category === 'residential' && d.stats.population > 0 && !d.landmark && !locked(city, d.id),
    )
    .sort((a, b) => a.stats.cost - b.stats.cost || a.id.localeCompare(b.id))[0]?.id;

const locked = (city: City, id: string) => {
  const req = buildings.get(id).requires;
  return !!req && !isOpen(city.growth, req);
};

const count = (city: City, id: string) => {
  let n = 0;
  for (const e of city.buildingEntities()) if (city.buildingDef(e).id === id) n++;
  return n;
};

/** A limit reached: how many, when the next opens, and what grows the town. */
function capped(city: City, id: string): BuildBlock | null {
  const def = buildings.get(id);
  if (!def.limit) return null;
  const pop = city.stats.population;
  const s = limitStatus(def.limit, pop, count(city, id));
  if (s.have < s.max) return null;
  const more = s.nextAt - pop;
  const home = cheapestHome(city);
  const steps: GateStep[] = [
    {
      text: `Grow the town by ${fmt(more)} residents to ${fmt(s.nextAt)}: every ${fmt(def.limit.perPopulation)} residents allow one more ${def.name}.`,
      act: home
        ? { label: `Build ${buildings.get(home).name}`, action: { kind: 'place', def: home } }
        : { label: 'Homes', action: { kind: 'category', category: 'residential' } },
    },
    {
      text: 'Homes fill when they have power, water and jobs nearby, and residents stay when harmony is high.',
    },
  ];
  if (def.fishing) {
    const stock = Math.round(city.growth.fish * 100);
    steps.push({
      text: `Meanwhile, keep the docks you have staffed (boats only sail with crews) and the coast clean. Fish stock ${stock}%: ${stock < 50 ? 'the sea is overfished, so more boats would catch less' : 'healthy'}.`,
    });
  }
  return {
    kind: 'capped',
    short: `${s.have}/${s.max} · next at ${fmtK(s.nextAt)} pop`,
    reason: limitReason(s, pop),
    steps,
  };
}

/** Locked behind an unlock project: where the project stands and what it still needs. */
function lockedBlock(city: City, id: string): BuildBlock | null {
  const req = buildings.get(id).requires;
  if (!req || !locked(city, id)) return null;
  const p = PROJECTS[req];
  const status = projectStatus(city, req);
  const steps: GateStep[] = [];
  let reason: string;
  if (status === 'running') {
    const run = city.growth.projects.find((r) => r.id === req)!;
    const left = Math.max(0, (run.endTick - city.tick) / 10);
    reason = `Locked: ${p.name} is under way (${Math.round(projectProgress(city, run) * 100)}%, ${fmtTime(left)} left)`;
    steps.push({
      text: `${p.name} is under way: it opens ${p.unlocks.split(':')[0]} in ${fmtTime(left)} of sim time.`,
      act: { label: 'Goals', action: { kind: 'goals' } },
    });
  } else if (status === 'ready') {
    reason = `Locked: start ${p.name} (◈${fmt(p.cost)}) to unlock it`;
    steps.push({
      text: `Everything ${p.name} needs is in place. Start it for ◈${fmt(p.cost)}.`,
      act: { label: `Start · ◈${fmt(p.cost)}`, action: { kind: 'start', project: req } },
    });
  } else {
    const missing = p.criteria(city).filter((c) => !c.ok);
    reason = `Locked: needs ${p.name}${missing.length ? ` (${missing.length} to go)` : ''}`;
    steps.push({ text: `Unlocked by the ${p.name} project (◈${fmt(p.cost)}). It still needs:` });
    for (const c of missing)
      steps.push({
        text: c.label,
        act:
          c.build && buildings.has(c.build) && !locked(city, c.build)
            ? { label: `Build ${buildings.get(c.build).name}`, action: { kind: 'place', def: c.build } }
            : c.credits
              ? { label: 'Earn credits', action: { kind: 'credits' } }
              : undefined,
      });
    if (!missing.length && city.credits < p.cost)
      steps.push({
        text: `◈${fmt(p.cost - city.credits)} more credits to start it.`,
        act: { label: 'Earn credits', action: { kind: 'credits' } },
      });
    steps.push({ text: 'Track it in the Goals tab.', act: { label: 'Goals', action: { kind: 'goals' } } });
  }
  return {
    kind: 'locked',
    short: status === 'ready' ? 'Ready to unlock' : status === 'running' ? 'Unlocking…' : 'Locked',
    reason,
    steps,
  };
}

/** Too dear right now: how long income takes, and where to find more. */
function creditsBlock(city: City, id: string): BuildBlock | null {
  const cost = buildings.get(id).stats.cost;
  if (city.credits >= cost) return null;
  const short = cost - city.credits;
  const rate = netIncome(city);
  const steps: GateStep[] = [];
  if (rate > 0.05)
    steps.push({
      text: `At +◈${rate.toFixed(1)}/s the city has it in about ${fmtTime(short / rate)} of sim time (speed it up with the clock).`,
    });
  else
    steps.push({
      text: 'Credits are not growing: the city spends what it earns. Raise income or cut upkeep first.',
    });
  const loan = [...LOAN_SIZES].reverse().find((a) => a <= creditLimit(city) && a >= short);
  steps.push({
    text: `Earn more: fishing docks, homes that pay taxes, tourism${loan ? `, or borrow ◈${fmt(loan)}` : ''}.`,
    act: { label: 'Ways to earn', action: { kind: 'credits' } },
  });
  return {
    kind: 'credits',
    short: `◈${fmtK(short)} short`,
    reason: `Not enough credits: ◈${fmt(short)} short`,
    steps,
  };
}

/** Why `id` can't be built now and what to do, or null when it can (credits included). */
export function buildBlock(city: City, id: string): BuildBlock | null {
  return lockedBlock(city, id) ?? capped(city, id) ?? creditsBlock(city, id);
}

/** Locked or at its limit: not something to suggest building right now (credits aside, they come and go). */
export function unavailable(city: City, id: string): boolean {
  return !!(lockedBlock(city, id) ?? capped(city, id));
}
