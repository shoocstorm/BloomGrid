import {
  BufferGeometry,
  CapsuleGeometry,
  DoubleSide,
  Float32BufferAttribute,
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
  fwidth,
  length,
  max,
  min,
  mix,
  normalGeometry,
  normalize,
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
import { U } from '@/render/uniforms';

/** Instanced batches stay above the 1024-instance UBO path (AGENTS.md §8). */
const CAP = 1040;
/** Critters live within this many tiles of the explorer (they are only drawn in explore modes). */
const REGION = 32;
/** Chance per green, open tile (scaled by ecology) of hosting one. */
const DENSITY = 0.16;
/** Size in tiles of the unit model (wingspan ≈0.14 × this). */
const SIZE = 1.1;

/** Parts: body, wings (fore and hind share a colour pattern), antennae, the firefly's lantern. */
const BODY = 0;
const WING = 1;
const FEELER = 2;
const LANTERN = 3;

function tag(g: BufferGeometry, part: number): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.setAttribute(
    'aPart',
    new Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count).fill(part), 1),
  );
  for (const k of Object.keys(geo.attributes))
    if (!['position', 'normal', 'aPart'].includes(k)) geo.deleteAttribute(k);
  return geo;
}

/** A flat rounded wing as a triangle fan from the hinge (x = 0), lying in the xz plane, mirrored by `side`. */
function wing(side: number, len: number, front: number, back: number, sweep: number): BufferGeometry {
  const pts: [number, number][] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI;
    // From the leading edge round the tip to the trailing edge: wide and rounded at the tip.
    const r = len * (0.55 + 0.45 * Math.sin(t));
    const a = -Math.PI / 2 + t + sweep;
    pts.push([Math.cos(a) * r, (Math.sin(a) * (t < Math.PI / 2 ? front : back)) / len]);
  }
  const pos: number[] = [];
  for (let i = 0; i < N; i++) {
    const [x0, z0] = pts[i]!;
    const [x1, z1] = pts[i + 1]!;
    pos.push(0, 0, 0, side * x0, 0, z0 * len, side * x1, 0, z1 * len);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function butterfly(): BufferGeometry {
  const parts: BufferGeometry[] = [
    tag(new CapsuleGeometry(0.0055, 0.042, 3, 8).rotateX(Math.PI / 2).translate(0, 0, -0.004), BODY),
    tag(new SphereGeometry(0.0075, 8, 6).translate(0, 0, 0.024), BODY),
    tag(new SphereGeometry(0.0085, 8, 6).scale(1, 1, 1.5).translate(0, -0.001, -0.026), LANTERN),
  ];
  for (const side of [-1, 1]) {
    // Forewing sweeps forward, hindwing back; a hair apart in height so they never z-fight.
    parts.push(tag(wing(side, 0.07, 0.05, 0.026, 0.35).translate(0, 0.0006, 0.004), WING));
    parts.push(tag(wing(side, 0.05, 0.02, 0.04, -0.55).translate(0, 0, -0.006), WING));
    parts.push(
      tag(
        new CapsuleGeometry(0.0011, 0.026, 2, 4)
          .rotateX(Math.PI / 2 - 0.45)
          .rotateY(side * 0.35)
          .translate(side * 0.005, 0.008, 0.038),
        FEELER,
      ),
    );
  }
  return mergeGeometries(parts)!;
}

/** Picks a colour from a list by an index node (0..n-1). */
function pick(i: Node<'float'>, hexes: number[]): Node<'vec3'> {
  let out: Node<'vec3'> = color(hexes[hexes.length - 1]!) as unknown as Node<'vec3'>;
  for (let k = hexes.length - 2; k >= 0; k--)
    out = select(i.lessThan(k + 0.5), color(hexes[k]!), out) as unknown as Node<'vec3'>;
  return out;
}

/**
 * Meadow critters (D-122, D-124): butterflies over green open ground by day (rounded fore and hind wings with their
 * species' pattern, a body, antennae, flapping on the body's axis and flying the way they face) and fireflies at night
 * (wings folded low, a glowing lantern). Drawn only in explore modes, round the explorer, where they are seen close
 * up; homes are placed on the CPU and every motion is in the shader.
 */
export class Critters {
  readonly mesh: InstancedMesh;
  private home = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
  cx = -1e9;
  cz = -1e9;

  constructor() {
    const geo = butterfly();
    geo.setAttribute('aHome', this.home);
    const m = new MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0, side: DoubleSide });
    const h = attribute('aHome', 'vec4');
    const part = attribute('aPart', 'float');
    const seed = h.w;
    const k = float(0.5).add(fract(seed.mul(3.1)).mul(0.35));
    const t = time.mul(k).add(seed.mul(50));
    // A slow, looping meander a tile or so round home, bobbing above the grass; heading follows the flight.
    const wander = vec3(
      sin(t.mul(0.7)).mul(1.1),
      sin(t.mul(1.9)).mul(0.1).add(0.45),
      cos(t.mul(0.53)).mul(1.1),
    );
    const heading = normalize(
      vec2(cos(t.mul(0.7)).mul(0.77), sin(t.mul(0.53)).mul(-0.58)).add(vec2(1e-4, 0)),
    );
    // Wings beat by day; by night they rest half-open while the lantern glows.
    const beat = abs(sin(time.mul(13).add(seed.mul(20))));
    const flap = mix(beat.mul(1.15).add(0.1), float(0.35), U.night);
    const g = positionGeometry;
    const isWing = step(WING - 0.5, part).mul(step(part, WING + 0.5));
    const ang = flap.mul(isWing);
    // Wings hinge on the body axis (z): rotate each half up by `ang`.
    const flapped = vec3(g.x.mul(cos(ang)), g.y.add(abs(g.x).mul(sin(ang))), g.z);
    const n = normalGeometry as unknown as Node<'vec3'>;
    const nFlap = vec3(n.x.mul(cos(ang)).sub(sign(g.x).mul(n.y).mul(sin(ang))), n.y.mul(cos(ang)), n.z);
    const turn = (v: Node<'vec3'>) =>
      vec3(
        v.x.mul(heading.y).add(v.z.mul(heading.x)),
        v.y,
        v.x.mul(heading.x).negate().add(v.z.mul(heading.y)),
      );
    m.positionNode = h.xyz.add(wander).add(turn(flapped).mul(SIZE));
    m.normalNode = transformNormalToView(turn(nFlap));

    // Species: base colour, wing edge colour. Pattern: dark margins, a few pale spots near the tips, faint veins.
    const species = fract(seed.mul(11.7)).mul(5).floor();
    const base = pick(species, [0xf08a24, 0x3fa9f5, 0xf7e463, 0xf3a6c8, 0xf7f5ee]);
    const edge = pick(species, [0x1d1612, 0x0f1a2e, 0x5a4410, 0x6a2a52, 0x2a2a2a]);
    const wx = abs(g.x);
    const r = length(vec2(wx.div(0.07), g.z.div(0.055)));
    const margin = smoothstep(0.72, 0.86, r);
    const spots = step(length(vec2(wx.sub(0.052), g.z.sub(0.03))), 0.006)
      .add(step(length(vec2(wx.sub(0.058), g.z.sub(0.012))), 0.005))
      .min(1);
    const veins = smoothstep(0.92, 1, abs(sin(g.z.div(wx.add(0.004)).mul(3)))).mul(0.25);
    const wingCol = mix(mix(base.mul(float(1).sub(veins)), edge, margin), color(0xffffff), spots.mul(margin));
    const dark = color(0x2a2420);
    const nightWing = mix(wingCol, dark, U.night.mul(0.75));
    const body = mix(dark, color(0x4a3a2a), step(LANTERN - 0.5, part).mul(float(1).sub(U.night)));
    m.colorNode = select(
      part.lessThan(WING - 0.5),
      dark,
      select(part.lessThan(FEELER - 0.5), nightWing, body),
    ) as unknown as Node<'vec3'>;
    // Fireflies: a slow twinkle in the lantern, dimmed to its share of a pixel (D-064).
    const twinkle = sin(time.mul(1.3).add(seed.mul(31)))
      .mul(0.5)
      .add(0.5);
    const cover = min(float(1), float(0.03).div(max(length(fwidth(positionGeometry)), float(1e-5))));
    const lantern = step(LANTERN - 0.5, part);
    m.emissiveNode = color(0xd8ff7a)
      .mul(lantern.mul(U.night).mul(twinkle.mul(2.5).add(0.4)))
      .mul(cover);
    this.mesh = new InstancedMesh(geo, m, CAP);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.name = 'critters';
  }

  /** Re-homes the critters round a point (deterministic per tile, so a re-home keeps those in view). */
  place(city: City, x: number, z: number): void {
    this.cx = x;
    this.cz = z;
    const g = city.grid;
    const eco = city.fields.ecology;
    const a = this.home.array as Float32Array;
    let n = 0;
    for (let j = Math.max(0, Math.floor(z - REGION)); j < Math.min(g.h, z + REGION) && n < CAP; j++)
      for (let i = Math.max(0, Math.floor(x - REGION)); i < Math.min(g.w, x + REGION) && n < CAP; i++) {
        const t = g.index(i, j);
        if (g.road[t] || g.occupant[t] !== -1 || eco[t]! < 0.35) continue;
        const y = g.heightAt(i + 0.5, j + 0.5);
        if (y < 0.3) continue;
        if (hash2(i, j, 211) > DENSITY * eco[t]!) continue;
        a[n * 4] = i + 0.5;
        a[n * 4 + 1] = y;
        a[n * 4 + 2] = j + 0.5;
        a[n * 4 + 3] = hash2(i, j, 223);
        n++;
      }
    this.mesh.count = n;
    this.home.needsUpdate = true;
  }
}
