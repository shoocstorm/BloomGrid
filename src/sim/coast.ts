import { query } from 'bitecs';
import { Building } from '@/ecs/components';
import { buildings } from '@/content';
import { NO_ENTITY, SEA_LEVEL } from './Grid';
import type { City } from './City';
import { DAY_LENGTH } from './pulseConst';
import { DIFFICULTIES } from './difficulty';

/** Ground height of reclaimed land: above any sea-level rise a preset allows. */
export const RECLAIM_HEIGHT = 1.0;
/** Deepest seabed that can be reclaimed (the shallow coastal shelf). */
export const RECLAIM_MAX_DEPTH = 4.5;
export const RECLAIM_MAX_TILES = 400;
/** Sea-level rise starts after this many sim days and reaches the preset's cap over RISE_DAYS. */
const RISE_START_DAY = 3;
const RISE_DAYS = 12;

/**
 * Coast & climate (Phase 10). Sea level rises slowly over a game (difficulty-capped), raising the
 * water and drowning low coast unless Mangrove Seawalls protect it; king tides and monsoon floods
 * stack on top. The steward can reclaim the shallow shelf as new land. Terrain edits are stored
 * as corner overrides on top of the generated terrain so saves stay small.
 */
export function updateSeaRise(city: City): void {
  const st = city.steward;
  if (!st.autoCrises) return;
  const cap = DIFFICULTIES[st.difficulty].seaRise;
  const days = city.tick / 10 / DAY_LENGTH;
  if (days < RISE_START_DAY || st.seaRise >= cap) return;
  const prev = st.seaRise;
  st.seaRise = Math.min(cap, st.seaRise + cap / (RISE_DAYS * DAY_LENGTH));
  // Announce every 0.1 world units.
  if (Math.floor(prev * 10) !== Math.floor(st.seaRise * 10)) city.bus.emit('sea:rise', { level: st.seaRise });
}

/** True for water tiles connected to the map edge (the sea), not reservoirs or the inland river. */
export function seaMask(city: City): Uint8Array {
  const g = city.grid;
  const n = g.w * g.h;
  const mask = new Uint8Array(n);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const water = (i: number) => g.rangeOver(i % g.w, (i / g.w) | 0, 1, 1).min < SEA_LEVEL + 0.05;
  for (let x = 0; x < g.w; x++)
    for (const z of [0, g.h - 1]) {
      const i = g.index(x, z);
      if (!mask[i] && water(i)) {
        mask[i] = 1;
        q[tail++] = i;
      }
    }
  for (let z = 0; z < g.h; z++)
    for (const x of [0, g.w - 1]) {
      const i = g.index(x, z);
      if (!mask[i] && water(i)) {
        mask[i] = 1;
        q[tail++] = i;
      }
    }
  while (head < tail) {
    const t = q[head++]!;
    const x = t % g.w;
    const z = (t / g.w) | 0;
    for (const i of [z > 0 ? t - g.w : -1, x < g.w - 1 ? t + 1 : -1, z < g.h - 1 ? t + g.w : -1, x > 0 ? t - 1 : -1])
      if (i >= 0 && !mask[i] && water(i)) {
        mask[i] = 1;
        q[tail++] = i;
      }
  }
  return mask;
}

export interface ReclaimPlan {
  tiles: number[];
  cost: number;
  /** Why nothing can be reclaimed, if so. */
  reason?: string;
}

/**
 * Sea tiles in the rectangle that can become land: shallow enough, free of highways and channels,
 * and connected to existing land through the selection (so islands of fill can't float offshore).
 */
