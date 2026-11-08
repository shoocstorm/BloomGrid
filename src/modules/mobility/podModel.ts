import {
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three/webgpu';
import { GeoBuilder, tf } from '@/render/bake';

/**
 * The commuter pod (D-051, detailed in D-147): a pearl teardrop hull, about 0.66 tiles nose to tail along +X, with a
 * livery sweep along its lower flanks (coloured per pod in the shader), a panoramic smoked-glass canopy, a window
 * band down each side, a cyan waist line, stub wings carrying glowing ducted fans, a ring thruster at the tail,
 * swept fins with livery tips, a headlight bar, red / green navigation lights and a hover pad underneath. One merged
 * geometry: per-vertex colour and `aGlow` (lit parts; `GLAZING` marks glass, `LIVERY` the livery: both decoded in the
 * shader, so the pod stays within WebGPU's eight vertex buffers). Kept lean (≈4.3k vertices, no more than the plain pod before it): the pod shader
 * evaluates the flight per vertex.
 */

const PEARL = 0xf2f6f3;
const TRIM = 0x2f6f78;
const GLASS = 0x0f2f3a;
const CYAN = 0x7ff7e6;
/** `aGlow` values marking glazing and the livery (a per-pod colour from the shader). */
export const GLAZING = -1;
export const LIVERY = -2;

/** A unit sphere squashed into an ellipsoid with semi-axes (x, y, z), tapered toward the tail (−X). */
function hull(sx: number, sy: number, sz: number, taper: number, w = 14, h = 9): BufferGeometry {
  const g = new SphereGeometry(1, w, h);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    // Tail tapers by `taper`; the nose sharpens a little.
    const k = x < 0 ? 1 + x * taper : 1 - x * x * 0.25;
    p.setXYZ(i, x * sx, p.getY(i) * sy * k, p.getZ(i) * sz * k);
  }
  g.computeVertexNormals();
  return g;
}

/** `g` with everything above `cut` pressed down onto it: a skin for the lower part only (inside the hull above). */
function below(g: BufferGeometry, cut: number): BufferGeometry {
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > cut) p.setY(i, cut);
  g.computeVertexNormals();
  return g;
}

export function podGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  // Hull, the livery sweep over its lower flanks (a slightly larger skin cut at the waist), and a darker keel.
  b.add(hull(0.33, 0.11, 0.145, 0.45), tf(0, 0, 0), PEARL, 0);
  b.add(below(hull(0.334, 0.112, 0.148, 0.45, 12, 6), -0.022), tf(0, 0, 0), PEARL, LIVERY);
  b.add(hull(0.28, 0.035, 0.11, 0.4, 10, 4), tf(-0.01, -0.085, 0), TRIM, 0);
  // Panoramic canopy: a smoked bubble over the front half, split into panes by a spine and two frames.
  b.add(hull(0.21, 0.092, 0.118, 0.6, 12, 6), tf(0.075, 0.052, 0), GLASS, GLAZING);
  b.add(new BoxGeometry(0.3, 0.012, 0.014), tf(0.07, 0.141, 0, 0, 0, -0.08), PEARL, 0);
  for (const x of [0.02, 0.13])
    b.add(new TorusGeometry(1, 0.06, 3, 10, Math.PI), tf(x, 0.05, 0, 0, Math.PI / 2, 0, 0.12, 0.095, 0.2), PEARL, 0);
  // A window band down each flank with two mullions.
  for (const sz of [-1, 1]) {
    b.add(hull(0.15, 0.021, 0.01, 0, 8, 3), tf(-0.01, 0.026, sz * 0.13), GLASS, GLAZING);
    for (const x of [-0.06, 0.04]) b.add(new BoxGeometry(0.008, 0.046, 0.012), tf(x, 0.026, sz * 0.136), PEARL, 0);
  }
  // Waist light line, headlight bar across the nose.
  b.add(hull(0.336, 0.006, 0.151, 0.45, 12, 3), tf(0, -0.022, 0), CYAN, 1.6);
  b.add(hull(0.02, 0.009, 0.06, 0, 6, 3), tf(0.318, -0.004, 0), 0xfff4d8, 3);
  // Stub wings with ducted fans (glowing discs), red to port, green to starboard at the tips.
  for (const s of [-1, 1]) {
    b.add(new BoxGeometry(0.11, 0.012, 0.09), tf(-0.04, -0.035, s * 0.175, s * 0.12, 0, 0), PEARL, 0);
    b.add(new TorusGeometry(0.044, 0.011, 3, 12), tf(-0.04, -0.03, s * 0.232, Math.PI / 2, 0, 0), PEARL, LIVERY);
    b.add(new CylinderGeometry(0.038, 0.038, 0.006, 10, 1), tf(-0.04, -0.03, s * 0.232), CYAN, 1.4);
    b.add(new SphereGeometry(0.011, 5, 3), tf(-0.04, -0.03, s * 0.282), s < 0 ? 0xff5a5a : 0x6fff9a, 2.6);
  }
  // Tail: ring thruster round a bright core.
  b.add(new TorusGeometry(0.06, 0.016, 4, 12), tf(-0.255, 0, 0, 0, Math.PI / 2), TRIM, 0);
  b.add(new CylinderGeometry(0.048, 0.04, 0.02, 10), tf(-0.268, 0, 0, 0, 0, Math.PI / 2), CYAN, 3);
  // Swept fins with livery tips: two canted stabilisers and a dorsal blade with a lit edge.
  for (const s of [-1, 1]) {
    b.add(new BoxGeometry(0.13, 0.008, 0.08), tf(-0.21, 0.035, s * 0.12, s * -0.45, 0.25 * s), PEARL, 0);
    b.add(new BoxGeometry(0.05, 0.01, 0.03), tf(-0.24, 0.055, s * 0.165, s * -0.45, 0.25 * s), PEARL, LIVERY);
  }
  b.add(new BoxGeometry(0.13, 0.06, 0.008), tf(-0.2, 0.1, 0, 0, 0, 0.35), PEARL, LIVERY);
  b.add(new BoxGeometry(0.1, 0.008, 0.01), tf(-0.205, 0.128, 0, 0, 0, 0.35), CYAN, 2);
  // Hover pad.
  b.add(hull(0.14, 0.008, 0.07, 0, 8, 3), tf(0.01, -0.118, 0), CYAN, 1.2);
  return b.build();
}
