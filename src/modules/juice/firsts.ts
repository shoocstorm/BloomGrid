import type { City } from '@/sim/City';

/**
 * Firsts (D-173): small discoveries a new steward makes in the first hours of a fresh island, each marked once
 * with a badge. They are cosmetic (saved per city by the juice module's save hook, never hashed) and reward
 * finding the game's corners: the first haul, a combo, a level-up, the first festival. Those with `check` are read
 * at 1 Hz from the city; the rest are earned by an event in `index.ts` (`earn(id)`).
 */
export interface FirstDef {
  id: string;
  title: string;
  /** One short line: what happened, in the player's words. */
  line: string;
  icon: string;
  check?: (city: City) => boolean;
}

export const FIRSTS: readonly FirstDef[] = [
  { id: 'home', title: 'New neighbours', line: 'A home you built opened its doors.', icon: 'house' },
  { id: 'catch', title: 'First haul', line: 'Your boats landed the first catch.', icon: 'wave' },
  { id: 'tip', title: 'Kind words', line: 'You popped your first tip bubble.', icon: 'happy' },
  { id: 'claim', title: "Steward's reward", line: 'You claimed your first milestone.', icon: 'star' },
  { id: 'streak', title: 'On a roll', line: 'Three buildings finished in a row.', icon: 'build' },
  { id: 'combo', title: 'Bubble streak', line: 'A tip combo of ×3.', icon: 'sparkle' },
  { id: 'dawn', title: 'A new day', line: 'The island saw its second sunrise.', icon: 'sun' },
  { id: 'golden', title: 'Struck gold', line: 'You caught a golden tip.', icon: 'credits' },
  { id: 'cat', title: 'Cat person', line: "You petted the island's cat.", icon: 'happy' },
  { id: 'letter', title: 'Fan mail', line: 'You caught a paper plane from a resident.', icon: 'send' },
  { id: 'level', title: 'Growing up', line: 'A building grew to a new level.', icon: 'up' },
  {
    id: 'village',
    title: 'Village',
    line: '500 people call the island home.',
    icon: 'people',
    check: (c) => c.stats.population >= 500,
  },
  {
    id: 'harmony',
    title: 'Happy island',
    line: 'Harmony reached 70.',
    icon: 'happy',
    check: (c) => c.stats.happiness >= 70,
  },
  {
    id: 'treasury',
    title: 'Full coffers',
    line: '◈5,000 in the treasury.',
    icon: 'credits',
    check: (c) => c.credits >= 5000,
  },
  {
    id: 'festival',
    title: 'Something going on',
    line: 'Your residents started a happening.',
    icon: 'fireworks',
  },
  { id: 'bridge', title: 'Over the water', line: 'You opened your first bridge.', icon: 'bridge' },
  { id: 'project', title: 'Grand plan', line: 'An unlock project was completed.', icon: 'gem' },
  {
    id: 'town',
    title: 'Town',
    line: '1,000 residents: a real town now.',
    icon: 'city',
    check: (c) => c.stats.population >= 1000,
  },
];

export const FIRST_IDS = new Set(FIRSTS.map((f) => f.id));
