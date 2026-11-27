import {
  Box3,
  Quaternion,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  NormalBlending,
  Sphere,
  Vector3,
} from 'three/webgpu';
import { abs, attribute, cameraPosition, color, cross, float, fract, fwidth, length, max, min, mix, mrt, normalize, positionGeometry, sin, smoothstep, step, texture, uniform, uv, vec3, vec4 } from 'three/tsl';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { registerPickable } from '@/modules/construction/pick';
import { isOpen } from '@/sim/growthState';
import { JET, JET_PART, jetGeometry, liveryTexture } from './jetModel';
import { lapLength, patrolAt, patrolNode } from './flight';
import { JetPilot, type StickInput } from './pilot';
import { createPilotHud } from './pilotHud';
import { bloomMRT } from '@/render/bloomMRT';

/**
 * The BloomGrid Sky Guard (D-141): a sci-fi delta-wing interceptor on three engines, in pearl, navy and sea-green
 * with the Sky Guard emblem and name on its wings, belly and fins, flying sharp patrol passes over the island: a
 * figure-eight whose ends tighten into steep banked reversals, climbing and diving as it goes, with a victory roll at
 * every crossing of the centre. Contrails stream from the three engines.
 *
 * Click it (the box is generous: it is fast) for its inspector: speed, altitude, heading and load, **Chase cam** (an
 * explore ride behind it), **Victory roll**, **Afterburner** (a burst of speed, flames out) and **Display smoke**
 * (sea-green, white and gold trails). Render-only: no sim state, nothing saved.
 *
 * The jet is one mesh posed by its object matrix each frame from `flight.ts`; the contrails are one mesh drawn in
 * the shader from the same curve at earlier phases (no uploads). Two draw calls.
 */

/** Mean cruising speed (tiles/s; 1 tile ≈ 11 m, so 50 ≈ Mach 1.6), the afterburner's factor and how long it lasts. */
const SPEED = 50;
const BURN = 1.75;
const BURN_SECONDS = 10;
/** Bank: the lift turns toward the turn as atan(lateral acceleration / G), up to `MAX_BANK`. */
const G = 26;
const MAX_BANK = 1.35;
/** A victory roll takes this long; one rolls in at each pass over the centre. */
const ROLL = 1.8;
/** Contrail length (tiles) and segments per trail. */
const TRAIL = 70;
const SEG = 64;
/** Within this distance of the camera a pass is heard (audio). */
const EAR = 110;

export interface SkyGuardService {
  /** The chase camera: eye behind and above, a point ahead (explore mode `jet`). */
  ride(eye: Vector3, ahead: Vector3): boolean;
  /** Whether the jet flies (a fresh island earns it with the Sky Guard air wing, D-144). */
  readonly active: boolean;
  readonly position: Readonly<Vector3>;
  inspect(): void;
  roll(): void;
  afterburner(): void;
  smoke(on?: boolean): void;
  /**
   * The player takes the controls (explore mode `pilot`, D-233): the jet leaves its patrol and follows `fly`; off,
   * it glides back onto the patrol.
   */
  pilot(on: boolean): void;
  readonly piloting: boolean;
  /**
   * One step of piloted flight: the stick, the top of whatever is under a point, the view (`cockpit` or chase); writes
   * the camera's eye, a point ahead and its up into the vectors given.
   */
  fly(dt: number, stick: StickInput, floor: (x: number, z: number) => number, cockpit: boolean, eye: Vector3, ahead: Vector3, up: Vector3): void;
}

declare module '@/core/Services' {
  interface GameServices {
    skyguard: SkyGuardService;
  }
}
declare module '@/core/EventBus' {
  interface GameEvents {
    /** The jet roars past the camera (audio); `burner` when the afterburner is lit. */
    'skyguard:pass': { x: number; z: number; burner: boolean };
  }
}

