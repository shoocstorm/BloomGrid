import type { GameModule } from '@/game/context';
import { Clouds } from './Clouds';
import { SkyLife } from './SkyLife';
import { SeaWonders, WONDER_MODELS } from './SeaWonders';
import { WONDER_SITES, type WonderSite } from './sites';
import { registerInventoryKind, type CityObject } from '@/sim/inventory';
import { wonderVisible } from '@/sim/wonders';
import { Box3, Mesh, Vector3 } from 'three/webgpu';
import { getMaterial } from '@/render/materials/library';
import type { GameContext } from '@/game/context';
import type { ObjectSheet } from '@/ui/Hud';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { U } from '@/render/uniforms';
import { registerPickable } from '@/modules/construction/pick';
import { LORE } from './lore';
import { dolphinSchool, dolphinsLeaping, whalePod, whalesNow } from './SeaLife';
import { journeyOf, podSite } from './whaleRoute';
import './wonder.css';

const WONDERS: [WonderSite, string, string, string][] = [
  ['lighthouse', 'LMK-LIGHTHOUSE', 'Tidewatch Lighthouse', 'A banded lighthouse on a palm-crowned islet, with the keeper’s cottage, a jetty and a sailboat; its beam sweeps the night sea.'],
  ['tideGates', 'LMK-TIDE-GATES', 'Tide Gates', 'Three giant pearl rings inlaid with bronze and glowing runes, crowned with jewels, on stone plinths among coral and channel buoys.'],
  ['lotus', 'LMK-LOTUS-ATOLL', 'Lotus Atoll', 'Giant glowing lotus flowers on lily pads, raised leaves, floating lanterns and a tea pavilion.'],
  ['dome', 'LMK-ABYSSAL-DOME', 'Abyssal Dome', 'A ribbed glass observatory dome on raking legs, ringed by solar petals, with a telescope, a pier, a yellow submarine and a kelp farm.'],
  ['stacks', 'LMK-VERDANT-PILLARS', 'Verdant Pillars', 'Karst sea stacks crowned with jungle, hung with flowering vines, joined by rope bridges, with a waterfall, a treehouse and a sea arch.'],
  ['turtle', 'LMK-TURTLE-ISLE', 'Turtle Isle', 'A giant sea turtle asleep at the surface, a garden on its shell: palms, a shrine with a lantern, flowers and a tide pool.'],
  ['colonnade', 'LMK-SUNKEN-COLONNADE', 'Sunken Colonnade', 'The drowned ruins of a marble temple: fluted columns and lintels rising from the sea, toppled drums, a stair to a domed rotunda, ivy and glowing moss.'],
  ['geode', 'LMK-PRISM-GEODE', 'Prism Geode', 'A cracked stone geode bursting with giant amethyst and aqua crystals that glow at night, ringed by a boardwalk.'],
];

/** The sea wonders in the city inventory (decoration: always OK, no metrics). */
function registerWonders(S: number): void {
  const obj = (id: string, name: string, x: number, z: number, w: number, object: string): CityObject => ({
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
    ref: { object },
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
        obj(id, name, ...(WONDER_SITES[k] as readonly [number, number]), 24, `wonder:${k}`),
      ),
      ...(wonderVisible(city, 'whales')
        ? [
            ...WONDER_SITES.whales.map((_, i) => obj(`LMK-WHALES-${i + 1}`, `Whale pod ${i + 1}`, ...podSite(i, U.clock.value, S), 40, `wonder:whales-${i}`)),
            ...WONDER_SITES.dolphins.map(([x, z], i) => obj(`LMK-DOLPHINS-${i + 1}`, `Dolphin school ${i + 1}`, x, z, 40, `wonder:dolphins-${i}`)),
          ]
        : []),
    ],
    details: (_c, o) => ({
      description:
        about.get(o.id) ??
        (o.id.startsWith('LMK-DOLPHINS')
          ? 'A school of dolphins racing in circles, leaping in arcs with a splash.'
          : 'Humpback whales with glowing spots: they surface to blow, breach clear of the sea and dive with their flukes up.'),
    }),
  });
}

