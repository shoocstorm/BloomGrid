import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
} from 'three/webgpu';
import {
  attribute,
  color,
  cos,
  float,
  fract,
  normalGeometry,
  positionGeometry,
  select,
  sin,
  step,
  transformNormalToView,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A walker's figure (D-124): parts tagged with `aPart` (which colour) and `aLimb` (swing amplitude with its sign, and
 * the pivot height), so one shader can swing legs and arms, turn the body to its heading and colour each part. Built
 * at unit scale (≈0.21 tall); the module scales it. `detailed` is the close-up figure (legs, shoes, arms, hands,
 * head, hair, eyes); the plain one (three parts) is for the city view, where a figure is a few pixels tall.
 */
export const PART = { shoes: 0, legs: 1, shirt: 2, sleeves: 3, skin: 4, hair: 5, eyes: 6 } as const;

/** Leg and arm swing amplitudes (radians) and their pivots (hip, shoulder). */
const LEG = { amp: 0.55, pivot: 0.08 };
const ARM = { amp: 0.42, pivot: 0.148 };

function tag(g: BufferGeometry, part: number, swing = 0, pivot = 0): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute('position').count;
  geo.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  const limb = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    limb[i * 2] = swing;
    limb[i * 2 + 1] = pivot;
  }
  geo.setAttribute('aLimb', new Float32BufferAttribute(limb, 2));
  for (const k of Object.keys(geo.attributes))
    if (!['position', 'normal', 'aPart', 'aLimb'].includes(k)) geo.deleteAttribute(k);
  return geo;
}

export function figureGeometry(detailed: boolean): BufferGeometry {
  if (!detailed)
    return mergeGeometries([
      tag(new CylinderGeometry(0.026, 0.03, 0.08, 5, 1).translate(0, 0.04, 0), PART.legs),
      tag(new CapsuleGeometry(0.036, 0.04, 1, 6).translate(0, 0.114, 0), PART.shirt),
      tag(new SphereGeometry(0.034, 6, 4).translate(0, 0.182, 0), PART.skin),
    ])!;
  const parts: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * 0.019;
    // Leg (hip to ankle) and a shoe that swings with it; the opposite arm swings the other way.
    parts.push(
      tag(
        new CapsuleGeometry(0.016, 0.05, 2, 6).translate(x, 0.042, 0),
        PART.legs,
        side * LEG.amp,
        LEG.pivot,
      ),
    );
    parts.push(
      tag(
        new SphereGeometry(0.5, 6, 4).scale(0.036, 0.022, 0.052).translate(x, 0.009, 0.007),
        PART.shoes,
        side * LEG.amp,
        LEG.pivot,
      ),
    );
    const ax = side * 0.046;
    parts.push(
      tag(
        new CapsuleGeometry(0.011, 0.046, 2, 6).rotateZ(side * 0.08).translate(ax, 0.118, 0),
        PART.sleeves,
        -side * ARM.amp,
        ARM.pivot,
      ),
    );
    parts.push(
      tag(
        new SphereGeometry(0.012, 6, 4).translate(ax + side * 0.003, 0.084, 0.002),
        PART.skin,
        -side * ARM.amp,
        ARM.pivot,
      ),
    );
    // Eyes on the face (+z is forward).
    parts.push(
      tag(
        new SphereGeometry(0.0056, 5, 3).scale(1, 1.25, 0.6).translate(side * 0.0125, 0.186, 0.0315),
        PART.eyes,
      ),
    );
  }
  parts.push(
    tag(new CapsuleGeometry(0.035, 0.038, 2, 8).scale(1, 1, 0.78).translate(0, 0.114, 0), PART.shirt),
  );
  // A small smile under the eyes.
  parts.push(
    tag(new SphereGeometry(0.5, 6, 3).scale(0.011, 0.0035, 0.004).translate(0, 0.171, 0.0326), PART.eyes),
  );
  // A neck, a chibi head and a hair cap set back on the crown.
  parts.push(tag(new CylinderGeometry(0.012, 0.014, 0.02, 6, 1, true).translate(0, 0.152, 0), PART.skin));
  parts.push(tag(new SphereGeometry(0.034, 12, 8).translate(0, 0.182, 0), PART.skin));
  parts.push(
    tag(
      new SphereGeometry(0.0372, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.56)
        .rotateX(-0.32)
        .translate(0, 0.185, -0.004),
      PART.hair,
    ),
  );
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
 * Poses a figure: `phase` drives the stride, `heading` is the walking direction (unit xz). Returns the local offset
 * (scaled by `scale`), the view normal and the part colour (by `seed`).
 */
export function poseFigure(
  phase: Node<'float'>,
  heading: Node<'vec2'>,
  scale: Node<'float'>,
  seed: Node<'float'>,
) {
  const limb = attribute('aLimb', 'vec2');
  const part = attribute('aPart', 'float');
  const ang = limb.x.mul(sin(phase));
  const c = cos(ang);
  const s = sin(ang);
  const swing = (v: Node<'vec3'>, pivot: Node<'float'>) => {
    const q = v.y.sub(pivot);
    return vec3(v.x, q.mul(c).sub(v.z.mul(s)).add(pivot), q.mul(s).add(v.z.mul(c)));
  };
  // Local +z is forward: x → right (fz, −fx), z → heading (fx, fz).
  const turn = (v: Node<'vec3'>) =>
    vec3(
      v.x.mul(heading.y).add(v.z.mul(heading.x)),
      v.y,
      v.x.mul(heading.x).negate().add(v.z.mul(heading.y)),
    );
  const local = turn(swing(positionGeometry, limb.y)).mul(scale);
  const normal = transformNormalToView(turn(swing(normalGeometry, float(0))));

  const shirt = pick(
    fract(seed.mul(17.31)).mul(7).floor(),
    [0xf2a7a0, 0x7fd1c7, 0xf7d36b, 0x9ec5ff, 0xc9a7f2, 0xf4f1e8, 0xe7795f],
  );
  const skin = pick(fract(seed.mul(5.13)).mul(5).floor(), [0xf6d2b4, 0xe8b48e, 0xc68e62, 0x9a6440, 0x6e4430]);
  const hair = pick(
    fract(seed.mul(9.71)).mul(7).floor(),
    [0x2a1d16, 0x15120f, 0x5a3a24, 0xd8b46a, 0x8a4a2a, 0xb9b4ad, 0xe58fb5],
  );
  const legs = pick(fract(seed.mul(3.7)).mul(4).floor(), [0x3e5a7a, 0x9a8a68, 0x33383f, 0x5f7a4a]);
  const shoes = pick(fract(seed.mul(11.3)).mul(3).floor(), [0x2b2b30, 0xf0efe8, 0x8a5a3a]);
  const parts = [shoes, legs, shirt, shirt.mul(0.92), skin, hair, color(0x1c1714)];
  let col: Node<'vec3'> = parts[parts.length - 1] as Node<'vec3'>;
  for (let k = parts.length - 2; k >= 0; k--)
    col = select(part.lessThan(k + 0.5), parts[k]!, col) as unknown as Node<'vec3'>;
  // Only the shirt and sleeves take the faint night glow (a whole glowing body reads as a ghost).
  const cloth = step(PART.shirt - 0.5, part).mul(step(part, PART.sleeves + 0.5));
  return { local, normal, color: col, shirt, cloth };
}
