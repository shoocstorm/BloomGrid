import { defineScenario, type ScenarioBuilder, type ZoneKind } from '../types';

/** Map size the founding city was designed on: on larger maps its towns keep this tile size. */
const DESIGN_SIZE = 384;

/** Shrinks a normalised rectangle around its centre so it keeps its DESIGN_SIZE footprint in tiles. */
function fit(size: number, x0: number, z0: number, x1: number, z1: number): [number, number, number, number] {
  const k = Math.min(1, DESIGN_SIZE / size);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  return [cx - ((x1 - x0) / 2) * k, cz - ((z1 - z0) / 2) * k, cx + ((x1 - x0) / 2) * k, cz + ((z1 - z0) / 2) * k];
}

/** A district: road grid over a rectangle (normalised 0..1 map coords) filled with weighted buildings. */
function district(b: ScenarioBuilder, x0: number, z0: number, x1: number, z1: number, spacing: number, weights: Record<string, number>, density = 0.9) {
  const S = b.size;
  [x0, z0, x1, z1] = fit(S, x0, z0, x1, z1);
  const [ax, az, bx, bz] = [x0 * S, z0 * S, x1 * S, z1 * S].map(Math.round) as [number, number, number, number];
  for (let z = az; z <= bz; z += spacing) b.road(ax, z, bx, z);
  for (let x = ax; x <= bx; x += spacing) b.road(x, az, x, bz);
  return b.fill(ax, az, bx, bz, weights, density);
}

/** Street spacing of the hero district's grid: blocks of GRID - 1 tiles, the spire's footprint. */
export const GRID = 15;
/** Blocks west/east of the spire's block, north of it and south of it (the south edge stops short of downtown). */
export const [GRID_W, GRID_N, GRID_S] = [4, 4, 3];

/**
 * Quarters of the hero district as block rectangles [i0, j0, i1, j1] (block (0, 0) is the spire's, +i east,
 * +j south), each with its heroes in order of importance. A hero takes the free block nearest the spire in
 * its quarter (any block if the quarter is full or flooded on this seed); blocks left over stay empty lots,
 * streets already in place, for future heroes: add an id to a quarter to build one. Quarters follow the render
 * chunks (the spire sits on their corner), and heroes sharing an unusual piece (timber, algae tanks) share a
 * quarter, so each piece type stays one batch in as few chunks as possible (D-034). A pair [workplace, home]
 * puts a big housing hero straight across the street from its workplace: a home sends all its road commuters to
 * the nearest workplace in one stream, which jams every tile of the trip, so that trip must be short.
 */
const QUARTERS: { name: string; zone: ZoneKind; blocks: [number, number, number, number]; heroes: (string | [string, string])[] }[] = [
  // Civic ring around the spire plaza.
  { name: 'Civic Ring', zone: 'civic', blocks: [-1, -1, 1, 1], heroes: ['helix-spire', 'hanging-gardens', 'sky-ark', 'cloud-domes', 'quartz-spire', 'nautilus-library', 'harmony-gate', 'skylane-nexus'] },
  // Skyline hill (north-east): towers, homes and the skyport.
  { name: 'Skyline Hill', zone: 'living', blocks: [1, -4, 4, 0], heroes: ['dragonfly-port', ['glass-pine', 'vertical-forest'], 'moss-monolith', 'coral-arcology', 'lotus-pagoda', 'rain-vortex', 'bloom-eye', 'fog-harp'] },
  // The exchange (south-east), toward downtown: trade, science and the algae works.
  { name: 'The Exchange', zone: 'work', blocks: [1, 1, 4, 3], heroes: ['zephyr-airport', 'seedpod-labs', 'bloom-clock', 'starlight-observatory', 'algae-lantern', 'wavecrest-gallery', 'sunset-amphitheatre', 'corkscrew-orchard'] },
  // Garden quarter (south-west): timber halls, gardens and markets.
  { name: 'Garden Quarter', zone: 'parks', blocks: [-4, 1, -1, 3], heroes: ['elder-banyan', 'levitating-gardens', 'bamboo-cathedral', 'canopy-skywalk', 'moonflower-hall', 'habitat-cascade', 'mycelium-towers', 'solar-sail-bazaar', 'aeolian-reeds'] },
  // Working hills (north-west), by the lake: food, water, energy and baths.
  { name: 'Working Hills', zone: 'utility', blocks: [-4, -4, -1, 0], heroes: ['great-noria', 'rice-terraces', 'heliostat-array', 'kite-meadow', 'honeycomb-apiary', 'travertine-baths'] },
];

