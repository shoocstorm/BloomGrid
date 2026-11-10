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

  it('cuts the ground one tile out flush with the pad, so nothing beside the lot stands above it', () => {
    const { s, g, W, x0, z0 } = flatSite();
    const [x, z] = [x0 + 6, z0 + 6];
    for (let j = z0; j <= z0 + 16; j++) for (let i = x + 3; i <= x0 + 24; i++) g.heights[j * W + i] = 1.4;
    s.city.refreshTerrainDerived();
    expect(s.commands.execute('build', { def: 'garden-residence', x, z, rot: 0 })).toBe(true);
    expect(g.padOver(x, z, 2, 2)).toBeCloseTo(g.rangeOver(x, z, 2, 2).max, 4);
    expect(g.corner(x + 3, z + 1)).toBeLessThanOrEqual(g.rangeOver(x, z, 2, 2).max + 1e-4);
  });

  it('lifts a lot to meet a higher neighbouring lot touching it (D-154)', () => {
    const { s, g, W, x0, z0 } = flatSite();
    const z = z0 + 6;
    // A 1.6 shelf east of x0 + 9: the first house stands on it, the second on the 1.0 ground right beside it.
    for (let j = z0; j <= z0 + 16; j++) for (let i = x0 + 9; i <= x0 + 24; i++) g.heights[j * W + i] = 1.6;
    s.city.refreshTerrainDerived();
    expect(s.commands.execute('build', { def: 'garden-residence', x: x0 + 9, z, rot: 0 })).toBe(true);
    expect(s.commands.execute('build', { def: 'garden-residence', x: x0 + 7, z, rot: 0 })).toBe(true);
    // The lower lot came up to the shelf: both pads agree and neither building stands on a plinth.
    expect(g.rangeOver(x0 + 7, z, 2, 2).min).toBeCloseTo(1.6, 2);
    expect(g.padOver(x0 + 7, z, 2, 2)).toBeCloseTo(g.rangeOver(x0 + 7, z, 2, 2).max, 4);
    expect(g.padOver(x0 + 9, z, 2, 2)).toBeCloseTo(g.rangeOver(x0 + 9, z, 2, 2).max, 4);
    s.commands.undo();
    s.commands.undo();
    expect(g.corner(x0 + 7, z)).toBeCloseTo(1, 4);
  });

  it('seats a building at the ground beside its lot when grading could not cut it (D-154)', () => {
    const { s, g, W, x0, z0 } = flatSite();
    const [x, z] = [x0 + 6, z0 + 6];
    expect(s.commands.execute('build', { def: 'garden-residence', x, z, rot: 0 })).toBe(true);
    const top = g.rangeOver(x, z, 2, 2).max;
    expect(g.padOver(x, z, 2, 2)).toBeCloseTo(top, 4);
    // Ground beside the lot raised after the fact (a terrace edit): the pad follows it, the lot does not.
    g.heights[(z + 1) * W + x + 3] = top + 0.7;
    s.city.refreshTerrainDerived();
    expect(g.padOver(x, z, 2, 2)).toBeCloseTo(top + 0.7, 4);
    expect(g.rangeOver(x, z, 2, 2).max).toBeCloseTo(top, 4);
  });

  it('leaves no showcase building buried: nothing beside a lot stands more than a highway step above its top', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    const c = s.city;
    const g = c.grid;
    let plinths = 0;
    for (const e of c.buildingEntities()) {
      const r = c.buildingRecord(e);
      const [w, d] = c.footprint(c.buildingDef(e), r.rot);
      // The plinth a building stands on where grading could not bring the ground beside it down or the lot up.
      const plinth = g.padOver(r.x, r.z, w, d) - g.rangeOver(r.x, r.z, w, d).max;
      expect(plinth).toBeLessThanOrEqual(CLIFF + 0.01);
      if (plinth > BANK) plinths++;
    }
    // Was 23 hollows before grading (D-099), 46 lots with ground more than a ramp step above them before D-154.
    expect(plinths).toBeLessThanOrEqual(30);
  });
});
