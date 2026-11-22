import { describe, expect, it } from 'vitest';
import { setCorners } from '@/sim/coast';
import { ROAD_PLAN_COSTS } from '@/sim/commands';
import { joinsNetwork, smartRoute, snapToRoad } from '@/sim/roadPlan';
import { findLandRow, makeSim } from './helpers';

/** A flat 40×24 patch of land with a highway along its row `z` from x0 to x0 + 30. */
function patch() {
  const s = makeSim(11);
  const { x0, z } = findLandRow(s.city, 40);
  const g = s.city.grid;
  const W = g.w + 1;
  const edits: [number, number][] = [];
  for (let cz = z - 12; cz <= z + 13; cz++) for (let i = 0; i <= 40; i++) edits.push([cz * W + x0 + i, 1]);
  setCorners(s.city, edits);
  const row: number[] = [];
  for (let i = 0; i <= 30; i++) row.push(g.index(x0 + i, z));
  s.city.setRoads(row, true);
  return { s, g, x0, z };
}

describe('smart highways (D-202)', () => {
  it('snaps a drag that ends just short of a highway onto it', () => {
    const { s, x0, z } = patch();
    const snap = snapToRoad(s.city, { x: x0 + 10, z: z + 2 }, { x: x0 + 10, z: z + 10 });
    expect(snap).toEqual({ x: x0 + 10, z, snapped: true });
    const r = smartRoute(s.city, { x: x0 + 10, z: z + 10 }, { x: x0 + 10, z: z + 2 }, ROAD_PLAN_COSTS);
    expect(r.joins).toBe(1);
    expect(r.plan.place.length).toBe(10);
    expect(joinsNetwork(s.city, r.plan)).toBe(true);
  });

  it('keeps a road drawn beside another on its own line, joined by a short link', () => {
    const { s, g, x0, z } = patch();
    const r = smartRoute(s.city, { x: x0 + 2, z: z + 2 }, { x: x0 + 20, z: z + 2 }, ROAD_PLAN_COSTS);
    // Never pulled onto the existing highway: every tile of the drawn row is laid, plus one tile joining it.
    for (let i = 2; i <= 20; i++) expect(r.plan.place).toContain(g.index(x0 + i, z + 2));
    expect(r.plan.place.length).toBe(20);
    expect(joinsNetwork(s.city, r.plan)).toBe(true);
  });

  it('a click links that spot to the nearest highway', () => {
    const { s, g, x0, z } = patch();
    const p = { x: x0 + 5, z: z + 7 };
    const r = smartRoute(s.city, p, p, ROAD_PLAN_COSTS);
    expect(r.via).toBe('link');
    expect(r.plan.place.length).toBe(7);
    expect(r.plan.place[0]).toBe(g.index(p.x, p.z));
    expect(joinsNetwork(s.city, r.plan)).toBe(true);
  });

  it('routes round a building instead of skipping through it', () => {
    const { s, g, x0, z } = patch();
    // A 3×3 lot in the way of a straight drag.
    for (let dz = 5; dz < 8; dz++) for (let dx = 9; dx < 12; dx++) g.occupant[g.index(x0 + dx, z + dz)] = 1;
    const r = smartRoute(s.city, { x: x0 + 2, z: z + 6 }, { x: x0 + 20, z: z + 6 }, ROAD_PLAN_COSTS);
    expect(r.via).toBe('detour');
    expect(r.plan.skipped).toEqual([]);
    for (const t of r.plan.path) expect(g.occupant[t]).not.toBe(1);
    // And the command lays it as planned.
    expect(s.commands.execute('road', { tiles: r.plan.path, bridges: true })).toBeTruthy();
    for (const t of r.plan.place) expect(g.road[t]).toBeGreaterThan(0);
  });
});
