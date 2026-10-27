import type { GameModule } from '@/game/context';
import { Clouds } from './Clouds';
import { SkyLife } from './SkyLife';
import { SeaWonders } from './SeaWonders';

/**
 * Scenery: drifting clouds, balloons, an airship and seabirds in the sky; wonders out at sea. Pure
 * decoration with no sim state, built once: clouds and sky life are
 * two draw calls; each wonder and whale pod is one more, culled when out of view.
 */
export const sceneryModule: GameModule = {
  id: 'scenery',
  deps: ['world'],
  init(ctx) {
    const S = ctx.city.size;
    const clouds = new Clouds();
    const life = new SkyLife(S);
    const sea = new SeaWonders(S);
    ctx.scene.add(clouds.mesh, life.mesh, sea.group);

    ctx.systems.add({
      id: 'scenery.update',
      phase: 'sync',
      update(c) {
        const cam = c.cameraCtl;
        clouds.focus.value.copy(cam.target);
        clouds.clear.value = Math.max(60, cam.distance * 0.5);
        sea.update();
      },
    });
  },
};
