import { query } from 'bitecs';
import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { City } from './City';
import { LABOUR_SHARE } from './pulseConst';

/** Commuters a highway tile carries per pulse before it starts to jam. */
export const TILE_CAPACITY = 55;
/** Congestion above which travel slows (load / capacity). */
const FREE_FLOW = 0.8;
const UNREACHED = 0xffff;
const MAX_STEPS = 600;

/** A sky-lane flown by commuter pods: dock → busiest job hub it serves (tile centres). */
export interface PodRoute {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  riders: number;
}

export interface MobilityLayers {
  /** Congestion per highway tile: commuters / `TILE_CAPACITY` (0 off-highway). */
  traffic: Float32Array;
  /** Flow field: highway steps to the nearest workplace (0xffff = none reachable). */
  dist: Uint16Array;
  /** Main commuter direction through each highway tile: the next tile (-1 = none). */
  next: Int32Array;
}

export function mobilityLayers(city: City): MobilityLayers {
  const g = city.grid;
  const n = g.w * g.h;
  return {
    traffic: g.addLayer('traffic', () => new Float32Array(n)),
    dist: g.addLayer('flowDist', () => new Uint16Array(n).fill(UNREACHED)),
    next: g.addLayer('flowNext', () => new Int32Array(n).fill(-1)),
  };
}

/** First highway tile on the footprint's perimeter (row-major, deterministic), or -1. */
export function accessTile(city: City, eid: number): number {
  const g = city.grid;
  const x0 = Building.x[eid]!;
  const z0 = Building.z[eid]!;
  const w = Building.w[eid]!;
  const d = Building.d[eid]!;
  for (let z = z0 - 1; z <= z0 + d; z++)
    for (let x = x0 - 1; x <= x0 + w; x++) {
      const edge = z === z0 - 1 || z === z0 + d || x === x0 - 1 || x === x0 + w;
      const corner = (z === z0 - 1 || z === z0 + d) && (x === x0 - 1 || x === x0 + w);
      if (!edge || corner || !g.inBounds(x, z)) continue;
      const i = g.index(x, z);
      if (g.road[i]) return i;
    }
  return -1;
}

let load = new Float32Array(0);
let arrive = new Float32Array(0);
let strongest = new Float32Array(0);
let jobsLeft = new Float32Array(0);
let rDist = new Uint16Array(0);
let rNext = new Int32Array(0);
let queue = new Int32Array(0);
let paths = new Int32Array(0);
/** Assignment rounds: each re-routes the overflow of full workplaces to the next-nearest ones. */
const ROUNDS = 4;

/**
 * Mobility pass (Phase 8, its own pulse phase). Commuters are assigned to workplaces in rounds:
 * a multi-source BFS from every workplace with free jobs builds a flow field over the highways,
 * each home's commuters walk it to the nearest one and fill its jobs; overflow tries again next
 * round against the workplaces still hiring, so dormitory districts commute further. Walked
 * tiles accumulate load; load / capacity is congestion, and jammed tiles slow every trip through
 * them. Pod Docks take a share of nearby commuters off the highways first and fly them along
 * sky-lanes to the busiest job hub. Deterministic: entity order, tile order, no randomness.
 */
