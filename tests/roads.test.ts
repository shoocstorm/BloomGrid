import { describe, expect, it } from 'vitest';
import { City } from '@/sim/City';
import { EventBus } from '@/core/EventBus';
import { applyScenario } from '@/sim/scenario';
import { deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { MAX_ROAD_LEVEL, ROAD_UPGRADE_COST, roadCapacity, roadLevels, roadStretch, roadWear, updateRoadLevels } from '@/sim/roads';
import { AgentToolRegistry } from '@/core/AgentTools';
import type { ActionCtx } from '@/sim/actionTools';
import { roadTools } from '@/sim/roadTools';
import { plainIntent } from '@/ai/agent';
import { findLandRow, makeSim } from './helpers';

const roadTiles = (s: ReturnType<typeof makeSim>) => s.city.roadTiles().filter((t) => s.city.grid.road[t] === 1);

describe('highway levels (D-096)', () => {
  it('a new highway is a raw track; scenarios set their own level', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city);
    const tiles = Array.from({ length: 8 }, (_, i) => s.city.grid.index(x0 + i, z));
    s.commands.execute('road', { tiles });
    expect(tiles.every((t) => roadLevels(s.city)[t] === 0)).toBe(true);
    expect(roadCapacity(s.city, tiles[0]!)).toBeLessThan(1);

    const f = makeSim(7);
    applyScenario(f.city, 'fresh-island');
    expect(roadTiles(f).every((t) => roadLevels(f.city)[t] === 0)).toBe(true);
    const c = makeSim(20261024);
    applyScenario(c.city, 'founding-city');
    const lv = roadLevels(c.city);
    const levels = new Set(roadTiles(c).map((t) => lv[t]));
    expect([...levels].sort()).toEqual([1, 2]);
  });

  it('traffic wears a raw track in until it is paved, for free', () => {
    const s = makeSim(7);
    applyScenario(s.city, 'fresh-island');
    const credits = s.city.credits;
    s.step(1800);
    const lv = roadLevels(s.city);
    const paved = roadTiles(s).filter((t) => lv[t]! >= 1);
    expect(paved.length).toBeGreaterThan(0);
    // The busiest tiles pave first: every paved tile carried traffic.
    const traffic = s.city.grid.layer<Float32Array>('traffic')!;
    expect(paved.every((t) => traffic[t]! > 0)).toBe(true);
    expect(s.city.credits).not.toBe(credits); // the city still runs; paving itself is free
  });

  it('upgrading a stretch costs per tile, raises one level, and undo restores levels and wear', () => {
    const s = makeSim(7);
    applyScenario(s.city, 'fresh-island');
    const t0 = roadTiles(s)[5]!;
    const stretch = roadStretch(s.city, t0, 10);
    expect(stretch.length).toBe(10);
    roadWear(s.city)[stretch[0]!] = 100;
    const credits = s.city.credits;
    expect(s.commands.execute('upgradeRoad', { tiles: stretch })).toBe(true);
    expect(stretch.every((t) => roadLevels(s.city)[t] === 1)).toBe(true);
    expect(s.city.credits).toBeCloseTo(credits - 10 * ROAD_UPGRADE_COST[1], 5);
    expect(s.commands.execute('upgradeRoad', { tiles: stretch })).toBe(true);
    expect(roadLevels(s.city)[t0]).toBe(MAX_ROAD_LEVEL);
    expect(s.commands.execute('upgradeRoad', { tiles: stretch })).toBe(false);
    s.commands.undo();
    s.commands.undo();
    expect(stretch.every((t) => roadLevels(s.city)[t] === 0)).toBe(true);
    expect(roadWear(s.city)[stretch[0]!]).toBe(100);
    expect(s.city.credits).toBeCloseTo(credits, 5);
  });

  it('levels survive a save and old saves load as Living Highways; the hash sees levels', () => {
    const s = makeSim(7);
    applyScenario(s.city, 'fresh-island');
    s.step(600);
    s.commands.execute('upgradeRoad', { tiles: roadStretch(s.city, roadTiles(s)[3]!, 12) });
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    const c = new City(new EventBus(), 1);
    deserializeCity(c, data);
    expect(c.hash()).toBe(s.city.hash());

    const old = { ...structuredClone(data), version: 14 } as Partial<SaveData>;
    delete old.roadLevels;
    const d = new City(new EventBus(), 1);
    deserializeCity(d, migrateSave(old as SaveData));
    expect(d.roadTiles().every((t) => d.grid.road[t] !== 1 || roadLevels(d)[t] === 1)).toBe(true);

    const before = s.city.hash();
    roadLevels(s.city)[roadTiles(s)[0]!] = 2;
    expect(s.city.hash()).not.toBe(before);
  });

  it('wear only builds where traffic is heavy enough for the level', () => {
    const s = makeSim(7);
    applyScenario(s.city, 'fresh-island');
    s.step(200);
    const traffic = s.city.grid.layer<Float32Array>('traffic')!;
    traffic.fill(0);
    const wear = roadWear(s.city);
    const total = () => roadTiles(s).reduce((a, t) => a + wear[t]!, 0);
    const w0 = total();
    for (let i = 0; i < 10; i++) {
      s.city.pulse.count = i * 5;
      updateRoadLevels(s.city);
    }
    expect(total()).toBe(w0);
  });

  it('Flora upgrades a district’s highways in one undoable call', async () => {
    const s = makeSim(7);
    applyScenario(s.city, 'fresh-island');
    s.city.credits = 1e5;
    const r = new AgentToolRegistry<ActionCtx>({ city: s.city, commands: s.commands });
    for (const t of roadTools) r.register(t);
    const out = await r.call('upgrade_roads', { district: 'Old Harbour' });
    expect(out.ok).toBe(true);
    expect((out as { result: { upgraded: number } }).result.upgraded).toBeGreaterThan(10);
    expect(plainIntent('pave the roads in Old Harbour')).toBe('upgrade_roads');
    expect(plainIntent('turn the main street into a boulevard')).toBe('upgrade_roads');
  });
});
