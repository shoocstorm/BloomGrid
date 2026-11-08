import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  TorusGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import { getMaterial } from '@/render/materials/library';
import { tf } from '@/render/bake';
import { BALL, Kit, SURF } from '@/modules/scenery/wonderKit';
import { K, TRACK } from './Guideway';
import type { LoopPath, PathPoint } from './path';

const CARS = 5;
const CAR = 4.55 * K;
const PER_TRACK = 3;
/** Cruise speed (world units per second), acceleration, and station dwell. */
const VMAX = 22;
const ACC = 4;
const DWELL = 7;

interface Leg {
  from: number;
  dist: number;
  time: number;
}

/**
 * Aeroline trains: five-car maglev sets, three per track, running opposite ways round the loop and stopping at
 * every station. Motion is a pure function of the clock (accelerate, cruise, brake, dwell), so the ride camera
 * and the cars agree. Two instanced meshes (nose cars, middle cars), placed on the CPU each frame: 30 matrices.
 */
export class Trains {
  readonly noses: InstancedMesh;
  readonly mids: InstancedMesh;
  private tracks: { dir: 1 | -1; legs: Leg[]; cycle: number }[];

  constructor(
    private path: LoopPath,
    private deck: number,
    stationS: number[],
  ) {
    const L = path.length;
    // Each track stops with the train's middle at the platform centre; a track's own arc length u runs its way.
    const half = (CARS * CAR) / 2;
    this.tracks = ([1, -1] as const).map((dir) => {
      const stops = stationS
        .map((s) => ((((dir === 1 ? s : L - s) + half) % L) + L) % L)
        .sort((a, b) => a - b);
      const legs = stops.map((from, i) => {
        const dist = ((stops[(i + 1) % stops.length]! - from + L - 1e-6) % L) + 1e-6;
        return { from, dist, time: travelTime(dist) };
      });
      return { dir, legs, cycle: legs.reduce((a, l) => a + l.time + DWELL, 0) };
    });
    const mat = getMaterial('wonder');
    this.noses = new InstancedMesh(noseCar(), mat, PER_TRACK * 2 * 2);
    this.mids = new InstancedMesh(midCar(), mat, PER_TRACK * 2 * (CARS - 2));
    for (const m of [this.noses, this.mids]) {
      m.frustumCulled = false;
      m.receiveShadow = true;
      m.name = 'aeroline-trains';
    }
  }

  get count(): number {
    return PER_TRACK * 2;
  }

  /** Head of train `i` at time t: its own-track arc length u, speed, and direction. */
  head(i: number, t: number): { u: number; v: number; dir: 1 | -1 } {
    const tr = this.tracks[i % 2]!;
    let k = (((t + (Math.floor(i / 2) * tr.cycle) / PER_TRACK) % tr.cycle) + tr.cycle) % tr.cycle;
    for (const leg of tr.legs) {
      if (k < DWELL) return { u: leg.from, v: 0, dir: tr.dir };
      k -= DWELL;
      if (k < leg.time) {
        const [d, v] = along(leg.dist, leg.time, k);
        return { u: leg.from + d, v, dir: tr.dir };
      }
      k -= leg.time;
    }
    return { u: tr.legs[0]!.from, v: 0, dir: tr.dir };
  }

  /** World point on train i's track at its own arc length u, lifted by y; `fwd` gets the travel direction. */
  point(dir: 1 | -1, u: number, y: number, out: Vector3, fwd?: Vector3): Vector3 {
    const L = this.path.length;
    const p = this.path.at(dir === 1 ? u : L - u, _p);
    const [tx, tz] = [p.tx * dir, p.tz * dir];
    // Right of travel is (-tz, tx).
    out.set(p.x - tz * TRACK, this.deck + y, p.z + tx * TRACK);
    fwd?.set(tx, 0, tz);
    return out;
  }

