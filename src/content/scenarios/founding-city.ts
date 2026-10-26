import { defineScenario, type ScenarioBuilder } from '../types';

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
const QUARTERS: { blocks: [number, number, number, number]; heroes: (string | [string, string])[] }[] = [
  // Civic ring around the spire plaza.
  { blocks: [-1, -1, 1, 1], heroes: ['helix-spire', 'hanging-gardens', 'sky-ark', 'cloud-domes', 'quartz-spire', 'nautilus-library', 'harmony-gate'] },
  // Skyline hill (north-east): towers, homes and the skyport.
  { blocks: [1, -4, 4, 0], heroes: ['dragonfly-port', ['glass-pine', 'vertical-forest'], 'moss-monolith', 'coral-arcology', 'lotus-pagoda', 'rain-vortex', 'bloom-eye', 'fog-harp'] },
  // The exchange (south-east), toward downtown: trade, science and the algae works.
  { blocks: [1, 1, 4, 3], heroes: ['zephyr-airport', 'seedpod-labs', 'bloom-clock', 'starlight-observatory', 'algae-lantern', 'wavecrest-gallery', 'sunset-amphitheatre', 'corkscrew-orchard'] },
  // Garden quarter (south-west): timber halls, gardens and markets.
  { blocks: [-4, 1, -1, 3], heroes: ['elder-banyan', 'levitating-gardens', 'bamboo-cathedral', 'canopy-skywalk', 'moonflower-hall', 'habitat-cascade', 'mycelium-towers', 'solar-sail-bazaar', 'aeolian-reeds'] },
  // Working hills (north-west), by the lake: food, water, energy and baths.
  { blocks: [-4, -4, -1, 0], heroes: ['great-noria', 'rice-terraces', 'heliostat-array', 'kite-meadow', 'honeycomb-apiary', 'travertine-baths'] },
];

/** All hero ids on the grid, for tests. */
export const HERO_IDS = QUARTERS.flatMap((q) => q.heroes.flat());

/** Steepest step between neighbouring blocks' terraces: streets refuse tiles that climb more than 0.9. */
const TERRACE_STEP = 0.8;

