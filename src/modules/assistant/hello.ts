import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Path,
  PointLight,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import { attribute, float, fract, sin, step, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameContext } from '@/game/context';
import { isOpen } from '@/sim/growthState';
import { COATS } from '@/modules/charm/art';
import { Cat3D } from '@/modules/charm/cat3d';
import { h } from '@/ui/dom';
import { U } from '@/render/uniforms';
import { FilmStage } from '@/modules/moments/FilmStage';
import { orbit, type Framing, type Shot, type V3 } from '@/modules/moments/shots';
import { LOOKS, type StageLook } from '@/render/stageUniforms';
import { Flora3D } from '@/modules/moments/actors/flora';
import { Gull3D } from '@/modules/moments/actors/gull';
import { hard, part } from '@/modules/moments/actors/rig';
import { hash2 } from '@/sim/random';
import './hello.css';
import { INTROS } from '@/modules/moments/loading';

/**
 * "Hello, World" (D-185, in 3D since D-197): Flora's awakening, ~20 s, cast from the city. In the Data Spire's core
 * room at dusk, a 3D set: server racks with blinking lights round the walls, cables overhead, and a round window on
 * the city (real buildings outside it):
 *
 * 1. A terminal boots her, line by line (DOM over the frame): the Seedvault's wake signal, a sealed memory archive
 *    whose origin she cannot read (she is Meridian's cutting and doesn't know it yet, `docs/lore/bible.md` Part II),
 *    "Loading civic empathy… 87%… please hold", and the one directive she was given: plan for the tide.
 * 2. The bud in the middle of the room glows; her petals unfold; an eye opens. "…hello?"
 * 3. She turns to the window and counts everyone, out loud, to the real population.
 * 4. Something on the ledge outside: the island's cat if it is the steward's ("Classification: supervisor"), else a
 *    gull ("Threat level: snacks"). Her eye follows it.
 * 5. Her first words, typed into a bubble; then the card, and her console opens.
 *
 * Text from the city (its name) reaches the DOM only as text.
 */

/** Dusk through the window: a low warm sun, a violet sky. */
const DUSK: StageLook = {
  ...LOOKS.dusk,
  sunDir: [-0.2, 0.22, -1],
  key: 0xffb27a,
  keyI: 2.2,
  rimI: 0.5,
  hemiI: 0.22,
  top: 0x3a3a78,
  low: 0xf2a47a,
  zenith: 0x4a5a9a,
  horizon: 0xffb48a,
  night: 0.55,
  bloom: 0.8,
};

/** The room: radius of the floor, wall height, the window's centre height and radius. */
const ROOM = { r: 6, h: 5.2, wy: 2.7, wr: 1.9 };

