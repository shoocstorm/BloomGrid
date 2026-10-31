import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';
import { color, float, max, smoothstep, uv } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getMaterial, stripes } from '@/render/materials/library';
import { GeoBuilder, tf } from '@/render/bake';
import { U } from '@/render/uniforms';
import type { LoopPath, PathPoint } from './path';

/** Scale of the whole system: shapes below are in design units, ×K in the world (≈10 m per tile). */
export const K = 0.55;
const T0 = 0.95;
/** Track centres either side of the line (world units); trains run on the right in their direction. */
export const TRACK = T0 * K;
/** Half-length of a station platform along the line (world units). */
export const PLATFORM = 15 * K;
const PYLON_EVERY = 11;
const SCALE = new Matrix4().makeScale(K, K, K);

const PEARL = 0xeef2ef;
const GLOW = 0x8ff8ec;

/** Cross-section pieces of the viaduct: polygon in (n = right of travel, y below the rail top), colour, glow. */
const SECTION: [number[][], number, number][] = [
  // Box girder, wide on top, tapering to a slim keel.
  [
    [
      [-1.9, -0.38],
      [1.9, -0.38],
      [0.85, -1.45],
      [-0.85, -1.45],
    ],
    PEARL,
    0,
  ],
  // Grey track bed (so the white beams, green median and lit rails read), and the moss median between the tracks.
  [
    [
      [-1.76, -0.38],
      [1.76, -0.38],
      [1.76, -0.355],
      [-1.76, -0.355],
    ],
    0x93a2a7,
    0,
  ],
  [
    [
      [-0.42, -0.355],
      [0.42, -0.355],
      [0.42, -0.27],
      [-0.42, -0.27],
    ],
    0x6fae5a,
    0,
  ],
  // Low wind fairings on the edges.
  ...[-1, 1].map((k): [number[][], number, number] => [
    [
      [k * 1.9, -0.38],
      [k * 1.76, -0.38],
      [k * 1.8, -0.12],
      [k * 1.9, -0.12],
    ],
    0xf6f7f3,
    0,
  ]),
  // Lines of light along the girder's flanks and keel.
  ...[-1, 1].map((k): [number[][], number, number] => [
    [
      [k * 1.62, -0.6],
      [k * 1.66, -0.6],
      [k * 1.6, -0.5],
      [k * 1.56, -0.5],
    ],
    GLOW,
    1.6,
  ]),
  [
    [
      [-0.22, -1.48],
      [0.22, -1.48],
      [0.22, -1.45],
      [-0.22, -1.45],
    ],
    0xbff7ff,
    1.4,
  ],
  // Guide beams with a glowing power rail on top.
  ...[-1, 1].flatMap((k): [number[][], number, number][] => [
    [
      [
        [k * T0 - 0.3, -0.38],
        [k * T0 + 0.3, -0.38],
        [k * T0 + 0.3, -0.07],
        [k * T0 - 0.3, -0.07],
      ],
      0xc9d3d6,
      0,
    ],
    [
      [
        [k * T0 - 0.07, -0.07],
        [k * T0 + 0.07, -0.07],
        [k * T0 + 0.07, -0.04],
        [k * T0 - 0.07, -0.04],
      ],
      0x7ff7e6,
      1.1,
    ],
  ]),
];

/** Bloom Helix towers: centre inside the line and along it (world units), core radius, rise per turn (design). */
const HELIX_X = 3.4;
const HELIX_T = 2.1;
const CORE = 0.6;
const HELIX_PITCH = 4.6;
/** Platform walking surface (design units above the rail top). */
const PLATFORM_TOP = 0.28;

/** A helix tower's frame (design units, origin on its axis at deck height) and spiral, for the movers. */
export interface HelixTower {
  m: Matrix4;
  /** Spiral foot and top heights (frame y) and start/end angles (it climbs as the angle grows). */
  yb: number;
  yt: number;
  th0: number;
  th1: number;
}

