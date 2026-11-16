import { BoxGeometry, CylinderGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three/webgpu';
import { tf } from '@/render/bake';
import { hash2 } from '@/sim/random';
import {
  BALL,
  BALL_LO,
  boulder,
  CONE,
  craggy,
  CYL,
  CYL8,
  DOME,
  GEM,
  Kit,
  palm,
  petal,
  ROD,
  span,
  SURF,
  TINY,
  tree,
  twoSided,
} from './wonderKit';
import { foam, islet } from './wonderModels';

/**
 * Three later sea wonders (D-164), each one merged mesh in the `wonder` material like the first five
 * (`wonderModels.ts`): Turtle Isle (a giant sea turtle asleep at the surface with a garden on its shell), the Sunken
 * Colonnade (a drowned marble temple) and the Prism Geode (a cracked geode bursting with glowing crystals).
 * Footprints stay inside the cruise ferry's sightseeing loops (`SITES` in `modules/ferry/index.ts`).
 */

const WARM = 0xffcf86;
const LUMEN = 0x8ff7ff;
const MARBLE = [0xebe4d6, 0xddd4c2, 0xe4dccb] as const;
const MOSS = 0x6fa45a;

const BOX = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);
const _q = new Quaternion();
const UP = new Vector3(0, 1, 0);

/** A frame turned by `yaw` about (x, z): local (lx, y, lz) → world. */
function frame(x: number, z: number, yaw: number) {
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  return (lx: number, y: number, lz: number) => v3(x + lx * c + lz * s, y, z - lx * s + lz * c);
}

/** A part standing on a surface at `p` with normal `n`, turned `spin` about it, scaled. */
function onSurface(p: Vector3, n: Vector3, spin: number, sx: number, sy: number, sz: number): Matrix4 {
  _q.setFromUnitVectors(UP, n.clone().normalize());
  const q = new Quaternion().setFromAxisAngle(UP, spin).premultiply(_q);
  return new Matrix4().compose(p, q, v3(sx, sy, sz));
}

// ── Turtle Isle ───────────────────────────────────────────────────────────────────────────────────────────────
const SHELL = 0x6e5a38;
const SCUTE = [0x8a7444, 0x7c6a3e, 0x96804c] as const;
const SKIN = 0x8ea383;

