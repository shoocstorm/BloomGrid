import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
  NormalBlending,
  PlaneGeometry,
  Sphere,
  Vector3,
  Vector4,
} from 'three/webgpu';
import {
  abs,
  attribute,
  clamp,
  cos,
  exp,
  float,
  floor,
  fract,
  fwidth,
  length,
  max,
  mix,
  modelWorldMatrix,
  mrt,
  normalGeometry,
  positionGeometry,
  select,
  sign,
  sin,
  smoothstep,
  step,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Node, UniformNode } from 'three/webgpu';
import { hash2 } from '@/sim/random';
import { U } from '@/render/uniforms';
import { GeoBuilder, skyShade, tf } from '@/render/bake';
import { bloomMRT } from '@/render/bloomMRT';
import { BALL_LO, FLECK, petal, TINY } from './wonderKit';

/**
 * Life in the open sea (D-164, D-231): pods of glowing humpback whales and schools of dolphins, one mesh per pod,
 * every motion posed in the vertex shader from `U.clock` (no per-frame uploads). Each animal runs its own cycle:
 *
 * - **Whales** cruise deep, rise to the surface to blow two or three times with a gentle roll, then arch and dive
 *   with their flukes in the air; on most cycles they first **breach**: burst out of the sea nose first, twist onto
 *   their side in the air and crash back with a splash. Tails beat up and down while they swim. Pods roam a ring of
 *   feeding grounds round the island (`whaleRoute.ts`): the scenery module moves the pod's mesh and passes its
 *   velocity in `route`, and the pod closes up and heads along it while under way.
 * - **Dolphins** race round in a loose school and leap in arcs, each with a splash going in and coming out; now and
 *   then the school runs deep for a while.
 *
 * Kinds of part (`aBody.z`): 0 body (posed), 1 spout (from the blowhole, grows while blowing), 2 splash (at the
 * animal's spot on the water during a breach or a leap). A whale pod also has a child mesh of soft water effects
 * (transparent, one draw): 4 the wake round a whale at the surface (a Kelvin V, a churned trail and the smooth
 * "footprint" a fluke stroke leaves), drawn as smooth functions that widen to at least a pixel and fade to their mean
 * by `fwidth`, so nothing crawls or flashes from far away (D-162); small bright bits (lumen spots, spray) fade out
 * with distance for the same reason. (Rings spreading from breaches and dives were dropped, D-236.)
 */

const LUMEN = 0x8ff7ff;
const WHALE = 0x2f4a60;
const DOLPHIN = 0x5c7488;
const SPRAY = 0xeefcff;
/** Whale and dolphin lengths at size 1 (world units). */
const WHALE_L = 12;
const DOLPHIN_L = 2.6;
/** Blowhole in the whale's frame at size 1 (spouts rise from here). */
const BLOWHOLE = [0, 0.085 * WHALE_L, 0.3 * WHALE_L] as const;

type Key = readonly [u: number, rx: number, ry: number, y: number];
/**
 * Humpback (fractions of the length, tail → nose): a narrow, keeled tail stock, a deep chest, the hump under the
 * dorsal fin, and a long, flattened head whose lower jaw juts a little.
 */
const WHALE_KEYS: Key[] = [
  [0, 0.005, 0.012, 0],
  [0.05, 0.014, 0.03, 0.003],
  [0.12, 0.026, 0.05, 0.007],
  [0.2, 0.044, 0.068, 0.01],
  [0.3, 0.07, 0.088, 0.012],
  [0.4, 0.092, 0.1, 0.01],
  [0.52, 0.108, 0.106, 0.005],
  [0.63, 0.114, 0.104, 0],
  [0.74, 0.108, 0.09, -0.006],
  [0.84, 0.092, 0.068, -0.012],
  [0.92, 0.07, 0.046, -0.016],
  [0.97, 0.044, 0.028, -0.018],
  [0.995, 0.018, 0.012, -0.018],
  [1, 0, 0, -0.018],
];
/** Dolphin: slender, with a rounded melon and a short beak. */
const DOLPHIN_KEYS: Key[] = [
  [0, 0.006, 0.012, 0],
  [0.1, 0.028, 0.05, 0.002],
  [0.3, 0.068, 0.088, 0.01],
  [0.5, 0.092, 0.106, 0.01],
  [0.66, 0.092, 0.1, 0.002],
  [0.8, 0.07, 0.076, -0.004],
  [0.87, 0.05, 0.054, -0.006],
  [0.895, 0.026, 0.024, -0.022],
  [0.97, 0.016, 0.014, -0.026],
  [1, 0, 0, -0.026],
];

function keyAt(keys: Key[], u: number): [number, number, number] {
  for (let i = 1; i < keys.length; i++) {
    const [u1, ...b] = keys[i]!;
    if (u > u1 && i < keys.length - 1) continue;
    const [u0, ...a] = keys[i - 1]!;
    // Smooth between keys so the silhouette has no creases.
    let t = Math.min(1, Math.max(0, (u - u0) / (u1 - u0)));
    t = t * t * (3 - 2 * t);
    return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
  }
  return [0, 0, 0];
}

const bell = (x: number, at: number, w: number) => Math.exp(-(((x - at) / w) ** 2));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface LoftStyle {
  /** Pale belly strength (tint toward white). */
  belly: number;
  /** Humpback details: throat grooves, mouth line, head knobs, the dorsal hump and the knuckles behind it. */
  humpback?: boolean;
  /** Seed for the whale's own markings (pale scars and patches on the back). */
  marks?: number;
}

