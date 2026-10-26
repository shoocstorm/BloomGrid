import type { GameModule } from '@/game/context';
import { buildings } from '@/content';
import { chunkSizeFor } from '@/sim/City';
import { BuildingRenderer } from './BuildingRenderer';
import { RoadRenderer } from './RoadRenderer';
import { BridgeRenderer } from './BridgeRenderer';
import { ChannelRenderer } from './ChannelRenderer';
import { Ghost } from './Ghost';
import { createTools, type BuildState } from './tools';

export interface ConstructionService {
  renderer: BuildingRenderer;
  /** Activates the build tool with a building definition. */
  startBuilding(defId: string): void;
  readonly state: BuildState;
}

declare module '@/core/Services' {
  interface GameServices {
    construction: ConstructionService;
  }
}

/** Build mode: building + Living Highway rendering, placement ghost and construction tools. */
export const constructionModule: GameModule = {
  id: 'construction',
  deps: ['world'],
  init(ctx) {
    const renderer = new BuildingRenderer(ctx);
    new RoadRenderer(ctx, chunkSizeFor(ctx.city.size));
    new BridgeRenderer(ctx);
    new ChannelRenderer(ctx, chunkSizeFor(ctx.city.size));
    const ghost = new Ghost(ctx.scene);
    const state: BuildState = { def: buildings.all()[0]!.id, rot: 0 };
    for (const t of createTools(ghost, state)) ctx.tools.register(t);

    ctx.services.provide('construction', {
      renderer,
      state,
      startBuilding(defId) {
        state.def = defId;
        if (ctx.tools.active?.id === 'build') ctx.tools.active.activate?.(ctx);
        else ctx.tools.setActive('build');
        ctx.bus.emit('tool:changed', { id: 'build' });
      },
    });

    ctx.systems.add({ id: 'construction.buildings', phase: 'sync', update: (_c, f) => renderer.update(f.dt) });
  },
};
