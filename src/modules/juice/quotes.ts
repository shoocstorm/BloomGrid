import type { City } from '@/sim/City';

/**
 * What residents say when their tip bubble pops (D-118): a line from the building's kind, or, when the city has
 * something on its mind (short of food or power, a festival mood, night), a line about that. They give the
 * hamlet a voice and quietly point at what needs doing. Lines are data: add freely, keep them under ~44 chars.
 */
const BY_CATEGORY: Record<string, string[]> = {
  residential: [
    'Our balcony tomatoes finally came in!',
    'The kids love the new street trees.',
    'Best sea view on the island.',
    'Kept the solar shutters open all day.',
    'Neighbours brought soup. Love it here.',
    'Moved in last week. Already home.',
  ],
  food: [
    'Fresh catch at the market tonight!',
    'The greens are early this season.',
    'Saved you the ripest melon, steward.',
    'Gulls tried to steal the haul again.',
  ],
  nature: [
    'Saw a heron by the pond this morning.',
    'Picnic under the canopy, anyone?',
    'The moss garden is glowing again.',
    'Bees are back on the flower beds.',
  ],
  commercial: [
    'Busy day! Thanks for the customers.',
    'New bloom-tea blend is selling out.',
    'The café queue goes round the corner.',
  ],
  energy: ['Panels humming nicely today.', 'Clean watts, clear skies.', 'Not a single brown-out this week!'],
  utility: [
    'Pipes are clean and the water sparkles.',
    'All quiet on the night shift.',
    'Running smooth, steward.',
  ],
  tech: ['The servers dream in green.', 'Uptime: perfect. Mood: excellent.'],
  industry: ['Order shipped ahead of schedule!', 'Recycled every scrap this shift.'],
  sports: ['What a match last night!', 'New record on the track!', 'The crowd was electric.'],
};

const WANTS: { when: (c: City) => boolean; lines: string[] }[] = [
  {
    when: (c) => c.stats.population > 20 && c.pulse.foodRatio < 0.9,
    lines: ['The market ran out of greens again…', 'Could we get another market garden?'],
  },
  {
    when: (c) => c.stats.energyUsed > c.stats.energyProduced,
    lines: ['Lights keep flickering. More power?', 'Can we get another solar spire?'],
  },
  {
    when: (c) => c.stats.happiness >= 75,
    lines: ['Happiest island in the archipelago!', 'Wouldn’t live anywhere else.'],
  },
  {
    when: (c) => c.stats.demandHomes > 0.4,
    lines: ['My cousin wants to move here. Room?', 'Friends keep asking for a spare flat.'],
  },
  {
    when: (c) => c.timeOfDay > 0.8 || c.timeOfDay < 0.2,
    lines: ['The glow-fungi are out tonight.', 'Stars are bright over the harbour.'],
  },
];

/** A line for a tip from a building of `category`, picked with `r` in [0, 1). */
export function quoteFor(city: City, category: string, r: number): string {
  const wants = WANTS.filter((w) => w.when(city));
  // About one tip in three speaks to the city's mood, when it has one.
  if (wants.length && r < 0.35) {
    const lines = wants[Math.floor((r / 0.35) * wants.length)]!.lines;
    return lines[Math.floor(r * 97) % lines.length]!;
  }
  const lines = BY_CATEGORY[category] ?? BY_CATEGORY.residential!;
  return lines[Math.floor(r * lines.length * 13) % lines.length]!;
}

/** The icon a bubble shows for a building of `category`. */
export const TIP_ICONS: Record<string, string> = {
  residential: 'happy',
  food: 'food',
  nature: 'flower',
  commercial: 'credits',
  energy: 'sun',
  utility: 'drops',
  tech: 'chip',
  industry: 'industry',
  sports: 'sports',
};