export function computeMobility(city: City): void {
  const g = city.grid;
  const n = g.w * g.h;
  const { traffic, dist, next } = mobilityLayers(city);
  if (load.length < n) {
    load = new Float32Array(n);
    arrive = new Float32Array(n);
    strongest = new Float32Array(n);
    jobsLeft = new Float32Array(n);
    rDist = new Uint16Array(n);
    rNext = new Int32Array(n);
    queue = new Int32Array(n);
  }
  load.fill(0, 0, n);
  arrive.fill(0, 0, n);
  strongest.fill(0, 0, n);
  jobsLeft.fill(0, 0, n);
  next.fill(-1);

  // Workplaces (jobs pooled per access tile), homes and docks.
  const ents = query(city.world, [Building]);
  const homes: number[] = [];
  const hubTiles: number[] = [];
  const docks: { eid: number; cap: number; left: number; x: number; z: number }[] = [];
  for (const eid of ents) {
    const def = buildings.at(Building.def[eid]!);
    const st = def.stats;
    if (st.population > 0) homes.push(eid);
    Service.riders[eid] = 0;
    if (Service.network[eid]! < 0) continue;
    if (def.transit) {
      // A dock carries riders in proportion to its power and crew.
      const cap = def.transit.riders * Service.power[eid]! * Math.max(0.3, Service.occupancy[eid]!);
      docks.push({ eid, cap, left: cap, x: Building.x[eid]! + Building.w[eid]! / 2, z: Building.z[eid]! + Building.d[eid]! / 2 });
    }
    if (st.jobs <= 0 || st.population > 0 || Service.occupancy[eid]! <= 0.05) continue;
    const at = accessTile(city, eid);
    if (at < 0) continue;
    if (jobsLeft[at] === 0) hubTiles.push(at);
    jobsLeft[at] += st.jobs;
  }

  // Commuters per home; pods first (within reach of a dock), the rest by highway.
  const employed = 1 - city.pulse.unemployment;
  const starts: number[] = [];
  const left: number[] = [];
  let commuters = 0;
  let podRiders = 0;
  for (const eid of homes) {
    let c = buildings.at(Building.def[eid]!).stats.population * Service.occupancy[eid]! * LABOUR_SHARE * employed;
    if (c <= 0) continue;
    commuters += c;
    const hx = Building.x[eid]! + Building.w[eid]! / 2;
    const hz = Building.z[eid]! + Building.d[eid]! / 2;
    for (const dk of docks) {
      if (dk.left <= 0) continue;
      const r = buildings.at(Building.def[dk.eid]!).transit!.radius;
      if ((dk.x - hx) ** 2 + (dk.z - hz) ** 2 > r * r) continue;
      const take = Math.min(dk.left, c * 0.6);
      dk.left -= take;
      c -= take;
      podRiders += take;
    }
    const at = accessTile(city, eid);
    if (at < 0 || c <= 0) continue;
    starts.push(at);
    left.push(c);
  }

  // Assignment rounds. Trips are recorded as (offset, length, count) into `paths` for timing.
  let head: number;
  let tail = 0;
  let from = 0;
  let step = 0;
  const visit = (i: number) => {
    if (!g.road[i] || rDist[i]! <= step) return;
    rDist[i] = step;
    rNext[i] = from;
    queue[tail++] = i;
  };
  const trips: number[] = [];
  let used = 0;
  let byRoad = 0;
  for (let round = 0; round < ROUNDS; round++) {
    rDist.fill(UNREACHED, 0, n);
    rNext.fill(-1, 0, n);
    head = tail = 0;
    for (const at of hubTiles)
      if (jobsLeft[at]! > 0.5) {
        rDist[at] = 0;
        queue[tail++] = at;
      }
    if (!tail) break;
    while (head < tail) {
      from = queue[head++]!;
      step = rDist[from]! + 1;
      const x = from % g.w;
      const z = (from / g.w) | 0;
      // Fixed neighbour order (N, E, S, W) keeps ties deterministic.
      if (z > 0) visit(from - g.w);
      if (x < g.w - 1) visit(from + 1);
      if (z < g.h - 1) visit(from + g.w);
      if (x > 0) visit(from - 1);
    }
    if (round === 0) dist.set(rDist.subarray(0, n));
    let moved = 0;
    for (let k = 0; k < starts.length; k++) {
      const c0 = left[k]!;
      if (c0 <= 0.5 || rDist[starts[k]!] === UNREACHED) continue;
      // Find the workplace this home reaches first, then send as many as it still hires.
      let t = starts[k]!;
      let len = 1;
      while (rDist[t] !== 0 && len < MAX_STEPS) {
        t = rNext[t]!;
        len++;
      }
      const c = Math.min(c0, jobsLeft[t]!);
      if (c <= 0.5) continue;
      jobsLeft[t] -= c;
      left[k] = c0 - c;
      arrive[t] += c;
      byRoad += c;
      moved += c;
      if (paths.length < used + len) {
        const grown = new Int32Array(Math.max(used + len, paths.length * 2, 4096));
        grown.set(paths.subarray(0, used));
        paths = grown;
      }
      trips.push(used, len, c);
      t = starts[k]!;
      for (let s = 0; s < len; s++) {
        paths[used++] = t;
        load[t] += c;
        // Agents follow the direction most commuters take through each tile.
        if (c > strongest[t]!) {
          strongest[t] = c;
          next[t] = rNext[t]!;
        }
        t = rNext[t]!;
      }
    }
    if (moved <= 0.5) break;
  }
  for (let i = 0; i < n; i++) traffic[i] = g.road[i] ? load[i]! / TILE_CAPACITY : 0;

  // Travel time: every jammed tile on the way slows the trip.
  let free = 0;
  let actual = 0;
  for (let k = 0; k < trips.length; k += 3) {
    const off = trips[k]!;
    const len = trips[k + 1]!;
    const c = trips[k + 2]!;
    let time = 0;
    for (let s = 0; s < len; s++) time += 1 + 3 * Math.max(0, traffic[paths[off + s]!]! - FREE_FLOW);
    free += len * c;
    actual += time * c;
  }

  // 4. Sky-lanes: each dock flies to the busiest hub within reach, weighted against distance.
  const hubs: number[] = [];
  for (let i = 0; i < n; i++) if (arrive[i]! > 0) hubs.push(i);
  const routes: PodRoute[] = [];
  for (const dk of docks) {
    const riders = dk.cap - dk.left;
    Service.riders[dk.eid] = riders;
    if (riders <= 0) continue;
    let best = -1;
    let score = 0;
    for (const hb of hubs) {
      const dd = Math.hypot((hb % g.w) + 0.5 - dk.x, ((hb / g.w) | 0) + 0.5 - dk.z);
      if (dd < 8 || dd > 70) continue;
      const sc = arrive[hb]! / (1 + dd / 30);
      if (sc > score) {
        score = sc;
        best = hb;
      }
    }
    if (best < 0) continue;
    routes.push({ ax: dk.x, az: dk.z, bx: (best % g.w) + 0.5, bz: ((best / g.w) | 0) + 0.5, riders });
  }

  const p = city.pulse;
  p.commuters = commuters;
  p.podRiders = podRiders;
  p.avgCommute = byRoad > 0 ? free / byRoad : 0;
  // Flow quality: 1 = free-flowing; 0.5 = trips take twice as long as they would on empty highways.
  p.flow = free > 0 ? Math.min(1, free / actual) : 1;
  p.podRoutes = routes;
}
