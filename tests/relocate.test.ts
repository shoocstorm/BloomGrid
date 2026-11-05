import { describe, expect, it } from 'vitest';
import { Building } from '@/ecs/components';
import { NO_ENTITY } from '@/sim/Grid';
import { ignite } from '@/sim/hazards';
import { MOVE_FEE, relocatePlan } from '@/sim/relocate';
import { activeBridges } from '@/sim/weaver';
import { findLandRow, makeSim } from './helpers';

/** A highway with three towers along it (anchors a, b, c), and free lots further along. */
function towers() {
  const s = makeSim(42);
  s.city.credits = 1e6;
  const { x0, z } = findLandRow(s.city, 40);
  const g = s.city.grid;
  expect(
    s.commands.execute('road', { tiles: Array.from({ length: 36 }, (_, i) => g.index(x0 + i, z)) }),
  ).toBe(true);
  for (const dx of [0, 8, 16])
    expect(s.commands.execute('build', { def: 'canopy-tower', x: x0 + dx, z: z - 3, rot: 0 })).toBe(true);
  return { s, x0, z, a: [x0, z - 3] as [number, number], b: [x0 + 8, z - 3] as [number, number] };
}

describe('relocating a building (Shift-drag in Inspect)', () => {
  it('moves a building with its id and history for a fee, and undo/redo round-trip the hash', () => {
    const { s, x0, z, a } = towers();
    s.step(20);
    const eid = s.city.buildingAt(a[0], a[1]);
    const uid = Building.uid[eid]!;
    Building.tier[eid] = 2;
    const before = s.city.hash();
    const credits = s.city.credits;
    const to = { x: x0 + 26, z: z + 1 };
    expect(s.commands.execute('move', { from: a, ...to, rot: 1 })).toBe(true);
    expect(s.city.buildingAt(a[0], a[1])).toBe(NO_ENTITY);
    const moved = s.city.buildingAt(to.x, to.z);
    expect(Building.uid[moved]).toBe(uid);
    expect(Building.tier[moved]).toBe(2);
    expect(Building.rot[moved]).toBe(1);
    expect(s.city.credits).toBeCloseTo(credits - Math.round(s.city.buildingDef(moved).stats.cost * MOVE_FEE));
    const after = s.city.hash();
    s.commands.undo();
    expect(s.city.hash()).toBe(before);
    expect(Building.uid[s.city.buildingAt(a[0], a[1])]).toBe(uid);
    s.commands.redo();
    expect(s.city.hash()).toBe(after);
  });

  it('refuses occupied, burning and unchanged lots, but may overlap its own', () => {
    const { s, a, b } = towers();
    const eid = s.city.buildingAt(a[0], a[1]);
    expect(relocatePlan(s.city, eid, b[0], b[1], 0).ok).toBe(false); // another tower stands there
    expect(relocatePlan(s.city, eid, a[0], a[1], 0)).toMatchObject({ ok: false, reason: 'Already here' });
    expect(relocatePlan(s.city, eid, a[0] - 1, a[1], 0).ok).toBe(true); // a step over its own lot
    ignite(s.city, eid, 'lightning', 0.8);
    expect(relocatePlan(s.city, eid, a[0] - 1, a[1], 0).ok).toBe(false);
    expect(s.commands.execute('move', { from: a, x: a[0] - 1, z: a[1], rot: 0 })).toBe(false);
  });

  it('takes down sky-bridges woven to a moved tower; undo weaves them back in place', () => {
    const { s, x0, z, a, b } = towers();
    expect(s.commands.execute('weave', { a, b })).toBe(true);
    const bridges = s.city.weaver.bridges.map((x) => ({ ...x }));
    expect(relocatePlan(s.city, s.city.buildingAt(b[0], b[1]), x0 + 26, z + 1, 0).bridges).toBe(1);
    expect(s.commands.execute('move', { from: b, x: x0 + 26, z: z + 1, rot: 0 })).toBe(true);
    expect(s.city.weaver.bridges.length).toBe(0);
    s.commands.undo();
    expect(s.city.weaver.bridges).toEqual(bridges);
    expect(activeBridges(s.city).length).toBe(1);
  });
});
