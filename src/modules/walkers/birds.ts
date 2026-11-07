import {
  ConeGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardNodeMaterial,
  SphereGeometry,
} from 'three/webgpu';
import {
  abs,
  attribute,
  color,
  cos,
  float,
  fract,
  max,
  mix,
  normalGeometry,
  positionGeometry,
  select,
  sign,
  sin,
  smoothstep,
  step,
  time,
  transformNormalToView,
  vec2,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { City } from '@/sim/City';
import { hash2 } from '@/sim/random';
import { fan, pickNode, tag, turn } from './kit';

/** Instanced batches stay above the 1024-instance UBO path (AGENTS.md §8). */
const CAP = 1040;
/** Flocks circling round the explorer, and birds per flock. */
const FLOCKS = 9;
const PER_FLOCK = 7;
const BODY = 0;
const WING = 1;
const BEAK = 2;
const EYE = 3;

function birdModel() {
  // Each wing in two panels (inner arm, outer hand), tagged with their span so the hand can bend further.
  const wing = (side: number) => [
    tag(
      fan(
        [
          [0, 0.03],
          [side * 0.11, 0.02],
          [side * 0.11, -0.035],
          [0, -0.03],
        ].map(([x, z]) => [x!, z!] as [number, number]),
        'xz',
      ),
      WING,
    ),
    tag(
      fan(
        [
          [side * 0.11, 0.02],
          [side * 0.24, -0.02],
          [side * 0.22, -0.045],
          [side * 0.11, -0.035],
        ].map(([x, z]) => [x!, z!] as [number, number]),
        'xz',
      ),
      WING,
    ),
  ];
  return mergeGeometries([
    tag(new SphereGeometry(0.5, 12, 8).scale(0.05, 0.05, 0.16).translate(0, 0, 0.01), BODY),
    tag(new SphereGeometry(0.03, 10, 8).translate(0, 0.012, 0.085), BODY),
    tag(new ConeGeometry(0.009, 0.035, 6).rotateX(Math.PI / 2).translate(0, 0.008, 0.12), BEAK),
    tag(new SphereGeometry(0.0055, 6, 4).translate(0.018, 0.02, 0.1), EYE),
    tag(new SphereGeometry(0.0055, 6, 4).translate(-0.018, 0.02, 0.1), EYE),
    // A fanned tail.
    tag(
      fan(
        [
          [0, -0.06],
          [0.04, -0.15],
          [0, -0.135],
          [-0.04, -0.15],
        ],
        'xz',
      ),
      BODY,
    ),
    ...wing(-1),
    ...wing(1),
  ])!;
}

/**
 * Birds (D-126): gulls (grey back, black wing tips), swallows (blue-black, white belly) and finches (brown with a
 * golden wash) in flocks circling round the explorer at rooftop to low-cloud height. Wings beat in bouts and glide
 * between them, the outer panel bending further than the inner; each bird banks into the turn. Explore modes only.
 */
export class Birds {
  readonly mesh: InstancedMesh;
  /** Flock centre xyz and seed; the bird's slot in the flock is its instance's own seed. */
  private home = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
  cx = -1e9;
  cz = -1e9;

  constructor() {
    const geo = birdModel();
    geo.setAttribute('aHome', this.home);
    const m = new MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0, side: DoubleSide });
    const h = attribute('aHome', 'vec4');
    const part = attribute('aPart', 'float');
    const seed = h.w;
    const flock = seed.mul(7).floor();
    const slot = fract(seed.mul(7));
    const g = positionGeometry;
    const n = normalGeometry as unknown as Node<'vec3'>;
    // Circle round the flock centre (each flock its own radius, speed and direction), with a staggered formation.
    const fs = fract(flock.mul(0.618).add(h.x.mul(0.013)));
    const dirSign = step(0.5, fs).mul(2).sub(1);
    const R = float(5).add(fs.mul(6)).add(slot.mul(2.2));
    const w = float(0.22).add(fs.mul(0.12)).mul(dirSign);
    const a = time.mul(w).add(fs.mul(30)).sub(slot.mul(0.9).mul(dirSign));
    const at = vec2(cos(a), sin(a)).mul(R);
    const heading = vec2(sin(a).negate(), cos(a)).mul(dirSign);
    const y = h.y.add(sin(time.mul(0.5).add(slot.mul(9))).mul(0.6)).add(slot.mul(1.4));
    // Flap in bouts, glide between: the hand bends further than the arm.
    const bout = smoothstep(-0.2, 0.3, sin(time.mul(0.45).add(slot.mul(5)).add(fs.mul(11))));
    const beat = sin(time.mul(9).add(slot.mul(13)));
    const isWing = step(WING - 0.5, part).mul(step(part, WING + 0.5));
    const span = abs(g.x);
    const ang = beat
      .mul(0.6)
      .mul(bout)
      .add(0.08)
      .mul(float(1).add(smoothstep(0.1, 0.22, span).mul(0.7)))
      .mul(isWing);
    const flapped = vec3(g.x.mul(cos(ang)), g.y.add(span.mul(sin(ang))), g.z);
    const nF = vec3(n.x.mul(cos(ang)).sub(sign(g.x).mul(n.y).mul(sin(ang))), n.y.mul(cos(ang)), n.z);
    // Bank into the turn: roll about the body axis.
    const roll = dirSign.mul(-0.35);
    const rolled = vec3(
      flapped.x.mul(cos(roll)).sub(flapped.y.mul(sin(roll))),
      flapped.x.mul(sin(roll)).add(flapped.y.mul(cos(roll))),
      flapped.z,
    );
    const nR = vec3(
      nF.x.mul(cos(roll)).sub(nF.y.mul(sin(roll))),
      nF.x.mul(sin(roll)).add(nF.y.mul(cos(roll))),
      nF.z,
    );
    // Species by flock: gulls are larger.
    const sp = fract(fs.mul(5.3)).mul(3).floor();
    const size = pickNode(sp, [float(1.6), float(1.0), float(0.85)]);
    m.positionNode = vec3(h.x.add(at.x), y, h.z.add(at.y)).add(turn(rolled, heading).mul(size));
    m.normalNode = transformNormalToView(turn(nR, heading));
    const under = smoothstep(0.004, -0.01, g.y).mul(step(part, BODY + 0.5));
    const tip = smoothstep(0.17, 0.2, span);
    const gull = mix(mix(color(0xb9c2c8), color(0x1a1c1f), tip), color(0xf6f7f5), under);
    const swallow = mix(color(0x1d2a4a), color(0xf2ede4), under);
    const finch = mix(
      mix(color(0x8a6238), color(0xd9b14a), smoothstep(0.08, 0.2, span)),
      color(0xe8d8b8),
      under,
    );
    const plumage = pickNode(sp, [gull, swallow, finch]);
    const beak = pickNode(sp, [
      color(0xf2b02a),
      color(0x22201e),
      color(0xd99a5a),
    ] as unknown as Node<'vec3'>[]);
    m.colorNode = select(
      part.lessThan(BEAK - 0.5),
      plumage,
      select(part.lessThan(EYE - 0.5), beak, color(0x0e0e10)),
    ) as unknown as Node<'vec3'>;
    m.roughnessNode = max(float(0.55), float(0.75).sub(under.mul(0.1)));
    this.mesh = new InstancedMesh(geo, m, CAP);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.name = 'wildlife.birds';
  }

  /** Sets flocks round a point, at rooftop to low-cloud height above the ground there. */
  place(city: City, x: number, z: number): void {
    this.cx = x;
    this.cz = z;
    const g = city.grid;
    const a = this.home.array as Float32Array;
    let n = 0;
    for (let f = 0; f < FLOCKS; f++) {
      const qx = Math.round(x / 12) * 12;
      const qz = Math.round(z / 12) * 12;
      const fx = qx + (hash2(qx, qz, 500 + f) - 0.5) * 50;
      const fz = qz + (hash2(qx, qz, 600 + f) - 0.5) * 50;
      const ground = Math.max(
        0,
        g.heightAt(Math.min(g.w - 1, Math.max(0, fx)), Math.min(g.h - 1, Math.max(0, fz))),
      );
      const fy = ground + 7 + hash2(qx, qz, 700 + f) * 10;
      const birds = 3 + Math.floor(hash2(qx, qz, 800 + f) * PER_FLOCK);
      for (let b = 0; b < birds && n < CAP; b++) {
        a[n * 4] = fx;
        a[n * 4 + 1] = fy;
        a[n * 4 + 2] = fz;
        // Integer part: flock (shared look and circle); fraction: the bird's slot in it.
        a[n * 4 + 3] = (f + (b + 0.5) / (birds + 1)) / 7;
        n++;
      }
    }
    this.mesh.count = n;
    this.home.needsUpdate = true;
  }
}
