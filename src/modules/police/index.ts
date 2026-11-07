import {
  CylinderGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  NormalBlending,
  Vector3,
  type Node,
} from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  color,
  cos,
  dot,
  float,
  fract,
  fwidth,
  length,
  max,
  min,
  mix,
  mrt,
  normalGeometry,
  normalize,
  positionGeometry,
  sign,
  sin,
  smoothstep,
  step,
  transformNormalToView,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { Building } from '@/ecs/components';
import { DRONE_PAD } from '@/content/buildings/harmony-gate';
import { POLICE_PADS } from '@/content/buildings/aegis-precinct';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';
import { DRONE_PART, droneGeometry } from './droneModel';

/**
 * Police drones (D-137): the city's heavy patrol drone stands on its pad in the Harmony Gate's roof garden (rotors
 * idling, light bar flashing), and a wing of small patrol drones flies loops over the bay south of Bayfront and round
 * Bloomtopia, banking into their turns, sweeping searchlights over the water after dark. Render-only; they fly while
 * a Harmony Gate or an Aegis Watch Precinct stands. Each precinct parks two drones on its roof pads; **Dispatch
 * drones** in its inspector sends them up on a sortie round the precinct, and they land again (D-138).
 *
 * Every drone is posed in the shader from static per-instance data and `U.clock` (loop, height, speed, phase, scale),
 * rotors spin round their hubs (`aHub`), so there are no per-frame uploads: two draw calls (drones, night beams).
 */

const GATE = 'harmony-gate';
const PRECINCT = 'aegis-precinct';
/** A precinct sortie: seconds aloft (take-off and landing ramps included), loop radii and height over the pads. */
const SORTIE = 45;
const RAMP = 5;
const SORTIE_R: [number, number] = [8, 6];
const SORTIE_UP = 9;
/** Instanced batches stay above the 1024-instance UBO path (AGENTS.md §8). */
const CAP = 1040;
/** The heavy drone's size on the pad, and the patrols'. */
const HEAVY = 3.6;
const PATROL = 1.35;

/** Patrol loops over the bay: centre, radii (tiles), height, angular speed (rad/s; the sign is the direction), drones. */
const LOOPS: { c: [number, number]; r: [number, number]; y: number; speed: number; n: number; phase: number }[] = [
  // Along the Bayfront waterfront, inside the Aeroline's sweep and over the Bloomtopia bridge.
  { c: [262, 383], r: [62, 11], y: 21, speed: 0.06, n: 2, phase: 0 },
  // Round the Bloomtopia islet.
  { c: [252, 440], r: [33, 21], y: 19, speed: -0.11, n: 2, phase: 0.5 },
  // Over the river mouth and the east bay.
  { c: [330, 393], r: [26, 14], y: 24, speed: 0.13, n: 2, phase: 1.1 },
  // The west bay.
  { c: [188, 396], r: [24, 15], y: 20, speed: -0.12, n: 1, phase: 2.3 },
];

declare module '@/core/Services' {
  interface GameServices {
    police: { dispatch(eid: number): boolean };
  }
}