/** Spiral walkway section: polygon in (radius, height above the walking line), colour, glow. */
const HELIX: [number[][], number, number][] = [
  [
    [
      [CORE, -0.16],
      [1.6, -0.16],
      [1.6, 0],
      [CORE, 0],
    ],
    0xf3efe6,
    0,
  ],
  // Vines along the inner edge, a parapet with a lit handrail outside, and a light line underneath.
  [
    [
      [CORE, 0],
      [0.84, 0],
      [0.84, 0.2],
      [CORE, 0.2],
    ],
    0x5f9f4a,
    0,
  ],
  [
    [
      [1.52, 0],
      [1.6, 0],
      [1.6, 0.42],
      [1.52, 0.42],
    ],
    0xf6f7f3,
    0,
  ],
  [
    [
      [1.5, 0.42],
      [1.62, 0.42],
      [1.62, 0.47],
      [1.5, 0.47],
    ],
    GLOW,
    1.4,
  ],
  [
    [
      [1.15, -0.18],
      [1.35, -0.18],
      [1.35, -0.16],
      [1.15, -0.16],
    ],
    0xbff7ff,
    1.1,
  ],
];

export interface StationSite {
  name: string;
  s: number;
  /** +1 if the loop's inside (the station building) is to the right of increasing s, else -1. */
  inner: number;
}

const _p: PathPoint = { x: 0, z: 0, tx: 0, tz: 0, curv: 0 };
const _q: PathPoint = { x: 0, z: 0, tx: 0, tz: 0, curv: 0 };
const _f = new Matrix4();
const _l = new Matrix4();
const _pf = new Matrix4();
const _l2 = new Matrix4();
const UP = new Vector3(0, 1, 0);
const _x = new Vector3();
const _z = new Vector3();

/**
 * The Aeroline's fixed structure: a twin-track box-girder viaduct swept along the loop, bloom pylons with
 * glowing collars and planted bases (pile caps at sea), and four glass-canopied stations, each reached from its
 * street concourse by two Bloom Helix towers (spiral walkways round glass lifts). Baked into one merged mesh plus one glass mesh: split into chunks for culling, each chunk
 * also cast into every shadow cascade and cost more draws than it saved.
 */
export class Guideway {
  readonly group = new Group();
  readonly towers: HelixTower[] = [];

  constructor(
    private path: LoopPath,
    /** Rail-top height (world y). */
    private deck: number,
    stations: StationSite[],
    ground: (x: number, z: number) => number,
  ) {
    const L = path.length;
    const b = new GeoBuilder();
    this.sweep(b, 0, L);

    const nearStation = (s: number) =>
      stations.some((st) => Math.abs(((s - st.s + L * 1.5) % L) - L / 2) < PLATFORM + 2);
    const count = Math.round(L / PYLON_EVERY);
    for (let i = 0; i < count; i++) {
      const s = (i * L) / count;
      if (!nearStation(s)) this.pylon(b, s, 0, ground);
    }
    const glass: BufferGeometry[] = [];
    for (const st of stations) this.station(b, st, ground, glass);

    const mesh = new Mesh(b.build(), getMaterial('glowline'));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'aeroline';
    this.group.add(mesh);
    if (glass.length) {
      const shell = new Mesh(mergeGeometries(glass), glassMaterial());
      shell.name = 'aeroline-glass';
      shell.renderOrder = 2;
      this.group.add(shell);
      for (const g of glass) g.dispose();
    }
  }

  /** Frame at arc length s: x = left of travel, y = up, z = forward (a proper rotation), origin on the centreline. */
  private frame(s: number, y: number, out = _f): Matrix4 {
    const p = this.path.at(s, _p);
    return out.makeBasis(_x.set(p.tz, 0, -p.tx), UP, _z.set(p.tx, 0, p.tz)).setPosition(p.x, y, p.z);
  }