/** A giant sea turtle asleep at the surface: scuted shell, head raised, flippers awash, a garden on its back. */
export function turtle(x: number, z: number): Kit {
  const k = new Kit();
  const yaw = 2.3;
  const L = frame(x, z, yaw);
  const [RX, RZ, H, Y0] = [11, 13.5, 5.2, -1.4];
  // Shell: a domed carapace with a rim of marginal plates at the waterline.
  k.part(DOME, tf(x, Y0, z, 0, yaw, 0, RX, H, RZ), SHELL, SURF.stone);
  k.part(new TorusGeometry(1, 0.07, 6, 56), tf(x, Y0 + 0.5, z, Math.PI / 2, yaw, 0, RX * 1.02, RZ * 1.02, RX), 0x8f7c4e, SURF.stone);
  for (let m = 0; m < 26; m++) {
    const a = (m / 26) * Math.PI * 2;
    const p = L(Math.cos(a) * RX * 1.0, Y0 + 0.75, Math.sin(a) * RZ * 1.0);
    k.part(BALL_LO, tf(p.x, p.y, p.z, 0, yaw - a, 0, 0.5, 0.35, 1.6), SCUTE[m % 3]!, SURF.stone);
  }
  // Scutes: a row of plates down the spine and two rows each side, raised from the dome along its normal.
  const surf = (lx: number, lz: number) => {
    const q = 1 - (lx / RX) ** 2 - (lz / RZ) ** 2;
    const y = Y0 + H * Math.sqrt(Math.max(0.02, q));
    const n = new Vector3(lx / (RX * RX), (y - Y0) / (H * H), lz / (RZ * RZ));
    // To world: turn the normal like the frame.
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    return { p: L(lx, y - 0.1, lz), n: v3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c) };
  };
  const plate = new CylinderGeometry(1, 0.96, 0.4, 6);
  const plates: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) plates.push([0, -8.4 + i * 4.2, 2.1]);
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) plates.push([sd * 5.4, -6.3 + i * 4.2, 2.3]);
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) plates.push([sd * 8.6, -4.2 + i * 4.2, 1.6]);
  plates.forEach(([lx, lz, r], i) => {
    const { p, n } = surf(lx, lz);
    k.part(plate, onSurface(p, n, yaw + Math.PI / 6, r, 1, r * 1.12), SCUTE[i % 3]!, SURF.stone);
    k.part(plate, onSurface(p.clone().addScaledVector(n.clone().normalize(), 0.18), n, yaw + Math.PI / 6, r * 0.62, 1, r * 0.7), 0xa48e58, SURF.stone);
  });
  // Barnacles round the rim.
  for (let b = 0; b < 30; b++) {
    const a = hash2(b, 1, 331) * 6.28;
    const p = L(Math.cos(a) * RX * 0.93, Y0 + 1.3 + hash2(b, 2, 331) * 0.6, Math.sin(a) * RZ * 0.93);
    k.part(CONE, tf(p.x, p.y, p.z, 0, 0, 0, 0.22, 0.22, 0.22), 0xe9e2d2, SURF.stone);
  }
  // Head on a raised neck, a hooked beak and a calm, half-closed eye.
  const neck0 = L(0, -0.6, RZ * 0.86);
  const neck1 = L(0, 1.1, RZ + 3.4);
  k.part(CYL, span(neck0, neck1, 2.0, 1.7), SKIN, SURF.matte);
  const hp = L(0, 1.6, RZ + 5.2);
  k.part(BALL, tf(hp.x, hp.y, hp.z, -0.12, yaw, 0, 2.2, 1.85, 3.1), SKIN, SURF.matte);
  const bk = L(0, 1.0, RZ + 7.9);
  k.part(BALL, tf(bk.x, bk.y, bk.z, 0.35, yaw, 0, 1.1, 0.8, 1.0), 0x5f6f4f, SURF.matte);
  for (const sd of [-1, 1]) {
    const e = L(sd * 1.75, 2.15, RZ + 6.3);
    k.part(BALL_LO, tf(e.x, e.y, e.z, 0, yaw, 0, 0.42, 0.3, 0.42), 0x1d2420, SURF.glass);
    const lid = L(sd * 1.8, 2.35, RZ + 6.3);
    k.part(BALL_LO, tf(lid.x, lid.y, lid.z, 0, yaw, 0, 0.5, 0.22, 0.5), SKIN, SURF.matte);
  }
  // Head and neck scales: pale patches.
  for (let s = 0; s < 14; s++) {
    const a = hash2(s, 3, 337) * 6.28;
    const along = hash2(s, 4, 337);
    const p = L(Math.cos(a) * 1.9, 1.5 + Math.sin(a) * 1.5 + 0.2, RZ + 2.4 + along * 4.6);
    if (p.y < 0.2) continue;
    k.part(TINY, tf(p.x, p.y, p.z, 0, a, 0, 0.45, 0.2, 0.45), 0xc4d0b4, SURF.matte);
  }
  // Flippers awash: the big front pair reaching forward-out, the hind pair back.
  for (const sd of [-1, 1]) {
    const f = L(sd * RX * 0.8, 0.1, RZ * 0.5);
    k.part(petal(11, 3.8, -0.15, -0.25, 0.15, 7, 3), tf(f.x, f.y, f.z, 0.06, yaw + sd * (Math.PI / 2 - 0.35), 0), SKIN, SURF.matte);
    const r = L(sd * RX * 0.7, 0.08, -RZ * 0.75);
    k.part(petal(6, 3, -0.1, -0.15, 0.15, 6, 2), tf(r.x, r.y, r.z, 0.06, yaw + sd * (Math.PI - 0.75), 0), SKIN, SURF.matte);
  }
  const tl = L(0, -0.4, -RZ - 0.8);
  k.part(CONE, tf(tl.x, tl.y, tl.z, -Math.PI / 2 - 0.1, yaw, 0, 0.9, 2.4, 0.6), SKIN, SURF.matte);
  foam(k, x, z, 13.4, 34, 71);
  for (const sd of [-1, 1]) {
    const f = L(sd * (RX * 0.8 + 9), 0, RZ * 0.5 + 2.4);
    foam(k, f.x, f.z, 1.4, 6, 73 + sd);
  }

  // Garden on the back: a grassy mound, palms, a tree, a little shrine with a lantern, flowers, a tide pool.
  const top = Y0 + H;
  const g0 = L(0, top - 0.95, -2.2);
  k.part(boulder(5), tf(g0.x, g0.y, g0.z, 0, yaw, 0, 6.2, 1.3, 7.2), 0x6aae58, SURF.leaf);
  const gp = (lx: number, lz: number) => {
    const q = 1 - (lx / RX) ** 2 - (lz / RZ) ** 2;
    return Y0 + H * Math.sqrt(Math.max(0, q)) + 0.25;
  };
  const p1 = L(-2.6, 0, -5.2);
  palm(k, p1.x, gp(-2.6, -5.2), p1.z, 6.8, yaw + 2.6, 13);
  const p2 = L(3.2, 0, -3.8);
  palm(k, p2.x, gp(3.2, -3.8), p2.z, 5.4, yaw - 0.8, 17);
  const t1 = L(-3.4, 0, 1.4);
  tree(k, t1.x, gp(-3.4, 1.4), t1.z, 4.2, 23);
  // Shrine: a stone base, four red posts and a tiered roof, with a lantern inside.
  const sh = L(2.6, 0, 4.0);
  const sy = gp(2.6, 4.0) - 0.1;
  k.part(CYL8, tf(sh.x, sy, sh.z, 0, yaw + Math.PI / 8, 0, 1.7, 0.45, 1.7), 0xbdb3a2, SURF.stone);
  for (let p = 0; p < 4; p++) {
    const a = yaw + (p / 4) * Math.PI * 2 + Math.PI / 4;
    k.part(CYL8, tf(sh.x + Math.cos(a) * 1.1, sy + 0.45, sh.z + Math.sin(a) * 1.1, 0, 0, 0, 0.11, 1.9, 0.11), 0xc0503f, SURF.paint);
  }
  const roof = new CylinderGeometry(0, 1, 1, 4).translate(0, 0.5, 0);
  k.part(roof, tf(sh.x, sy + 2.3, sh.z, 0, yaw + Math.PI / 4, 0, 2.1, 0.9, 2.1), 0x3f6f62, SURF.metal);
  k.part(roof, tf(sh.x, sy + 2.95, sh.z, 0, yaw + Math.PI / 4, 0, 1.3, 0.7, 1.3), 0x3f6f62, SURF.metal);
  k.part(BALL, tf(sh.x, sy + 3.75, sh.z, 0, 0, 0, 0.18), 0xd2a54e, SURF.brass);
  k.part(BALL_LO, tf(sh.x, sy + 1.5, sh.z, 0, 0, 0, 0.32, 0.42, 0.32), WARM, SURF.glass, 2.4);
  // Tide pool with a rim of pebbles.
  const tp = L(-2.0, 0, 5.4);
  const ty = gp(-2.0, 5.4) - 0.25;
  k.part(new CylinderGeometry(1.7, 1.7, 0.1, 18), tf(tp.x, ty + 0.05, tp.z), 0x6fc9d6, SURF.water, 0.15);
  for (let r = 0; r < 12; r++) {
    const a = (r / 12) * Math.PI * 2;
    k.part(boulder(r, 1), tf(tp.x + Math.cos(a) * 1.85, ty, tp.z + Math.sin(a) * 1.85, 0, a, 0, 0.42, 0.3, 0.42), 0x9a9184, SURF.stone);
  }
  for (let f = 0; f < 34; f++) {
    const lx = (hash2(f, 1, 347) - 0.5) * 10;
    const lz = (hash2(f, 2, 347) - 0.5) * 13 - 1;
    if ((lx / (RX * 0.62)) ** 2 + (lz / (RZ * 0.62)) ** 2 > 1) continue;
    const p = L(lx, gp(lx, lz) + 0.1, lz);
    k.part(TINY, tf(p.x, p.y, p.z, 0, 0, 0, 0.26), [0xffd36b, 0xff9ec8, 0xffffff, 0xc77dff, 0xff7f6e][f % 5]!, SURF.petal, 0.3);
  }
  return k;
}

