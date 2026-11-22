import { describe, expect, it } from 'vitest';
import { SaveManager } from '@/game/SaveManager';
import type { GameContext } from '@/game/context';
import type { KeyValueStorage } from '@/platform/types';
import { makeSim } from './helpers';

/** An in-memory platform storage. */
function memory(): KeyValueStorage {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => m.get(k) as T | undefined,
    set: async <T>(k: string, v: T) => void m.set(k, structuredClone(v)),
    delete: async (k: string) => void m.delete(k),
    keys: async () => [...m.keys()],
  };
}

describe('save slot summary (Settings → Game, D-081)', () => {
  it('reports nothing before a save, then the city, day and residents', async () => {
    const s = makeSim(7);
    s.city.growth.name = 'Coral Reach';
    const storage = memory();
    const ctx = { city: s.city, bus: s.bus, platform: { storage }, commands: { clearHistory() {} } } as unknown as GameContext;
    const save = new SaveManager(ctx);
    expect(await save.info()).toBeNull();
    await save.save();
    const info = (await save.info())!;
    expect(info.name).toBe('Coral Reach');
    expect(info.day).toBe(s.city.day);
    expect(info.residents).toBe(Math.round(s.city.stats.population));
    expect(info.at).toBeGreaterThan(0);
    // A save from before summaries existed still counts as a save.
    const slot = save.slot!;
    await storage.delete(`save:${slot}:info`);
    expect((await save.info())!.at).toBe(0);
    expect(await save.load(slot)).toBe(true);
  });
});

describe('several saved islands (D-207)', () => {
  const setup = () => {
    const s = makeSim(7);
    const storage = memory();
    const ctx = { city: s.city, bus: s.bus, platform: { storage }, commands: { clearHistory() {} } } as unknown as GameContext;
    return { s, storage, save: new SaveManager(ctx) };
  };

  it('keeps each island in its own slot; a new city never overwrites the last', async () => {
    const { s, save } = setup();
    s.city.growth.name = 'Coral Reach';
    await save.save();
    const first = save.slot!;
    await save.save();
    expect(save.slot).toBe(first);
    expect(await save.list()).toHaveLength(1);
    // Founding another city starts a fresh slot.
    s.city.reset(8, 'steward');
    expect(save.slot).toBeNull();
    s.city.growth.name = 'Kelp Harbour';
    await save.save();
    expect(save.slot).not.toBe(first);
    const all = await save.list();
    expect(all.map((e) => e.name).sort()).toEqual(['Coral Reach', 'Kelp Harbour']);
    // Loading the first island saves back into its own slot.
    expect(await save.load(first)).toBe(true);
    expect(save.slot).toBe(first);
    expect(s.city.growth.name).toBe('Coral Reach');
  });

  it('lists the newest first and deletes one island without touching the others', async () => {
    const { s, storage, save } = setup();
    await save.save('a');
    await storage.set('save:a:info', { at: 1, name: 'A', day: 1, residents: 0 });
    await save.save('b');
    expect((await save.list()).map((e) => e.slot)).toEqual(['b', 'a']);
    await save.remove('b');
    expect(save.slot).toBeNull();
    expect((await save.list()).map((e) => e.slot)).toEqual(['a']);
    expect(await storage.get('save:b:info')).toBeUndefined();
    expect(await save.load('b')).toBe(false);
    expect(s.city).toBeTruthy();
  });

  it('lists legacy single-slot saves too', async () => {
    const { save, storage } = setup();
    await save.save('slot1');
    await storage.delete('save:slot1:info');
    expect((await save.list()).map((e) => e.slot)).toEqual(['slot1']);
  });
});
