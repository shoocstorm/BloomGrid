import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';
import { float, uniform, uv, vec3 } from 'three/tsl';
import type { GameContext } from '@/game/context';
import { DIFFICULTIES } from '@/sim/difficulty';
import { h } from '@/ui/dom';
import { U } from '@/render/uniforms';
import { openReel } from '@/modules/moments/reel';
import { FilmStage } from '@/modules/moments/FilmStage';
import { orbit, type Framing, type Shot, type V3 } from '@/modules/moments/shots';
import { Person3D } from '@/modules/moments/actors/person';
import { CAST, crowdLook } from '@/modules/moments/actors/cast';
import { BOAT_FLOAT, rowboat } from '@/modules/moments/actors/boat';
import { glow } from '@/modules/moments/actors/rig';
import { WONDER_SITES } from '@/modules/scenery/sites';
import { LANTERN_Y } from '@/modules/scenery/wonderModels';
import { drawIsland } from './islandMap';
import { mapOfCity } from './cityMap';
import './founding.css';

/**
 * "First Light" (D-183, in 3D on location since D-197): the film that plays when a fresh island is founded, ~22 s,
 * shot over the player's own island (the real terrain, sea, lighthouse and hamlet, the city camera posed by the film
 * and the hour set for the film only):
 *
 * 1. Night sea; under it, an older city sleeps. The Tidewatch Lighthouse burns on its rock: Ama Reyes lit it
 *    (canon: `docs/lore/bible.md` Part VI), and her lantern boat follows the light in toward the shore.
 * 2. Dawn breaks over the island as the boat comes in.
 * 3. A seed of light arcs from her lantern onto the hill above the hamlet; a ring of light runs out over the land and
 *    a pillar rises from the hill: the Seedvault wakes.
 * 4. The founding hamlet in the golden morning.
 * 5. A high view of the island at noon, and over it a hologram of its real map with the hamlet on it (DOM).
 * 6. The city's name drops in, "Founded · Day 1", petals fall, and **Begin** ends it.
 *
 * A founding plays it `instant` (D-184): it opens on black over the loading screen and stays black until that screen
 * has gone, so no city frame shows before it; its end hands the camera back before the fly-in (`leaving`) starts.
 * Replayable from Build → Goals → Replays and the gallery (a film, D-181). The city's name reaches the DOM as text.
 */

export interface FilmOptions {
  /** Open on black at once, without fading in (over a loading screen, D-184). */
  instant?: boolean;
  /** Runs as the film starts to fade out (the camera can start its fly-in under it). */
  leaving?: () => void;
}

const PETALS = ['#ffd6e8', '#ffb3cf', '#fff3c4', '#c9f2d4', '#ffffff'];

/** The lantern intro is shown at least this long (spark, flame, bloom), so a fast load never reads as a flash. */
const LANTERN_MIN_MS = 1700;

/**
 * The founding's opening beat while its first shot gets ready: a brass lantern on a dark horizon is lit (a spark, the
 * flame rising, a bloom of light, rings of it running out), embers drift up, its light shimmers on the water, and
 * "Lighting the lantern" writes itself under "The founding of <name>". The name reaches the DOM as text only; the
 * lantern is static SVG we wrote.
 */