// ── Sunken Colonnade ──────────────────────────────────────────────────────────────────────────────────────────
/** A fluted column shaft (`r` at the foot, tapering a little), 20 flutes. */
const shaft = (r: number, h: number) => {
  const g = new CylinderGeometry(r * 0.88, r, h, 30, 2, true).translate(0, h / 2, 0);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    const len = Math.hypot(x, z);
    if (!len) continue;
    const k = 1 - 0.055 * Math.abs(Math.cos(Math.atan2(z, x) * 10));
    p.setXYZ(i, (x / len) * len * k, y, (z / len) * len * k);
  }
  g.computeVertexNormals();
  return g;
};
const SHAFT = shaft(1, 1);
/** A broken top: the shaft's last drum with a jagged, craggy break. */
const BROKEN = craggy(new CylinderGeometry(0.9, 0.92, 1, 20, 3).translate(0, 0.5, 0), 0.06, 9, 0.35);

/** One column standing in the sea at `p` (its foot under water): base, fluted shaft, capital; or broken off. */
function column(k: Kit, p: Vector3, h: number, broken: boolean, seed: number, ivy: boolean): void {
  const r = 0.95;
  const col = MARBLE[seed % 3]!;
  k.part(CYL8, tf(p.x, -1.5, p.z, 0, seed, 0, r * 1.45, 1.9, r * 1.45), 0xcfc6b4, SURF.stone);
  k.part(new TorusGeometry(r * 1.1, r * 0.2, 6, 24), tf(p.x, 0.5, p.z, Math.PI / 2, 0, 0), col, SURF.stone);
  const sh = broken ? h * (0.4 + hash2(seed, 2, 401) * 0.35) : h;
  k.part(SHAFT, tf(p.x, 0.5, p.z, 0, seed, 0, r, sh, r), col, SURF.stone);
  if (broken) {
    k.part(BROKEN, tf(p.x, 0.5 + sh - 0.1, p.z, 0, seed, 0, r * 0.95, 0.8, r * 0.95), col, SURF.stone);
    k.part(boulder(seed, 1), tf(p.x, 0.5 + sh + 0.45, p.z, 0, seed, 0, r * 0.85, 0.35, r * 0.85), MOSS, SURF.leaf);
  } else {
    // Capital: an echinus and a square abacus.
    k.part(new TorusGeometry(r * 0.96, r * 0.22, 6, 24), tf(p.x, 0.5 + sh, p.z, Math.PI / 2, 0, 0), col, SURF.stone);
    k.part(CYL, tf(p.x, 0.5 + sh, p.z, 0, 0, 0, r * 1.05, 0.3, r * 1.05), col, SURF.stone);
  }
  foam(k, p.x, p.z, r * 1.6, 8, seed);
  // Glowing moss at the waterline.
  for (let m = 0; m < 4; m++) {
    const a = hash2(seed, m, 409) * 6.28;
    k.part(TINY, tf(p.x + Math.cos(a) * r * 1.02, 0.7 + m * 0.3, p.z + Math.sin(a) * r * 1.02, 0, a, 0, 0.18, 0.3, 0.18), LUMEN, SURF.matte, 1.4);
  }
  if (ivy) {
    // A strand of ivy down the shaft with leaves and a few flowers.
    const a0 = hash2(seed, 5, 401) * 6.28;
    let prev = v3(p.x + Math.cos(a0) * r, 0.5 + sh, p.z + Math.sin(a0) * r);
    for (let s = 1; s <= 6; s++) {
      const a = a0 + s * 0.35;
      const next = v3(p.x + Math.cos(a) * r * 0.98, 0.5 + sh - (sh * 0.85 * s) / 6, p.z + Math.sin(a) * r * 0.98);
      k.part(ROD, span(prev, next, 0.06), 0x3f7f3f, SURF.leaf);
      k.part(petal(0.6, 0.38, 0, -0.15, 0, 3, 1), tf(next.x, next.y, next.z, 0.4, a + Math.PI / 2, 0), 0x56a84f, SURF.leaf);
      if (s % 2) k.part(TINY, tf(next.x, next.y + 0.15, next.z, 0, 0, 0, 0.17), s % 4 === 1 ? 0xff9ec8 : 0xfff2a8, SURF.petal, 0.6);
      prev = next;
    }
  }
}

