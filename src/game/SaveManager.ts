import { deserializeCity, serializeCity, type SaveData } from '@/sim/save';
import type { GameContext } from './context';

export interface ModuleSaveHook {
  id: string;
  save(ctx: GameContext): unknown;
  load(ctx: GameContext, data: unknown): void;
}

declare module '@/core/EventBus' {
  interface GameEvents {
    'save:done': { slot: string };
    'load:done': { slot: string };
  }
}

/** What a slot holds, without reading the whole save (Settings shows it beside Save / Load). */
export interface SaveInfo {
  /** Wall-clock time of the save (ms since epoch). */
  at: number;
  name: string;
  day: number;
  residents: number;
  /** Island seed and difficulty (absent in saves from before D-085). */
  seed?: number;
  difficulty?: string;
}

/** Persists the city (and module state) through the platform storage, with a small summary per slot. */
export class SaveManager {
  private hooks: ModuleSaveHook[] = [];

  constructor(private ctx: GameContext) {}

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
    try {
      deserializeCity(ctx.city, data);
      for (const h of this.hooks) if (h.id in data.modules) h.load(ctx, data.modules[h.id]);
    } finally {
      ctx.loading = false;
    }
    ctx.commands.clearHistory();
  }

  async save(slot = 'slot1'): Promise<void> {
    const { city, platform } = this.ctx;
    await platform.storage.set(`save:${slot}`, this.snapshot());
    const info: SaveInfo = { at: Date.now(), name: city.growth.name, day: city.day, residents: Math.round(city.stats.population), seed: city.seed, difficulty: city.steward.difficulty };
    await platform.storage.set(`save:${slot}:info`, info);
    this.ctx.bus.emit('save:done', { slot });
  }

  /** The slot's summary; saves from before summaries existed report `{ at: 0 }` fields as unknown. */
  async info(slot = 'slot1'): Promise<SaveInfo | null> {
    const storage = this.ctx.platform.storage;
    const info = await storage.get<SaveInfo>(`save:${slot}:info`);
    if (info) return info;
    return (await storage.keys()).includes(`save:${slot}`) ? { at: 0, name: '', day: 0, residents: 0 } : null;
  }

  /** `stage` advances a loading screen between reading and rebuilding (the loader service passes its own). */
  async load(slot = 'slot1', stage?: (label: string, progress: number) => Promise<void>): Promise<boolean> {
    await stage?.('Reading the saved city', 0.1);
    const data = await this.ctx.platform.storage.get<SaveData>(`save:${slot}`);
    if (!data) return false;
    await stage?.('Rebuilding streets and towers', 0.35);
    this.restore(data);
    await stage?.('Waking the residents', 0.8);
    this.ctx.bus.emit('load:done', { slot });
    return true;
  }
}