function lanternIntro(name: string): HTMLElement {
  const embers = h(
    'div',
    { class: 'ftl-w-embers' },
    ...Array.from({ length: 18 }, () =>
      h('i', {
        style: `--x:${(Math.random() * 16 - 8).toFixed(1)}vmin;--drift:${(Math.random() * 10 - 5).toFixed(1)}vmin;--d:${(0.7 + Math.random() * 2.4).toFixed(2)}s;--t:${(2 + Math.random() * 1.6).toFixed(2)}s;--s:${(0.5 + Math.random() * 0.9).toFixed(2)}`,
      }),
    ),
  );
  const lantern = h('div', { class: 'ftl-w-lantern' }, h('i', { class: 'ftl-w-flame' }, h('i', { class: 'ftl-w-core' })));
  lantern.insertAdjacentHTML('afterbegin', LANTERN_SVG);
  let i = 0;
  const title = h(
    'p',
    { class: 'ftl-w-title' },
    ...'Lighting the lantern'.split(' ').map((w) => h('span', { class: 'ftl-w-word' }, ...[...w].map((ch) => h('span', { style: `--i:${i++}` }, ch)))),
  );
  return h(
    'div',
    { class: 'ftl-wait', role: 'status', 'aria-label': `Lighting the lantern: the founding of ${name}` },
    h(
      'div',
      { class: 'ftl-w-stage' },
      // Everything but the flare in one layer, so the opening fades it as one (its parts run their own animations).
      h(
        'div',
        { class: 'ftl-w-glow' },
        h('i', { class: 'ftl-w-rays' }),
        h('i', { class: 'ftl-w-bloom' }),
        h('i', { class: 'ftl-w-ring' }),
        h('i', { class: 'ftl-w-ring r2' }),
        h('i', { class: 'ftl-w-ring r3' }),
        embers,
        lantern,
        h('i', { class: 'ftl-w-spark' }),
      ),
      h('i', { class: 'ftl-w-flare' }),
    ),
    h('div', { class: 'ftl-w-horizon' }, h('i', { class: 'ftl-w-glint' })),
    h('div', { class: 'ftl-w-words' }, h('p', { class: 'ftl-w-kick' }, `The founding of ${name}`), title),
  );
}

/** A brass storm lantern (60 × 96): a ring and handle, a cap, a glass globe in a cage of bars, a weighted base. */
const LANTERN_SVG = `<svg viewBox="0 0 60 96" aria-hidden="true">
<defs>
  <linearGradient id="ftl-brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b4a22"/><stop offset="0.45" stop-color="#e6b766"/><stop offset="0.6" stop-color="#ffdf9a"/><stop offset="1" stop-color="#7a5426"/></linearGradient>
  <radialGradient id="ftl-glass" cx="0.5" cy="0.62" r="0.6"><stop offset="0" stop-color="#ffe6a8" stop-opacity="0.55"/><stop offset="0.6" stop-color="#ffb35c" stop-opacity="0.18"/><stop offset="1" stop-color="#ff9a40" stop-opacity="0.05"/></radialGradient>
</defs>
<path d="M18 16 Q30 -2 42 16" fill="none" stroke="url(#ftl-brass)" stroke-width="2.6"/>
<circle cx="30" cy="5" r="3" fill="none" stroke="url(#ftl-brass)" stroke-width="2"/>
<path d="M14 24 L20 14 H40 L46 24Z" fill="url(#ftl-brass)"/>
<rect x="12" y="23" width="36" height="4" rx="2" fill="url(#ftl-brass)"/>
<path class="ftl-w-glass" d="M15 27 Q10 50 15 73 H45 Q50 50 45 27Z" fill="url(#ftl-glass)" stroke="rgba(255,226,170,0.35)" stroke-width="0.8"/>
<path d="M15 27 Q10 50 15 73 M45 27 Q50 50 45 73 M30 27 V73" fill="none" stroke="url(#ftl-brass)" stroke-width="1.6"/>
<path d="M21 36 Q19 50 21 64" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" stroke-linecap="round"/>
<rect x="12" y="72" width="36" height="5" rx="2" fill="url(#ftl-brass)"/>
<path d="M14 77 H46 L42 90 H18Z" fill="url(#ftl-brass)"/>
<rect x="16" y="89" width="28" height="3" rx="1.5" fill="#5a3e1c"/>
</svg>`;

