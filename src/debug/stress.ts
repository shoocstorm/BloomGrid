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
  // Visit the 2-tile lattice in a golden-ratio permutation so any target spreads across the whole
  // island (a row-major fill packs it into a few chunks and under-tests culling and draw calls).
  const cols = Math.ceil(g.w / 2);
  const cells = cols * Math.ceil(g.h / 2);
  const step = coprimeNear(Math.floor(cells * 0.6180339887), cells);
  let placed = 0;
  for (let k = 0; k < cells && placed < target; k++) {
    const c = (k * step) % cells;
    const x = (c % cols) * 2;
    const z = Math.floor(c / cols) * 2;
    const def = defs[(x * 7 + z * 13) % defs.length]!;
    if (commands.execute('build', { def: def.id, x, z, rot: (x + z) % 4 }, false)) placed++;
  }
  ctx.bus.emit('toast', { text: `Stress city: ${placed} buildings`, tone: 'info' });
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** First step ≥ v coprime with n, so `k * step mod n` visits every cell exactly once. */
const coprimeNear = (v: number, n: number) => {
  while (gcd(v, n) !== 1) v++;
  return v;
};
