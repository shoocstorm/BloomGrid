import { Vector3 } from 'three/webgpu';
import {
  PI,
  TWO_PI,
  abs,
  atan,
  clamp,
  cos,
  cross,
  float,
  floor,
  fract,
  max,
  mix,
  normalize,
  select,
  sin,
  step,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';

/**
 * A pod's flight (D-051), shared by the pod shader and the ride camera (which mirrors it on the CPU, so the two
 * must stay in step: change both together). A pod flies A → into the hub ring at V → round the ring → out to B,
 * then back the same way; without a hub (R = 0) it flies the single arc A → B. Every leg is the arc sky-lanes
 * use (`arcY`), so pods ride exactly on their lanes. Per instance: route (A, B), via (V, ring height, R) and
 * info (height at A, height at B, phase seed, speed scale).
 */

/** Cruise speed in tiles per second; the ease never stops (min 20% speed) so the heading stays defined. */
export const POD_SPEED = 4.5;
const EASE = 0.8;
/** A turn round the ring shorter than this (radians) loops all the way round instead: it reads as routing. */
const LOOP_MIN = 0.8;
const EPS = 0.08;

/** Lane arc height at t along a leg of length len, from y0 to y1. */
export const arcPeak = (len: number) => 1.5 + len * 0.06;
export const arcY = (y0: number, y1: number, t: number, len: number) =>
  y0 + (y1 - y0) * t + 4 * t * (1 - t) * arcPeak(len);

/** Shader pose: world position and travel direction for one instance. */
export function podPathNode(
  route: Node<'vec4'>,
  via: Node<'vec4'>,
  info: Node<'vec4'>,
  clock: Node<'float'>,
): { pos: Node<'vec3'>; fwd: Node<'vec3'> } {
  const A = route.xy;
  const B = route.zw;
  const V = via.xy;
  const vy = via.z;
  const R = via.w;
  const ya = info.x;
  const yb = info.y;
  const hasVia = step(0.001, R);
  const dA = A.sub(V);
  const dB = B.sub(V);
  const E1v = V.add(dA.div(max(dA.length(), 0.001)).mul(R));
  const E2 = V.add(dB.div(max(dB.length(), 0.001)).mul(R));
  const E1 = mix(B, E1v, hasVia);
  const y1 = mix(yb, vy, hasVia);
  const L1 = max(E1.sub(A).length(), 0.01);
  const th1 = atan(dA.y, dA.x);
  const raw = atan(dB.y, dB.x).sub(th1);
  const wrapped = raw.sub(floor(raw.add(PI).div(TWO_PI)).mul(TWO_PI));
  const delta = wrapped.add(
    select(abs(wrapped).lessThan(LOOP_MIN), step(0, wrapped).mul(2).sub(1).mul(TWO_PI), 0),
  );
  const Lo = R.mul(abs(delta)).mul(hasVia);
  const L2 = B.sub(E2).length().mul(hasVia);
  const total = L1.add(Lo).add(L2);
  const u = fract(clock.mul(info.w.mul(POD_SPEED)).div(total.mul(2)).add(info.z));
  const w = float(1).sub(abs(u.mul(2).sub(1)));
  const e = w.sub(sin(w.mul(TWO_PI)).mul(EASE / (2 * Math.PI)));
  const d = e.mul(total);
  const arc = (
    p0: Node<'vec2'>,
    p1: Node<'vec2'>,
    y0: Node<'float'>,
    y1n: Node<'float'>,
    t: Node<'float'>,
    len: Node<'float'>,
  ) => {
    const f = mix(p0, p1, t);
    const y = mix(y0, y1n, t).add(t.mul(float(1).sub(t)).mul(4).mul(len.mul(0.06).add(1.5)));
    return vec3(f.x, y, f.y);
  };
  const at = (dd: Node<'float'>) => {
    const p1 = arc(A, E1, ya, y1, clamp(dd.div(L1), 0, 1), L1);
    const ang = th1.add(delta.mul(clamp(dd.sub(L1).div(max(Lo, 0.001)), 0, 1)));
    const po = vec3(V.x.add(cos(ang).mul(R)), vy, V.y.add(sin(ang).mul(R)));
    const p2 = arc(E2, B, vy, yb, clamp(dd.sub(L1).sub(Lo).div(max(L2, 0.001)), 0, 1), max(L2, 0.01));
    return select(dd.lessThanEqual(L1), p1, select(dd.lessThanEqual(L1.add(Lo)), po, p2));
  };
  const pos = at(d);
  const ahead = at(clamp(d.add(EPS), 0, total)).sub(at(clamp(d.sub(EPS), 0, total)));
  const dir = step(u, 0.5).mul(2).sub(1);
  const fwd = normalize(ahead.mul(dir).add(vec3(0.00001, 0, 0)));
  return { pos, fwd };
}

/** Pose a body (+X forward, +Y up) along `fwd`. */
export function orientNode(g: Node<'vec3'>, fwd: Node<'vec3'>): Node<'vec3'> {
  const right = normalize(cross(fwd, vec3(0, 1, 0)).add(vec3(0, 0, 0.0001)));
  const up = cross(right, fwd);
  return fwd.mul(g.x).add(up.mul(g.y)).add(right.mul(g.z));
}

/** CPU mirror of `podPathNode` for instance i of the packed arrays (vec4 each). */
export function podPathAt(
  route: Float32Array,
  via: Float32Array,
  info: Float32Array,
  i: number,
  clock: number,
  out: Vector3,
  ahead?: Vector3,
): Vector3 {
  const o = i * 4;
  const [ax, az, bx, bz] = [route[o]!, route[o + 1]!, route[o + 2]!, route[o + 3]!];
  const [vx, vz, vy, R] = [via[o]!, via[o + 1]!, via[o + 2]!, via[o + 3]!];
  const [ya, yb, seed, speed] = [info[o]!, info[o + 1]!, info[o + 2]!, info[o + 3]!];
  const has = R >= 0.001;
  const dAx = ax - vx;
  const dAz = az - vz;
  const dBx = bx - vx;
  const dBz = bz - vz;
  const lA = Math.max(Math.hypot(dAx, dAz), 0.001);
  const lB = Math.max(Math.hypot(dBx, dBz), 0.001);
  const e1x = has ? vx + (dAx / lA) * R : bx;
  const e1z = has ? vz + (dAz / lA) * R : bz;
  const e2x = vx + (dBx / lB) * R;
  const e2z = vz + (dBz / lB) * R;
  const y1 = has ? vy : yb;
  const L1 = Math.max(Math.hypot(e1x - ax, e1z - az), 0.01);
  const th1 = Math.atan2(dAz, dAx);
  const raw = Math.atan2(dBz, dBx) - th1;
  let delta = raw - Math.floor((raw + Math.PI) / (2 * Math.PI)) * 2 * Math.PI;
  if (Math.abs(delta) < LOOP_MIN) delta += (delta >= 0 ? 1 : -1) * 2 * Math.PI;
  const Lo = has ? R * Math.abs(delta) : 0;
  const L2 = has ? Math.hypot(bx - e2x, bz - e2z) : 0;
  const total = L1 + Lo + L2;
  const u = ((((clock * speed * POD_SPEED) / (total * 2) + seed) % 1) + 1) % 1;
  const w = 1 - Math.abs(u * 2 - 1);
  const d = (w - (Math.sin(w * 2 * Math.PI) * EASE) / (2 * Math.PI)) * total;
  const cl = (x: number) => Math.min(1, Math.max(0, x));
  const at = (dd: number, v: Vector3) => {
    if (dd <= L1) {
      const t = cl(dd / L1);
      return v.set(ax + (e1x - ax) * t, arcY(ya, y1, t, L1), az + (e1z - az) * t);
    }
    if (dd <= L1 + Lo) {
      const a = th1 + delta * cl((dd - L1) / Math.max(Lo, 0.001));
      return v.set(vx + Math.cos(a) * R, vy, vz + Math.sin(a) * R);
    }
    const t = cl((dd - L1 - Lo) / Math.max(L2, 0.001));
    return v.set(e2x + (bx - e2x) * t, arcY(vy, yb, t, Math.max(L2, 0.01)), e2z + (bz - e2z) * t);
  };
  at(d, out);
  if (ahead) {
    const dir = u <= 0.5 ? 1 : -1;
    at(Math.min(total, Math.max(0, d + EPS * 2 * dir)), ahead);
  }
  return out;
}