/** A drowned marble temple: a ring of fluted columns with lintels, toppled drums, a stair up to a domed rotunda. */
export function colonnade(x: number, z: number): Kit {
  const k = new Kit();
  const R = 15;
  const N = 14;
  const H = 10;
  const yaw = -0.4;
  const pts: Vector3[] = [];
  const standing: boolean[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + yaw;
    const p = v3(x + Math.cos(a) * R, 0, z + Math.sin(a) * R * 0.82);
    const broken = [3, 4, 9, 12].includes(i);
    pts.push(p);
    standing.push(!broken && i !== 7);
    if (i === 7) continue; // fallen: its drums lie in the water below
    column(k, p, H + (i % 2) * 0.3, broken, i, i % 3 === 0);
  }
  // Lintels between neighbours still standing, a lumen frieze along each, ivy hanging off the ends.
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (!standing[i] || !standing[j]) continue;
    const [a, b] = [pts[i]!, pts[j]!];
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    const mid = v3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    const len = a.distanceTo(b) + 2.2;
    const y = 0.5 + H + 0.3;
    k.part(BOX, tf(mid.x, y, mid.z, 0, ang, 0, 1.9, 1.1, len), MARBLE[i % 3]!, SURF.stone);
    k.part(BOX, tf(mid.x, y + 1.1, mid.z, 0, ang, 0, 2.3, 0.35, len + 0.4), 0xf2ece0, SURF.stone);
    for (let g = 0; g < 4; g++) {
      const t = (g + 0.5) / 4 - 0.5;
      const gp = v3(mid.x + Math.sin(ang) * t * (len - 2), y + 0.55, mid.z + Math.cos(ang) * t * (len - 2));
      for (const sd of [-1, 1])
        k.part(TINY, tf(gp.x + Math.cos(ang) * sd * 0.97, gp.y, gp.z - Math.sin(ang) * sd * 0.97, 0, ang, Math.PI / 4, 0.22, 0.22, 0.05), LUMEN, SURF.glass, 1.8);
    }
  }
  // The fallen column: drums tumbled into the sea, one capital half-sunk.
  const f = pts[7]!;
  const out = v3(f.x - x, 0, f.z - z).normalize();
  for (let d = 0; d < 4; d++) {
    const q = f.clone().addScaledVector(out, 2 + d * 2.3);
    k.part(SHAFT, tf(q.x + d * 0.3, -0.3 + (d % 2) * 0.2, q.z, Math.PI / 2 + 0.1 * d, Math.atan2(out.x, out.z) + 0.25 * (d % 2 ? 1 : -1), 0, 0.92, 2.1, 0.92), MARBLE[d % 3]!, SURF.stone);
    foam(k, q.x, q.z, 1.6, 6, 200 + d);
  }
  // Rotunda on a stepped podium: eight small columns under a pale dome, a stair down to the water.
  const steps = [
    [8, -1, 1.3],
    [6.8, 0.3, 0.9],
    [5.8, 1.2, 0.8],
  ] as const;
  steps.forEach(([r, y0, h], i) => k.part(new CylinderGeometry(r, r + 0.15, h, 40).translate(0, h / 2, 0), tf(x, y0, z), MARBLE[i]!, SURF.stone));
  foam(k, x, z, 8.2, 26, 211);
  const fy = 2.0;
  for (let c = 0; c < 8; c++) {
    const a = (c / 8) * Math.PI * 2 + yaw;
    const p = v3(x + Math.cos(a) * 4.6, 0, z + Math.sin(a) * 4.6);
    k.part(SHAFT, tf(p.x, fy, p.z, 0, c, 0, 0.42, 5.2, 0.42), MARBLE[c % 3]!, SURF.stone);
    k.part(CYL, tf(p.x, fy + 5.2, p.z, 0, 0, 0, 0.5, 0.22, 0.5), MARBLE[0], SURF.stone);
  }
  k.part(new CylinderGeometry(5.3, 5.3, 0.9, 40).translate(0, 0.45, 0), tf(x, fy + 5.4, z), 0xf2ece0, SURF.stone);
  k.part(new TorusGeometry(5.2, 0.12, 4, 48), tf(x, fy + 5.75, z, Math.PI / 2), LUMEN, SURF.glass, 1.6);
  k.part(DOME, tf(x, fy + 6.3, z, 0, 0, 0, 4.9, 3.6, 4.9), 0x7fb8a8, SURF.metal);
  const rib = new TorusGeometry(1, 0.025, 3, 24, Math.PI);
  for (let r = 0; r < 8; r++) k.part(rib, tf(x, fy + 6.3, z, 0, (r / 8) * Math.PI, 0, 4.95, 3.65, 4.95), 0xd2a54e, SURF.brass);
  k.part(CYL8, tf(x, fy + 9.8, z, 0, 0, 0, 0.6, 0.8, 0.6), 0xf2ece0, SURF.stone);
  k.part(GEM, tf(x, fy + 11.1, z, 0, 0, 0, 0.5, 0.75, 0.5), LUMEN, SURF.glass, 2.6);
  // Inside: an eternal flame in a brass bowl.
  k.part(CYL8, tf(x, fy, z, 0, 0, 0, 0.5, 1.2, 0.5), MARBLE[1], SURF.stone);
  k.part(DOME, tf(x, fy + 1.9, z, Math.PI, 0, 0, 0.9, 0.7, 0.9), 0xd2a54e, SURF.brass);
  k.part(CONE, tf(x, fy + 1.9, z, 0, 0, 0, 0.5, 1.1, 0.5), 0xffb35a, SURF.glass, 3);
  // Stair down to the sea, braziers either side at the top.
  const sa = yaw + Math.PI * 0.55;
  const [ux, uz] = [Math.cos(sa), Math.sin(sa)];
  const sry = Math.atan2(ux, uz);
  for (let s = 0; s < 10; s++) {
    const d = 9.1 - s * 0.55;
    const top = Math.min(2.0, -0.6 + s * 0.29);
    k.part(BOX, tf(x + ux * d, -1.5, z + uz * d, 0, sry, 0, 3.2, top + 1.5, 0.6), MARBLE[s % 3]!, SURF.stone);
  }
  for (const sd of [-1, 1]) {
    const b = v3(x + ux * 6.3 - uz * sd * 2.3, 0, z + uz * 6.3 + ux * sd * 2.3);
    k.part(CYL8, tf(b.x, 1.2, b.z, 0, 0, 0, 0.4, 1.4, 0.4), MARBLE[2], SURF.stone);
    k.part(DOME, tf(b.x, 3.0, b.z, Math.PI, 0, 0, 0.75, 0.45, 0.75), 0xd2a54e, SURF.brass);
    k.part(CONE, tf(b.x, 3.0, b.z, 0, 0, 0, 0.42, 0.85, 0.42), 0xffb35a, SURF.glass, 3);
  }
  // Moss and flowers on the podium edge, lily pads in the shallows of the ring.
  for (let m = 0; m < 18; m++) {
    const a = hash2(m, 1, 419) * 6.28;
    const r = 5.6 + hash2(m, 2, 419) * 2.2;
    const y = r > 6.8 ? 1.2 : 2.0;
    k.part(boulder(m, 1), tf(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0, a, 0, 0.7, 0.22, 0.7), MOSS, SURF.leaf);
    if (m % 3 === 0) k.part(TINY, tf(x + Math.cos(a) * r, y + 0.25, z + Math.sin(a) * r, 0, 0, 0, 0.22), 0xff9ec8, SURF.petal, 0.4);
  }
  for (let l = 0; l < 10; l++) {
    const a = hash2(l, 3, 419) * 6.28;
    const r = 9.5 + hash2(l, 4, 419) * 3;
    k.part(new CylinderGeometry(1, 1, 0.08, 14, 1, false, 0.3, Math.PI * 2 - 0.6), tf(x + Math.cos(a) * r, 0.08, z + Math.sin(a) * r * 0.82, 0, a, 0, 0.8, 1.5, 0.8), 0x4fa258, SURF.leaf);
  }
  return k;
}