/**
 * A lofted body `len` long along +z (centred on the origin): elliptical rings from `keys`, a pale belly, and for a
 * humpback the knobbly head (tubercles on the rostrum and chin), the mouth line, throat grooves as real ridges, the
 * hump under the dorsal fin and the knuckles along the tail stock, plus pale scars that differ per whale.
 */
function lofted(keys: Key[], len: number, style: LoftStyle, rings = 30, segs = 18): BufferGeometry {
  const pos: number[] = [];
  const tint: number[] = [];
  const idx: number[] = [];
  const hb = !!style.humpback;
  const seed = style.marks ?? 0;
  for (let i = 0; i <= rings; i++) {
    // Rings bunch toward both ends, where the shape changes fastest.
    const lin = i / rings;
    const u = lin - Math.sin(lin * Math.PI * 2) * 0.05;
    const [rx, ry, y0] = keyAt(keys, u);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      // Flatter belly than back.
      let yy = s < 0 ? s * 0.86 : s;
      let r = 1;
      let t = s < -0.2 ? style.belly * Math.min(1, (-s - 0.2) * 2.2) : s > 0.55 ? -0.08 : 0;
      if (hb) {
        // The hump the dorsal fin stands on, and the knuckles along the top of the tail stock behind it.
        yy += s > 0 ? s ** 6 * (0.16 * bell(u, 0.33, 0.05) + 0.07 * bell(u, 0.25, 0.012) + 0.06 * bell(u, 0.2, 0.012) + 0.05 * bell(u, 0.15, 0.012)) : 0;
        // Head: flat on top, broad; knobs (tubercles) in rows along the rostrum and round the chin.
        if (u > 0.8) {
          const knob = (Math.sin(u * 260) * 0.5 + 0.5) ** 6 * (Math.cos(a * 9) * 0.5 + 0.5) ** 4;
          const where = s > 0.25 ? smooth(0.82, 0.9, u) : s < -0.45 ? smooth(0.88, 0.95, u) : 0;
          r += knob * where * 0.12;
          if (s > 0) yy *= 1 - 0.25 * smooth(0.82, 0.97, u);
          // The lower jaw juts below and a little ahead of the upper.
          if (s < -0.2) r += 0.06 * smooth(0.86, 0.98, u);
        }
        // Throat grooves: alternate ridges and furrows from the chin to the navel, pale and shadowed.
        if (s < -0.4 && u > 0.5 && u < 0.97) {
          const g = j % 2 ? 1 : -1;
          r += g * 0.025 * smooth(0.5, 0.6, u);
          t = g > 0 ? style.belly * 0.98 : style.belly * 0.4;
        }
        // The mouth line: a dark arc from the snout back along the jaw.
        const mouthS = -0.12 - 0.22 * smooth(0.98, 0.78, u);
        if (u > 0.76 && u < 0.99 && Math.abs(s - mouthS) < 0.07 && c !== 0) t = -0.45;
        // Pale scars and patches on the back, different for each whale.
        if (s > 0.1 && u > 0.15 && u < 0.8) {
          const n = Math.sin(u * 23 + seed * 11.3) * Math.sin(a * 3 + seed * 3.7 + u * 6);
          t += 0.09 * smooth(0.45, 0.85, n);
        }
      }
      pos.push(c * rx * len * r, (y0 + yy * ry * r) * len, (u - 0.5) * len);
      tint.push(t);
    }
  }
  const row = segs + 1;
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      const a = i * row + j;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('tint', new Float32BufferAttribute(tint, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface BladeShape {
  /** Span from the root (+x). */
  len: number;
  /** Chord at span fraction `u` (the blade runs from its leading edge back along −z). */
  chord: (u: number) => number;
  /** Leading edge's z at `u` (negative = swept back). */
  lead: (u: number) => number;
  /** Thickness at `u`. */
  thick: (u: number) => number;
  /** Tint of the top and bottom faces at (`u`, `v`: 0 leading → 1 trailing edge). */
  top: (u: number, v: number) => number;
  bottom: (u: number, v: number) => number;
}

/**
 * A fin as a thin cambered blade: span along +x (−x when `mirror`), chord back along −z, a rounded leading edge
 * thinning to a sharp trailing one. Top and bottom share their edges, so it is closed and lit from both sides.
 */
function blade(b: BladeShape, mirror: boolean, nu = 14, nv = 6): BufferGeometry {
  const pos: number[] = [];
  const tint: number[] = [];
  const idx: number[] = [];
  const sx = mirror ? -1 : 1;
  for (const side of [1, -1])
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const ch = b.chord(u);
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const half = (b.thick(u) / 2) * Math.sin(Math.PI * Math.pow(v, 0.6));
        pos.push(sx * u * b.len, side * half, b.lead(u) - v * ch);
        tint.push(side > 0 ? b.top(u, v) : b.bottom(u, v));
      }
    }
  const row = nv + 1;
  const half = (nu + 1) * row;
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * row + j;
      const [c, d, e] = [a + row, a + 1, a + row + 1];
      // Winding so the top faces up and the bottom down (reversed for the mirrored blade).
      const top = [a, c, d, d, c, e];
      const bot = [half + a, half + d, half + c, half + d, half + e, half + c];
      idx.push(...(mirror ? [top[0]!, top[2]!, top[1]!, top[3]!, top[5]!, top[4]!] : top));
      idx.push(...(mirror ? [bot[0]!, bot[2]!, bot[1]!, bot[3]!, bot[5]!, bot[4]!] : bot));
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('tint', new Float32BufferAttribute(tint, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Humpback flukes, one half (they are a fifth of the body across each side): swept, pointed tips, a scalloped
 * trailing edge with the notch in the middle; underneath the black-and-white pattern every humpback has its own
 * (`variant` picks one of four).
 */
const fluke = (variant: number, mirror: boolean) =>
  blade(
    {
      len: 0.17 * WHALE_L,
      chord: (u) => {
        const base = 0.085 * WHALE_L * (1 - u ** 1.7) ** 0.65;
        const notch = 0.55 + 0.45 * smooth(0, 0.14, u);
        const scallop = 1 + 0.07 * Math.sin(u * Math.PI * 9) * smooth(0.12, 0.3, u) * (1 - smooth(0.8, 0.95, u));
        return Math.max(0.004 * WHALE_L, base * notch * scallop);
      },
      lead: (u) => -0.05 * WHALE_L * u ** 1.5 + 0.012 * WHALE_L * Math.sin(u * Math.PI) * (1 - u),
      thick: (u) => 0.016 * WHALE_L * (1 - u * 0.85),
      top: () => -0.06,
      bottom: (u, v) => {
        // White with a dark trailing margin and the whale's own dark blotches.
        const margin = smooth(0.72, 0.95, v);
        const blot = Math.sin(u * (7 + variant * 3) + variant * 2.1) * Math.sin(v * (5 + variant) + u * 4 + variant);
        const dark = Math.max(margin, smooth(0.3 - variant * 0.1, 0.7 - variant * 0.1, blot) * 0.8);
        return 0.78 - dark * 0.8;
      },
    },
    mirror,
    16,
    7,
  );
/** The humpback's long pectoral flipper (a third of the body), pale, with knobs along its leading edge. */
const flipper = (mirror: boolean) =>
  blade(
    {
      len: 0.3 * WHALE_L,
      chord: (u) => 0.075 * WHALE_L * (1 - 0.62 * u) * (1 - smooth(0.85, 1, u) * 0.7),
      lead: (u) => 0.012 * WHALE_L * Math.max(0, Math.sin(u * Math.PI * 11)) ** 2 * smooth(0.05, 0.2, u) - 0.03 * WHALE_L * u,
      thick: (u) => 0.022 * WHALE_L * (1 - u * 0.7),
      top: (u) => 0.32 - 0.25 * smooth(0.5, 0.0, u),
      bottom: () => 0.8,
    },
    mirror,
    18,
    5,
  );
/** The small, hooked dorsal fin (stood upright when placed). */
const DORSAL = blade(
  {
    len: 0.05 * WHALE_L,
    chord: (u) => 0.075 * WHALE_L * (1 - u) ** 0.8 + 0.006 * WHALE_L,
    lead: (u) => -0.05 * WHALE_L * u ** 1.3,
    thick: (u) => 0.014 * WHALE_L * (1 - u * 0.8),
    top: () => -0.05,
    bottom: () => -0.05,
  },
  false,
  6,
  5,
);

/** A splash's spray spike (a few pixels across: five sides do). */
const SPIKE = new CylinderGeometry(0, 1, 1, 5, 1, true).translate(0, 0.5, 0);
const SPRAY_CONE = new CylinderGeometry(0.55, 0.12, 1, 8, 1, true).translate(0, 0.5, 0);
/** The water effects' quads (−1..1 in x and z). */
const QUAD = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const BODIES = new Map<number, BufferGeometry>();
const whaleBody = (variant: number) => {
  let g = BODIES.get(variant);
  if (!g) BODIES.set(variant, (g = lofted(WHALE_KEYS, WHALE_L, { belly: 0.66, humpback: true, marks: variant + 1 }, 52, 28)));
  return g;
};
const FLUKES = new Map<number, [BufferGeometry, BufferGeometry]>();
const flukesOf = (variant: number) => {
  let g = FLUKES.get(variant);
  if (!g) FLUKES.set(variant, (g = [fluke(variant, false), fluke(variant, true)]));
  return g;
};
const FLIPPERS = [flipper(false), flipper(true)] as const;
const DOLPHIN_BODY = lofted(DOLPHIN_KEYS, DOLPHIN_L, { belly: 0.7 }, 22, 14);

type Extra = Record<string, number[]>;

/** One whale (size `s`, markings `variant`) into `b`, its frame forward +z. */
function whale(b: GeoBuilder, s: number, variant: number, ex: Extra, spout: Extra, splash: Extra): void {
  const L = WHALE_L * s;
  b.add(whaleBody(variant), tf(0, 0, 0, 0, 0, 0, s), WHALE, 0.12, ex);
  // Flukes at the tail's tip, level, with a slight lift toward the tips.
  const [right, left] = flukesOf(variant);
  b.add(right, tf(0, 0.002 * L, -0.485 * L, 0, 0, 0.06, s), WHALE, 0.1, ex);
  b.add(left, tf(0, 0.002 * L, -0.485 * L, 0, 0, -0.06, s), WHALE, 0.1, ex);
  // Long pectoral flippers from low on the flanks, drooping and swept back.
  b.add(FLIPPERS[0], tf(0.085 * L, -0.055 * L, 0.2 * L, 0, 0.6, -0.5, s), WHALE, 0.1, ex);
  b.add(FLIPPERS[1], tf(-0.085 * L, -0.055 * L, 0.2 * L, 0, -0.6, 0.5, s), WHALE, 0.1, ex);
  // The dorsal fin, stood up on its hump (blade span +x turned to +y).
  b.add(DORSAL, tf(0, 0.098 * L, -0.15 * L, 0, 0, Math.PI / 2, s), WHALE, 0.1, ex);
  // Eyes low on the flanks behind the mouth's corner, and a few pale barnacles on the chin.
  for (const side of [-1, 1]) b.add(TINY, tf(side * 0.094 * L, -0.02 * L, 0.27 * L, 0, 0, 0, 0.01 * L), 0x0d1820, 0, ex);
  for (let k = 0; k < 5; k++)
    b.add(
      TINY,
      tf((k - 2) * 0.012 * L, -0.06 * L, (0.43 + (k % 2) * 0.02) * L, 0, k, 0, 0.008 * L, 0.005 * L, 0.008 * L),
      0xaab6b5,
      0,
      ex,
    );
  // Glowing lumen spots in two rows along the flanks.
  for (const side of [-1, 1])
    for (let k = 0; k < 6; k++) {
      const z = (0.2 - k * 0.075) * L;
      const [rx, ry, y0] = keyAt(WHALE_KEYS, z / L + 0.5);
      b.add(TINY, tf(side * rx * L * 0.82, (y0 + ry * 0.55) * L, z, 0, 0, 0, 0.014 * L), LUMEN, 2.4, ex);
    }
  // A humpback's bushy blow: a column of spray widening as it rises into a billow of mist.
  b.add(SPRAY_CONE, tf(0, 0, 0, 0, 0, 0, 1, 3.6, 1), SPRAY, 0.15, spout);
  for (let m = 0; m < 6; m++) {
    const a = m * 2.4;
    const r = m === 0 ? 0 : 0.55;
    const k = 0.65 + (m % 3) * 0.18;
    b.add(BALL_LO, tf(Math.cos(a) * r, 3.8 + (m % 2) * 0.5, Math.sin(a) * r, 0, 0, 0, k, k * 0.8, k), SPRAY, 0.15, spout);
  }
  splashParts(b, 1.2 * s, splash, 13);
}

/** A dolphin (size `s`): sleek body, a curved dorsal fin, flippers and flukes. */
function dolphin(b: GeoBuilder, s: number, ex: Extra, splash: Extra): void {
  const L = DOLPHIN_L * s;
  b.add(DOLPHIN_BODY, tf(0, 0, 0, 0, 0, 0, s), DOLPHIN, 0.05, ex);
  // A falcate dorsal fin standing up, leaning back.
  b.add(
    petal(0.2 * DOLPHIN_L, 0.16 * DOLPHIN_L, 0, -0.1, 0, 4, 2),
    tf(0, 0.08 * L, 0.04 * L, -0.85, Math.PI, Math.PI / 2, s),
    DOLPHIN,
    0.05,
    ex,
  );
  for (const side of [-1, 1]) {
    b.add(
      petal(0.15 * DOLPHIN_L, 0.08 * DOLPHIN_L, 0, -0.03, 0, 4, 1),
      tf(side * 0.06 * L, -0.05 * L, 0.2 * L, 0.35, side * (Math.PI / 2 + 0.7), 0, s),
      DOLPHIN,
      0.05,
      ex,
    );
    b.add(
      petal(0.16 * DOLPHIN_L, 0.08 * DOLPHIN_L, 0, 0.02, 0.2, 4, 1),
      tf(side * 0.003 * L, 0.003 * L, -0.49 * L, 0, Math.PI - side * 1.1, 0, s),
      DOLPHIN,
      0.05,
      ex,
    );
  }
  for (const side of [-1, 1]) b.add(TINY, tf(side * 0.055 * L, 0, 0.36 * L, 0, 0, 0, 0.012 * L), 0x0d1820, 0, ex);
  splashParts(b, 0.45 * s, splash, 9, true);
}

/**
 * A splash at the water: a crown of spray spikes of uneven height leaning outward, a plume in the middle (`r`
 * across, grown in the shader) and, for dolphins (whose splashes have no soft rings), a foam disc.
 */
function splashParts(b: GeoBuilder, r: number, ex: Extra, n: number, disc = false): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (k % 2) * 0.2;
    const tall = 1.1 + ((k * 7) % 5) * 0.22;
    const lean = 0.35 + ((k * 3) % 4) * 0.08;
    b.add(
      SPIKE,
      tf(Math.cos(a) * r, 0, Math.sin(a) * r, Math.sin(a) * lean, 0, -Math.cos(a) * lean, 0.26 * r, tall * r, 0.26 * r),
      SPRAY,
      0.12,
      ex,
    );
  }
  b.add(BALL_LO, tf(0, 0.6 * r, 0, 0, 0, 0, 0.75 * r, 1.5 * r, 0.75 * r), SPRAY, 0.12, ex);
  if (disc) b.add(FLECK, tf(0, 0.02, 0, 0, 0, 0, 1.9 * r, 1, 1.9 * r), SPRAY, 0.15, ex);
}

/** Rotates `v` by roll (about z), then pitch (nose up about x), then yaw to the heading (`tx`, `tz`). */
function pose(v: Node<'vec3'>, roll: Node<'float'>, pitch: Node<'float'>, tx: Node<'float'>, tz: Node<'float'>) {
  const [cr, sr, cp, sp] = [cos(roll), sin(roll), cos(pitch), sin(pitch)];
  const x1 = v.x.mul(cr).sub(v.y.mul(sr));
  const y1 = v.x.mul(sr).add(v.y.mul(cr));
  const y2 = y1.mul(cp).add(v.z.mul(sp));
  const z2 = v.z.mul(cp).sub(y1.mul(sp));
  return vec3(x1.mul(tz).add(z2.mul(tx)), y2, x1.mul(tx.negate()).add(z2.mul(tz)));
}

/**
 * x², written as x · x: WGSL / Metal `pow` is undefined for a negative base. Likewise every `smoothstep` here runs low
 * to high with distinct edges (undefined otherwise): one NaN pixel survives zero opacity (NaN × 0) and the bloom's
 * blur smears it over a whole region, which showed as a dark square on the night sea round the whales (D-236).
 */
const sq = (x: Node<'float'>) => x.mul(x);
const bump = (x: Node<'float'>, at: number, w: number) => exp(sq(x.sub(at).div(w)).negate());

/**
 * Every animal's swim and cycle from its attributes (shared by the body and the water effects). `route` = the
 * pod's velocity (x, z) and how far it is under way (z: 0 lingering … 1 travelling); zero for pods that stay put.
 */
function swim(route: UniformNode<'vec4', Vector4>) {
  const P = attribute('aPath', 'vec4'); // centre x, z, radius, angular speed (signed)
  const B = attribute('aBody', 'vec4'); // angle offset, seed, part kind, size
  const C = attribute('aCyc', 'vec4'); // cycle seconds, dolphin (0/1), breach roll side, school seed
  const [s, seed, kind, T, isD] = [B.w, B.y, B.z, C.x, C.y];
  const t = U.clock;
  const ph = t.div(T).add(seed);
  const c = fract(ph);
  const tc = c.mul(T);
  const rnd = fract(sin(floor(ph).mul(12.9898).add(seed.mul(78.233))).mul(43758.5453));
  const breach = step(0.42, rnd);

  // ── Whale: deep → (breach) → surface and blow → fluke-up dive → deep.
  const bStart = T.mul(0.5).sub(4.4);
  const uu = tc.sub(bStart).div(3.2);
  const u = clamp(uu, 0, 1);
  const bw = breach.mul(smoothstep(-0.12, 0, uu)).mul(float(1).sub(smoothstep(1.0, 1.3, uu)));
  const rise = smoothstep(0.5, 0.55, c).mul(float(1).sub(smoothstep(0.76, 0.84, c)));
  const roll0 = sin(t.mul(0.9).add(seed.mul(9)));
  const hReg = mix(s.mul(-6), s.mul(-0.5), rise).add(rise.mul(s).mul(0.16).mul(roll0));

  // The dive: the back arches over and the head goes down first, so only the tail stock and flukes rise clear.
  const dive = smoothstep(0.735, 0.775, c).mul(float(1).sub(smoothstep(0.79, 0.84, c)));
  const pitchReg = smoothstep(0.48, 0.51, c)
    .sub(smoothstep(0.53, 0.56, c))
    .mul(0.22)
    .sub(dive.mul(1.05))
    .add(rise.mul(0.05).mul(roll0));
  const hB = s.mul(-6).add(s.mul(38).mul(u).mul(float(1).sub(u)));
  const pitchB = mix(float(1.25), float(-0.55), smoothstep(0.05, 1, u));
  const hW = mix(hReg.sub(dive.mul(s).mul(2.6)), hB, bw);
  const pitchW = mix(pitchReg, pitchB, bw);
  const rollW = C.z.mul(1.9).mul(smoothstep(0.3, 0.9, u)).mul(bw);
  const spoutW = rise
    .pow(3)
    .mul(smoothstep(0.55, 0.95, sin(t.mul(1.1).add(seed.mul(13)))))
    .mul(float(1).sub(step(0.73, c)));
  const splashW = bw.mul(bump(uu, 0.2, 0.09).add(bump(uu, 0.86, 0.12).mul(1.5)));

  // ── Dolphin: porpoising arcs while the school is up, running deep otherwise.
  const g = smoothstep(0.22, 0.3, fract(t.div(55).add(C.w))).mul(float(1).sub(smoothstep(0.88, 0.96, fract(t.div(55).add(C.w)))));
  const lu = clamp(c.sub(0.45).div(0.55), 0, 1);
  const leap = s.mul(-1.3).add(s.mul(9.2).mul(lu).mul(float(1).sub(lu)));
  const hD = mix(s.mul(-3), leap, g);
  const pitchD = g
    .mul(0.95)
    .mul(float(1).sub(lu.mul(2)))
    .mul(smoothstep(0.4, 0.47, c))
    .mul(float(1).sub(smoothstep(0.975, 1, c)));
  const splashD = g.mul(bump(c, 0.53, 0.03).add(bump(fract(c.add(0.5)), 0.48, 0.035)));

  const h = mix(hW, hD, isD);
  const pitch = mix(pitchW, pitchD, isD);
  const roll = mix(rollW, float(0), isD);

  // Path: round the pod's centre, the radius wandering slowly; a pod under way closes up to a third of it.
  const close = mix(float(1), float(0.32), route.z);
  const radius = (time: Node<'float'>) =>
    P.z.mul(float(1).add(sin(time.mul(0.021).add(seed.mul(3))).mul(mix(float(0.22), float(0.06), isD)))).mul(close);
  const orbit = (time: Node<'float'>) => {
    const th = B.x.add(time.mul(P.w));
    const R = radius(time);
    return vec3(P.x.add(R.mul(cos(th))), U.waterLevel, P.y.add(R.mul(sin(th))));
  };
  const th = B.x.add(t.mul(P.w));
  const R = radius(t);
  const at = orbit(t);
  // Heading: along the swim round the centre plus the pod's own drift (just the swim while it lingers).
  const dir = sign(P.w);
  const swirl = vec2(sin(th).negate(), cos(th)).mul(R.mul(P.w).add(dir.mul(1e-4)));
  const head = swirl.add(route.xy);
  const hl = max(length(head), float(1e-4));
  const [tx, tz] = [head.x.div(hl), head.y.div(hl)];
  return { P, B, C, s, seed, kind, T, isD, t, c, tc, uu, bw, rise, dive, breach, bStart, h, pitch, roll, at, tx, tz, spoutW, splashW, splashD, orbit };
}

/** World distance from the eye to a local point of the mesh (to fade small bright bits by their size on screen). */
const eyeDistance = (p: Node<'vec3'>) => length(U.eye.sub(modelWorldMatrix.mul(vec4(p, 1)).xyz));

/** The pod material: body, spouts and splashes (see the class comment). */
function podMaterial(route: UniformNode<'vec4', Vector4>): MeshBasicNodeMaterial {
  const w = swim(route);
  const { s, kind, isD, t, seed, bw, h, pitch, roll, at, tx, tz } = w;
  const far = eyeDistance(at);
  // Spray is a few pixels wide from the island view: grow it from nothing near, never show it as flecks far off.
  const near = float(1).sub(smoothstep(300, 520, far));

  // Body: the tail beats up and down, stronger toward the flukes (less in the air).
  const p = positionGeometry;
  const halfL = mix(float(WHALE_L / 2), float(DOLPHIN_L / 2), isD).mul(s);
  const wgt = clamp(p.z.negate().div(halfL), 0, 1).pow(2);
  const beat = sin(t.mul(mix(float(1.3), float(7), isD)).add(seed.mul(5)).add(p.z.div(halfL).mul(2.2)));
  const flex = beat.mul(wgt).mul(halfL).mul(mix(float(0.06), float(0.07), isD)).mul(float(1).sub(bw.mul(0.6)));
  const body = at.add(vec3(0, h, 0)).add(pose(vec3(p.x, p.y.add(flex), p.z), roll, pitch, tx, tz));

  const hole = pose(vec3(BLOWHOLE[0], BLOWHOLE[1], BLOWHOLE[2]).mul(s), roll, pitch, tx, tz);
  const sw = w.spoutW.mul(near);
  const spout = at.add(vec3(0, h, 0)).add(hole).add(p.mul(vec3(sw.pow(0.5), sw, sw.pow(0.5))));
  const env = mix(w.splashW, w.splashD, isD).mul(near);
  const splash = at.add(p.mul(vec3(env.pow(0.5), env, env.pow(0.5))));

  const m = new MeshBasicNodeMaterial();
  m.positionNode = select(kind.lessThan(0.5), body, select(kind.lessThan(1.5), spout, splash));
  const n = select(kind.lessThan(0.5), pose(normalGeometry, roll, pitch, tx, tz), normalGeometry);
  const col = attribute('color', 'vec3');
  // Lumen spots are a fraction of a unit: they fade out before they shrink under a pixel (no twinkling specks).
  const glow = col
    .mul(attribute('aGlow', 'float'))
    .mul(U.night.mul(0.9).add(0.04))
    .mul(varying(float(1).sub(smoothstep(120, 300, far))));
  m.colorNode = skyShade(col, n).add(glow);
  bloomMRT(m, mrt({ emissive: glow.mul(0.7) }));
  return m;
}

/** Smooth 2D value noise in 0..1 (hashed cell corners, eased between them: no hard edges to alias). */
function vnoise(p: Node<'vec2'>): Node<'float'> {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));
  const h = (o: Node<'vec2'>) => fract(sin(i.add(o).dot(vec2(127.1, 311.7))).mul(43758.5453));
  const a = h(vec2(0, 0));
  const b = h(vec2(1, 0));
  const c = h(vec2(0, 1));
  const d = h(vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/**
 * The pod's water effect (kind 4, see the class comment): the wake round a whale at the surface, soft foam, crests and
 * a slick on a transparent quad lying on the sea, by night with a faint blue-green glow (the lumen whales stir the
 * plankton).
 */
function waveMaterial(route: UniformNode<'vec4', Vector4>): MeshBasicNodeMaterial {
  const w = swim(route);
  const { s, t, at, tx, tz, h, bw } = w;
  const L = s.mul(WHALE_L);
  const q = positionGeometry;
  const lift = vec3(0, 0.05, 0);

  // ── 4 · Wake round a whale at the surface: a frame on its heading, from just ahead of the head to 3.5 lengths aft.
  const surf = smoothstep(s.mul(-3.2), s.mul(-0.7), h).mul(float(1).sub(bw));
  const along = mix(L.mul(-2.6), L.mul(0.2), q.z.mul(0.5).add(0.5));
  const across = q.x.mul(L).mul(0.95);
  const headAt = at.add(vec3(tx, 0, tz).mul(L.mul(0.45)));
  const wakePos = headAt
    .add(vec3(tx, 0, tz).mul(along))
    .add(vec3(tz, 0, tx.negate()).mul(across))
    .mul(step(0.01, surf))
    .add(lift);

  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending, side: DoubleSide });
  m.positionNode = wakePos;

  // Fragment: both kinds from the quad's own −1..1 coordinates.
  const vSurf = varying(surf);
  const vL = varying(L);

  /** A soft line at `d` = 0, `wd` wide but never under ~1.5 pixels (energy kept as it widens: it fades instead). */
  const line = (d: Node<'float'>, wd: Node<'float'>) => {
    const px = fwidth(d).mul(1.5);
    const ww = max(max(wd, px), float(1e-4));
    return exp(sq(d.div(ww)).negate()).mul(wd.div(ww));
  };
  /**
   * Broken foam in 0..1: two octaves of smooth value noise drifting in world units (`x`, `z`, cells `scale` wide),
   * faded to its mean (0.5) once the cells are under a few pixels.
   */
  const churn = (x: Node<'float'>, z: Node<'float'>, scale: Node<'float'>) => {
    const p = vec2(x, z).div(scale);
    const n = vnoise(p.add(vec2(t.mul(0.15), t.mul(-0.1))))
      .mul(0.65)
      .add(vnoise(p.mul(2.3).add(vec2(t.mul(-0.25), t.mul(0.2)))).mul(0.35));
    const blur = clamp(length(fwidth(p)).mul(1.5), 0, 1);
    return mix(n, float(0.5), blur);
  };

  // Wake.
  const a = mix(vL.mul(-2.6), vL.mul(0.2), q.z.mul(0.5).add(0.5));
  const b = q.x.mul(vL).mul(0.95);
  const d = a.negate();
  const behind = smoothstep(0, vL.mul(0.4), d).mul(float(1).sub(smoothstep(vL.mul(0.8), vL.mul(2.5), d)));
  // Kelvin arms at ~19.5° each side of the track, thin, broadening and fading aft (a whale swims slowly).
  const arm = line(abs(b).sub(d.mul(0.354)), vL.mul(0.012).add(d.mul(0.012))).mul(behind);
  // Edges low to high, and never equal (at d = 0 they met: 0 / 0, NaN, which the bloom smeared over the quad).
  const dd = max(d, vL.mul(0.02));
  const inside = float(1).sub(smoothstep(dd.mul(0.2), dd.mul(0.33), abs(b))).mul(behind);
  const ripple = sin(d.div(vL).mul(9).sub(t.mul(1.6))).mul(0.5).add(0.5);
  const transverse = inside.mul(ripple).mul(float(1).sub(clamp(fwidth(d.div(vL).mul(9)), 0, 1)));
  // The footprint: a smooth, glassy oval where the flukes stroked, with broken foam round the tail.
  const fp = float(1).sub(smoothstep(vL.mul(0.08), vL.mul(0.26), abs(b))).mul(exp(sq(d.sub(vL.mul(1.5)).div(vL.mul(0.9))).negate()));
  const tail = float(1).sub(smoothstep(vL.mul(0.05), vL.mul(0.2), abs(b))).mul(exp(sq(d.sub(vL).div(vL.mul(0.35))).negate()));
  const froth = tail.mul(smoothstep(0.3, 0.75, churn(b, a, vL.mul(0.12))));
  // A low bow wave curling off the head to both sides.
  const bow = line(vec2(a.add(vL.mul(0.02)), b.mul(0.9)).length().sub(vL.mul(0.1)), vL.mul(0.015)).mul(
    smoothstep(vL.mul(-0.12), vL.mul(0.04), a),
  );
  const wakeFoam = arm.mul(0.28).add(transverse.mul(0.035)).add(froth.mul(0.45)).add(bow.mul(0.3));
  const wakeOp = wakeFoam.add(fp.mul(0.1)).mul(vSurf);

  const foamAmt = wakeFoam.mul(vSurf);
  const op = wakeOp.min(0.9);
  // Foam white by day; at night a faint plankton glow in the churn.
  // (Dim after dark: windows and lamps outshine the sea, D-230.)
  const glow = vec3(0.45, 1.0, 0.95).mul(U.night.mul(0.16)).mul(foamAmt.min(1));
  m.colorNode = mix(vec3(0.82, 0.93, 0.98), vec3(0.95, 0.99, 1), foamAmt.min(1)).mul(mix(float(1), float(0.22), U.night)).add(glow);
  m.opacityNode = op;
  bloomMRT(m, mrt({ emissive: vec4(glow.mul(0.6), op) }));
  return m;
}

