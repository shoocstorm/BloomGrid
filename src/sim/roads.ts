import type { CommandStack } from '@/core/Commands';
import type { City } from './City';
import type { SimCtx } from './systems';
import { fnv1a } from './random';

/**
 * Highway levels (D-096). A new highway is a **raw track** (packed earth and gravel: cheap, slow, unlit); traffic
 * wears it in and the city paves it into a **Living Highway** (turf lanes, glowing guidelines); a busy highway
 * grows into a **Bloom Boulevard** (planted verges, street trees, lamps, more lanes). Each level carries more
 * commuters before it jams. The steward can also pay to upgrade a stretch at once.
 *
 * Per-tile layers `roadLevel` (0..2) and `roadWear` (0..255 progress to the next level), saved and hashed.
 * Wear builds every `STEP` pulses on tiles busy enough for their level; full wear raises the level for free.
 */

export const ROAD_LEVEL_NAMES = ['Raw track', 'Living Highway', 'Bloom Boulevard'] as const;
export const MAX_ROAD_LEVEL = 2;
/** Commuter capacity per level (× TILE_CAPACITY). */
export const ROAD_CAPACITY = [0.75, 1, 1.6] as const;
/** Credits per tile to upgrade to level 1 / level 2. */
export const ROAD_UPGRADE_COST = [0, 8, 18] as const;
/** Traffic (load / capacity) a tile needs before it wears toward the next level. */
const WEAR_TRAFFIC = [0.08, 0.5] as const;
/** Wear per wearing pass (every STEP pulses): raw roads pave in ~2.5 sim minutes of use, boulevards in ~6. */
const WEAR_STEP = [16, 7] as const;
const STEP = 5;

export const roadLevels = (city: City): Uint8Array => city.grid.addLayer('roadLevel', (n) => new Uint8Array(n));
export const roadWear = (city: City): Uint8Array => city.grid.addLayer('roadWear', (n) => new Uint8Array(n));

/** Commuter capacity per bridge level (Standard, Lantern, Grand; D-128). */
export const BRIDGE_CAPACITY = [1, 1.4, 1.9] as const;

/** Capacity multiplier of a highway tile (a bridge deck by its bridge level, D-128). */
export function roadCapacity(city: City, t: number): number {
  const l = roadLevels(city)[t]!;
  return city.grid.road[t] === 2 ? BRIDGE_CAPACITY[Math.min(2, l)]! : ROAD_CAPACITY[l]!;
}

/** Sets levels (and clears wear) on tiles, and tells the renderers. */
export function setRoadLevels(city: City, pairs: readonly (readonly [number, number])[], emit = true): void {
  const lv = roadLevels(city);
  const wear = roadWear(city);
  for (const [t, l] of pairs) {
    lv[t] = Math.max(0, Math.min(MAX_ROAD_LEVEL, l));
    wear[t] = 0;
  }
  if (emit && pairs.length) city.bus.emit('road:level', { tiles: pairs.map(([t]) => t) });
}

/** Every STEP pulses: busy tiles wear in, and those at full wear move up a level. */
export function updateRoadLevels(city: City): void {
  if (city.pulse.count % STEP !== 0) return;
  const traffic = city.grid.layer<Float32Array>('traffic');
  if (!traffic) return;
  const g = city.grid;
  const lv = roadLevels(city);
  const wear = roadWear(city);
  const og = g.layer<Uint8Array>('overgrowth');
  const up: [number, number][] = [];
  for (let t = 0; t < g.road.length; t++) {
    if (g.road[t] !== 1) continue;
    const l = lv[t]!;
    if (l >= MAX_ROAD_LEVEL || (og && og[t]! > 0)) continue;
    if (traffic[t]! < WEAR_TRAFFIC[l]!) continue;
    const w = wear[t]! + WEAR_STEP[l]!;
    if (w >= 255) up.push([t, l + 1]);
    else wear[t] = w;
  }
  if (up.length) setRoadLevels(city, up);
}

/** Highway tiles of the same level connected to `tile` (breadth first, nearest first), at most `max`. */
export function roadStretch(city: City, tile: number, max = 30): number[] {
  const g = city.grid;
  if (!g.road[tile]) return [];
  const lv = roadLevels(city);
  const level = lv[tile]!;
  const out: number[] = [tile];
  const seen = new Set(out);
  for (let i = 0; i < out.length && out.length < max; i++) {
    const t = out[i]!;
    const x = t % g.w;
    const z = (t / g.w) | 0;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const [nx, nz] = [x + dx, z + dz];
      if (!g.inBounds(nx, nz)) continue;
      const n = g.index(nx, nz);
      if (seen.has(n) || g.road[n] !== 1 || lv[n] !== level) continue;
      seen.add(n);
      out.push(n);
      if (out.length >= max) break;
    }
  }
  return out;
}

/** Credits to raise these tiles one level each (tiles already at the top are free and skipped). */
export function upgradeCost(city: City, tiles: readonly number[]): number {
  const lv = roadLevels(city);
  let c = 0;
  for (const t of tiles) if (city.grid.road[t] === 1 && lv[t]! < MAX_ROAD_LEVEL) c += ROAD_UPGRADE_COST[lv[t]! + 1]!;
  return c;
}

/** Levels of a set of tiles: [raw, paved, boulevard] counts. */
export function levelCounts(city: City, tiles: Iterable<number>): [number, number, number] {
  const lv = roadLevels(city);
  const n: [number, number, number] = [0, 0, 0];
  for (const t of tiles) if (city.grid.road[t] === 1) n[lv[t]! as 0 | 1 | 2]++;
  return n;
}

export function roadLevelHash(city: City): string {
  const lv = city.grid.layer<Uint8Array>('roadLevel');
  const wear = city.grid.layer<Uint8Array>('roadWear');
  if (!lv) return fnv1a('');
  let s = '';
  for (let t = 0; t < lv.length; t++) if (city.grid.road[t] && (lv[t] || wear?.[t])) s += `${t}:${lv[t]}:${wear?.[t] ?? 0},`;
  return fnv1a(s);
}

export interface UpgradeRoadPayload {
  tiles: number[];
}

export function registerRoadCommands(stack: CommandStack<SimCtx>): void {
  // Raises each tile one level (paying per tile, in order, while credits last). Undo restores levels and wear.
  stack.register<UpgradeRoadPayload, { prev: [number, number, number][]; cost: number }>('upgradeRoad', {
    apply({ city }, p) {
      const lv = roadLevels(city);
      const wear = roadWear(city);
      const prev: [number, number, number][] = [];
      let cost = 0;
      for (const t of new Set(p.tiles)) {
        if (city.grid.road[t] !== 1 || lv[t]! >= MAX_ROAD_LEVEL) continue;
        const c = ROAD_UPGRADE_COST[lv[t]! + 1]!;
        if (city.credits < cost + c) break;
        cost += c;
        prev.push([t, lv[t]!, wear[t]!]);
      }
      if (!prev.length) return null;
      city.credits -= cost;
      setRoadLevels(city, prev.map(([t, l]) => [t, l + 1]));
      return { prev, cost };
    },
    revert({ city }, _p, u) {
      const lv = roadLevels(city);
      const wear = roadWear(city);
      for (const [t, l, w] of u.prev) {
        lv[t] = l;
        wear[t] = w;
      }
      city.credits += u.cost;
      city.bus.emit('road:level', { tiles: u.prev.map(([t]) => t) });
    },
  });
}
