import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial, Sphere, Vector3 } from 'three/webgpu';
import {
  attribute,
  clamp,
  cos,
  exp,
  float,
  floor,
  fract,
  mix,
  mrt,
  normalGeometry,
  positionGeometry,
  select,
  sign,
  sin,
  smoothstep,
  step,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { hash2 } from '@/sim/random';
import { U } from '@/render/uniforms';
import { GeoBuilder, skyShade, tf } from '@/render/bake';
import { bloomMRT } from '@/render/bloomMRT';
import { BALL_LO, CONE, FLECK, petal, TINY } from './wonderKit';

/**
 * Life in the open sea (D-164): pods of glowing humpback whales and schools of dolphins, one mesh per pod, every
 * motion posed in the vertex shader from `U.clock` (no per-frame uploads). Each animal runs its own cycle:
 *
 * - **Whales** cruise deep, rise to the surface to blow two or three times with a gentle roll, then arch and dive
 *   with their flukes in the air; on most cycles they first **breach**: burst out of the sea nose first, twist onto
 *   their side in the air and crash back with a splash. Tails beat up and down while they swim.
 * - **Dolphins** race round in a loose school and leap in arcs, each with a splash going in and coming out; now and
 *   then the school runs deep for a while.
 *
 * Kinds of part (`aBody.z`): 0 body (posed), 1 spout (from the blowhole, grows while blowing), 2 splash (at the
 * animal's spot on the water during a breach or a leap), 3 surface slick (round a whale lying at the surface).
 */

const LUMEN = 0x8ff7ff;
const WHALE = 0x37526b;
const DOLPHIN = 0x5c7488;
const SPRAY = 0xeefcff;
/** Whale and dolphin lengths at size 1 (world units). */
const WHALE_L = 12;
const DOLPHIN_L = 2.6;
/** Blowhole in the whale's frame at size 1 (spouts rise from here). */
const BLOWHOLE = [0, 0.07 * WHALE_L, 0.3 * WHALE_L] as const;

type Key = readonly [u: number, rx: number, ry: number, y: number];
/** Humpback: narrow tail stock, deep chest, flattish broad head (fractions of the length, tail → nose). */
const WHALE_KEYS: Key[] = [
  [0, 0.006, 0.014, 0],
  [0.07, 0.024, 0.042, 0.004],
  [0.18, 0.05, 0.072, 0.01],
  [0.33, 0.082, 0.094, 0.01],
  [0.48, 0.104, 0.104, 0.005],
  [0.62, 0.112, 0.102, 0],
  [0.75, 0.106, 0.09, -0.006],
  [0.86, 0.088, 0.07, -0.012],
  [0.94, 0.064, 0.046, -0.014],
  [0.985, 0.032, 0.022, -0.016],
  [1, 0, 0, -0.016],
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

/**
 * A lofted body `len` long along +z (centred on the origin): elliptical rings from `keys`, a pale belly (`belly`
 * tint) and, for the whale, the ventral grooves (pale and darker stripes under the jaw and chest).
 */
function lofted(keys: Key[], len: number, belly: number, grooves: boolean, rings = 30, segs = 18): BufferGeometry {
  const pos: number[] = [];
  const tint: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const [rx, ry, y0] = keyAt(keys, u);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      // Flatter belly than back.
      const yy = s < 0 ? s * 0.86 : s;
      pos.push(c * rx * len, (y0 + yy * ry) * len, (u - 0.5) * len);
      let t = s < -0.2 ? belly * Math.min(1, (-s - 0.2) * 2.2) : s > 0.55 ? -0.08 : 0;
      if (grooves && s < -0.35 && u > 0.55) t = j % 2 ? belly * 0.95 : belly * 0.45;
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

/** A spout's column: narrow at the blowhole, opening out upward. */
/** A splash's spray spike (a few pixels across: five sides do). */
const SPIKE = new CylinderGeometry(0, 1, 1, 5, 1, true).translate(0, 0.5, 0);
const SPRAY_CONE = new CylinderGeometry(0.55, 0.12, 1, 8, 1, true).translate(0, 0.5, 0);
const WHALE_BODY = lofted(WHALE_KEYS, WHALE_L, 0.62, true);
const DOLPHIN_BODY = lofted(DOLPHIN_KEYS, DOLPHIN_L, 0.7, false, 22, 14);

type Extra = Record<string, number[]>;

/** One whale (size `s`) into `b`, its frame forward +z. */
function whale(b: GeoBuilder, s: number, ex: Extra, spout: Extra, splash: Extra, slick: Extra): void {
  const L = WHALE_L * s;
  b.add(WHALE_BODY, tf(0, 0, 0, 0, 0, 0, s), WHALE, 0.12, ex);
  // Flukes: two swept lobes with a notch between, pale underneath.
  for (const side of [-1, 1])
    b.add(
      petal(0.2 * WHALE_L, 0.085 * WHALE_L, 0.0, 0.03, 0.25, 6, 2),
      tf(side * 0.004 * L, 0.004 * L, -0.49 * L, 0.04, Math.PI - side * 1.05, 0, s),
      WHALE,
      0.1,
      ex,
    );
  // Long pectoral fins (a humpback's), pale, swept back and drooping.
  for (const side of [-1, 1])
    b.add(
      petal(0.3 * WHALE_L, 0.06 * WHALE_L, 0.0, -0.04, 0.3, 7, 2),
      tf(side * 0.09 * L, -0.045 * L, 0.18 * L, 0.32, side * (Math.PI / 2 + 0.55), side * -0.25, s),
      0xb8c9d2,
      0.1,
      ex,
    );
  // A small dorsal fin on a hump, two-thirds back.
  b.add(CONE, tf(0, 0.085 * L, -0.12 * L, -0.55, 0, 0, 0.018 * L, 0.05 * L, 0.035 * L), WHALE, 0.1, ex);
  // Knobs (tubercles) along the head, eyes low on the flanks.
  for (let k = 0; k < 7; k++)
    b.add(
      TINY,
      tf((k % 2 ? 1 : -1) * 0.012 * L, 0.05 * L - k * 0.0035 * L, (0.36 + k * 0.018) * L, 0, 0, 0, 0.012 * L),
      0x24405a,
      0.1,
      ex,
    );
  for (const side of [-1, 1])
    b.add(TINY, tf(side * 0.085 * L, -0.012 * L, 0.33 * L, 0, 0, 0, 0.011 * L), 0x0d1820, 0, ex);
  // Glowing lumen spots in two rows along the flanks.
  for (const side of [-1, 1])
    for (let k = 0; k < 6; k++) {
      const z = (0.2 - k * 0.075) * L;
      const [rx, ry, y0] = keyAt(WHALE_KEYS, z / L + 0.5);
      b.add(
        TINY,
        tf(side * rx * L * 0.82, (y0 + ry * 0.55) * L, z, 0, 0, 0, 0.012 * L),
        LUMEN,
        2.4,
        ex,
      );
    }
  // Spout: a column of spray under a billow of mist (from the blowhole; grown in the shader).
  // A humpback's bushy blow: a column of spray widening as it rises into a billow of mist.
  b.add(SPRAY_CONE, tf(0, 0, 0, 0, 0, 0, 1, 3.6, 1), SPRAY, 0.35, spout);
  for (let m = 0; m < 6; m++) {
    const a = m * 2.4;
    const r = m === 0 ? 0 : 0.55;
    const k = 0.65 + (m % 3) * 0.18;
    b.add(BALL_LO, tf(Math.cos(a) * r, 3.8 + (m % 2) * 0.5, Math.sin(a) * r, 0, 0, 0, k, k * 0.8, k), SPRAY, 0.35, spout);
  }
  splashParts(b, 1.2 * s, splash);
  // A ring of foam round a whale lying at the surface.
  for (let f = 0; f < 10; f++) {
    const a = (f / 10) * Math.PI * 2;
    b.add(
      FLECK,
      tf(Math.cos(a) * 0.13 * L, 0, Math.sin(a) * 0.4 * L, 0, -a, 0, 0.5 * s, 1, 0.28 * s),
      SPRAY,
      0.1,
      slick,
    );
  }
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
  for (const side of [-1, 1])
    b.add(TINY, tf(side * 0.055 * L, 0, 0.36 * L, 0, 0, 0, 0.012 * L), 0x0d1820, 0, ex);
  splashParts(b, 0.45 * s, splash);
}

/** A splash at the water: a crown of spray spikes, a plume and a foam disc (`r` across, grown in the shader). */
function splashParts(b: GeoBuilder, r: number, ex: Extra): void {
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    b.add(
      SPIKE,
      tf(Math.cos(a) * r, 0, Math.sin(a) * r, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5, 0.22 * r, 1.6 * r, 0.22 * r),
      SPRAY,
      0.3,
      ex,
    );
  }
  b.add(BALL_LO, tf(0, 0.6 * r, 0, 0, 0, 0, 0.75 * r, 1.5 * r, 0.75 * r), SPRAY, 0.3, ex);
  b.add(FLECK, tf(0, 0.02, 0, 0, 0, 0, 1.9 * r, 1, 1.9 * r), SPRAY, 0.15, ex);
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

const bump = (x: Node<'float'>, at: number, w: number) => exp(x.sub(at).div(w).pow(2).negate());

/** The pod material: every animal's swim, cycle and pose from its attributes (see the class comment). */
function podMaterial(): MeshBasicNodeMaterial {
  const P = attribute('aPath', 'vec4'); // centre x, z, radius, angular speed (signed)
  const B = attribute('aBody', 'vec4'); // angle offset, seed, part kind, size
  const C = attribute('aCyc', 'vec4'); // cycle seconds, dolphin (0/1), breach roll side, school seed
  const [s, seed, kind, T, isD] = [B.w, B.y, B.z, C.x, C.y];
  const t = U.clock;
  const ph = t.div(T).add(seed);
  const c = fract(ph);
  const tc = c.mul(T);
  const rnd = fract(sin(floor(ph).mul(12.9898).add(seed.mul(78.233))).mul(43758.5453));

  // ── Whale: deep → (breach) → surface and blow → fluke-up dive → deep.
  const bStart = T.mul(0.5).sub(4.4);
  const uu = tc.sub(bStart).div(3.2);
  const u = clamp(uu, 0, 1);
  const bw = step(0.42, rnd).mul(smoothstep(-0.12, 0, uu)).mul(float(1).sub(smoothstep(1.0, 1.3, uu)));
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
  const slickW = rise.mul(float(1).sub(smoothstep(0.7, 0.76, c)));

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

  // Path: round the pod's centre, the radius wandering slowly.
  const th = B.x.add(t.mul(P.w));
  const R = P.z.mul(float(1).add(sin(t.mul(0.021).add(seed.mul(3))).mul(mix(float(0.22), float(0.06), isD))));
  const dir = sign(P.w);
  const [tx, tz] = [sin(th).negate().mul(dir), cos(th).mul(dir)];
  const at = vec3(P.x.add(R.mul(cos(th))), U.waterLevel, P.y.add(R.mul(sin(th))));

  // Body: the tail beats up and down, stronger toward the flukes (less in the air).
  const p = positionGeometry;
  const halfL = mix(float(WHALE_L / 2), float(DOLPHIN_L / 2), isD).mul(s);
  const w = clamp(p.z.negate().div(halfL), 0, 1).pow(2);
  const beat = sin(t.mul(mix(float(1.3), float(7), isD)).add(seed.mul(5)).add(p.z.div(halfL).mul(2.2)));
  const flex = beat.mul(w).mul(halfL).mul(mix(float(0.06), float(0.07), isD)).mul(float(1).sub(bw.mul(0.6)));
  const body = at.add(vec3(0, h, 0)).add(pose(vec3(p.x, p.y.add(flex), p.z), roll, pitch, tx, tz));

  const hole = pose(vec3(BLOWHOLE[0], BLOWHOLE[1], BLOWHOLE[2]).mul(s), roll, pitch, tx, tz);
  const spout = at.add(vec3(0, h, 0)).add(hole).add(p.mul(vec3(spoutW.pow(0.5), spoutW, spoutW.pow(0.5))));
  const env = mix(splashW, splashD, isD);
  const splash = at.add(p.mul(vec3(env.pow(0.5), env, env.pow(0.5))));
  const slick = at.add(pose(p, float(0), float(0), tx, tz).mul(slickW.mul(float(1).sub(isD))));

  const m = new MeshBasicNodeMaterial();
  m.positionNode = select(
    kind.lessThan(0.5),
    body,
    select(kind.lessThan(1.5), spout, select(kind.lessThan(2.5), splash, slick)),
  );
  const n = select(kind.lessThan(0.5), pose(normalGeometry, roll, pitch, tx, tz), normalGeometry);
  const col = attribute('color', 'vec3');
  const glow = col.mul(attribute('aGlow', 'float')).mul(U.night.mul(0.9).add(0.04));
  m.colorNode = skyShade(col, n).add(glow);
  bloomMRT(m, mrt({ emissive: glow.mul(0.7) }));
  return m;
}

let material: MeshBasicNodeMaterial | null = null;

/**
 * A pod of `n` whales (the first a big adult, the last a calf beside its mother) circling `x`, `z` (pod `p`
 * decides the direction and the phases).
 */
export function whalePod(x: number, z: number, p: number, n = 4): Mesh {
  const b = new GeoBuilder({ aPath: 4, aBody: 4, aCyc: 4 });
  for (let w = 0; w < n; w++) {
    const { s, calf, T, seed, side } = whaleParams(p, w, n);
    const h = (k: number) => hash2(p * 7 + w, k, 9901);
    const lane = calf ? 1 : w;
    const path = [x, z, 22 + lane * 6 + (calf ? 3 : 0), 0.032 * (p % 2 ? -1 : 1)];
    const a0 = calf ? 1 * 0.5 + 0.12 : w * 0.5 + h(2) * 0.2;
    const cyc = [T, 0, side, 0];
    const kind = (k: number): Extra => ({ aPath: path, aBody: [a0, seed, k, s], aCyc: cyc });
    whale(b, s, kind(0), kind(1), kind(2), kind(3));
  }
  return podMesh(b, x, z, 62, 'whales');
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
  return podMesh(b, x, z, 46, 'dolphins');
}

function podMesh(b: GeoBuilder, x: number, z: number, r: number, name: string): Mesh {
  const geo = b.build();
  // Posed in the shader from local shapes: the bounds are set by hand for culling.
  geo.boundingSphere = new Sphere(new Vector3(x, 0, z), r);
  const mesh = new Mesh(geo, (material ??= podMaterial()));
  mesh.name = name;
  mesh.frustumCulled = true;
  return mesh;
}
