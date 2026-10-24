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

/** Persists the city (and module state) through the platform storage. */
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
    await this.ctx.platform.storage.set(`save:${slot}`, this.snapshot());
    this.ctx.bus.emit('save:done', { slot });
  }

  async load(slot = 'slot1'): Promise<boolean> {
    const data = await this.ctx.platform.storage.get<SaveData>(`save:${slot}`);
    if (!data) return false;
    this.restore(data);
    this.ctx.bus.emit('load:done', { slot });
    return true;
  }
}
