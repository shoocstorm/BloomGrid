import { query } from 'bitecs';
import { Building } from '@/ecs/components';
import type { BuildingCategory, ZoneKind } from '@/content/types';
import { hash2 } from './random';
import type { City, District } from './City';
import { OUTSKIRTS_KEY } from './approvalState';
import { PULSE_TICKS } from './pulseConst';

/**
 * Districts that name themselves (D-242). On a growing island (progression) the player builds out from the
 * hamlet into open country, which used to stay "Outskirts" for ever. Every few pulses this pass:
 *
 * 1. **grows** a district over new buildings just outside its edge (within `GROW_REACH`), as long as it stays
 *    under `MAX_SIDE` and does not run into another district;
 * 2. **founds** a district for each cluster of at least `MIN_BUILDINGS` outskirts buildings (centres within
 *    `LINK` tiles of each other), its rectangle the cluster's footprints padded by `PAD` and trimmed off any
 *    district it would overlap, its zone the cluster's main use and its name drawn from the zone's and the
 *    ground's word lists by a hash of the spot (never `city.rng`, so the rest of the sim's stream is untouched).
 *
 * Districts are already saved and hashed with their rectangles, so nothing new is stored. Founded and grown
 * districts emit `district:named` for the HUD. Pure sim: deterministic from the city state.
 */

export const NAMING_EVERY = 5; // pulses
export const MIN_BUILDINGS = 4;
export const LINK = 9;
export const PAD = 3;
export const GROW_REACH = 6;
export const MAX_SIDE = 44;

const ZONE_OF: Record<BuildingCategory, ZoneKind> = {
  residential: 'living',
  commercial: 'work',
  tech: 'work',
  industry: 'industry',
  energy: 'utility',
  utility: 'utility',
  food: 'utility',
  sports: 'sports',
  nature: 'parks',
};

/** First words: soft, solarpunk, a little coastal. */
const ROOTS = [
  'Fern', 'Coral', 'Willow', 'Sunreach', 'Tidepool', 'Moss', 'Lantern', 'Saltmeadow', 'Brightwater', 'Kelp',
  'Amber', 'Heron', 'Lotus', 'Cedar', 'Driftwood', 'Marigold', 'Sorrel', 'Juniper', 'Seaglass', 'Clover',
  'Bramble', 'Larkspur', 'Mangrove', 'Honey', 'Pebble', 'Glimmer', 'Rowan', 'Starfern', 'Wren', 'Copper',
  'Sage', 'Thistle', 'Mistral', 'Dawn', 'Orchid', 'Alder', 'Verdigris', 'Petal', 'Reed', 'Halcyon',
];

const SUFFIXES: Record<ZoneKind, string[]> = {
  living: ['Gardens', 'Commons', 'Terraces', 'Row', 'Hollow', 'Green', 'Court'],
  work: ['Quarter', 'Exchange', 'Market', 'Arcade', 'Yards'],
  industry: ['Works', 'Foundry', 'Yards', 'Forge'],
  leisure: ['Promenade', 'Lights', 'Square'],
  sports: ['Fields', 'Park', 'Arena'],
  utility: ['Fields', 'Farmstead', 'Works', 'Acres'],
  civic: ['Square', 'Gate', 'Plaza'],
  parks: ['Wilds', 'Grove', 'Meadow', 'Glade'],
};
/** The ground can override the zone's word: coves by the sea, heights on the hills. */
const COAST = ['Cove', 'Strand', 'Bay', 'Shore', 'Landing'];
const HILL = ['Heights', 'Ridge', 'Rise', 'Crest'];

interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const overlaps = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
const inside = (b: Box, x: number, z: number) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

function centre(eid: number): [number, number] {
  return [Math.floor(Building.x[eid]! + Building.w[eid]! / 2), Math.floor(Building.z[eid]! + Building.d[eid]! / 2)];
}

function footprint(eid: number): Box {
  const x = Building.x[eid]!;
  const z = Building.z[eid]!;
  return { x0: x, z0: z, x1: x + Building.w[eid]! - 1, z1: z + Building.d[eid]! - 1 };
}

const areaOf = (eid: number) => Building.w[eid]! * Building.d[eid]!;

/** Runs from the pulse; does nothing off progression islands or between naming pulses. */
export function updateDistrictNaming(city: City): void {
  if (!city.growth.progression) return;
  if ((city.tick / PULSE_TICKS) % NAMING_EVERY !== 0) return;
  nameDistricts(city);
}

