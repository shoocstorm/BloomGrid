import { BoxGeometry, CylinderGeometry, DoubleSide, Group, SphereGeometry, TorusGeometry } from 'three/webgpu';
import { BALL, glow, hard, joint, part, soft } from './rig';

/**
 * A small wooden boat for films (D-197): the old fisher's rowboat in "Something Stirs", Ama Reyes's lantern boat in
 * "First Light" (`sail`). A clinker hull, two thwarts, oars, a lantern on a post at the bow.
 */
const BOX = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(1, 1, 1, 16);
const DISC = new CylinderGeometry(1, 1, 1, 48);
/** The floorboards' height and the thwarts' (seat tops at `SEAT + 0.025`), in boat units. */
const FLOOR = -0.26;
export const SEAT = -0.08;
/** How high the boat's origin floats above the water, in boat units: the floor stays dry with room to rock. */
export const BOAT_FLOAT = 0.34;

/** The rowboat: a clinker hull, two thwarts, oars, a lantern at the bow (≈3.2 long along z, bow at +z). */
export function rowboat(sail = false): { root: Group; lamp: ReturnType<typeof glow> } {
  const root = new Group();
  const wood = soft(0x8a5a3a, 0.7, 0.2);
  const dark = hard(0x5e3a22, 0.8);
  const paint = soft(0x2f6d8a, 0.6, 0.2);
  const hull = part(new SphereGeometry(1, 40, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), wood, root, 0, 0, 0, 0.78, 0.52, 1.62);
  (hull.material as typeof wood).side = DoubleSide;
  // A painted band along the sheer.
  part(new SphereGeometry(1, 40, 4, 0, Math.PI * 2, Math.PI / 2, 0.18), paint, root, 0, 0, 0, 0.785, 0.52, 1.625);
  // Floorboards cut to the hull's own cross-section at their height, so they close it off completely: the boat floats
  // with its floor above the waterline (`BOAT_FLOAT`) and the sea never shows inside it.
  const k = Math.sqrt(1 - (FLOOR / 0.52) ** 2);
  part(DISC, dark, root, 0, FLOOR, 0, 0.78 * k, 0.03, 1.62 * k);
  for (const x of [-0.36, -0.12, 0.12, 0.36]) part(BOX, wood, root, x, FLOOR + 0.017, 0, 0.18, 0.006, 2.6 * k * Math.sqrt(1 - (x / (0.78 * k)) ** 2));
  // Ribs up the inside of the hull.
  for (const z of [-1.0, -0.4, 0.2, 0.8]) {
    const w = 0.78 * Math.sqrt(1 - (z / 1.62) ** 2);
    for (const s of [1, -1]) part(BOX, dark, root, s * w * 0.86, -0.12, z, 0.03, 0.26, 0.05).rotation.z = s * -0.5;
  }
  const rim = part(new TorusGeometry(1, 0.045, 8, 64), dark, root, 0, 0.005, 0, 0.78, 1.62, 1);
  rim.rotation.x = Math.PI / 2;
  for (const z of [-0.75, 0.55]) part(BOX, wood, root, 0, SEAT, z, 1.36 - Math.abs(z) * 0.3, 0.05, 0.26);
  // Oars resting along the gunwales.
  for (const s of [1, -1]) {
    const oar = joint(root, s * 0.62, 0.02, -0.1);
    oar.rotation.set(0.1, 0, s * 0.12);
    part(CYL, wood, oar, 0, 0, 0, 0.022, 2.4, 0.022).rotation.x = Math.PI / 2;
    part(BOX, wood, oar, 0, 0, -1.25, 0.012, 0.16, 0.42);
  }
  // A lantern on a post at the bow.
  part(CYL, dark, root, 0, 0.25, 1.25, 0.018, 0.5, 0.018);
  const lamp = glow(0xffc46a, 2);
  part(BALL, lamp, root, 0, 0.47, 1.25, 0.06, 0.08, 0.06);
  part(CYL, dark, root, 0, 0.56, 1.25, 0.05, 0.02, 0.05);
  // A bucket.
  part(new CylinderGeometry(0.11, 0.09, 0.2, 16, 1, true), hard(0x7a8a9a, 0.4, 0.6), root, 0.35, -0.22, -1.1, 1);
  if (sail) {
    // A mast and a patched sail, set a little off the wind.
    part(CYL, dark, root, 0, 1.1, 0.25, 0.03, 2.4, 0.03);
    const s = part(new SphereGeometry(1, 16, 10, 0, Math.PI, 0, Math.PI / 2), soft(0xefe6d2, 0.9, 0.3), root, 0, 0.35, 0.25, 0.05, 1.9, 0.9);
    s.rotation.set(0, Math.PI / 2 - 0.3, 0);
    (s.material as ReturnType<typeof soft>).side = DoubleSide;
  }
  return { root, lamp };
}

