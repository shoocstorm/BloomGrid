import { describe, expect, it } from 'vitest';
import { Greenery, Service } from '@/ecs/components';
import { applyScenario } from '@/sim/scenario';
import { MIST_COST, computeFloraNet, farmSoilMul, zoneOf } from '@/sim/floranet';
import { forecastCrisis } from '@/sim/crises';
import { evaluateAdvisor } from '@/sim/advisor';
import { SEASON_TICKS } from '@/sim/seasons';
import { OVERGROWN } from '@/sim/upkeep';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { City } from '@/sim/City';
import { EventBus } from '@/core/EventBus';
import { findLandRow, makeSim } from './helpers';

/** Runs Flora-Net passes directly (each is 5 sim seconds of soil change). */
const passes = (s: ReturnType<typeof makeSim>, n: number) => {
  for (let i = 0; i < n; i++) computeFloraNet(s.city);
};

/** A small, connected garden district with its own water supply. */
function garden() {
  const s = makeSim(42);
  s.city.credits = 1e6;
  const { x0, z } = findLandRow(s.city, 40);
  const g = s.city.grid;
  expect(s.commands.execute('road', { tiles: Array.from({ length: 30 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
  for (let i = 0; i < 4; i++) expect(s.commands.execute('build', { def: 'garden-residence', x: x0 + i * 2, z: z - 2, rot: 0 })).toBe(true);
  s.step(10);
  return { s, x0, z, zone: zoneOf(s.city.soil, x0 + 3, z - 1) };
}

describe('Flora-Net soil', () => {
  it('dries without water, in Haze and in heatwaves; recovers with supply', () => {
    const { s, zone } = garden();
    const H = s.city.soil.hydration;
    // No water works: taps are dry, so the zone's soil drifts toward parched.
    passes(s, 40);
    const dry = H[zone]!;
    expect(dry).toBeLessThan(0.35);
    // Served zones hold moisture: pretend the taps run.
    for (let e = 0; e < 4096; e++) Service.water[e] = 1;
    passes(s, 40);
    const wet = H[zone]!;
    expect(wet).toBeGreaterThan(0.6);
    // Haze season plus a heatwave dries even a served zone.
    s.city.tick = SEASON_TICKS * 3 + 100;
    const c = forecastCrisis(s.city, 'heatwave', 1, 0);
    c.phase = 'active';
    passes(s, 40);
    expect(H[zone]!).toBeLessThan(wet - 0.25);
  });

  it('parched soil wilts gardens and raises an advisory with a fix', () => {
    const { s, zone } = garden();
    s.city.soil.hydration[zone] = 0.05;
    for (let e = 0; e < 4096; e++) Service.water[e] = 1;
    computeFloraNet(s.city);
    const homes = s.city.buildingEntities().filter((e) => s.city.buildingDef(e).id === 'garden-residence');
    expect(Service.soil[homes[0]!]).toBeLessThan(0.35);
    Greenery.value[homes[0]!] = 0.8;
    // The greenery system reads soil: growth stalls and gardens die back.
    s.step(30);
    expect(Greenery.value[homes[0]!]).toBeLessThan(0.8);
    const a = evaluateAdvisor(s.city).find((x) => x.id === 'dry-soil');
    expect(a?.build).toBe('flora-hive');
  });

  it('a mist dispatch soaks nearby zones, costs credits and undoes cleanly', () => {
    const { s, x0, z, zone } = garden();
    s.city.soil.hydration[zone] = 0.1;
    const credits = s.city.credits;
    let misted = 0;
    s.bus.on('floranet:mist', () => misted++);
    expect(s.commands.execute('mist', { x: x0 + 3, z: z - 1 })).toBe(true);
    expect(s.city.soil.hydration[zone]).toBeCloseTo(0.45, 5);
    expect(s.city.credits).toBe(credits - MIST_COST);
    expect(misted).toBe(1);
    s.commands.undo();
    expect(s.city.soil.hydration[zone]).toBeCloseTo(0.1, 5);
    expect(s.city.credits).toBe(credits);
  });

  it('farms deplete nutrients; a Drone Hive helps; yields follow the soil', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city, 40);
    const g = s.city.grid;
    expect(s.commands.execute('road', { tiles: Array.from({ length: 36 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
    for (let i = 0; i < 3; i++) expect(s.commands.execute('build', { def: 'vertical-farm', x: x0 + i * 3, z: z - 3, rot: 0 })).toBe(true);
    s.step(10);
    for (let e = 0; e < 4096; e++) Service.occupancy[e] = 1;
    const zi = zoneOf(s.city.soil, x0 + 4, z - 2);
    const before = farmSoilMul(s.city, x0 + 4, z - 2);
    passes(s, 120);
    const depleted = s.city.soil.nutrients[zi]!;
    expect(depleted).toBeLessThan(0.45);
    expect(farmSoilMul(s.city, x0 + 4, z - 2)).toBeLessThan(before);
    // A hive next to the farms returns compost and harvests (yield bonus).
    expect(s.commands.execute('build', { def: 'flora-hive', x: x0 + 10, z: z + 1, rot: 0 })).toBe(true);
    s.step(10);
    for (let e = 0; e < 4096; e++) {
      Service.occupancy[e] = 1;
      Service.power[e] = 1;
    }
    passes(s, 120);
    expect(s.city.soil.nutrients[zi]!).toBeGreaterThan(depleted + 0.05);
    expect(s.city.pulse.drones.length).toBeGreaterThan(0);
    expect(s.city.pulse.drones.some((d) => d.kind === 1)).toBe(true);
  });

  it('drone crews clear overgrown highways near a hive even under austerity', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city, 40);
    const g = s.city.grid;
    expect(s.commands.execute('road', { tiles: Array.from({ length: 30 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
    expect(s.commands.execute('build', { def: 'flora-hive', x: x0 + 4, z: z + 1, rot: 0 })).toBe(true);
    s.step(10);
    const og = g.addLayer('overgrowth', (n) => new Uint8Array(n));
    const near = g.index(x0 + 6, z);
    const far = g.index(x0 + 28, z);
    og[near] = og[far] = OVERGROWN;
    s.city.steward.overgrown = 2;
    s.city.pulse.hives = [{ x: x0 + 5, z: z + 2, r: 16 }];
    s.city.steward.funding = 0.4;
    s.step(10 * 10);
    expect(og[near]!).toBeLessThan(OVERGROWN);
    expect(og[far]!).toBeGreaterThanOrEqual(og[near]!);
  });

  it('the founding city has a hive, healthy soil and drone sorties', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    s.step(100);
    expect(s.city.buildingEntities().some((e) => s.city.buildingDef(e).id === 'flora-hive')).toBe(true);
    expect(s.city.pulse.soilHealth).toBeGreaterThan(0.8);
    expect(s.city.pulse.drones.length).toBeGreaterThan(0);
  });

  it('soil is saved (v5), migrated from v4 and part of the determinism hash', () => {
    const { s, zone } = garden();
    s.city.soil.hydration[zone] = 0.123;
    s.city.soil.nutrients[zone] = 0.456;
    const data = serializeCity(s.city);
    expect(data.version).toBe(SAVE_VERSION);
    const c2 = new City(new EventBus(), 1);
    deserializeCity(c2, structuredClone(data));
    expect(c2.soil.hydration[zone]).toBeCloseTo(0.123, 3);
    expect(c2.soil.nutrients[zone]).toBeCloseTo(0.456, 3);
    const h = s.city.hash();
    s.city.soil.hydration[zone] = 0.5;
    expect(s.city.hash()).not.toBe(h);
    const v4 = { ...structuredClone(data), version: 4 } as Partial<SaveData>;
    delete v4.soil;
    const m = migrateSave(v4 as SaveData);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.soil.hydration).toEqual([]);
  });
});