/** Plays "First Light"; `done` runs when it has faded out (ended or skipped). */
export function playFounding(ctx: GameContext, done: () => void, opts: FilmOptions = {}): void {
  const { city } = ctx;
  const name = city.growth.name || 'Your city';
  const stage = FilmStage.get(ctx);
  stage.clear();
  const reel = openReel(
    ctx,
    {
      scene: 'ftl',
      label: `the founding of ${name}`,
      instant: opts.instant,
      leak: 'rgba(255, 190, 120, 0.18)',
      key: 0,
      leaving: () => {
        document.body.classList.remove('film-covers');
        stage.close();
        opts.leaving?.();
      },
    },
    done,
  );
  // Over a loading screen the film opens on its own first beat while its first shot gets ready (`hold`): a lantern lit
  // on a dark horizon, embers rising, its light on the water, and the film then opens as an iris out of that light.
  // All of it animates on the compositor (transform / opacity), so it keeps moving while shaders compile.
  if (opts.instant) {
    reel.root.classList.add('hold');
    reel.root.append(lanternIntro(name));
  }

  // ── Where things are on this island ──
  const g = city.grid;
  const S = city.size;
  const sea = () => U.waterLevel.value as number;
  const ground = (x: number, z: number) => Math.max(sea(), g.heightAt(x, z));
  const es = city.buildingEntities();
  const hamlet = new Vector3(S / 2, 0, S / 2);
  if (es.length) {
    hamlet.set(0, 0, 0);
    for (const e of es) {
      const r = city.buildingRecord(e);
      hamlet.x += r.x + 1;
      hamlet.z += r.z + 1;
    }
    hamlet.multiplyScalar(1 / es.length);
  }
  hamlet.y = ground(hamlet.x, hamlet.z);
  // The nearest open sea from the hamlet (water all the way out, not a lagoon): the boat comes in from there.
  const wet = (x: number, z: number) => x < 0 || z < 0 || x > S || z > S || g.heightAt(x, z) < sea() - 0.4;
  const dir = new Vector3(0, 0, 1);
  let shore = 1e9;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    for (let d = 4; d < 200; d += 2) {
      const x = hamlet.x + dx * d;
      const z = hamlet.z + dz * d;
      if (x < 0 || z < 0 || x > S || z > S) break;
      if ([0, 6, 20, 45, 70, 95].every((k) => wet(x + dx * k, z + dz * k))) {
        if (d < shore) {
          shore = d;
          dir.set(dx, 0, dz);
        }
        break;
      }
    }
  }
  if (shore > 1e8) shore = 30;
  const side = new Vector3(dir.z, 0, -dir.x);
  const yawSea = Math.atan2(dir.x, dir.z);
  const at = (d: number, s = 0) => new Vector3(hamlet.x + dir.x * d + side.x * s, sea(), hamlet.z + dir.z * d + side.z * s);
  const boatFrom = at(shore + 80, -6);
  const boatTo = at(shore + 7, 2);
  // The seed lands on the highest ground near the hamlet.
  const seedAt = hamlet.clone();
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2 * 7;
    const r = 4 + (i / 160) * 30;
    const x = hamlet.x + Math.cos(a) * r;
    const z = hamlet.z + Math.sin(a) * r;
    const y = ground(x, z);
    if (y > seedAt.y) seedAt.set(x, y, z);
  }
  const lighthouseSite = WONDER_SITES.lighthouse as readonly [number, number];
  const light = new Vector3(lighthouseSite[0] * S, sea() + LANTERN_Y, lighthouseSite[1] * S);
  const v = (p: Vector3, dy = 0): V3 => [p.x, p.y + dy, p.z];

  // ── The cast: Ama Reyes at the bow of her lantern boat, holding the light up; three fishers behind her. ──
  const boat = rowboat(true);
  boat.root.scale.setScalar(0.55);
  boat.root.rotation.y = Math.atan2(-dir.x, -dir.z);
  boat.lamp.emissiveIntensity = 2.4;
  const ama = new Person3D(CAST.keeper);
  ama.root.position.set(0, -0.3, 0.75);
  ama.root.rotation.y = -Math.PI / 2;
  ama.act('hold');
  ama.pose.snap();
  boat.root.add(ama.root);
  const crew = Array.from({ length: 3 }, (_, i) => {
    const p = new Person3D({ ...crowdLook(i * 5 + 2), hat: 'beanie', prop: 'none' });
    p.root.scale.setScalar(0.9);
    p.root.position.set((i - 1) * 0.42, -0.42, -0.6 + (i % 2) * 0.25);
    p.root.rotation.y = -Math.PI / 2;
    p.act('sit', { headPitch: -0.1 });
    p.pose.snap();
    boat.root.add(p.root);
    return p;
  });
  stage.add(boat.root);

  // The seed of light, the ring that runs out over the land, the vault's pillar.
  const seed = new Mesh(new SphereGeometry(0.6, 20, 14), glow(0xfff2c0, 6));
  seed.visible = false;
  const ringOn = uniform(0);
  const ringMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  ringMat.colorNode = vec3(0.6, 1, 0.55).mul(ringOn);
  const ring = new Mesh(new TorusGeometry(1, 0.012, 6, 128), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(seedAt).setY(seedAt.y + 0.6);
  ring.visible = false;
  const pillarOn = uniform(0);
  const pillarMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
  pillarMat.colorNode = vec3(1, 0.85, 0.5).mul(pillarOn.mul(float(1).sub(uv().y)).mul(0.9));
  const pillar = new Mesh(new CylinderGeometry(1.2, 2.4, 60, 32, 1, true).translate(0, 30, 0), pillarMat);
  pillar.position.copy(seedAt);
  pillar.visible = false;
  stage.add(seed, ring, pillar);

  // ── Per frame: the boat sails in and rocks; the hour moves; the seed flies; the land wakes. ──
  let sailAt = -1;
  let hour = { from: 0.03, to: 0.03, at: 0, dur: 1 };
  let seedFrom = -1;
  let bloomAt = -1;
  const lamp = new Vector3();
  const hourTo = (to: number, dur: number) => {
    hour = { from: stage.timeOfDay ?? 0.03, to, at: stage.t, dur };
  };
  stage.onFrame = (t, dt) => {
    const k = sailAt < 0 ? 0 : Math.min(1, (t - sailAt) / 11);
    const e = 1 - (1 - k) ** 2;
    boat.root.position.lerpVectors(boatFrom, boatTo, e);
    boat.root.position.y = sea() + BOAT_FLOAT * 0.55 + Math.sin(t * 1.3) * 0.03;
    boat.root.rotation.z = Math.sin(t * 0.9) * 0.04;
    ama.update(dt);
    for (const c of crew) c.update(dt);
    const hk = Math.min(1, (t - hour.at) / hour.dur);
    stage.setTime(hour.from + (hour.to - hour.from) * (hk * hk * (3 - 2 * hk)));
    if (seedFrom >= 0) {
      const s = Math.min(1, (t - seedFrom) / 2.2);
      ama.lamp?.getWorldPosition(lamp);
      seed.visible = s < 1;
      seed.position.lerpVectors(lamp, seedAt, s);
      seed.position.y += Math.sin(s * Math.PI) * (12 + seedAt.distanceTo(lamp) * 0.3);
    }
    if (bloomAt >= 0) {
      const b = t - bloomAt;
      ring.visible = pillar.visible = true;
      ring.scale.setScalar(2 + b * 18);
      ringOn.value = Math.max(0, 1 - b / 3);
      pillarOn.value = Math.min(1, b * 2) * Math.max(0, 1 - (b - 1.5) / 2.5);
    }
    stage.anchor.copy(boat.root.position);
  };
  const cut = (from: Framing, to?: Framing, dur = 0, o: Partial<Shot> = {}) => {
    stage.shots = [{ at: stage.t, dur, from, to, ...o }];
  };

  // ── DOM over the frame: the hologram of the island's real map, the name, petals. ──
  const map = h('canvas', { class: 'ftl-map' }) as HTMLCanvasElement;
  drawIsland(map, city.seed, city.size, mapOfCity(city));
  const here = h(
    'div',
    { class: 'ftl-here', style: `left:${(6 + (88 * hamlet.x) / S).toFixed(2)}%;top:${(6 + (88 * hamlet.z) / S).toFixed(2)}%` },
    h('i', {}),
    h('b', {}, name),
  );
  const holo = h(
    'div',
    { class: 'ftl-holo' },
    h('div', { class: 'ftl-scan' }),
    h('div', { class: 'ftl-plate' }, map, h('div', { class: 'ftl-grid' }), here, h('div', { class: 'ftl-tag' }, h('i', {}), `Island #${city.seed} · Seedvault grid online`)),
  );
  const flash = h('div', { class: 'ftl-flash' });
  const petals = h('div', { class: 'ftl-petals' });
  const title = h('div', { class: 'ftl-title' });
  reel.set.append(holo, flash, petals, title);

  // The first frame of the film, posed before anything shows: far out at night, the island a dark line.
  stage.setFog(null);
  const toIsland = (up: number): V3 => [hamlet.x, hamlet.y + up, hamlet.z];
  const film = async () => {
    reel.cue('cs-night');
    reel.bed('sea', 0.7, 2.5);
    reel.bed('wind', 0.35, 2.5);
    reel.bed('drone', 0.15, 3);
    if (!(await reel.wait(0))) return;
    stage.openLocation(0.03);
    cut(
      { pos: v(at(shore + 110, 18), 7), look: toIsland(8), fov: 40 },
      { pos: v(at(shore + 96, 14), 6), look: toIsland(8), fov: 38 },
      5,
    );
    if (opts.instant) {
      // Held only until the first shot is ready: its shaders built and a few frames of it drawn, so the film opens on a
      // moving picture, not a compile stall. The loading screen under it (a founding: D-184) may still be finishing
      // its last stages; the film covers it from here (`film-covers` hides it) rather than waiting for its fade.
      const held = performance.now();
      try {
        await ctx.renderer.compileAsync(ctx.scene, ctx.camera);
      } catch {
        /* compiled on first draw instead */
      }
      const f0 = ctx.engine.frames;
      for (let i = 0; i < 80 && ctx.engine.frames < f0 + 4; i++) if (!(await reel.wait(50))) return;
      document.body.classList.add('film-covers');
      // The lantern gets its moment (lit and blooming) however quickly the shot was ready.
      const lit = performance.now() - held;
      if (lit < LANTERN_MIN_MS && !(await reel.wait(LANTERN_MIN_MS - lit))) return;
      reel.root.classList.remove('hold');
      console.info('[film] first light held on black ms', Math.round(performance.now() - held));
      // Once the loading screen has finished under the film, it no longer needs hiding.
      void (async () => {
        for (let i = 0; i < 300 && document.querySelector('.boot-screen:not(.bt-gone)'); i++) await new Promise((r) => setTimeout(r, 100));
        document.body.classList.remove('film-covers');
      })();
    }

    // 1. Night sea, and the light on the rock.
    if (!(await reel.wait(700))) return;
    reel.say('Before the city, there was only the sea. Under it, an older city slept.');
    if (!(await reel.wait(1900))) return;
    reel.on('beacon');
    reel.cue('cs-blink');
    reel.hit('shimmer', 0.1);
    cut(orbit(v(light, -6), 80, Math.atan2(light.x - S / 2, light.z - S / 2), 0.12, 34), orbit(v(light, -6), 68, Math.atan2(light.x - S / 2, light.z - S / 2) + 0.15, 0.1, 32), 2.2);
    reel.say('Then a Drift fisher, Ama Reyes, lit a light on the north rock.');
    if (!(await reel.wait(2000))) return;

    // The boat follows it home: alongside, the lantern held up.
    reel.on('sail');
    sailAt = stage.t;
    // Behind and beside the boat, low over the water, looking past Ama's lantern to the island.
    const bx = dir.x * 3.2 + side.x * 1.4;
    const bz = dir.z * 3.2 + side.z * 1.4;
    cut({ pos: [bx, 1.1, bz], look: [-dir.x * 4, 0.9, -dir.z * 4], fov: 40 }, { pos: [bx * 0.8, 0.9, bz * 0.8], look: [-dir.x * 5, 1.0, -dir.z * 5], fov: 38 }, 2.4, { rel: true });
    reel.say('One boat, one lantern, a handful of fishers followed it home…');
    if (!(await reel.wait(2300))) return;

    // 2. Dawn, and the island.
    reel.on('dawn');
    hourTo(0.27, 3.6);
    reel.cue('cs-whoosh');
    reel.bed('drone', 0, 2);
    reel.bed('wind', 0.2, 2);
    reel.hit('swell', 0.4, 3);
    reel.hit('gulls', 2.2);
    cut({ pos: v(at(shore + 60, 30), 12), look: toIsland(4), fov: 42 }, { pos: v(at(shore + 48, 22), 9), look: toIsland(6), fov: 40 }, 3.4);
    reel.say('…to an island no map had named.');
    if (!(await reel.wait(1100))) return;
    ctx.bus.emit('moment', { id: 'founding', sound: 'wonder' });
    if (!(await reel.wait(2300))) return;

    // 3. The seed: from the lantern, onto the hill.
    reel.on('seed');
    seedFrom = stage.t;
    reel.cue('cs-blink');
    cut({ pos: v(at(shore + 18, -8), 5), look: v(seedAt, 6), fov: 46 }, { pos: v(at(shore + 15, -6), 7), look: v(seedAt, 2), fov: 44 }, 2.4);
    reel.say('A child planted the first seed.');
    if (!(await reel.wait(2200))) return;
    reel.on('bloom');
    bloomAt = stage.t;
    reel.cue('cs-reveal');
    reel.hit('thud', 0.1);
    reel.hit('choir', 0.3, 2.4);
    cut(orbit(v(seedAt, 3), 46, yawSea + 0.3, 0.35, 44), orbit(v(seedAt, 3), 40, yawSea + 0.45, 0.32, 42), 2.4);
    reel.say('Deep in the hill, something old felt it, and woke.');
    if (!(await reel.wait(2000))) return;

    // 4. The hamlet in the golden morning.
    reel.on('homes');
    hourTo(0.32, 2.4);
    reel.cue('day');
    cut(orbit(v(hamlet, 2), 26, yawSea - 0.35, 0.28, 40), orbit(v(hamlet, 2), 21, yawSea - 0.15, 0.24, 38), 2.6);
    reel.say('Homes rose by the water, and the lights came on.');
    if (!(await reel.wait(2400))) return;

    // 5. Island OS, in full day: the whole island from high up, its map unfolding over it (the boat is ashore now).
    reel.on('holo');
    boat.root.visible = false;
    hourTo(0.45, 3);
    reel.cue('ready');
    reel.hit('shimmer', 0.2);
    const mid: V3 = [S / 2, sea(), S / 2];
    cut(orbit(mid, S * 0.75, yawSea, 0.75, 44), orbit(mid, S * 0.7, yawSea + 0.12, 0.8, 44), 3);
    reel.say('The old grid hummed back to life, and it needed a steward.');
    if (!(await reel.wait(2600))) return;

    // 6. The name, over the hamlet in the sun.
    reel.on('named');
    flash.classList.add('go');
    cut(orbit(v(hamlet, 3), 40, yawSea - 0.3, 0.4, 42), orbit(v(hamlet, 3), 48, yawSea + 0.5, 0.45, 42), 16, { ease: 'linear' });
    const diff = DIFFICULTIES[city.steward.difficulty]?.label;
    // Letters drop one by one, but words stay whole (a long name wraps between words, and shrinks to fit).
    let li = 0;
    const words = name.split(/\s+/).filter(Boolean);
    const longest = Math.max(...words.map((w) => w.length), 4);
    title.replaceChildren(
      h('div', { class: 'ftl-kick' }, 'Founded · Day 1', diff ? ` · ${diff} difficulty` : ''),
      h(
        'div',
        { class: 'ftl-name', style: `--len:${longest};--all:${Math.max(10, name.length)}` },
        ...words.map((w) => h('span', { class: 'ftl-word' }, ...[...w].map((ch) => h('span', { style: `--i:${li++}` }, ch)))),
      ),
      h('p', { class: 'ftl-sub' }, 'The Island Compact chose you. Grow it gently, steward.'),
      h('button', { class: 'ftl-go', onClick: () => reel.finish() }, 'Begin'),
    );
    title.classList.add('show');
    reel.cue('cs-fanfare');
    reel.hit('resolve', 0.3);
    reel.say('');
    for (let i = 0; i < 40; i++)
      petals.append(
        h('i', {
          style: `left:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 2.2).toFixed(2)}s;--r:${(Math.random() * 540 - 270).toFixed(0)}deg;--s:${(0.6 + Math.random() * 0.8).toFixed(2)};--c:${PETALS[i % PETALS.length]};--sway:${(Math.random() * 14 - 7).toFixed(1)}vw`,
        }),
      );
    petals.classList.add('show');
    reel.root.querySelector('.reel-skip')?.classList.add('hidden');
    (title.querySelector('.ftl-go') as HTMLElement | null)?.focus({ preventScroll: true });
    if (!(await reel.wait(14000))) return;
    reel.finish();
  };
  void film();
}
