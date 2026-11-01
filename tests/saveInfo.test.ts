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
    await storage.delete('save:slot1:info');
    expect((await save.info())!.at).toBe(0);
    expect(await save.load()).toBe(true);
  });
});