/** All hero ids on the grid, for tests. */
export const HERO_IDS = QUARTERS.flatMap((q) => q.heroes.flat());

/** An Aeroline station: its point on the line, the line's axis there, and its street-side building (D-041). */
export interface AerolineStation {
  name: string;
  x: number;
  z: number;
  /** Building north-west tile and rotation (rot turns its local -z, the platform side, toward the line). */
  bx: number;
  bz: number;
  rot: number;
}

/**
 * The Aeroline maglev loop (D-041): an elevated ring on the grid's streets round the hero district, through
 * Hillcrest, Eastgate, Bayfront (out over the bay) and Westbrook. Corners (tile centres of street lines, in loop
 * order) are rounded with `radius`; each station sits mid-block with its building on the loop's inner side.
 */
export function aerolineRoute(size: number): { corners: [number, number][]; radius: number; stations: AerolineStation[] } {
  const sx = Math.round(size / 2 - 7);
  const L = (i: number) => sx - 1 + GRID * i + 0.5;
  const mid = (i: number) => sx - 1 + GRID * i + 8; // centre of the block after line i
  const [w, e, n, s] = [L(-7), L(7), L(-6), L(8)];
  return {
    corners: [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ],
    radius: 26,
    stations: [
      { name: 'Hillcrest', x: mid(0), z: n, bx: mid(0) - 3, bz: n + 0.5, rot: 0 },
      { name: 'Eastgate', x: e, z: mid(0), bx: e - 4.5, bz: mid(0) - 3, rot: 1 },
      { name: 'Bayfront', x: mid(-1), z: s, bx: mid(-1) - 3, bz: s - 4.5, rot: 2 },
      { name: 'Westbrook', x: w, z: mid(1), bx: w + 0.5, bz: mid(1) - 3, rot: 3 },
    ],
  };
}

type Mix = (ring: number) => [Record<string, number>, number];
interface Town {
  /** Sides whose streets run on to the shore ('n', 'e', 's', 'w'): waterfront streets, and sites for water works. */
  shore?: string;
  name: string;
  /** Block rectangle [i0, j0, i1, j1] on the hero district's grid. */
  blocks: [number, number, number, number];
  /** Buildings and density by ring (Chebyshev block distance from the spire). */
  mix: Mix;
  /** Percentage of blocks kept as parks. */
  parks: number;
  /** Grid lines that bridge water: column indices i (x) and row indices j (z). */
  bridges?: { x?: number[]; z?: number[] };
  /** Service-lane spacing inside blocks (solar farm rows). */
  lanes?: number;
  /** What the town is for, and its sub-areas planned for something else (named and filled first). */
  zone: ZoneKind;
  zones?: SubZone[];
}

/** A planned sub-area of a town (D-049): its own name, purpose and building mix. */
interface SubZone {
  name: string;
  zone: ZoneKind;
  blocks: [number, number, number, number];
  mix: Mix;
  parks?: number;
}

/**
 * Living zones (D-049): homes, denser near the centre so the towns keep their residents after giving blocks to
 * work, industry and sport; a few vertical farms for food. Jobs live in the work and industry zones.
 */
const homes: Mix = (ring) =>
  ring <= 6
    ? [{ 'canopy-tower': 2, 'garden-residence': 4, 'pocket-park': 3, 'vertical-farm': 1 }, 0.75]
    : [{ 'garden-residence': 5, 'pocket-park': 4 }, 0.68];
const offices: Mix = () => [{ 'greenhouse-hub': 3, 'living-studio': 4, 'vertical-farm': 2, 'pocket-park': 1 }, 0.85];
const factories: Mix = () => [
  { 'mycelium-brickworks': 2, 'kelp-refinery': 1, 'solar-glass-foundry': 2, 'circular-reclaimery': 2, 'drone-fabricator': 2, 'phyto-garden': 3 },
  0.85,
];
const venues: Mix = () => [{ 'lotus-pavilion': 2, 'living-studio': 2, 'eco-playground': 2, 'pocket-park': 2 }, 0.8];
const sport: Mix = () => [{ 'sports-fields': 3, 'climbing-tower': 1, 'pocket-park': 3 }, 0.65];

