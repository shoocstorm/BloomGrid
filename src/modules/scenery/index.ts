import type { GameModule } from '@/game/context';
import { Clouds } from './Clouds';
import { SkyLife } from './SkyLife';
import { SeaWonders } from './SeaWonders';
import { WONDER_SITES } from './sites';
import { registerInventoryKind, type CityObject } from '@/sim/inventory';

const WONDERS: [keyof typeof WONDER_SITES, string, string, string][] = [
  ['lighthouse', 'LMK-LIGHTHOUSE', 'Tidewatch Lighthouse', 'A lighthouse whose beam sweeps the night sea.'],
  ['tideGates', 'LMK-TIDE-GATES', 'Tide Gates', 'Three giant pearl rings rising out of the sea.'],
  ['lotus', 'LMK-LOTUS-ATOLL', 'Lotus Atoll', 'An atoll of giant floating flowers.'],
  ['dome', 'LMK-ABYSSAL-DOME', 'Abyssal Dome', 'A deep-sea observatory dome.'],
  ['stacks', 'LMK-VERDANT-PILLARS', 'Verdant Pillars', 'Forested sea stacks.'],
];

/** The sea wonders in the city inventory (decoration: always OK, no metrics). */
function registerWonders(S: number): void {
  const obj = (id: string, name: string, x: number, z: number, w: number): CityObject => ({
    id,
    kind: 'landmark',
    type: 'sea-wonder',
    name,
    group: 'Sea wonders',
    district: 'Open sea',
    x: x * S,
    z: z * S,
    w,
    d: w,
    status: 'ok',
    issues: [],
    metrics: {},
    ref: {},
  });
  const about = new Map(WONDERS.map(([, id, , text]) => [id, text]));
  registerInventoryKind({
    kind: 'landmark',
    label: 'Sea wonders',
    icon: '✧',
    prefixes: ['LMK'],
    description: 'Wonders out at sea (scenery, nothing to manage). Id = LMK-<NAME>.',
    list: () => [
      ...WONDERS.map(([k, id, name]) => obj(id, name, ...(WONDER_SITES[k] as readonly [number, number]), 24)),
      ...WONDER_SITES.whales.map(([x, z], i) => obj(`LMK-WHALES-${i + 1}`, `Whale pod ${i + 1}`, x, z, 40)),
    ],
    details: (_c, o) => ({ description: about.get(o.id) ?? 'Glowing whales that surface now and then.' }),
  });
}

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
    registerWonders(S);
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