/**
 * Scenery: drifting clouds, balloons, an airship and seabirds in the sky; wonders out at sea. Pure
 * decoration with no sim state, built once: clouds and sky life are
 * two draw calls; each wonder and whale pod is one more, culled when out of view.
 */
export const sceneryModule: GameModule = {
  id: 'scenery',
  deps: ['world', 'hud'],
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
    wonderInspector(ctx, sea.group.children as Mesh[]);
    galleryExhibits(ctx, S);
    for (const ev of ['city:reset', 'load:done', 'stats:updated'] as const) ctx.bus.on(ev, () => refresh(false));
    ctx.bus.on('wonder:discovered', ({ id, name }) => {
      refresh(true);
      const k = id as keyof typeof WONDER_SITES;
      const site = (k === 'whales' ? podSite(0, U.clock.value, S) : WONDER_SITES[k]) as readonly [number, number] | undefined;
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

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Mesh name → wonder id (pods are numbered by their order). */
const MESH_IDS: Record<string, WonderSite> = {
  lighthouse: 'lighthouse',
  'tide-gates': 'tideGates',
  'lotus-atoll': 'lotus',
  'abyssal-dome': 'dome',
  'verdant-pillars': 'stacks',
  'turtle-isle': 'turtle',
  'sunken-colonnade': 'colonnade',
  'prism-geode': 'geode',
};

/**
 * Clicking a sea wonder (or picking it in the inventory) opens its inspector (D-164): the island's story about it,
 * what to look for, a few facts, a keeper's line, and Locate / Charter the ferry. Whale pods and dolphin schools say
 * live what they are doing (the shader's cycle mirrored on the CPU).
 */
function wonderInspector(ctx: GameContext, meshes: Mesh[]): void {
  const S = ctx.city.size;
  const hud = ctx.services.get('hud');
  const pods = { whales: 0, dolphins: 0 };
  for (const m of meshes) {
    let key: string | null = null;
    let box: Box3 | null = null;
    const site = MESH_IDS[m.name];
    if (site) {
      key = site;
      m.geometry.computeBoundingBox();
      box = m.geometry.boundingBox!.clone();
    } else if (m.name === 'whales' || m.name === 'dolphins') {
      const i = pods[m.name]++;
      // Whale pods roam (their mesh moves, so their box sits round its origin); dolphin schools stay put.
      const [u, v] = m.name === 'whales' ? [0, 0] : WONDER_SITES.dolphins[i]!.map((k) => k * S);
      const r = m.name === 'whales' ? 42 : 34;
      key = `${m.name}-${i}`;
      box = new Box3(new Vector3(u! - r, -1, v! - r), new Vector3(u! + r, 4, v! + r));
    }
    if (!key || !box) continue;
    registerPickable({ object: `wonder:${key}`, node: m, box });
    hud.objectInspector(`wonder:${key}`, () => sheet(ctx, key!));
  }
}

function sheet(ctx: GameContext, key: string): ObjectSheet | null {
  const { city } = ctx;
  const S = city.size;
  const [base, pod] = key.split('-') as [string, string | undefined];
  const lore = LORE[base];
  if (!lore || !wonderVisible(city, base === 'dolphins' ? 'whales' : base)) return null;
  const at =
    base === 'whales'
      ? podSite(Number(pod), U.clock.value, S)
      : pod !== undefined
        ? WONDER_SITES.dolphins[Number(pod)]!
        : WONDER_SITES[base as WonderSite];
  const [x, z] = [at[0] * S, at[1] * S];
  const bearing = COMPASS[Math.round(((Math.atan2(x - S / 2, -(z - S / 2)) / (Math.PI * 2)) * 8 + 8)) % 8]!;
  const n = pod !== undefined ? ` ${Number(pod) + 1}` : '';
  const id = base === 'whales' ? `LMK-WHALES${n.replace(' ', '-')}` : base === 'dolphins' ? `LMK-DOLPHINS${n.replace(' ', '-')}` : (WONDERS.find(([k]) => k === base)?.[1] ?? 'LMK');
  const btn = (glyph: string, label: string, title: string, run: () => void) =>
    h('button', { class: 'tool', title, onClick: run }, h('span', { class: 'g' }, icon(glyph)), label);
  const ferry = ctx.services.tryGet('ferry');
  const sails = base !== 'dolphins' && !!ferry?.active;
  const now =
    base === 'whales'
      ? whalesNow(Number(pod), U.clock.value)
      : base === 'dolphins'
        ? dolphinsLeaping(Number(pod), U.clock.value)
          ? 'Leaping'
          : 'Running deep'
        : 'Risen';
  return {
    glyph: lore.glyph,
    code: `SEA WONDER · ${id}`,
    place: `Open sea, ${bearing} of the island`,
    title: pod !== undefined ? `${lore.name.replace(/s$/, '')}${n}` : lore.name,
    desc: lore.tagline,
    vitals: [
      ['sparkle', pod !== undefined ? 'Now' : 'Status', now, now === 'Breaching!' || now === 'Leaping' || now === 'Risen' ? 'good' : ''],
      ['eye', 'Best seen', lore.bestSeen],
      ['locate', 'Bearing', bearing[0]!.toUpperCase() + bearing.slice(1)],
      ...(base === 'whales' ? [['compass', 'Journey', journeyOf(Number(pod), U.clock.value, S)] as [string, string, string]] : []),
    ],
    body: [
      h(
        'div',
        { class: 'wonder-story' },
        h('div', { class: 'ws-head' }, icon('book'), 'The story'),
        ...lore.story.map((p) => h('p', {}, p)),
        h('div', { class: 'ws-head' }, icon('eye'), 'Look for'),
        h('ul', { class: 'ix-notes' }, ...lore.look.map((l) => h('li', {}, icon('sparkle'), h('span', {}, l)))),
      ),
    ],
    rows: lore.facts,
    note: lore.quote,
    actions: [
      btn('locate', 'Locate', 'Fly the camera there', () =>
        ctx.cameraCtl.locate(x, z, { size: base === 'whales' || base === 'dolphins' ? 90 : 60, height: 4 }),
      ),
      ...(sails
        ? [
            btn('ferry', 'Charter ferry', 'The Tidesong sails here on her next voyage', () => {
              const ok = ferry!.charter(base);
              ctx.bus.emit('toast', {
                text: ok ? `The Tidesong will sail to ${lore.name} next` : `The Tidesong can’t reach ${lore.name} just now`,
                tone: ok ? 'ok' : 'info',
              });
            }),
          ]
        : []),
    ],
  };
}

/** The model gallery's sea halls: every wonder (whether or not this island has found it yet) and the sea life. */
function galleryExhibits(ctx: GameContext, S: number): void {
  const gallery = ctx.services.tryGet('gallery');
  if (!gallery) return;
  const facts = (k: string): [string, string][] => [...LORE[k]!.facts, ['Best seen', LORE[k]!.bestSeen]];
  for (const [k, model] of Object.entries(WONDER_MODELS)) {
    const lore = LORE[k]!;
    gallery.add({
      id: `wonder:${k}`,
      name: lore.name,
      group: 'Sea wonders',
      blurb: `${lore.tagline} ${lore.story[0] ?? ''}`,
      facts: facts(k),
      water: true,
      build: () => {
        const mesh = new Mesh(model(S).b.build(), getMaterial('wonder'));
        mesh.castShadow = mesh.receiveShadow = true;
        return { object: mesh };
      },
    });
  }
  // Sea life swims in the shader round its pod's centre: frame the circle it swims, not its rest geometry.
  const life: [string, () => Mesh, number][] = [
    ['whales', () => whalePod(0, 0, 0), 40],
    ['dolphins', () => dolphinSchool(0, 0, 0), 36],
  ];
  for (const [k, make, radius] of life) {
    const lore = LORE[k]!;
    gallery.add({
      id: k,
      name: lore.name,
      group: 'Sea life',
      blurb: `${lore.tagline} ${lore.story[0] ?? ''}`,
      facts: facts(k),
      water: true,
      build: () => ({ object: make(), frame: { center: new Vector3(0, 0, 0), radius } }),
    });
  }
}
