import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three/webgpu';
import { attribute, float, fract, mix, positionLocal, sin, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { City } from '@/sim/City';
import type { GameContext } from '@/game/context';
import { LORE } from '@/modules/scenery/lore';
import { WONDER_MODELS } from '@/modules/scenery/SeaWonders';
import { dolphinSchool } from '@/modules/scenery/SeaLife';
import { getMaterial } from '@/render/materials/library';
import { U } from '@/render/uniforms';
import { LOOKS as STAGE_LOOKS, type StageLook } from '@/render/stageUniforms';
import { WONDERS } from '@/sim/wonders';
import { hash2 } from '@/sim/random';
import { openReel } from '../reel';
import { FilmStage } from '../FilmStage';
import { orbit, type Framing, type Shot, type V3 } from '../shots';
import { Person3D, type Look as PersonLook } from '../actors/person';
import { Gull3D } from '../actors/gull';
import { CAST } from '../actors/cast';
import { BALL, glow, hard, joint, part, soft } from '../actors/rig';
import './stirs.css';

/**
 * "Something Stirs" (D-185, D-193, in 3D since D-197): a sea wonder rises, ~22 s. It plays for six of the seven
 * wonders, so it is a serial, not a rerun: the same old fisher (one per city) misses every wonder in a new way, and on
 * the sixth he finally sees one. Each episode is a 3D set at sea: his rowboat, the far island with the Tidewatch
 * Lighthouse, and the wonder itself (the game's own model, `WONDER_MODELS`) rising out of the water:
 *
 * 1. **Wide**: the boat at sea, in the light of that wonder's hour (`HOURS`: the Tide Gates after a storm in the
 *    rain, the Lotus at dawn, the Stacks in mist, the Dome at night, the Turtle at noon, the Geode under an aurora).
 * 2. **Close** on the fisher: the episode's gag (`BITS`, with a `tease` beat where it needs suspense), which always
 *    ends with something going over the side.
 * 3. **Under the sea** (a hard cut): the thing sinks past the hull; the camera tilts down after it, to where the
 *    Choir's light (`docs/lore/bible.md` Part IV) runs in, gathers round something vast, and flares.
 * 4. **Rise**, low and wide: the wonder breaks the surface, the camera shaking; a ring of swell runs out, spray,
 *    gulls scatter, dolphins (the Choir's scouts) leap, and the swell lifts the boat.
 * 5. **Reaction**, a two-shot with the wonder behind him: the gag's payoff.
 * 6. **Final**, a wide pull-out, then the card (name, tagline, the keeper's line, a Tidekin saying, the episode).
 *
 * Episodes follow the order this city found its wonders (the showcase: `WONDERS` order).
 */

/** Each wonder's episode in its own key (D-195), semitones from A. */
const KEYS: Record<string, number> = { tideGates: 0, lotus: 2, stacks: -2, dome: -5, turtle: 3, geode: -3 };

const FISHERS = ['Marlo', 'Pim', 'Teodor', 'Kofi', 'Bram', 'Anselm', 'Joaquim', 'Hamish'];

/** A wonder's hour: the light at the surface and under it, the sea's colours, a mood. */
interface Hour {
  /** "A quiet ___": the time of day in words. */
  word: string;
  look: StageLook;
  under: StageLook;
  sea: [deep: number, shallow: number];
  mood?: 'rain' | 'mist' | 'night' | 'aurora';
}

const under = (top: number, low: number): StageLook => ({ ...STAGE_LOOKS.night, env: 0.25, night: 0.75, sunDir: [0.1, 1, 0.15], key: 0x7fd8e8, keyI: 0.5, rimI: 0.2, hemiI: 0.3, top, low, zenith: top, horizon: low, bloom: 1.1 });

const GOLDEN: Hour = {
  word: 'afternoon',
  look: { ...STAGE_LOOKS.day, env: 0.8, sunDir: [0.6, 0.35, 0.7], sun: 0xffe2a8, key: 0xffe2b8, keyI: 2.0, hemiI: 0.8, top: 0x4a6fa8, low: 0xffc98f, zenith: 0x8a8fc0, horizon: 0xffd2a0, bloom: 0.6 },
  under: under(0x1f6f94, 0x03141f),
  sea: [0x174a6e, 0x5c93b8],
};

export const HOURS: Record<string, Hour> = {
  tideGates: {
    word: 'evening after the storm',
    look: { ...STAGE_LOOKS.dusk, env: 0.45, night: 0.35, sunDir: [0.75, 0.1, 0.65], sun: 0xffd8a0, key: 0xffc890, keyI: 1.3, rimI: 0.6, hemiI: 0.45, top: 0x2f394f, low: 0xf0b27a, zenith: 0x56607c, horizon: 0xf0b27a, bloom: 0.8 },
    under: under(0x1c5a78, 0x04151f),
    sea: [0x123349, 0x5a7f98],
    mood: 'rain',
  },
  lotus: {
    word: 'dawn',
    look: { ...STAGE_LOOKS.dusk, env: 0.55, night: 0.25, sunDir: [-0.7, 0.08, 0.7], sun: 0xfff0c8, key: 0xffc0b0, keyI: 1.6, rimI: 0.8, hemiI: 0.55, top: 0x2e3a6b, low: 0xffc3a0, zenith: 0x7a6aa8, horizon: 0xf09ab0, bloom: 0.9 },
    under: under(0x2a4f86, 0x060f22),
    sea: [0x23345e, 0x8a9cc8],
  },
  stacks: {
    word: 'morning',
    look: { ...STAGE_LOOKS.day, env: 0.8, sunDir: [0.4, 0.5, 0.7], sun: 0xfffbe8, key: 0xfff6e0, keyI: 1.5, rimI: 0.5, hemiI: 0.95, top: 0x8fb0c2, low: 0xe4e2cf, zenith: 0xb9cfd2, horizon: 0xe4e2cf, bloom: 0.45 },
    under: under(0x2f6a6a, 0x06191a),
    sea: [0x2c5458, 0x8fb0ae],
    mood: 'mist',
  },
  dome: {
    word: 'night',
    look: { ...STAGE_LOOKS.night, env: 0.35, sunDir: [0.5, 0.55, 0.65], key: 0x9fb8ff, keyI: 0.55, rimI: 0.6, hemiI: 0.25, top: 0x040919, low: 0x1d3160, zenith: 0x0c1a3c, horizon: 0x2c4470, bloom: 1.1 },
    under: under(0x08263c, 0x01060c),
    sea: [0x050d1c, 0x1e3a5c],
    mood: 'night',
  },
  turtle: {
    word: 'noon',
    look: { ...STAGE_LOOKS.day, env: 0.9, sunDir: [0.45, 0.85, 0.3], sun: 0xffffff, key: 0xffffff, keyI: 2.2, rimI: 0.7, hemiI: 1.0, top: 0x2f8fd8, low: 0xa8dcf2, zenith: 0x5fb4ea, horizon: 0xdff4f6, bloom: 0.45 },
    under: under(0x1a8aa0, 0x03222e),
    sea: [0x0c5a7c, 0x3fc2c8],
  },
  geode: {
    word: 'dusk',
    look: { ...STAGE_LOOKS.night, env: 0.4, night: 0.8, sunDir: [-0.7, 0.05, 0.6], sun: 0xffe6d0, key: 0xf0a0c0, keyI: 0.7, rimI: 0.6, hemiI: 0.3, top: 0x120c2c, low: 0xc0709a, zenith: 0x2c1f5c, horizon: 0x6a3f88, bloom: 1.0 },
    under: under(0x2a2060, 0x05030f),
    sea: [0x120f2a, 0x5c4f8a],
    mood: 'aurora',
  },
};

/** One episode's gag: what he does instead of watching, and what goes over the side. */
interface Bit {
  id: 'boot' | 'bino' | 'camera' | 'kid' | 'coffee' | 'fish';
  open: (f: string, word: string) => string;
  /** A beat before the gag lands (~2 s). */
  tease?: string;
  a: string;
  b: string;
  under: string;
  react: (f: string) => string;
  /** The card's last line. */
  tag: (f: string) => string;
}

export const BITS: Bit[] = [
  {
    id: 'boot',
    open: (f, w) => `A quiet ${w}. The fish weren't biting. Neither was ${f}.`,
    tease: 'Something nibbled at the line…',
    a: 'A bite! …a boot. Again.',
    b: 'He threw it back. Some things belong to the sea.',
    under: 'Far below, the reef’s old light stirred. Something had noticed.',
    react: () => '…huh.',
    tag: (f) => `${f} saw nothing`,
  },
  {
    id: 'bino',
    open: (f) => `${f} had heard the stories. This time, he would keep watch.`,
    a: 'He kept a very close watch. On a gull.',
    b: 'The gull took his sandwich. Then dropped it in the sea.',
    under: 'Far below, the Choir’s light gathered. It knows a gift when it sees one.',
    react: (f) => `“Nothing out here but gulls,” said ${f}.`,
    tag: (f) => `${f} saw one gull. Up close`,
  },
  {
    id: 'camera',
    open: (f) => `This time, ${f} brought a camera.`,
    a: 'He framed the lighthouse. Steady… steady…',
    b: 'Achoo.',
    under: 'The sea keeps everything it is given. And sometimes, it gives back.',
    react: () => '“Got it!” He had. The lighthouse came out beautifully.',
    tag: (f) => `${f} took a lovely photo of the lighthouse`,
  },
  {
    id: 'kid',
    open: (f) => `${f} brought his granddaughter. She had questions.`,
    a: '“Grandpa, why is the sea glowing?” “Sea does that, love.”',
    b: 'She sent her paper boat down, for whoever was there.',
    under: 'Down where no light reaches, a light answered.',
    react: () => '“GRANDPA!” “Mm. Lovely, dear.”',
    tag: () => 'His granddaughter saw everything',
  },
  {
    id: 'coffee',
    open: (f) => `${f} would not sleep through it this time. Third coffee.`,
    a: 'He did not blink. Not once.',
    b: 'His hands shook. The mug went over the side.',
    under: 'The Choir noticed. It always notices.',
    react: () => '…was that there before?',
    tag: (f) => `${f} blinked. Once`,
  },
  {
    id: 'fish',
    open: (f) => `${f} caught a fish at last. A real one.`,
    a: 'He told it all about his day.',
    b: 'The fish had seen something over his shoulder.',
    under: 'It swam home, and told the deep what it had seen.',
    react: () => 'For once, he saw it. He tipped his hat. It seemed only polite.',
    tag: (f) => `${f} saw it. Finally`,
  },
];

/** The wonders a film can be for (every rising wonder but the colonnade, which has its own film). */
const SERIAL = ['tideGates', 'lotus', 'stacks', 'dome', 'turtle', 'geode'];

/** The episode a wonder's film is: the order this city found its wonders (every one but the colonnade's). */
export function episodeOf(city: City, id: string): number {
  const ids = (city.growth.progression ? city.growth.wonders : WONDERS.map((w) => w.id)).filter((w) => SERIAL.includes(w));
  const i = ids.indexOf(id);
  return (i < 0 ? ids.length : i) % BITS.length;
}

const BOX = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(1, 1, 1, 16);
const DISC = new CylinderGeometry(1, 1, 1, 40);

/** The rowboat: a clinker hull, two thwarts, oars, a lantern at the bow (≈3.2 long along z, bow at +z). */
function rowboat(): { root: Group; lamp: ReturnType<typeof glow> } {
  const root = new Group();
  const wood = soft(0x8a5a3a, 0.7, 0.2);
  const dark = hard(0x5e3a22, 0.8);
  const paint = soft(0x2f6d8a, 0.6, 0.2);
  const hull = part(new SphereGeometry(1, 40, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), wood, root, 0, 0, 0, 0.78, 0.52, 1.62);
  (hull.material as typeof wood).side = DoubleSide;
  // A painted band along the sheer and a darker inside floor.
  part(new SphereGeometry(1, 40, 4, 0, Math.PI * 2, Math.PI / 2, 0.18), paint, root, 0, 0, 0, 0.785, 0.52, 1.625);
  part(DISC, dark, root, 0, -0.36, 0, 0.5, 0.02, 1.0);
  const rim = part(new TorusGeometry(1, 0.045, 8, 64), dark, root, 0, 0.005, 0, 0.78, 1.62, 1);
  rim.rotation.x = Math.PI / 2;
  for (const z of [-0.75, 0.55]) part(BOX, wood, root, 0, -0.12, z, 1.36 - Math.abs(z) * 0.3, 0.05, 0.26);
  // Oars resting along the gunwales.
  for (const s of [1, -1]) {
    const oar = joint(root, s * 0.62, 0.02, -0.1);
    oar.rotation.set(0.1, 0, s * 0.12);
    part(CYL, wood, oar, 0, 0, 0, 0.022, 2.4, 0.022).rotation.x = Math.PI / 2;
    part(BOX, wood, oar, 0, 0, -1.25, 0.012, 0.16, 0.42);
  }
  // A lantern on a post at the bow.
  part(CYL, dark, root, 0, 0.25, 1.25, 0.018, 0.5, 0.018);
  const lamp = glow(0xffc46a, 2);
  part(BALL, lamp, root, 0, 0.47, 1.25, 0.06, 0.08, 0.06);
  part(CYL, dark, root, 0, 0.56, 1.25, 0.05, 0.02, 0.05);
  // A bucket.
  part(new CylinderGeometry(0.11, 0.09, 0.2, 16, 1, true), hard(0x7a8a9a, 0.4, 0.6), root, 0.35, -0.22, -1.1, 1);
  return { root, lamp };
}

/** What goes over the side in each episode. */
function itemFor(id: Bit['id']): Group {
  const g = new Group();
  if (id === 'boot') {
    const leather = soft(0x6b4a33, 0.7, 0.3);
    part(BOX, leather, g, 0, 0.14, 0, 0.12, 0.28, 0.13);
    part(BOX, leather, g, 0.07, 0.03, 0, 0.26, 0.08, 0.14);
    part(BOX, hard(0x3a281c, 0.8), g, 0.07, -0.015, 0, 0.27, 0.02, 0.15);
  } else if (id === 'bino') {
    part(BOX, soft(0xe8c48a, 0.8, 0.2), g, 0, 0, 0, 0.22, 0.03, 0.14);
    part(BOX, soft(0x7cc26a, 0.7, 0.2), g, 0, 0.025, 0, 0.21, 0.02, 0.13);
    part(BOX, soft(0xe85a4f, 0.7, 0.2), g, 0, 0.04, 0, 0.2, 0.012, 0.12);
    part(BOX, soft(0xe8c48a, 0.8, 0.2), g, 0, 0.06, 0, 0.22, 0.03, 0.14);
  } else if (id === 'camera') {
    part(CYL, hard(0x23272e, 0.3, 0.5), g, 0, 0, 0, 0.06, 0.015, 0.06).rotation.x = Math.PI / 2;
  } else if (id === 'kid') {
    const paper = soft(0xfdfdf6, 0.9, 0.2);
    part(BOX, paper, g, 0, 0, 0, 0.26, 0.05, 0.1);
    const sail = part(new ConeGeometry(0.08, 0.16, 3), paper, g, 0, 0.1, 0, 1);
    sail.rotation.y = 0.5;
  } else if (id === 'coffee') {
    part(new CylinderGeometry(0.05, 0.045, 0.11, 16), soft(0xe85a4f, 0.5, 0.2), g, 0, 0, 0, 1);
    part(new TorusGeometry(0.03, 0.01, 6, 16), soft(0xe85a4f, 0.5, 0.2), g, 0.055, 0, 0, 1);
  } else {
    part(BALL, soft(0x8fd0e8, 0.35, 0.5), g, 0, 0, 0, 0.16, 0.06, 0.045);
    part(new ConeGeometry(0.06, 0.08, 4), soft(0x6fb6d2, 0.4, 0.4), g, -0.18, 0, 0, 1).rotation.z = Math.PI / 2;
    part(BALL, hard(0x1d2a33, 0.3), g, 0.11, 0.02, 0.035, 0.012);
  }
  return g;
}

export function playSomethingStirs(ctx: GameContext, wonder: { id: string; name: string }, done: () => void): void {
  const { city } = ctx;
  const lore = LORE[wonder.id];
  const hour = HOURS[wonder.id] ?? GOLDEN;
  const ep = episodeOf(city, wonder.id);
  const bit = BITS[ep]!;
  // One fisher per city: the same man misses every wonder.
  const fisher = `Old ${FISHERS[Math.abs(Math.floor(city.seed)) % FISHERS.length]!}`;
  const stage = FilmStage.get(ctx);
  stage.clear();
  const reel = openReel(
    ctx,
    { scene: `sw sw-${wonder.id} sw-bit-${bit.id}`, label: `Something Stirs: ${wonder.name}`, key: KEYS[wonder.id] ?? 0, leaving: () => stage.close() },
    done,
  );
  const day = hour.mood !== 'night' && hour.mood !== 'aurora';

  // ── The set: open sea at the island's heart (the stage's own sea, the seabed far below). ──
  const cx = city.size / 2;
  const SEA = Math.max(0, city.grid.heightAt(cx, cx)) + 2;
  const B = new Vector3(cx, SEA, cx);
  const W = new Vector3(cx - 6, SEA, cx - 78);
  const v = (p: Vector3, dy = 0): V3 => [p.x, p.y + dy, p.z];
  const sea = stage.addSea(B, SEA, 1400, hour.sea[0], hour.sea[1]);
  void sea;

  // The wonder: the game's model, deep under the sea until it rises.
  const make = WONDER_MODELS[wonder.id] ?? WONDER_MODELS.dome!;
  const wonderMesh = new Mesh(make(city.size).b.build(), getMaterial('wonder'));
  wonderMesh.castShadow = wonderMesh.receiveShadow = true;
  wonderMesh.geometry.computeBoundingBox();
  const wb = wonderMesh.geometry.boundingBox!;
  const H = wb.max.y - wb.min.y;
  const deepY = SEA - wb.max.y - 10;
  wonderMesh.position.set(W.x, deepY, W.z);
  stage.add(wonderMesh);
  const top = new Vector3(W.x, SEA + wb.max.y * 0.6, W.z);
  // The far island with the Tidewatch Lighthouse, in front of the boat: the city is just over there.
  const isle = new Mesh(WONDER_MODELS.lighthouse!(city.size).b.build(), getMaterial('wonder'));
  isle.position.set(cx + 60, SEA, cx + 260);
  isle.rotation.y = 2.4;
  stage.add(isle);
  stage.frame(new Vector3(cx, SEA + 6, cx - 30), 26, new Vector3(-0.3, 0.25, 1), SEA - 18);
  stage.groundColour(0x2a3a3a);
  stage.look = { ...hour.look, sunDir: [...hour.look.sunDir] };
  if (day) stage.addClouds(new Vector3(cx, SEA, cx - 40), 12, 90, 260, 26, 50, 7, wonder.id.length * 7);
  // Fog from the start (D-196): aerial haze at the surface, mist for the Stacks, the deep's murk under the sea.
  const haze = { col: hour.look.horizon, near: hour.mood === 'mist' ? 14 : 160, far: hour.mood === 'mist' ? 150 : 900 };
  stage.setFog(haze.col, haze.near, haze.far);
  const rain = stage.addRain(new Vector3(cx, SEA - 1, cx), 14, 12, 2600);
  rain.visible = hour.mood === 'rain';

  // An aurora over the Geode: three ribbons of light waving across the north.
  if (hour.mood === 'aurora') {
    const ribbons: BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const g = new PlaneGeometry(260, 46, 64, 1);
      g.translate(0, 23, 0);
      g.rotateY((i - 1) * 0.3);
      g.translate((i - 1) * 60, 30 + i * 8, -300 - i * 40);
      g.setAttribute('aSeed', new BufferAttribute(new Float32Array(g.attributes.position!.count).fill(i / 3), 1));
      ribbons.push(g);
    }
    const am = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
    const sd = attribute('aSeed', 'float');
    am.positionNode = positionLocal.add(vec3(0, 0, sin(positionLocal.x.mul(0.03).add(U.clock.mul(0.4)).add(sd.mul(6))).mul(18)));
    const fall = smoothstep(0, 0.25, uv().y).mul(float(1).sub(uv().y));
    am.colorNode = mix(vec3(0.2, 1, 0.6), vec3(0.75, 0.4, 1), uv().y).mul(fall.mul(0.5)).mul(sin(uv().x.mul(40).add(U.clock)).mul(0.25).add(0.75));
    const aurora = new Mesh(mergeGeometries(ribbons), am);
    for (const g of ribbons) g.dispose();
    aurora.position.set(cx, SEA, cx);
    aurora.frustumCulled = false;
    stage.add(aurora);
  }

  // ── The boat and the fisher (facing +z, his back to where the wonder will rise). ──
  const boat = rowboat();
  boat.root.position.copy(B).setY(SEA + 0.2);
  stage.add(boat.root);
  boat.lamp.emissiveIntensity = day ? 0.6 : 2.6;
  const old = new Person3D({ ...(CAST.fisher as PersonLook), prop: bit.id === 'boot' ? 'rod' : 'none' });
  old.root.scale.setScalar(0.85);
  old.root.position.set(0, -0.09 - 0.37 * 0.85, -0.75);
  old.root.rotation.y = -Math.PI / 2;
  boat.root.add(old.root);
  old.act(bit.id === 'boot' ? 'fish' : 'sit');
  old.pose.snap();
  const kid =
    bit.id === 'kid'
      ? new Person3D({ skin: 0xc68e62, hair: 0x2a1d16, top: 0xf2c23a, bottom: 0x3e5a7a, long: true, hat: 'none', shoes: 0xe85a4f })
      : null;
  if (kid) {
    kid.root.scale.setScalar(0.55);
    kid.root.position.set(0, -0.09 - 0.37 * 0.55, 0.55);
    kid.root.rotation.y = Math.PI;
    boat.root.add(kid.root);
    kid.act('sit', { headYaw: -0.4 });
    kid.pose.snap();
  }

  // The episode's props, and the thing that goes over the side.
  const item = itemFor(bit.id);
  const props = new Group();
  boat.root.add(props);
  let line: Mesh | null = null;
  const float_ = part(BALL, soft(0xe85a4f, 0.4, 0.2), stage.set, 0, 0, 0, 0.05);
  float_.visible = false;
  let gull: Gull3D | null = null;
  const tripod = new Group();
  if (bit.id === 'boot') {
    line = part(CYL, hard(0xe9e4d4, 0.9), stage.set, 0, 0, 0, 0.004, 1, 0.004);
    float_.visible = true;
    item.visible = false;
    stage.add(item);
  } else if (bit.id === 'bino') {
    // Binoculars at his eyes; the sandwich on the thwart; a gull on the bow, looking at it.
    const bino = joint(old.head, 0.18, 0.15, 0);
    for (const s of [1, -1]) part(CYL, hard(0x2a2d33, 0.4, 0.4), bino, 0.04, 0, 0.045 * s, 0.03, 0.12, 0.03).rotation.z = Math.PI / 2;
    old.act('sit', { headPitch: -0.15 });
    old.pose.to({ armRup: 2.0, elbowR: 2.4, armLup: 2.0, elbowL: 2.4, armRout: 0.25, armLout: 0.25 });
    props.add(item);
    item.position.set(0.25, -0.08, 0.55);
    gull = new Gull3D();
    gull.root.scale.setScalar(0.75);
    gull.pose = 'stand';
    gull.root.position.set(0, 0.02, 1.5);
    gull.root.rotation.y = Math.PI / 2 + 0.6;
    boat.root.add(gull.root);
  } else if (bit.id === 'camera') {
    // A camera on a tripod at the bow, aimed at the lighthouse; the lens cap is what goes over.
    tripod.position.set(0.1, -0.12, 0.25);
    for (let i = 0; i < 3; i++) {
      const leg = part(CYL, hard(0x2a2d33, 0.4, 0.5), tripod, 0, 0.35, 0, 0.01, 0.7, 0.01);
      leg.rotation.set(Math.cos((i / 3) * Math.PI * 2) * 0.25, 0, Math.sin((i / 3) * Math.PI * 2) * 0.25);
    }
    part(BOX, hard(0x23272e, 0.35, 0.4), tripod, 0, 0.75, 0, 0.18, 0.12, 0.12);
    part(CYL, hard(0x15181d, 0.2, 0.6), tripod, 0, 0.76, 0.1, 0.05, 0.1, 0.05).rotation.x = Math.PI / 2;
    props.add(tripod);
    tripod.add(item);
    item.position.set(0, 0.76, 0.16);
    old.act('sit', { headPitch: 0.2 });
    old.pose.to({ armRup: 1.4, elbowR: 0.6, armLup: 1.3, elbowL: 0.6, lean: 0.25 });
  } else if (bit.id === 'kid') {
    kid!.hand.add(item);
    item.scale.setScalar(0.9);
  } else if (bit.id === 'coffee') {
    old.hand.add(item);
    item.position.set(0.04, -0.05, 0);
    old.act('sit', { brows: 1 });
    old.pose.to({ armRup: 1.2, elbowR: 1.4 });
  } else {
    old.hand.add(item);
    item.position.set(0.05, 0.02, 0);
    old.act('sit', { smile: 0.8, mouth: 0.4 });
    old.pose.to({ armRup: 1.8, elbowR: 1.0, headYaw: -0.3 });
  }
  old.pose.snap();

  // ── Things that happen: the toss over the side, the rise, swell, spray, gulls, dolphins. ──
  const splashAt = new Vector3(B.x + 1.3, SEA, B.z + 0.6);
  const toss = { at: -1, from: new Vector3(), dur: 1.1 };
  const ringMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  const ringOn = uniform(0);
  ringMat.colorNode = vec3(1, 1, 1).mul(ringOn.mul(0.6));
  const splashRing = part(new TorusGeometry(1, 0.02, 6, 48), ringMat, stage.set, splashAt.x, SEA + 0.02, splashAt.z, 0.1);
  splashRing.rotation.x = Math.PI / 2;
  const swellMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  const swellOn = uniform(0);
  swellMat.colorNode = vec3(0.9, 0.97, 1).mul(swellOn.mul(0.5));
  const swell = part(new TorusGeometry(1, 0.012, 6, 128), swellMat, stage.set, W.x, SEA + 0.05, W.z, 1);
  swell.rotation.x = Math.PI / 2;
  // Spray: droplets thrown up and out round the wonder, posed in the shader from one clock (`sprayT`).
  const sprayT = uniform(-1);
  const drops: BufferGeometry[] = [];
  for (let i = 0; i < 900; i++) {
    const g = new SphereGeometry(0.08 + hash2(i, 1) * 0.14, 6, 4);
    const a = hash2(i, 2) * Math.PI * 2;
    const r = (wb.max.x - wb.min.x) * (0.25 + hash2(i, 3) * 0.3);
    g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.setAttribute('aSeed', new BufferAttribute(new Float32Array(g.attributes.position!.count).fill(hash2(i, 4)), 1));
    g.setAttribute('aDir', new BufferAttribute(new Float32Array(g.attributes.position!.count * 3).map((_, k) => [Math.cos(a), 0, Math.sin(a)][k % 3]!), 3));
    drops.push(g);
  }
  const sprayMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  const ss = attribute('aSeed', 'float');
  const dir = attribute('aDir', 'vec3');
  const st = sprayT.sub(ss.mul(0.5)).max(0);
  sprayMat.positionNode = positionLocal.add(dir.mul(st.mul(float(3).add(ss.mul(9))))).add(vec3(0, st.mul(float(10).add(ss.mul(24))).sub(st.mul(st).mul(9.8)), 0));
  sprayMat.colorNode = vec3(0.9, 0.96, 1).mul(float(1).sub(st.div(2.6)).max(0).mul(sprayT.greaterThan(0).select(0.35, 0)));
  const spray = new Mesh(mergeGeometries(drops), sprayMat);
  for (const g of drops) g.dispose();
  spray.position.set(W.x, SEA, W.z);
  spray.frustumCulled = false;
  stage.add(spray);
  // Dolphins (the Choir's scouts), leaping in the shader near the wonder once it has risen.
  const dolphins = dolphinSchool(0, 0, 0);
  dolphins.position.set(W.x + 30, SEA, W.z + 30);
  dolphins.visible = false;
  stage.add(dolphins);
  // Gulls scattering off it.
  const flock = Array.from({ length: 4 }, (_, i) => {
    const g = new Gull3D();
    g.root.scale.setScalar(2.2);
    g.pose = 'fly';
    g.root.visible = false;
    stage.add(g.root);
    return { g, a: (i / 4) * Math.PI * 2 + 0.4 };
  });

  // Under the sea: a school of fish, the Choir's light gathering, a flare.
  const gather = uniform(0);
  const motes: BufferGeometry[] = [];
  for (let i = 0; i < 300; i++) {
    const g = new SphereGeometry(0.12 + hash2(i, 5) * 0.12, 6, 4);
    const a = hash2(i, 6) * Math.PI * 2;
    const r = 18 + hash2(i, 7) * 40;
    const p = [Math.cos(a) * r, (hash2(i, 8) - 0.5) * 20, Math.sin(a) * r];
    g.setAttribute('aFrom', new BufferAttribute(new Float32Array(g.attributes.position!.count * 3).map((_, k) => p[k % 3]!), 3));
    g.setAttribute('aSeed', new BufferAttribute(new Float32Array(g.attributes.position!.count).fill(hash2(i, 9)), 1));
    motes.push(g);
  }
  const moteMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  const from = attribute('aFrom', 'vec3');
  const ms = attribute('aSeed', 'float');
  const g0 = gather.sub(ms.mul(0.3)).clamp(0, 1);
  moteMat.positionNode = positionLocal.add(from.mul(float(1).sub(g0.mul(g0)))).add(vec3(sin(U.clock.mul(1.3).add(ms.mul(30))).mul(0.6), 0, 0));
  moteMat.colorNode = vec3(0.45, 1, 0.9).mul(float(0.6).add(g0));
  const moteMesh = new Mesh(mergeGeometries(motes), moteMat);
  for (const g of motes) g.dispose();
  moteMesh.position.set(W.x, deepY + H * 0.6, W.z);
  moteMesh.frustumCulled = false;
  moteMesh.visible = false;
  stage.add(moteMesh);
  const flare = part(new SphereGeometry(1, 24, 16), glow(0x9ffff0, 0), stage.set, W.x, deepY + H * 0.6, W.z, 6);
  flare.castShadow = false;
  const school: BufferGeometry[] = [];
  for (let i = 0; i < 60; i++) {
    const g = new SphereGeometry(1, 8, 6).scale(0.07, 0.025, 0.02);
    g.translate((hash2(i, 11) - 0.5) * 3, (hash2(i, 12) - 0.5) * 1.5, (hash2(i, 13) - 0.5) * 3);
    g.setAttribute('aSeed', new BufferAttribute(new Float32Array(g.attributes.position!.count).fill(hash2(i, 14)), 1));
    school.push(g);
  }
  const fishMat = new MeshBasicNodeMaterial();
  const fs = attribute('aSeed', 'float');
  fishMat.positionNode = positionLocal.add(vec3(fract(U.clock.mul(0.08).add(fs)).sub(0.5).mul(12), sin(U.clock.mul(2).add(fs.mul(20))).mul(0.1), 0));
  fishMat.colorNode = vec3(0.35, 0.55, 0.65).mul(0.35);
  const fishes = new Mesh(mergeGeometries(school), fishMat);
  for (const g of school) g.dispose();
  fishes.position.set(B.x + 1, SEA - 4, B.z - 4);
  fishes.visible = false;
  fishes.frustumCulled = false;
  stage.add(fishes);

  // ── Per-frame direction ──
  let riseAt = -1;
  let underAt = -1;
  let tease = -1;
  let hooked = -1;
  let sneezeAt = -1;
  let shakeHands = false;
  const tmp = new Vector3();
  const tip = new Vector3();
  const sinkFrom = new Vector3();
  stage.onFrame = (t, dt) => {
    // The boat rocks; after the rise the swell lifts it.
    const swellHit = riseAt >= 0 ? Math.max(0, Math.min(1, (t - riseAt - 1.2) / 0.6)) * Math.max(0, 1 - (t - riseAt - 1.8) / 3) : 0;
    boat.root.position.y = SEA + 0.2 + Math.sin(t * 1.3) * 0.05 + Math.sin(t * 2.1 + 1) * 0.02 + swellHit * Math.sin((t - riseAt) * 3) * 0.5;
    boat.root.rotation.x = Math.sin(t * 1.1) * 0.03 + swellHit * Math.sin((t - riseAt) * 3 + 0.8) * 0.12;
    boat.root.rotation.z = Math.sin(t * 0.9 + 2) * 0.04;
    old.update(dt);
    kid?.update(dt);
    gull?.update(dt);
    // Sneeze: a sharp jolt of the head and shoulders.
    if (sneezeAt >= 0) old.head.rotation.z += Math.max(0, 1 - (t - sneezeAt) * 3) * Math.sin((t - sneezeAt) * 30) * 0.3;
    if (shakeHands) old.hand.rotation.x = Math.sin(t * 40) * 0.25;
    // The fishing line: rod tip to the float (or the hooked boot).
    if (line && old.rodTip) {
      old.rodTip.getWorldPosition(tip);
      if (hooked < 0) {
        tmp.set(B.x - 0.4, SEA + 0.03 + (tease >= 0 ? Math.max(0, Math.sin((t - tease) * 14)) * -0.08 : Math.sin(t * 2) * 0.01), B.z + 3.2);
        float_.position.copy(tmp);
      } else if (toss.at < 0) {
        const k = Math.min(1, (t - hooked) / 0.8);
        tmp.set(B.x - 0.4, SEA - 0.2, B.z + 3.2).lerp(tip.clone().add(new Vector3(0, -0.45, 0)), k * k * (3 - 2 * k));
        item.position.copy(tmp);
        item.visible = true;
        float_.position.copy(tmp).add(new Vector3(0, 0.3, 0));
      }
      const end = toss.at < 0 && hooked >= 0 ? float_.position : float_.position;
      line.position.copy(tip).add(end).multiplyScalar(0.5);
      line.scale.set(0.004, tip.distanceTo(end), 0.004);
      line.lookAt(end);
      line.rotateX(Math.PI / 2);
    }
    // Over the side: an arc to the splash point, a ring on the water.
    if (toss.at >= 0) {
      const k = Math.min(1, (t - toss.at) / toss.dur);
      if (k < 1) {
        item.position.lerpVectors(toss.from, splashAt, k);
        item.position.y += Math.sin(k * Math.PI) * 0.9;
        item.rotation.z += dt * 8;
      } else item.visible = false;
      const r = Math.max(0, t - toss.at - toss.dur);
      splashRing.scale.setScalar(0.1 + r * 0.9);
      ringOn.value = k >= 1 ? Math.max(0, 1 - r / 1.4) : 0;
    }
    // Under the sea: the light gathers round the shape below, then flares.
    if (underAt >= 0) {
      const u = t - underAt;
      item.position.copy(sinkFrom).add(new Vector3(Math.sin(u * 1.4) * 0.3, -u * 1.9, 0));
      item.rotation.set(u * 0.6, u * 0.4, u * 0.9);
      gather.value = Math.min(1.2, Math.max(0, (u - 0.6) / 2.4));
      (flare.material as ReturnType<typeof glow>).emissiveIntensity = Math.max(0, (u - 2.6) * 3) * (1 + Math.sin(u * 9) * 0.2);
    }
    // The rise: out of the deep, past the surface, settling with a little bob.
    if (riseAt >= 0) {
      const k = Math.min(1, (t - riseAt) / 3.2);
      const e = 1 - (1 - k) ** 3;
      wonderMesh.position.y = deepY + (SEA - deepY) * e + Math.sin(k * Math.PI) * 1.5 * (1 - k);
      stage.shake = 1 + Math.max(0, 1 - (t - riseAt) / 2.8) * 5;
      sprayT.value = t - riseAt - 0.4;
      const sw = Math.max(0, t - riseAt - 0.3);
      swell.scale.setScalar(4 + sw * 26);
      swellOn.value = Math.max(0, 1 - sw / 3.5);
      for (const f of flock) {
        const fk = Math.max(0, t - riseAt - 0.5);
        f.g.root.visible = fk > 0 && fk < 6;
        f.g.root.position.set(W.x + Math.cos(f.a) * (8 + fk * 9), SEA + wb.max.y * 0.7 + fk * 3, W.z + Math.sin(f.a) * (8 + fk * 9));
        f.g.root.rotation.y = -f.a;
        f.g.update(dt);
      }
    }
  };
  const throwOver = (from: Object3D) => {
    from.getWorldPosition(toss.from);
    stage.add(item);
    item.position.copy(toss.from);
    item.visible = true;
    toss.at = stage.t;
  };

  const cut = (from: Framing, to?: Framing, dur = 0, opts: Partial<Shot> = {}) => {
    stage.shots = [{ at: stage.t, dur, from, to, ...opts }];
  };
  const boatC: V3 = [B.x, SEA + 0.6, B.z];
  const head = () => v(old.headAt(new Vector3()));
  /** The gag's sounds (D-195), per bit and beat. */
  const gagSound = (beat: 'tease' | 'hook' | 'b' | 'react') => {
    const k = `${bit.id}:${beat}`;
    if (k === 'boot:tease') reel.hit('nibble');
    else if (k === 'boot:hook') {
      reel.hit('reel');
      reel.hit('splash', 0.4);
    } else if (k === 'boot:b') reel.hit('splash', 1.2);
    else if (k === 'boot:react') reel.hit('splash', 2.5);
    else if (k === 'bino:hook') {
      reel.hit('wings');
      reel.hit('gulls', 0.9);
    } else if (k === 'bino:b') {
      reel.hit('wings', 0.6);
      reel.hit('gulls', 0.4);
      reel.hit('splash', 1.6);
    } else if (k === 'camera:b') {
      reel.hit('sneeze', 0.1);
      reel.hit('splash', 1.75);
    } else if (k === 'camera:react') reel.hit('shutter', 0.95);
    else if (k === 'kid:b') reel.hit('splash', 1.3);
    else if (k === 'coffee:hook') reel.hit('heartbeat', 0, 2.4);
    else if (k === 'coffee:b') reel.hit('splash', 1.5);
    else if (k === 'fish:b') {
      reel.hit('sting', 0.1);
      reel.hit('splash', 1.8);
    } else if (k === 'fish:react') reel.hit('choir', 1.8, 2.2);
  };

  const film = async () => {
    // 1. Wide: the boat small on the sea, the place where the wonder will rise behind it.
    cut({ pos: [B.x + 16, SEA + 6, B.z + 14], look: [B.x - 2, SEA + 1, B.z - 22], fov: 40 }, { pos: [B.x + 11, SEA + 4.2, B.z + 10], look: [B.x - 1, SEA + 1, B.z - 16], fov: 38 }, 3.4);
    reel.on('open');
    reel.bed('sea', day ? 1 : 0.6, 2);
    reel.bed('wind', hour.mood === 'rain' ? 0.7 : hour.mood === 'mist' ? 0.5 : 0.25, 2);
    if (hour.mood === 'rain') reel.bed('rain', 1, 1.5);
    if (!day) reel.bed('drone', 0.25, 3);
    if (!(await reel.wait(0))) return;
    stage.open();
    if (day) reel.hit('gulls', 1.4);
    if (hour.mood === 'night') reel.cue('cs-night');
    reel.say(bit.open(fisher, hour.word));
    if (!(await reel.wait(2900))) return;

    // 2. Close: the gag, and something over the side.
    cut(orbit(head(), 2.6, 0.55, 0.12, 34), orbit(head(), 2.2, 0.4, 0.1, 32), 6);
    reel.on('a');
    if (bit.tease) {
      reel.say(bit.tease);
      tease = stage.t;
      gagSound('tease');
      if (!(await reel.wait(2000))) return;
    }
    reel.on('hook');
    gagSound('hook');
    if (bit.id === 'boot') {
      hooked = stage.t;
      old.act('fish', { brows: 0.8, mouth: 0.6 });
    } else if (bit.id === 'bino' && gull) {
      gull.pose = 'squawk';
    } else if (bit.id === 'kid') {
      kid!.act('point', { mouth: 0.6 });
    } else if (bit.id === 'coffee') {
      old.pose.to({ brows: 1, mouth: 0 });
    } else if (bit.id === 'fish') {
      old.pose.to({ mouth: 0.7 });
    }
    reel.cue(bit.id === 'boot' ? 'cs-boing' : bit.id === 'coffee' ? 'tick' : 'cs-sneak');
    reel.say(bit.a);
    if (!(await reel.wait(bit.tease ? 2100 : 2500))) return;
    reel.on('b');
    gagSound('b');
    reel.bed('drone', 0.35, 2);
    reel.cue(bit.id === 'camera' ? 'cs-freeze' : 'cs-whoosh');
    reel.say(bit.b);
    if (bit.id === 'boot') {
      line!.visible = float_.visible = false;
      throwOver(item);
      old.act('sit', { smile: 0.2 });
    } else if (bit.id === 'bino' && gull) {
      // The gull takes the sandwich, flaps off, drops it.
      gull.pose = 'fly';
      gull.carry.add(item);
      item.position.set(0, 0, 0);
      const g = gull;
      const t0 = stage.t;
      const prev = stage.onFrame!;
      stage.onFrame = (t, dt) => {
        prev(t, dt);
        const k = t - t0;
        if (k < 1.1) g.root.position.set(Math.sin(k * 3) * 0.6, 0.02 + k * 1.4, 1.5 + k * 1.2);
        else if (toss.at < 0) throwOver(item);
      };
    } else if (bit.id === 'camera') {
      sneezeAt = stage.t;
      old.act('sit', { brows: 1, mouth: 1 });
      if (!(await reel.wait(250))) return;
      throwOver(item);
    } else if (bit.id === 'kid') {
      kid!.act('stand', { smile: 1 });
      throwOver(item);
    } else if (bit.id === 'coffee') {
      shakeHands = true;
      if (!(await reel.wait(600))) return;
      throwOver(item);
    } else {
      old.act('startled');
      throwOver(item);
    }
    // Watch it go in.
    cut(orbit(v(splashAt, 0.3), 4.5, 0.9, 0.35, 36), orbit(v(splashAt, 0.1), 3.8, 1.0, 0.3, 34), 2.1);
    if (!(await reel.wait(2100))) return;

    // 3. Under the sea: it sinks, and the Choir notices.
    reel.on('under');
    underAt = stage.t;
    sinkFrom.set(splashAt.x, SEA - 0.5, splashAt.z);
    stage.add(item);
    item.visible = true;
    item.scale.setScalar(bit.id === 'kid' ? 0.9 : 1);
    stage.look = { ...hour.under, sunDir: [...hour.under.sunDir] };
    stage.showSky(false);
    stage.setFog(hour.under.low, 2, 70);
    rain.visible = false;
    moteMesh.visible = fishes.visible = true;
    stage.shake = 0.7;
    cut({ pos: [splashAt.x + 2.5, SEA - 2, splashAt.z + 4], look: [splashAt.x, SEA - 2.5, splashAt.z], fov: 46 }, { pos: [splashAt.x + 3, SEA - 6, splashAt.z + 6], look: [W.x, deepY + H * 0.6, W.z], fov: 50 }, 3.8);
    reel.hit('plunge');
    for (const b of ['sea', 'wind', 'rain'] as const) reel.bed(b, 0, 0.2);
    reel.bed('deep', 1, 0.3);
    reel.bed('drone', 0.5, 1);
    reel.bed('choir', 0.7, 2.6);
    reel.hit('heartbeat', 0.8, 1.8);
    reel.hit('riser', 1.9, 1.9);
    reel.hit('choir', 2.4, 1.6);
    reel.hit('shimmer', 2.5);
    reel.say(bit.under);
    if (!(await reel.wait(3800))) return;

    // 4. It rises: low and wide on the surface, the camera shaking.
    reel.on('rise');
    underAt = -1;
    item.visible = moteMesh.visible = fishes.visible = false;
    (flare.material as ReturnType<typeof glow>).emissiveIntensity = 0;
    stage.look = { ...hour.look, sunDir: [...hour.look.sunDir] };
    stage.showSky(true);
    stage.setFog(haze.col, haze.near, haze.far);
    rain.visible = hour.mood === 'rain';
    riseAt = stage.t;
    dolphins.visible = true;
    cut({ pos: [B.x + 9, SEA + 1.4, B.z + 16], look: [W.x, SEA + H * 0.35, W.z], fov: 44 }, { pos: [B.x + 8, SEA + 1.0, B.z + 13], look: [W.x, SEA + H * 0.5, W.z], fov: 46 }, 3.6);
    reel.bed('deep', 0, 0.3);
    reel.bed('sea', 1, 0.6);
    reel.bed('wind', 0.3, 1);
    reel.bed('rain', 0, 2.5);
    reel.bed('choir', 1, 1.5);
    reel.bed('drone', 0.2, 2);
    if (hour.mood === 'rain') reel.hit('thunder', 0.05);
    reel.hit('boom', 0.3);
    reel.hit('splash', 0.55);
    reel.hit('swell', 0.2, 3);
    reel.hit('dolphins', 1.6);
    if (day) reel.hit('gulls', 0.7);
    reel.say('');
    if (!(await reel.wait(3700))) return;

    // 5. The payoff: a two-shot, the wonder behind him.
    reel.on('react');
    stage.shake = 1;
    shakeHands = false;
    if (bit.id === 'boot') old.act('shrug', { headYaw: 0 });
    else if (bit.id === 'bino') old.act('sit', { brows: -0.3, smile: 0.3 });
    else if (bit.id === 'camera') old.act('sit', { smile: 1, mouth: 0.5 });
    else if (bit.id === 'kid') {
      kid!.act('cheer');
      old.act('sit', { smile: 0.5 });
    } else if (bit.id === 'coffee') {
      old.blink(0.3, 0.1);
      old.act('think', { brows: 0.6 });
    } else {
      // He turns round at last, and tips his hat.
      old.root.rotation.y = Math.PI / 2;
      old.act('wave', { smile: 1, mouth: 0.6 });
    }
    cut({ pos: [B.x + 1.6, SEA + 1.6, B.z + 4.6], look: [B.x - 0.5, SEA + 2.4, B.z - 10], fov: 46 }, { pos: [B.x + 1.3, SEA + 1.5, B.z + 4.0], look: [B.x - 0.8, SEA + 2.8, B.z - 12], fov: 46 }, 3.2);
    gagSound('react');
    reel.bed('choir', 0.35, 1.5);
    reel.bed('drone', 0, 2);
    reel.cue(bit.id === 'camera' ? 'cs-blink' : bit.id === 'fish' ? 'cs-fanfare' : 'cs-freeze');
    if (!(await reel.wait(700))) return;
    reel.say(bit.react(fisher));
    if (!(await reel.wait(2400))) return;

    // 6. Wide, pulling out, then the card.
    reel.on('final');
    cut(orbit(boatC, 18, 0.7, 0.18, 42), orbit([(B.x + W.x) / 2, SEA + 4, (B.z + W.z) / 2], 70, 0.5, 0.3, 44), 16, { ease: 'out' });
    reel.bed('sea', 0.7, 2);
    reel.bed('choir', 0.5, 2);
    reel.say('');
    if (!(await reel.wait(1500))) return;
    reel.on('finale');
    void top;
    await reel.end({
      kicker: 'Sea wonder · risen · the Choir answers',
      title: wonder.name,
      drop: true,
      sub: lore?.tagline ?? 'It rose from the sea where your city could see it.',
      lines: [
        ...(lore?.quote ? [lore.quote] : []),
        'The Tidekin said it first: keep the promises, and the sea gives back.',
        `Episode ${ep + 1} · day ${city.day} · ${Math.round(city.stats.population).toLocaleString('en-US')} residents · ${bit.tag(fisher)}`,
      ],
      button: 'Behold',
      confetti: ['#ffffff', '#5ff2da', '#ffe9a8', '#9fd8ff'],
    });
  };
  void film();
}
