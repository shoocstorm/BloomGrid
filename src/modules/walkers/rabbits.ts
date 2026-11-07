import {
  CapsuleGeometry,
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
  floor,
  fract,
  mix,
  normalGeometry,
  normalize,
  positionGeometry,
  select,
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
import { hash1, pick, tag, turn } from './kit';

/** Instanced batches stay above the 1024-instance UBO path (AGENTS.md §8). */
const CAP = 1040;
const REGION = 30;
/** Chance per wooded, open tile (scaled by ecology) of hosting a rabbit. */
const DENSITY = 0.05;
/** Rabbit length in tiles is about 0.13 × this. */
const SIZE = 1.25;
const FUR = 0;
const EAR = 1;
const WHITE = 2;
const EYE = 3;
const NOSE = 4;
/** Ear pivot height (they twitch and lie back on the hop). */
const EAR_PIVOT = 0.1;
const EAR_PIVOT_Z = 0.034;

function rabbitModel() {
  const parts = [
    // Body (long axis z, head at +z), a rounder haunch and the head.
    tag(new SphereGeometry(0.5, 12, 9).scale(0.06, 0.058, 0.1).translate(0, 0.047, -0.002), FUR),
    tag(new SphereGeometry(0.5, 12, 9).scale(0.068, 0.06, 0.06).translate(0, 0.04, -0.03), FUR),
    tag(new SphereGeometry(0.5, 12, 9).scale(0.046, 0.046, 0.054).translate(0, 0.082, 0.04), FUR),
    // Feet: big hind paws, small fore paws.
    tag(new SphereGeometry(0.5, 8, 5).scale(0.022, 0.014, 0.05).translate(0.026, 0.007, -0.02), FUR),
    tag(new SphereGeometry(0.5, 8, 5).scale(0.022, 0.014, 0.05).translate(-0.026, 0.007, -0.02), FUR),
    tag(new CapsuleGeometry(0.007, 0.025, 2, 6).translate(0.014, 0.015, 0.035), FUR),
    tag(new CapsuleGeometry(0.007, 0.025, 2, 6).translate(-0.014, 0.015, 0.035), FUR),
    // A white belly patch and the tail puff.
    tag(new SphereGeometry(0.5, 10, 6).scale(0.044, 0.03, 0.06).translate(0, 0.03, 0.01), WHITE),
    tag(new SphereGeometry(0.016, 10, 8).translate(0, 0.06, -0.076), WHITE),
    // Eyes, nose.
    tag(new SphereGeometry(0.0062, 8, 6).translate(0.019, 0.094, 0.062), EYE),
    tag(new SphereGeometry(0.0062, 8, 6).translate(-0.019, 0.094, 0.062), EYE),
    tag(new SphereGeometry(0.0055, 6, 4).translate(0, 0.084, 0.071), NOSE),
  ];
  // Long ears, tilted out and back from the crown.
  for (const side of [-1, 1])
    parts.push(
      tag(
        new CapsuleGeometry(0.0085, 0.055, 3, 8)
          .scale(1.4, 1, 0.6)
          .rotateZ(side * -0.18)
          .rotateX(-0.25)
          .translate(side * 0.013, 0.135, 0.032),
        EAR,
      ),
    );
  return mergeGeometries(parts)!;
}

/**
 * Rabbits (D-126): brown, grey, cream and white coats with a white belly and tail puff, long ears, eyes and a pink
 * nose. They hop in short bouts between spots near home (five hops, the body stretching on each, ears laid back),
 * then sit and nibble with twitching ears. Explore modes only, on wooded open ground round the camera.
 */
export class Rabbits {
  readonly mesh: InstancedMesh;
  private home = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
  cx = -1e9;
  cz = -1e9;

  constructor() {
    const geo = rabbitModel();
    geo.setAttribute('aHome', this.home);
    const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const h = attribute('aHome', 'vec4');
    const part = attribute('aPart', 'float');
    const seed = h.w;
    const g = positionGeometry;
    const n = normalGeometry as unknown as Node<'vec3'>;
    // A cycle of 5–8 s: hop from spot k to spot k+1 in the first 1.6 s, then rest there.
    const T = float(5).add(fract(seed.mul(3.7)).mul(3));
    const tt = time.div(T).add(seed.mul(9));
    const k = floor(tt);
    const f = fract(tt);
    const spot = (i: Node<'float'>) =>
      vec2(hash1(i.add(seed.mul(71))).sub(0.5), hash1(i.add(seed.mul(53)).add(17)).sub(0.5)).mul(2.4);
    const p0 = spot(k);
    const p1 = spot(k.add(1));
    const hopT = float(1.6).div(T);
    const travel = smoothstep(0, 1, f.div(hopT).clamp(0, 1));
    const hopping = step(f, hopT);
    const at = mix(p0, p1, travel);
    const heading = normalize(p1.sub(p0).add(vec2(1e-4, 0)));
    const hopPhase = f
      .div(hopT)
      .clamp(0, 1)
      .mul(5 * Math.PI);
    const lift = abs(sin(hopPhase)).mul(0.06).mul(hopping);
    // Stretch on the leap, squash on landing; ears lie back while hopping and twitch at rest.
    const stretch = float(1).add(abs(sin(hopPhase)).mul(0.08).mul(hopping));
    const isEar = step(EAR - 0.5, part).mul(step(part, EAR + 0.5));
    const twitch = sin(time.mul(7).add(seed.mul(30)))
      .mul(step(0.85, sin(time.mul(0.9).add(seed.mul(4)))))
      .mul(0.25);
    const earAng = mix(twitch, float(-0.45), hopping).mul(isEar);
    const q = g.y.sub(EAR_PIVOT);
    const ez = g.z.sub(EAR_PIVOT_Z);
    const eared = vec3(
      g.x,
      q
        .mul(cos(earAng))
        .sub(ez.mul(sin(earAng)))
        .add(EAR_PIVOT),
      q.mul(sin(earAng)).add(ez.mul(cos(earAng))).add(EAR_PIVOT_Z),
    );
    const nibble = sin(time.mul(14).add(seed))
      .mul(0.004)
      .mul(float(1).sub(hopping))
      .mul(smoothstep(0.06, 0.09, g.y))
      .mul(step(0.02, g.z));
    const posed = vec3(eared.x, eared.y.div(stretch).add(nibble), eared.z.mul(stretch));
    m.positionNode = vec3(h.x.add(at.x), h.y.add(lift), h.z.add(at.y)).add(turn(posed, heading).mul(SIZE));
    m.normalNode = transformNormalToView(turn(n, heading));

    const coat = pick(fract(seed.mul(11.3)).mul(4).floor(), [0x8a6a4a, 0x9a948a, 0xcdb592, 0xefe9de]);
    // A darker back, lighter flanks.
    const fur = mix(coat, coat.mul(0.72), smoothstep(0.05, 0.1, g.y).mul(step(g.z, 0.03)));
    const ear = mix(fur, color(0xe9a8a8), smoothstep(0.006, 0.0, abs(g.x).sub(0.013).abs()).mul(0.6));
    const c = (hex: number) => color(hex) as unknown as Node<'vec3'>;
    m.colorNode = pickNodeByPart(part, [fur, ear, c(0xf6f2ea), c(0x15110e), c(0xe08a92)]);
    this.mesh = new InstancedMesh(geo, m, CAP);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.name = 'wildlife.rabbits';
  }

  /** Re-homes rabbits on wooded open ground round a point (deterministic per tile). */
  place(city: City, x: number, z: number): void {
    this.cx = x;
    this.cz = z;
    const g = city.grid;
    const eco = city.fields.ecology;
    const a = this.home.array as Float32Array;
    let n = 0;
    for (let j = Math.max(2, Math.floor(z - REGION)); j < Math.min(g.h - 2, z + REGION) && n < CAP; j++)
      for (let i = Math.max(2, Math.floor(x - REGION)); i < Math.min(g.w - 2, x + REGION) && n < CAP; i++) {
        const t = g.index(i, j);
        if (g.road[t] || g.occupant[t] !== -1 || eco[t]! < 0.45) continue;
        // Gentle, dry ground with room to hop.
        const r = g.rangeOver(i - 1, j - 1, 3, 3);
        if (r.min < 0.3 || r.max - r.min > 0.5) continue;
        if (hash2(i, j, 401) > DENSITY * eco[t]!) continue;
        a[n * 4] = i + 0.5;
        a[n * 4 + 1] = g.heightAt(i + 0.5, j + 0.5);
        a[n * 4 + 2] = j + 0.5;
        a[n * 4 + 3] = hash2(i, j, 409);
        n++;
      }
    this.mesh.count = n;
    this.home.needsUpdate = true;
  }
}

function pickNodeByPart(part: Node<'float'>, cols: Node<'vec3'>[]): Node<'vec3'> {
  let out = cols[cols.length - 1]!;
  for (let k = cols.length - 2; k >= 0; k--)
    out = select(part.lessThan(k + 0.5), cols[k]!, out) as unknown as Node<'vec3'>;
  return out;
}
