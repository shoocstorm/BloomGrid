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

// ── Smart routing (D-202): snapping to the network, routing round obstacles, one-click links ─────────────────

/** A drag's end this close (tiles, Manhattan) to an existing highway snaps onto it, so the new road joins. */
export const SNAP = 3;
/** A single click links that spot to the nearest highway within this many tiles. */
export const LINK_REACH = 24;
/** Extra room round a drag's box that a detour may use. */
const DETOUR = 16;

const isRoad = (city: City, t: number) => city.grid.road[t]! > 0;

/**
 * The highway tile nearest `p` within `SNAP` (ties: in line with `toward`, so the join runs straight), or `p` itself
 * when it is already highway or none is near.
 */
export function snapToRoad(
  city: City,
  p: { x: number; z: number },
  toward?: { x: number; z: number },
  reach = SNAP,
): { x: number; z: number; snapped: boolean } {
  const g = city.grid;
  if (!g.inBounds(p.x, p.z) || isRoad(city, g.index(p.x, p.z))) return { ...p, snapped: false };
  let best: { x: number; z: number } | null = null;
  let bestScore = Infinity;
  for (let dz = -reach; dz <= reach; dz++)
    for (let dx = -reach; dx <= reach; dx++) {
      const d = Math.abs(dx) + Math.abs(dz);
      if (d === 0 || d > reach) continue;
      const x = p.x + dx;
      const z = p.z + dz;
      if (!g.inBounds(x, z) || !isRoad(city, g.index(x, z))) continue;
      const inLine = toward && (x === toward.x || z === toward.z) ? 0 : 0.5;
      const score = d + inLine;
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
  return best ? { ...best, snapped: true } : { ...p, snapped: false };
}

/** Binary min-heap of [priority, value] for the router. */
class Heap {
  private p: number[] = [];
  private v: number[] = [];
  get size() {
    return this.v.length;
  }
  push(pri: number, val: number) {
    const { p, v } = this;
    let i = v.length;
    p.push(pri);
    v.push(val);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up]! <= pri) break;
      p[i] = p[up]!;
      v[i] = v[up]!;
      i = up;
    }
    p[i] = pri;
    v[i] = val;
  }
  pop(): number {
    const { p, v } = this;
    const top = v[0]!;
    const lp = p.pop()!;
    const lv = v.pop()!;
    const n = v.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && p[c + 1]! < p[c]!) c++;
        if (p[c]! >= lp) break;
        p[i] = p[c]!;
        v[i] = v[c]!;
        i = c;
      }
      p[i] = lp;
      v[i] = lv;
    }
    return top;
  }
}

const DX = [1, -1, 0, 0];
const DZ = [0, 0, 1, -1];

/**
 * A highway route from `a` to the nearest goal tile (A*, 4-connected), round buildings, channels and slopes too
 * steep for a highway. Existing highway is cheap to follow, water costs more (a bridge) and may not bend, and every
 * turn costs a little, so routes come out straight and join the network where they can. `goal` is a target tile or,
 * with `toRoad`, any highway tile. Null when nothing is reachable inside the search box.
 */
export function routeRoad(
  city: City,
  a: { x: number; z: number },
  b: { x: number; z: number } | null,
  opts: { toRoad?: boolean; reach?: number } = {},
): number[] | null {
  const g = city.grid;
  if (!g.inBounds(a.x, a.z)) return null;
  const pad = opts.reach ?? DETOUR;
  const x0 = Math.max(0, Math.min(a.x, b?.x ?? a.x) - pad);
  const z0 = Math.max(0, Math.min(a.z, b?.z ?? a.z) - pad);
  const x1 = Math.min(g.w - 1, Math.max(a.x, b?.x ?? a.x) + pad);
  const z1 = Math.min(g.h - 1, Math.max(a.z, b?.z ?? a.z) + pad);
  const bw = x1 - x0 + 1;
  const bh = z1 - z0 + 1;
  const N = bw * bh;
  const goalAt = (x: number, z: number) =>
    opts.toRoad ? isRoad(city, g.index(x, z)) && (x !== a.x || z !== a.z) : !!b && x === b.x && z === b.z;
  const hEst = (x: number, z: number) => (b && !opts.toRoad ? Math.abs(b.x - x) + Math.abs(b.z - z) : 0);
  // Per tile: how a highway takes it (0 blocked, 1 land, 2 water, 3 existing highway).
  const kind = new Uint8Array(N);
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const t = g.index(x, z);
      const k = (z - z0) * bw + (x - x0);
      if (isRoad(city, t)) kind[k] = 3;
      else if (g.occupant[t] !== NO_ENTITY || city.channelAt(t)) kind[k] = 0;
      else {
        const { min, max } = g.rangeOver(x, z, 1, 1);
        kind[k] = min < SEA_LEVEL + 0.05 ? 2 : max - min <= SLOPE ? 1 : 0;
      }
    }
  const start = (a.z - z0) * bw + (a.x - x0);
  // State = tile * 4 + direction of arrival.
  const cost = new Float32Array(N * 4).fill(Infinity);
  const from = new Int32Array(N * 4).fill(-1);
  const heap = new Heap();
  for (let d = 0; d < 4; d++) {
    cost[start * 4 + d] = 0;
    heap.push(hEst(a.x, a.z), start * 4 + d);
  }
  const done = new Uint8Array(N * 4);
  let end = -1;
  let budget = 200_000;
  while (heap.size && budget-- > 0) {
    const s = heap.pop();
    if (done[s]) continue;
    done[s] = 1;
    const k = s >> 2;
    const dir = s & 3;
    const x = (k % bw) + x0;
    const z = ((k / bw) | 0) + z0;
    if (goalAt(x, z) && k !== start) {
      end = s;
      break;
    }
    const wetHere = kind[k] === 2;
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + DX[nd]!;
      const nz = z + DZ[nd]!;
      if (nx < x0 || nx > x1 || nz < z0 || nz > z1) continue;
      const nk = (nz - z0) * bw + (nx - x0);
      const kk = kind[nk]!;
      if (!kk) continue;
      const turn = k !== start && nd !== dir;
      // Bridges only span straight: no bend on or into water.
      if (turn && wetHere) continue;
      const step = kk === 3 ? 0.35 : kk === 2 ? 2.5 : 1;
      const c = cost[s]! + step + (turn ? 0.6 : 0);
      const ns = nk * 4 + nd;
      if (c < cost[ns]!) {
        cost[ns] = c;
        from[ns] = s;
        heap.push(c + hEst(nx, nz), ns);
      }
    }
  }
  if (end < 0) return null;
  const out: number[] = [];
  for (let s = end; s >= 0; s = from[s]!) {
    const k = s >> 2;
    const t = g.index((k % bw) + x0, ((k / bw) | 0) + z0);
    if (out[out.length - 1] !== t) out.push(t);
    if (k === start) break;
  }
  return out.reverse();
}