/**
 * The towns round the hero district, on its grid. Bayfront (downtown) must stay first, Eastgate second and
 * Westbrook third: landmarks are placed in them by index.
 */
const TOWNS: Town[] = [
  {
    name: 'Bayfront',
    blocks: [-3, 4, 4, 7],
    mix: () => [{ 'canopy-tower': 3, 'garden-residence': 3, 'pocket-park': 2, 'vertical-farm': 1 }, 0.65],
    parks: 8,
    bridges: { z: [5, 7] },
    shore: 's',
    zone: 'living',
    // Downtown's east half: offices by the river, and the waterfront venues facing Bloomtopia's bridge.
    zones: [
      { name: 'Harbour Commons', zone: 'work', blocks: [1, 4, 4, 5], mix: offices, parks: 4 },
      { name: 'Lumen Promenade', zone: 'leisure', blocks: [1, 6, 4, 7], mix: venues, parks: 10 },
    ],
  },
  {
    name: 'Eastgate',
    blocks: [5, -3, 9, 3],
    mix: homes,
    parks: 12,
    shore: 'e',
    zone: 'living',
    zones: [{ name: 'Meridian Arena', zone: 'sports', blocks: [5, 2, 9, 3], mix: sport, parks: 6 }],
  },
  {
    name: 'Westbrook',
    blocks: [-10, -1, -5, 3],
    mix: homes,
    parks: 12,
    shore: 'ws',
    zone: 'living',
    // Factories on the west shore by the Foundry Islet bridge, downwind and a short commute from Westbrook.
    zones: [{ name: 'Westport Works', zone: 'industry', blocks: [-10, 1, -9, 3], mix: factories, parks: 0 }],
  },
  { name: 'Hillcrest', blocks: [-3, -8, 3, -5], mix: homes, parks: 14, shore: 'n', zone: 'living' },
];
const subZoneAt = (t: Town, i: number, j: number) =>
  t.zones?.find(({ blocks: [i0, j0, i1, j1] }) => i >= i0 && i <= i1 && j >= j0 && j <= j1);
/** The Sunfield solar farm, north-west of Westbrook (its south street is Westbrook's north street). */
const UTILITY: Town[] = [{ name: 'Sunfield', blocks: [-9, -2, -7, -2], mix: () => [{}, 0], parks: 0, lanes: 5, zone: 'utility' }];

/** Steepest step between neighbouring blocks' terraces: streets refuse tiles that climb more than 0.9. */
const TERRACE_STEP = 0.8;

/**
 * Builds the hero district around the spire's block at (sx, sz): grades every block into a terrace (each as
 * close to its ground as the TERRACE_STEP limit allows, so the streets between them stay drivable and the
 * empty lots are ready to build on), places the spire, then the heroes of QUARTERS. Each hero sits flush with
 * the street on its block's side facing away from the spire, long side along it. Returns false if the spire won't fit.
 */
