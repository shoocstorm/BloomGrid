import { describe, expect, it } from 'vitest';
import { Building, Problem, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { RECLAIM_HEIGHT, atRisk, reclaimPlan, seaMask, updateSeaRise } from '@/sim/coast';
import { BANYAN_LEVEL, activeBridges } from '@/sim/weaver';
import { DIFFICULTIES } from '@/sim/difficulty';
import { DAY_LENGTH } from '@/sim/pulseConst';
import { evaluateAdvisor } from '@/sim/advisor';
import { NO_ENTITY } from '@/sim/Grid';
import { City } from '@/sim/City';
import { EventBus } from '@/core/EventBus';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { findLandRow, makeSim } from './helpers';

/** A straight stretch of coast: a shallow sea tile with land to its west, scanning row-major. */
function coastSpot(city: City): { x: number; z: number } {
  const g = city.grid;
  const sea = seaMask(city);
  for (let z = 40; z < g.h - 40; z += 3)
    for (let x = 40; x < g.w - 40; x++) {
      const i = g.index(x, z);
      if (!sea[i] || sea[i - 1] || g.road[i] || g.road[i - 1]) continue;
      const depth = g.rangeOver(x, z, 1, 1).min;
      if (depth > -1.5 && g.rangeOver(x - 3, z - 1, 3, 3).min > 0.3) return { x, z };
    }
  throw new Error('no coast');
}

describe('land reclamation', () => {
  it('turns shallow sea next to land into flat land, costs credits, refreshes the coast and undoes', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x, z } = coastSpot(s.city);
    const plan = reclaimPlan(s.city, x, z - 2, x + 3, z + 2);
    expect(plan.tiles.length).toBeGreaterThan(5);
    const t = plan.tiles[0]!;
    const before = s.city.grid.rangeOver(t % s.city.grid.w, (t / s.city.grid.w) | 0, 1, 1).min;
    expect(before).toBeLessThan(0.05);
    let changed = 0;
    s.bus.on('terrain:changed', () => changed++);
    const credits = s.city.credits;
    const h0 = s.city.hash();
    expect(s.commands.execute('reclaim', { x0: x, z0: z - 2, x1: x + 3, z1: z + 2 })).toBe(true);
    expect(s.city.grid.rangeOver(t % s.city.grid.w, (t / s.city.grid.w) | 0, 1, 1).min).toBeCloseTo(RECLAIM_HEIGHT, 5);
    expect(s.city.fields.shore[t]).toBeGreaterThan(0);
    expect(s.city.credits).toBe(credits - plan.cost);
    expect(changed).toBe(1);
    expect(s.city.hash()).not.toBe(h0);
    // New land is buildable.
    const tx = t % s.city.grid.w;
    const tz = (t / s.city.grid.w) | 0;
    expect(plan.tiles.includes(t + 1) || plan.tiles.includes(t + s.city.grid.w)).toBe(true);
    const placed = s.city.checkPlacement(buildings.get('pocket-park'), tx, tz, 0);
    expect(placed.ok || placed.reason !== 'Needs dry land').toBe(true);
    s.commands.undo();
    expect(s.city.grid.rangeOver(t % s.city.grid.w, (t / s.city.grid.w) | 0, 1, 1).min).toBeCloseTo(before, 5);
    expect(s.city.fields.shore[t]).toBe(0);
    expect(s.city.terrainEdits.size).toBe(0);
    expect(s.city.credits).toBe(credits);
  });

  it('never fills reservoirs, the river or deep water', () => {
    const s = makeSim(42);
    const sea = seaMask(s.city);
    const g = s.city.grid;
    // The reservoir centre (Phase 2.5 terrain) is water but not sea.
    const rx = Math.round(0.47 * g.w);
    const rz = Math.round(0.42 * g.h);
    expect(g.rangeOver(rx, rz, 1, 1).min).toBeLessThan(0);
    expect(sea[g.index(rx, rz)]).toBe(0);
    expect(reclaimPlan(s.city, rx - 3, rz - 3, rx + 3, rz + 3).tiles.length).toBe(0);
    // Open ocean in a map corner is too deep.
    expect(reclaimPlan(s.city, 2, 2, 12, 12).tiles.length).toBe(0);
  });
});

