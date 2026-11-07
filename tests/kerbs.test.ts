import { describe, expect, it } from 'vitest';
import { KERB_H, PAVE_W, paveRise } from '@/modules/construction/RoadRenderer';
import type { Grid } from '@/sim/Grid';

/** A 5×5 stub grid with an east–west highway along row 2 (D-134). */
function street(level: number) {
  const w = 5;
  const road = new Uint8Array(w * w);
  for (let x = 0; x < w; x++) road[2 * w + x] = 1;
  const grid = { w, h: w, road, inBounds: (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < w, index: (x: number, z: number) => z * w + x };
  return { city: { grid: grid as unknown as Grid }, levels: new Uint8Array(w * w).fill(level) };
}

describe('raised pavements (D-134)', () => {
  it('raises the bands along open sides of a paved highway, not the carriageway', () => {
    const { city, levels } = street(1);
    const w = PAVE_W[1]!;
    expect(paveRise(city, 2.5, 2 + w / 2, levels)).toBe(KERB_H); // north pavement
    expect(paveRise(city, 2.5, 3 - w / 2, levels)).toBe(KERB_H); // south pavement
    expect(paveRise(city, 2.5, 2.5, levels)).toBe(0); // carriageway
    expect(paveRise(city, 2.5, 1.5, levels)).toBe(0); // off the road
  });

  it('gives raw tracks no pavement and boulevards a wider one', () => {
    expect(paveRise(street(0).city, 2.5, 2.05, street(0).levels)).toBe(0);
    const { city, levels } = street(2);
    expect(paveRise(city, 2.5, 2 + PAVE_W[2]! - 0.01, levels)).toBe(KERB_H);
    expect(PAVE_W[2]!).toBeGreaterThan(PAVE_W[1]!);
  });

  it('has no pavement on a side shared with another highway tile', () => {
    const { city, levels } = street(1);
    // Along the road (x direction) the neighbours are road: the tile's east edge is carriageway.
    expect(paveRise(city, 2.98, 2.5, levels)).toBe(0);
  });
});