function heroDistrict(b: ScenarioBuilder, sx: number, sz: number): boolean {
  const n = GRID - 1;
  const ring = (i: number, j: number) => Math.max(Math.abs(i), Math.abs(j)) * 100 + Math.abs(i) + Math.abs(j);
  const blocks = (i0: number, j0: number, i1: number, j1: number) => {
    const out: [number, number][] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
    return out.sort((p, q) => ring(...p) - ring(...q));
  };
  const all = blocks(-GRID_W, -GRID_N, GRID_W, GRID_S);
  // Terrace heights: each block's mean ground, pulled into a TERRACE_STEP-Lipschitz surface (the midpoint of
  // its lower and upper Lipschitz envelopes) over Chebyshev block distance.
  const mean = all.map(([i, j]) => {
    let [sum, k] = [0, 0];
    for (let z = sz + GRID * j; z <= sz + GRID * j + n; z++)
      for (let x = sx + GRID * i; x <= sx + GRID * i + n; x++) {
        const h = b.height(x, z);
        if (h > 0.05) [sum, k] = [sum + h, k + 1];
      }
    return k ? sum / k : NaN;
  });
  all.forEach(([i, j], a) => {
    if (Number.isNaN(mean[a]!)) return;
    let [lo, hi] = [-Infinity, Infinity];
    all.forEach(([i2, j2], c) => {
      const d = TERRACE_STEP * Math.max(Math.abs(i - i2), Math.abs(j - j2));
      if (Number.isNaN(mean[c]!)) return;
      lo = Math.max(lo, mean[c]! - d);
      hi = Math.min(hi, mean[c]! + d);
    });
    b.level(sx + GRID * i, sz + GRID * j, sx + GRID * i + n - 1, sz + GRID * j + n - 1, 3, (lo + hi) / 2);
  });
  if (!b.building('wellspring-spire', sx, sz, 0)) return false;

  const land = (x: number, z: number, w: number, d: number) => {
    for (let k = z; k < z + d; k++) for (let m = x; m < x + w; m++) if (!b.isLand(m, k)) return false;
    return true;
  };
  /** Where the hero sits flush with side `side` of block (i, j), long side along that street first. */
  const spots = (id: string, i: number, j: number, side: string) => {
    const [x0, z0] = [sx + GRID * i, sz + GRID * j];
    const [w0, d0] = b.footprint(id, 0);
    const alongX = side === 'n' || side === 's';
    return ((alongX ? w0 >= d0 : d0 >= w0) ? [0, 1] : [1, 0]).map((rot) => {
      const [w, d] = b.footprint(id, rot);
      const x = side === 'w' ? x0 : side === 'e' ? x0 + n - w : x0 + Math.floor((n - w) / 2);
      const z = side === 'n' ? z0 : side === 's' ? z0 + n - d : z0 + Math.floor((n - d) / 2);
      return { x, z, rot, ok: land(x, z, w, d) };
    });
  };
  /** Tries the hero in block (i, j): the side facing away from the spire first (toward the towns its workers come from), then the others. */
  const tryBlock = (id: string, i: number, j: number) => {
    const sides = Math.abs(i) > Math.abs(j) ? (i > 0 ? 'ensw' : 'wnse') : j > 0 ? 'swen' : 'nwes';
    for (const side of sides) for (const p of spots(id, i, j, side)) if (p.ok && b.building(id, p.x, p.z, p.rot)) return true;
    return false;
  };
  /** Tries a pair: the workplace on the south side of block (i, j), the home on the north side of the block below. */
  const tryPair = ([work, home]: [string, string], i: number, j: number) => {
    const p = spots(work, i, j, 's').find((s) => s.ok);
    const q = spots(home, i, j + 1, 'n').find((s) => s.ok);
    if (!p || !q || used.has(`${i},${j + 1}`)) return false;
    return b.building(work, p.x, p.z, p.rot) && b.building(home, q.x, q.z, q.rot);
  };
  const used = new Set(['0,0']);
  for (const q of QUARTERS)
    for (const hero of q.heroes)
      for (const [i, j] of [...blocks(...q.blocks), ...all]) {
        if (used.has(`${i},${j}`)) continue;
        if (typeof hero === 'string' ? !tryBlock(hero, i, j) : !tryPair(hero, i, j)) continue;
        used.add(`${i},${j}`);
        if (typeof hero !== 'string') used.add(`${i},${j + 1}`);
        break;
      }
  return true;
}

/**
 * Levels the islet round (cx, cz) and opens Bloomtopia (36 × 16) on it, gate north toward the bridge, nudging
 * it a few tiles if the islet's shore cuts a corner on this seed. Returns its north-west tile, or null.
 */
function bloomtopia(b: ScenarioBuilder, cx: number, cz: number): [number, number] | null {
  const [w, d] = b.footprint('bloomtopia');
  for (const [ox, oz] of [[0, 0], [0, -2], [0, 2], [-2, 0], [2, 0], [-3, -2], [3, -2], [-3, 2], [3, 2]] as const) {
    const [x, z] = [cx - w / 2 + ox, cz - d / 2 + 1 + oz];
    let dry = true;
    for (let k = z; k < z + d && dry; k++) for (let m = x; m < x + w && dry; m++) dry = b.isLand(m, k);
    if (!dry) continue;
    b.level(x, z, x + w - 1, z + d - 1, 2);
    if (b.building('bloomtopia', x, z, 0)) return [x, z];
  }
  return null;
}

/**
 * The founding city: one planned grid round the Wellspring Spire, with the hero district at its heart, Bayfront
 * (downtown) down the river to the bay, Eastgate, Westbrook and Hillcrest round it (TOWNS), the Sunfield solar farm,
 * an industrial islet and Bloomtopia on bridged islets. Laid out on the 512 map's tile grid (only the industrial islet
 * still uses `fit`). Deliberately left a little short on water so the steward has something to fix in the first
 * minutes.
 */
