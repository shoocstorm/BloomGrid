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
  atan,
  attribute,
  clamp,
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
/** Flocks round the explorer, and the most birds in one. */
const FLOCKS = 9;
const PER_FLOCK = 7;
const BODY = 0;
const WING = 1;
const BEAK = 2;
const EYE = 3;
const TAIL = 4;

/** Wing half-span at size 1 (the hand starts at `HAND`). */
const SPAN = 0.27;
const HAND = 0.11;

function birdModel() {
  // Each wing in three panels (arm, hand, pointed tip swept back), cambered a little so it catches the light.
  const panel = (pts: [number, number][]) => {
    const g = fan(pts, 'xz');
    const p = g.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const [x, z] = [p.getX(i), p.getZ(i)];
      p.setY(i, 0.006 * Math.cos((z / 0.04) * 1.2) * (1 - Math.abs(x) / SPAN));
    }
    g.computeVertexNormals();
    return tag(g, WING);
  };
  const wing = (s: number) => [
    panel([
      [0, 0.032],
      [s * HAND, 0.03],
      [s * HAND, -0.034],
      [0, -0.042],
    ]),
    panel([
      [s * HAND, 0.03],
      [s * 0.2, 0.012],
      [s * 0.2, -0.03],
      [s * HAND, -0.034],
    ]),
    panel([
      [s * 0.2, 0.012],
      [s * SPAN, -0.036],
      [s * 0.2, -0.03],
    ]),
  ];
  return mergeGeometries([
    tag(new SphereGeometry(0.5, 14, 9).scale(0.052, 0.05, 0.17).translate(0, 0, 0.005), BODY),
    tag(new SphereGeometry(0.031, 12, 9).translate(0, 0.014, 0.086), BODY),
    tag(new ConeGeometry(0.009, 0.036, 6).rotateX(Math.PI / 2).translate(0, 0.01, 0.125), BEAK),
    tag(new SphereGeometry(0.0058, 6, 4).translate(0.019, 0.022, 0.1), EYE),
    tag(new SphereGeometry(0.0058, 6, 4).translate(-0.019, 0.022, 0.1), EYE),
    // A forked tail (deeply on swallows, the shader stretches it there).
    tag(
      fan(
        [
          [0, -0.06],
          [0.035, -0.13],
          [0.045, -0.165],
          [0, -0.125],
          [-0.045, -0.165],
          [-0.035, -0.13],
        ],
        'xz',
      ),
      TAIL,
    ),
    ...wing(-1),
    ...wing(1),
  ])!;
}