/** Route uniform for pods that stay where they are (dolphins, the gallery's whales). */
const STILL = uniform(new Vector4());
const pods = new Map<UniformNode<'vec4', Vector4>, MeshBasicNodeMaterial>();
const waves = new Map<UniformNode<'vec4', Vector4>, MeshBasicNodeMaterial>();
const podMat = (r: UniformNode<'vec4', Vector4>) => pods.get(r) ?? (pods.set(r, podMaterial(r)), pods.get(r)!);
const waveMat = (r: UniformNode<'vec4', Vector4>) => waves.get(r) ?? (waves.set(r, waveMaterial(r)), waves.get(r)!);

/** A roaming pod's handle: move `mesh` to the pod's centre and set `route` (velocity x, z; travel) each frame. */
export interface RoamingPod {
  mesh: Mesh;
  route: UniformNode<'vec4', Vector4>;
}

/**
 * A pod of `n` whales (the first a big adult, the last a calf beside its mother) circling `x`, `z` (pod `p`
 * decides the direction and the phases). With `roaming`, the pod is built round its mesh's origin and gets its own
 * `route` uniform, for the scenery module to move it round the island (`whaleRoute.ts`).
 */
export function whalePod(x: number, z: number, p: number, n = 4, roaming = false): Mesh & { route?: UniformNode<'vec4', Vector4> } {
  const route = roaming ? uniform(new Vector4()) : STILL;
  const [cx, cz] = roaming ? [0, 0] : [x, z];
  const b = new GeoBuilder({ aPath: 4, aBody: 4, aCyc: 4 });
  const fx = new GeoBuilder({ aPath: 4, aBody: 4, aCyc: 4 });
  for (let w = 0; w < n; w++) {
    const { s, calf, T, seed, side } = whaleParams(p, w, n);
    const h = (k: number) => hash2(p * 7 + w, k, 9901);
    const lane = calf ? 1 : w;
    const path = [cx, cz, 22 + lane * 6 + (calf ? 3 : 0), 0.032 * (p % 2 ? -1 : 1)];
    const a0 = calf ? 1 * 0.5 + 0.12 : w * 0.5 + h(2) * 0.2;
    const cyc = [T, 0, side, 0];
    const kind = (k: number): Extra => ({ aPath: path, aBody: [a0, seed, k, s], aCyc: cyc });
    whale(b, s, (p * 3 + w) % 4, kind(0), kind(1), kind(2));
    fx.add(QUAD, tf(0, 0, 0), SPRAY, 0, kind(4));
  }
  const mesh = podMesh(b, cx, cz, 70, 'whales', podMat(route));
  const water = podMesh(fx, cx, cz, 90, 'whales.waves', waveMat(route));
  // Drawn after the sea (which writes no depth), like the ferry's wake.
  water.renderOrder = 7;
  mesh.add(water);
  if (roaming) mesh.position.set(x, 0, z);
  return Object.assign(mesh, roaming ? { route } : {});
}

