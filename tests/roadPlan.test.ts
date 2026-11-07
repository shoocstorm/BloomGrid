import { describe, expect, it } from 'vitest';
import { setCorners } from '@/sim/coast';
import { ROAD_PLAN_COSTS } from '@/sim/commands';
import { bestRoute, lPath, planRoad } from '@/sim/roadPlan';
import { findLandRow, makeSim } from './helpers';

/**
 * A crossing built by hand along one row: land at 1.0, a gentle rise, a bank tile too steep for a highway (1.9 down
 * to 0.1), a four-tile channel, a low far bank and land again. Corner columns are written for four rows.
 */
function crossing() {
  const s = makeSim(11);
  const { x0, z } = findLandRow(s.city, 30);
  const g = s.city.grid;
  const W = g.w + 1;
  const col: Record<number, number> = { 6: 1.2, 7: 1.9, 8: 0.1, 9: -1, 10: -1, 11: -1, 12: -1, 13: 0.4 };
  const edits: [number, number][] = [];
  for (let cz = z - 2; cz <= z + 3; cz++)
    for (let i = 0; i <= 24; i++) edits.push([cz * W + x0 + i, col[i] ?? 1]);
  setCorners(s.city, edits);
  const row = (a: number, b: number) => lPath(s.city, { x: x0 + a, z }, { x: x0 + b, z }, true);
  return { s, x0, z, row, t: (i: number) => g.index(x0 + i, z) };
}

describe('highway planning (D-125)', () => {
  it('grades a steep bank into an abutment so the bridge lands on both banks', () => {
    const { s, row, t } = crossing();
    expect(s.city.canRoad(t(7), true)).toBe(false); // the old rule skipped it
    const plan = planRoad(s.city, row(2, 18), true, ROAD_PLAN_COSTS);
    expect(plan.skipped).toEqual([]);
    expect(plan.place).toContain(t(7));
    expect(plan.grade.length).toBeGreaterThan(0);
    expect(plan.bridges).toBeGreaterThanOrEqual(4);
    const before = s.city.hash();
    expect(s.commands.execute('road', { tiles: row(2, 18), bridges: true })).toBe(true);
    for (let i = 2; i <= 18; i++) expect(s.city.grid.road[t(i)]).toBeGreaterThan(0);
    s.commands.undo();
    expect(s.city.hash()).toBe(before);
  });

  it('carries a drag released over the water on to the far bank', () => {
    const { s, row, t } = crossing();
    const plan = planRoad(s.city, row(2, 10), true, ROAD_PLAN_COSTS);
    expect(plan.path.at(-1)).toBe(t(13));
    expect(plan.place).toContain(t(13));
    // And one started over the water reaches back to the near bank.
    const back = planRoad(s.city, row(11, 2), true, ROAD_PLAN_COSTS);
    expect(back.place).toContain(t(2));
  });

  it('says why tiles are skipped, and stops where the credits run out', () => {
    const { s, row } = crossing();
    const poor = planRoad(s.city, row(2, 18), true, ROAD_PLAN_COSTS, 60);
    expect(poor.cost).toBeLessThanOrEqual(60);
    expect(poor.skipped.some((k) => k.reason === 'credits')).toBe(true);
    const dry = planRoad(s.city, row(2, 18), false, ROAD_PLAN_COSTS);
    expect(dry.skipped.some((k) => k.reason === 'steep')).toBe(true);
  });

  it('picks the L route that does not bend in the water', () => {
    const { s, x0, z } = crossing();
    // From the near bank to a point in the channel two rows down: one L bends in the water, the other on land.
    const plan = bestRoute(s.city, { x: x0 + 2, z }, { x: x0 + 11, z: z + 2 }, ROAD_PLAN_COSTS);
    const g = s.city.grid;
    for (let i = 1; i < plan.path.length - 1; i++) {
      const bend = plan.path[i]! - plan.path[i - 1]! !== plan.path[i + 1]! - plan.path[i]!;
      if (bend) expect(s.city.isWaterTile(plan.path[i]! % g.w, (plan.path[i]! / g.w) | 0)).toBe(false);
    }
    expect(plan.skipped).toEqual([]);
    expect(plan.bridges).toBeGreaterThanOrEqual(4);
  });
});
