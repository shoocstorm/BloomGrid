import { describe, expect, it } from 'vitest';
import { Problem, Service } from '@/ecs/components';
import { applyScenario } from '@/sim/scenario';
import { PULSE_TICKS } from '@/sim/pulse';
import { deserializeCity, serializeCity, type SaveData } from '@/sim/save';
import { City } from '@/sim/City';
import { EventBus } from '@/core/EventBus';
import { findLandRow, makeSim } from './helpers';

/** Lays a straight east-west highway and returns the first free land x along it. */
function strip(s: ReturnType<typeof makeSim>, z: number, x0: number, len: number) {
  const tiles = Array.from({ length: len }, (_, i) => s.city.grid.index(x0 + i, z));
  s.commands.execute('road', { tiles });
  return tiles;
}

describe('city pulse', () => {
  it('runs field passes half a window after the pulse, never on the pulse tick', () => {
    const s = makeSim(42);
    applyScenario(s.city, 'founding-city');
    const fieldTicks = new Set<number>();
    for (const ev of ['bloom:updated', 'floranet:updated', 'activity:updated', 'mobility:updated'] as const)
      s.bus.on(ev, () => fieldTicks.add(s.city.tick % PULSE_TICKS));
    s.step(PULSE_TICKS * 12);
    expect([...fieldTicks]).toEqual([PULSE_TICKS >> 1]);
  });

  it('cuts power to homes without a producer, and restores it when one is connected', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city);
    strip(s, z, x0, 40);
    let homes = 0;
    let eid = -1;
    for (let x = x0; x < x0 + 36 && homes < 4; x += 3)
      if (s.commands.execute('build', { def: 'garden-residence', x, z: z + 1, rot: 0 })) {
        if (eid < 0) eid = s.city.buildingAt(x, z + 1);
        homes++;
      }
    expect(homes).toBeGreaterThan(0);
    s.step(100);
    expect(Service.power[eid]).toBe(0);
    expect(Service.problems[eid]! & Problem.NO_POWER).toBeTruthy();
    expect(s.city.pulse.tiers.energy).toBeGreaterThanOrEqual(3);

    // Connect a solar spire to the same highway.
    let ok = false;
    for (let sx = x0; sx < x0 + 40 && !ok; sx++) ok = s.commands.execute('build', { def: 'solar-spire', x: sx, z: z - 2, rot: 0 });
    expect(ok).toBe(true);
    s.step(30);
    expect(Service.power[eid]).toBe(1);
  });

  it('buildings without highway access report NO_ROAD', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city);
    let placed = -1;
    for (let x = x0; x < x0 + 30 && placed < 0; x += 3)
      if (s.commands.execute('build', { def: 'garden-residence', x, z, rot: 0 })) placed = s.city.buildingAt(x, z);
    s.step(20);
    expect(Service.problems[placed]! & Problem.NO_ROAD).toBeTruthy();
  });

  it('tax changes are undoable and affect harmony', () => {
    const s = makeSim(3);
    expect(s.commands.execute('setTax', { rate: 0.22 })).toBe(true);
    expect(s.city.pulse.taxRate).toBe(0.22);
    s.step(20);
    expect(s.city.pulse.harmony.taxes).toBeLessThan(0);
    s.commands.undo();
    expect(s.city.pulse.taxRate).toBe(0.12);
  });

  it('bridges are only built when allowed, at bridge cost', () => {
    const s = makeSim(42);
    const g = s.city.grid;
    // Find an ocean tile at the map edge.
    const t = g.index(2, 2);
    expect(s.city.canRoad(t)).toBe(false);
    expect(s.city.canRoad(t, true)).toBe(true);
    const before = s.city.credits;
    s.commands.execute('road', { tiles: [t], bridges: true });
    expect(g.road[t]).toBe(2);
    expect(before - s.city.credits).toBe(20);
  });
});

describe('founding city scenario', () => {
  it('generates a large, deterministic, mostly connected city', () => {
    const a = makeSim(20261024);
    const ra = applyScenario(a.city, 'founding-city');
    const b = makeSim(20261024);
    applyScenario(b.city, 'founding-city');
    expect(a.city.hash()).toBe(b.city.hash());
    expect(ra.buildings).toBeGreaterThan(400);
    expect(ra.roads).toBeGreaterThan(1000);
    a.step(100);
    const ents = a.city.buildingEntities();
    const unconnected = ents.filter((e) => Service.problems[e]! & Problem.NO_ROAD).length;
    expect(unconnected / ents.length).toBeLessThan(0.05);
    // Starts functional (nothing collapsed) but with something to fix.
    const tiers = Object.values(a.city.pulse.tiers);
    expect(Math.max(...tiers)).toBeLessThan(4);
    expect(tiers.some((t) => t >= 2)).toBe(true);
    expect(a.city.stats.population).toBeGreaterThan(3000);
  });
});

describe('decline pacing', () => {
  it('a blackout empties the city gradually, giving the steward time to respond', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    s.step(100);
    const before = s.city.stats.population;
    for (const e of [...s.city.buildingEntities()]) {
      if (s.city.buildingDef(e).stats.energy > 0) {
        const r = s.city.buildingRecord(e);
        s.commands.execute('demolish', { x: r.x, z: r.z }, false);
      }
    }
    s.step(300); // 30 sim seconds
    const after30 = s.city.stats.population;
    expect(after30).toBeLessThan(before);
    expect(after30).toBeGreaterThan(before * 0.6);
    expect(s.city.pulse.tiers.energy).toBe(4);
  });
});

describe('save v2', () => {
  it('migrates v1 saves', () => {
    const s = makeSim(9);
    s.commands.execute('setTax', { rate: 0.15 });
    const v2 = serializeCity(s.city);
    const v1 = { ...structuredClone(v2), version: 1, buildings: v2.buildings.map((b) => b.slice(0, 5)) } as unknown as SaveData;
    delete (v1 as Partial<SaveData>).pulse;
    const c = new City(new EventBus(), 1);
    deserializeCity(c, v1);
    expect(c.pulse.taxRate).toBe(0.12);
  });
});
