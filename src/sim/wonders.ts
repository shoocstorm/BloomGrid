import type { City } from './City';

/**
 * Sea wonders discovered over time (Phase 16, D-072). On a fresh island only the lighthouse and the whales are out
 * there; the others rise as the city earns them (days, residents, bloom, ecology, harmony). Discovery announces
 * itself and adds a little harmony (sightseeing). Without progression every wonder is already there.
 */
export interface WonderDef {
  /** Matches `WONDER_SITES` in `modules/scenery/sites.ts`. */
  id: string;
  name: string;
  /** What brings it (shown on the Goals tab). */
  hint: string;
  /** Present from the start. */
  start?: boolean;
  when?(city: City): boolean;
}

export const WONDERS: WonderDef[] = [
  { id: 'lighthouse', name: 'Tidewatch Lighthouse', hint: 'Always there', start: true },
  { id: 'whales', name: 'Whale pods', hint: 'Always there', start: true },
  {
    id: 'tideGates',
    name: 'Tide Gates',
    hint: '1,500 residents',
    when: (c) => c.stats.population >= 1500,
  },
  {
    id: 'lotus',
    name: 'Lotus Atoll',
    hint: 'Bloom index 55% or more from day 2',
    when: (c) => c.day >= 2 && c.pulse.bloomIndex >= 0.55,
  },
  {
    id: 'stacks',
    name: 'Verdant Pillars',
    hint: '40 buildings with a healthy ecology',
    when: (c) => c.stats.buildings >= 40 && c.stats.eco > 0,
  },
  {
    id: 'dome',
    name: 'Abyssal Dome',
    hint: 'Harmony 70+ from day 4',
    when: (c) => c.day >= 4 && c.stats.happiness >= 70,
  },
];

/** Whether a wonder shows: always without progression, else once discovered. */
export const wonderVisible = (city: City, id: string): boolean =>
  !city.growth.progression || city.growth.wonders.includes(id);

/** The wonders a fresh island starts with. */
export const startWonders = (): string[] => WONDERS.filter((w) => w.start).map((w) => w.id);

/** Every 10 pulses: discover wonders whose moment has come. */
export function updateWonders(city: City): void {
  const g = city.growth;
  if (!g.progression || city.pulse.count % 10 !== 0) return;
  for (const w of WONDERS) {
    if (g.wonders.includes(w.id) || !w.when?.(city)) continue;
    g.wonders.push(w.id);
    city.bus.emit('wonder:discovered', { id: w.id, name: w.name });
  }
}

/** Harmony from sightseeing: +0.8 per wonder discovered beyond the starting ones (max +4). */
export function wonderHarmony(city: City): number {
  const g = city.growth;
  if (!g.progression) return 0;
  return Math.min(4, Math.max(0, g.wonders.length - startWonders().length) * 0.8);
}