/** Whale `w` of pod `p`: size, cycle length and phase (a calf, the last, keeps to its mother's cycle a beat behind). */
function whaleParams(p: number, w: number, n: number) {
  const calf = w === n - 1 && n > 2;
  const h = (k: number) => hash2(p * 7 + (calf && k > 2 ? 1 : w), k, 9901);
  return {
    calf,
    s: w === 0 ? 1.4 : calf ? 0.55 : 0.95 + h(1) * 0.3,
    T: 44 + h(3) * 18,
    seed: calf ? p * 2.1 + 0.7 + 0.03 : p * 2.1 + w * 0.7,
    side: h(4) < 0.5 ? -1 : 1,
  };
}

const frac = (v: number) => v - Math.floor(v);

/** What pod `p` is doing at `clock` (the shader's cycle on the CPU), the liveliest whale first. */
export function whalesNow(p: number, clock: number, n = 4): string {
  let best = 0;
  for (let w = 0; w < n; w++) {
    const { T, seed } = whaleParams(p, w, n);
    const ph = clock / T + seed;
    const c = frac(ph);
    const uu = (c * T - (T * 0.5 - 4.4)) / 3.2;
    const breach = frac(Math.sin(Math.floor(ph) * 12.9898 + seed * 78.233) * 43758.5453) >= 0.42;
    const now = breach && uu > -0.1 && uu < 1.2 ? 4 : c > 0.5 && c < 0.735 ? 3 : c >= 0.735 && c < 0.84 ? 2 : 1;
    best = Math.max(best, now);
  }
  return ['', 'Cruising deep', 'Diving, flukes up', 'Surfacing to blow', 'Breaching!'][best]!;
}

