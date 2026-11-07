import { describe, expect, it } from 'vitest';
import { buildings } from '@/content';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { Building } from '@/ecs/components';
import { BRIDGE_CAPACITY, bridgeAt, bridgeLevel, bridgeUpgradeCost } from '@/sim/bridges';
import { bridgeReport } from '@/sim/bridgeReport';
import { roadCapacity } from '@/sim/roads';
import { deserializeCity, serializeCity, type SaveData } from '@/sim/save';
import { findSpot, makeSim } from './helpers';

/** A straight row from land, over at least `min` water tiles, to land: the highway tiles to lay. */
function crossing(city: City, min = 5): number[] {
  const g = city.grid;
  for (let z = 40; z < city.size - 40; z += 3)
    for (let x = 20; x < city.size - 80; x++) {
      if (city.isWaterTile(x, z) || !city.isWaterTile(x + 1, z)) continue;
      let k = 1;
      while (k < 60 && city.isWaterTile(x + k, z)) k++;
      if (k - 1 < min || k >= 60 || city.isWaterTile(x + k, z)) continue;
      const tiles = Array.from({ length: k + 3 }, (_, i) => g.index(x - 1 + i, z));
      if (tiles.some((t) => g.road[t] || g.occupant[t] >= 0)) continue;
      return tiles;
    }
  throw new Error('no crossing');
}

describe('named bridges (D-128)', () => {
  it('a new crossing is a named bridge credited to its builder, and follows undo / redo', () => {
    const s = makeSim(11);
    s.city.credits = 1e6;
    const tiles = crossing(s.city);
    expect(s.commands.execute('road', { tiles, bridges: true })).toBe(true);
    expect(s.city.bridges.length).toBe(1);
    const b = s.city.bridges[0]!;
    expect(b.name).toMatch(/\w+ \w+/);
    expect(b.by).toBe('player');
    expect(bridgeAt(s.city, s.city.grid.index(b.x + 1, b.z))).toBe(b);
    const r = bridgeReport(s.city, b);
    expect(r.length).toBe(b.len);
    expect(r.ageDays).toBe(0);
    s.commands.undo();
    expect(s.city.bridges.length).toBe(0);
    s.commands.redo();
    expect(s.city.bridges.length).toBe(1);
    expect(s.city.bridges[0]!.name).toBe(b.name);
  });

  it('Flora builds are credited to Flora', () => {
    const s = makeSim(11);
    s.city.credits = 1e6;
    s.commands.execute('road', { tiles: crossing(s.city), bridges: true, by: 'flora' });
    expect(s.city.bridges[0]!.by).toBe('flora');
  });

  it('upgrading raises the deck capacity a level at a time, paid per tile, and undoes', () => {
    const s = makeSim(11);
    s.city.credits = 1e6;
    s.commands.execute('road', { tiles: crossing(s.city), bridges: true });
    const b = s.city.bridges[0]!;
    const deck = s.city.grid.index(b.x, b.z);
    expect(roadCapacity(s.city, deck)).toBe(BRIDGE_CAPACITY[0]);
    const cost = bridgeUpgradeCost(s.city, b);
    const before = s.city.credits;
    expect(s.commands.execute('upgradeBridge', { key: b.key })).toBe(true);
    expect(bridgeLevel(s.city, b)).toBe(1);
    expect(roadCapacity(s.city, deck)).toBe(BRIDGE_CAPACITY[1]);
    expect(s.city.credits).toBeCloseTo(before - cost);
    expect(s.commands.execute('upgradeBridge', { key: b.key })).toBe(true);
    expect(s.commands.execute('upgradeBridge', { key: b.key })).toBe(false);
    s.commands.undo();
    s.commands.undo();
    expect(bridgeLevel(s.city, b)).toBe(0);
    expect(s.city.credits).toBeCloseTo(before);
  });

  it('a removed bridge put back by undo keeps its name and date', () => {
    const s = makeSim(11);
    s.city.credits = 1e6;
    const tiles = crossing(s.city);
    s.commands.execute('road', { tiles, bridges: true });
    s.step(50);
    const { name, built } = s.city.bridges[0]!;
    s.commands.execute('unroad', { tiles });
    expect(s.city.bridges.length).toBe(0);
    s.commands.undo();
    expect(s.city.bridges[0]).toMatchObject({ name, built, by: 'player' });
  });

  it('names, builders, levels and the hash survive a save round trip', () => {
    const s = makeSim(11);
    s.city.credits = 1e6;
    s.commands.execute('road', { tiles: crossing(s.city), bridges: true, by: 'flora' });
    s.commands.execute('upgradeBridge', { key: s.city.bridges[0]!.key });
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.bridges.map((b) => [b.name, b.by, b.built])).toEqual(
      s.city.bridges.map((b) => [b.name, b.by, b.built]),
    );
    expect(bridgeLevel(other, other.bridges[0]!)).toBe(1);
    expect(other.hash()).toBe(s.city.hash());
  });
});

describe('building builders and cost to date (D-128)', () => {
  it('records who built a building and every credit spent on it, through undo and saves', () => {
    const s = makeSim(5);
    s.city.credits = 1e6;
    const def = buildings.get('canopy-tower');
    const a = findSpot(s.city, def.id);
    expect(s.commands.execute('build', { def: def.id, x: a.x, z: a.z, rot: 0 })).toBe(true);
    const eid = s.city.buildingAt(a.x, a.z);
    expect(s.city.buildingRecord(eid)).toMatchObject({ by: 'player', spent: def.stats.cost });
    // A renovation (once it has aged) books its bill; undo takes it back.
    const uid = Building.uid[eid]!;
    const b = findSpot(s.city, def.id, a.x + 6, a.z);
    s.commands.execute('build', { def: def.id, x: b.x, z: b.z, rot: 0, by: 'flora' });
    expect(s.city.buildingRecord(s.city.buildingAt(b.x, b.z)).by).toBe('flora');
    // Founding / scripted content is the city's.
    const c = findSpot(s.city, def.id, b.x + 6, b.z);
    const e3 = s.city.addBuilding({ def: def.id, x: c.x, z: c.z, rot: 0, greenery: 1 });
    expect(s.city.buildingRecord(e3)).toMatchObject({ by: 'system', spent: def.stats.cost });
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    const back = other.buildingRecord(other.buildingByUid(uid));
    expect(back).toMatchObject({ by: 'player', spent: def.stats.cost });
    expect(other.hash()).toBe(s.city.hash());
  });

  it('upgrades and renovations add to the cost to date; undo takes them off', async () => {
    const s = makeSim(5);
    s.city.credits = 1e6;
    const { DAY_LENGTH } = await import('@/sim/pulseConst');
    const { Service } = await import('@/ecs/components');
    const def = buildings.get('canopy-tower');
    const a = findSpot(s.city, def.id);
    s.commands.execute('build', { def: def.id, x: a.x, z: a.z, rot: 0 });
    const eid = s.city.buildingAt(a.x, a.z);
    Service.age[eid] = DAY_LENGTH * 3;
    Service.condition[eid] = 0.5;
    const before = s.city.buildingRecord(eid).spent!;
    const credits = s.city.credits;
    expect(s.commands.execute('renovate', { x: a.x, z: a.z })).toBe(true);
    const paid = credits - s.city.credits;
    expect(paid).toBeGreaterThan(0);
    expect(s.city.buildingRecord(eid).spent).toBeCloseTo(before + paid);
    s.commands.undo();
    expect(s.city.buildingRecord(eid).spent).toBeCloseTo(before);
  });
});
