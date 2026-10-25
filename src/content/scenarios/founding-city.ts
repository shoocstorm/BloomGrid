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
    // Arterial ring linking the towns (bridges allowed across the river).
    const ring = [P(0.24, 0.6), P(0.47, 0.67), P(0.78, 0.52), P(0.66, 0.24), P(0.49, 0.22), P(0.3, 0.3), P(0.24, 0.6)];
    for (let i = 0; i < ring.length - 1; i++) b.road(ring[i]![0], ring[i]![1], ring[i + 1]![0], ring[i + 1]![1], true);

    // Bridges to the islets.
    b.road(...P(0.5, 0.66), ...P(0.5, 0.86), true); // south: resort islet
    b.road(...P(0.24, 0.62), ...P(0.1, 0.66), true); // west: industrial islet
    b.road(...P(0.78, 0.4), ...P(0.84, 0.2), true); // north-east: rustic islet

    // The hero quarter at the island's exact centre, on one terrace levelled where the river rises:
    // the Wellspring Spire on its plaza, the Helix Wind Spire behind it, the Hanging Gardens to the
    // west and the Sky Ark and Cloud Forest Domes flanking the boulevard to downtown. Its roads are
    // drawn last (below) so the utility sweeps don't crowd the plaza.
    const SP = 14;
    const sx = Math.round(S / 2 - SP / 2);
    const sz = sx;
    const [lx, lz, rx, rz] = [sx - 1, sz - 1, sx + SP, sz + SP];
    const terrace = b.level(lx - 10, lz - 8, rx + 12, rz + 4, 6);
    // The avenue to downtown runs down x = bx (a downtown grid road) to the grid's top row dz0; the ring road
    // passes along z = ringZ west of x = ringX.
    const [dx0, dz0] = fit(S, 0.44, 0.6, 0.66, 0.74).map((v) => Math.round(v * S)) as [number, number];
    const bx = dx0 + 5 * Math.round((0.585 * S - dx0) / 5);
    const [ringX, ringZ] = P(0.47, 0.6);
    const spire = b.building('wellspring-spire', sx, sz, 0);
    if (spire) {
      // Each hero slides away from its anchor (dx, dz per step) until it fits: the river head moves with the seed.
      const hero = (id: string, x: number, z: number, dx: number, dz: number, rot = 0) => {
        for (let i = 0; i < 6 && !b.building(id, x + i * dx, z + i * dz, rot); i++);
      };
      hero('helix-spire', S / 2 - 4, lz - 8, 0, -1);
      hero('hanging-gardens', lx - 10, S / 2 - 5, -1, 0);
      hero('sky-ark', rx + 1, S / 2 - 7, 1, 0);
      hero('cloud-domes', rx + 2, S / 2 + 1, 1, 0);
      // Hero avenue: the boulevard to downtown, on a terrace continuing the quarter's level.
      b.level(rx + 13, S / 2 - 12, rx + 43, S / 2 + 24, 4, terrace);
      hero('rain-vortex', rx + 15, S / 2 - 10, 1, 0);
      hero('dragonfly-port', rx + 27, S / 2 - 8, 1, 0);
      hero('mycelium-towers', rx + 15, S / 2 + 1, 1, 0);
      hero('algae-lantern', rx + 37, S / 2 + 6, 0, 1);
      hero('vertical-forest', rx + 30, S / 2 + 14, 0, 1, 1);
      hero('fog-harp', rx + 37, S / 2 + 15, 0, 1);
      // Hero promenade: both sides of the west road (z = rz) out toward the western town.
      b.level(lx - 62, rz - 9, lx - 11, rz - 1, 4, terrace);
      b.level(lx - 62, rz + 1, lx - 1, rz + 11, 4, terrace);
      hero('nautilus-library', lx - 20, rz - 9, -1, 0);
      hero('quartz-spire', lx - 32, rz - 9, -1, 0);
      hero('bamboo-cathedral', lx - 47, rz - 8, -1, 0);
      hero('starlight-observatory', lx - 59, rz - 8, -1, 0);
      hero('elder-banyan', lx - 11, rz + 1, -1, 0);
      hero('levitating-gardens', lx - 23, rz + 1, -1, 0);
      hero('solar-sail-bazaar', lx - 35, rz + 1, -1, 0);
      hero('habitat-cascade', lx - 48, rz + 1, -1, 0);
      hero('aeolian-reeds', lx - 60, rz + 1, -1, 0);
      // South avenue: both sides of x = bx from the avenue down to downtown.
      b.level(bx - 13, rz + 18, bx + 12, dz0 - 2, 4, terrace);
      hero('harmony-gate', bx - 8, rz + 18, 0, 1, 1);
      hero('seedpod-labs', bx - 9, rz + 32, 0, 1);
      hero('bloom-clock', bx - 8, rz + 43, 0, 1);
      hero('zephyr-airport', bx + 1, rz + 18, 0, 1);
      hero('heliostat-array', bx + 1, rz + 30, 0, 1);
      hero('corkscrew-orchard', bx + 1, rz + 42, 0, 1);
      // Garden lane: from the plaza's south-west corner down x = lx to the ring road.
      b.level(lx - 24, rz + 12, lx + 1, ringZ - 1, 4, terrace);
      hero('canopy-skywalk', lx - 10, rz + 13, -1, 0);
      hero('coral-arcology', lx - 9, rz + 24, -1, 0);
      hero('travertine-baths', lx - 10, ringZ - 10, -1, 0);
      hero('moonflower-hall', lx - 22, ringZ - 10, -1, 0);
      // North terrace: cut into the hill north of the boulevard, along a street (x = nx) climbing from the
      // boulevard between the Rain Vortex and the Skyport, and a cross street (z = nz).
      const [nx, nz] = [rx + 25, S / 2 - 34];
      b.level(nx - 12, nz - 24, nx + 26, nz + 21, 4);
      hero('bloom-eye', nx - 10, nz + 16, 0, -1);
      hero('glass-pine', nx - 10, nz + 1, 0, -1);
      hero('lotus-pagoda', nx - 8, nz - 8, 0, -1);
      hero('rice-terraces', nx - 11, nz - 22, 0, -1);
      hero('honeycomb-apiary', nx + 1, nz + 14, 0, -1);
      hero('moss-monolith', nx + 1, nz + 1, 0, -1);
      hero('sunset-amphitheatre', nx + 1, nz - 10, 0, -1);
      hero('kite-meadow', nx + 1, nz - 22, 0, -1);
      hero('wavecrest-gallery', nx + 14, nz - 8, 1, 0);
      hero('great-noria', nx + 14, nz + 1, 1, 0);
    }

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
    // Resort islet: parks and homes.
    district(b, 0.44, 0.83, 0.56, 0.89, 4, { 'pocket-park': 3, 'garden-residence': 2 }, 0.8);

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

    // Spire roads: a plaza loop and a boulevard south-east into the downtown grid (its x = 299 road).
    if (spire) {
      b.road(lx, lz, rx, lz);
      b.road(rx, lz, rx, rz);
      b.road(rx, rz, lx, rz);
      b.road(lx, rz, lx, lz);
      b.road(rx, S / 2, bx, S / 2, true);
      b.road(bx, S / 2, bx, dz0, true);
      // Second link: from the plaza's south-west corner west to the western town's grid.
      const [wx0, wz0, wx1] = fit(S, 0.14, 0.5, 0.34, 0.68).map((v) => Math.round(v * S)) as [number, number, number];
      const wx = wx0 + 6 * Math.floor((wx1 - wx0) / 6);
      b.road(lx, rz, wx, rz, true);
      b.road(wx, rz, wx, wz0, true);
      // Garden lane down to the ring road: a third way out of the hero district.
      b.road(lx, rz, lx, ringZ, true);
      b.road(lx, ringZ, ringX, ringZ, true);
      // North terrace streets.
      b.road(rx + 25, S / 2, rx + 25, S / 2 - 57, true);
      b.road(rx + 14, S / 2 - 34, rx + 49, S / 2 - 34, true);
    }
  },
});
