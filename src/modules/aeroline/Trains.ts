import {
  BoxGeometry,
  CapsuleGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import { getMaterial } from '@/render/materials/library';
import { GeoBuilder, tf } from '@/render/bake';
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
    const mat = getMaterial('scenery');
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
const PEARL = 0xf4f7f5;
const capsule = (len: number) => new CapsuleGeometry(0.5, len, 6, 18).rotateX(Math.PI / 2);

function shell(b: GeoBuilder, len: number, z: number): void {
  b.add(capsule(len), tf(0, 0.64, z, 0, 0, 0, 0.98, 1, 1), PEARL);
  // Wraparound window band, lit from inside at night, and a bloom-green stripe beneath it.
  b.add(capsule(len - 0.25), tf(0, 0.8, z, 0, 0, 0, 1.0, 0.3, 1.005), 0x2e5866, 2.4);
  b.add(capsule(len - 0.1), tf(0, 0.5, z, 0, 0, 0, 1.0, 0.05, 1.01), 0x2fd3b0, 1.8);
  // Solar roof strip.
  b.add(new BoxGeometry(0.46, 0.04, len), tf(0, 1.12, z), 0x2c4a7a, 0.1);
}

function midCar(): BufferGeometry {
  const b = new GeoBuilder();
  shell(b, 3.4, 0);
  b.add(new BoxGeometry(0.88, 0.5, 4.2), tf(0, -0.2, 0), 0x56616a);
  return b.build().scale(K, K, K);
}

function noseCar(): BufferGeometry {
  const b = new GeoBuilder();
  shell(b, 2.2, -0.6);
  // Long duck-bill nose, a dark wraparound windshield, headlights.
  b.add(new SphereGeometry(0.5, 20, 12), tf(0, 0.56, 0.85, 0, 0, 0, 0.98, 0.86, 3.3), PEARL);
  b.add(new SphereGeometry(0.5, 20, 10), tf(0, 0.86, 0.9, 0.12, 0, 0, 0.82, 0.36, 1.9), 0x1d3340, 0.5);
  b.add(new SphereGeometry(0.5, 16, 6), tf(0, 0.5, 1.3, 0, 0, 0, 1.0, 0.05, 2.6), 0x2fd3b0, 1.8);
  for (const k of [-1, 1]) b.add(new SphereGeometry(0.07, 8, 6), tf(k * 0.26, 0.42, 2.2), 0xeaffff, 4);
  b.add(new BoxGeometry(0.88, 0.5, 4.2), tf(0, -0.2, -0.05), 0x56616a);
  return b.build().scale(K, K, K);
}