  update(t: number): void {
    let ni = 0;
    let mi = 0;
    for (let i = 0; i < this.count; i++) {
      const { u, v, dir } = this.head(i, t);
      for (let c = 0; c < CARS; c++) {
        const uc = u - CAR / 2 - c * CAR;
        this.point(dir, uc, 0.02, _pos, _fwd);
        const curv = this.path.at(dir === 1 ? uc : this.path.length - uc, _p).curv * dir;
        // Bank into curves with speed; tail car faces backwards (its nose is the train's tail).
        const roll = Math.max(-0.14, Math.min(0.14, curv * v * v * 0.012));
        const back = c === CARS - 1;
        _q.setFromEuler(
          _e.set(0, Math.atan2(_fwd.x, _fwd.z) + (back ? Math.PI : 0), back ? -roll : roll, 'YXZ'),
        );
        _m.compose(_pos, _q, ONE);
        if (c === 0 || back) this.noses.setMatrixAt(ni++, _m);
        else this.mids.setMatrixAt(mi++, _m);
      }
    }
    this.noses.instanceMatrix.needsUpdate = true;
    this.mids.instanceMatrix.needsUpdate = true;
  }
}

const _p: PathPoint = { x: 0, z: 0, tx: 0, tz: 0, curv: 0 };
const _pos = new Vector3();
const _fwd = new Vector3();
const _q = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const ONE = new Vector3(1, 1, 1);

function travelTime(d: number): number {
  const da = (VMAX * VMAX) / ACC;
  return d >= da ? d / VMAX + VMAX / ACC : 2 * Math.sqrt(d / ACC);
}

/** Distance and speed after time k on a leg of length d taking time T (trapezoidal speed profile). */
function along(d: number, T: number, k: number): [number, number] {
  const ta = Math.min(VMAX / ACC, T / 2);
  const vt = ACC * ta;
  if (k < ta) return [0.5 * ACC * k * k, ACC * k];
  if (k > T - ta) {
    const r = T - k;
    return [d - 0.5 * ACC * r * r, ACC * r];
  }
  return [0.5 * ACC * ta * ta + vt * (k - ta), vt];
}

// ── Car geometry (local: +z forward, y up from the guide beam's top, origin at the car's centre) ─────────
// Surfaces come from the sea wonders' kit (D-147): gloss paint, glass that mirrors the sky, brushed metal.
const PEARL = 0xf4f7f5;
const TEAL = 0x2fd3b0;
const CORAL = 0xff7a6a;
const GLASS = 0x2e5866;
const SKIRT = 0xaab6bb;
const GLOSS = [0.32, 0.08, SURF.paint[2]] as const;
const capsule = (len: number, cap = 18) => new CapsuleGeometry(0.5, len, 6, cap).rotateX(Math.PI / 2);

/** Body, window band with mullions, livery stripes, doors, solar roof with aero domes, maglev skirts. */
function shell(k: Kit, len: number, z: number, doors: number[]): void {
  k.part(capsule(len), tf(0, 0.64, z, 0, 0, 0, 0.98, 1, 1), PEARL, GLOSS);
  // Wraparound window band, lit from inside at night, with pearl mullions between the panes.
  k.part(capsule(len - 0.25, 14), tf(0, 0.8, z, 0, 0, 0, 1.0, 0.3, 1.005), GLASS, SURF.glass, 2.4);
  const panes = Math.round((len - 0.4) / 0.62);
  for (let p = 0; p <= panes; p++) {
    const pz = z - (len - 0.4) / 2 + (p * (len - 0.4)) / panes;
    for (const s of [-1, 1]) k.part(BOX, tf(s * 0.488, 0.68, pz, 0, 0, 0, 0.03, 0.24, 0.05), PEARL, GLOSS);
  }
  // Livery: a teal stripe and a thin coral line under the windows.
  k.part(capsule(len - 0.1, 14), tf(0, 0.53, z, 0, 0, 0, 1.0, 0.05, 1.01), TEAL, GLOSS, 1.8);
  k.part(capsule(len - 0.2, 14), tf(0, 0.46, z, 0, 0, 0, 1.0, 0.018, 1.012), CORAL, GLOSS, 1.2);
  // Doors: dark leaves on the body's flat-enough band (it curves away below the stripe), a lit lintel above.
  for (const dz of doors)
    for (const s of [-1, 1]) {
      k.part(BOX, tf(s * 0.474, 0.47, z + dz, 0, 0, 0, 0.04, 0.4, 0.42), 0x2f4650, SURF.glass, 0.25);
      k.part(BOX, tf(s * 0.47, 0.94, z + dz, 0, 0, 0, 0.03, 0.025, 0.42), 0x9ff6ff, GLOSS, 1.6);
    }
  // Solar roof in a frame, two aero domes.
  k.part(BOX, tf(0, 1.11, z, 0, 0, 0, 0.5, 0.04, len), 0x2c4a7a, SURF.solar, 0.1);
  for (const s of [-1, 1]) k.part(BOX, tf(s * 0.26, 1.1, z, 0, 0, 0, 0.03, 0.06, len), 0xc9d3d6, SURF.metal);
  for (const dz of [-len * 0.3, len * 0.3]) k.part(BALL, tf(0, 1.15, z + dz, 0, 0, 0, 0.16, 0.08, 0.28), PEARL, GLOSS);
  // Maglev skirts either side of the guide beam, with a levitation glow underneath.
  for (const s of [-1, 1]) {
    k.part(BOX, tf(s * 0.4, -0.45, z, 0, 0, 0, 0.12, 0.6, len + 0.6), SKIRT, SURF.metal);
    k.part(BOX, tf(s * 0.4, -0.47, z, 0, 0, 0, 0.125, 0.03, len), 0x7ff7e6, GLOSS, 1.2);
  }
  k.part(BOX, tf(0, 0.0, z, 0, 0, 0, 0.92, 0.18, len + 0.5), SKIRT, SURF.metal);
}

