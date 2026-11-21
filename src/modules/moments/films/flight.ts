import {
  AdditiveBlending,
  CatmullRomCurve3,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  TubeGeometry,
  Vector3,
} from 'three/webgpu';
import { attribute, float, normalWorld, positionWorld, sin, step, uniform, uv, vec3 } from 'three/tsl';
import type { GameContext } from '@/game/context';
import { h } from '@/ui/dom';
import { podGeometry, podSurface } from '@/modules/mobility/podModel';
import { openReel } from '../reel';
import { FilmStage } from '../FilmStage';
import { orbit, type Framing, type Shot, type V3 } from '../shots';
import { LOOKS, type StageLook } from '@/render/stageUniforms';
import { Person3D } from '../actors/person';
import { Gull3D } from '../actors/gull';
import { CAST, crowdLook } from '../actors/cast';
import { BALL, glow, hard, noShadows, part } from '../actors/rig';
import { CylinderGeometry, TorusGeometry } from 'three/webgpu';

const DISC = new CylinderGeometry(1, 1, 1, 48);
const RING = new TorusGeometry(1, 0.02, 6, 64);
import './flight.css';

/**
 * "Maiden Flight" (D-185, in 3D since D-197): the Sky-lane charter's film, ~20 s, on a 3D set of the game's own
 * buildings. The first pod's first hop over the city, by a test pilot who would rather be anywhere else:
 *
 * 1. Morning over a skyline of real towers. The pod waits on its pad; the pilot's checklist ticks ("Courage…
 *    loading"), and a close-up on the pilot, gripping.
 * 2. Three, two, one. The pod lifts, wobbling, onto the glowing sky lane (a chase camera behind it).
 * 3. A gull comes alongside and lands on the roof. The pilot's eyes go wide.
 * 4. The lane loops the loop (seen side-on); the gull holds on, upside down.
 * 5. Touchdown at the dock: the crowd cheers, and the gull leaves with the pilot's helmet.
 * 6. Sky-lanes are open.
 *
 * The pod is the city's own model (`podGeometry` / `podSurface`, drawn 3× with see-through glazing so the pilot shows);
 * the pilot, gull and crowd are the film cast (`actors/`). The checklist, countdown and card are DOM over the frame.
 */

const PILOTS = ['Ines', 'Bo', 'Tamsin', 'Okoro', 'Lumi', 'Rafa', 'Yuki', 'Dev'];
/** Seconds the pod takes from pad to dock. */
const FLIGHT = 7.5;
/** When, into the flight, the gull lands on the roof. */
const GULL_LANDS = 2.4;
/** The pod is drawn this much larger than in the city (a film's star). */
const POD = 2.2;

/** A clear morning: low sun from the east, a blue sky, soft shadows. */
const MORNING: StageLook = {
  ...LOOKS.day,
  sunDir: [0.55, 0.62, 0.55],
  key: 0xfff0d8,
  keyI: 2.6,
  rimI: 0.9,
  hemiI: 1.25,
  top: 0x2a6cd0,
  low: 0x9ccbf2,
  zenith: 0x5fa4ff,
  horizon: 0xd8ecff,
  bloom: 0.55,
};