/** What a drag (or a click, when `a` equals `b`) on the highway tool will lay (D-202). */
export interface SmartRoad {
  plan: RoadPlan;
  /** How the route was found, for the tooltip. */
  via: 'drag' | 'detour' | 'link';
  /** Ends that snapped onto the existing network. */
  joins: number;
}

/**
 * The highway tool's planner (D-202): ends near the network snap onto it; a straight or L route that runs into
 * buildings, channels or cliffs gives way to a routed one round them; a click on its own links that spot to the
 * nearest highway. The preview and the command share it, so what shows is what is laid.
 */
export function smartRoute(
  city: City,
  a: { x: number; z: number },
  b: { x: number; z: number },
  costs: PlanCosts,
): SmartRoad {
  const g = city.grid;
  if (a.x === b.x && a.z === b.z) {
    const t = g.inBounds(a.x, a.z) ? g.index(a.x, a.z) : -1;
    if (t >= 0 && !isRoad(city, t)) {
      const link = routeRoad(city, a, null, { toRoad: true, reach: LINK_REACH });
      if (link && link.length > 1) return { plan: planRoad(city, link, true, costs), via: 'link', joins: 1 };
    }
    return { plan: planRoad(city, t >= 0 ? [t] : [], true, costs), via: 'drag', joins: 0 };
  }
  // Snap the ends onto nearby highway, unless that mostly retraces it (a road drawn beside another stays put).
  const sa = snapToRoad(city, a, b);
  const sb = snapToRoad(city, b, a);
  const plain = bestRoute(city, a, b, costs);
  const options: [{ x: number; z: number }, { x: number; z: number }, number][] = [];
  if (sa.snapped && sb.snapped) options.push([sa, sb, 2]);
  if (sb.snapped) options.push([a, sb, 1]);
  if (sa.snapped) options.push([sa, b, 1]);
  let straight = plain;
  let from = a;
  let to = b;
  let joins = 0;
  for (const [p, q, n] of options) {
    const plan = bestRoute(city, p, q, costs);
    if (plan.place.length + plan.clear.length >= Math.max(1, 0.6 * (plain.place.length + plain.clear.length))) {
      straight = plan;
      from = p;
      to = q;
      joins = n;
      break;
    }
  }
  const hard = straight.skipped.some((s) => s.reason !== 'credits');
  if (!hard) return { plan: straight, via: 'drag', joins };
  const path = routeRoad(city, from, to);
  if (path) {
    const routed = planRoad(city, path, true, costs);
    const blocks = (p: RoadPlan) => p.skipped.filter((s) => s.reason !== 'credits').length;
    if (blocks(routed) < blocks(straight)) return { plan: routed, via: 'detour', joins };
  }
  return { plan: straight, via: 'drag', joins };
}

/** Whether a plan's new tiles touch the existing highway network (or there is none yet). */
export function joinsNetwork(city: City, plan: RoadPlan): boolean {
  const g = city.grid;
  if (!city.roadCount) return true;
  const mine = new Set(plan.place);
  for (const t of plan.place) {
    const x = t % g.w;
    const z = (t / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]!;
      const nz = z + DZ[d]!;
      if (!g.inBounds(nx, nz)) continue;
      const n = g.index(nx, nz);
      if (isRoad(city, n) && !mine.has(n)) return true;
    }
  }
  return plan.place.length === 0;
}
