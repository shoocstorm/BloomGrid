import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three/webgpu';
import { GeoBuilder, tf } from '@/render/bake';

/**
 * The fishing boats (D-095): two small working boats at a believable scale (≈1.3 tiles long against 2-tile
 * homes), each one merged mesh with vertex colours on the `scenery` material.
 *
 * - A lofted hull: sections from the transom to a raked bow, with sheer (the deck line rises toward the bow), a
 *   hard chine and a V bottom; topsides in the boat's colour, a white boot stripe and a red antifouled bottom.
 * - A **trawler** (teal): wheelhouse forward with wraparound windows, a mast with a crow's nest light, a stern
 *   A-frame gantry, a net drum and orange floats. A **longliner** (red / cream): a low cabin aft, a buoy rack, a
 *   flag line and a work light.
 * - Running lights (port red, starboard green, white masthead) glow at night.
 *
 * Bow is +z, length along z, waterline at y = 0.
 */

const L = 1.3;
const B = 0.42;

/** Half-beam and sheer height at t ∈ [0, 1] (stern → bow). */
const halfBeam = (t: number) => (B / 2) * (t < 0.62 ? 1 - 0.08 * (0.62 - t) : Math.pow(Math.cos(((t - 0.62) / 0.38) * (Math.PI / 2)), 0.75));
const sheer = (t: number) => 0.13 + 0.07 * t * t;

/** One band of the hull between two heights (as fractions down from the sheer to the keel), as triangles. */
function hullBand(from: number, to: number, steps = 18): BufferGeometry {
  const pos: number[] = [];
  // A section's profile: deck edge (0) → chine (0.55) → keel (1), interpolated by depth fraction f.
  const point = (t: number, f: number, side: number): [number, number, number] => {
    const hw = halfBeam(t);
    const top = sheer(t);
    const chineY = 0.02;
    const keelY = -0.07 + 0.04 * t;
    const z = -L / 2 + t * L;
    if (f <= 0.55) {
      const k = f / 0.55;
      return [side * hw * (1 - 0.1 * k), top + (chineY - top) * k, z];
    }
    const k = (f - 0.55) / 0.45;
    return [side * hw * 0.9 * (1 - k), chineY + (keelY - chineY) * k, z];
  };
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    for (const side of [-1, 1]) {
      const a = point(t0, from, side);
      const b = point(t1, from, side);
      const c = point(t1, to, side);
      const d = point(t0, to, side);
      // Wind outward on both sides.
      if (side > 0) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      else pos.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** The deck (a plate just under the sheer) and the transom. */
function deckAndTransom(): BufferGeometry {
  const pos: number[] = [];
  const steps = 18;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const [z0, z1] = [-L / 2 + t0 * L, -L / 2 + t1 * L];
    const [y0, y1] = [sheer(t0) - 0.03, sheer(t1) - 0.03];
    const [w0, w1] = [halfBeam(t0) * 0.96, halfBeam(t1) * 0.96];
    pos.push(-w0, y0, z0, w1, y1, z1, w0, y0, z0, -w0, y0, z0, -w1, y1, z1, w1, y1, z1);
  }
  // Transom: a flat stern face from the sheer down to the bottom.
  const w = halfBeam(0);
  const top = sheer(0);
  const z = -L / 2;
  pos.push(-w, top, z, w, top, z, 0, -0.07, z, -w, top, z, 0, -0.07, z, -w * 0.9, 0.02, z, w, top, z, w * 0.9, 0.02, z, 0, -0.07, z);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

function hull(b: GeoBuilder, colour: number): void {
  b.add(hullBand(0, 0.42), tf(0, 0, 0), colour);
  b.add(hullBand(0.42, 0.5), tf(0, 0, 0), 0xf6f3ea);
  b.add(hullBand(0.5, 1), tf(0, 0, 0), 0xb5403a);
  b.add(deckAndTransom(), tf(0, 0, 0), 0xc9a983);
  // Gunwale rail along both sides.
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const t = 0.06 + i * 0.13;
      b.add(new BoxGeometry(0.02, 0.025, L * 0.14), tf(side * halfBeam(t) * 0.98, sheer(t) + 0.01, -L / 2 + t * L), 0xf1ece0);
    }
}

function runningLights(b: GeoBuilder, mastTop: number, mastZ: number): void {
  const t = 0.6;
  b.add(new SphereGeometry(0.018, 6, 4), tf(-halfBeam(t), sheer(t) + 0.04, -L / 2 + t * L), 0xff3b30, 4);
  b.add(new SphereGeometry(0.018, 6, 4), tf(halfBeam(t), sheer(t) + 0.04, -L / 2 + t * L), 0x34e07a, 4);
  b.add(new SphereGeometry(0.022, 6, 4), tf(0, mastTop, mastZ), 0xfff4d6, 5);
}

function lifebuoy(b: GeoBuilder, x: number, y: number, z: number, side: number): void {
  b.add(new TorusGeometry(0.035, 0.012, 5, 10), tf(x, y, z, 0, (side * Math.PI) / 2, 0), 0xf26a2e);
}

/** The teal trawler. */
export function trawlerGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  hull(b, 0x2f8f86);
  // Wheelhouse forward of midships: white box, dark window band, a solar roof.
  b.add(new BoxGeometry(0.26, 0.16, 0.28), tf(0, 0.22, 0.1), 0xf3efe6);
  b.add(new BoxGeometry(0.27, 0.05, 0.29), tf(0, 0.27, 0.1), 0x23343c);
  b.add(new BoxGeometry(0.3, 0.02, 0.32), tf(0, 0.315, 0.1), 0x24425a, 0.2);
  b.add(new BoxGeometry(0.22, 0.012, 0.24), tf(0, 0.33, 0.1), 0x2f5d78, 0.3);
  // Mast with a crosstree and the masthead light.
  b.add(new CylinderGeometry(0.012, 0.016, 0.42, 6), tf(0, 0.53, 0.08), 0xe9e4d8);
  b.add(new BoxGeometry(0.16, 0.012, 0.012), tf(0, 0.62, 0.08), 0xe9e4d8);
  runningLights(b, 0.75, 0.08);
  // Stern A-frame gantry, a net drum and a heap of green net with orange floats.
  for (const side of [-1, 1]) b.add(new CylinderGeometry(0.012, 0.012, 0.34, 5), tf(side * 0.15, 0.31, -0.5, -0.25, 0, 0), 0xf08a3c);
  b.add(new BoxGeometry(0.32, 0.02, 0.02), tf(0, 0.47, -0.54), 0xf08a3c);
  b.add(new CylinderGeometry(0.06, 0.06, 0.22, 10), tf(0, 0.19, -0.3, 0, 0, Math.PI / 2), 0x4f7f5f);
  b.add(new BoxGeometry(0.18, 0.04, 0.14), tf(0.02, 0.15, -0.44), 0x3f6f50);
  for (const [x, z] of [
    [-0.06, -0.42],
    [0.08, -0.47],
    [0.0, -0.36],
  ] as const)
    b.add(new SphereGeometry(0.022, 6, 4), tf(x, 0.18, z), 0xf58a2b);
  lifebuoy(b, 0.14, 0.23, 0.1, 1);
  lifebuoy(b, -0.14, 0.23, 0.1, -1);
  // Fish hold hatch.
  b.add(new BoxGeometry(0.16, 0.02, 0.12), tf(0, 0.135, -0.12), 0x8a6a4a);
  return b.build();
}

