/**
 * Lot grading (D-099, D-154): a building should sit on ground shaped for it, not in a hollow. A building stands at
 * its pad (`Grid.padOver`: its lot's highest corner, or the ring of ground right beside the lot where that is higher);
 * ground above the lot's top beside it would bury the ground floor. Grading shapes the ground the way a builder would,
 * so the pad and the lot agree and the plinth stays hidden:
 * - Level lots: each lot is levelled to its pad, its highest corner, lifted to meet a higher highway along its
 *   edge or a higher neighbouring lot or kept terrace touching it (up to MAX_FILL, and never more than CLIFF over a
 *   lower street or the water beside it). Adjacent lots so settle on one level where the ground allows.
 * - Banks: open ground beside the lot is cut flush with the pad one tile out, then back to a gentle ramp (BANK per
 *   tile, out to RAMP tiles). Ground falling away is left to the building's plinth: embankments filled from a high
 *   lot raised flat ground for tiles around and made hollows next to lower neighbours.
 * Never touched: other buildings' lots (their plinths hide them), highways beyond the lot's edge (they keep their
 * own grade), corners next to bridges or filtration channels, and water. Pure: returns corner heights to write
 * through `setCorners`.
 */
import { BRIDGE, type City } from './City';
import { SEA_LEVEL } from './Grid';

/** Height a bank may rise per tile of distance from the lot (a ≈24° slope, half a highway's limit). */
export const BANK = 0.45;
/** Tiles a ramp or embankment may run from a lot before it meets the natural ground (the first tile is flat). */
export const RAMP = 7;
/** Passes the pads settle over: a lot lifted to a neighbour can lift the next lot along a row. */
const PASSES = 12;
/** Tiles out to which a higher street lifts a lot (ramped down by BANK a tile beyond the first). */
export const STREET = 3;
/** A street up to this much higher than a lot is a kerb step, not a reason to lift the lot. */
export const KERB = 0.3;
/** Most a lot is raised to meet a higher street. */
export const MAX_FILL = 1.2;
/**
 * Most a graded lot corner may stand above a street, bridge or channel corner beside it: the slope limit a tile
 * between them must keep to carry a highway (`City.canRoad`).
 */
export const CLIFF = 0.9;

export interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * Corner heights (index → height) that grade `lots`; every other building's lot is left as it is, and so is any
 * corner `keep` names (a scenario's levelled terraces, kept flat for the buildings still to come).
 */
export function gradeLots(
  city: City,
  lots: Lot[],
  keep: (corner: number) => boolean = () => false,
): [number, number][] {
  const g = city.grid;
  const W = g.w + 1;
  const h = new Map<number, number>();
  const at = (c: number) => h.get(c) ?? g.heights[c]!;
  // Corners under any building (their plinth covers them) and corners a highway, bridge or channel rests on.
  const lotCorner = new Uint8Array(W * (g.h + 1));
  for (const eid of city.buildingEntities()) {
    const r = city.buildingRecord(eid);
    const [w, d] = city.footprint(city.buildingDef(eid), r.rot);
    for (let z = r.z; z <= r.z + d; z++) for (let x = r.x; x <= r.x + w; x++) lotCorner[z * W + x] = 1;
  }
  // Per corner: a highway rests on it (street), or a bridge, a channel or a kept terrace pins it (fixed).
  const streetC = new Uint8Array(W * (g.h + 1));
  const fixedC = new Uint8Array(W * (g.h + 1));
  for (let t = 0; t < g.w * g.h; t++) {
    const pin = g.road[t] === BRIDGE || city.channelAt(t) !== 0;
    if (!g.road[t] && !pin) continue;
    const [x, z] = [t % g.w, (t / g.w) | 0];
    for (const c of [z * W + x, z * W + x + 1, (z + 1) * W + x, (z + 1) * W + x + 1]) {
      if (g.road[t]) streetC[c] = 1;
      if (pin) fixedC[c] = 1;
    }
  }
  // Kept corners (empty terraces) stay put; a building standing on a terrace may still be graded to its street.
  const fixed = (x: number, z: number) =>
    fixedC[z * W + x] === 1 || (keep(z * W + x) && !lotCorner[z * W + x]);
  const street = (x: number, z: number) => streetC[z * W + x] === 1;
  const wet = (c: number) => at(c) < SEA_LEVEL + 0.05;
  // 1. Pads: each lot stands at its highest corner, lifted to meet a higher street along its edge or a higher lot or
  // kept terrace touching it. Lifting writes lot corners only, which can raise a neighbouring lot's pad, so repeat
  // until no lot moves. The fill is measured from the lot's natural top, so a chain of lifts stays within MAX_FILL.
  const natural = lots.map(({ x, z, w, d }) => g.rangeOver(x, z, w, d).max);
  const pads = lots.map(() => 0);
  for (let pass = 0; pass < PASSES; pass++) {
    let changed = false;
    lots.forEach(({ x, z, w, d }, n) => {
      let pad = -Infinity;
      for (let j = z; j <= z + d; j++) for (let i = x; i <= x + w; i++) pad = Math.max(pad, at(j * W + i));
      // The street to meet: a highway along the edge, or one a few tiles off that a BANK ramp must still reach.
      let road = -Infinity;
      // Ground beside the lot that grading never cuts (another lot, a kept terrace): the lot rises to meet it.
      let meet = -Infinity;
      let low = Infinity;
      for (let j = z - STREET; j <= z + d + STREET; j++)
        for (let i = x - STREET; i <= x + w + STREET; i++) {
          if (i < 0 || j < 0 || i > g.w || j > g.h) continue;
          const k = Math.max(x - i, i - (x + w), z - j, j - (z + d), 0);
          if (k === 0) continue;
          const v = at(j * W + i);
          // Kept terrace corners still count: a street lying on a terrace is a street to meet.
          if (lotCorner[j * W + i] || fixedC[j * W + i]) {
            if (k === 1 && !street(i, j) && v >= SEA_LEVEL + 0.05) meet = Math.max(meet, v);
            continue;
          }
          if (street(i, j)) road = Math.max(road, v - (k - 1) * BANK);
          // Ground no embankment can reach (a lower street, water) beside the lot caps the lift: a corner lot meets
          // its higher street only as far as it can without towering over the lower one.
          if (k === 1 && (street(i, j) || v < SEA_LEVEL + 0.05)) low = Math.min(low, v);
        }
      const limit = Math.min(natural[n]! + MAX_FILL, low + CLIFF);
      if (road > pad + KERB) pad = Math.max(pad, Math.min(road, limit));
      if (meet > pad + 0.02) pad = Math.max(pad, Math.min(meet, limit));
      // Level the lot to its pad (the building covers it): the banks then fall away from a flat edge, and the tiles
      // round it stay gentle enough for highways. Corners a street rests on keep their height.
      for (let j = z; j <= z + d; j++)
        for (let i = x; i <= x + w; i++) {
          const c = j * W + i;
          if (at(c) >= pad - 1e-4 || fixed(i, j) || street(i, j)) continue;
          // Stay within a highway's slope of the ground just outside the lot.
          let to = pad;
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
              const [ii, jj] = [i + di, j + dj];
              if (
                ii < 0 ||
                jj < 0 ||
                ii > g.w ||
                jj > g.h ||
                (ii >= x && ii <= x + w && jj >= z && jj <= z + d)
              )
                continue;
              to = Math.min(to, at(jj * W + ii) + CLIFF - 0.01);
            }
          if (to > at(c) + 1e-4) {
            h.set(c, to);
            changed = true;
          }
        }
      pads[n] = pad;
    });
    if (!changed) break;
  }
  // 2. Banks: open ground round each lot is cut flush with its pad one tile out, then down to a ramp rising BANK per
  // tile beyond; every lot nearby has its say at once (the lowest cap wins).
  const cap = new Map<number, number>();
  lots.forEach(({ x, z, w, d }, n) => {
    for (let j = z - RAMP; j <= z + d + RAMP; j++)
      for (let i = x - RAMP; i <= x + w + RAMP; i++) {
        if (i < 0 || j < 0 || i > g.w || j > g.h) continue;
        const k = Math.max(x - i, i - (x + w), z - j, j - (z + d), 0);
        const c = j * W + i;
        if (k === 0 || lotCorner[c] || street(i, j) || fixed(i, j) || wet(c)) continue;
        cap.set(c, Math.min(cap.get(c) ?? Infinity, pads[n]! + (k - 1) * BANK));
      }
  });
  for (const [c, hi] of cap) {
    if (at(c) > hi + 1e-4) h.set(c, hi);
  }
  // 3. Seams: where a ramp or a levelled lot meets ground grading left alone (natural slopes beyond the ramp,
  // streets, bridges, channels, water), keep every tile within a highway's slope limit. A corner that cannot be
  // brought within CLIFF of all its untouched neighbours keeps its own height.
  const moved = [...h.keys()];
  for (const c of moved) {
    const [x, z] = [c % W, (c / W) | 0];
    let lo = -Infinity;
    let hi = Infinity;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const [i, j] = [x + dx, z + dz];
        if ((!dx && !dz) || i < 0 || j < 0 || i > g.w || j > g.h) continue;
        const n = j * W + i;
        if (h.has(n)) continue;
        lo = Math.max(lo, g.heights[n]! - CLIFF);
        hi = Math.min(hi, g.heights[n]! + CLIFF);
      }
    const to = Math.min(hi, Math.max(lo, h.get(c)!));
    // Never lift a cut bank above its cap to meet a seam: that would put the hollow back.
    if (lo > hi || to > (cap.get(c) ?? Infinity) + 1e-4) h.delete(c);
    else h.set(c, to);
  }
  // 4. Check: a tile grading left steeper than a highway allows (and steeper than it was) gets its moved corners back.
  // Only ever reverting, so this settles.
  const cornersOf = (t: number) => {
    const [x, z] = [t % g.w, (t / g.w) | 0];
    return [z * W + x, z * W + x + 1, (z + 1) * W + x, (z + 1) * W + x + 1];
  };
  const tilesOf = (c: number) => {
    const [x, z] = [c % W, (c / W) | 0];
    const out: number[] = [];
    for (const [i, j] of [
      [x - 1, z - 1],
      [x, z - 1],
      [x - 1, z],
      [x, z],
    ])
      if (i >= 0 && j >= 0 && i < g.w && j < g.h) out.push(j * g.w + i);
    return out;
  };
  const steep = (t: number, now: (c: number) => number) => {
    const cs = cornersOf(t).map(now);
    return Math.max(...cs) - Math.min(...cs);
  };
  const queue = [...new Set([...h.keys()].flatMap(tilesOf))];
  while (queue.length) {
    const t = queue.pop()!;
    const after = steep(t, at);
    if (after <= CLIFF || after <= steep(t, (c) => g.heights[c]!) + 1e-4) continue;
    for (const c of cornersOf(t)) if (h.delete(c)) queue.push(...tilesOf(c));
  }
  return [...h].filter(([c, v]) => Math.abs(v - g.heights[c]!) > 1e-5);
}

/** The lots of every building in the city. */
export function allLots(city: City): Lot[] {
  return city.buildingEntities().map((eid) => {
    const r = city.buildingRecord(eid);
    const [w, d] = city.footprint(city.buildingDef(eid), r.rot);
    return { x: r.x, z: r.z, w, d };
  });
}
