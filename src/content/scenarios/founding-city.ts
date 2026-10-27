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
}

const homes: Mix = (ring) =>
  ring <= 6
    ? [{ 'canopy-tower': 1, 'garden-residence': 4, 'greenhouse-hub': 2, 'pocket-park': 4 }, 0.7]
    : [{ 'garden-residence': 4, 'pocket-park': 5, 'greenhouse-hub': 1 }, 0.6];

/**
 * The towns round the hero district, on its grid. Bayfront (downtown) must stay first, Eastgate second and
 * Westbrook third: landmarks are placed in them by index.
 */
const TOWNS: Town[] = [
  {
    name: 'Bayfront',
    blocks: [-3, 4, 4, 7],
    mix: () => [{ 'canopy-tower': 3, 'greenhouse-hub': 3, 'garden-residence': 3, 'pocket-park': 2, 'vertical-farm': 1 }, 0.6],
    parks: 8,
    bridges: { z: [5, 7] },
    shore: 's',
  },
  { name: 'Eastgate', blocks: [5, -3, 9, 3], mix: homes, parks: 12, shore: 'e' },
  { name: 'Westbrook', blocks: [-10, -1, -5, 3], mix: homes, parks: 12, shore: 'ws' },
  { name: 'Hillcrest', blocks: [-3, -8, 3, -5], mix: homes, parks: 14, shore: 'n' },
];
/** The Sunfield solar farm, north-west of Westbrook (its south street is Westbrook's north street). */
const UTILITY: Town[] = [{ name: 'Sunfield', blocks: [-9, -2, -7, -2], mix: () => [{}, 0], parks: 0, lanes: 5 }];

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
    }
    // Waterfront streets: the outer streets run on until the shore.
    const toShore = (x: number, z: number, dx: number, dz: number) => {
      let n = 0;
      while (n < 90 && b.isLand(x + dx * (n + 1), z + dz * (n + 1))) n++;
      if (n > 0) b.road(x, z, x + dx * n, z + dz * n);
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
    fillRect(tiles([-3, 4, -2, 5]), { 'supertree-grove': 1 }, 1, 1);
    b.fill(0.46 * S, 0.66 * S, 0.66 * S, 0.8 * S, { 'lotus-pavilion': 1 }, 1, 1);
    // A Pod Dock on every block: a home's road commuters travel in one stream to the
    // nearest workplace, and next to the hero district those streams jam its streets, so most fly instead.
    for (const t of TOWNS) {
      const [i0, j0, i1, j1] = t.blocks;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) fillRect(tiles([i, j, i, j]), { 'pod-dock': 1 }, 1, 1);
    }
    fillRect(tiles(down.blocks), { 'flora-hive': 1 }, 1, 1);
    fillRect(tiles(west.blocks), { 'eco-playground': 1 }, 1, 1);
    for (const t of TOWNS) {
      const [i0, j0, i1, j1] = t.blocks;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const ring = Math.max(Math.abs(i), Math.abs(j));
          const parkBlock = ((((i + 31) * 73856093) ^ ((j + 31) * 19349663)) >>> 0) % 100 < t.parks;
          const [weights, density] = parkBlock ? [{ 'pocket-park': 3, 'garden-residence': 1 }, 0.35] : t.mix(ring);
          fillRect(tiles([i, j, i, j]), weights, density);
        }
    }
    // Industrial islet: power and work.
    district(b, 0.05, 0.6, 0.15, 0.72, 4, { bioreactor: 3, 'solar-spire': 2, 'greenhouse-hub': 1 }, 0.7);
    const islet = fit(S, 0.05, 0.6, 0.15, 0.72).map((v) => Math.round(v * S)) as Rect;

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
    sweep('greenhouse-hub', () => t().jobs > t().population * 0.65 * 0.85, towns);
    sweep('solar-spire', () => t().energyProduced > t().energyUsed * 1.06, [sun, islet]);
    sweep('water-works', () => t().waterProduced > t().waterUsed * 0.88, [[0, 0, S - 1, S - 1]]);
    sweep('vertical-farm', () => t().food > t().population * 0.55, towns);

    if (park) b.road(park[0] + 8, park[1] - 1, park[0] + 28, park[1] - 1, true);

    // Streets of the hero district (gaps where they meet the lake or river; two avenues bridge the river).
    if (spire) {
      const [x0, x1, z0, z1] = [lineX(-GRID_W), lineX(GRID_W + 1), lineZ(-GRID_N), lineZ(GRID_S + 1)];
      for (let i = -GRID_W; i <= GRID_W + 1; i++) b.road(lineX(i), z0, lineX(i), z1);
      for (let j = -GRID_N; j <= GRID_S + 1; j++) b.road(x0, lineZ(j), x1, lineZ(j), j === 2 || j === GRID_S + 1);
    }
  },
});
