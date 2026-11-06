import type { CommandStack } from '@/core/Commands';
import { Building } from '@/ecs/components';
import type { City } from './City';
import type { SimCtx } from './systems';
import { isOpen } from './growthState';
import { cheapestPower } from './projects';

/**
 * Steward milestones (D-118): a chain of short, concrete goals for a growing island, each paying a credit reward
 * the player claims by hand. They fill the gap between the guide and the unlock projects with something to reach
 * every minute or two in the first hour, and each one points at a sound next move (feed the harbour, spare power,
 * level a building). Only cities with progression have them (the showcase is already grown).
 *
 * Milestones are data: append to `MILESTONES`. Order is the order the player sees them; any finished one can be
 * claimed. Claims are saved and hashed (`growth.milestones`).
 */
export interface MilestoneDef {
  id: string;
  title: string;
  /** What to do, in the player's words. */
  hint: string;
  /** Icon key (`ui/icons.ts`). */
  icon: string;
  reward: number;
  /** Where the city stands toward it (`have >= need` finishes it). */
  progress(city: City): { have: number; need: number };
  /** A building type that gets it there: the HUD offers to build one. */
  build?: (city: City) => string | undefined;
  /** How to show `have / need`: a count (default), a percentage, or credits. */
  unit?: 'count' | 'pct' | 'credits';
}

const count = (city: City, test: (id: string, cat: string) => boolean) => {
  let n = 0;
  for (const e of city.buildingEntities()) {
    const d = city.buildingDef(e);
    if (test(d.id, d.category)) n++;
  }
  return n;
};
const has = (city: City, id: string) => count(city, (d) => d === id);
const residents =
  (need: number): MilestoneDef['progress'] =>
  (c) => ({ have: c.stats.population, need });
const homes = () => 'garden-residence';
const flag = (ok: boolean) => ({ have: ok ? 1 : 0, need: 1 });