/** A gangway bellows at the end `z` of a car. */
function gangway(k: Kit, z: number): void {
  k.part(new CylinderGeometry(0.36, 0.36, 0.22, 12).rotateX(Math.PI / 2), tf(0, 0.64, z), 0x3b464d, SURF.matte);
  for (const d of [-0.06, 0.06]) k.part(new TorusGeometry(0.37, 0.025, 4, 14), tf(0, 0.64, z + d), 0x2b343a, SURF.matte);
}

function midCar(): BufferGeometry {
  const k = new Kit();
  shell(k, 3.4, 0, [-1.05, 1.05]);
  for (const z of [-2.2, 2.2]) gangway(k, z);
  return k.b.build().scale(K, K, K);
}

function noseCar(): BufferGeometry {
  const k = new Kit();
  shell(k, 2.2, -0.6, [-0.9]);
  gangway(k, -2.2);
  // Long duck-bill nose with the livery sweeping onto it, a dark wraparound windshield, LED light bars.
  k.part(new SphereGeometry(0.5, 20, 12), tf(0, 0.56, 0.85, 0, 0, 0, 0.98, 0.86, 3.3), PEARL, GLOSS);
  k.part(new SphereGeometry(0.5, 20, 10), tf(0, 0.86, 0.9, 0.12, 0, 0, 0.82, 0.36, 1.9), 0x1d3340, SURF.glass, 0.5);
  k.part(new SphereGeometry(0.5, 16, 6), tf(0, 0.5, 1.3, 0, 0, 0, 1.0, 0.05, 2.6), TEAL, GLOSS, 1.8);
  k.part(new SphereGeometry(0.5, 16, 5), tf(0, 0.44, 1.25, 0, 0, 0, 1.006, 0.018, 2.5), CORAL, GLOSS, 1.2);
  for (const s of [-1, 1]) {
    k.part(new SphereGeometry(0.5, 10, 4), tf(s * 0.22, 0.38, 2.12, 0, s * 0.35, 0, 0.26, 0.05, 0.12), 0xeaffff, GLOSS, 4);
    k.part(new SphereGeometry(0.5, 8, 4), tf(s * 0.36, 0.35, 1.85, 0, s * 0.6, 0, 0.1, 0.05, 0.08), 0xff4a4a, GLOSS, 2.5);
  }
  // The line's emblem: a small glowing bloom on the nose.
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    k.part(BALL, tf(Math.cos(a) * 0.07, 0.98, 1.55 + Math.sin(a) * 0.07, 0.35, 0, 0, 0.05, 0.015, 0.05), 0xffd36e, GLOSS, 1.6);
  }
  return k.b.build().scale(K, K, K);
}

const BOX = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