export function playMaidenFlight(ctx: GameContext, done: () => void): void {
  const { city } = ctx;
  const pilotName = PILOTS[Math.abs(city.seed) % PILOTS.length]!;
  const stage = FilmStage.get(ctx);
  stage.clear();
  const reel = openReel(ctx, { scene: 'mf', label: 'Maiden Flight', key: 5, leaving: () => stage.close() }, done);

  // ── The set: two docks across a street of real towers, at the island's heart (its ground). ──
  const cx = city.size / 2;
  const base = Math.max(0, city.grid.heightAt(cx, cx));
  const O = new Vector3(cx, base, cx);
  const at = (x: number, y: number, z: number) => new Vector3(O.x + x, base + y, O.z + z);
  // The skyport towers stand behind the two pads.
  stage.addBuilding('pod-dock', 1, O.x - 7.4, O.z - 1.6, 0.2, base, 1.8);
  stage.addBuilding('pod-dock', 2, O.x + 7.8, O.z - 1.6, -0.2, base, 1.8);
  const towers: [string, number, number, number, number][] = [
    ['canopy-tower', 2, -9, -7, 0.3],
    ['helix-spire', 1, -3, -10, 0],
    ['vertical-forest', 1, 3, -12, 0.1],
    ['solar-spire', 1, 9, -8, -0.4],
    ['data-spire', 1, 14, -13, 0],
    ['mycelium-towers', 0, -15, -14, 0.5],
    ['garden-residence', 1, -3, 4, 1.57],
    ['garden-residence', 2, 2.5, 4.5, -1.57],
    ['living-studio', 0, -11, 5, 0],
    ['canopy-tower', 1, 13, -1, -0.3],
  ];
  for (const [id, tier, x, z, yaw] of towers) stage.addBuilding(id, tier, O.x + x, O.z + z, yaw, base);
  stage.frame(at(0, 3, -2), 14, new Vector3(-0.4, 0.3, -1), base);
  stage.addClouds(at(0, 0, -4), 14, 18, 40, 9, 15, 1.6, city.seed & 1023);
  stage.look = { ...MORNING, sunDir: [...MORNING.sunDir] };
  stage.groundColour(0x5f8f6c);

  // ── Two pads at plaza level: launch on the left, landing (and the crowd) on the right. ──
  const PAD_H = 0.22;
  const padLights = new Group();
  const blink = glow(0xff6a5a, 3);
  const deck = hard(0xe9eef0, 0.6);
  const ringMat = glow(0x7ff7e6, 1.6);
  const marking = hard(0x2f6f78, 0.5);
  const landingPad = (x: number, z: number) => {
    const c = at(x, 0, z);
    part(DISC, deck, padLights, c.x, base + PAD_H / 2, c.z, 1.45, PAD_H, 1.45).receiveShadow = true;
    part(DISC, marking, padLights, c.x, base + PAD_H + 0.004, c.z, 1.05, 0.01, 1.05).receiveShadow = true;
    part(DISC, deck, padLights, c.x, base + PAD_H + 0.008, c.z, 0.95, 0.01, 0.95).receiveShadow = true;
    const ring = part(RING, ringMat, padLights, c.x, base + PAD_H + 0.01, c.z, 1.3);
    ring.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(BALL, blink, padLights, c.x + Math.cos(a) * 1.38, base + PAD_H + 0.03, c.z + Math.sin(a) * 1.38, 0.045);
    }
    return new Vector3(c.x, base + PAD_H + 0.3, c.z);
  };
  // ── The sky lane: off the pad, over the park, a loop-the-loop, and down to the landing pad. ──
  const padTop = landingPad(-7, 1.6);
  const dockTop = landingPad(7.4, 1.6);
  const loopC = at(0.4, 7.2, 0.6);
  const R = 1.7;
  const pts = [
    padTop.clone(),
    padTop.clone().add(new Vector3(1.0, 0.8, 0)),
    at(-3.8, 4.6, 1.4),
    at(-1.2, loopC.y - base - R, 1.05),
  ];
  // Counter-clockwise seen from +z (so the roof faces the loop's centre), drifting a little in z to clear itself.
  for (let k = 1; k <= 7; k++) {
    const a = -Math.PI / 2 + (k / 8) * Math.PI * 2;
    pts.push(new Vector3(loopC.x + Math.cos(a) * R, loopC.y + Math.sin(a) * R, loopC.z + 0.45 - (k / 8) * 0.9));
  }
  pts.push(at(2.0, loopC.y - base - R, 0.1), at(4.8, 4.2, 1.2), dockTop.clone().add(new Vector3(-1.2, 0.9, 0)), dockTop.clone());
  const lane = new CatmullRomCurve3(pts, false, 'centripetal');
  const laneOn = uniform(0);
  const laneFlow = uniform(0);
  const glowMat = (w: number) => {
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
    // Chevrons running along the lane toward the dock once it is lit.
    const run = sin(uv().x.mul(220).sub(laneFlow.mul(6))).mul(0.5).add(0.5);
    m.colorNode = vec3(0.35, 1, 0.92).mul(laneOn.mul(float(w).add(run.mul(0.35))));
    return m;
  };
  const tube = new Mesh(new TubeGeometry(lane, 700, 0.045, 8, false), glowMat(1.1));
  const halo = new Mesh(new TubeGeometry(lane, 350, 0.16, 8, false), glowMat(0.18));
  tube.frustumCulled = halo.frustumCulled = false;
  stage.add(tube, halo);

  // ── The pod (the city's model) with a see-through canopy, the pilot inside, a perch for the gull. ──
  const pod = new Group();
  const geo = podGeometry();
  geo.setAttribute('aRouteInfo', new InstancedBufferAttribute(new Float32Array([0, 0, 0.36, 0]), 4));
  const pm = new MeshBasicNodeMaterial({ transparent: true });
  podSurface(pm, attribute('aRouteInfo', 'vec4'), normalWorld, positionWorld);
  const lum = attribute('aGlow', 'float');
  pm.opacityNode = float(1).sub(step(lum, -0.5).mul(float(1).sub(step(lum, -1.5))).mul(0.62));
  const hull = new InstancedMesh(geo, pm, 1);
  hull.setMatrixAt(0, new Matrix4().makeScale(POD, POD, POD));
  hull.castShadow = true;
  hull.renderOrder = 2;
  pod.add(hull);
  // The pilot stands on the pad beside the pod with the checklist; boards at the countdown; steps out at the dock.
  const pilot = new Person3D(CAST.pilot);
  const standOn = (c: Vector3, yaw: number) => {
    stage.add(pilot.root);
    pilot.root.scale.setScalar(0.5);
    pilot.root.position.set(c.x + 0.15, c.y - 0.3, c.z + 0.95);
    pilot.root.rotation.set(0, yaw, 0);
  };
  standOn(padTop, -0.75);
  pilot.act('read');
  pilot.pose.snap();
  const board = () => {
    pod.add(pilot.root);
    pilot.root.scale.setScalar(0.27);
    pilot.root.position.set(0.16, -0.12, 0);
    pilot.root.rotation.set(0, 0, 0);
    pilot.act('grip');
    pilot.pose.snap();
  };
  stage.add(pod, padLights);

  const gull = new Gull3D();
  gull.root.scale.setScalar(0.7);
  stage.add(gull.root);
  // The crowd at the dock, on the plaza in front of it.
  const crowd = Array.from({ length: 5 }, (_, i) => {
    const p = new Person3D(crowdLook(i + city.seed));
    p.root.scale.setScalar(0.55);
    // A crescent on the plaza in front of the pad, facing it.
    const a = Math.PI * (0.25 + (i / 4) * 0.62);
    const r = 1.9 + (i % 2) * 0.35;
    p.root.position.set(dockTop.x + Math.cos(a) * r, base, dockTop.z + Math.sin(a) * r);
    p.root.rotation.y = Math.atan2(Math.sin(a), -Math.cos(a)) + Math.PI;
    p.act('stand', { headPitch: -0.2 });
    p.pose.snap();
    // Small and many: they cast no shadow (the draw budget goes to the pod and the pilot).
    noShadows(p.root);
    stage.add(p.root);
    return p;
  });

  // ── Direction: where the pod is (flight progress `u` over arc length), the gull's flight, the theft. ──
  let flightAt = -1;
  const P = new Vector3();
  const T = new Vector3();
  const side = new Vector3();
  const up = new Vector3();
  const m4 = new Matrix4();
  const perch = new Vector3(-0.12, 0.33, 0);
  const gullFrom = new Vector3();
  let gullAt = -1;
  let gullOn = false;
  let heistAt = -1;
  const away = at(-14, 13, -6);
  const helmet = pilot.hat;
  const tmp = new Vector3();
  const flat = new Vector3();
  const place = (u: number) => {
    lane.getPointAt(u, P);
    lane.getTangentAt(u, T);
    // Level flight with a gentle climb or dive (at most ~20°), turning into the full tangent through the loop.
    const inLoop = Math.max(0, Math.min(1, (R * 1.5 - Math.hypot(P.x - loopC.x, P.y - loopC.y)) / (R * 0.4)));
    const lim = 0.36 * Math.min(1, u * 10, (1 - u) * 10);
    flat.set(T.x, Math.max(-lim, Math.min(lim, T.y)), T.z).normalize();
    if (u === 0) flat.set(1, 0, 0);
    T.lerp(flat, 1 - inLoop).normalize();
    // The lane's left is the roof's up (the loop is flown counter-clockwise, seen from +z).
    side.set(0, 0, 1);
    up.crossVectors(side, T).normalize();
    side.crossVectors(T, up).normalize();
    m4.makeBasis(T, up, side.negate());
    pod.quaternion.setFromRotationMatrix(m4);
    pod.position.copy(P);
  };
  place(0);

  stage.onFrame = (t, dt) => {
    laneFlow.value = t;
    blink.emissiveIntensity = flightAt < 0 ? (Math.sin(t * 6) > 0 ? 3.5 : 0.3) : 0.3;
    if (flightAt >= 0) {
      const k = Math.min(1, (t - flightAt) / FLIGHT);
      // Gentle start and stop; a nervous wobble that settles.
      const u = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      place(u);
      const wob = Math.max(0, 1 - k * 2.2);
      pod.rotateX(Math.sin(t * 9) * 0.12 * wob);
      pod.rotateZ(Math.sin(t * 6.3) * 0.05 * wob);
    } else {
      place(0);
      pod.position.y += Math.sin(t * 2.2) * 0.02 + (laneOn.value > 0.5 ? Math.sin(t * 40) * 0.006 : 0);
    }
    pilot.update(dt);
    // The gull: homes in on the perch, then rides it; at the dock it grabs the helmet and flies off.
    if (gullAt >= 0 && !gullOn && heistAt < 0) {
      const k = Math.min(1, (t - gullAt) / 1.5);
      const e = k * k * (3 - 2 * k);
      tmp.copy(perch).applyMatrix4(pod.matrixWorld);
      gull.root.position.lerpVectors(gullFrom, tmp, e);
      gull.root.position.y += Math.sin(k * Math.PI) * 0.8;
      gull.root.lookAt(tmp.x + (tmp.x - gullFrom.x), gull.root.position.y, tmp.z + (tmp.z - gullFrom.z));
      gull.root.rotateY(-Math.PI / 2);
      if (k >= 1) {
        gullOn = true;
        gull.pose = 'stand';
        pod.add(gull.root);
        gull.root.position.copy(perch);
        gull.root.rotation.set(0, 0, 0);
      }
    }
    if (heistAt >= 0) {
      const k = Math.min(1, (t - heistAt) / 2.6);
      const e = k * k;
      gull.root.position.lerpVectors(gullFrom, away, e);
      gull.root.position.y += Math.sin(k * Math.PI) * 1.2;
      gull.root.rotation.set(0, Math.atan2(-(away.z - gullFrom.z), away.x - gullFrom.x), 0.25);
    }
    gull.update(dt);
    for (const c of crowd) c.update(dt);
    stage.anchor.copy(pod.position);
  };

  // ── DOM over the frame: the checklist on its clipboard, the countdown. ──
  const items = [
    ['Seatbelt', '✓'],
    ['Sky-lane map', '✓'],
    ['Snacks', '✓✓'],
    ['Courage', 'loading…'],
  ] as const;
  const list = h(
    'div',
    { class: 'mf-clip' },
    h('b', {}, `Test pilot: ${pilotName}`),
    ...items.map(([k, v], i) => h('div', { class: 'mf-item', style: `--i:${i}` }, h('span', {}, k), h('em', {}, v))),
  );
  const count = h('div', { class: 'mf-count' });
  reel.set.append(list, count);

  const cut = (from: Framing, to?: Framing, dur = 0, opts: Partial<Shot> = {}) => {
    stage.shots = [{ at: stage.t, dur, from, to, ...opts }];
  };
  const v = (p: Vector3, dy = 0): V3 => [p.x, p.y + dy, p.z];

  const film = async () => {
    // 1. The pad, the skyline and the checklist.
    cut(orbit(v(padTop, 0.4), 9, 0.95, 0.32, 40), orbit(v(padTop, 0.3), 5.5, 0.7, 0.18, 36), 4.5);
    reel.bed('wind', 0.35, 2);
    if (!(await reel.wait(0))) return;
    stage.open();
    reel.hit('gulls', 1.2);
    reel.say('Sky-lane charter: approved. Test pilot: …available.');
    if (!(await reel.wait(1700))) return;
    reel.on('list');
    for (let i = 0; i < items.length; i++) {
      reel.cue('tick');
      if (!(await reel.wait(i === items.length - 1 ? 900 : 520))) return;
    }
    // Close on the pilot, gripping the controls.
    const face = new Vector3();
    pilot.headAt(face);
    cut(orbit(v(face), 1.1, 0.55, 0.08, 30), orbit(v(face), 0.9, 0.5, 0.06, 28), 2.2);
    pilot.act('read', { brows: 0.9, mouth: 0.15, smile: -0.3 });
    reel.say(`${pilotName} has flown this route four hundred times. In a simulator.`);
    if (!(await reel.wait(1600))) return;

    // 2. Countdown and lift-off.
    reel.on('ready');
    laneOn.value = 1;
    board();
    cut(orbit(v(padTop, 0.2), 4.2, 0.45, 0.2, 36), orbit(v(padTop, 0.6), 4.8, 0.3, 0.3, 36), 2.4);
    for (const n of ['3', '2', '1']) {
      count.textContent = n;
      reel.pop(count);
      reel.cue('cs-blink');
      if (!(await reel.wait(700))) return;
    }
    count.textContent = '';
    reel.on('launch');
    reel.bed('wind', 0.8, 1);
    reel.hit('swell', 0, 2.5);
    flightAt = stage.t;
    // A chase camera: behind and above, the skyline ahead.
    cut({ pos: [-2.6, 1.3, 2.4], look: [1.5, 0.3, -0.4], fov: 42 }, { pos: [-2.2, 1.0, 2.6], look: [1.5, 0.4, -0.3], fov: 40 }, 2.5, { rel: true });
    reel.cue('cs-whoosh');
    reel.say('One small hop for a pod…');

    // 3. A passenger nobody booked.
    if (!(await reel.wait((GULL_LANDS - 1.5) * 1000))) return;
    reel.hit('gulls', 0.3);
    reel.hit('wings', 1.1);
    gull.pose = 'fly';
    gullFrom.copy(pod.position).add(new Vector3(3.5, 1.8, 3));
    gull.root.position.copy(gullFrom);
    gullAt = stage.t;
    cut({ pos: [0.5, 0.7, 3.2], look: [0.2, 0.25, 0], fov: 38 }, { pos: [0.1, 0.6, 2.8], look: [0, 0.3, 0], fov: 36 }, 2, { rel: true });
    if (!(await reel.wait(1500))) return;
    reel.on('aboard');
    reel.cue('cs-boing');
    pilot.act('grip', { brows: 1, mouth: 0.9, smile: 0, headYaw: 0.4, headPitch: -0.3 });
    reel.say('…and one passenger nobody booked.');
    if (!(await reel.wait(1300))) return;

    // 4. The loop, side-on, the whole of it in frame.
    cut(orbit(v(loopC), 8.5, 0.05, 0.06, 38), orbit(v(loopC), 7.8, -0.05, 0.08, 38), 2.6);
    reel.say('The gull insisted on the scenic route.');
    reel.cue('cs-freeze');
    if (!(await reel.wait((FLIGHT - GULL_LANDS - 1.5 - 1.3) * 1000 - 600))) return;
    // Coming in to the dock.
    cut(orbit(v(dockTop, 0.2), 7, 0.15, 0.2, 40), orbit(v(dockTop, 0.2), 6.2, 0.25, 0.17, 40), 2.6);
    if (!(await reel.wait(600))) return;

    // 5. Touchdown, cheers, and a theft.
    reel.on('landed');
    laneOn.value = 0.4;
    reel.bed('wind', 0.25, 1);
    reel.hit('thud');
    reel.hit('crowd', 0.2);
    reel.cue('cs-fanfare');
    for (const c of crowd) c.act('cheer');
    // Out onto the pad, waving.
    standOn(dockTop, Math.PI / 2 + 0.4);
    pilot.act('wave');
    reel.say('Touchdown! The crowd goes mild. Then wild.');
    if (!(await reel.wait(1500))) return;
    reel.on('heist');
    reel.hit('wings', 0.1);
    reel.hit('gulls', 0.3);
    // The gull takes the helmet and goes.
    gull.root.updateWorldMatrix(true, false);
    gullFrom.setFromMatrixPosition(gull.root.matrixWorld);
    stage.add(gull.root);
    gull.root.scale.setScalar(0.7);
    gull.pose = 'fly';
    helmet.removeFromParent();
    gull.carry.add(helmet);
    helmet.position.set(0, 0, 0);
    helmet.scale.setScalar(0.8);
    heistAt = stage.t;
    pilot.act('facepalm');
    cut(orbit(v(dockTop, 0.1), 4.2, 0.55, 0.12, 38), orbit(v(dockTop, 1.0), 7, 0.4, 0.22, 40), 2.4);
    reel.cue('cs-munch');
    reel.say('Sky-lanes: open. Hats: at your own risk.');
    if (!(await reel.wait(2300))) return;

    // 6. The card, the pod at rest under the skyline.
    reel.on('finale');
    cut(orbit(v(dockTop, 1), 8, 0.2, 0.22, 40), orbit(v(dockTop, 1.5), 10, 0.6, 0.28, 40), 14, { ease: 'linear' });
    await reel.end({
      kicker: 'Unlock · charter granted',
      title: 'Sky-lanes',
      drop: true,
      sub: 'Commuters can fly now instead of jamming the streets.',
      lines: [
        'Pod Docks near busy homes',
        'Pod Interchanges and the Skylane Nexus',
        `${pilotName} would like a word about the gull`,
        'The Drift will be singing about that gull for years',
      ],
      button: 'Clear for take-off',
      confetti: ['#8fc0ff', '#c8a8ff', '#ffffff', '#5ff2da'],
    });
  };
  void film();
}
