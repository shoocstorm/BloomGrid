import { deserializeCity, serializeCity, type SaveData } from '@/sim/save';
import type { GameContext } from './context';
import { deleteSave, listSaves, newSlot, type SaveEntry, type SaveInfo } from './saves';

export interface ModuleSaveHook {
  id: string;
  save(ctx: GameContext): unknown;
  load(ctx: GameContext, data: unknown): void;
}

declare module '@/core/EventBus' {
  interface GameEvents {
    'save:done': { slot: string };
    'load:done': { slot: string };
    'save:deleted': { slot: string };
  }
}

export type { SaveInfo, SaveEntry } from './saves';

/**
 * Persists the city (and module state) through the platform storage, with a small summary per slot. Each island has
 * its own slot (D-207): `slot` is the running city's (set by a load or its first save, cleared when a new city is
 * founded), so saving never overwrites another island.
 */
export class SaveManager {
  private hooks: ModuleSaveHook[] = [];
  /** The running city's slot; null until it is saved or was loaded from one. */
  slot: string | null = null;
  private restoring = false;

  constructor(private ctx: GameContext) {
    // A new city (founded, or a fresh island after game over) is not the one in the slot.
    ctx.bus?.on('city:reset', () => {
      if (!this.restoring) this.slot = null;
    });
  }

  addHook(hook: ModuleSaveHook): void {
    this.hooks.push(hook);
  }

  snapshot(): SaveData {
    const data = serializeCity(this.ctx.city);
    for (const h of this.hooks) data.modules[h.id] = h.save(this.ctx);
    return data;
  }

  restore(data: SaveData): void {
    const ctx = this.ctx;
    ctx.loading = true;
    this.restoring = true;
    try {
      deserializeCity(ctx.city, data);
      this.restoreModules(data);
    } finally {
      ctx.loading = false;
      this.restoring = false;
    }
    ctx.commands.clearHistory();
  }

  /**
   * Module state from a save. A city resumed from the welcome screen (D-148) is deserialized before modules load
   * (renderers sync it at init, like a scenario); its module state follows once their hooks exist.
   */
  restoreModules(data: SaveData): void {
    const ctx = this.ctx;
    const was = ctx.loading;
    ctx.loading = true;
    try {
      for (const h of this.hooks) if (h.id in data.modules) h.load(ctx, data.modules[h.id]);
    } finally {
      ctx.loading = was;
    }
  }

  /** Saves to `slot`, or to the running city's own slot (a new one on its first save). */
  async save(slot = this.slot ?? newSlot()): Promise<void> {
    const { city, platform } = this.ctx;
    this.slot = slot;
    await platform.storage.set(`save:${slot}`, this.snapshot());
    const info: SaveInfo = { at: Date.now(), name: city.growth.name, day: city.day, residents: Math.round(city.stats.population), seed: city.seed, difficulty: city.steward.difficulty };
    await platform.storage.set(`save:${slot}:info`, info);
    this.ctx.bus.emit('save:done', { slot });
  }

  /** The slot's summary (default the running city's); saves from before summaries existed report `{ at: 0 }` fields as unknown. */
  async info(slot = this.slot): Promise<SaveInfo | null> {
    if (!slot) return null;
    const storage = this.ctx.platform.storage;
    const info = await storage.get<SaveInfo>(`save:${slot}:info`);
    if (info) return info;
    return (await storage.keys()).includes(`save:${slot}`) ? { at: 0, name: '', day: 0, residents: 0 } : null;
  }

  /** Every saved island, most recently saved first. */
  list(): Promise<SaveEntry[]> {
    return listSaves(this.ctx.platform.storage);
  }

  /** Deletes a saved island; the running city keeps going (its next save starts a new slot). */
  async remove(slot: string): Promise<void> {
    await deleteSave(this.ctx.platform.storage, slot);
    if (this.slot === slot) this.slot = null;
    this.ctx.bus.emit('save:deleted', { slot });
  }

  /** `stage` advances a loading screen between reading and rebuilding (the loader service passes its own). */
  async load(slot: string, stage?: (label: string, progress: number) => Promise<void>): Promise<boolean> {
    await stage?.('Reading the saved city', 0.1);
    const data = await this.ctx.platform.storage.get<SaveData>(`save:${slot}`);
    if (!data) return false;
    await stage?.('Rebuilding streets and towers', 0.35);
    this.restore(data);
    this.slot = slot;
    await stage?.('Waking the residents', 0.8);
    this.ctx.bus.emit('load:done', { slot });
    return true;
  }
}