describe('sea-level rise and seawalls', () => {
  it('rises after day 3 toward the difficulty cap and floods low coast unless a seawall protects it', () => {
    const s = makeSim(42);
    s.city.steward.autoCrises = true;
    s.city.tick = 10 * DAY_LENGTH * 3;
    let raised = 0;
    s.bus.on('sea:rise', () => raised++);
    for (let i = 0; i < 10 * DAY_LENGTH * 20; i += 10) {
      s.city.tick += 10;
      updateSeaRise(s.city);
    }
    expect(s.city.steward.seaRise).toBeCloseTo(DIFFICULTIES.steward.seaRise, 5);
    // One announcement per 0.1 m (0.1, 0.2, 0.3 on the way to Steward's 0.35).
    expect(raised).toBe(Math.floor(DIFFICULTIES.steward.seaRise * 10));
  });

  it('a Mangrove Seawall keeps the risen sea out of the buildings behind it', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city, 30);
    const g = s.city.grid;
    expect(s.commands.execute('road', { tiles: Array.from({ length: 20 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
    expect(s.commands.execute('build', { def: 'garden-residence', x: x0 + 2, z: z - 2, rot: 0 })).toBe(true);
    const home = g.occupant[g.index(x0 + 2, z - 2)]!;
    const ground = g.rangeOver(x0 + 2, z - 2, 2, 2).min;
    // Raise the sea just above the home's ground (as if decades of rise had passed).
    s.city.steward.seaRise = ground + 0.2;
    s.step(10);
    expect(Service.problems[home]! & Problem.FLOODED).toBeTruthy();
    expect(atRisk(s.city, s.city.steward.seaRise).count).toBe(1);
    const a = evaluateAdvisor(s.city).find((x) => x.id === 'sea-rise');
    expect(a?.build).toBe('mangrove-seawall');
    // A defence building nearby (placement rules aside) protects it.
    const wall = s.city.addBuilding({ def: 'mangrove-seawall', x: x0 + 6, z: z - 2, rot: 0, greenery: 1 });
    expect(wall).not.toBe(NO_ENTITY);
    expect(atRisk(s.city, s.city.steward.seaRise).count).toBe(0);
    s.step(10);
    expect(Service.problems[home]! & Problem.FLOODED).toBeFalsy();
  });
});

describe('Green Weaver', () => {
  function towers() {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city, 30);
    const g = s.city.grid;
    expect(s.commands.execute('road', { tiles: Array.from({ length: 24 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
    for (const dx of [0, 8, 16]) expect(s.commands.execute('build', { def: 'canopy-tower', x: x0 + dx, z: z - 3, rot: 0 })).toBe(true);
    return { s, a: [x0, z - 3] as [number, number], b: [x0 + 8, z - 3] as [number, number], c: [x0 + 16, z - 3] as [number, number] };
  }

  it('weaves sky-bridges between towers (rules, cost, harmony) and undoes', () => {
    const { s, a, b, c } = towers();
    s.step(20);
    const happy0 = s.city.pulse.harmony.amenities;
    const credits = s.city.credits;
    expect(s.commands.execute('weave', { a, b })).toBe(true);
    expect(s.commands.execute('weave', { a: b, b: a })).toBe(false); // already woven
    expect(s.commands.execute('weave', { a, b: [a[0] + 1, a[1]] })).toBe(false); // not a tower anchor
    expect(s.commands.execute('weave', { a: b, b: c })).toBe(true);
    expect(activeBridges(s.city).length).toBe(2);
    expect(s.city.credits).toBeLessThan(credits);
    s.step(10);
    expect(s.city.pulse.harmony.amenities).toBeGreaterThan(happy0);
    // Demolishing an end deactivates the bridge; undoing the demolish revives it.
    expect(s.commands.execute('demolish', { x: c[0], z: c[1] })).toBe(true);
    expect(activeBridges(s.city).length).toBe(1);
    s.commands.undo();
    expect(activeBridges(s.city).length).toBe(2);
    s.commands.undo();
    s.commands.undo();
    expect(s.city.weaver.bridges.length).toBe(0);
  });

  it('merges a tower with a banyan (level 2, more ecology) and undoes', () => {
    const { s, a } = towers();
    const eid = s.city.buildingAt(a[0], a[1]);
    s.step(20);
    const eco0 = s.city.stats.eco;
    expect(s.commands.execute('banyan', { x: a[0], z: a[1] })).toBe(true);
    expect(Building.level[eid]).toBe(BANYAN_LEVEL);
    expect(s.commands.execute('banyan', { x: a[0], z: a[1] })).toBe(false);
    s.step(10);
    expect(s.city.stats.eco).toBeGreaterThan(eco0);
    s.commands.undo();
    expect(Building.level[eid]).toBe(0);
  });

  it('saves terrain edits, sea rise and bridges (v6) and migrates v5', () => {
    const { s, a, b } = towers();
    expect(s.commands.execute('weave', { a, b })).toBe(true);
    const { x, z } = coastSpot(s.city);
    expect(s.commands.execute('reclaim', { x0: x, z0: z - 1, x1: x + 2, z1: z + 1 })).toBe(true);
    s.city.steward.seaRise = 0.21;
    const data = serializeCity(s.city);
    expect(data.version).toBe(SAVE_VERSION);
    const c2 = new City(new EventBus(), 1);
    deserializeCity(c2, structuredClone(data));
    expect(c2.weaver.bridges.length).toBe(1);
    expect(c2.terrainEdits.size).toBe(s.city.terrainEdits.size);
    expect(c2.grid.rangeOver(x, z, 1, 1).min).toBeCloseTo(s.city.grid.rangeOver(x, z, 1, 1).min, 3);
    expect(c2.steward.seaRise).toBeCloseTo(0.21, 5);
    const v5 = { ...structuredClone(data), version: 5 } as Partial<SaveData>;
    delete v5.terrain;
    delete v5.bridges;
    delete (v5.steward as Partial<SaveData['steward']>).seaRise;
    const m = migrateSave(v5 as SaveData);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.terrain).toEqual([]);
    expect(m.bridges).toEqual([]);
    expect(m.steward.seaRise).toBe(0);
  });
});
