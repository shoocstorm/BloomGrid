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

    // The Wellspring Spire at the island's exact centre, on a terrace levelled where the river
    // rises. Its roads are drawn last (below) so the utility sweeps don't crowd the plaza.
    const SP = 14;
    const sx = Math.round(S / 2 - SP / 2);
    const sz = sx;
    const [lx, lz, rx, rz] = [sx - 1, sz - 1, sx + SP, sz + SP];
    b.level(lx, lz, rx, rz, 5);
    const spire = b.building('wellspring-spire', sx, sz, 0);

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
    sweep('water-works', () => t().waterProduced > t().waterUsed * 1.02, island);
    sweep('vertical-farm', () => t().food > t().population * 0.55);

    // Spire roads: a plaza loop and a boulevard south-east into the downtown grid (its x = 299 road).
    if (spire) {
      b.road(lx, lz, rx, lz);
      b.road(rx, lz, rx, rz);
      b.road(rx, rz, lx, rz);
      b.road(lx, rz, lx, lz);
      const [dx0, dz0] = fit(S, 0.44, 0.6, 0.66, 0.74).map((v) => Math.round(v * S)) as [number, number];
      const bx = dx0 + 5 * Math.round((0.585 * S - dx0) / 5);
      b.road(rx, S / 2, bx, S / 2, true);
      b.road(bx, S / 2, bx, dz0, true);
    }
  },
});
