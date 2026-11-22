import { describe, expect, it } from 'vitest';
import { Building } from '@/ecs/components';
import { bornAt, SAMPLE_MAX } from '@/sim/history';
import { deserializeCity, migrateSave, serializeCity, SAVE_VERSION, type SaveData } from '@/sim/save';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { findLandRow, findSpot, makeSim } from './helpers';

/** The history ledger the time-lapse replays (plan v6, Phase 30, D-219). */
describe('history ledger', () => {
  const built = () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    s.step(30);
    const at = findSpot(s.city, 'canopy-tower');
    expect(s.commands.execute('build', { def: 'canopy-tower', ...at, rot: 0 })).toBe(true);
    const eid = s.city.buildingAt(at.x, at.z);
    return { s, at, eid, uid: Building.uid[eid]! };
  };

  it('notes nothing for founding content and a birth tick for later builds', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const at = findSpot(s.city, 'canopy-tower');
    s.commands.execute('build', { def: 'canopy-tower', ...at, rot: 0 });
    expect(s.city.history.born.size).toBe(0);
    const b = built();
    expect(bornAt(b.s.city.history, b.uid)).toBe(30);
  });

  it('leaves no trace of an undone build', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    s.step(30);
    const before = s.city.hash();
    const at = findSpot(s.city, 'canopy-tower');
    s.commands.execute('build', { def: 'canopy-tower', ...at, rot: 0 });
    s.commands.undo();
    expect(s.city.history.born.size).toBe(0);
    expect(s.city.history.gone).toEqual([]);
    expect(s.city.hash()).toBe(before);
  });

  it('keeps the original birth through a demolition undone and a move', () => {
    const { s, at, uid } = built();
    s.step(40);
    s.commands.execute('demolish', at);
    expect(s.city.history.born.has(uid)).toBe(false);
    expect(s.city.history.gone.map((g) => [g[0], g[6], g[7]])).toEqual([[uid, 30, 70]]);
    s.commands.undo();
    expect(bornAt(s.city.history, uid)).toBe(30);
    expect(s.city.history.gone).toEqual([]);
    const to = findSpot(s.city, 'canopy-tower', at.x + 6, at.z);
    expect(s.commands.execute('move', { from: [at.x, at.z], x: to.x, z: to.z, rot: 0 })).toBe(true);
    expect(bornAt(s.city.history, uid)).toBe(30);
  });

  it('keeps a demolished building as a gone record', () => {
    const { s, at, uid } = built();
    s.step(60);
    s.commands.execute('demolish', at);
    const [g] = s.city.history.gone;
    expect(g).toEqual([uid, 'canopy-tower', at.x, at.z, 0, 0, 30, 90]);
  });

  it('dates highway tiles laid after founding and forgets removed ones', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city, 20);
    const g = s.city.grid;
    s.commands.execute('road', { tiles: [g.index(x0, z), g.index(x0 + 1, z)] });
    expect(s.city.history.roads.size).toBe(0);
    s.step(20);
    const tiles = [2, 3, 4].map((i) => g.index(x0 + i, z));
    s.commands.execute('road', { tiles });
    expect([...s.city.history.roads.values()]).toEqual([20, 20, 20]);
    s.commands.undo();
    expect(s.city.history.roads.size).toBe(0);
  });

  it('samples the city and halves the samples as they pile up', () => {
    const s = makeSim(42);
    const h = s.city.history;
    s.step(10 * h.every * 3 + 10);
    expect(h.samples.length).toBeGreaterThanOrEqual(3);
    const [tick, day, , credits] = h.samples[0]!;
    expect(tick % 10).toBe(0);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(credits).toBeGreaterThan(0);
    // Past the cap, every other sample goes and the interval doubles.
    h.samples = Array.from({ length: SAMPLE_MAX }, (_, i) => [i * 10 * h.every, 1, 0, 0, 0, 0] as [number, number, number, number, number, number]);
    const every = h.every;
    s.city.tick = 10 * every * SAMPLE_MAX;
    s.step(1);
    while (h.samples.length === SAMPLE_MAX) s.step(1);
    expect(h.samples.length).toBe(SAMPLE_MAX / 2 + 1);
    expect(h.every).toBe(every * 2);
  });

  it('round-trips through a save with the same hash', () => {
    const { s, at } = built();
    s.step(50);
    s.commands.execute('demolish', at);
    s.step(400);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    expect(data.version).toBe(SAVE_VERSION);
    const copy = new City(new EventBus(), 1);
    deserializeCity(copy, data);
    expect(copy.history.gone).toEqual(s.city.history.gone);
    expect(copy.history.samples).toEqual(s.city.history.samples);
    expect(copy.hash()).toBe(s.city.hash());
  });

  it('migrates a v27 save to an empty ledger (the city as it stands is its founding)', () => {
    const { s } = built();
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as Omit<SaveData, 'history'> & { history?: unknown };
    data.version = 27;
    delete data.history;
    const m = migrateSave(data as SaveData);
    expect(m.version).toBe(SAVE_VERSION);
    const copy = new City(new EventBus(), 1);
    deserializeCity(copy, m);
    expect(copy.history.born.size).toBe(0);
    expect(copy.history.samples).toEqual([]);
  });

  it('is deterministic', () => {
    const run = () => {
      const { s, at } = built();
      s.step(100);
      s.commands.execute('demolish', at);
      s.step(200);
      return s.city.hash();
    };
    expect(run()).toBe(run());
  });
});