  /** Sweeps the cross-section along [s0, s1] with flat-shaded quads. */
  private sweep(b: GeoBuilder, s0: number, s1: number): void {
    const ss = this.path.samples(s0, s1, 1.2, 9);
    for (const [poly, col, glow] of SECTION) {
      const cx = poly.reduce((a, p) => a + p[0]!, 0) / poly.length;
      const cy = poly.reduce((a, p) => a + p[1]!, 0) / poly.length;
      const pos: number[] = [];
      const nrm: number[] = [];
      for (let i = 0; i + 1 < ss.length; i++) {
        const a = this.path.at(ss[i]!, _p);
        const c = this.path.at(ss[i + 1]!, _q);
        for (let k = 0; k < poly.length; k++) {
          const [n0, y0] = poly[k]! as [number, number];
          const [n1, y1] = poly[(k + 1) % poly.length]! as [number, number];
          // Outward normal of this edge in the section plane.
          let [mn, my] = [y1 - y0, -(n1 - n0)];
          if (mn * ((n0 + n1) / 2 - cx) + my * ((y0 + y1) / 2 - cy) < 0) [mn, my] = [-mn, -my];
          const l = Math.hypot(mn, my) || 1;
          [mn, my] = [mn / l, my / l];
          const v = (p: PathPoint, n: number, y: number) => [
            p.x - p.tz * n * K,
            this.deck + y * K,
            p.z + p.tx * n * K,
          ];
          const q = [v(a, n0, y0), v(a, n1, y1), v(c, n1, y1), v(c, n0, y0)];
          const nm = (p: PathPoint) => [-p.tz * mn, my, p.tx * mn];
          const nn = [nm(a), nm(a), nm(c), nm(c)];
          // Wind each quad so its face normal agrees with the outward normal.
          const e1 = sub(q[1]!, q[0]!);
          const e2 = sub(q[2]!, q[0]!);
          const fn = [
            e1[1]! * e2[2]! - e1[2]! * e2[1]!,
            e1[2]! * e2[0]! - e1[0]! * e2[2]!,
            e1[0]! * e2[1]! - e1[1]! * e2[0]!,
          ];
          const flip = fn[0]! * nn[0]![0]! + fn[1]! * nn[0]![1]! + fn[2]! * nn[0]![2]! < 0;
          for (const j of flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
            pos.push(...q[j]!);
            nrm.push(...nn[j]!);
          }
        }
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
      b.add(g, _l.identity(), col, glow);
      g.dispose();
    }
  }

  /** A bloom pylon at arc length s, offset `t` (world) along the line: column, V capital, light collar, planter. */
  private pylon(
    b: GeoBuilder,
    s: number,
    t: number,
    ground: (x: number, z: number) => number,
    wide = 1,
  ): void {
    const p = this.path.at(s + t, _p);
    const g = ground(p.x, p.z);
    const F = _pf.multiplyMatrices(this.frame(s + t, this.deck), SCALE);
    const y = (w: number) => (w - this.deck) / K;
    const top = -1.45;
    const base = y(Math.max(g, -6));
    const h = top - base;
    const put = (geo: BufferGeometry, m: Matrix4, col: number, glow = 0) =>
      b.add(geo, _l.multiplyMatrices(F, m), col, glow);
    put(cyl(0.42, 0.62, 12), tf(0, base, 0, 0, 0, 0, 1, h, 1), PEARL);
    // V capital: two arms leaning out to the girder's edges, joined by a cross-head.
    for (const k of [-1, 1])
      put(box, tf(k * 0.55, top - 1.5, 0, 0, 0, -k * 0.62, 0.36 * wide, 1.9, 0.5), PEARL);
    put(box, tf(0, top - 0.25, 0, 0, 0, 0, 2.6 * wide, 0.25, 0.7), PEARL);
    put(ring, tf(0, top - 2.3, 0, Math.PI / 2, 0, 0, 0.62), GLOW, 1.8);
    if (g > 0.15) {
      const gy = y(g);
      put(cyl(1.15, 1.25, 14), tf(0, gy - 0.05, 0, 0, 0, 0, 1, 0.42, 1), 0xd9cfb6);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + s;
        put(
          blob,
          tf(Math.cos(a) * 0.82, gy + 0.42, Math.sin(a) * 0.82, 0, a, 0, 0.42, 0.34, 0.42),
          i % 2 ? 0x5f9f4a : 0x7fbf5a,
        );
      }
      // Ivy climbing the column.
      put(cyl(0.45, 0.65, 12), tf(0, gy, 0, 0, 0, 0, 1.02, Math.min(h * 0.45, 4), 1.02), 0x4f8f3a);
    } else put(cyl(1.0, 1.3, 14), tf(0, y(-0.5), 0, 0, 0, 0, 1, 1.3, 1), 0xcfd6d2);
  }

