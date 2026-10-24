import { buildings } from '@/content';
import { CommandStack } from '@/core/Commands';
import { EventBus } from '@/core/EventBus';
import { SystemRegistry } from '@/core/Systems';
import { City } from '@/sim/City';
import { registerSimCommands } from '@/sim/commands';
import { simSystems, type SimCtx } from '@/sim/systems';

export function makeSim(seed = 42) {
  const bus = new EventBus();
  const city = new City(bus, seed);
  const ctx: SimCtx = { city };
  const commands = new CommandStack(ctx);
  registerSimCommands(commands);
  const systems = new SystemRegistry<SimCtx>();
  simSystems.forEach((s) => systems.add(s));
  const frame = { dt: 0.1, tickDt: 0.1, alpha: 0, elapsed: 0, tick: 0 };
  const step = (n: number) => {
    for (let i = 0; i < n; i++) systems.run('sim', ctx, frame);
  };
  return { bus, city, commands, step };
}

/** Finds the first valid spot scanning row-major from (sx, sz). */
export function findSpot(city: City, def: string, sx = 40, sz = 160): { x: number; z: number } {
  for (let z = sz; z < city.size - 4; z++)
    for (let x = sx; x < city.size - 4; x++)
      if (city.checkPlacement(buildings.get(def), x, z, 0).ok) return { x, z };
  throw new Error('no spot');
}

/** Finds a flat, dry rectangle `len` tiles wide and 7 deep; returns its west end on the middle row. */
export function findLandRow(city: City, len = 40): { x0: number; z: number } {
  const g = city.grid;
  for (let z = Math.floor(city.size * 0.5); z < city.size - 8; z += 2)
    for (let x = Math.floor(city.size * 0.15); x < city.size - len - 2; x += 2) {
      const { min, max } = g.rangeOver(x, z - 3, len, 7);
      if (min > 0.2 && max - min < 1.2) return { x0: x, z };
    }
  throw new Error('no flat land row');
}
