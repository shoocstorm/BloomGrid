import type { GameModule } from '@/game/context';
import { Clouds } from './Clouds';
import { SkyLife } from './SkyLife';
import { SeaWonders } from './SeaWonders';
import { WONDER_SITES } from './sites';
import { registerInventoryKind, type CityObject } from '@/sim/inventory';
import { wonderVisible } from '@/sim/wonders';

const WONDERS: [keyof typeof WONDER_SITES, string, string, string][] = [
  ['lighthouse', 'LMK-LIGHTHOUSE', 'Tidewatch Lighthouse', 'A banded lighthouse on a palm-crowned islet, with the keeper’s cottage, a jetty and a sailboat; its beam sweeps the night sea.'],
  ['tideGates', 'LMK-TIDE-GATES', 'Tide Gates', 'Three giant pearl rings inlaid with bronze and glowing runes, crowned with jewels, on stone plinths among coral and channel buoys.'],
  ['lotus', 'LMK-LOTUS-ATOLL', 'Lotus Atoll', 'Giant glowing lotus flowers on lily pads, raised leaves, floating lanterns and a tea pavilion.'],
  ['dome', 'LMK-ABYSSAL-DOME', 'Abyssal Dome', 'A ribbed glass observatory dome on raking legs, ringed by solar petals, with a telescope, a pier, a yellow submarine and a kelp farm.'],
  ['stacks', 'LMK-VERDANT-PILLARS', 'Verdant Pillars', 'Karst sea stacks crowned with jungle, hung with flowering vines, joined by rope bridges, with a waterfall, a treehouse and a sea arch.'],
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
    // Only the wonders already discovered (D-072).
    list: (city) => [
      ...WONDERS.filter(([k]) => wonderVisible(city, k)).map(([k, id, name]) =>
        obj(id, name, ...(WONDER_SITES[k] as readonly [number, number]), 24),
      ),
      ...(wonderVisible(city, 'whales')
        ? WONDER_SITES.whales.map(([x, z], i) => obj(`LMK-WHALES-${i + 1}`, `Whale pod ${i + 1}`, x, z, 40))
        : []),
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
    // Wonders not yet discovered stay under the sea (fresh islands, D-072); a discovery raises one.
    const visible = (id: string) => wonderVisible(ctx.city, id);
    const refresh = (rise: boolean) => sea.sync(visible, rise) && ctx.services.tryGet('world')?.atmosphere.invalidateShadows();
    refresh(false);
    for (const ev of ['city:reset', 'load:done', 'stats:updated'] as const) ctx.bus.on(ev, () => refresh(false));
    ctx.bus.on('wonder:discovered', ({ id, name }) => {
      refresh(true);
      const k = id as keyof typeof WONDER_SITES;
      const site = (k === 'whales' ? WONDER_SITES.whales[0] : WONDER_SITES[k]) as readonly [number, number] | undefined;
      ctx.bus.emit('toast', {
        text: `✧ A new sea wonder: ${name} has risen from the sea`,
        tone: 'ok',
        ...(site ? { at: { x: site[0] * S, z: site[1] * S } } : {}),
      });
    });

    ctx.systems.add({
      id: 'scenery.update',
      phase: 'sync',
      update(c, f) {
        const cam = c.cameraCtl;
        clouds.focus.value.copy(cam.target);
        clouds.clear.value = Math.max(60, cam.distance * 0.5);
        if (sea.update(f.dt)) c.services.tryGet('world')?.atmosphere.invalidateShadows();
      },
    });
  },
};