  /** A station: widened deck, platforms with lit edges, an arched glass canopy with a halo crown, helix towers. */
  private station(
    b: GeoBuilder,
    st: StationSite,
    ground: (x: number, z: number) => number,
    glass: BufferGeometry[],
  ): void {
    const F = this.frame(st.s, this.deck).clone().multiply(SCALE);
    const put = (geo: BufferGeometry, m: Matrix4, col: number, glow = 0) =>
      b.add(geo, _l.multiplyMatrices(F, m), col, glow);
    const len = 30;
    put(box, tf(0, -0.95, 0, 0, 0, 0, 8.6, 0.55, len), 0xe9e6de);
    for (const k of [-1, 1]) {
      put(box, tf(k * 2.95, -0.4, 0, 0, 0, 0, 2.7, 0.68, len), 0xf3efe6);
      put(box, tf(k * 1.6, 0.27, 0, 0, 0, 0, 0.07, 0.03, len), 0x7ff7e6, 1.6);
      // Planters and benches down the platform.
      for (let t = -11; t <= 11; t += 5.5) {
        put(box, tf(k * 3.75, 0.28, t, 0, 0, 0, 0.6, 0.32, 1.3), 0x9a7552);
        put(blob, tf(k * 3.75, 0.6, t, 0, t, 0, 0.42, 0.4, 0.8), 0x6fbf4a);
        put(box, tf(k * 3.0, 0.28, t + 2.6, 0, 0, 0, 0.35, 0.18, 1.0), 0xc8a57c);
      }
    }
    // Canopy: elliptical ribs, a lit spine, and a halo crown over the middle.
    for (let t = -14.4; t <= 14.5; t += 2.5) put(arch, tf(0, 0.28, t, 0, 0, 0, 1, 0.85, 1), 0xf2f6f4, 0.15);
    const apex = 0.28 + 4.3 * 0.85;
    put(box, tf(0, apex - 0.05, 0, 0, 0, 0, 0.32, 0.22, len), 0xf2f6f4);
    put(box, tf(0, apex - 0.12, 0, 0, 0, 0, 0.12, 0.04, len), GLOW, 1.4);
    put(new TorusGeometry(1.5, 0.13, 8, 40), tf(0, apex + 1.6, 0), GLOW, 0.9);
    put(new TorusGeometry(1.0, 0.06, 6, 32), tf(0, apex + 1.6, 0, 0, Math.PI / 2, 0), 0xffe08a, 0.7);
    put(cyl(0.12, 0.2, 8), tf(0, apex, 0, 0, 0, 0, 1, 0.3, 1), 0xf2f6f4);
    // Supports: three wide pylons.
    for (const t of [-10, 0, 10]) this.pylon(b, st.s, t * K, ground, 2.3);
    // Bloom Helix towers over the concourse: the way up from the street (D-041).
    for (const t of [-HELIX_T / K, HELIX_T / K])
      this.helixTower(b, F, (-st.inner * HELIX_X) / K, t, ground, glass);
    // Glass vault over the platforms.
    const shell = new CylinderGeometry(4.28, 4.28, len, 28, 1, true, Math.PI / 2, Math.PI)
      .rotateX(Math.PI / 2)
      .scale(1, 0.85, 1)
      .translate(0, 0.28, 0);
    glass.push(shell.applyMatrix4(F));
  }