/** Whether school `p` is leaping at `clock` (else it is running deep). */
export function dolphinsLeaping(p: number, clock: number): boolean {
  const f = frac(clock / 55 + p * 0.37);
  return f > 0.26 && f < 0.92;
}

/** A school of `n` dolphins racing round `x`, `z`. */
export function dolphinSchool(x: number, z: number, p: number, n = 7): Mesh {
  const b = new GeoBuilder({ aPath: 4, aBody: 4, aCyc: 4 });
  for (let d = 0; d < n; d++) {
    const h = (k: number) => hash2(p * 13 + d, k, 7717);
    const s = 0.85 + h(1) * 0.35;
    const path = [x, z, 30 + (h(2) - 0.5) * 7, 0.2 * (p % 2 ? 1 : -1)];
    const a0 = (d % 4) * 0.09 + h(3) * 0.06;
    const cyc = [2.4 + h(4) * 0.5, 1, 0, p * 0.37];
    const kind = (k: number): Extra => ({ aPath: path, aBody: [a0, h(5), k, s], aCyc: cyc });
    dolphin(b, s, kind(0), kind(2));
  }
  return podMesh(b, x, z, 46, 'dolphins', podMat(STILL));
}

function podMesh(b: GeoBuilder, x: number, z: number, r: number, name: string, material: MeshBasicNodeMaterial): Mesh {
  const geo = b.build();
  // Posed in the shader from local shapes: the bounds are set by hand for culling.
  geo.boundingSphere = new Sphere(new Vector3(x, 0, z), r);
  const mesh = new Mesh(geo, material);
  mesh.name = name;
  mesh.frustumCulled = true;
  return mesh;
}
