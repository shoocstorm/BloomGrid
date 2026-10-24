import { buildings } from '@/content';
import type { GameContext } from '@/game/context';

/** Fills the map with buildings and highway grids for perf testing (not undoable). */
export function spawnStressCity(ctx: GameContext, target: number): void {
  const { city, commands } = ctx;
  city.credits = 1e9;
  const defs = buildings.all();
  const g = city.grid;
  // Road grid every 8 tiles.
  const roads: number[] = [];
  for (let z = 4; z < g.h; z += 8) for (let x = 0; x < g.w; x++) roads.push(g.index(x, z));
  for (let x = 4; x < g.w; x += 8) for (let z = 0; z < g.h; z++) roads.push(g.index(x, z));
  commands.execute('road', { tiles: roads }, false);
  let placed = 0;
  for (let z = 0; z < g.h && placed < target; z += 2)
    for (let x = 0; x < g.w && placed < target; x += 2) {
      const def = defs[(x * 7 + z * 13) % defs.length]!;
      if (commands.execute('build', { def: def.id, x, z, rot: (x + z) % 4 }, false)) placed++;
    }
  ctx.bus.emit('toast', { text: `Stress city: ${placed} buildings`, tone: 'info' });
}