  /**
   * A Bloom Helix tower beside the platform (local design x, along-line t): a glass lift core wound round by a
   * planted, lit spiral walkway that arrives at platform level facing the line, a gate bridge onto the platform,
   * and a petal crown. Its frame and helix go to `towers` for the moving lift cabins and walkers.
   */
  private helixTower(
    b: GeoBuilder,
    F: Matrix4,
    x: number,
    t: number,
    ground: (x: number, z: number) => number,
    glass: BufferGeometry[],
  ): void {
    const M = F.clone().multiply(new Matrix4().makeTranslation(x, 0, t));
    const w = new Vector3().applyMatrix4(M);
    const g = ground(w.x, w.z);
    const yb = (g + 0.12 - this.deck) / K;
    const yt = PLATFORM_TOP;
    const sgn = Math.sign(x);
    // The spiral ends heading for the line: its last point is on the core's line side.
    const th1 = sgn > 0 ? Math.PI : 0;
    const turns = Math.max(1, Math.round((yt - yb) / HELIX_PITCH));
    const th0 = th1 - turns * Math.PI * 2;
    this.towers.push({ m: M, yb, yt, th0, th1 });
    const put = (geo: BufferGeometry, m: Matrix4, col: number, glow = 0) =>
      b.add(geo, _l.multiplyMatrices(M, m), col, glow);

    // Foot: a round plaza with a ring of shrubs and a light ring round the entrance.
    const gy = (g - this.deck) / K;
    put(cyl(2.05, 2.15, 24), tf(0, gy - 0.2, 0, 0, 0, 0, 1, 0.46, 1), 0xe4dccb);
    put(new TorusGeometry(1.95, 0.05, 6, 40), tf(0, gy + 0.27, 0, Math.PI / 2, 0, 0), GLOW, 1.4);
    for (let i = 0; i < 7; i++) {
      const a = th1 + 0.9 + (i / 7) * (Math.PI * 2 - 1.8);
      put(
        blob,
        tf(Math.cos(a) * 1.85, gy + 0.36, Math.sin(a) * 1.85, 0, a, 0, 0.26, 0.22, 0.26),
        i % 2 ? 0x5f9f4a : 0x86c45e,
      );
    }
    // The spiral walkway, then its landing and the gate bridge onto the platform.
    const helix = helixSweep(th0, th1, yb, yt, turns * 28);
    for (const [poly, col, glow] of HELIX) {
      const geo = helix(poly);
      put(geo, _l2.identity(), col, glow);
      geo.dispose();
    }
    const edge = 4.3 * sgn;
    const span = Math.abs(edge - x) + 0.3; // from the core's axis to just over the platform edge
    put(box, tf(-sgn * (span / 2), yt - 0.2, 0, 0, 0, 0, span, 0.2, 1.5), 0xf3efe6);
    for (const k of [-1, 1]) {
      put(box, tf(-sgn * (span / 2), yt, k * 0.72, 0, 0, 0, span, 0.42, 0.06), 0xf6f7f3);
      put(box, tf(-sgn * (span / 2), yt + 0.42, k * 0.72, 0, 0, 0, span, 0.05, 0.1), GLOW, 1.4);
    }
    put(
      new TorusGeometry(1.0, 0.08, 6, 28, Math.PI),
      tf(edge - x + 0.15 * sgn, yt, 0, 0, Math.PI / 2, 0),
      0xf2f6f4,
      0.3,
    );
    // Lift core: pearl mullions and collars round a glass shaft, rising through the landing to the crown.
    const top = yt + 3.4;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      put(box, tf(Math.cos(a) * CORE, yb, Math.sin(a) * CORE, 0, -a, 0, 0.08, top - yb, 0.08), PEARL);
    }
    for (let y = yb + 0.02; y < top; y += HELIX_PITCH)
      put(cyl(CORE + 0.04, CORE + 0.04, 20), tf(0, y, 0, 0, 0, 0, 1, 0.12, 1), PEARL);
    put(cyl(1.0, CORE + 0.05, 20), tf(0, yt - 0.22, 0, 0, 0, 0, 1, 0.22, 1), 0xf3efe6);
    glass.push(
      new CylinderGeometry(CORE, CORE, top - yb, 20, 1, true).translate(0, (top + yb) / 2, 0).applyMatrix4(M),
    );
    // Crown: a cap with six petals opening up and out, a light ring and a gold bud.
    put(cyl(0.95, CORE + 0.04, 20), tf(0, top, 0, 0, 0, 0, 1, 0.3, 1), PEARL);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + t;
      put(
        blob,
        tf(Math.cos(a) * 0.95, top + 0.55, Math.sin(a) * 0.95, -0.75, Math.PI / 2 - a, 0, 0.32, 0.06, 0.95),
        0xf7f8f4,
      );
      put(
        blob,
        tf(Math.cos(a) * 1.0, top + 0.62, Math.sin(a) * 1.0, -0.75, Math.PI / 2 - a, 0, 0.1, 0.05, 0.8),
        GLOW,
        1.2,
      );
    }
    put(new TorusGeometry(0.8, 0.06, 6, 32), tf(0, top + 0.34, 0, Math.PI / 2, 0, 0), GLOW, 1.6);
    put(blob, tf(0, top + 0.6, 0, 0, 0, 0, 0.32), 0xffd36e, 1.0);
  }
}