/** One naming pass (exported for tests). Returns the names founded. */
export function nameDistricts(city: City): string[] {
  const out: number[] = [];
  for (const eid of query(city.world, [Building])) {
    const [cx, cz] = centre(eid);
    if (!city.areaAt(cx, cz)) out.push(eid);
  }
  if (!out.length) return [];
  // Stable order (entity ids are reused): by position.
  out.sort((a, b) => Building.z[a]! - Building.z[b]! || Building.x[a]! - Building.x[b]!);

  let changed = false;
  const list = city.districts.slice();
  // 1. Grow districts over buildings just past their edge.
  const left: number[] = [];
  for (const eid of out) {
    const [cx, cz] = centre(eid);
    const f = footprint(eid);
    let grew = false;
    for (let k = 0; k < list.length && !grew; k++) {
      const d = list[k]!;
      if (cx < d.x0 - GROW_REACH || cx > d.x1 + GROW_REACH || cz < d.z0 - GROW_REACH || cz > d.z1 + GROW_REACH) continue;
      const next: District = {
        ...d,
        x0: Math.min(d.x0, f.x0 - 1),
        z0: Math.min(d.z0, f.z0 - 1),
        x1: Math.max(d.x1, f.x1 + 1),
        z1: Math.max(d.z1, f.z1 + 1),
      };
      if (next.x1 - next.x0 + 1 > MAX_SIDE || next.z1 - next.z0 + 1 > MAX_SIDE) continue;
      if (list.some((o, j) => j !== k && overlaps(o, next))) continue;
      list[k] = next;
      grew = true;
      changed = true;
    }
    if (!grew) left.push(eid);
  }

  // 2. Cluster what is left (single linkage on centres).
  const founded: string[] = [];
  const seen = new Set<number>();
  for (const seed of left) {
    if (seen.has(seed)) continue;
    const group = [seed];
    seen.add(seed);
    for (let i = 0; i < group.length; i++) {
      const [ax, az] = centre(group[i]!);
      for (const e of left) {
        if (seen.has(e)) continue;
        const [bx, bz] = centre(e);
        if (Math.abs(ax - bx) <= LINK && Math.abs(az - bz) <= LINK) {
          seen.add(e);
          group.push(e);
        }
      }
    }
    if (group.length < MIN_BUILDINGS) continue;
    let box: Box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    for (const e of group) {
      const f = footprint(e);
      box = { x0: Math.min(box.x0, f.x0), z0: Math.min(box.z0, f.z0), x1: Math.max(box.x1, f.x1), z1: Math.max(box.z1, f.z1) };
    }
    box = { x0: box.x0 - PAD, z0: box.z0 - PAD, x1: box.x1 + PAD, z1: box.z1 + PAD };
    const trimmed = trim(box, list, group);
    if (!trimmed) continue;
    const members = group.filter((e) => inside(trimmed, ...centre(e)));
    if (members.length < MIN_BUILDINGS) continue;
    const zone = zoneOf(city, members);
    const name = pickName(city, trimmed, zone, list);
    list.push({ name, zone, ...trimmed });
    founded.push(name);
    changed = true;
  }
  // A new array, so the district lookup in approval.ts rebuilds.
  if (changed) city.districts = list;
  for (const name of founded) {
    const d = list.find((x) => x.name === name)!;
    city.bus.emit('district:named', { name, zone: d.zone!, x: (d.x0 + d.x1 + 1) / 2, z: (d.z0 + d.z1 + 1) / 2 });
  }
  return founded;
}

/** Cuts `box` off every district it overlaps, choosing each cut to keep the most of the group's centres. */
function trim(box: Box, list: District[], group: number[]): Box | null {
  let b = box;
  for (const d of list) {
    if (!overlaps(b, d)) continue;
    const cuts: Box[] = [
      { ...b, x1: d.x0 - 1 },
      { ...b, x0: d.x1 + 1 },
      { ...b, z1: d.z0 - 1 },
      { ...b, z0: d.z1 + 1 },
    ].filter((c) => c.x0 <= c.x1 && c.z0 <= c.z1);
    let best: Box | null = null;
    let keep = -1;
    for (const c of cuts) {
      const n = group.filter((e) => inside(c, ...centre(e))).length;
      if (n > keep) [best, keep] = [c, n];
    }
    if (!best || keep <= 0) return null;
    b = best;
  }
  return b;
}

function zoneOf(city: City, members: number[]): ZoneKind {
  const w = new Map<ZoneKind, number>();
  for (const e of members) {
    const z = ZONE_OF[city.buildingDef(e).category] ?? 'living';
    w.set(z, (w.get(z) ?? 0) + areaOf(e));
  }
  let best: ZoneKind = 'living';
  let most = -1;
  // Ties go to the first zone in a fixed order.
  for (const z of ['living', 'work', 'industry', 'sports', 'utility', 'parks'] as ZoneKind[])
    if ((w.get(z) ?? 0) > most) [best, most] = [z, w.get(z) ?? 0];
  return best;
}

/** How the ground reads round a box: by the sea, on the hills, or neither. */
function ground(city: City, b: Box): 'coast' | 'hill' | null {
  let water = 0;
  let n = 0;
  let h = 0;
  for (let z = b.z0 - 3; z <= b.z1 + 3; z += 2)
    for (let x = b.x0 - 3; x <= b.x1 + 3; x += 2) {
      if (!city.grid.inBounds(x, z)) continue;
      n++;
      if (city.isWaterTile(x, z)) water++;
      else h += city.grid.heightAt(x + 0.5, z + 0.5);
    }
  if (n && water / n > 0.25) return 'coast';
  const land = n - water;
  if (land && h / land > 3) return 'hill';
  return null;
}

/** A name unused by any district (or the outskirts), chosen by a hash of the spot and the city's seed. */
export function pickName(city: City, b: Box, zone: ZoneKind, list: District[]): string {
  const taken = new Set(list.map((d) => d.name.toLowerCase()));
  taken.add(OUTSKIRTS_KEY.toLowerCase());
  const g = ground(city, b);
  const ends = g === 'coast' ? COAST : g === 'hill' ? HILL : SUFFIXES[zone];
  const r = hash2(b.x0 * 31 + b.x1, b.z0 * 17 + b.z1, city.seed);
  const s = hash2(b.z0, b.x0, city.seed + 7);
  const root = Math.floor(r * ROOTS.length);
  const end = Math.floor(s * ends.length);
  // Walk the roots first (variety), then the endings, so the first free pair is found deterministically.
  for (let j = 0; j < ends.length; j++)
    for (let i = 0; i < ROOTS.length; i++) {
      const name = `${ROOTS[(root + i) % ROOTS.length]} ${ends[(end + j) % ends.length]}`;
      if (!taken.has(name.toLowerCase())) return name;
    }
  // Every pair taken (≈ 200+ districts): number them.
  for (let n = 2; ; n++) {
    const name = `${ROOTS[root]} ${ends[end]} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}
