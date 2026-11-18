import type { City } from './City';
import { tierCount } from './charters';

/**
 * Eras (plan v5, Phase 28): the city grows through Seedling → Grove → Canopy → Bloom as it gains residents and
 * claims charter tiers. An era never goes back. Each one opens an ordinance slot (on a growing island; the showcase
 * has every slot from the start), raises the director's target tension (`director.ts` `band`), and Canopy brings the
 * Bloom Expo happening. Arriving plays a grand moment (`era:advanced`). Pure data plus one step per pulse.
 */
export interface EraDef {
  id: 'seedling' | 'grove' | 'canopy' | 'bloom';
  name: string;
  icon: string;
  /** What reaching it means, in a line. */
  line: string;
  /** To reach it: residents, charter tiers claimed, and Gold charters. */
  population: number;
  tiers: number;
  golds: number;
  /** Ordinances that may be in force at once on a growing island. */
  slots: number;
  /** Added to the director's tension band. */
  band: number;
}

export const ERAS: EraDef[] = [
  { id: 'seedling', name: 'Seedling', icon: 'leaf', line: 'A young city finding its feet.', population: 0, tiers: 0, golds: 0, slots: 2, band: 0 },
  { id: 'grove', name: 'Grove', icon: 'nature', line: 'A town with a charter to its name.', population: 1000, tiers: 1, golds: 0, slots: 3, band: 0.02 },
  { id: 'canopy', name: 'Canopy', icon: 'flower', line: 'A city with a reputation: the Bloom Expo comes calling.', population: 10000, tiers: 4, golds: 0, slots: 4, band: 0.04 },
  { id: 'bloom', name: 'Bloom', icon: 'sparkle', line: 'A city in full bloom, known across the sea.', population: 30000, tiers: 8, golds: 1, slots: 8, band: 0.06 },
];

export const eraOf = (city: City): EraDef => ERAS[Math.min(ERAS.length - 1, city.charters.era)]!;

/** The next era and what it still needs (null at Bloom). */
export function nextEra(city: City): { era: EraDef; needs: { label: string; have: number; need: number }[] } | null {
  const next = ERAS[city.charters.era + 1];
  if (!next) return null;
  const { tiers, golds } = tierCount(city);
  const needs = [
    { label: 'residents', have: Math.floor(city.stats.population), need: next.population },
    { label: 'charter tiers', have: tiers, need: next.tiers },
  ];
  if (next.golds) needs.push({ label: 'Gold charters', have: golds, need: next.golds });
  return { era: next, needs };
}

/** Once per pulse: steps into the next era once it is earned (one at a time). */
export function updateEras(city: City): void {
  const n = nextEra(city);
  if (!n || n.needs.some((x) => x.have < x.need)) return;
  const st = city.charters;
  st.era++;
  st.eraTick = city.tick;
  city.bus.emit('era:advanced', { era: st.era, id: n.era.id, name: n.era.name });
}

/** Ordinance slots now: the era's on a growing island, no limit on the showcase. */
export const policySlots = (city: City): number => (city.growth.progression ? eraOf(city).slots : Infinity);
