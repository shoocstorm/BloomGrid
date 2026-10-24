import { describe, expect, it } from 'vitest';
import { buildings } from '@/content';
import { deserializeCity, serializeCity } from '@/sim/save';
import { City } from '@/sim/City';
import { EventBus } from '@/core/EventBus';
import { findSpot, makeSim } from './helpers';

function scripted(seed: number) {
  const s = makeSim(seed);
  const a = findSpot(s.city, 'garden-residence');
  s.commands.execute('build', { def: 'garden-residence', ...a, rot: 0 });
  s.step(25);
  const b = findSpot(s.city, 'solar-spire', a.x + 4, a.z);
  s.commands.execute('build', { def: 'solar-spire', ...b, rot: 1 });
  const row = Array.from({ length: 10 }, (_, i) => s.city.grid.index(a.x + i, a.z + 3));
  s.commands.execute('road', { tiles: row });
  s.step(100);
  return s;
}

describe('content', () => {
  it('auto-discovers building definitions', () => {
    expect(buildings.all().length).toBeGreaterThanOrEqual(7);
    expect(buildings.has('canopy-tower')).toBe(true);
  });
});

describe('simulation', () => {
  it('is deterministic for the same seed and commands', () => {
    expect(scripted(7).city.hash()).toBe(scripted(7).city.hash());
    expect(scripted(7).city.hash()).not.toBe(scripted(8).city.hash());
  });

  it('grows greenery over time and earns income', () => {
    const s = scripted(3);
    const snap = s.city.snapshotBuildings();
    expect(snap.length).toBe(2);
    expect(snap.every((b) => b.greenery > 0)).toBe(true);
    expect(s.city.stats.population).toBeGreaterThan(0);
  });

  it('rejects invalid placements', () => {
    const s = makeSim(5);
    const a = findSpot(s.city, 'pocket-park');
    expect(s.commands.execute('build', { def: 'pocket-park', ...a, rot: 0 })).toBe(true);
    expect(s.commands.execute('build', { def: 'pocket-park', ...a, rot: 0 })).toBe(false);
    expect(s.commands.execute('build', { def: 'pocket-park', x: -1, z: 0, rot: 0 })).toBe(false);
  });
});

describe('commands', () => {
  it('undo/redo round-trips state', () => {
    const s = makeSim(11);
    const before = s.city.hash();
    const a = findSpot(s.city, 'canopy-tower');
    s.commands.execute('build', { def: 'canopy-tower', ...a, rot: 2 });
    const after = s.city.hash();
    s.commands.execute('demolish', { x: a.x + 1, z: a.z + 1 });
    expect(s.city.buildingEntities().length).toBe(0);
    s.commands.undo();
    expect(s.city.hash()).toBe(after);
    s.commands.undo();
    expect(s.city.hash()).toBe(before);
    s.commands.redo();
    expect(s.city.hash()).toBe(after);
  });
});

describe('save/load', () => {
  it('restores an identical city', () => {
    const s = scripted(21);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city)));
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.hash()).toBe(s.city.hash());
  });
});
