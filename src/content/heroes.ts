import type { BuildingDef } from './types';
import { HERO_IDS } from './scenarios/founding-city';

/**
 * Hero buildings: the designed one-of-a-kinds of the founding city's hero district (`QUARTERS`), the city's
 * landmarks, and the big set pieces placed on their own (the Aurora Gemini, Bloomtopia, Bloom Stadium). The Build
 * panel marks them, and explore modes offer their rooftops (`explore/roof.ts`). One list, so every surface agrees.
 */
const HEROES = new Set<string>([...HERO_IDS, 'aurora-gemini', 'bloomtopia', 'bloom-stadium']);

export function isHero(def: BuildingDef): boolean {
  return HEROES.has(def.id) || !!def.landmark;
}
