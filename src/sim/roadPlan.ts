import type { City } from './City';
import { NO_ENTITY, SEA_LEVEL } from './Grid';

/**
 * Highway planning (D-125): what a drag will actually lay, shared by the Build tool's preview and the `road` command,
 * so the preview never promises tiles the command then skips. It fixes the ways a bridge used to stop short of a bank:
 * - **Bank abutments**: a bank tile too steep for a highway (corners more than `SLOPE` apart) next to the crossing is
 *   filled up like an abutment, its low corners raised (at most `MAX_FILL`) so the road meets the bridge deck. Up to
 *   `ABUTMENT` tiles out from the water; corners touching a building, channel or another highway are left alone.
 * - **Landing**: a path that ends (or starts) over water runs on straight to the next land, up to `LAND_REACH`
 *   tiles, so a drag released just short of the far bank still lands on it.
 * - **The bend on land**: of the two L-shaped routes between the ends, the one that crosses less water (no bend in
 *   the river) and skips fewer tiles wins.
 * Every tile not laid says why (`skipped`), and a lack of credits stops the plan where the money runs out.
 */

/** Steepest a highway tile may be (corner range), as `City.canRoad`. */
export const SLOPE = 0.9;
/** How far a bank corner may be raised to make an abutment. */
export const MAX_FILL = 1.6;
/** Bank tiles graded on each side of a crossing. */
export const ABUTMENT = 3;
/** Tiles a path is carried on past its end over water to reach land. */
export const LAND_REACH = 4;

export type SkipReason = 'building' | 'channel' | 'steep' | 'credits';

export interface RoadPlan {
  /** Tiles that become highway (or bridge), in path order. */
  place: number[];
  /** Overgrown highway tiles on the path that a redraw clears. */
  clear: number[];
  /** Corner heights to write first (abutment fills). */
  grade: [number, number][];
  skipped: { tile: number; reason: SkipReason }[];
  /** Water tiles among `place`. */
  bridges: number;
  cost: number;
  /** The full path walked (with any landing extension). */
  path: number[];
}

export interface PlanCosts {
  road: number;
  bridge: number;
  clear: number;
}

/** L-shaped route from a to b; `xFirst` walks x then z. */
export function lPath(
  city: City,
  a: { x: number; z: number },
  b: { x: number; z: number },
  xFirst: boolean,
): number[] {
  const g = city.grid;
  const out: number[] = [];
  const sx = Math.sign(b.x - a.x);
  const sz = Math.sign(b.z - a.z);
  let x = a.x;
  let z = a.z;
  const push = () => g.inBounds(x, z) && out.push(g.index(x, z));
  push();
  const walkX = () => {
    while (x !== b.x) {
      x += sx;
      push();
    }
  };
  const walkZ = () => {
    while (z !== b.z) {
      z += sz;
      push();
    }
  };
  if (xFirst) {
    walkX();
    walkZ();
  } else {
    walkZ();
    walkX();
  }
  return out;
}

/** Carries a path on in its last (or first) direction while it ends over water, until it reaches land. */
function land(city: City, path: number[]): number[] {
  const g = city.grid;
  const water = (t: number) => city.isWaterTile(t % g.w, (t / g.w) | 0);
  const extend = (end: number, prev: number | undefined, atStart: boolean) => {
    if (prev === undefined || !water(end)) return [];
    const dx = (end % g.w) - (prev % g.w);
    const dz = ((end / g.w) | 0) - ((prev / g.w) | 0);
    if (Math.abs(dx) + Math.abs(dz) !== 1) return []; // Not a drawn path (scripted tile lists).
    const add: number[] = [];
    let x = end % g.w;
    let z = (end / g.w) | 0;
    for (let i = 0; i < LAND_REACH; i++) {
      x += dx;
      z += dz;
      if (!g.inBounds(x, z)) return [];
      const t = g.index(x, z);
      add.push(t);
      if (!water(t)) return atStart ? add.reverse() : add;
    }
    return []; // Open water ahead: leave the drag as drawn.
  };
  const n = path.length;
  if (n < 2) return path;
  return [...extend(path[0]!, path[1], true), ...path, ...extend(path[n - 1]!, path[n - 2], false)];
}