/**
 * Birds (D-126, refined in D-164): gulls (white with a grey mantle and black wing tips), swallows (blue-black with a
 * rust throat, white belly and a long forked tail) and finches (brown with a golden wing bar) in flocks round the
 * explorer at rooftop to low-cloud height. Each bird flies a wandering loop that swoops up and down, pitched with
 * its climb and banked with its turn (both from the path itself), and each species flies its own way: gulls glide
 * on crooked M-shaped wings between slow beats, swallows dart on fast beats, finches bound (a burst of beats, then
 * wings folded and a dip). Explore modes only; all motion in the shader from `time`.
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
    const fs = fract(flock.mul(0.618).add(h.x.mul(0.013)));
    // Species by flock: 0 gull, 1 swallow, 2 finch.
    const sp = fract(fs.mul(5.3)).mul(3).floor();
    const [isGull, isSwallow, isFinch] = [
      float(1).sub(step(0.5, sp)),
      step(0.5, sp).mul(float(1).sub(step(1.5, sp))),
      step(1.5, sp),
    ];

    // ── The path: a wandering loop round the flock centre, swooping up and down.
    const dirSign = step(0.5, fs).mul(2).sub(1);
    const R0 = float(5).add(fs.mul(6)).add(slot.mul(2.4));
    const w = mix(float(0.24), float(0.4), isSwallow).add(fs.mul(0.1)).mul(dirSign);
    const a = time.mul(w).add(fs.mul(30)).sub(slot.mul(0.9).mul(dirSign));
    const at = (q: Node<'float'>) => {
      const r = R0.mul(
        float(1)
          .add(sin(q.mul(2).add(fs.mul(7))).mul(0.28))
          .add(sin(q.mul(7).add(slot.mul(9))).mul(isSwallow).mul(0.12)),
      );
      const y = h.y
        .add(slot.mul(1.4))
        .add(sin(q.mul(1.5).add(slot.mul(4))).mul(mix(float(1.4), float(2.2), isSwallow)));
      return vec3(h.x.add(cos(q).mul(r)), y, h.z.add(sin(q).mul(r)));
    };
    const step_ = dirSign.mul(0.04);
    const p0 = at(a.sub(step_));
    const p1 = at(a);
    const p2 = at(a.add(step_));
    const d1 = p2.sub(p1);
    const d0 = p1.sub(p0);
    const len = max(vec2(d1.x, d1.z).length(), 1e-4);
    const heading = vec2(d1.x, d1.z).div(len);
    const pitch = clamp(atan(d1.y, len), -0.5, 0.5);
    // Bank with the turn: how far the heading swings between the two steps.
    const h0 = vec2(d0.x, d0.z).normalize();
    const turnRate = h0.x.mul(heading.y).sub(h0.y.mul(heading.x));
    const roll = clamp(turnRate.mul(-6), -0.7, 0.7);

    // ── Wings: each species beats its own way; the hand bends further than the arm.
    const beatRate = mix(mix(float(10), float(20), isSwallow), float(26), isFinch);
    const beatPh = time.mul(beatRate).add(slot.mul(13));
    // Faster downstroke than upstroke.
    const beat = sin(beatPh).add(sin(beatPh.mul(2)).mul(0.25));
    const s1 = sin(time.mul(0.4).add(slot.mul(5)).add(fs.mul(11)));
    const bout = mix(
      mix(smoothstep(0.2, 0.55, s1), smoothstep(-0.5, 0.1, s1), isSwallow),
      step(0, sin(time.mul(2.4).add(slot.mul(5)))),
      isFinch,
    );
    // Finches fold their wings between bursts (and dip); gulls glide on an M (arm up, hand down).
    const fold = isFinch.mul(float(1).sub(bout));
    const isWing = step(WING - 0.5, part).mul(step(part, WING + 0.5));
    const span = abs(g.x);
    const hand = smoothstep(HAND - 0.01, HAND + 0.06, span);
    const glide = mix(float(0.1), float(0.04), isSwallow).sub(hand.mul(isGull).mul(0.38));
    const ang = beat
      .mul(0.7)
      .mul(bout)
      .mul(float(1).add(hand.mul(0.6)))
      .add(glide.mul(float(1).sub(bout.mul(0.6))))
      .mul(isWing);
    const fx = mix(float(1), float(0.28), fold.mul(isWing));
    const wx = g.x.mul(fx);
    // Tail: long and forked on swallows.
    const isTail = step(TAIL - 0.5, part);
    const tz = mix(g.z, g.z.mul(mix(float(1), float(1.7), isSwallow)), isTail);
    const flapped = vec3(wx.mul(cos(ang)), g.y.add(span.mul(fx).mul(sin(ang))), tz);
    const nF = vec3(n.x.mul(cos(ang)).sub(sign(g.x).mul(n.y).mul(sin(ang))), n.y.mul(cos(ang)), n.z);
    // Pitch (nose up about x), then roll (about the body axis).
    const rot = (v: Node<'vec3'>) => {
      const y1 = v.y.mul(cos(pitch)).add(v.z.mul(sin(pitch)));
      const z1 = v.z.mul(cos(pitch)).sub(v.y.mul(sin(pitch)));
      return vec3(v.x.mul(cos(roll)).sub(y1.mul(sin(roll))), v.x.mul(sin(roll)).add(y1.mul(cos(roll))), z1);
    };
    // Gull ≈0.24 tiles wingspan, swallow and finch ≈0.12 (were 0.8 / 0.43 / 0.38: an 8 m gull, D-226).
    const size = pickNode(sp, [float(0.45), float(0.24), float(0.22)]);
    const dip = fold.mul(0.12);
    m.positionNode = p1.sub(vec3(0, dip, 0)).add(turn(rot(flapped), heading).mul(size));
    m.normalNode = transformNormalToView(turn(rot(nF), heading));

    // ── Plumage.
    const under = smoothstep(0.004, -0.01, g.y).mul(step(part, BODY + 0.5));
    const tip = smoothstep(0.19, 0.23, span);
    const throat = smoothstep(0.05, 0.09, g.z).mul(smoothstep(0.02, -0.005, g.y));
    const gull = mix(
      mix(color(0xf3f5f4), mix(color(0xa9b4bc), color(0x1a1c1f), tip), isWing),
      color(0xf6f7f5),
      under,
    );
    const swallow = mix(mix(color(0x1d2a4a), color(0xf2ede4), under), color(0xb5532e), throat.mul(step(part, BODY + 0.5)));
    const finch = mix(
      mix(color(0x8a6238), color(0xe0b84a), smoothstep(0.07, 0.11, span).mul(smoothstep(0.17, 0.13, span))),
      color(0xe8d8b8),
      under,
    );
    const plumage = pickNode(sp, [gull, swallow, finch]);
    const beak = pickNode(sp, [color(0xf2b02a), color(0x22201e), color(0xd99a5a)] as unknown as Node<'vec3'>[]);
    m.colorNode = select(
      part.lessThan(BEAK - 0.5),
      plumage,
      select(part.lessThan(EYE - 0.5), beak, select(part.lessThan(TAIL - 0.5), color(0x0e0e10), plumage)),
    ) as unknown as Node<'vec3'>;
    m.roughnessNode = max(float(0.5), float(0.75).sub(under.mul(0.1)));
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
