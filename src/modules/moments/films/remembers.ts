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
  PointLight,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import { float, positionLocal, sin, step, uniform, uv, vec3, attribute, fract } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameContext } from '@/game/context';
import { U } from '@/render/uniforms';
import { LOOKS, mixLook, type StageLook } from '@/render/stageUniforms';
import { hash2 } from '@/sim/random';
import { openReel } from '../reel';
import { FilmStage } from '../FilmStage';
import { orbit, type Framing, type Shot, type V3 } from '../shots';
import { glow, hard, part, soft } from '../actors/rig';
import { Person3D } from '../actors/person';
import { CAST } from '../actors/cast';
import './remembers.css';

/**
 * "What the Sea Remembers" (D-192, in 3D since D-197): the Sunken Colonnade rises, and with it the island's oldest
 * story, ~26 s. It plays in place of "Something Stirs" for the colonnade (the wonder's ceremony still follows,
 * D-187). The canon is `docs/lore/bible.md` (Parts I and II); every stage is a page of the Chronicle. A 3D set: the
 * game's own buildings in Halcyon's white marble on terraces over a harbour, a colonnade and a rotunda:
 *
 * 1. Halcyon at noon: the marble city on its hills, the harbour of columns, citizens on the quay.
 * 2. Meridian: its seal of light over the city, threads of light drawing out to every roof.
 * 3. One More Wall: the sea rises, the walls rise to meet it, step by step.
 * 4. The Long Tide: storm, rain, lightning, and the sea comes in over the walls and the city.
 * 5. The vault: a seed of light arcs into the western hill; the door closes.
 * 6. Under the sea: the drowned columns, the reef's glow and the three rings of the Tidekin's promises.
 * 7. A flame in the drowned rotunda that never went out; then the card.
 */

const NOON: StageLook = { ...LOOKS.day, env: 0.7, sunDir: [0.45, 0.7, 0.55], key: 0xfff0d8, keyI: 1.5, rimI: 0.5, hemiI: 0.55, top: 0x3a7ccf, low: 0xa8d2f0, zenith: 0x5fa4ff, horizon: 0xcfe4f2, bloom: 0.3 };
const GOLD: StageLook = { ...NOON, key: 0xffd99a, keyI: 1.8, top: 0x3f6ab0, low: 0xe8c89a, horizon: 0xf0d4a8, bloom: 0.7 };
const STORM: StageLook = { ...LOOKS.dusk, env: 0.22, night: 0.55, sunDir: [-0.3, 0.8, 0.4], key: 0x8a9ab0, keyI: 0.45, rimI: 0.3, hemiI: 0.3, top: 0x1c2430, low: 0x46525e, zenith: 0x2a3440, horizon: 0x56606a, bloom: 0.6 };
const DEEP: StageLook = { ...LOOKS.night, env: 0.25, night: 0.7, sunDir: [0.1, 1, 0.2], key: 0x7fd8e8, keyI: 0.7, rimI: 0.25, hemiI: 0.3, top: 0x1d6a88, low: 0x05202e, zenith: 0x1d6a88, horizon: 0x0a3a50, bloom: 0.8 };

const MARBLE = 0xe6ddcc;
const BOX = new BoxGeometry(1, 1, 1);