export const policeModule: GameModule = {
  id: 'police',
  deps: ['construction', 'hud'],
  init(ctx) {
    const { city, bus } = ctx;
    // aPath: loop centre x, z and radii; aFly: height, angular speed, phase (heading when parked), scale.
    const aPath = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    const aFly = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    // aSortie (precinct drones, D-138): take-off and landing clock times, pad height, and 1 for a sortie drone (0 flies
    // as given). A sortie loop is centred on the drone's pad: its radius and height grow from nothing on take-off.
    const aSortie = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);

    // ── Shared flight pose: where a drone is, which way it heads and how far it banks ─────────────────────────
    const path = attribute('aPath', 'vec4');
    const fly = attribute('aFly', 'vec4');
    const sortie = attribute('aSortie', 'vec4');
    const isSortie = step(0.5, sortie.w);
    const aloft = smoothstep(sortie.x, sortie.x.add(RAMP), U.clock).mul(float(1).sub(smoothstep(sortie.y.sub(RAMP), sortie.y, U.clock)));
    const reach = mix(float(1), aloft, isSortie);
    const radii = path.zw.mul(reach);
    const moving = step(0.01, radii.x);
    const theta = fly.z.add(U.clock.mul(fly.y));
    const at = path.xy.add(vec2(cos(theta).mul(radii.x), sin(theta).mul(radii.y)));
    const vel = vec2(sin(theta).mul(radii.x).negate(), cos(theta).mul(radii.y)).mul(sign(fly.y));
    // A parked drone has no velocity: nudge it so the (unused) flight heading never divides by zero.
    const head = mix(vec2(cos(fly.z), sin(fly.z)), normalize(vel.add(vec2(1e-5, 0))), moving);
    const bob = sin(U.clock.mul(1.6).add(fly.z.mul(3))).mul(0.12).mul(moving);
    const y = mix(fly.x, mix(sortie.z, fly.x, aloft), isSortie).add(bob);
    // Bank into the turn (toward the loop's centre), nose a little down in flight.
    const roll = moving.mul(0.24).mul(sign(fly.y));
    const pitch = moving.mul(-0.09);
    const pose = (v: Node<'vec3'>) => {
      const cr = cos(roll);
      const sr = sin(roll);
      const b = vec3(v.x, v.y.mul(cr).sub(v.z.mul(sr)), v.y.mul(sr).add(v.z.mul(cr)));
      const cp = cos(pitch);
      const sp = sin(pitch);
      const p = vec3(b.x.mul(cp).sub(b.y.mul(sp)), b.x.mul(sp).add(b.y.mul(cp)), b.z);
      return vec3(p.x.mul(head.x).sub(p.z.mul(head.y)), p.y, p.x.mul(head.y).add(p.z.mul(head.x)));
    };

    // ── Drones ────────────────────────────────────────────────────────────────────────────────────────────────
    const geo = droneGeometry();
    geo.setAttribute('aPath', aPath);
    geo.setAttribute('aFly', aFly);
    geo.setAttribute('aSortie', aSortie);
    const dm = new MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.25 });
    {
      const partId = attribute('aPart', 'float');
      const is = (id: number) => step(abs(partId.sub(id)), 0.5);
      const blade = is(DRONE_PART.blade);
      // Rotors spin round their hubs (idling slower on the pad).
      const hub = attribute('aHub', 'vec3');
      const spin = U.clock.mul(mix(float(14), float(23), moving)).add(fly.z.mul(5));
      const rel = positionGeometry.sub(hub);
      const spun = hub.add(vec3(rel.x.mul(cos(spin)).add(rel.z.mul(sin(spin))), rel.y, rel.z.mul(cos(spin)).sub(rel.x.mul(sin(spin)))));
      const local = mix(positionGeometry, spun, blade);
      dm.positionNode = vec3(at.x, y, at.y).add(pose(local).mul(fly.w));
      dm.normalNode = transformNormalToView(pose(normalGeometry));
      // Livery: white upper shell over a navy belly with a police-blue stripe between them.
      const gy = positionGeometry.y;
      const shell = mix(color(0x1d2c4a), color(0xf2f5f8), smoothstep(0.145, 0.16, gy));
      const stripe = smoothstep(0.012, 0.004, abs(gy.sub(0.168)));
      const body = mix(shell, color(0x2f6bff), stripe);
      // Light bar: red double-flashes, then blue (each drone on its own beat).
      const beat = fract(U.clock.mul(1.4).add(fly.z.mul(0.37)));
      const pulse = step(0.5, fract(beat.mul(4)));
      const redOn = float(1).sub(step(0.5, beat)).mul(pulse);
      const blueOn = step(0.5, beat).mul(pulse);
      const red = is(DRONE_PART.red);
      const blue = is(DRONE_PART.blue);
      let col = body.mul(is(DRONE_PART.body));
      col = col.add(color(0x1d2c4a).mul(is(DRONE_PART.trim)));
      col = col.add(color(0x5ff4ff).mul(is(DRONE_PART.eye)));
      col = col.add(mix(color(0x5a1018), color(0xff2a3d), redOn).mul(red));
      col = col.add(mix(color(0x0f1f55), color(0x2f6bff), blueOn).mul(blue));
      col = col.add(color(0x2a2f36).mul(blade));
      col = col.add(color(0xe9eef2).mul(is(DRONE_PART.duct)));
      col = col.add(color(0xfff6e0).mul(is(DRONE_PART.lamp)));
      col = col.add(color(0x3a4048).mul(is(DRONE_PART.skid)));
      dm.colorNode = col;
      // Lights glow by day and blaze at night; under a few pixels they dim to their share of a pixel (D-064).
      const cover = min(float(1), float(0.06).div(max(length(fwidth(positionGeometry)), float(1e-5))));
      const night = U.night.mul(1.4).add(0.6);
      const glow = color(0xff2a3d)
        .mul(red.mul(redOn).mul(3))
        .add(color(0x2f6bff).mul(blue.mul(blueOn).mul(3.4)))
        .add(color(0x5ff4ff).mul(is(DRONE_PART.eye).mul(1.4)))
        .add(color(0xfff6e0).mul(is(DRONE_PART.lamp).mul(1.2)))
        .add(color(0x4f8dff).mul(is(DRONE_PART.duct).mul(U.night.mul(0.25))))
        .mul(night)
        .mul(cover);
      dm.emissiveNode = glow;
    }
    const drones = new InstancedMesh(geo, dm, CAP);
    drones.count = 0;
    drones.frustumCulled = false;
    drones.castShadow = drones.receiveShadow = false;
    drones.name = 'police.drones';

    // ── Night searchlights: a soft cone from each patrol drone, swept a little side to side over the water ────
    const beamGeo = new CylinderGeometry(0.004, 0.11, 1, 18, 1, true).translate(0, -0.5, 0);
    beamGeo.setAttribute('aPath', aPath);
    beamGeo.setAttribute('aFly', aFly);
    beamGeo.setAttribute('aSortie', aSortie);
    // Normal blending with a low opacity: additive beams darkened the water under them (D-137).
    const bm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending, side: DoubleSide, fog: false });
    {
      // Tilted forward off straight down, each beam is just long enough to fade out above the water: a cone that
      // reached under the surface darkened the water there.
      const tilt = float(0.42);
      const L = fly.x.sub(2).div(cos(tilt));
      const g = positionGeometry.mul(L);
      const ct = cos(tilt);
      const st = sin(tilt);
      const t1 = vec3(g.x.mul(ct).sub(g.y.mul(st)), g.x.mul(st).add(g.y.mul(ct)), g.z);
      const swing = sin(U.clock.mul(0.7).add(fly.z.mul(4))).mul(0.35);
      const cs = cos(swing);
      const ss = sin(swing);
      const t2 = vec3(t1.x.mul(cs).add(t1.z.mul(ss)), t1.y, t1.z.mul(cs).sub(t1.x.mul(ss)));
      const world = vec3(at.x, y, at.y).add(pose(t2)).add(vec3(0, 0.1 * PATROL, 0));
      bm.positionNode = world;
      const n = normalize(pose(normalGeometry));
      const soft = abs(dot(n, normalize(cameraPosition.sub(world)))).pow(1.5);
      const along = positionGeometry.y.negate();
      const a = float(1).sub(along).pow(1.6).mul(smoothstep(0, 0.03, along)).mul(soft).mul(U.night).mul(moving).mul(0.12);
      const c = color(0xdcefff);
      const op = a.min(1);
      bm.colorNode = c;
      bm.opacityNode = op;
      // The bloom input blends like the colour (alpha = the beam's opacity): written opaque, it wiped out the night
      // glow of the water behind and the bay went dark under every beam.
      bm.mrtNode = mrt({ emissive: vec4(0.05, 0.055, 0.06, op) }); // a faint share of the beam colour (0xdcefff)
    }
    const beams = new InstancedMesh(beamGeo, bm, CAP);
    beams.count = 0;
    beams.frustumCulled = false;
    beams.castShadow = beams.receiveShadow = false;
    beams.renderOrder = 8;
    beams.name = 'police.beams';
    ctx.scene.add(drones, beams);

    // ── Instances: the heavy drone on the first Harmony Gate's pad, the patrol wing over the bay ──────────────────
    const _v = new Vector3();
    const _d = new Vector3();
    /** Sorties in flight: precinct uid → [take-off, landing] clock times (survives rebuilds). */
    const sorties = new Map<number, [number, number]>();
    /** Instance ranges of each precinct's two drones, by entity. */
    const precinctDrones = new Map<number, number>();
    const rebuild = () => {
      const gate = city.buildingEntities().find((e) => city.buildingDef(e).id === GATE);
      const precincts = city.buildingEntities().filter((e) => city.buildingDef(e).id === PRECINCT);
      const P = aPath.array as Float32Array;
      const F = aFly.array as Float32Array;
      const T = aSortie.array as Float32Array;
      T.fill(0);
      precinctDrones.clear();
      let n = 0;
      const placed = (eid: number) => {
        const rec = city.buildingRecord(eid);
        return placeBuilding(city.grid, city.buildingDef(eid), rec.x, rec.z, rec.rot).base;
      };
      if (gate !== undefined) {
        const base = placed(gate);
        _v.set(...DRONE_PAD).applyMatrix4(base);
        // Parked facing the gate's local +x, turned with the building.
        _d.set(1, 0, 0).transformDirection(base);
        P.set([_v.x, _v.z, 0, 0], 0);
        F.set([_v.y, 0, Math.atan2(_d.z, _d.x), HEAVY], 0);
        n = 1;
      }
      for (const eid of precincts) {
        if (n + POLICE_PADS.length > CAP) break;
        const base = placed(eid);
        _d.set(1, 0, 0).transformDirection(base);
        const heading = Math.atan2(_d.z, _d.x);
        const [t0, t1] = sorties.get(Building.uid[eid]!) ?? [0, 0];
        precinctDrones.set(eid, n);
        POLICE_PADS.forEach((pad, k) => {
          _v.set(pad[0], pad[1], pad[2]).applyMatrix4(base);
          // Circles its own pad when sent up; the two fly opposite sides of the loop.
          P.set([_v.x, _v.z, SORTIE_R[0], SORTIE_R[1]], n * 4);
          F.set([_v.y + SORTIE_UP, 0.32, heading + k * Math.PI, PATROL], n * 4);
          T.set([t0, t1, _v.y, 1], n * 4);
          n++;
        });
      }
      if (gate !== undefined || precincts.length)
        for (const l of LOOPS)
          for (let k = 0; k < l.n; k++) {
            P.set([l.c[0], l.c[1], l.r[0], l.r[1]], n * 4);
            F.set([l.y, l.speed, l.phase + (k * Math.PI * 2) / l.n, PATROL], n * 4);
            n++;
          }
      drones.count = beams.count = n;
      aPath.needsUpdate = aFly.needsUpdate = aSortie.needsUpdate = true;
    };
    // Startup content exists before modules load: mirror it now (AGENTS.md rule 9).
    rebuild();
    const isStation = (eid: number) => [GATE, PRECINCT].includes(city.buildingDef(eid).id);
    bus.on('building:added', ({ eid }) => isStation(eid) && rebuild());
    bus.on('building:removed', () => rebuild());
    bus.on('city:reset', rebuild);
    bus.on('terrain:changed', rebuild);
    ctx.systems.add({
      id: 'police.visible',
      phase: 'render',
      order: 6,
      update() {
        drones.visible = drones.count > 0;
        beams.visible = drones.count > 1 && U.night.value > 0.05;
        // Forget sorties that have landed.
        for (const [uid, [, t1]] of sorties) if (t1 < U.clock.value) sorties.delete(uid);
      },
    });

    // ── Dispatch (D-138): a precinct sends its two drones up on a sortie round it ─────────────────────────────
    const dispatch = (eid: number): boolean => {
      const first = precinctDrones.get(eid);
      if (first === undefined) return false;
      const now = U.clock.value;
      const uid = Building.uid[eid]!;
      const was = sorties.get(uid);
      // Already aloft: keep flying (no second take-off), just push the landing back.
      const t0 = was && was[1] > now ? was[0] : now;
      sorties.set(uid, [t0, now + SORTIE]);
      const T = aSortie.array as Float32Array;
      for (let k = 0; k < POLICE_PADS.length; k++) T.set([t0, now + SORTIE], (first + k) * 4);
      aSortie.addUpdateRange(first * 4, POLICE_PADS.length * 4);
      aSortie.needsUpdate = true;
      bus.emit('toast', { text: `${city.buildingDef(eid).name}: patrol drones dispatched`, tone: 'info' });
      return true;
    };
    ctx.services.get('hud').buildingActions((eid) =>
      city.buildingDef(eid).id === PRECINCT
        ? [
            h(
              'button',
              { class: 'tool', title: 'Send the precinct’s two patrol drones up on a sortie round it; they land again after about 40 seconds', onClick: () => dispatch(eid) },
              h('span', { class: 'g' }, icon('drone')),
              'Dispatch drones',
            ),
          ]
        : [],
    );
    ctx.services.provide('police', { dispatch });
  },
};