export default defineScenario({
  id: 'founding-city',
  name: 'The Founding City',
  description: 'A young island city around the bay: thriving, but its water and food supply are already stretched.',
  credits: 12000,
  build(b) {
    const S = b.size;
    const SP = 14;
    const sx = Math.round(S / 2 - SP / 2);
    const sz = sx;
    const lineX = (i: number) => sx - 1 + GRID * i;
    const lineZ = (j: number) => sz - 1 + GRID * j;
    const P = (x: number, z: number): [number, number] => [Math.round(x * S), Math.round(z * S)];
    type Rect = [number, number, number, number];
    /** Tiles of block rectangle [i0, j0, i1, j1], inside its streets. */
    const tiles = ([i0, j0, i1, j1]: Rect): Rect => [lineX(i0) + 1, lineZ(j0) + 1, lineX(i1 + 1) - 1, lineZ(j1 + 1) - 1];
    const fillRect = ([x0, z0, x1, z1]: Rect, weights: Record<string, number>, density = 1, limit = Infinity) => b.fill(x0, z0, x1 + 1, z1 + 1, weights, density, limit);

    // Bridges to the islets. The south islet is Bloomtopia, the amusement park: fenced, its gate facing the
    // bridge from downtown's bay street (its forecourt is drawn last, so the utility sweeps leave the gate alone).
    const park = bloomtopia(b, ...P(0.493, 0.862));
    if (park) b.road(park[0] + 18, lineZ(6), park[0] + 18, park[1] - 1, true);

    // The hero district: one street grid of GRID-tile blocks centred on the Wellspring Spire, which fills
    // block (0, 0) at the island's exact centre where the river rises. Heroes are placed now (so the utility
    // sweeps count them) but the grid's streets are drawn last, so the sweeps never fill its lots.
    const spire = heroDistrict(b, sx, sz);

    // The towns continue the hero district's grid on every side, so the island reads as one planned city: blocks
    // are lined with buildings round a green courtyard, densest by the centre and the bay, thinning toward the
    // coast, with a park block here and there. The corners between them stay countryside.
    const all = [...TOWNS, ...UTILITY];
    for (const t of all) {
      const [i0, j0, i1, j1] = t.blocks;
      for (let i = i0; i <= i1 + 1; i++) b.road(lineX(i), lineZ(j0), lineX(i), lineZ(j1 + 1), t.bridges?.x?.includes(i));
      for (let j = j0; j <= j1 + 1; j++) b.road(lineX(i0), lineZ(j), lineX(i1 + 1), lineZ(j), t.bridges?.z?.includes(j));
      // Service lanes inside the solar farm's blocks: rows of panels.
      if (t.lanes)
        for (let k = lineX(i0) + t.lanes; k < lineX(i1 + 1); k += t.lanes) {
          if ((k - lineX(0)) % GRID) b.road(k, lineZ(j0), k, lineZ(j1 + 1));
        }
      // Mid-block service lanes through the work, industry and entertainment zones (D-049): four lots per block (wide enough
      // for a factory), and every workplace gets more entrances, so the morning arrivals spread over more road.
      for (const z of t.zones ?? []) {
        if (z.zone !== 'work' && z.zone !== 'industry' && z.zone !== 'leisure') continue;
        const [a0, c0, a1, c1] = z.blocks;
        for (let i = a0; i <= a1; i++) b.road(lineX(i) + 7, lineZ(c0), lineX(i) + 7, lineZ(c1 + 1));
        for (let j = c0; j <= c1; j++) b.road(lineX(a0), lineZ(j) + 7, lineX(a1 + 1), lineZ(j) + 7);
      }
    }
    // Waterfront streets: the outer streets run on until the shore.
    const shoreRoads: [x: number, z: number, dx: number, dz: number, n: number][] = [];
    const toShore = (x: number, z: number, dx: number, dz: number) => {
      let n = 0;
      while (n < 90 && b.isLand(x + dx * (n + 1), z + dz * (n + 1))) n++;
      if (n > 0) b.road(x, z, x + dx * n, z + dz * n);
      shoreRoads.push([x, z, dx, dz, n]);
    };
    for (const t of TOWNS) {
      const [i0, j0, i1, j1] = t.blocks;
      for (const side of t.shore ?? '') {
        if (side === 'n' || side === 's') for (let i = i0; i <= i1 + 1; i++) toShore(lineX(i), lineZ(side === 'n' ? j0 : j1 + 1), 0, side === 'n' ? -1 : 1);
        else for (let j = j0; j <= j1 + 1; j++) toShore(lineX(side === 'w' ? i0 : i1 + 1), lineZ(j), side === 'w' ? -1 : 1, 0);
      }
    }
    // Islet bridges leave from the towns' corners: west to the industrial islet, north-east to the rustic one.
    b.road(lineX(-10), lineZ(4), ...P(0.1, 0.66), true);
    b.road(lineX(10), lineZ(-3), ...P(0.84, 0.2), true);

    // Landmarks first, while their land is open: the Supertree Grove in downtown's west, the Lotus Arts Pavilion
    // on the bay, Pod Docks, the Drone Hive downtown and an Eco-Playground in Westbrook.
    const [down, west] = [TOWNS[0]!, TOWNS[2]!];
    // Aeroline stations (the line itself is drawn above the streets by the aeroline module).
    const line = aerolineRoute(S);
    for (const st of line.stations) b.building('aeroline-station', st.bx, st.bz, st.rot);
    // The two lot rows either side of the line take only low buildings, so nothing rises into the viaduct.
    const low = { 'garden-residence': 3, 'pocket-park': 2, 'greenhouse-hub': 1 };
    for (let i = 0; i < line.corners.length; i++) {
      const [a, c] = [line.corners[i]!, line.corners[(i + 1) % line.corners.length]!].map(([x, z]) => [Math.floor(x), Math.floor(z)]) as [number, number][];
      const [x0, x1, z0, z1] = [Math.min(a[0], c[0]), Math.max(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[1], c[1])];
      for (const k of [-2, 1]) {
        if (z0 === z1) fillRect([x0, z0 + k, x1, z0 + k + 1], low);
        else fillRect([x0 + k, z0, x0 + k + 1, z1], low);
      }
    }
    fillRect(tiles([-3, 4, -2, 5]), { 'supertree-grove': 1 }, 1, 1);
    b.fill(0.46 * S, 0.66 * S, 0.66 * S, 0.8 * S, { 'lotus-pavilion': 1 }, 1, 1);
    // Meridian Arena's venues first, while their blocks are open: the stadium, the pools and the velodrome.
    // Each takes the first candidate block it fits (terrain and shore vary by seed).
    const arena: [number, number][] = [[7, 2], [6, 2], [8, 2], [7, 3], [6, 3], [8, 3], [5, 2], [9, 2], [5, 3], [9, 3]];
    for (const id of ['bloom-stadium', 'aquatic-centre', 'wind-velodrome'])
      arena.some(([i, j]) => fillRect(tiles([i, j, i, j]), { [id]: 1 }, 1, 1) > 0);
    // Ember Watch stations (D-050) about every fourth block of each town, whatever its zone (reach ≈ 2 blocks).
    // The islets beyond and the open countryside stay uncovered: fires there need the steward's crews.
    for (const t of TOWNS) {
      const [i0, j0, i1, j1] = t.blocks;
      for (let j = j0 + 1; j <= j1; j += 4) for (let i = i0 + 1; i <= i1; i += 4) fillRect(tiles([i, j, i, j]), { 'ember-watch': 1 }, 1, 1);
    }
    // Pod Interchanges every third block of each living town (radius 22 covers the blocks round it): the
    // backbone of public transport once jobs are zoned away from homes (D-049).
    for (const t of TOWNS) {
      const [i0, j0, i1, j1] = t.blocks;
      for (let j = j0 + 1; j <= j1; j += 3)
        for (let i = i0 + 1; i <= i1; i += 3) if (!subZoneAt(t, i, j)) fillRect(tiles([i, j, i, j]), { 'pod-interchange': 1 }, 1, 1);
    }
    // A Pod Dock on every living block: a home's road commuters travel in one stream to the nearest workplace,
    // and with jobs zoned away from homes those streams would jam the streets between, so most fly instead.
    // Work, industry, venue and sport blocks need none (docks lift commuters from homes).
    for (const t of TOWNS) {
      const [i0, j0, i1, j1] = t.blocks;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          if (subZoneAt(t, i, j)) continue;
          // Dense inner blocks (towers) get a second dock: their commuters travel furthest to the zoned jobs.
          fillRect(tiles([i, j, i, j]), { 'pod-dock': 1 }, 1, Math.max(Math.abs(i), Math.abs(j)) <= 6 ? 2 : 1);
        }
    }
    fillRect(tiles(down.blocks), { 'flora-hive': 1 }, 1, 1);
    fillRect(tiles(west.blocks), { 'eco-playground': 1 }, 1, 1);
    for (const t of TOWNS) {
      const [i0, j0, i1, j1] = t.blocks;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const ring = Math.max(Math.abs(i), Math.abs(j));
          const sub = subZoneAt(t, i, j);
          const parkBlock = ((((i + 31) * 73856093) ^ ((j + 31) * 19349663)) >>> 0) % 100 < (sub?.parks ?? t.parks);
          const [weights, density] = parkBlock ? [{ 'pocket-park': 3, 'garden-residence': sub ? 0 : 1 }, 0.35] : (sub?.mix ?? t.mix)(ring);
          fillRect(tiles([i, j, i, j]), weights, density);
        }
    }
    // Industrial islet: factories on lots wide enough for them, bioreactors paired with phyto-gardens (clean).
    district(b, 0.05, 0.6, 0.15, 0.72, 7, { bioreactor: 2, 'phyto-garden': 3, 'kelp-refinery': 1, 'circular-reclaimery': 1, 'drone-fabricator': 1, 'solar-spire': 1 }, 0.75);

    // Wind (D-047): turbines both sides of a road, staggered about a rotor's width apart so blades never cross.
    // Each road joins the highway network, so the farms feed the city grid.
    // About half the founding city's power; the solar sweep below tops up the rest with the usual thin margin.
    const ROTOR_GAP = 9;
    const WIND_TURBINES = 110; // the industry zones draw ≈1 000 more power than the old mixed towns
    let turbines = 0;
    const turbine = (x: number, z: number) => turbines < WIND_TURBINES && b.building('wind-turbine', x, z) && turbines++;
    /** Turbines beside road tiles `from`..`to` (steps from x, z along dx, dz); both stay beside the road. */
    const windAlong = (x: number, z: number, dx: number, dz: number, from: number, to: number) => {
      for (let k = from; k + 5 <= to; k += ROTOR_GAP) {
        const [ax, az] = [x + dx * k, z + dz * k];
        const [bx, bz] = [x + dx * (k + 4), z + dz * (k + 4)];
        const [ox, oz] = dz === 0 ? [0, 1] : [1, 0];
        turbine(ax - 2 * ox, az - 2 * oz);
        turbine(bx + ox, bz + oz);
      }
    };
    // Windward Isle: the north-east islet becomes a wind farm, three spines off the bridge landing.
    const [wx, wz] = P(0.84, 0.2);
    const isle: Rect = [wx - 38, wz - 15, wx + 36, wz + 16];
    b.road(wx, isle[1] + 5, wx, isle[3] - 5);
    for (const dz of [-9, 0, 9]) {
      let [w, e] = [0, 0];
      while (w < 40 && b.isLand(wx - w - 1, wz + dz)) w++;
      while (e < 40 && b.isLand(wx + e + 1, wz + dz)) e++;
      if (w + e < 8) continue;
      b.road(wx - w + 2, wz + dz, wx + e - 2, wz + dz);
      windAlong(wx - w + 2, wz + dz, 1, 0, 1, w + e - 4);
    }
    // Sea-breeze rows along the longest waterfront streets, past the last town block.
    for (const [x, z, dx, dz, n] of [...shoreRoads].sort((p, q) => q[4] - p[4])) if (n >= 16) windAlong(x, z, dx, dz, 8, n);
    const islet = fit(S, 0.05, 0.6, 0.15, 0.72).map((v) => Math.round(v * S)) as Rect;
    fillRect(islet, { 'ember-watch': 1 }, 1, 1);

    // Balance: jobs for most of the labour force, power with a thin margin; water and food left short. Utilities go
    // to their own places: solar panels to the Sunfield, water works to any town or utility shore.
    const towns = TOWNS.map((t) => tiles(t.blocks));
    const sun = tiles(UTILITY[0]!.blocks);
    /** Adds one building per area per sweep until `ok()` or nothing more fits. */
    const sweep = (id: string, ok: () => boolean, where: Rect[]) => {
      while (!ok()) {
        let placed = 0;
        for (const r of where) {
          if (ok()) break;
          placed += fillRect(r, { [id]: 1 }, 1, 1);
        }
        if (!placed) break;
      }
    };
    const t = () => b.totals();
    // Jobs top up in the work and industry zones only, so the living zones stay homes (D-049).
    const zoned = (kind: ZoneKind) => all.flatMap((tw) => (tw.zones ?? []).filter((z) => z.zone === kind).map((z) => tiles(z.blocks)));
    const jobsOk = () => t().jobs > t().population * 0.65 * 0.85;
    sweep('living-studio', jobsOk, [...zoned('work'), ...zoned('leisure')]);
    sweep('greenhouse-hub', jobsOk, zoned('work'));
    sweep('drone-fabricator', jobsOk, [...zoned('industry'), islet]);
    sweep('circular-reclaimery', jobsOk, [...zoned('industry'), islet]);
    // Food: vertical farms in the towns, then as urban farm towers in whatever work-zone lots remain.
    sweep('vertical-farm', () => t().food > t().population * 0.55, [...towns, ...zoned('work')]);
    // 1.12× planned demand: the factories run near full shifts, so live use sits close to the plan.
    sweep('solar-spire', () => t().energyProduced > t().energyUsed * 1.12, [sun, islet]);
    sweep('water-works', () => t().waterProduced > t().waterUsed * 0.88, [[0, 0, S - 1, S - 1]]);

    if (park) b.road(park[0] + 8, park[1] - 1, park[0] + 28, park[1] - 1, true);

    // Streets of the hero district (gaps where they meet the lake or river; two avenues bridge the river).
    if (spire) {
      const [x0, x1, z0, z1] = [lineX(-GRID_W), lineX(GRID_W + 1), lineZ(-GRID_N), lineZ(GRID_S + 1)];
      for (let i = -GRID_W; i <= GRID_W + 1; i++) b.road(lineX(i), z0, lineX(i), z1);
      for (let j = -GRID_N; j <= GRID_S + 1; j++) b.road(x0, lineZ(j), x1, lineZ(j), j === 2 || j === GRID_S + 1);
      // Transit for the hero district's living quarter (its towers' commuters otherwise jam the centre's
      // streets): an interchange in its middle and a dock in every block, now that the streets reach the lots.
      for (const q of QUARTERS.filter((qq) => qq.zone === 'living')) {
        const [i0, j0, i1, j1] = q.blocks;
        fillRect(tiles([Math.round((i0 + i1) / 2), Math.round((j0 + j1) / 2), Math.round((i0 + i1) / 2), Math.round((j0 + j1) / 2)]), { 'pod-interchange': 1 }, 1, 1);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fillRect(tiles([i, j, i, j]), { 'pod-dock': 1 }, 1, 1);
      }
      // An Ember Watch station for the centre's living and work quarters.
      for (const q of QUARTERS.filter((qq) => qq.zone === 'living' || qq.zone === 'work')) fillRect(tiles(q.blocks), { 'ember-watch': 1 }, 1, 1);
    }

    // Named areas for the inventory and the inspector, most specific first; their streets included.
    const streets = ([i0, j0, i1, j1]: Rect): Rect => [lineX(i0), lineZ(j0), lineX(i1 + 1), lineZ(j1 + 1)];
    if (spire) for (const q of QUARTERS) b.nameArea(q.name, ...streets(q.blocks), q.zone);
    if (park) b.nameArea('Bloomtopia', park[0], park[1], park[0] + b.footprint('bloomtopia')[0] - 1, park[1] + b.footprint('bloomtopia')[1] - 1, 'leisure');
    // Sub-zones before their towns, so their tiles take the more specific name.
    for (const t of all) for (const z of t.zones ?? []) b.nameArea(z.name, ...streets(z.blocks), z.zone);
    for (const t of all) b.nameArea(t.name, ...streets(t.blocks), t.zone);
    // Lots fill from their north-west tile, so a factory on the islet's east or south edge overhangs the rect:
    // the name covers the overhang (the islet is ringed by sea, so nothing else is there).
    b.nameArea('Foundry Islet', islet[0], islet[1], islet[2] + 5, islet[3] + 5, 'industry');
    b.nameArea('Windward Isle', ...isle, 'utility');
  },
});