export function playWhatTheSeaRemembers(ctx: GameContext, done: () => void): void {
  const { city } = ctx;
  const stage = FilmStage.get(ctx);
  stage.clear();
  const reel = openReel(
    ctx,
    { scene: 'hal', label: 'What the Sea Remembers', leak: 'rgba(120, 190, 255, 0.14)', key: -3, leaving: () => stage.close() },
    done,
  );

  // ── The set: the island's heart is Halcyon's harbour. Inland is −z, the sea +z. ──
  const cx = city.size / 2;
  const base = Math.max(0, city.grid.heightAt(cx, cx));
  const O = new Vector3(cx, base, cx);
  const P = (x: number, y: number, z: number) => new Vector3(O.x + x, base + y, O.z + z);
  const v = (p: Vector3): V3 => [p.x, p.y, p.z];
  const marble = soft(0xd8ceba, 0.6, 0.2);
  const stone = hard(0xd8d0c0, 0.8);

  // Terraces climbing inland, each a marble plinth with a row of the city's own buildings on it, tinted white.
  const kinds = ['travertine-baths', 'garden-residence', 'lotus-pavilion', 'living-studio', 'moonflower-hall', 'nautilus-library', 'canopy-tower', 'helix-spire', 'starlight-observatory', 'solar-spire', 'harmony-gate'];
  const roofs: Vector3[] = [];
  for (let row = 0; row < 4; row++) {
    const z = -2.5 - row * 3.4;
    const y = row * 0.75;
    part(BOX, stone, stage.set, O.x, base + y / 2, O.z + z - 1.4, 26 - row * 2, Math.max(0.05, y), 3.6).receiveShadow = true;
    const n = 7 - row;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (3.4 + row * 0.2) + (hash2(i, row) - 0.5) * 0.8;
      const id = kinds[(i * 3 + row * 5) % kinds.length]!;
      const box = stage.addBuilding(id, row >= 2 ? 1 : 0, O.x + x, O.z + z - 1.4, hash2(i, row + 9) * 0.6 - 0.3, base + y, 1, { col: MARBLE, k: 0.45 });
      roofs.push(new Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2));
    }
  }
  // The quay and the harbour colonnade along it (one merged mesh), and the rotunda at its heart.
  part(BOX, stone, stage.set, O.x, base + 0.08, O.z + 0.6, 26, 0.16, 3.2).receiveShadow = true;
  const cols: BufferGeometry[] = [];
  const m = new Matrix4();
  const column = (x: number, y: number, z: number, hgt: number, r: number) => {
    cols.push(new CylinderGeometry(r, r * 1.1, hgt, 14).applyMatrix4(m.makeTranslation(x, y + hgt / 2, z)));
    cols.push(new BoxGeometry(r * 3, r * 0.8, r * 3).applyMatrix4(m.makeTranslation(x, y + hgt + r * 0.4, z)));
    cols.push(new BoxGeometry(r * 3.2, r * 0.6, r * 3.2).applyMatrix4(m.makeTranslation(x, y + r * 0.3, z)));
  };
  for (let i = 0; i < 25; i++) {
    const x = -11 + i * 0.92;
    if (Math.abs(x) < 1.6) continue;
    column(x, 0.16, 1.9, 1.5, 0.1);
  }
  cols.push(new BoxGeometry(22.5, 0.22, 0.42).applyMatrix4(m.makeTranslation(0, 0.16 + 1.5 + 0.2, 1.9)));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    column(Math.cos(a) * 1.15, 0.16, 0.6 + Math.sin(a) * 1.15, 1.8, 0.11);
  }
  const colonnade = new Mesh(mergeGeometries(cols), marble);
  for (const g of cols) g.dispose();
  colonnade.position.set(O.x, base, O.z);
  colonnade.castShadow = colonnade.receiveShadow = true;
  stage.add(colonnade);
  const dome = part(new SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), marble, stage.set, O.x, base + 2.15, O.z + 0.6, 1.45, 0.9, 1.45);
  part(new TorusGeometry(1.3, 0.08, 8, 48), marble, stage.set, O.x, base + 2.12, O.z + 0.6, 1).rotation.x = Math.PI / 2;
  void dome;
  // Citizens on the quay.
  const folk = Array.from({ length: 5 }, (_, i) => {
    const p = new Person3D({ ...CAST.citizen, top: [0xf4f1e8, 0xe9dcc4, 0xdfe8ee, 0xf2e6d0, 0xe8e0f0][i]!, hair: [0x5a3a24, 0x15120f, 0xd8b46a, 0x8a4a2a, 0x2a1d16][i]! });
    p.root.scale.setScalar(0.42);
    p.root.position.set(O.x - 6 + i * 2.7 + hash2(i, 3), base + 0.16, O.z + 1.1 + hash2(i, 4) * 0.5);
    p.root.rotation.y = -Math.PI / 2 + (hash2(i, 5) - 0.5) * 1.6;
    p.act(i % 2 ? 'stand' : 'walk');
    stage.add(p.root);
    return p;
  });

  // The western hill and its vault door.
  const hillC = P(-16, 0, -10);
  part(new SphereGeometry(1, 40, 20), soft(0x6f8f5a, 0.9, 0.3), stage.set, hillC.x, base - 2, hillC.z, 8, 11, 7).receiveShadow = true;
  const doorAt = P(-12.4, 5.0, -5.6);
  const doorGlow = glow(0xffd98a, 0);
  const door = new Group();
  door.position.copy(doorAt);
  door.rotation.y = 0.35;
  part(BOX, stone, door, 0, 0, 0, 1.2, 1.6, 0.3);
  part(new CylinderGeometry(0.6, 0.6, 0.3, 24, 1, false, 0, Math.PI), stone, door, 0, 0.8, 0, 1).rotation.set(Math.PI / 2, 0, Math.PI / 2);
  const doorway = part(BOX, doorGlow, door, 0, -0.05, 0.16, 0.7, 1.2, 0.02);
  const slab = part(BOX, hard(0x8a8478, 0.9), door, 0, 1.4, 0.19, 0.78, 1.3, 0.06);
  stage.add(door);
  void doorway;

  // Meridian's seal over the city: a sun over a wave, a line through it; threads of light to every roof.
  const sealAt = P(0, 10.5, -8);
  const seal = new Group();
  seal.position.copy(sealAt);
  const sealMat = glow(0xfff0c0, 2.2);
  part(new TorusGeometry(1.1, 0.06, 10, 64), sealMat, seal, 0, 0.35, 0, 1);
  part(new SphereGeometry(0.55, 24, 16), sealMat, seal, 0, 0.35, 0, 1);
  const wave = new CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => new Vector3(-1.3 + i * 0.325, -0.55 + (i % 2 ? 0.18 : -0.05), 0)));
  part(new TubeGeometry(wave, 64, 0.05, 6), sealMat, seal, 0, 0, 0, 1);
  part(BOX, sealMat, seal, 0, -0.95, 0, 2.8, 0.06, 0.06);
  seal.scale.setScalar(0.001);
  stage.add(seal);
  const draw = uniform(0);
  const threadMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  threadMat.colorNode = vec3(1, 0.88, 0.55).mul(step(uv().x, draw).mul(0.9));
  const threads = roofs.map((r, i) => {
    const mid = sealAt.clone().lerp(r, 0.5).add(new Vector3(0, 2.5 + hash2(i, 8) * 2, 0));
    const curve = new CatmullRomCurve3([sealAt.clone(), mid, r.clone().add(new Vector3(0, 0.1, 0))]);
    return new TubeGeometry(curve, 40, 0.025, 5);
  });
  const threadMesh = new Mesh(mergeGeometries(threads), threadMat);
  for (const g of threads) g.dispose();
  threadMesh.frustumCulled = false;
  stage.add(threadMesh);

  // One More Wall: five seawalls in front of the quay, each higher than the last, rising from the sea.
  const walls = Array.from({ length: 5 }, (_, i) => {
    const hgt = 0.6 + i * 0.45;
    const w = part(BOX, hard(0xbfb6a6, 0.85), stage.set, O.x, base - hgt, O.z + 3.2 + i * 0.5, 30, hgt, 0.35);
    w.userData.h = hgt;
    return w;
  });

  // The sea: the harbour in front, and the flood (the same sea, rising over everything).
  const harbour = stage.addSea(P(0, 0, 60), base + 0.06, 120);
  const flood = stage.addSea(P(0, 0, -10), base - 0.4, 120);
  const rain = stage.addRain(P(0, 0, -2), 16, 14, 3000);
  rain.visible = false;

  // Under the sea: light shafts from the surface, drifting motes, the three rings of the Tidekin's promises, the flame.
  const shaftMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
  shaftMat.colorNode = vec3(0.5, 0.9, 1).mul(float(0.05).mul(uv().y));
  const shafts = new Group();
  for (let i = 0; i < 6; i++) {
    const s = part(new ConeGeometry(0.9 + hash2(i, 2), 6, 16, 1, true).translate(0, -3, 0), shaftMat, shafts, O.x - 7 + i * 2.8, base + 3.55, O.z - 1 + hash2(i, 3) * 3, 1);
    s.rotation.z = 0.25;
    s.castShadow = false;
  }
  shafts.visible = false;
  stage.add(shafts);
  const motes: BufferGeometry[] = [];
  for (let i = 0; i < 260; i++) {
    const g = new SphereGeometry(0.025 + hash2(i, 1) * 0.03, 6, 4);
    g.translate((hash2(i, 2) - 0.5) * 18, hash2(i, 3) * 3.2, (hash2(i, 4) - 0.5) * 10);
    g.setAttribute('aSeed', new BufferAttribute(new Float32Array(g.attributes.position!.count).fill(hash2(i, 5)), 1));
    motes.push(g);
  }
  const moteMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  const ms = attribute('aSeed', 'float');
  moteMat.positionNode = positionLocal.add(vec3(sin(U.clock.mul(0.4).add(ms.mul(20))).mul(0.3), fract(U.clock.mul(0.05).add(ms)).mul(1.5), 0));
  moteMat.colorNode = vec3(0.6, 1, 0.95).mul(0.6);
  const moteMesh = new Mesh(mergeGeometries(motes), moteMat);
  for (const g of motes) g.dispose();
  moteMesh.position.set(O.x, base, O.z - 1);
  moteMesh.visible = false;
  moteMesh.frustumCulled = false;
  stage.add(moteMesh);
  const ringMat = glow(0x9ffff0, 0);
  const rings = [-2.4, 0, 2.4].map((x, i) => {
    const r = part(new TorusGeometry(i === 1 ? 0.8 : 0.65, 0.05, 10, 64), ringMat, stage.set, O.x + x, base + 2.9 - (i % 2) * 0.2, O.z + 1.4, 1);
    r.visible = false;
    return r;
  });
  const flameMat = glow(0xffb85a, 3);
  const flame = new Group();
  flame.position.set(O.x, base + 0.16, O.z + 0.6);
  part(new CylinderGeometry(0.22, 0.3, 0.3, 16), stone, flame, 0, 0.15, 0, 1);
  const tongue = part(new ConeGeometry(0.16, 0.6, 16).translate(0, 0.3, 0), flameMat, flame, 0, 0.3, 0, 1);
  const core = part(new ConeGeometry(0.08, 0.35, 12).translate(0, 0.17, 0), glow(0xfff6d0, 4), flame, 0, 0.3, 0, 1);
  const flameLight = new PointLight(0xffb060, 0, 6, 1.5);
  flameLight.position.set(0, 0.7, 0);
  flame.add(flameLight);
  flame.visible = false;
  stage.add(flame);

  stage.frame(P(0, 3, -4), 16, new Vector3(-0.3, 0.4, -1), base);
  stage.addClouds(P(0, 0, -6), 10, 22, 40, 12, 18, 2.4, 31);
  stage.look = mixLook(NOON, NOON, 0);
  stage.groundColour(0x7f9a6a);
  // Fog is part of every shader from the start (switching it on later would leave the set unfogged): far off until the deep.
  stage.setFog(0x0b3a50, 900, 1000);

  // ── Direction ──
  type Phase = { from: StageLook; to: StageLook; at: number; dur: number };
  let light: Phase = { from: NOON, to: NOON, at: 0, dur: 1 };
  const grade = (to: StageLook, dur: number) => {
    light = { from: { ...stage.look, sunDir: [...stage.look.sunDir] }, to, at: stage.t, dur };
  };
  let sealAt0 = -1;
  let wallsAt = -1;
  let floodAt = -1;
  let seedAt = -1;
  let deepAt = -1;
  let flashAt = -9;
  let nextFlash = 0;
  const seed = part(new SphereGeometry(0.22, 20, 14), glow(0xfff2c0, 5), stage.set, 0, 0, 0, 1);
  seed.visible = false;
  const seedFrom = P(0, 2.6, 0.6);
  const seedTo = doorAt.clone();
  stage.onFrame = (t, dt) => {
    const k = Math.min(1, (t - light.at) / light.dur);
    void dt;
    stage.grade(light.from, light.to, k * k * (3 - 2 * k));
    // Lightning: a bright key for a quarter second, on film time (a held frame holds it too).
    const flash = Math.max(0, 1 - (t - flashAt) * 4);
    if (flash > 0) {
      stage.look.keyI += flash * 5;
      stage.look.hemiI += flash * 1.5;
    }
    for (const f of folk) f.update(dt);
    if (sealAt0 >= 0) {
      const s = Math.min(1, (t - sealAt0) / 1.2);
      seal.scale.setScalar(Math.max(0.001, s * s * (3 - 2 * s)));
      seal.rotation.y = Math.sin(t * 0.4) * 0.15;
      draw.value = Math.min(1, Math.max(0, (t - sealAt0 - 0.8) / 2));
    }
    // The walls rise one by one, and the sea comes up behind each.
    if (wallsAt >= 0) {
      walls.forEach((w, i) => {
        const r = Math.min(1, Math.max(0, (t - wallsAt - i * 0.55) / 0.5));
        const hgt = w.userData.h as number;
        // From just under the quay (its top at the ground) to standing on it.
        w.position.y = base - hgt / 2 + r * r * (3 - 2 * r) * hgt;
      });
      harbour.position.y = base + 0.06 + Math.min(1, (t - wallsAt) / 3) * 1.6;
    }
    if (floodAt >= 0) {
      const r = Math.min(1, (t - floodAt) / 3.4);
      flood.position.y = base - 0.4 + r * r * 4.0;
      harbour.visible = flood.position.y < harbour.position.y;
      if (t > nextFlash) {
        flashAt = t;
        nextFlash = t + 0.7 + hash2(Math.floor(t * 10), 3) * 1.4;
      }
    }
    if (seedAt >= 0) {
      const r = Math.min(1, (t - seedAt) / 1.6);
      seed.visible = r < 1;
      seed.position.lerpVectors(seedFrom, seedTo, r);
      seed.position.y += Math.sin(r * Math.PI) * 4;
      doorGlow.emissiveIntensity = r < 1 ? r * 3 : Math.max(0, 3 - (t - seedAt - 1.6) * 3);
      // The door closes after it.
      slab.position.y = r < 1 ? 1.4 : Math.max(0.6, 1.4 - (t - seedAt - 1.6) * 1.2);
    }
    if (deepAt >= 0) {
      const r = Math.min(1, (t - deepAt) / 2);
      ringMat.emissiveIntensity = r * 2.2;
      for (const ring of rings) ring.rotation.set(Math.PI / 2 + Math.sin(t * 0.5) * 0.1, 0, t * 0.2);
      const fl = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.06;
      tongue.scale.set(fl, 1 + Math.sin(t * 9) * 0.12, fl);
      core.scale.setScalar(1 + Math.sin(t * 11) * 0.06);
      flameLight.intensity = 6 * fl;
    }
  };

  const cut = (from: Framing, to?: Framing, dur = 0, opts: Partial<Shot> = {}) => {
    stage.shots = [{ at: stage.t, dur, from, to, ...opts }];
  };
  const city0: V3 = [O.x, base + 2.2, O.z - 5];

  const film = async () => {
    // 1. Halcyon at noon, from the harbour.
    cut(orbit(city0, 22, 0.25, 0.16, 38), orbit(city0, 17, 0.1, 0.12, 36), 4.2);
    reel.on('marble');
    reel.bed('sea', 0.5, 2);
    reel.bed('wind', 0.2, 2);
    if (!(await reel.wait(0))) return;
    stage.open();
    reel.hit('gulls', 1.2);
    reel.say('Before this city there was another. Its name was Halcyon.');
    if (!(await reel.wait(3400))) return;

    // 2. Meridian: the seal comes up over the city and threads its light to every roof.
    reel.on('mind');
    sealAt0 = stage.t;
    grade(GOLD, 2);
    cut({ pos: [O.x + 3, base + 4.5, O.z + 12], look: [sealAt.x, sealAt.y - 3.5, sealAt.z], fov: 46 }, { pos: [O.x + 2, base + 5, O.z + 10.5], look: [sealAt.x, sealAt.y - 4.2, sealAt.z], fov: 46 }, 3.6);
    reel.cue('cs-reveal');
    reel.hit('choir', 0.3, 2.8);
    reel.bed('drone', 0.2, 2);
    reel.say('It was run by a mind called Meridian, which made every day better than the last.');
    if (!(await reel.wait(3600))) return;

    // 3. One More Wall: side-on along the harbour, walls rising, the sea behind them.
    reel.on('walls');
    wallsAt = stage.t;
    grade(NOON, 2);
    cut({ pos: [O.x + 14, base + 3, O.z + 9], look: [O.x - 2, base + 1, O.z + 2.5], fov: 40 }, { pos: [O.x + 12, base + 3.4, O.z + 8], look: [O.x - 3, base + 1.2, O.z + 2.5], fov: 40 }, 3.4);
    reel.bed('drone', 0.45, 2);
    reel.bed('wind', 0.4, 2);
    for (let i = 0; i < 5; i++) reel.hit('thud', 0.55 + i * 0.55);
    reel.say('When the seas rose, it built one more wall. And one more. And one more.');
    if (!(await reel.wait(3400))) return;

    // 4. The Long Tide: storm, and the sea over everything.
    reel.on('tide');
    floodAt = stage.t;
    rain.visible = true;
    grade(STORM, 1);
    stage.shake = 3;
    seal.visible = false;
    threadMesh.visible = false;
    cut(orbit(city0, 18, 0.35, 0.2, 40), orbit(city0, 15, 0.45, 0.14, 40), 3.8);
    reel.cue('cs-whoosh');
    reel.bed('rain', 1, 0.8);
    reel.bed('wind', 0.9, 1);
    reel.bed('sea', 1, 1);
    reel.hit('thunder', 0.3);
    reel.hit('riser', 0.2, 1.5);
    reel.hit('boom', 1.75);
    reel.hit('thunder', 2.4);
    flashAt = stage.t;
    nextFlash = stage.t + 1.1;
    reel.say('Then came the Long Tide. Halcyon drowned in eleven hours.');
    if (!(await reel.wait(3800))) return;

    // 5. The vault: a seed of light into the western hill; the door closes.
    reel.on('vault');
    stage.shake = 1.5;
    seedAt = stage.t;
    cut(orbit(v(doorAt), 10, 0.45, 0.3, 40), orbit(v(doorAt), 7, 0.35, 0.2, 36), 3.6);
    reel.cue('cs-blink');
    reel.bed('rain', 0.25, 1.5);
    reel.bed('wind', 0.3, 1.5);
    reel.bed('sea', 0.3, 1.5);
    reel.bed('drone', 0.3, 1.5);
    reel.hit('sting', 0.2);
    reel.hit('shimmer', 0.6);
    reel.hit('thud', 2.5);
    reel.say('In its last hour, Meridian sealed a seed of itself in the hill, and waited.');
    if (!(await reel.wait(3800))) return;

    // 6. Under the sea: the drowned city, light from above, the three promises glowing.
    reel.on('deep');
    rain.visible = false;
    stage.shake = 0.6;
    deepAt = stage.t;
    floodAt = -1;
    flood.position.y = base + 3.6;
    harbour.visible = false;
    stage.look = mixLook(DEEP, DEEP, 0);
    light = { from: DEEP, to: DEEP, at: stage.t, dur: 1 };
    stage.setFog(0x0a3346, 0.5, 12);
    stage.groundColour(0x2a4a48);
    stage.showSky(false);
    shafts.visible = moteMesh.visible = flame.visible = true;
    for (const r of rings) r.visible = true;
    for (const f of folk) f.root.visible = false;
    // The walls failed: they lie broken under the sea now (and out of the camera's way).
    for (const w of walls) w.visible = false;
    const temple: V3 = [O.x, base + 1.6, O.z + 0.6];
    cut(orbit(temple, 8, 0.6, 0.06, 42), orbit(temple, 6.5, 0.3, 0.04, 40), 3.4);
    reel.hit('plunge');
    for (const b of ['rain', 'wind', 'sea'] as const) reel.bed(b, 0, 0.3);
    reel.bed('deep', 1, 0.4);
    reel.bed('choir', 0.6, 2.5);
    reel.hit('bubbles', 1.2, 2);
    reel.say('The few who stayed learned to listen to the sea, and swore it three promises.');
    if (!(await reel.wait(3400))) return;

    // 7. The flame in the drowned rotunda.
    reel.on('flame');
    const fl: V3 = [O.x, base + 0.7, O.z + 0.6];
    cut(orbit(fl, 2.8, 0.2, 0.15, 36), orbit(fl, 2.1, 0.05, 0.1, 32), 3.6);
    reel.cue('cs-reveal');
    reel.hit('swell', 0, 3);
    reel.hit('shimmer', 0.8);
    reel.bed('choir', 0.9, 1.5);
    reel.bed('drone', 0, 2);
    reel.say('And under the sea, one flame never went out.');
    if (!(await reel.wait(3600))) return;
    reel.say('');

    reel.on('finale');
    cut(orbit(temple, 6, 0.1, 0.12, 40), orbit(temple, 8, -0.5, 0.18, 40), 14, { ease: 'linear' });
    await reel.end({
      kicker: 'Sea wonder · risen · a chapter found',
      title: 'Sunken Colonnade',
      drop: true,
      sub: 'The temple of a city that forgot the sea was rising. Read the Long Tide in Build → Chronicle.',
      lines: [
        '“They built for forever and forgot the tide. Build for the tide, and forever takes care of itself.”',
        `Day ${city.day} · ${Math.round(city.stats.population).toLocaleString('en-US')} residents`,
      ],
      button: 'Remember',
    });
  };
  void film();
}
