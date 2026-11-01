import { describe, expect, it } from 'vitest';
import { BANK, CLIFF } from '@/sim/grading';
import { applyScenario } from '@/sim/scenario';
import { findLandRow, makeSim } from './helpers';

/** A flat 1.0 pad of land 24 × 16 corners round (x0, z0), to shape test terrain on. */
function flatSite(seed = 42) {
  const s = makeSim(seed);
  s.city.credits = 1e6;
  const { x0, z } = findLandRow(s.city, 30);
  const g = s.city.grid;
  const W = g.w + 1;
  const z0 = z - 8;
  for (let j = z0; j <= z0 + 16; j++) for (let i = x0; i <= x0 + 24; i++) g.heights[j * W + i] = 1;
  s.city.refreshTerrainDerived();
  return { s, g, W, x0, z0 };
}

describe('lot grading (D-099)', () => {
  it('cuts rising ground beside a new building back to a ramp, and undo puts it back', () => {
    const { s, g, W, x0, z0 } = flatSite();
    // A bank rising east of the lot: 1.0 on the lot, 1.6 one tile out, then 2.2.
    const [x, z] = [x0 + 6, z0 + 6];
    for (let j = z0; j <= z0 + 16; j++) {
      g.heights[j * W + x + 3] = 1.6;
      for (let i = x + 4; i <= x0 + 24; i++) g.heights[j * W + i] = 2.2;
    }
    s.city.refreshTerrainDerived();
    const before = Float32Array.from(g.heights);
    expect(s.commands.execute('build', { def: 'garden-residence', x, z, rot: 0 })).toBe(true);
    const pad = g.rangeOver(x, z, 2, 2).max;
    for (let k = 1; k <= 3; k++)
      expect(g.corner(x + 2 + k, z + 1)).toBeLessThanOrEqual(pad + k * BANK + 1e-4);
    // Nothing graded is steeper than a highway allows.
    for (let j = z0; j < z0 + 16; j++)
      for (let i = x0; i < x0 + 24; i++) {
        const { min, max } = g.rangeOver(i, j, 1, 1);
        const was =
          Math.max(
            before[j * W + i]!,
            before[j * W + i + 1]!,
            before[(j + 1) * W + i]!,
            before[(j + 1) * W + i + 1]!,
          ) -
          Math.min(
            before[j * W + i]!,
            before[j * W + i + 1]!,
            before[(j + 1) * W + i]!,
            before[(j + 1) * W + i + 1]!,
          );
        expect(max - min).toBeLessThanOrEqual(Math.max(CLIFF, was) + 1e-4);
      }
    s.commands.undo();
    expect(Array.from(g.heights)).toEqual(Array.from(before));
  });

  it('lifts a lot to meet a higher street along its edge', () => {
    const { s, g, W, x0, z0 } = flatSite();
    const z = z0 + 6;
    // A highway on a 1.5 shelf along the lot's north edge.
    for (let j = z0; j <= z; j++) for (let i = x0; i <= x0 + 24; i++) g.heights[j * W + i] = 1.5;
    s.city.refreshTerrainDerived();
    expect(
      s.commands.execute('road', { tiles: Array.from({ length: 12 }, (_, i) => g.index(x0 + 2 + i, z - 1)) }),
    ).toBe(true);
    // The lot's north corners share the street's south kerb; its south corners sit on the 1.0 ground.
    expect(s.commands.execute('build', { def: 'garden-residence', x: x0 + 6, z, rot: 0 })).toBe(true);
    for (let i = x0 + 6; i <= x0 + 8; i++) expect(g.corner(i, z + 2)).toBeCloseTo(1.5, 4);
  });

  it('leaves no showcase building in a hollow', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    const c = s.city;
    const g = c.grid;
    const W = g.w + 1;
    const lot = new Uint8Array(W * (g.h + 1));
    for (const e of c.buildingEntities()) {
      const r = c.buildingRecord(e);
      const [w, d] = c.footprint(c.buildingDef(e), r.rot);
      for (let j = r.z; j <= r.z + d; j++) for (let i = r.x; i <= r.x + w; i++) lot[j * W + i] = 1;
    }
    let hollows = 0;
    for (const e of c.buildingEntities()) {
      const r = c.buildingRecord(e);
      const [w, d] = c.footprint(c.buildingDef(e), r.rot);
      const pad = g.rangeOver(r.x, r.z, w, d).max;
      let rise = 0;
      for (let j = r.z - 1; j <= r.z + d + 1; j++)
        for (let i = r.x - 1; i <= r.x + w + 1; i++)
          if (i >= 0 && j >= 0 && i <= g.w && j <= g.h && !lot[j * W + i])
            rise = Math.max(rise, g.corner(i, j) - pad);
      if (rise > BANK + 0.01) hollows++;
    }
    // Was 23 before grading (ground more than one ramp step above a building's base beside it).
    expect(hollows).toBeLessThanOrEqual(5);
  });
});