export function planRoad(
  city: City,
  path: number[],
  bridges: boolean,
  costs: PlanCosts,
  budget = city.credits,
): RoadPlan {
  const g = city.grid;
  const W = g.w + 1;
  const full = bridges ? land(city, path) : path;
  const og = g.layer<Uint8Array>('overgrowth');
  // Working heights: abutment fills are seen by the tiles evaluated after them.
  const edits = new Map<number, number>();
  const h = (c: number) => edits.get(c) ?? g.heights[c]!;
  const corners = (t: number) => {
    const x = t % g.w;
    const z = (t / g.w) | 0;
    const c = z * W + x;
    return [c, c + 1, c + W, c + W + 1];
  };
  const range = (t: number) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of corners(t)) {
      lo = Math.min(lo, h(c));
      hi = Math.max(hi, h(c));
    }
    return { lo, hi };
  };
  const water = (t: number) => range(t).lo < SEA_LEVEL + 0.05;
  const blocked = (t: number): SkipReason | null =>
    g.occupant[t] !== NO_ENTITY ? 'building' : city.channelAt(t) ? 'channel' : null;
  // A corner may move only if every tile around it is open ground (or this path's own tiles).
  const onPath = new Set(full);
  const free = (c: number) => {
    const cx = c % W;
    const cz = (c / W) | 0;
    for (const [x, z] of [
      [cx - 1, cz - 1],
      [cx, cz - 1],
      [cx - 1, cz],
      [cx, cz],
    ] as const) {
      if (!g.inBounds(x, z)) continue;
      const t = g.index(x, z);
      if (g.occupant[t] !== NO_ENTITY || city.channelAt(t) || (g.road[t] && !onPath.has(t))) return false;
    }
    return true;
  };
  /** Fills a steep tile's low corners up to the slope limit; false if it can't be done within the rules. */
  const abut = (t: number): boolean => {
    const { hi } = range(t);
    const floor = hi - SLOPE + 0.05;
    const set: [number, number][] = [];
    for (const c of corners(t)) {
      if (h(c) >= floor) continue;
      if (!free(c) || floor - g.heights[c]! > MAX_FILL) return false;
      set.push([c, floor]);
    }
    for (const [c, v] of set) edits.set(c, v);
    return true;
  };

  // Abutments: walk out from every water tile on the path, grading steep banks within reach.
  if (bridges)
    for (let i = 0; i < full.length; i++) {
      if (!water(full[i]!)) continue;
      for (const dir of [-1, 1]) {
        for (let k = 1; k <= ABUTMENT; k++) {
          const t = full[i + dir * k];
          if (t === undefined || water(t) || g.road[t] || blocked(t)) break;
          const { lo, hi } = range(t);
          if (hi - lo <= SLOPE) break; // Gentle: the road takes it as it is.
          if (!abut(t)) break;
        }
      }
    }

  const place: number[] = [];
  const clear: number[] = [];
  const skipped: RoadPlan['skipped'] = [];
  const seen = new Set<number>();
  let cost = 0;
  let nBridges = 0;
  let broke = false;
  for (const t of full) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (g.road[t]) {
      // Redrawing over an overgrown highway clears it.
      if (og && og[t]! > 0) {
        if (!broke && budget >= cost + costs.clear) {
          cost += costs.clear;
          clear.push(t);
        } else {
          broke = true;
          skipped.push({ tile: t, reason: 'credits' });
        }
      }
      continue;
    }
    const why = blocked(t);
    if (why) {
      skipped.push({ tile: t, reason: why });
      continue;
    }
    const wet = water(t);
    const steep = !wet && range(t).hi - range(t).lo > SLOPE;
    if (wet ? !bridges : steep) {
      skipped.push({ tile: t, reason: 'steep' });
      continue;
    }
    const c = wet ? costs.bridge : costs.road;
    if (broke || budget < cost + c) {
      broke = true;
      skipped.push({ tile: t, reason: 'credits' });
      continue;
    }
    cost += c;
    place.push(t);
    if (wet) nBridges++;
  }
  // Only grade corners under tiles that are actually laid.
  const laid = new Set(place);
  const grade = [...edits].filter(([c]) => full.some((t) => laid.has(t) && corners(t).includes(c)));
  return { place, clear, grade, skipped, bridges: nBridges, cost, path: full };
}

/** The better of the two L routes between a and b: least water crossed with a bend, then fewest skipped tiles. */
export function bestRoute(
  city: City,
  a: { x: number; z: number },
  b: { x: number; z: number },
  costs: PlanCosts,
): RoadPlan {
  const plans = [true, false].map((xFirst) =>
    planRoad(city, lPath(city, a, b, xFirst), true, costs, Infinity),
  );
  const g = city.grid;
  const score = (p: RoadPlan) => {
    // A bend over water reads badly (and bridges only span straight): penalise it heavily.
    const path = p.path;
    let bendWet = 0;
    for (let i = 1; i < path.length - 1; i++) {
      const d1 = path[i]! - path[i - 1]!;
      const d2 = path[i + 1]! - path[i]!;
      if (d1 !== d2 && city.isWaterTile(path[i]! % g.w, (path[i]! / g.w) | 0)) bendWet++;
    }
    return bendWet * 100 + p.skipped.length * 2 + p.bridges * 0.1;
  };
  const best = score(plans[1]!) < score(plans[0]!) ? plans[1]! : plans[0]!;
  // Re-plan the winner against the real budget.
  return planRoad(city, best.path, true, costs);
}
