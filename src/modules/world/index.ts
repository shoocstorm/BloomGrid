import type { Mesh } from 'three/webgpu';
import type { GameModule, GameContext } from '@/game/context';
import { Atmosphere } from '@/world/Atmosphere';
import { Flora } from '@/world/Flora';
import { Terrain } from '@/world/Terrain';
import { createWater } from '@/world/Water';
import { DAY_LENGTH, chunkSizeFor } from '@/sim/City';
import { Building } from '@/ecs/components';
import { buildings } from '@/content';

export interface WorldService {
  atmosphere: Atmosphere;
  flora: Flora;
  terrain: Terrain;
}

declare module '@/core/Services' {
  interface GameServices {
    world: WorldService;
  }
}

/** Terrain, water, sky/day-night and wild flora. Rebuilds itself when the city resets. */
export const worldModule: GameModule = {
  id: 'world',
  init(ctx) {
    const atmosphere = new Atmosphere(ctx.scene);
    atmosphere.setShadowMapSize(ctx.quality.settings.shadowMapSize);
    ctx.renderer.shadowMap.enabled = ctx.quality.settings.shadows;
    atmosphere.bakeEnvironment(ctx.renderer);

    let seed = -1;
    let terrain!: Terrain;
    let water: Mesh | null = null;
    let flora!: Flora;
    const service = { atmosphere } as WorldService;

    const build = () => {
      const { city } = ctx;
      if (seed !== city.seed) {
        seed = city.seed;
        if (terrain) {
          ctx.scene.remove(terrain.group);
          terrain.group.traverse((o) => (o as Mesh).geometry?.dispose());
        }
        if (water) {
          ctx.scene.remove(water);
          water.geometry.dispose();
        }
        terrain = new Terrain(city.grid, city.seed, chunkSizeFor(city.size));
        water = createWater(city.grid);
        ctx.scene.add(terrain.group, water);
      }
      if (flora) for (let i = 0; i < city.grid.w * city.grid.h; i++) flora.hideTile(i);
      flora = new Flora(city.grid, ctx.instancer, city.seed);
      flora.density = ctx.quality.settings.floraDensity;
      flora.populate();
      ctx.cameraCtl.setGrid(city.grid);
      service.terrain = terrain;
      service.flora = flora;
    };
    build();
    ctx.bus.on('city:reset', build);

    // Clear / regrow wild flora where the city builds.
    const footprintTiles = (ctx: GameContext, eid: number, fn: (idx: number) => void) => {
      const g = ctx.city.grid;
      for (let z = Building.z[eid]!; z < Building.z[eid]! + Building.d[eid]!; z++)
        for (let x = Building.x[eid]!; x < Building.x[eid]! + Building.w[eid]!; x++) fn(g.index(x, z));
    };
    ctx.bus.on('building:added', ({ eid }) => footprintTiles(ctx, eid, (i) => flora.hideTile(i)));
    ctx.bus.on('building:removed', ({ record }) => {
      const g = ctx.city.grid;
      const [w, d] = ctx.city.footprint(buildings.get(record.def), record.rot);
      for (let z = record.z; z < record.z + d; z++) for (let x = record.x; x < record.x + w; x++) flora.showTile(g.index(x, z));
    });
    for (const ev of ['building:added', 'building:removed', 'city:reset'] as const) ctx.bus.on(ev, () => atmosphere.invalidateShadows());
    ctx.bus.on('road:changed', ({ tiles }) => {
      for (const t of tiles) {
        if (ctx.city.grid.road[t]) flora.hideTile(t);
        else flora.showTile(t);
      }
    });

    ctx.services.provide('world', service);

    ctx.systems.add({
      id: 'world.atmosphere',
      phase: 'sync',
      update(c, f) {
        // Interpolate time of day between ticks for smooth sun motion.
        const t = (c.city.timeOfDay + (f.alpha * c.engine.speed * c.engine.step) / DAY_LENGTH) % 1;
        atmosphere.applyTime(t);
        if (c.instancer.animating) atmosphere.invalidateShadows();
        atmosphere.follow(c.camera.position, c.cameraCtl.target, c.cameraCtl.distance, f.dt);
        c.instancer.shadowFocus.copy(c.cameraCtl.target);
        // Zoomed far out, distant shadows are sub-pixel: only the area around the focus casts them.
        c.instancer.shadowRadius = atmosphere.shadowExtent * (c.cameraCtl.distance > 180 ? 0.45 : 1.1);
      },
    });
  },
};
