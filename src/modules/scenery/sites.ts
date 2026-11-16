/** Where the sea wonders stand: deep sea clear of the coast for every seed (normalised map coordinates, see tests). */
export const WONDER_SITES = {
  lighthouse: [0.92, 0.08],
  tideGates: [0.14, 0.92],
  lotus: [0.45, 0.06],
  dome: [0.86, 0.92],
  stacks: [0.06, 0.24],
  colonnade: [0.95, 0.3],
  geode: [0.1, 0.06],
  turtle: [0.94, 0.8],
  whales: [
    [0.3, 0.94],
    [0.68, 0.05],
  ],
  /** Dolphin schools (shown with the whales). */
  dolphins: [
    [0.62, 0.95],
    [0.8, 0.05],
  ],
} as const;

/** Sites that are a single place (not the roaming pods). */
export type WonderSite = Exclude<keyof typeof WONDER_SITES, 'whales' | 'dolphins'>;

/**
 * Points the cruise ferry's courses keep clear of (a ring round every standing wonder, inside its sightseeing
 * loop), so a voyage to one wonder never sails through another.
 */
export function wonderObstacles(S: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [k, v] of Object.entries(WONDER_SITES)) {
    if (k === 'whales' || k === 'dolphins') continue;
    const [x, z] = [(v as readonly number[])[0]! * S, (v as readonly number[])[1]! * S];
    out.push([x, z]);
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      out.push([x + Math.cos(t) * 8, z + Math.sin(t) * 8]);
    }
  }
  return out;
}