// ── Prism Geode ───────────────────────────────────────────────────────────────────────────────────────────────
const CRYSTAL = [0xb48cff, 0x9a72f0, 0x7fe8ff, 0xff9fd8, 0xc8b0ff] as const;

/** A hexagonal crystal with a pointed tip, `r` across and `h` long, rising along +y. */
const PRISM = new CylinderGeometry(1, 1.04, 1, 6).translate(0, 0.5, 0);
const TIP = new CylinderGeometry(0, 1, 1, 6).translate(0, 0.5, 0);

function crystal(k: Kit, base: Vector3, dir: Vector3, r: number, h: number, col: number, glow: number, spin: number): void {
  const d = dir.clone().normalize();
  const tipAt = base.clone().addScaledVector(d, h);
  k.part(PRISM, onSurface(base, d, spin, r, h, r), col, SURF.glass, glow);
  k.part(TIP, onSurface(tipAt, d, spin, r, r * 1.5, r), col, SURF.glass, glow * 1.4);
  // A brighter core line down the face catches the light.
  k.part(PRISM, onSurface(base.clone().addScaledVector(d, h * 0.08), d, spin, r * 0.45, h * 0.95, r * 0.45), 0xf4ecff, SURF.glass, glow * 1.6);
}

/** A cracked stone geode bursting with giant crystals, boulders and shards round it, a boardwalk ring with lamps. */
export function geode(x: number, z: number): Kit {
  const k = new Kit();
  islet(k, x, z, 13, 41, 12);
  // The geode: a broken stone shell open to the south-east, lined with pale amethyst inside.
  // A crater: the shell's top is broken off and a wedge is missing, so the lining and the crystals show from any side.
  const shell: BufferGeometry = craggy(new SphereGeometry(1, 40, 12, 0.5, Math.PI * 1.7, Math.PI * 0.2, Math.PI * 0.38), 0.07, 13, 0.08);
  const [SR, SH, SY, SYAW] = [11, 9, -1.8, 0.3];
  k.part(twoSided(shell), tf(x, SY, z, 0, SYAW, 0, SR, SH, SR), 0x5c5560, SURF.stone);
  k.part(twoSided(shell), tf(x, SY, z, 0, SYAW, 0, SR * 0.92, SH * 0.92, SR * 0.92), 0xd9c8f4, SURF.pearl, 0.25);
  // Druse: small crystal points lining the inner wall, on the shell's own vertices.
  const sp = shell.attributes.position!;
  for (let d = 0; d < 60; d++) {
    const i = Math.floor(hash2(d, 1, 503) * sp.count);
    const n = v3(sp.getX(i), sp.getY(i), sp.getZ(i)).applyAxisAngle(UP, SYAW);
    const p = v3(x + n.x * SR * 0.9, SY + n.y * SH * 0.9, z + n.z * SR * 0.9);
    if (p.y < 0.4 || n.y > 0.97) continue;
    const s = 0.25 + hash2(d, 3, 503) * 0.35;
    k.part(TIP, onSurface(p, n.clone().negate(), d, s, s * 2.6, s), CRYSTAL[d % 5]!, SURF.glass, 1.0);
  }
  // The great crystals: a central cluster bursting up and out of the open side, a few on the rim.
  const cluster: [number, number, number, number, number, number][] = [
    // dx, dz, tilt x, tilt z, radius, length
    [0, 0, 0, 0, 2.3, 17],
    [1.8, 1.2, 0.35, 0.25, 1.7, 13],
    [-1.6, 1.4, -0.4, 0.3, 1.6, 12],
    [0.6, -1.8, 0.1, -0.45, 1.5, 11],
    [2.6, -0.8, 0.6, -0.15, 1.2, 9],
    [-2.4, -1.2, -0.55, -0.3, 1.3, 9.5],
    [3.4, 3, 0.75, 0.55, 1.1, 7.5],
    [-0.6, 3.4, -0.1, 0.75, 1.0, 7],
    [4.8, 1.6, 0.95, 0.2, 0.9, 6],
  ];
  const [cx, cz] = [x + 2.5, z + 2.5];
  cluster.forEach(([dx, dz, ax, az, r, h], i) => {
    const base = v3(cx + dx, -1.5, cz + dz);
    crystal(k, base, v3(ax, 1, az), r, h, CRYSTAL[i % 5]!, 0.9, i * 0.7);
  });
  for (let c = 0; c < 9; c++) {
    const a = hash2(c, 4, 503) * 6.28;
    const d = 11 + hash2(c, 5, 503) * 4;
    const base = v3(x + Math.cos(a) * d, -0.8, z + Math.sin(a) * d);
    crystal(k, base, v3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6), 0.6 + hash2(c, 6, 503) * 0.5, 3 + hash2(c, 7, 503) * 4, CRYSTAL[(c + 2) % 5]!, 0.8, c);
  }
  for (let s = 0; s < 20; s++) {
    const a = hash2(s, 8, 503) * 6.28;
    const d = 7 + hash2(s, 9, 503) * 8;
    k.part(GEM, tf(x + Math.cos(a) * d, 0.4, z + Math.sin(a) * d, a, a * 2, 0, 0.3, 0.55, 0.3), CRYSTAL[s % 5]!, SURF.glass, 1.2);
  }
  // Boardwalk ring on posts, lamps every few planks, a landing stage.
  const BR = 18.5;
  const segs = 40;
  for (let s = 0; s < segs; s++) {
    const a = (s / segs) * Math.PI * 2;
    const [px, pz] = [x + Math.cos(a) * BR, z + Math.sin(a) * BR];
    k.part(BOX, tf(px, 0.62, pz, 0, -a, 0, 2.4, 0.16, (Math.PI * 2 * BR) / segs + 0.05), 0xa77a4f, SURF.wood);
    if (s % 2 === 0)
      for (const o of [-1.2, 1.2])
        k.part(CYL8, tf(x + Math.cos(a) * (BR + o), -2.4, z + Math.sin(a) * (BR + o), 0, 0, 0, 0.13, 3.2, 0.13), 0x6b4a32, SURF.wood);
    if (s % 5 === 0) {
      const [lx, lz] = [x + Math.cos(a) * (BR + 1.25), z + Math.sin(a) * (BR + 1.25)];
      k.part(ROD, tf(lx, 0.9, lz, 0, 0, 0, 0.05, 1.7, 0.05), 0x2f3f43, SURF.metal);
      k.part(GEM, tf(lx, 2.75, lz, 0, a, 0, 0.18, 0.3, 0.18), CRYSTAL[s % 5]!, SURF.glass, 2.6);
    }
  }
  // Railing ropes along the outer edge.
  for (let s = 0; s < segs; s++) {
    const a0 = (s / segs) * Math.PI * 2;
    const a1 = ((s + 1) / segs) * Math.PI * 2;
    const [r0, r1] = [v3(x + Math.cos(a0) * (BR + 1.25), 1.75, z + Math.sin(a0) * (BR + 1.25)), v3(x + Math.cos(a1) * (BR + 1.25), 1.75, z + Math.sin(a1) * (BR + 1.25))];
    k.part(ROD, span(r0, r1, 0.035), 0xd8c39a, SURF.matte);
  }
  for (let w = 0; w < 4; w++) {
    const a = (w / 4) * Math.PI * 2 + 0.4;
    // Plank paths from the ring in toward the rocks.
    const p0 = v3(x + Math.cos(a) * (BR - 0.7), 0.75, z + Math.sin(a) * (BR - 0.7));
    const p1 = v3(x + Math.cos(a) * 13.5, 0.75, z + Math.sin(a) * 13.5);
    const len = p0.distanceTo(p1);
    const mid = p0.clone().lerp(p1, 0.5);
    k.part(BOX, tf(mid.x, 0.62, mid.z, 0, Math.atan2(p1.x - p0.x, p1.z - p0.z), 0, 1.2, 0.16, len), 0xa77a4f, SURF.wood);
  }
  foam(k, x, z, 19.8, 30, 509);
  return k;
}