const box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const cylCache = new Map<string, BufferGeometry>();
function cyl(top: number, bottom: number, seg: number): BufferGeometry {
  const k = `${top}/${bottom}/${seg}`;
  let g = cylCache.get(k);
  if (!g) cylCache.set(k, (g = new CylinderGeometry(top, bottom, 1, seg).translate(0, 0.5, 0)));
  return g;
}
const ring = new TorusGeometry(1, 0.1, 6, 28);
const blob = new IcosahedronGeometry(1, 1);
const arch = new TorusGeometry(4.3, 0.1, 6, 28, Math.PI);

/** Sweeps a (radius, height) section along a helix round local y, from (th0, y0) to (th1, y1). */
function helixSweep(th0: number, th1: number, y0: number, y1: number, steps: number) {
  return (poly: number[][]): BufferGeometry => {
    const P = (th: number, r: number, dy: number) => [
      r * Math.cos(th),
      y0 + ((y1 - y0) * (th - th0)) / (th1 - th0) + dy,
      r * Math.sin(th),
    ];
    const cr = poly.reduce((a, p) => a + p[0]!, 0) / poly.length;
    const cy = poly.reduce((a, p) => a + p[1]!, 0) / poly.length;
    const pos: number[] = [];
    for (let i = 0; i < steps; i++) {
      const a = th0 + ((th1 - th0) * i) / steps;
      const c = th0 + ((th1 - th0) * (i + 1)) / steps;
      for (let k = 0; k < poly.length; k++) {
        const [r0, d0] = poly[k]! as [number, number];
        const [r1, d1] = poly[(k + 1) % poly.length]! as [number, number];
        const q = [P(a, r0, d0), P(a, r1, d1), P(c, r1, d1), P(c, r0, d0)];
        // Wind so the face points away from the section's centre (radially out/in, up/down).
        const e1 = sub(q[1]!, q[0]!);
        const e2 = sub(q[2]!, q[0]!);
        const fn = [
          e1[1]! * e2[2]! - e1[2]! * e2[1]!,
          e1[2]! * e2[0]! - e1[0]! * e2[2]!,
          e1[0]! * e2[1]! - e1[1]! * e2[0]!,
        ];
        const m = (a + c) / 2;
        const [mr, my] = [(r0 + r1) / 2 - cr, (d0 + d1) / 2 - cy];
        const out = [Math.cos(m) * mr, my, Math.sin(m) * mr];
        const flip = fn[0]! * out[0]! + fn[1]! * out[1]! + fn[2]! * out[2]! < 0;
        for (const j of flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) pos.push(...q[j]!);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    return g;
  };
}

function sub(a: number[], b: number[]): number[] {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
}

/** Station vault glass: faint aqua panes between pearl mullions, glowing softly at night. */
function glassMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    roughness: 0.05,
    metalness: 0.3,
  });
  const g = uv();
  // Mullions fade to their mean once sub-pixel, so the vaults don't sparkle from afar (D-064).
  const ribs = max(stripes(g.x.mul(14), 0.94), stripes(g.y.mul(12), 0.9));
  m.colorNode = color(0xe6fbff).mul(ribs.mul(0.1).add(0.9));
  m.opacityNode = ribs
    .mul(0.7)
    .add(0.16)
    .mul(
      smoothstep(0, 0.04, g.x)
        .mul(smoothstep(1, 0.96, g.x))
        .mul(0.6)
        .add(0.4),
    );
  m.emissiveNode = color(0xbff7ff).mul(ribs).mul(U.night.mul(0.35)).add(float(0));
  return m;
}