/**
 * Builds the hero district around the spire's block at (sx, sz): grades every block into a terrace (each as
 * close to its ground as the TERRACE_STEP limit allows, so the streets between them stay drivable and the
 * empty lots are ready to build on), places the spire, then the heroes of QUARTERS. Each hero sits flush with
 * the street on its block's side facing the spire, long side along it. Returns false if the spire won't fit.
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
  /** Tries the hero in block (i, j): the side facing the spire first, then the others. */
  const tryBlock = (id: string, i: number, j: number) => {
    const sides = Math.abs(i) > Math.abs(j) ? (i > 0 ? 'wnse' : 'enws') : j > 0 ? 'nwes' : 'swen';
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
 * The founding city: a bayfront downtown, three housing towns, an industrial islet, bridges to
 * the islets and an arterial ring. Towns keep their 384-map size on larger maps (`fit`), so a
 * bigger island means more open land for the steward, not a bigger starting city. Deliberately left a little short on water and food so the
 * steward has something to fix in the first minutes.
 */
export default defineScenario({
  id: 'founding-city',
  name: 'The Founding City',
  description: 'A young island city around the bay: thriving, but its water and food supply are already stretched.',
  credits: 12000,
  build(b) {
    const S = b.size;
    const P = (x: number, z: number): [number, number] => [Math.round(x * S), Math.round(z * S)];
    const SP = 14;
    const sx = Math.round(S / 2 - SP / 2);
    const sz = sx;
    const lineX = (i: number) => sx - 1 + GRID * i;
    const lineZ = (j: number) => sz - 1 + GRID * j;
    // Arterial ring linking the towns (bridges allowed across the river). Its western leg runs along the hero
    // district's south street rather than a tile beside it.
    const west = P(0.24, 0.6);
    if (Math.abs(west[1] - lineZ(GRID_S + 1)) <= 3) west[1] = lineZ(GRID_S + 1);
    const ring = [west, P(0.47, 0.67), P(0.78, 0.52), P(0.66, 0.24), P(0.49, 0.22), P(0.3, 0.3), west];
    for (let i = 0; i < ring.length - 1; i++) b.road(ring[i]![0], ring[i]![1], ring[i + 1]![0], ring[i + 1]![1], true);

    // Bridges to the islets. The south islet is Bloomtopia, the amusement park: fenced, its gate facing the
    // bridge from downtown (its forecourt is drawn last, so the utility sweeps leave the gate alone).
    const park = bloomtopia(b, ...P(0.493, 0.862));
    if (park) b.road(park[0] + 18, P(0.5, 0.66)[1], park[0] + 18, park[1] - 1, true);
    b.road(...P(0.24, 0.62), ...P(0.1, 0.66), true); // west: industrial islet
    b.road(...P(0.78, 0.4), ...P(0.84, 0.2), true); // north-east: rustic islet

    // The hero district: one street grid of GRID-tile blocks centred on the Wellspring Spire, which fills
    // block (0, 0) at the island's exact centre where the river rises. Heroes are placed now (so the utility
    // sweeps count them) but the grid's streets are drawn last, so the sweeps never fill its lots.
    const spire = heroDistrict(b, sx, sz);

    // The Supertree Grove (8×8) needs open land the district grids would cut up: reserve it first,
    // on the ring road just west of downtown.
    b.fill(0.36 * S, 0.6 * S, 0.47 * S, 0.72 * S, { 'supertree-grove': 1 }, 1, 1);

    const homes = { 'garden-residence': 4, 'canopy-tower': 1, 'pocket-park': 2, 'greenhouse-hub': 3 };
    district(b, 0.44, 0.6, 0.66, 0.74, 5, { 'canopy-tower': 5, 'greenhouse-hub': 4, 'garden-residence': 2, 'pocket-park': 2, 'vertical-farm': 1 });
    district(b, 0.68, 0.42, 0.88, 0.62, 6, homes);
    district(b, 0.14, 0.5, 0.34, 0.68, 6, homes);
    district(b, 0.4, 0.16, 0.6, 0.28, 6, homes, 0.8);
    // Industrial islet: power and work.
    district(b, 0.05, 0.6, 0.15, 0.72, 4, { bioreactor: 3, 'solar-spire': 2, 'greenhouse-hub': 1 }, 0.7);

    // Balance: jobs for most of the labour force, power with a thin margin; water and food left short.
    const areas: [number, number, number, number][] = (
      [
        [0.68, 0.42, 0.88, 0.62],
        [0.14, 0.5, 0.34, 0.68],
        [0.4, 0.16, 0.6, 0.28],
        [0.44, 0.6, 0.66, 0.74],
      ] as const
    ).map(([a, b2, c, d]) => fit(S, a, b2, c, d));
    const island: [number, number, number, number][] = [[0.03, 0.1, 0.97, 0.92]];
    /** Adds one building per area per sweep until `ok()` or nothing more fits. */
    const sweep = (id: string, ok: () => boolean, where = areas) => {
      while (!ok()) {
        let placed = 0;
        for (const [x0, z0, x1, z1] of where) {
          if (ok()) break;
          placed += b.fill(x0 * S, z0 * S, x1 * S, z1 * S, { [id]: 1 }, 1, 1);
        }
        if (!placed) break;
      }
    };
    // Two Pod Docks (downtown and the eastern town) so sky-lanes fly from day one.
    for (const [x0, z0, x1, z1] of [areas[3]!, areas[0]!]) b.fill(x0 * S, z0 * S, x1 * S, z1 * S, { 'pod-dock': 1 }, 1, 1);
    // Landmark: the Lotus Arts Pavilion on the bay (the Supertree Grove is placed before the districts).
    b.fill(0.46 * S, 0.66 * S, 0.66 * S, 0.8 * S, { 'lotus-pavilion': 1 }, 1, 1);
    // A Flora-Net Drone Hive downtown and an Eco-Playground in the western town.
    b.fill(areas[3]![0] * S, areas[3]![1] * S, areas[3]![2] * S, areas[3]![3] * S, { 'flora-hive': 1 }, 1, 1);
    b.fill(areas[1]![0] * S, areas[1]![1] * S, areas[1]![2] * S, areas[1]![3] * S, { 'eco-playground': 1 }, 1, 1);
    const t = () => b.totals();
    sweep('greenhouse-hub', () => t().jobs > t().population * 0.65 * 0.85);
    sweep('solar-spire', () => t().energyProduced > t().energyUsed * 1.06);
    sweep('solar-spire', () => t().energyProduced > t().energyUsed * 1.06, island);
    sweep('water-works', () => t().waterProduced > t().waterUsed, island);
    sweep('vertical-farm', () => t().food > t().population * 0.55);

    if (park) b.road(park[0] + 8, park[1] - 1, park[0] + 28, park[1] - 1, true);

    // Streets of the hero district (gaps where they meet the lake or river, bridges on two avenues), then
    // straight avenues out to the towns so the island reads as one city.
    if (spire) {
      const [x0, x1, z0, z1] = [lineX(-GRID_W), lineX(GRID_W + 1), lineZ(-GRID_N), lineZ(GRID_S + 1)];
      for (let i = -GRID_W; i <= GRID_W + 1; i++) b.road(lineX(i), z0, lineX(i), z1);
      for (let j = -GRID_N; j <= GRID_S + 1; j++) b.road(x0, lineZ(j), x1, lineZ(j), j === 2);
      // North: two avenues from the plaza up to the northern town's bottom row, bridging the lake.
      const [, nz0, , nz1] = fit(S, 0.4, 0.16, 0.6, 0.28).map((v) => Math.round(v * S)) as [number, number, number, number];
      const nb = nz0 + 6 * Math.floor((nz1 - nz0) / 6);
      for (const i of [-1, 2]) b.road(lineX(i), lineZ(0), lineX(i), nb, true);
      // East: two boulevards, one along the plaza's south street, to the eastern town's first column.
      const [ex0] = fit(S, 0.68, 0.42, 0.88, 0.62).map((v) => Math.round(v * S)) as [number];
      for (const j of [-1, 1]) b.road(x1, lineZ(j), ex0, lineZ(j), true);
      // West: two avenues to the western town's last column, the northern one jogging down to its top row.
      const [wx0, wz0, wx1] = fit(S, 0.14, 0.5, 0.34, 0.68).map((v) => Math.round(v * S)) as [number, number, number];
      const wx = wx0 + 6 * Math.floor((wx1 - wx0) / 6);
      b.road(x0, lineZ(1), wx, lineZ(1), true);
      b.road(wx, lineZ(1), wx, wz0, true);
      b.road(x0, lineZ(3), wx, lineZ(3), true);
      // South: the grid's east columns run on down to downtown's top row.
      const [, dz0] = fit(S, 0.44, 0.6, 0.66, 0.74).map((v) => Math.round(v * S)) as [number, number];
      for (let i = 2; i <= GRID_W + 1; i++) b.road(lineX(i), z1, lineX(i), dz0);
    }
  },
});