export const skyguardModule: GameModule = {
  id: 'skyguard',
  deps: ['world', 'construction', 'hud'],
  init(ctx) {
    const { bus } = ctx;
    const burner = uniform(0);
    const smokeOn = uniform(0);
    const phaseU = uniform(0);
    const spanU = uniform(0.2);

    // ── The jet ──────────────────────────────────────────────────────────────────────────────────────────────
    const livery = liveryTexture();
    const mat = new MeshStandardNodeMaterial({ roughness: 0.32, metalness: 0.35, side: DoubleSide });
    {
      const partId = attribute('aPart', 'float');
      const is = (id: number) => step(abs(partId.sub(id)), 0.5);
      const p = positionGeometry;
      // Flames stretch from their nozzle with the throttle and flicker.
      const hub = attribute('aHub', 'vec3');
      const flick = sin(U.clock.mul(47).add(hub.z.mul(9)))
        .mul(0.12)
        .add(sin(U.clock.mul(29).add(hub.z.mul(3))).mul(0.08));
      const len = burner.mul(1.7).add(1).add(flick);
      const flame = is(JET_PART.flame);
      const stretched = hub.add(p.sub(hub).mul(vec3(len, burner.mul(0.25).add(1), burner.mul(0.25).add(1))));
      mat.positionNode = mix(p, stretched, flame);
      const tex = texture(livery, uv()).rgb;
      const textured = is(JET_PART.top).add(is(JET_PART.belly)).add(is(JET_PART.finOut));
      let col = tex.mul(textured);
      col = col.add(color(0x3a4250).mul(is(JET_PART.metal)));
      col = col.add(color(0x6b5320).mul(is(JET_PART.canopy)));
      col = col.add(color(0x19c39a).mul(is(JET_PART.edge)));
      col = col.add(color(0x9ff6ff).mul(is(JET_PART.nozzle).add(flame)));
      col = col.add(color(0xff2a3d).mul(is(JET_PART.navRed)));
      col = col.add(color(0x2bff8a).mul(is(JET_PART.navGreen)));
      col = col.add(color(0xffffff).mul(is(JET_PART.strobe)));
      mat.colorNode = col;
      const night = U.night;
      // Lights under a few pixels dim to their share of a pixel (D-064); the strobes double-flash.
      const cover = min(float(1), float(0.04).div(max(length(fwidth(p)), float(1e-5))));
      const beat = fract(U.clock.mul(0.9));
      const strobe = step(beat, 0.05).add(step(0.12, beat).mul(step(beat, 0.17)));
      const hot = mix(color(0x8ff6ff), color(0xff8a3d), burner);
      const glow = color(0x2bffc0)
        .mul(is(JET_PART.edge).mul(night.mul(1.4).add(0.35)))
        .add(hot.mul(is(JET_PART.nozzle).mul(2.4)))
        .add(mix(color(0x6fe9ff), color(0xff7a3a), burner).mul(flame.mul(burner.mul(1.5).add(1.6))))
        .add(color(0xff2a3d).mul(is(JET_PART.navRed).mul(night.mul(2).add(0.5))))
        .add(color(0x2bff8a).mul(is(JET_PART.navGreen).mul(night.mul(2).add(0.5))))
        .add(color(0xffffff).mul(is(JET_PART.strobe).mul(strobe).mul(3)))
        .add(color(0x5ff4ff).mul(is(JET_PART.canopy).mul(night.mul(0.35))))
        .add(tex.mul(textured).mul(night.mul(0.18)));
      mat.emissiveNode = glow.mul(cover.mul(0.5).add(0.5));
    }
    const jetGeo = jetGeometry();
    // Room for the flames at full stretch: the jet is culled like any mesh when out of view.
    jetGeo.boundingSphere = new Sphere(new Vector3(-0.5, 0.3, 0), 7);
    const jet = new Mesh(jetGeo, mat);
    jet.name = 'skyguard.jet';
    jet.castShadow = jet.receiveShadow = false;
    jet.matrixAutoUpdate = false;
    // The model gallery: the jet parked on the stage (its material poses only the flames, in its own frame).
    ctx.services.tryGet('gallery')?.add({
      id: 'jet',
      name: 'BloomGrid Sky Guard',
      group: 'Sky & sea',
      blurb:
        'A three-engine delta-wing jet in the island\'s livery, flying sharp banked figure-eights over the city with victory rolls, contrails and an afterburner on request.',
      facts: [['Engines', '3'], ['Unlocked by', 'Sky Guard air wing']],
      build: () => {
        const m = new Mesh(jetGeo, mat);
        m.castShadow = m.receiveShadow = true;
        return { object: m };
      },
    });

    // ── Contrails: three ribbons, one per engine, along the track the jet has just flown ─────────────────────
    const trailGeo = new BufferGeometry();
    {
      const a: number[] = [];
      const pos: number[] = [];
      for (let e = 0; e < 3; e++)
        for (let k = 0; k < SEG; k++)
          for (const [kk, sd] of [
            [k, -1],
            [k + 1, -1],
            [k, 1],
            [k + 1, -1],
            [k + 1, 1],
            [k, 1],
          ] as const) {
            a.push(kk / SEG, sd, e);
            pos.push(0, 0, 0);
          }
      trailGeo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      trailGeo.setAttribute('aTrail', new BufferAttribute(new Float32Array(a), 3));
    }
    const trailMat = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      side: DoubleSide,
    });
    {
      const tr = attribute('aTrail', 'vec3');
      const s = tr.x;
      const th = phaseU.sub(s.mul(spanU));
      const P = patrolNode(th);
      const T = normalize(patrolNode(th.add(0.002)).sub(P));
      const R = normalize(cross(T, vec3(0, 1, 0)));
      const off = tr.z.sub(1).mul(JET.engines[2]);
      const base = P.add(R.mul(off)).sub(T.mul(-JET.nozzleX));
      const side = normalize(cross(T, normalize(cameraPosition.sub(base))));
      const width = mix(float(0.12), float(1.5), s).mul(smokeOn.mul(0.8).add(1));
      trailMat.positionNode = base.add(side.mul(tr.y.mul(width)));
      const soft = float(1).sub(tr.y.mul(tr.y));
      const fade = float(1)
        .sub(s)
        .pow(1.4)
        .mul(smoothstep(0, 0.025, s));
      const op = soft
        .mul(fade)
        .mul(mix(float(0.22), float(0.62), smokeOn))
        .min(1);
      const display = mix(
        mix(color(0x19c39a), color(0xffffff), step(0.5, tr.z)),
        color(0xf2c14e),
        step(1.5, tr.z),
      );
      trailMat.colorNode = mix(color(0xf4f8fb), display, smokeOn);
      trailMat.opacityNode = op;
      bloomMRT(trailMat, mrt({ emissive: vec4(0, 0, 0, op) }));
    }
    // The trails are drawn in the shader: their bounds are a ball round the jet as long as the trail (moved each frame).
    trailGeo.boundingSphere = new Sphere(new Vector3(), TRAIL + 8);
    const trails = new Mesh(trailGeo, trailMat);
    trails.name = 'skyguard.trails';
    trails.renderOrder = 8;
    ctx.scene.add(jet, trails);
    // ── Piloted flight (D-233): the flight model, its contrail and the HUD ─────────────────────────────────────
    const S = ctx.city.size;
    const pilot = new JetPilot([S / 2, S / 2]);
    let piloting = false;
    let cockpitView = false;
    /** Gliding back onto the patrol after the player lets go: seconds left, and where the jet was. */
    let rejoin = 0;
    const REJOIN = 3;
    const fromPos = new Vector3();
    const fromQ = new Quaternion();
    const toQ = new Quaternion();
    const hudEl = createPilotHud(ctx.city.grid);
    // A body-level layer: the city HUD (#hud) hides its panels in explore modes.
    document.body.append(hudEl.el);
    // The patrol's contrails follow the patrol curve in the shader; while piloted the jet leaves a contrail of its
    // own: a ribbon through its last positions, written on the CPU (a few KB a frame, only while piloted).
    const PT = 48;
    const ptPos = new Float32Array(PT * 6 * 3);
    const ptAge = new Float32Array(PT * 6 * 2);
    const ptGeo = new BufferGeometry();
    ptGeo.setAttribute('position', new BufferAttribute(ptPos, 3));
    ptGeo.setAttribute('aRib', new BufferAttribute(ptAge, 2));
    ptGeo.boundingSphere = new Sphere(new Vector3(), 200);
    const ptMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending, side: DoubleSide });
    {
      const r = attribute('aRib', 'vec2');
      const op = float(1)
        .sub(r.y.mul(r.y))
        .mul(float(1).sub(r.x).pow(1.4))
        .mul(mix(float(0.3), float(0.65), smokeOn));
      ptMat.colorNode = mix(color(0xf4f8fb), color(0x19c39a), smokeOn);
      ptMat.opacityNode = op;
      bloomMRT(ptMat, mrt({ emissive: vec4(0, 0, 0, op) }));
    }
    const pilotTrail = new Mesh(ptGeo, ptMat);
    pilotTrail.name = 'skyguard.pilotTrail';
    pilotTrail.renderOrder = 8;
    pilotTrail.visible = false;
    ctx.scene.add(pilotTrail);
    const hist: Vector3[] = Array.from({ length: PT + 1 }, () => new Vector3());
    let histAt = 0;
    const camSide = new Vector3();
    const segDir = new Vector3();
    const toCam = new Vector3();
    const writeTrail = (cam: Vector3) => {
      let o = 0;
      let a = 0;
      for (let k = 0; k < PT; k++) {
        const p0 = hist[k]!;
        const p1 = hist[k + 1]!;
        segDir.subVectors(p0, p1);
        if (segDir.lengthSq() < 1e-6) segDir.copy(fwd);
        const w0 = 0.25 + (k / PT) * 1.6;
        const w1 = 0.25 + ((k + 1) / PT) * 1.6;
        camSide.crossVectors(segDir, toCam.subVectors(cam, p0)).normalize();
        const v = (p: Vector3, w: number, side: number, age: number) => {
          ptPos[o++] = p.x + camSide.x * w * side;
          ptPos[o++] = p.y + camSide.y * w * side;
          ptPos[o++] = p.z + camSide.z * w * side;
          ptAge[a++] = age;
          ptAge[a++] = side;
        };
        const [t0, t1] = [k / PT, (k + 1) / PT];
        v(p0, w0, -1, t0);
        v(p1, w1, -1, t1);
        v(p0, w0, 1, t0);
        v(p1, w1, -1, t1);
        v(p1, w1, 1, t1);
        v(p0, w0, 1, t0);
      }
      ptGeo.attributes.position!.needsUpdate = true;
      ptGeo.attributes.aRib!.needsUpdate = true;
      ptGeo.boundingSphere!.center.copy(hist[0]!);
    };

    registerPickable({
      object: 'skyguard',
      node: jet,
      box: new Box3(new Vector3(JET.tail - 0.3, -0.4, -JET.span), new Vector3(JET.nose, 1.3, JET.span)),
      pad: 2.5,
    });

    // ── Flight ───────────────────────────────────────────────────────────────────────────────────────────────
    const lap = lapLength();
    const omega = (Math.PI * 2 * SPEED) / lap;
    spanU.value = (TRAIL / lap) * Math.PI * 2;
    let phase = 1.2;
    let burnUntil = -1;
    let rollAt = -10;
    let lastCross = 0;
    let bank = 0;
    let speed = SPEED;
    let heard = 0;
    let smoke = false;
    const pos = new Vector3();
    const prev = new Vector3();
    const next = new Vector3();
    const fwd = new Vector3();
    const up = new Vector3();
    const right = new Vector3();
    const acc = new Vector3();
    const basis = new Matrix4();
    const WORLD_UP = new Vector3(0, 1, 0);
    /** Poses the jet at `pos` along `fwd`, its lift turned toward the right by `roll`. */
    const pose = (roll: number) => {
      right.crossVectors(fwd, WORLD_UP).normalize();
      up.crossVectors(right, fwd);
      // Turn the lift toward +right by the roll angle.
      const [cr, sr] = [Math.cos(roll), Math.sin(roll)];
      const ux = up.x * cr + right.x * sr;
      const uy = up.y * cr + right.y * sr;
      const uz = up.z * cr + right.z * sr;
      right.set(right.x * cr - up.x * sr, right.y * cr - up.y * sr, right.z * cr - up.z * sr);
      up.set(ux, uy, uz);
      basis.makeBasis(fwd, up, right).setPosition(pos);
      jet.matrix.copy(basis);
      jet.matrixWorldNeedsUpdate = true;
    };
    ctx.systems.add({
      id: 'skyguard.fly',
      phase: 'sync',
      update(c, f) {
        // A fresh island earns the jet with the Sky Guard air wing project (D-144).
        const on = isOpen(ctx.city.growth, 'skyguard') && (ctx.services.tryGet('timelapse')?.shows('skyguard') ?? true);
        jet.visible = trails.visible = on;
        if (!on) return;
        const dt = Math.min(0.1, f.dt);
        const t = U.clock.value;
        pilotTrail.visible = piloting;
        trails.visible = !piloting && rejoin <= 0;
        if (piloting) {
          // The pose comes from the flight model (`fly`, run by the explore mode before this).
          burner.value = pilot.burner;
          pos.copy(pilot.pos);
          fwd.copy(pilot.fwd);
          speed = pilot.speed;
          bank = pilot.bank;
          const k = Math.min(1, Math.max(0, (t - rollAt) / ROLL));
          pose(bank + Math.PI * 2 * k * k * (3 - 2 * k));
          jet.visible = !cockpitView;
          // The contrail: a sample every ~1.5 tiles of flight.
          if (pos.distanceTo(hist[0]!) > 1.5 || ++histAt > 30) {
            histAt = 0;
            for (let i = PT; i > 0; i--) hist[i]!.copy(hist[i - 1]!);
          }
          hist[0]!.copy(pos).addScaledVector(fwd, JET.nozzleX);
          writeTrail(c.camera.position);
          hudEl.update(pilot, (c.camera as { fov?: number }).fov ?? 50, { smoke, cockpit: cockpitView });
          return;
        }
        burner.value += ((t < burnUntil ? 1 : 0) - burner.value) * Math.min(1, dt * 2.5);
        const rate = omega * (1 + (BURN - 1) * burner.value);
        phase += rate * dt;
        if (phase > Math.PI * 2) phase -= Math.PI * 2;
        phaseU.value = phase;
        // A victory roll over the centre (phase 0 and π), never two at once.
        const half = Math.floor(phase / Math.PI);
        if (half !== lastCross) {
          lastCross = half;
          if (t - rollAt > ROLL * 3) rollAt = t;
        }
        const e = 0.01;
        patrolAt(phase, pos);
        patrolAt(phase - e, prev);
        patrolAt(phase + e, next);
        fwd.subVectors(next, prev).normalize();
        // Lateral acceleration (tiles/s²) from the curve, for the bank.
        const step = e / rate;
        acc
          .copy(next)
          .add(prev)
          .addScaledVector(pos, -2)
          .divideScalar(step * step);
        speed = next.distanceTo(prev) / (2 * step);
        right.crossVectors(fwd, WORLD_UP).normalize();
        const want = Math.max(-MAX_BANK, Math.min(MAX_BANK, Math.atan2(acc.dot(right), G)));
        bank += (want - bank) * Math.min(1, dt * 3);
        const k = Math.min(1, Math.max(0, (t - rollAt) / ROLL));
        const roll = bank + Math.PI * 2 * k * k * (3 - 2 * k);
        pose(roll);
        // Back onto the patrol after the player let go: from where they left it, over a few seconds.
        if (rejoin > 0) {
          rejoin = Math.max(0, rejoin - dt);
          const k = 1 - rejoin / REJOIN;
          const e = k * k * (3 - 2 * k);
          toQ.setFromRotationMatrix(basis);
          basis.makeRotationFromQuaternion(fromQ.clone().slerp(toQ, e));
          pos.lerpVectors(fromPos, pos, e);
          basis.setPosition(pos);
          jet.matrix.copy(basis);
        }
        trailGeo.boundingSphere!.center.copy(pos);
        // A roar as it passes the camera.
        const d = c.camera.position.distanceTo(pos);
        if (d < EAR && t > heard) {
          heard = t + 6;
          bus.emit('skyguard:pass', { x: pos.x, z: pos.z, burner: burner.value > 0.5 });
        }
      },
    });

    // ── Inspector (D-141) ───────────────────────────────────────────────────────────────────────────────────
    const rollNow = () => {
      rollAt = U.clock.value;
      bus.emit('toast', { text: 'Sky Guard: victory roll!', tone: 'info' });
    };
    const afterburner = () => {
      burnUntil = U.clock.value + BURN_SECONDS;
      bus.emit('skyguard:pass', { x: pos.x, z: pos.z, burner: true });
      bus.emit('toast', { text: 'Sky Guard: afterburners lit', tone: 'info' });
    };
    const setSmoke = (on = !smoke) => {
      smoke = on;
      smokeOn.value = on ? 1 : 0;
      bus.emit('toast', {
        text: on ? 'Sky Guard: display smoke on (sea-green, white, gold)' : 'Sky Guard: display smoke off',
        tone: 'info',
      });
    };
    const btn = (glyph: string, label: string, title: string, run: () => void, on = false) =>
      h(
        'button',
        { class: `tool ${on ? 'on' : ''}`, title, onClick: run },
        h('span', { class: 'g' }, icon(glyph)),
        label,
      );
    ctx.services.get('hud').objectInspector('skyguard', () => {
      const deg = Math.round(((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360);
      const g = 1 / Math.max(0.2, Math.cos(Math.min(MAX_BANK, Math.abs(bank))));
      const area = ctx.city.districtAt(Math.floor(pos.x), Math.floor(pos.z));
      return {
        glyph: 'jet',
        code: 'SKY GUARD · SG-01',
        place: area ? `Over ${area}` : 'Over the island',
        title: 'BloomGrid Sky Guard',
        desc: 'The island’s sky guard: a delta-wing interceptor on three bloom-fusion engines, flying sharp patrol passes over the city, rolling at every crossing.',
        vitals: [
          ['fast', 'Speed', `Mach ${((speed * 11) / 343).toFixed(1)}`, burner.value > 0.5 ? 'good' : ''],
          ['up', 'Altitude', `${Math.round(pos.y * 11).toLocaleString()} m`],
          ['locate', 'Heading', `${String(deg).padStart(3, '0')}°`],
          ['pulse', 'Load', `${g.toFixed(1)} g`],
        ],
        rows: [
          ['Callsign', 'Bloom One'],
          ['Airframe', 'Delta, three engines'],
          ['Patrol lap', `${Math.round(lap / SPEED)} s figure-eight`],
          ['Display smoke', smoke ? 'On' : 'Off'],
        ],
        actions: [
          btn('jet', 'Chase cam', 'Fly behind the jet (Esc back)', () =>
            ctx.services.get('explore').setMode('jet'),
          ),
          btn('jet', 'Pilot', 'Take the controls yourself: WASD fly, E/Q throttle, Shift afterburner, V cockpit (Esc back)', () =>
            ctx.services.get('explore').setMode('pilot'),
          ),
          btn('rotate', 'Victory roll', 'A full roll on the next heartbeat', rollNow),
          btn(
            'fire',
            'Afterburner',
            'Light the afterburners for ten seconds',
            afterburner,
            burner.value > 0.5,
          ),
          btn('wave', 'Display smoke', 'Trail sea-green, white and gold smoke', () => setSmoke(), smoke),
        ],
      };
    });

    const ride = (eye: Vector3, ahead: Vector3) => {
      if (!jet.visible) return false;
      // Behind and a little above, along the flight path (not the roll), the jet low in the frame.
      eye.copy(pos).addScaledVector(fwd, -15).addScaledVector(WORLD_UP, 3.4);
      ahead.copy(pos).addScaledVector(fwd, 8);
      return true;
    };
    ctx.services.provide('skyguard', {
      ride,
      get active() {
        return isOpen(ctx.city.growth, 'skyguard');
      },
      position: pos,
      inspect: () => bus.emit('selection:changed', { eid: null, object: 'skyguard' }),
      roll: rollNow,
      afterburner,
      smoke: setSmoke,
      get piloting() {
        return piloting;
      },
      pilot(on) {
        if (on === piloting) return;
        piloting = on;
        hudEl.show(on);
        document.body.classList.toggle('piloting', on);
        if (on) {
          pilot.start(pos, fwd);
          for (const p of hist) p.copy(pos);
          bus.emit('toast', { text: 'You have the controls: Bloom One is yours', tone: 'info' });
          return;
        }
        // Rejoin the patrol at the phase nearest where the player left the jet, gliding there.
        let best = Infinity;
        const probe = new Vector3();
        for (let i = 0; i < 512; i++) {
          const ph = (i / 512) * Math.PI * 2;
          const d = patrolAt(ph, probe).distanceToSquared(pos);
          if (d < best) [best, phase] = [d, ph];
        }
        fromPos.copy(pos);
        fromQ.setFromRotationMatrix(jet.matrix);
        rejoin = REJOIN;
        cockpitView = false;
        jet.visible = true;
      },
      fly(dt, stick, floor, cockpit, eye, ahead, camUp) {
        if (!piloting) return;
        cockpitView = cockpit;
        pilot.step(dt, stick, floor);
        const p = pilot.pos;
        if (cockpit) {
          // In the canopy, the nose ahead; the view rolls with the jet.
          eye.copy(p).addScaledVector(pilot.fwd, 1.5).addScaledVector(pilot.up, 0.62);
          ahead.copy(eye).addScaledVector(pilot.fwd, 20);
          camUp.copy(pilot.up);
        } else {
          // Behind and above along the flight path; the view leans into the bank (part of it: all of it is dizzying).
          eye.copy(p).addScaledVector(pilot.fwd, -16).addScaledVector(pilot.up, 3.6);
          ahead.copy(p).addScaledVector(pilot.fwd, 10);
          camUp.copy(WORLD_UP).lerp(pilot.up, 0.45).normalize();
        }
      },
    });
    // Space rolls and X toggles smoke while piloting (the explore mode passes the stick; these are taps).
    ctx.input.onKey((e) => {
      if (!piloting || e.metaKey || e.ctrlKey) return false;
      if (e.code === 'Space') return rollNow(), true;
      if (e.code === 'KeyX') return setSmoke(), true;
      return false;
    }, 1);
  },
};