/** The red-and-cream longliner. */
export function longlinerGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  hull(b, 0xc4473b);
  // Low cabin aft with a raked front, cream walls and a window band.
  b.add(new BoxGeometry(0.28, 0.13, 0.3), tf(0, 0.2, -0.28), 0xf1e6cf);
  b.add(new BoxGeometry(0.29, 0.045, 0.24), tf(0, 0.24, -0.25), 0x22323a);
  b.add(new BoxGeometry(0.32, 0.025, 0.36), tf(0, 0.28, -0.28), 0xe2d6bd);
  // Stub mast and work light, a radar dome, a flag line to the bow.
  b.add(new CylinderGeometry(0.011, 0.014, 0.3, 6), tf(0, 0.44, -0.2), 0xe9e4d8);
  b.add(new SphereGeometry(0.04, 8, 5), tf(0.07, 0.31, -0.36), 0xf6f3ea);
  runningLights(b, 0.6, -0.2);
  for (let i = 0; i < 5; i++) {
    const k = i / 4;
    b.add(new BoxGeometry(0.03, 0.022, 0.003), tf(0.012, 0.56 - k * 0.3, -0.2 + k * 0.72), [0xf26a2e, 0xffd23f, 0x3f8fb0][i % 3]!);
  }
  // Buoy rack and line tubs forward.
  for (let i = 0; i < 4; i++) b.add(new SphereGeometry(0.03, 6, 4), tf(-0.1 + i * 0.065, 0.19, 0.12), i % 2 ? 0xffd23f : 0xf26a2e);
  b.add(new CylinderGeometry(0.05, 0.045, 0.06, 10), tf(0.08, 0.17, 0.3), 0x3a6f9a);
  b.add(new CylinderGeometry(0.05, 0.045, 0.06, 10), tf(-0.07, 0.17, 0.32), 0x3a6f9a);
  lifebuoy(b, 0.15, 0.2, -0.28, 1);
  return b.build();
}

/** A foam wake: a long V from the stern and a short bow wave, flat on the water (unit length, scaled by speed). */
export function wakeGeometry(): BufferGeometry {
  const pos: number[] = [];
  const v = (x: number, z: number) => [x, 0.012, z];
  // Two arms behind the stern, each a thin tapering strip.
  for (const side of [-1, 1]) {
    const a = v(side * 0.17, -0.62);
    const b2 = v(side * 0.21, -0.62);
    const c = v(side * 0.5, -1.5);
    const d = v(side * 0.44, -1.5);
    if (side > 0) pos.push(...a, ...c, ...b2, ...a, ...d, ...c);
    else pos.push(...a, ...b2, ...c, ...a, ...c, ...d);
  }
  // A churned strip straight behind.
  pos.push(...v(-0.1, -0.64), ...v(0.1, -0.64), ...v(0, -1.15));
  // Bow wave.
  for (const side of [-1, 1]) {
    const a = v(0, 0.68);
    const b2 = v(side * 0.2, 0.32);
    const c = v(side * 0.26, 0.12);
    if (side > 0) pos.push(...a, ...c, ...b2);
    else pos.push(...a, ...b2, ...c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  // Pale sea-foam, no glow (a bright white blade read as a laser at night).
  return new GeoBuilder().add(g, tf(0, 0, 0), 0xcfe9ec, 0).build();
}