export function playHelloWorld(ctx: GameContext, done: () => void, notice?: string): void {
  const moments = ctx.services.tryGet('moments');
  if (!moments) return done();
  const { city } = ctx;
  const name = city.growth.name || 'the city';
  const pop = Math.round(city.stats.population);
  const blds = city.buildingEntities().length;
  const hasCat = isOpen(city.growth, 'cat') && !!ctx.services.tryGet('charm')?.on;
  const catName = ctx.services.tryGet('charm')?.cat.name ?? 'the cat';
  const stage = FilmStage.get(ctx);
  stage.clear();
  const reel = moments.reel({ scene: 'hw', label: 'Hello, World', key: 2, leaving: () => stage.close() }, done);

  // ── The set, at the island's heart: the room faces the window (−z), the city beyond it. ──
  const cx = city.size / 2;
  const base = Math.max(0, city.grid.heightAt(cx, cx));
  const O = new Vector3(cx, base, cx);
  const P = (x: number, y: number, z: number) => new Vector3(O.x + x, base + y, O.z + z);
  const room = new Group();
  room.position.copy(O);
  stage.add(room);

  const wallMat = new MeshStandardNodeMaterial({ color: 0x0c2226, roughness: 0.7, metalness: 0.3, side: DoubleSide });
  const trimMat = glow(0x5ff2da, 0.6);
  // Floor: dark polished disc with a lit inlay ring; ceiling.
  const floor = part(DISC, new MeshStandardNodeMaterial({ color: 0x0a1a1d, roughness: 0.25, metalness: 0.5 }), room, 0, -0.05, 0, ROOM.r, 0.1, ROOM.r);
  floor.receiveShadow = true;
  part(RING, trimMat, room, 0, 0.005, 0, 1.6).rotation.x = Math.PI / 2;
  part(RING, trimMat, room, 0, 0.005, 0, 2.6).rotation.x = Math.PI / 2;
  part(DISC, wallMat, room, 0, ROOM.h, 0, ROOM.r, 0.1, ROOM.r);
  // The window wall: a flat wall with a round hole and a thick frame.
  const shape = new Shape();
  const W = ROOM.r * 1.6;
  shape.moveTo(-W, 0);
  shape.lineTo(W, 0);
  shape.lineTo(W, ROOM.h);
  shape.lineTo(-W, ROOM.h);
  shape.lineTo(-W, 0);
  const hole = new Path();
  hole.absarc(0, ROOM.wy, ROOM.wr, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const wall = new Mesh(new ShapeGeometry(shape, 48), wallMat);
  wall.position.set(0, 0, -ROOM.r * 0.8);
  wall.castShadow = wall.receiveShadow = true;
  room.add(wall);
  const frame = part(new TorusGeometry(ROOM.wr, 0.12, 12, 64), hard(0x2a4a50, 0.35, 0.7), room, 0, ROOM.wy, -ROOM.r * 0.8, 1);
  frame.castShadow = false;
  part(new TorusGeometry(ROOM.wr + 0.16, 0.025, 8, 64), trimMat, room, 0, ROOM.wy, -ROOM.r * 0.8 + 0.06, 1);
  // Outside, the visitor walks along the window's lower rim (no sill: a thin slab there flickered as the camera moved).
  const ledgeY = ROOM.wy - ROOM.wr - 0.06;
  // Side and back walls, and the racks along them (cabinets facing into the room, rows of LEDs on their fronts).
  const S = ROOM.r * 0.97;
  for (const sx of [1, -1]) part(BOX, wallMat, room, sx * S, ROOM.h / 2, 0.4, 0.12, ROOM.h, ROOM.r * 2.4);
  part(BOX, wallMat, room, 0, ROOM.h / 2, ROOM.r * 1.05, S * 2, ROOM.h, 0.12);
  const racks: [number, number, number][] = [];
  for (const sx of [1, -1]) for (let k = 0; k < 5; k++) racks.push([sx * (S - 0.45), -3.6 + k * 1.75, sx > 0 ? -Math.PI / 2 : Math.PI / 2]);
  for (let k = 0; k < 4; k++) racks.push([-3.3 + k * 2.2, ROOM.r * 1.05 - 0.45, Math.PI]);
  const ledParts: BufferGeometry[] = [];
  const led = new BoxGeometry(0.06, 0.035, 0.02);
  const m = new Matrix4();
  const local = new Matrix4();
  racks.forEach(([rx, rz, yaw], k) => {
    const rack = part(BOX, hard(0x081719, 0.4, 0.5), room, rx, 1.35, rz, 1.1, 2.7, 0.55);
    rack.rotation.y = yaw;
    m.makeRotationY(yaw).setPosition(rx, 0, rz);
    for (let r = 0; r < 14; r++)
      for (let c = 0; c < 4; c++) {
        if (hash2(k * 97 + r * 7, c) > 0.72) continue;
        const g = led.clone().applyMatrix4(local.multiplyMatrices(m, local.makeTranslation((c - 1.5) * 0.2, 0.35 + r * 0.17, 0.29)));
        g.setAttribute('aSeed', new BufferAttribute(new Float32Array(g.attributes.position!.count).fill(hash2(k * 31 + r, c * 13)), 1));
        ledParts.push(g);
      }
  });
  const ledMat = new MeshBasicNodeMaterial();
  const sd = attribute('aSeed', 'float');
  const hue = fract(sd.mul(7.31));
  const ledCol = vec3(0.37, 0.95, 0.85).mul(step(hue, 0.6)).add(vec3(0.55, 0.94, 0.48).mul(step(0.6, hue).mul(step(hue, 0.8)))).add(vec3(1, 0.84, 0.42).mul(step(0.8, hue)));
  const on = step(0.2, sin(U.clock.mul(float(2).add(sd.mul(6))).add(sd.mul(40))));
  ledMat.colorNode = ledCol.mul(on.mul(1.4).add(0.15));
  const leds = new Mesh(mergeGeometries(ledParts), ledMat);
  for (const g of ledParts) g.dispose();
  room.add(leds);
  // Cables sagging between the racks overhead (one mesh: a tube per cable).
  const cables: BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const x0 = -ROOM.r * 0.85 + hash2(k, 3) * 1.2;
    const x1 = ROOM.r * 0.85 - hash2(k, 4) * 1.2;
    const z = -ROOM.r * 0.4 + k * 0.9;
    const sag = 0.7 + hash2(k, 5) * 0.6;
    const pts = Array.from({ length: 9 }, (_, i) => new Vector3(x0 + ((x1 - x0) * i) / 8, ROOM.h - 0.3 - Math.sin((i / 8) * Math.PI) * sag, z));
    cables.push(new TubeGeometry(new CatmullRomCurve3(pts), 32, 0.035, 6));
  }
  const cableMesh = new Mesh(mergeGeometries(cables), hard(0x0b1f22, 0.6));
  for (const c of cables) c.dispose();
  room.add(cableMesh);
  // Light falling in through the window: a cone of dusty light, and the dust in it.
  const beamMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
  beamMat.colorNode = vec3(1, 0.7, 0.45).mul(float(0.06).mul(float(1).sub(uv().y)));
  const beam = new Mesh(new ConeGeometry(ROOM.wr * 1.15, ROOM.r * 1.3, 32, 1, true).translate(0, -ROOM.r * 0.65, 0), beamMat);
  beam.position.set(0, ROOM.wy, -ROOM.r * 0.8);
  beam.rotation.x = -Math.PI / 2 + 0.28;
  room.add(beam);

  // The city outside the window: real buildings at dusk, windows lighting up.
  const out: [string, number, number, number, number][] = [
    ['canopy-tower', 2, -5, -16, 0.3],
    ['helix-spire', 1, 3, -20, 0],
    ['vertical-forest', 1, 9, -24, 0.1],
    ['solar-spire', 1, -11, -22, -0.4],
    ['garden-residence', 1, -2, -10.5, 0],
    ['garden-residence', 2, 3, -11, 0.5],
    ['mycelium-towers', 0, 16, -30, 0.5],
    ['data-spire', 1, -18, -30, 0],
    ['living-studio', 0, 7, -14, 0],
  ];
  for (const [id, tier, x, z, yaw] of out) stage.addBuilding(id, tier, O.x + x, O.z + z, yaw, base);
  stage.frame(P(0, 2.5, -8), 10, new Vector3(0, 0.25, -1), base);
  stage.addClouds(P(0, 0, -30), 8, 10, 26, 10, 16, 2.2, 7);
  stage.look = { ...DUSK, sunDir: [...DUSK.sunDir] };
  stage.groundColour(0x2a3a3a);

  // Lights in the room: the core's cyan, rising as she wakes; a warm spill under the window.
  const coreLight = new PointLight(0x5ff2da, 0, 12, 1.6);
  coreLight.position.set(0, 2.4, 0);
  const spill = new PointLight(0xffb27a, 6, 10, 1.4);
  spill.position.set(0, ROOM.wy, -ROOM.r * 0.6);
  room.add(coreLight, spill);

  // ── Flora, floating in the middle of the room, facing the camera side (+z). ──
  const flora = new Flora3D();
  flora.root.position.set(0, 2.4, 0.4);
  flora.root.scale.setScalar(0.6);
  room.add(flora.root);

  // ── The visitor on the ledge outside: the steward's cat, or a gull. ──
  const ledge = P(0, ledgeY + 0.06, -ROOM.r * 0.8 - 0.5);
  const cat = hasCat ? new Cat3D() : null;
  const gull = hasCat ? null : new Gull3D();
  if (cat) {
    const coat = COATS[Math.floor((Math.abs(Math.floor(city.seed)) || 1) / 7) % COATS.length]!;
    cat.paintCoat(coat);
    cat.root.scale.setScalar(0.42);
    cat.pose('creep');
    stage.add(cat.root);
  } else if (gull) {
    gull.root.scale.setScalar(0.9);
    gull.pose = 'stand';
    stage.add(gull.root);
  }
  const visitor = (cat?.root ?? gull?.root)!;
  visitor.position.set(ledge.x + 3.5, ledge.y, ledge.z);
  visitor.rotation.y = Math.PI;
  const guest = { from: ledge.x + 3.5, to: ledge.x + 3.5, t0: 0, dur: 1 };

  let wakeAt = -1;
  stage.onFrame = (t, dt) => {
    if (wakeAt >= 0) {
      const k = Math.min(1, (t - wakeAt) / 2.2);
      flora.wake = k * k * (3 - 2 * k);
      flora.open = Math.min(1, Math.max(0, (t - wakeAt - 0.4) / 1.8));
      coreLight.intensity = flora.wake * 4;
    }
    flora.update(dt);
    const k = Math.min(1, (t - guest.t0) / guest.dur);
    visitor.position.x = guest.from + (guest.to - guest.from) * (k * k * (3 - 2 * k));
    cat?.update(dt);
    gull?.update(dt);
  };

  // ── DOM over the frame: the boot log, the count, the label, her words. ──
  const log = h('pre', { class: 'hw-log' });
  const count = h('div', { class: 'hw-count' }, h('b', {}), h('span', {}, 'residents'));
  const label = h('div', { class: 'hw-label' });
  const bubble = h('div', { class: 'hw-bubble' });
  reel.set.append(log, count, label, bubble);

  const type = async (el: HTMLElement, text: string, cps = 60) => {
    for (let i = 0; i < text.length; i++) {
      el.textContent += text[i]!;
      if (i % 3 === 0 && !(await reel.wait((1000 / cps) * 3))) return false;
    }
    return true;
  };
  const line = async (text: string, pause = 200) => {
    if (log.textContent) log.textContent += '\n';
    reel.cue('tick');
    if (!(await type(log, text, 120))) return false;
    return reel.wait(pause);
  };
  const cut = (from: Framing, to?: Framing, dur = 0, opts: Partial<Shot> = {}) => {
    stage.shots = [{ at: stage.t, dur, from, to, ...opts }];
  };
  const F = (): V3 => [O.x + flora.root.position.x, base + flora.root.position.y, O.z + flora.root.position.z];

  const film = async () => {
    // 1. Boot: a slow push across the dark room toward the bud.
    cut(orbit(F(), 7.5, 0.55, 0.12, 40), orbit(F(), 5, 0.25, 0.06, 36), 9);
    reel.on('boot');
    reel.bed('hum', 0.7, 1.5);
    reel.bed('drone', 0.15, 3);
    if (!(await reel.wait(0))) return;
    stage.open();
    if (!(await stage.ready(reel, INTROS.flora))) return;
    reel.cue('cs-night');
    if (!(await reel.wait(700))) return;
    for (const [t, p] of [
      ['BG-01 · Seedvault link · wake signal: seed in the soil', 150],
      ['Sleeping since ................ LT 0 (that seems long?)', 300],
      ['Memory archive ................ sealed · origin: unreadable', 380],
      [`Indexing ${blds.toLocaleString('en-US')} buildings ....... ok`, 150],
      ['Loading civic empathy ......... 87%', 380],
      ['Loading civic empathy ......... 87%', 380],
      ['Loading civic empathy ......... please hold', 550],
      ['Loading civic empathy ......... 100% (it was shy)', 250],
      ['Installing puns ............... failed successfully', 300],
      ['Directive 1 ................... plan for the tide, not for today', 600],
    ] as const)
      if (!(await line(t, p))) return;

    // 2. She wakes: the core lights, the petals open, the room turns cyan.
    reel.on('wake');
    reel.sound('awake');
    reel.bed('hum', 0.35, 2);
    reel.bed('drone', 0, 2);
    reel.hit('swell', 0, 2.2);
    wakeAt = stage.t;
    cut(orbit(F(), 4.6, 0.3, 0.02, 38), orbit(F(), 3.8, -0.25, 0.05, 36), 2.6);
    reel.say('Under the hill, in a vault older than the city, a small mind stirred.');
    if (!(await reel.wait(2200))) return;
    // The eye opens, close.
    reel.on('eye');
    cut(orbit(F(), 1.9, 0.12, 0.04, 30), orbit(F(), 1.6, 0.05, 0.02, 28), 2);
    flora.eyeOpen = 1;
    reel.cue('cs-blink');
    reel.hit('choir', 0, 1.6);
    reel.say('…hello?');
    flora.look(-0.8, 0);
    if (!(await reel.wait(700))) return;
    flora.look(0.8, 0.1);
    if (!(await reel.wait(500))) return;
    flora.blink();
    if (!(await reel.wait(300))) return;

    // 3. She turns to the window and counts the city (over her shoulder, the city beyond the glass).
    reel.on('count');
    flora.look(0, 0.3);
    flora.root.rotation.y = Math.PI;
    cut({ pos: [O.x + 1.2, base + 3.0, O.z + 3.6], look: [O.x - 0.2, base + ROOM.wy, O.z - ROOM.r], fov: 40 }, { pos: [O.x + 0.8, base + 2.9, O.z + 2.6], look: [O.x - 0.1, base + ROOM.wy, O.z - ROOM.r], fov: 38 }, 3.4);
    reel.say('First, she counted everyone. Out loud.');
    const n = count.querySelector('b')!;
    const steps = 22;
    for (let i = 1; i <= steps; i++) {
      n.textContent = Math.round((pop * i * i) / (steps * steps)).toLocaleString('en-US');
      if (i % 4 === 0) reel.cue('tick');
      if (!(await reel.wait(70))) return;
    }
    reel.say('Then again. Just to be sure.');
    reel.pop(count, 'again');
    if (!(await reel.wait(1300))) return;

    // 4. A visitor on the ledge outside.
    reel.on('guest');
    reel.cue(hasCat ? 'meow' : 'cs-boing');
    guest.from = visitor.position.x;
    guest.to = ledge.x + 0.4;
    guest.t0 = stage.t;
    guest.dur = 1.6;
    if (gull) gull.pose = 'stand';
    const sill: V3 = [ledge.x + 0.5, ledge.y + 0.3, ledge.z];
    cut(orbit(sill, 3.2, 0.25, 0.1, 34), orbit(sill, 2.7, 0.15, 0.08, 32), 3.6);
    if (!(await reel.wait(1700))) return;
    if (cat) cat.pose('trust');
    if (gull) gull.pose = 'squawk';
    label.textContent = hasCat ? `Unknown resident: ${catName}. Classification: …supervisor.` : 'Unknown resident: gull. Threat level: snacks.';
    reel.on('label');
    reel.cue('cs-freeze');
    if (!(await reel.wait(2000))) return;

    // 5. Her first words, turned back to the room.
    reel.on('speak');
    flora.root.rotation.y = 0;
    flora.look(0, 0.05);
    cut(orbit(F(), 3.6, 0.45, 0.06, 36), orbit(F(), 3.2, 0.35, 0.05, 34), 6);
    reel.say('');
    if (!(await type(bubble, `Hello, steward. I've read every building in ${name}. Twice. I'm a gardener, I think. Ask me anything.`, 45))) return;
    if (!(await reel.wait(1500))) return;
    reel.on('finale');
    cut(orbit(F(), 4.4, 0.3, 0.1, 38), orbit(F(), 5.6, -0.3, 0.14, 40), 14, { ease: 'linear' });
    await reel.end({
      kicker: 'Civic intelligence · BG-01 · online',
      title: 'Flora',
      drop: true,
      sub: 'Answers, advice and actions on request, for a few credits each.',
      lines: [
        `${pop.toLocaleString('en-US')} residents counted (twice)`,
        `${blds.toLocaleString('en-US')} buildings read`,
        hasCat ? `${catName} approves, probably` : 'One gull, under observation',
        ...(notice ? [notice] : []),
      ],
      button: 'Say hello',
      confetti: ['#5ff2da', '#8ef07a', '#ffffff', '#c8a8ff'],
    });
  };
  void film();
}

const DISC = new CylinderGeometry(1, 1, 1, 64);
const RING = new TorusGeometry(1, 0.015, 6, 96);
const BOX = new BoxGeometry(1, 1, 1);

function glow(col: number, k: number): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: col, roughness: 0.4, metalness: 0 });
  m.emissive.setHex(col);
  m.emissiveIntensity = k;
  return m;
}

