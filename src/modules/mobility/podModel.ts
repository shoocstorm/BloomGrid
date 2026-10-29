import {
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three/webgpu';
import { GeoBuilder, tf } from '@/render/bake';

/**
 * The commuter pod (D-051): a pearl teardrop hull, about 0.66 tiles nose to tail along +X, with a smoked-glass
 * canopy over a lit cabin, a window band down each side, a cyan light line at the waist, a glowing ring
 * thruster at the tail, swept fins and a hover pad underneath. One merged geometry: per-vertex colour and
 * `aGlow` (lit parts; `GLAZING` marks glass: glossy, warm cabin light at night, so the pod stays within
 * WebGPU's eight vertex buffers). Kept lean (≈1.3k vertices): the pod shader evaluates the flight per vertex.
 */

const PEARL = 0xf2f6f3;
const TRIM = 0x2f6f78;
const GLASS = 0x0f2f3a;
const CYAN = 0x7ff7e6;
/** `aGlow` value marking glazing. */
export const GLAZING = -1;

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

export function podGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  // Hull and a darker keel.
  b.add(hull(0.33, 0.11, 0.145, 0.45), tf(0, 0, 0), PEARL, 0);
  b.add(hull(0.28, 0.035, 0.11, 0.4, 12, 5), tf(-0.01, -0.085, 0), TRIM, 0);
  // Canopy: a smoked bubble over the front half, split into panes by a spine and two frames.
  b.add(hull(0.2, 0.088, 0.114, 0.6, 14, 8), tf(0.075, 0.052, 0), GLASS, GLAZING);
  b.add(new BoxGeometry(0.3, 0.012, 0.014), tf(0.07, 0.137, 0, 0, 0, -0.08), PEARL, 0);
  for (const x of [0.02, 0.13])
    b.add(
      new TorusGeometry(1, 0.06, 3, 16, Math.PI),
      tf(x, 0.05, 0, 0, Math.PI / 2, 0, 0.115, 0.092, 0.2),
      PEARL,
      0,
    );
  // Cabin windows down each flank.
  for (const sz of [-1, 1])
    for (const x of [0.13, 0.04, -0.05])
      b.add(
        hull(0.034, 0.019, 0.01, 0, 8, 5),
        tf(x, 0.024, sz * (0.134 - Math.abs(x) * 0.07)),
        GLASS,
        GLAZING,
      );
  // Waist light line and nose light.
  b.add(hull(0.334, 0.007, 0.15, 0.45, 14, 3), tf(0, -0.03, 0), CYAN, 1.6);
  b.add(new SphereGeometry(0.022, 6, 4), tf(0.325, -0.01, 0), 0xfff4d8, 3);
  // Tail: ring thruster round a bright core.
  b.add(new TorusGeometry(0.06, 0.016, 5, 14), tf(-0.255, 0, 0, 0, Math.PI / 2), TRIM, 0);
  b.add(new CylinderGeometry(0.048, 0.04, 0.02, 10), tf(-0.268, 0, 0, 0, 0, Math.PI / 2), CYAN, 3);
  // Swept fins: two canted stabilisers and a dorsal blade with a lit edge.
  for (const s of [-1, 1])
    b.add(new BoxGeometry(0.13, 0.008, 0.08), tf(-0.21, 0.035, s * 0.12, s * -0.45, 0.25 * s), PEARL, 0);
  b.add(new BoxGeometry(0.13, 0.06, 0.008), tf(-0.2, 0.1, 0, 0, 0, 0.35), PEARL, 0);
  b.add(new BoxGeometry(0.1, 0.008, 0.01), tf(-0.205, 0.128, 0, 0, 0, 0.35), CYAN, 2);
  // Hover pad.
  b.add(hull(0.14, 0.008, 0.07, 0, 10, 3), tf(0.01, -0.118, 0), CYAN, 1.2);
  return b.build();
}