export function reclaimPlan(city: City, x0: number, z0: number, x1: number, z1: number, sea = seaMask(city)): ReclaimPlan {
  const g = city.grid;
  const ax = Math.max(0, Math.min(x0, x1));
  const bx = Math.min(g.w - 1, Math.max(x0, x1));
  const az = Math.max(0, Math.min(z0, z1));
  const bz = Math.min(g.h - 1, Math.max(z0, z1));
  if ((bx - ax + 1) * (bz - az + 1) > RECLAIM_MAX_TILES * 2) return { tiles: [], cost: 0, reason: 'Selection too large' };
  const ch = g.layer<Uint8Array>('channel');
  const ok = (i: number) => sea[i] && !g.road[i] && !(ch && ch[i]) && g.occupant[i] === NO_ENTITY && g.rangeOver(i % g.w, (i / g.w) | 0, 1, 1).min > -RECLAIM_MAX_DEPTH;
  const land = (x: number, z: number) => g.inBounds(x, z) && !sea[g.index(x, z)];
  // Grow from tiles touching land, inside the rectangle.
  const picked = new Set<number>();
  const q: number[] = [];
  for (let z = az; z <= bz; z++)
    for (let x = ax; x <= bx; x++) {
      const i = g.index(x, z);
      if (ok(i) && (land(x - 1, z) || land(x + 1, z) || land(x, z - 1) || land(x, z + 1))) {
        picked.add(i);
        q.push(i);
      }
    }
  while (q.length && picked.size < RECLAIM_MAX_TILES) {
    const t = q.shift()!;
    const x = t % g.w;
    const z = (t / g.w) | 0;
    for (const [nx, nz] of [
      [x, z - 1],
      [x + 1, z],
      [x, z + 1],
      [x - 1, z],
    ] as const) {
      if (nx < ax || nx > bx || nz < az || nz > bz) continue;
      const i = g.index(nx, nz);
      if (picked.has(i) || !ok(i)) continue;
      picked.add(i);
      q.push(i);
    }
  }
  const tiles = [...picked].sort((a, b) => a - b);
  let cost = 0;
  for (const t of tiles) cost += 30 + Math.max(0, -g.rangeOver(t % g.w, (t / g.w) | 0, 1, 1).min) * 18;
  return { tiles, cost: Math.round(cost), reason: tiles.length ? undefined : 'No shallow sea next to land here' };
}

/** Corner indices of a set of tiles. */
export function cornersOf(city: City, tiles: number[]): number[] {
  const g = city.grid;
  const W = g.w + 1;
  const out = new Set<number>();
  for (const t of tiles) {
    const x = t % g.w;
    const z = (t / g.w) | 0;
    out.add(z * W + x).add(z * W + x + 1).add((z + 1) * W + x).add((z + 1) * W + x + 1);
  }
  return [...out].sort((a, b) => a - b);
}

/** Writes corner heights, records them as terrain edits and refreshes everything derived. */
export function setCorners(city: City, corners: [number, number][]): void {
  const g = city.grid;
  const W = g.w + 1;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [c, h] of corners) {
    g.heights[c] = h;
    city.terrainEdits.set(c, h);
    const x = c % W;
    const z = (c / W) | 0;
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  if (!corners.length) return;
  city.refreshTerrainDerived();
  city.bus.emit('terrain:changed', { x0: Math.max(0, x0 - 1), z0: Math.max(0, z0 - 1), x1: Math.min(g.w, x1 + 1), z1: Math.min(g.h, z1 + 1) });
}

/** Seawalls: buildings with `defence` keep flood water out within their radius up to a height. */
export function defenceList(city: City): { x: number; z: number; r: number; height: number }[] {
  const out: { x: number; z: number; r: number; height: number }[] = [];
  for (const eid of query(city.world, [Building])) {
    const d = buildings.at(Building.def[eid]!).defence;
    if (d) out.push({ x: Building.x[eid]! + Building.w[eid]! / 2, z: Building.z[eid]! + Building.d[eid]! / 2, r: d.radius, height: d.height });
  }
  return out;
}

export function isProtected(defences: ReturnType<typeof defenceList>, x: number, z: number, level: number): boolean {
  for (const d of defences) if (level <= d.height && (d.x - x) ** 2 + (d.z - z) ** 2 <= d.r * d.r) return true;
  return false;
}

/** Buildings below the given water level that no seawall protects (for the advisor / HUD). */
export function atRisk(city: City, level: number): { count: number; focus?: { x: number; z: number; eid: number } } {
  if (level <= 0) return { count: 0 };
  const defences = defenceList(city);
  let count = 0;
  let focus: { x: number; z: number; eid: number } | undefined;
  for (const eid of query(city.world, [Building])) {
    const d = buildings.at(Building.def[eid]!);
    if (d.floodproof || d.defence) continue;
    const cx = Building.x[eid]! + Building.w[eid]! / 2;
    const cz = Building.z[eid]! + Building.d[eid]! / 2;
    if (city.grid.rangeOver(Building.x[eid]!, Building.z[eid]!, Building.w[eid]!, Building.d[eid]!).min >= level) continue;
    if (isProtected(defences, cx, cz, level)) continue;
    count++;
    focus ??= { x: cx, z: cz, eid };
  }
  return { count, focus };
}
