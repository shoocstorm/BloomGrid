import { describe, expect, it } from 'vitest';
import { Building, Greenery, Service } from '@/ecs/components';
import { applyScenario } from '@/sim/scenario';
import { computeFields } from '@/sim/fields';
import { bloomLayers, computeBloom, computeIrrigation, computePairing } from '@/sim/bloom';
import { SEASON_TICKS, seasonAt } from '@/sim/seasons';
import { RETROFIT_RADIUS, retrofitPlan } from '@/sim/commands';
import { deserializeCity, serializeCity } from '@/sim/save';
import { City } from '@/sim/City';
import { EventBus } from '@/core/EventBus';
import { findLandRow, makeSim } from './helpers';

const refresh = (s: ReturnType<typeof makeSim>) => {
  computeIrrigation(s.city);
  computePairing(s.city);
  computeFields(s.city, s.city.fields);
  computeBloom(s.city, s.city.fields);
};

describe('seasons', () => {
  it('cycle every two sim days and announce changes', () => {
    expect(seasonAt(0).season.id).toBe('bloom');
    expect(seasonAt(SEASON_TICKS).season.id).toBe('monsoon');
    expect(seasonAt(SEASON_TICKS * 4).season.id).toBe('bloom');
    const s = makeSim(1);
    const seen: number[] = [];
    s.bus.on('season:changed', ({ index }) => seen.push(index));
    s.step(SEASON_TICKS + 20);
    expect(seen).toEqual([1]);
  });
});

describe('bloom field', () => {
  it('pollinators raise bloom nearby; pollution suppresses it', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city);
    const centre = s.city.grid.index(x0 + 1, z + 1);
    refresh(s);
    const before = bloomLayers(s.city).bloom[centre]!;
    expect(s.commands.execute('build', { def: 'pollinator-sanctuary', x: x0, z, rot: 0 })).toBe(true);
    refresh(s);
    const after = bloomLayers(s.city).bloom[centre]!;
    expect(after).toBeGreaterThan(before + 0.1);
    // A bioreactor nearby (unpaired) pollutes and lowers bloom around it.
    expect(s.commands.execute('build', { def: 'bioreactor', x: x0 + 3, z, rot: 0 })).toBe(true);
    refresh(s);
    expect(bloomLayers(s.city).bloom[centre]!).toBeLessThan(after);
  });

  it('filtration channels irrigate, scrub pollution and keep gardens growing without water', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city);
    expect(s.commands.execute('build', { def: 'bioreactor', x: x0, z, rot: 0 })).toBe(true);
    refresh(s);
    const probe = s.city.grid.index(x0 + 5, z + 1);
    const polluted = s.city.fields.pollution[probe]!;
    const tiles = Array.from({ length: 12 }, (_, i) => s.city.grid.index(x0 + i, z + 4));
    expect(s.commands.execute('channel', { tiles })).toBe(true);
    refresh(s);
    expect(bloomLayers(s.city).irrigation[s.city.grid.index(x0 + 5, z + 3)]).toBeGreaterThan(0.5);
    expect(s.city.fields.pollution[probe]!).toBeLessThan(polluted);
    // An unconnected home beside the channel still greens up (irrigated), unlike one far away.
    expect(s.commands.execute('build', { def: 'garden-residence', x: x0 + 6, z: z + 5, rot: 0 })).toBe(true);
    const eid = s.city.buildingAt(x0 + 6, z + 5);
    const g0 = Greenery.value[eid]!;
    s.step(300);
    expect(Greenery.value[eid]!).toBeGreaterThan(g0);
    s.commands.undo(); // the house
    s.commands.undo(); // the channel
    expect(s.city.channelAt(tiles[0]!)).toBe(0);
  });
});

describe('symbiosis', () => {
  it('a Phyto Garden near a Bioreactor pairs them and cuts pollution', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city);
    s.commands.execute('build', { def: 'bioreactor', x: x0, z, rot: 0 });
    const reactor = s.city.buildingAt(x0, z);
    s.step(30);
    const dirty = s.city.stats.pollution;
    expect(Service.paired[reactor]).toBe(0);
    expect(s.commands.execute('build', { def: 'phyto-garden', x: x0 + 4, z, rot: 0 })).toBe(true);
    s.step(60);
    expect(Service.paired[reactor]).toBe(1);
    expect(s.city.stats.pollution).toBeLessThan(dirty * 0.5);
  });
});

describe('bloom retrofit', () => {
  it('transforms a district, costs credits, makes channels lush, and undoes cleanly', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    s.step(100);
    const x = s.city.size * 0.55;
    const z = s.city.size * 0.66;
    const tiles = [s.city.grid.index(Math.floor(x), Math.floor(z))].filter((t) => s.city.canChannel(t));
    if (tiles.length) s.commands.execute('channel', { tiles });
    const plan = retrofitPlan(s.city, x, z, RETROFIT_RADIUS);
    expect(plan.eids.length).toBeGreaterThan(5);
    s.city.credits = plan.cost + 100;
    const eco0 = s.city.stats.eco;
    const levels: number[][] = [];
    s.bus.on('buildings:level', ({ eids, origin }) => levels.push([eids.length, origin ? 1 : 0]));
    expect(s.commands.execute('retrofit', { x, z, radius: RETROFIT_RADIUS })).toBe(true);
    expect(s.city.credits).toBeCloseTo(100, 3);
    expect(plan.eids.every((e) => Building.level[e] === 1)).toBe(true);
    if (tiles.length) expect(s.city.channelAt(tiles[0]!)).toBe(2);
    s.step(30);
    expect(s.city.stats.eco).toBeGreaterThan(eco0);
    s.commands.undo();
    expect(plan.eids.every((e) => Building.level[e] === 0)).toBe(true);
    expect(levels).toEqual([
      [plan.eids.length, 1],
      [plan.eids.length, 0],
    ]);
  });
});

describe('save v4', () => {
  it('round-trips channels and retrofit levels', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city);
    s.commands.execute('build', { def: 'garden-residence', x: x0, z, rot: 0 });
    s.commands.execute('channel', { tiles: [s.city.grid.index(x0 + 4, z)] });
    s.commands.execute('retrofit', { x: x0 + 1, z: z + 1, radius: 4 });
    s.step(20);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city)));
    const c = new City(new EventBus(), 1);
    deserializeCity(c, data);
    expect(c.hash()).toBe(s.city.hash());
    expect(Building.level[c.buildingAt(x0, z)]).toBe(1);
  });
});