export const MILESTONES: MilestoneDef[] = [
  {
    id: 'second-catch',
    title: 'Second catch',
    hint: 'Build a second Fishing Boat Dock on the shore',
    icon: 'wave',
    reward: 150,
    progress: (c) => ({ have: has(c, 'fishing-dock'), need: 2 }),
    build: () => 'fishing-dock',
  },
  {
    id: 'room-to-grow',
    title: 'Room to grow',
    hint: 'House the island: ten homes along your roads',
    icon: 'house',
    reward: 150,
    progress: (c) => ({ have: count(c, (_d, cat) => cat === 'residential'), need: 10 }),
    build: homes,
  },
  {
    id: 'full-plates',
    title: 'Full plates',
    hint: 'Grow enough food for everyone (Food 100%)',
    icon: 'food',
    reward: 200,
    unit: 'pct',
    progress: (c) => ({ have: Math.round(Math.min(1.5, c.pulse.foodRatio) * 100), need: 100 }),
    build: () => 'greenhouse-hub',
  },
  {
    id: 'residents-250',
    title: 'A busy harbour',
    hint: 'Grow to 250 residents',
    icon: 'people',
    reward: 200,
    progress: residents(250),
    build: homes,
  },
  {
    id: 'neighbourly',
    title: 'Neighbourly',
    hint: 'Pop 5 tip bubbles over happy buildings',
    icon: 'happy',
    reward: 100,
    progress: (c) => ({ have: c.growth.tips, need: 5 }),
  },
  {
    id: 'spare-power',
    title: 'Power to spare',
    hint: 'Make 40 more energy than the city uses',
    icon: 'energy',
    reward: 200,
    progress: (c) => ({
      have: Math.max(0, Math.round(c.stats.energyProduced - c.stats.energyUsed)),
      need: 40,
    }),
    build: cheapestPower,
  },
  {
    id: 'nest-egg',
    title: 'Nest egg',
    hint: 'Save up ◈3,000',
    icon: 'credits',
    reward: 250,
    unit: 'credits',
    progress: (c) => ({ have: Math.max(0, Math.floor(c.credits)), need: 3000 }),
  },
  {
    id: 'growing-up',
    title: 'Growing up',
    hint: 'Get a building to level 2: powered, watered, full and green',
    icon: 'up',
    reward: 250,
    progress: (c) => flag(c.buildingEntities().some((e) => Building.tier[e]! >= 1)),
  },
  {
    id: 'residents-500',
    title: 'Five hundred strong',
    hint: 'Grow to 500 residents',
    icon: 'people',
    reward: 300,
    progress: residents(500),
    build: homes,
  },
  {
    id: 'happy-harbour',
    title: 'Happy harbour',
    hint: 'Raise Harmony to 70 (parks, food, clean air)',
    icon: 'happy',
    reward: 300,
    progress: (c) => ({ have: Math.round(c.stats.happiness), need: 70 }),
    build: () => 'pocket-park',
  },
  {
    id: 'data-spire',
    title: 'A mind for the city',
    hint: 'Build a Data Spire: Flora will think on it',
    icon: 'tech',
    reward: 300,
    progress: (c) => flag(has(c, 'data-spire') > 0),
    build: () => 'data-spire',
  },
  {
    id: 'wake-flora',
    title: 'Good morning, Flora',
    hint: 'Wake Flora (Goals → Wake Flora)',
    icon: 'sparkle',
    reward: 400,
    progress: (c) => flag(isOpen(c.growth, 'flora')),
  },
  {
    id: 'residents-1000',
    title: 'A real town',
    hint: 'Grow to 1,000 residents',
    icon: 'people',
    reward: 500,
    progress: residents(1000),
    build: homes,
  },
  {
    id: 'regular',
    title: 'Friend of the harbour',
    hint: 'Pop 25 tip bubbles',
    icon: 'happy',
    reward: 300,
    progress: (c) => ({ have: c.growth.tips, need: 25 }),
  },
  {
    id: 'green-island',
    title: 'Green island',
    hint: 'Raise Ecology to 60 (parks, gardens, clean power)',
    icon: 'leaf',
    reward: 400,
    progress: (c) => ({ have: Math.round(c.stats.eco), need: 60 }),
    build: () => 'pocket-park',
  },
  {
    id: 'take-to-the-sky',
    title: 'Take to the sky',
    hint: 'Finish the Sky-lane charter',
    icon: 'pod',
    reward: 800,
    progress: (c) => flag(isOpen(c.growth, 'skylanes')),
  },
  {
    id: 'residents-2500',
    title: 'City lights',
    hint: 'Grow to 2,500 residents',
    icon: 'people',
    reward: 800,
    progress: residents(2500),
    build: homes,
  },
  {
    id: 'the-loop',
    title: 'Round the island',
    hint: 'Open the Aeroline',
    icon: 'train',
    reward: 1500,
    progress: (c) => flag(isOpen(c.growth, 'aeroline')),
  },
];

const BY_ID = new Map(MILESTONES.map((m) => [m.id, m]));

export const milestoneDone = (city: City, m: MilestoneDef): boolean => {
  const p = m.progress(city);
  return p.have >= p.need;
};

/** The milestones still to claim, in order (none without progression). */
export function openMilestones(city: City): MilestoneDef[] {
  const g = city.growth;
  return g.progression ? MILESTONES.filter((m) => !g.milestones.includes(m.id)) : [];
}

/** Finished but not yet claimed. */
export const claimableMilestones = (city: City): MilestoneDef[] =>
  openMilestones(city).filter((m) => milestoneDone(city, m));

/** The one to show next: a finished one first, else the first open one. */
export function nextMilestone(city: City): MilestoneDef | undefined {
  const open = openMilestones(city);
  return open.find((m) => milestoneDone(city, m)) ?? open[0];
}

export function registerMilestoneCommands(stack: CommandStack<SimCtx>): void {
  stack.register<{ id: string }, { reward: number }>('claimMilestone', {
    apply({ city }, p) {
      const m = BY_ID.get(p.id);
      const g = city.growth;
      if (!m || !g.progression || g.milestones.includes(m.id) || !milestoneDone(city, m)) return null;
      g.milestones.push(m.id);
      city.credits += m.reward;
      city.bus.emit('milestone:claimed', { id: m.id, reward: m.reward });
      return { reward: m.reward };
    },
    revert({ city }, p, u) {
      const g = city.growth;
      const i = g.milestones.indexOf(p.id);
      if (i < 0) return;
      g.milestones.splice(i, 1);
      city.credits -= u.reward;
    },
  });
}
