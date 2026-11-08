import { BoxGeometry, CapsuleGeometry, CylinderGeometry, TorusGeometry, Vector3 } from 'three/webgpu';
import { tf } from '@/render/bake';
import { hash2 } from '@/sim/random';
import {
  BALL,
  BALL_LO,
  boulder,
  FLECK,
  ROD,
  TINY,
  CONE,
  coral,
  craggy,
  CYL,
  CYL8,
  DOME,
  GEM,
  Kit,
  palm,
  petal,
  pillar,
  rope,
  sail,
  span,
  SURF,
  tree,
  twoSided,
} from './wonderKit';

/**
 * The sea wonders' models (D-146), each baked into one merged mesh: the Tidewatch Lighthouse on its islet, the Tide
 * Gates, the Lotus Atoll, the Abyssal Dome and the Verdant Pillars. Footprints stay inside the cruise ferry's
 * sightseeing loops (`SITES` in `modules/ferry/index.ts`).
 */

const BOX = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const PEARL = 0xf4f0e6;
const LUMEN = 0x8ff7ff;
const CORAL = [0xff7f6e, 0xffa86b, 0xc77dff, 0xff6fae, 0xffd36b] as const;
const STONES = [0x8d857a, 0x7b746b, 0x9a9184, 0x857d70] as const;
const WARM = 0xffcf86;
const TEAL = 0x2f5f63;
const VERDIGRIS = 0x4fa596;
const BRASS = 0xd2a54e;
const FOAM = 0xd4f0f6;

/** Lantern height of the lighthouse (the night beam turns there). */
export const LANTERN_Y = 28.6;

const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Surf round an outcrop or a foot at the waterline: small flecks, mostly awash, in a ragged band. */
function foam(k: Kit, x: number, z: number, r: number, n: number, seed: number): void {
  for (let i = 0; i < n * 1.5; i++) {
    const a = (i / (n * 1.5)) * Math.PI * 2 + hash2(seed, i, 3) * 0.5;
    const d = r * (0.9 + hash2(seed, i, 5) * 0.2);
    const s = 0.12 + hash2(seed, i, 7) * 0.26 * Math.min(1.6, Math.sqrt(r) * 0.5);
    k.part(
      FLECK,
      tf(x + Math.cos(a) * d, 0.04, z + Math.sin(a) * d, 0, a, 0, s * 2.2, 1, s),
      FOAM,
      SURF.matte,
      0.1,
    );
  }
}

/** An outcrop of craggy boulders (wet at the waterline), with a grassy cap. */
function islet(k: Kit, x: number, z: number, r: number, seed: number, n = 9): void {
  for (let i = 0; i < n; i++) {
    const h = (q: number) => hash2(seed, i * 7 + q, 811);
    const a = h(1) * 6.28;
    const d = i === 0 ? 0 : r * (0.35 + h(2) * 0.55);
    const s = r * (i === 0 ? 0.75 : 0.22 + h(3) * 0.28);
    k.part(
      boulder(seed + i),
      tf(
        x + Math.cos(a) * d,
        -1.6,
        z + Math.sin(a) * d,
        h(4) * 0.4,
        h(5) * 6,
        0,
        s,
        s * (0.5 + h(6) * 0.35),
        s,
      ),
      STONES[i % 4]!,
      SURF.stone,
    );
  }
  foam(k, x, z, r * 1.02, 22, seed);
}

// ── Tidewatch Lighthouse ──────────────────────────────────────────────────────────────────────────────────────
export function lighthouse(x: number, z: number): Kit {
  const k = new Kit();
  islet(k, x, z, 10, 1);
  // Grass and a little beach on top.
  k.part(boulder(3), tf(x + 0.5, 0.2, z + 0.5, 0, 0.4, 0, 8.4, 1.4, 7.2), 0x6fb35c, SURF.leaf);
  k.part(boulder(2), tf(x - 4.2, -0.2, z + 4.6, 0, 1.1, 0, 4.2, 0.9, 3.4), 0xe8d6a8, SURF.sand);
  for (let f = 0; f < 26; f++) {
    const a = hash2(f, 1, 91) * 6.28;
    const d = 3.6 + hash2(f, 2, 91) * 3.6;
    k.part(
      TINY,
      tf(x + Math.cos(a) * d, 1.45, z + Math.sin(a) * d * 0.85, 0, 0, 0, 0.22),
      [0xffd36b, 0xff9ec8, 0xffffff, 0xc77dff][f % 4]!,
      SURF.petal,
      0.2,
    );
  }
  palm(k, x - 4.6, 1.0, z - 3.6, 7.5, 2.4, 3);
  palm(k, x - 6.2, 0.7, z - 0.4, 6.2, 1.6, 7);
  palm(k, x + 2.6, 1.2, z - 5.4, 5.6, 3.6, 11);

  // Plinth: an octagonal stone base with a door and steps.
  k.part(
    new CylinderGeometry(3.3, 3.8, 2.4, 8).translate(0, 1.2, 0),
    tf(x, 1.1, z, 0, Math.PI / 8),
    0xd8d0c0,
    SURF.stone,
  );
  k.part(
    new CylinderGeometry(3.55, 3.55, 0.3, 8).translate(0, 0.15, 0),
    tf(x, 3.5, z, 0, Math.PI / 8),
    0xc4b9a6,
    SURF.stone,
  );
  k.part(BOX, tf(x - 3.3, 1.4, z, 0, Math.PI / 2, 0, 1.1, 1.8, 0.5), 0x6b4a32, SURF.wood);
  k.part(
    new CylinderGeometry(0.55, 0.55, 0.5, 12, 1, false, 0, Math.PI).translate(0, 0, 0),
    tf(x - 3.35, 3.2, z, Math.PI / 2, -Math.PI / 2, 0),
    0xd8d0c0,
    SURF.stone,
  );
  for (let s = 0; s < 3; s++)
    k.part(
      BOX,
      tf(x - 3.9 - s * 0.45, 1.1 - s * 0.35, z, 0, Math.PI / 2, 0, 1.6, 0.35, 0.45),
      0xbdb3a2,
      SURF.stone,
    );
  k.part(TINY, tf(x - 3.75, 3.0, z + 0.9, 0, 0, 0, 0.18), WARM, SURF.glass, 2.2);

  // Tower: eight-sided, tapering, coral and pearl bands with teal trim rings and a spiral of lit windows.
  const base = 3.8;
  const H = 21.6;
  const bands = 6;
  const rAt = (t: number) => 2.7 - t * 1.0;
  for (let i = 0; i < bands; i++) {
    const [t0, t1] = [i / bands, (i + 1) / bands];
    const g = new CylinderGeometry(rAt(t1), rAt(t0), H / bands, 16).translate(0, H / bands / 2, 0);
    k.part(g, tf(x, base + t0 * H, z), i % 2 ? 0xf06a5a : PEARL, SURF.paint);
    if (i > 0)
      k.part(
        new TorusGeometry(rAt(t0) + 0.02, 0.09, 4, 32),
        tf(x, base + t0 * H, z, Math.PI / 2),
        TEAL,
        SURF.metal,
      );
  }
  for (let w = 0; w < 7; w++) {
    const t = (w + 0.6) / 7.4;
    const a = w * 1.75;
    const r = rAt(t) - 0.02;
    k.part(
      BOX,
      tf(
        x + Math.cos(a) * r,
        base + t * H - 0.4,
        z + Math.sin(a) * r,
        0,
        Math.PI / 2 - a,
        0,
        0.42,
        0.75,
        0.14,
      ),
      0x8a6a3a,
      SURF.glass,
      1.6,
    );
    k.part(
      BOX,
      tf(
        x + Math.cos(a) * (r + 0.05),
        base + t * H - 0.48,
        z + Math.sin(a) * (r + 0.05),
        0,
        Math.PI / 2 - a,
        0,
        0.56,
        0.1,
        0.18,
      ),
      PEARL,
      SURF.paint,
    );
  }
  // Gallery with railing, corbels under it.
  const top = base + H;
  k.part(new CylinderGeometry(2.55, 1.9, 0.5, 20).translate(0, 0.25, 0), tf(x, top, z), TEAL, SURF.metal);
  for (let c = 0; c < 12; c++) {
    const a = (c / 12) * Math.PI * 2;
    k.part(
      BOX,
      tf(
        x + Math.cos(a) * 1.85,
        top - 0.7,
        z + Math.sin(a) * 1.85,
        0.5,
        Math.PI / 2 - a,
        0,
        0.18,
        0.75,
        0.25,
      ),
      TEAL,
      SURF.metal,
    );
  }
  k.part(new TorusGeometry(2.45, 0.06, 5, 40), tf(x, top + 1.25, z, Math.PI / 2), TEAL, SURF.metal);
  k.part(new TorusGeometry(2.45, 0.04, 5, 40), tf(x, top + 0.8, z, Math.PI / 2), TEAL, SURF.metal);
  for (let p = 0; p < 16; p++) {
    const a = (p / 16) * Math.PI * 2;
    k.part(
      ROD,
      tf(x + Math.cos(a) * 2.45, top + 0.5, z + Math.sin(a) * 2.45, 0, 0, 0, 0.05, 0.78, 0.05),
      TEAL,
      SURF.metal,
    );
  }
  // Lantern room: glass between mullions, a glowing lens, a copper-green dome, ventilator ball, vane.
  k.part(CYL, tf(x, top + 0.5, z, 0, 0, 0, 1.45, 0.5, 1.45), TEAL, SURF.metal);
  k.part(
    new CylinderGeometry(1.35, 1.35, 2.3, 16).translate(0, 1.15, 0),
    tf(x, top + 1.0, z),
    0xfff1c8,
    SURF.glass,
    2.4,
  );
  k.part(GEM, tf(x, LANTERN_Y, z, 0, 0, 0, 0.75, 1.0, 0.75), 0xfff6d8, SURF.glass, 3);
  for (let m = 0; m < 8; m++) {
    const a = (m / 8) * Math.PI * 2;
    k.part(
      BOX,
      tf(x + Math.cos(a) * 1.38, top + 1.0, z + Math.sin(a) * 1.38, 0, -a, 0, 0.1, 2.3, 0.1),
      TEAL,
      SURF.metal,
    );
  }
  k.part(new TorusGeometry(1.5, 0.12, 6, 28), tf(x, top + 3.3, z, Math.PI / 2), TEAL, SURF.metal);
  k.part(DOME, tf(x, top + 3.3, z, 0, 0, 0, 1.55, 1.3, 1.55), VERDIGRIS, SURF.metal);
  k.part(CYL8, tf(x, top + 4.5, z, 0, 0, 0, 0.18, 0.6, 0.18), VERDIGRIS, SURF.metal);
  k.part(BALL, tf(x, top + 5.25, z, 0, 0, 0, 0.36), BRASS, SURF.brass);
  k.part(CONE, tf(x, top + 5.5, z, 0, 0, 0, 0.07, 1.6, 0.07), BRASS, SURF.brass);
  k.part(BOX, tf(x, top + 6.3, z, 0, 0.8, 0, 0.06, 0.06, 1.4), BRASS, SURF.brass);
  k.part(sail(0.5, 0.35), tf(x + 0.45, top + 6.3, z - 0.45, 0, 0.8 + Math.PI / 2, 0), BRASS, SURF.brass);

  // Keeper's cottage: gabled, solar on the roof, chimney, warm windows, a flower box.
  const [hx, hz, hr] = [x + 5.6, z + 2.6, 0.4];
  const at = (dx: number, dz: number) =>
    [hx + dx * Math.cos(hr) + dz * Math.sin(hr), hz - dx * Math.sin(hr) + dz * Math.cos(hr)] as const;
  k.part(BOX, tf(hx, 1.1, hz, 0, hr, 0, 3.8, 2.3, 2.8), PEARL, SURF.paint);
  // A triangular prism along the cottage, apex up.
  k.part(
    new CylinderGeometry(1.65, 1.65, 4.3, 3)
      .rotateX(-Math.PI / 2)
      .rotateY(Math.PI / 2)
      .translate(0, 0.8, 0),
    tf(hx, 3.4, hz, 0, hr, 0),
    0xf06a5a,
    SURF.paint,
  );
  const [sx, sz] = at(0, -0.75);
  k.part(BOX, tf(sx, 3.85, sz, 0.98, hr, 0, 3.2, 0.06, 1.25), 0x22466b, SURF.solar);
  const [cx, cz] = at(1.2, 0.6);
  k.part(BOX, tf(cx, 3.3, cz, 0, hr, 0, 0.45, 1.8, 0.45), 0xa89c88, SURF.stone);
  for (const dx of [-1, 1]) {
    const [wx, wz] = at(dx * 1.05, 1.42);
    k.part(BOX, tf(wx, 1.9, wz, 0, hr, 0, 0.7, 0.7, 0.08), WARM, SURF.glass, 1.8);
    k.part(BOX, tf(wx, 1.7, wz + 0.05, 0, hr, 0, 0.8, 0.2, 0.25), 0x6b4a32, SURF.wood);
    k.part(
      BALL_LO,
      tf(wx, 1.95, wz + 0.1, 0, 0, 0, 0.25, 0.14, 0.12),
      dx > 0 ? 0xff9ec8 : 0xffd36b,
      SURF.petal,
    );
  }
  const [dx0, dz0] = at(0, 1.42);
  k.part(BOX, tf(dx0, 1.1, dz0, 0, hr, 0, 0.75, 1.4, 0.08), 0x6b4a32, SURF.wood);

  // Jetty: planks on piles, a lamp and a lifebuoy, and a sailboat moored alongside.
  const jy = 0.55;
  const ja = 0.6;
  const [jx, jz] = [x - 6.4, z + 7.6];
  k.part(BOX, tf(jx, jy, jz, 0, ja, 0, 1.7, 0.18, 9.5), 0xa77a4f, SURF.wood);
  for (let p = 0; p < 5; p++) {
    for (const s of [-1, 1]) {
      const d = -4.4 + p * 2.2;
      k.part(
        CYL8,
        tf(
          jx + Math.sin(ja) * d + Math.cos(ja) * s * 0.9,
          -2,
          jz + Math.cos(ja) * d - Math.sin(ja) * s * 0.9,
          0,
          0,
          0,
          0.13,
          2.9,
          0.13,
        ),
        0x6b4a32,
        SURF.wood,
      );
    }
  }
  const [ex, ez] = [jx + Math.sin(ja) * 4.6, jz + Math.cos(ja) * 4.6];
  k.part(ROD, tf(ex + 0.7, jy, ez, 0, 0, 0, 0.06, 2.0, 0.06), 0x2f3f43, SURF.metal);
  k.part(TINY, tf(ex + 0.7, jy + 2.1, ez, 0, 0, 0, 0.2), WARM, SURF.glass, 2.6);
  k.part(
    new TorusGeometry(0.32, 0.1, 6, 14),
    tf(ex - 0.8, jy + 0.8, ez, 0, ja + Math.PI / 2, 0),
    0xf06a5a,
    SURF.paint,
  );
  const [bx, bz] = [
    jx + Math.sin(ja) * 1.5 + Math.cos(ja) * 2.4,
    jz + Math.cos(ja) * 1.5 - Math.sin(ja) * 2.4,
  ];
  k.part(BALL, tf(bx, 0.15, bz, 0, ja, 0, 0.85, 0.5, 2.8), PEARL, SURF.paint);
  k.part(BOX, tf(bx, 0.42, bz, 0, ja, 0, 1.25, 0.12, 4.2), 0xb08a5a, SURF.wood);
  k.part(BOX, tf(bx, 0.5, bz, 0, ja, 0, 0.9, 0.5, 1.2), PEARL, SURF.paint);
  k.part(ROD, tf(bx, 0.5, bz, 0, 0, 0, 0.06, 5.2, 0.06), 0x8b6b48, SURF.wood);
  k.part(sail(1.5, 4.4), tf(bx, 0.9, bz, 0, ja - Math.PI / 2, 0), 0xfff6e8, SURF.matte);
  k.part(sail(0.9, 3.6), tf(bx, 0.9, bz, 0, ja + Math.PI / 2, 0), 0xffc2dc, SURF.matte);
  return k;
}

// ── Tide Gates ────────────────────────────────────────────────────────────────────────────────────────────────
/** Three pearl rings in a line pointing at the island: bronze inlay, a lumen inner ring, a crown jewel, shell fins, stepped plinths and coral at their feet, channel buoys between. */
export function tideGates(x: number, z: number, S: number): Kit {
  const k = new Kit();
  const yaw = Math.atan2(S / 2 - x, S / 2 - z);
  const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
  /** A point in the ring's plane: `lx` across, `y` up, `d` along the line. */
  const P = (cx: number, cz: number, lx: number, y: number, d = 0) =>
    v3(cx + lx * fz + fx * d, y, cz - lx * fx + fz * d);
  [22, 15, 10].forEach((R, i) => {
    const d = -i * 20;
    const [cx, cz] = [x + fx * d, z + fz * d];
    const cy = R * 0.25;
    const tube = R * 0.085;
    k.part(new TorusGeometry(R, tube, 12, 80), tf(cx, cy, cz, 0, yaw, 0), PEARL, SURF.pearl);
    for (const s of [-1, 1]) {
      const o = P(cx, cz, 0, cy, s * tube * 0.78);
      k.part(new TorusGeometry(R, tube * 0.28, 4, 64), tf(o.x, cy, o.z, 0, yaw, 0), BRASS, SURF.brass);
    }
    k.part(
      new TorusGeometry(R - tube * 0.95, R * 0.02, 4, 72),
      tf(cx, cy, cz, 0, yaw, 0),
      LUMEN,
      SURF.glass,
      2.2,
    );
    // Glowing runes along both faces, above the water.
    for (let r = 0; r < 28; r++) {
      const a = (r / 28) * Math.PI * 2;
      const [lx, ly] = [Math.cos(a) * R, Math.sin(a) * R];
      if (cy + ly < 1.2) continue;
      for (const s of [-1, 1]) {
        const p = P(cx, cz, lx, cy + ly, s * tube * 0.98);
        k.part(
          BOX,
          tf(p.x, p.y - 0.25 * R * 0.03, p.z, 0, yaw, -a, R * 0.03, R * 0.05, 0.12),
          LUMEN,
          SURF.glass,
          1.6,
        );
      }
    }
    // Crown jewel at the apex in a brass setting, with flaring shell fins either side.
    const apex = cy + R + tube;
    k.part(
      GEM,
      tf(cx, apex + R * 0.11, cz, 0, yaw, 0, R * 0.09, R * 0.14, R * 0.09),
      0x9ff6ff,
      SURF.glass,
      2.6,
    );
    for (let c = 0; c < 6; c++) {
      const a = (c / 6) * Math.PI * 2;
      const p = P(cx, cz, Math.cos(a) * R * 0.07, apex, Math.sin(a) * R * 0.07);
      k.part(
        CONE,
        tf(
          p.x,
          p.y - R * 0.02,
          p.z,
          0.4 * Math.cos(a),
          yaw,
          -0.4 * Math.sin(a),
          R * 0.02,
          R * 0.12,
          R * 0.02,
        ),
        BRASS,
        SURF.brass,
      );
    }
    for (const s of [-1, 1])
      for (const [ang, len] of [
        [0.35, 0.36],
        [0.75, 0.28],
      ] as const) {
        const a = Math.PI / 2 - s * ang;
        const p = P(cx, cz, Math.cos(a) * (R + tube * 0.6), cy + Math.sin(a) * (R + tube * 0.6));
        // Fin along the outward radius, lying in the ring's plane.
        // The petal runs up (+y) with its face toward the line, then span() swings it out along the radius.
        const out = v3(Math.cos(a) * fz, Math.sin(a), -Math.cos(a) * fx).normalize();
        const geo = petal(R * len, R * 0.16, 0.05, 0.08, 0.35)
          .clone()
          .rotateX(-Math.PI / 2)
          .rotateY(yaw);
        k.part(geo, span(p, p.clone().add(out), 1), PEARL, SURF.pearl);
      }
    // Stepped plinths and coral where the ring meets the water.
    for (const s of [-1, 1]) {
      const lx = s * Math.sqrt(R * R - cy * cy);
      const f = P(cx, cz, lx, 0);
      [
        [0.3, 1.0, -1.2, 1.6],
        [0.22, 0.85, 0.4, 1.0],
        [0.17, 0.7, 1.4, 0.7],
      ].forEach(([rr, , y0, h], q) =>
        k.part(
          new CylinderGeometry(R * rr! * 0.92, R * rr!, h!, 8).translate(0, h! / 2, 0),
          tf(f.x, y0!, f.z, 0, yaw + q * 0.2, 0),
          q === 0 ? 0xbdb3a2 : 0xd9d3c4,
          SURF.stone,
        ),
      );
      k.part(
        new TorusGeometry(tube * 1.25, tube * 0.3, 6, 20),
        tf(f.x, 2.2, f.z, Math.PI / 2, 0, 0),
        BRASS,
        SURF.brass,
      );
      foam(k, f.x, f.z, R * 0.3, 14, i * 3 + s);
      for (let c = 0; c < 9; c++) {
        const h = (q: number) => hash2(i * 13 + c, s + q * 3, 4441);
        const a = h(1) * 6.28;
        const dd = R * (0.32 + h(2) * 0.22);
        const [px, pz] = [f.x + Math.cos(a) * dd, f.z + Math.sin(a) * dd];
        if (c % 3 === 0) coral(k, px, -0.4, pz, 0.9 + h(3) * 1.1, CORAL[(i + c) % 5]!, i * 31 + c);
        else if (c % 3 === 1)
          k.part(
            boulder(c, 1),
            tf(px, -0.3, pz, 0, h(4) * 6, 0, 0.7 + h(5), 0.6 + h(6) * 0.6, 0.7 + h(5)),
            CORAL[(i + c + 2) % 5]!,
            SURF.matte,
            0.3,
          );
        else
          k.part(
            petal(1.6 + h(7) * 1.4, 1.6, 0.05, 0.1, -0.2),
            tf(px, -0.2, pz, -1.2, a, 0),
            CORAL[(c + 1) % 5]!,
            SURF.matte,
            0.35,
          );
      }
    }
  });
  // Channel buoys between the gates: red to port, green to starboard.
  for (let b = 0; b < 3; b++) {
    const d = 10 - b * 20;
    for (const s of [-1, 1]) {
      const p = P(x, z, s * (26 - b * 5), 0, d);
      k.part(BALL, tf(p.x, 0.1, p.z, 0, 0, 0, 0.9, 0.7, 0.9), s < 0 ? 0xe2584a : 0x3fae6a, SURF.paint);
      k.part(CYL8, tf(p.x, 0.5, p.z, 0, 0, 0, 0.18, 3.2, 0.18), PEARL, SURF.paint);
      k.part(CYL8, tf(p.x, 3.7, p.z, 0, 0, 0, 0.3, 0.55, 0.3), s < 0 ? 0xff7a6a : 0x7fffa8, SURF.glass, 2.4);
      k.part(CONE, tf(p.x, 4.25, p.z, 0, 0, 0, 0.36, 0.45, 0.36), TEAL, SURF.metal);
      foam(k, p.x, p.z, 1.0, 6, b * 7 + s);
    }
  }
  return k;
}

/** A raised lotus leaf: a shallow open bowl, green on both sides. */
const LEAF_BOWL = twoSided(new CylinderGeometry(1, 0.12, 0.35, 22, 2, true).translate(0, 0.17, 0));

// ── Lotus Atoll ───────────────────────────────────────────────────────────────────────────────────────────────
const PINKS = [0xff8fbf, 0xf7a2d0, 0xffb3c8, 0xe9a6ff] as const;

/** One giant lotus: four whorls of cupped petals pale at the base, a seed pod and a ring of glowing stamens. */
function lotusFlower(k: Kit, x: number, y: number, z: number, R: number, tip: number, spin: number): void {
  const whorls: [n: number, len: number, w: number, tilt: number][] = [
    [12, 1, 0.42, 0.22],
    [10, 0.84, 0.4, 0.62],
    [8, 0.66, 0.38, 1.0],
    [6, 0.48, 0.36, 1.28],
  ];
  whorls.forEach(([n, len, w, tilt], l) => {
    const g = petal(R * len, R * w, R * w * 0.35, R * len * 0.1, 0.55, 5, 2);
    for (let p = 0; p < n; p++) {
      const ry = (p / n) * Math.PI * 2 + spin + l * 0.3;
      k.part(
        g,
        tf(x + Math.sin(ry) * R * 0.12, y + l * R * 0.05, z + Math.cos(ry) * R * 0.12, -tilt, ry, 0),
        tip,
        SURF.petal,
        0.28,
      );
    }
  });
  const py = y + R * 0.18;
  k.part(
    new CylinderGeometry(R * 0.2, R * 0.13, R * 0.24, 16).translate(0, R * 0.12, 0),
    tf(x, py, z),
    0xd8c55a,
    SURF.matte,
    0.4,
  );
  for (let s = 0; s < 7; s++) {
    const a = (s / 7) * Math.PI * 2;
    k.part(
      TINY,
      tf(x + Math.cos(a) * R * 0.11, py + R * 0.24, z + Math.sin(a) * R * 0.11, 0, 0, 0, R * 0.03),
      0x8a7a2a,
      SURF.matte,
    );
  }
  for (let s = 0; s < 12; s++) {
    const a = (s / 12) * Math.PI * 2;
    const base = v3(x + Math.cos(a) * R * 0.2, py, z + Math.sin(a) * R * 0.2);
    const tipP = v3(x + Math.cos(a) * R * 0.3, py + R * 0.22, z + Math.sin(a) * R * 0.3);
    k.part(ROD, span(base, tipP, R * 0.012), 0xffd36b, SURF.matte, 1.2);
    k.part(TINY, tf(tipP.x, tipP.y, tipP.z, 0, 0, 0, R * 0.028), 0xfff0a0, SURF.matte, 2.2);
  }
}

/** A lily pad with its notch, an upturned rim, pale veins and a bead or two of water. */
function lilyPad(k: Kit, x: number, z: number, r: number, rot: number, seed: number): void {
  const notch = 0.28;
  k.part(
    new CylinderGeometry(1, 1, 0.3, 28, 1, false, notch, Math.PI * 2 - notch * 2).translate(0, 0.15, 0),
    tf(x, 0, z, 0, rot, 0, r, 1, r),
    0x3f9a4f,
    SURF.leaf,
  );
  k.part(
    new TorusGeometry(1, 0.035, 3, 32, Math.PI * 2 - notch * 2),
    tf(x, 0.32, z, -Math.PI / 2, rot + notch - Math.PI / 2, 0, r, r, 2.4),
    0x5cb85c,
    SURF.leaf,
  );
  for (let v = 0; v < 9; v++) {
    const a = rot + notch + ((v + 0.5) / 9) * (Math.PI * 2 - notch * 2);
    k.part(
      BOX,
      tf(x + Math.sin(a) * r * 0.46, 0.3, z + Math.cos(a) * r * 0.46, 0, a, 0, 0.12, 0.03, r * 0.88),
      0x86cf72,
      SURF.leaf,
    );
  }
  for (let d = 0; d < 2; d++) {
    const a = hash2(seed, d, 17) * 6.28;
    k.part(
      BALL_LO,
      tf(x + Math.cos(a) * r * 0.5, 0.35, z + Math.sin(a) * r * 0.5, 0, 0, 0, 0.22, 0.14, 0.22),
      0xe8fbff,
      SURF.glass,
      0.4,
    );
  }
}

/** Giant lotus flowers on lily pads, raised leaves and buds on stalks, floating lanterns and a tea pavilion. */
export function lotus(x: number, z: number): Kit {
  const k = new Kit();
  const spots: [number, number, number][] = [];
  for (let f = 0; f < 10; f++) {
    const h = (q: number) => hash2(f, q, 6007);
    const a = f * 2.4;
    const d = f === 0 ? 0 : 8 + f * 2.6;
    const [px, pz] = [x + Math.cos(a) * d * 1.25, z + Math.sin(a) * d * 0.85];
    const R = (f === 0 ? 1.75 : 0.75 + h(1) * 0.55) * 4;
    spots.push([px, pz, R]);
    lilyPad(k, px, pz, R * 1.9, h(2) * 6, f);
    if (f === 1) continue; // the pavilion's pad
    if (f > 1 && h(3) < 0.22) {
      // A closed bud standing up from this pad.
      for (let p = 0; p < 5; p++)
        k.part(
          petal(R * 0.7, R * 0.42, R * 0.18, R * 0.04, 0.5),
          tf(px, 0.3, pz, -1.42, (p / 5) * Math.PI * 2, 0),
          PINKS[f % 4]!,
          SURF.petal,
          0.25,
        );
      continue;
    }
    lotusFlower(k, px, 0.3, pz, R, PINKS[f % 4]!, h(4) * 6);
  }
  // Tea pavilion on pad 1: a round deck, posts, a living roof and a hanging lantern.
  const [tx, tz] = spots[1]!;
  k.part(
    new CylinderGeometry(3.1, 3.2, 0.35, 20).translate(0, 0.17, 0),
    tf(tx, 0.3, tz),
    0xb08a5a,
    SURF.wood,
  );
  for (let p = 0; p < 6; p++) {
    const a = (p / 6) * Math.PI * 2;
    k.part(
      CYL8,
      tf(tx + Math.cos(a) * 2.7, 0.6, tz + Math.sin(a) * 2.7, 0, 0, 0, 0.12, 2.8, 0.12),
      0x7a5a3a,
      SURF.wood,
    );
  }
  k.part(
    new CylinderGeometry(0.5, 3.8, 1.3, 20).translate(0, 0.65, 0),
    tf(tx, 3.35, tz),
    0x5fae55,
    SURF.leaf,
  );
  k.part(
    new CylinderGeometry(3.85, 3.85, 0.18, 20).translate(0, 0.09, 0),
    tf(tx, 3.3, tz),
    0x7a5a3a,
    SURF.wood,
  );
  k.part(BALL, tf(tx, 4.75, tz, 0, 0, 0, 0.3), BRASS, SURF.brass);
  k.part(BALL, tf(tx, 2.7, tz, 0, 0, 0, 0.35, 0.45, 0.35), WARM, SURF.glass, 2.4);
  k.part(BOX, tf(tx, 0.65, tz, 0, 0.5, 0, 1.4, 0.45, 0.7), 0x8b6b48, SURF.wood);
  // Raised lotus leaves on stalks, like green parasols.
  for (let l = 0; l < 9; l++) {
    const h = (q: number) => hash2(l, q, 6131);
    const a = h(1) * 6.28;
    const d = 6 + h(2) * 26;
    const [lx, lz] = [x + Math.cos(a) * d * 1.2, z + Math.sin(a) * d * 0.8];
    const hh = 2.2 + h(3) * 3;
    const r = 2 + h(4) * 1.6;
    k.part(
      CYL8,
      tf(lx, 0, lz, (h(5) - 0.5) * 0.15, 0, (h(6) - 0.5) * 0.15, 0.12, hh, 0.12),
      0x4f9a48,
      SURF.leaf,
    );
    k.part(
      LEAF_BOWL,
      tf(lx, hh, lz, (h(7) - 0.5) * 0.3, h(9) * 6, (h(8) - 0.5) * 0.3, r, r, r),
      0x58b05c,
      SURF.leaf,
    );
  }
  // Floating lanterns drifting among the pads.
  for (let n = 0; n < 16; n++) {
    const h = (q: number) => hash2(n, q, 6211);
    const a = h(1) * 6.28;
    const d = 5 + h(2) * 32;
    const [lx, lz] = [x + Math.cos(a) * d * 1.2, z + Math.sin(a) * d * 0.8];
    k.part(
      new CylinderGeometry(0.42, 0.5, 0.18, 8).translate(0, 0.09, 0),
      tf(lx, 0, lz),
      0xb08a5a,
      SURF.wood,
    );
    k.part(
      new CylinderGeometry(0.34, 0.4, 0.75, 8).translate(0, 0.37, 0),
      tf(lx, 0.18, lz),
      n % 3 ? 0xffd9a0 : 0xffb3c8,
      SURF.matte,
      2.0,
    );
    k.part(CONE, tf(lx, 0.93, lz, 0, 0, 0, 0.42, 0.3, 0.42), 0xc0503f, SURF.paint);
  }
  return k;
}

// ── Abyssal Dome ──────────────────────────────────────────────────────────────────────────────────────────────
/** A glass sea observatory on raking legs: ribbed and banded dome, observatory cupola and dish, solar petals, a pier with a little yellow submarine, a kelp farm. */
export function dome(x: number, z: number): Kit {
  const k = new Kit();
  const R = 13;
  // Legs raking out into the sea, braced by a ring at the waterline.
  for (let l = 0; l < 12; l++) {
    const a = (l / 12) * Math.PI * 2;
    k.part(
      CYL8,
      span(
        v3(x + Math.cos(a) * R * 1.0, -8, z + Math.sin(a) * R * 1.0),
        v3(x + Math.cos(a) * R * 0.78, 1.2, z + Math.sin(a) * R * 0.78),
        0.45,
      ),
      0x6f8a8c,
      SURF.metal,
    );
    foam(k, x + Math.cos(a) * R * 0.97, z + Math.sin(a) * R * 0.97, 0.8, 5, l);
  }
  k.part(new TorusGeometry(R * 0.96, 0.22, 6, 64), tf(x, 0.15, z, Math.PI / 2), 0x6f8a8c, SURF.metal);
  // Deck: a pearl-grey hull, timber decking, a railing and lamps.
  k.part(
    new CylinderGeometry(R + 0.5, R * 0.9, 1.2, 48).translate(0, 0.6, 0),
    tf(x, 0.6, z),
    0xd9d4c7,
    SURF.pearl,
  );
  k.part(
    new CylinderGeometry(R + 0.3, R + 0.3, 0.2, 48).translate(0, 0.1, 0),
    tf(x, 1.8, z),
    0xb08a62,
    SURF.wood,
  );
  k.part(new TorusGeometry(R + 0.5, 0.18, 6, 64), tf(x, 1.75, z, Math.PI / 2), LUMEN, SURF.glass, 1.8);
  k.part(new TorusGeometry(R + 0.1, 0.05, 5, 64), tf(x, 2.95, z, Math.PI / 2), 0xd9d4c7, SURF.metal);
  for (let p = 0; p < 40; p++) {
    const a = (p / 40) * Math.PI * 2;
    k.part(
      ROD,
      tf(x + Math.cos(a) * (R + 0.1), 2.0, z + Math.sin(a) * (R + 0.1), 0, 0, 0, 0.05, 0.95, 0.05),
      0xd9d4c7,
      SURF.metal,
    );
  }
  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * Math.PI * 2 + 0.2;
    const [lx, lz] = [x + Math.cos(a) * (R - 1.2), z + Math.sin(a) * (R - 1.2)];
    k.part(ROD, tf(lx, 2.0, lz, 0, 0, 0, 0.07, 1.8, 0.07), 0x2f3f43, SURF.metal);
    k.part(TINY, tf(lx, 3.9, lz, 0, 0, 0, 0.22), WARM, SURF.glass, 2.4);
  }
  // Dome: aqua glass, meridian ribs, glowing latitude bands and a lumen ring at its foot.
  const [dr, dh, dy] = [R * 0.7, R * 0.64, 2.0];
  k.part(new TorusGeometry(dr + 0.1, 0.3, 8, 64), tf(x, dy + 0.1, z, Math.PI / 2), PEARL, SURF.pearl);
  k.part(DOME, tf(x, dy, z, 0, 0, 0, dr, dh, dr), 0x6fc9d6, SURF.glass, 0.45);
  const rib = new TorusGeometry(1, 0.016, 3, 24, Math.PI);
  for (let r = 0; r < 16; r++)
    k.part(
      rib,
      tf(x, dy, z, 0, (r / 16) * Math.PI, 0, dr * 1.01, dh * 1.01, dr * 1.01),
      PEARL,
      SURF.pearl,
      0.3,
    );
  for (const t of [0.3, 0.58, 0.8]) {
    const [rr, yy] = [Math.cos(Math.asin(t)) * dr * 1.01, dy + t * dh * 1.01];
    k.part(new TorusGeometry(rr, 0.12, 4, 48), tf(x, yy, z, Math.PI / 2), LUMEN, SURF.glass, 1.5);
  }
  // Observatory cupola with a telescope, a dish, and a spire with a beacon.
  const top = dy + dh;
  k.part(CYL, tf(x, top - 0.6, z, 0, 0, 0, 2.6, 1.6, 2.6), PEARL, SURF.pearl);
  k.part(DOME, tf(x, top + 1.0, z, 0, 0, 0, 2.6, 2.2, 2.6), 0xf0f2f0, SURF.metal);
  k.part(CYL, span(v3(x + 0.6, top + 1.6, z), v3(x + 3.4, top + 3.6, z + 0.8), 0.5), 0x34495a, SURF.metal);
  k.part(
    new CylinderGeometry(0.56, 0.56, 0.2, 12),
    tf(x + 3.45, top + 3.65, z + 0.82, 0.3, 0, -0.95),
    BRASS,
    SURF.brass,
  );
  k.part(DOME, tf(x - 2.4, top + 2.6, z - 1.2, 2.2, 0.6, 0, 1.6, 0.5, 1.6), 0xf4f4f0, SURF.metal);
  k.part(CYL8, tf(x - 1.6, top + 1.8, z - 0.8, 0, 0, 0.6, 0.08, 1.2, 0.08), 0x2f3f43, SURF.metal);
  k.part(CONE, tf(x, top + 3.0, z, 0, 0, 0, 0.5, 7.5, 0.5), PEARL, SURF.pearl);
  k.part(BALL, tf(x, top + 10.7, z, 0, 0, 0, 0.55), 0xff7a6a, SURF.glass, 2.6);
  // Solar petals round the rim, each on a brass frame, tilted to the sky.
  for (let p = 0; p < 14; p++) {
    const a = (p / 14) * Math.PI * 2 + 0.13;
    const ry = Math.PI / 2 - a;
    const [px, pz] = [x + Math.cos(a) * (R + 0.6), z + Math.sin(a) * (R + 0.6)];
    k.part(petal(3.4, 2.0, 0.12, 0.3, 0, 5, 2), tf(px, 1.2, pz, -0.25, ry, 0), BRASS, SURF.brass);
    k.part(petal(3.2, 1.8, 0.12, 0.3, -0.2, 5, 2), tf(px, 1.32, pz, -0.25, ry, 0), 0x22466b, SURF.solar, 0.2);
  }
  // Pier to the west with lamps, and a yellow submarine moored at its end.
  const [jx, jz] = [x - R - 6.5, z];
  k.part(BOX, tf(jx, 1.3, jz, 0, Math.PI / 2, 0, 2.0, 0.22, 12), 0xb08a62, SURF.wood);
  for (let p = 0; p < 4; p++)
    for (const s of [-1, 1])
      k.part(CYL8, tf(jx - 4.5 + p * 3, -2, jz + s * 1.0, 0, 0, 0, 0.14, 3.4, 0.14), 0x6f8a8c, SURF.metal);
  for (const s of [-1, 1]) {
    k.part(ROD, tf(jx - 2.5, 1.5, jz + s * 1.0, 0, 0, 0, 0.06, 1.6, 0.06), 0x2f3f43, SURF.metal);
    k.part(TINY, tf(jx - 2.5, 3.2, jz + s * 1.0, 0, 0, 0, 0.18), WARM, SURF.glass, 2.4);
  }
  const [ux, uz] = [jx - 3, z + 3.8];
  k.part(new CapsuleGeometry(1.15, 4.6, 6, 14), tf(ux, 0.35, uz, 0, 0, Math.PI / 2), 0xffc83d, SURF.paint);
  k.part(CYL, tf(ux + 0.6, 1.2, uz, 0, 0, 0, 0.75, 1.0, 0.55), 0xffc83d, SURF.paint);
  k.part(ROD, tf(ux + 0.9, 2.2, uz, 0, 0, 0, 0.07, 0.9, 0.07), 0x2f3f43, SURF.metal);
  for (let w = 0; w < 3; w++)
    k.part(
      new CylinderGeometry(0.28, 0.28, 0.12, 12),
      tf(ux - 1.3 + w * 1.3, 0.55, uz + 1.1, Math.PI / 2, 0, 0),
      0x9ff6ff,
      SURF.glass,
      2.0,
    );
  k.part(BOX, tf(ux + 3.6, 0.35, uz, 0, 0, 0, 0.1, 1.4, 0.2), 0x2f3f43, SURF.metal);
  k.part(BOX, tf(ux + 3.6, 1.0, uz, Math.PI / 2, 0, 0, 0.1, 1.4, 0.2), 0x2f3f43, SURF.metal);
  // Kelp farm floats in rows to the east.
  for (let r = 0; r < 3; r++) {
    const fz = z - 8 + r * 8;
    const fx0 = x + R + 4;
    for (let f = 0; f < 6; f++)
      k.part(TINY, tf(fx0 + f * 2.2, 0, fz, 0, 0, 0, 0.26), f % 2 ? 0xff8a3d : 0xffc83d, SURF.paint);
    k.part(ROD, span(v3(fx0, 0.08, fz), v3(fx0 + 11, 0.08, fz), 0.04), 0xe8e0c8, SURF.matte);
  }
  return k;
}

// ── Verdant Pillars ───────────────────────────────────────────────────────────────────────────────────────────
const LIMESTONE = [0xd2bc94, 0xc6ac82, 0xdcc8a2] as const;

/** Karst sea stacks with jungle crowns: palms and broad-leaf trees, hanging vines in bloom, a waterfall, rope bridges with lanterns, a natural arch and a treehouse. */
export function stacks(x: number, z: number): Kit {
  const k = new Kit();
  const tops: [number, number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const h = (q: number) => hash2(i, q, 7121);
    const a = i * 1.9;
    const d = i === 0 ? 0 : 10 + h(1) * 11;
    const [px, pz] = [x + Math.cos(a) * d, z + Math.sin(a) * d];
    const H = 12 + h(2) * 18;
    const r = 3.2 + h(3) * 2.6;
    k.part(pillar(r, H, i), tf(px, 0, pz, 0, h(4) * 6), LIMESTONE[i % 3]!, SURF.stone);
    // Fallen blocks and surf at the foot.
    for (let b = 0; b < 4; b++) {
      const ba = h(10 + b) * 6.28;
      const s = r * (0.25 + h(14 + b) * 0.2);
      k.part(
        boulder(i + b, 1),
        tf(px + Math.cos(ba) * r * 1.05, -0.5, pz + Math.sin(ba) * r * 1.05, 0, ba, 0, s, s * 0.7, s),
        LIMESTONE[(i + 1) % 3]!,
        SURF.stone,
      );
    }
    foam(k, px, pz, r * 1.12, 16, i);
    // Crown: a mossy cap, trees, a palm or two, ferns and flowers.
    const top = H * 0.985;
    const cr = r * 0.62 * 1.12;
    k.part(
      boulder(i + 2),
      tf(px, top - 0.4, pz, 0, h(5) * 6, 0, cr * 1.05, 0.9, cr * 1.05),
      0x5aa65a,
      SURF.leaf,
    );
    const nt = 2 + Math.floor(h(6) * 3);
    for (let t = 0; t < nt; t++) {
      const q = (s: number) => hash2(i * 5 + t, s, 7129);
      const [tx, tz] = [px + (q(1) - 0.5) * cr * 1.2, pz + (q(2) - 0.5) * cr * 1.2];
      if (t === 0 && i % 2 === 0) palm(k, tx, top, tz, 4.2 + q(3) * 2, q(4) * 6, i * 9 + t);
      else tree(k, tx, top, tz, 3.4 + q(3) * 2.4, i * 9 + t);
    }
    for (let f = 0; f < 5; f++) {
      const fa = (f / 5) * Math.PI * 2 + h(7);
      k.part(
        petal(1.4, 0.45, -0.05, -0.3, -0.2, 4, 2),
        tf(px + Math.cos(fa) * cr * 0.7, top + 0.2, pz + Math.sin(fa) * cr * 0.7, -0.5, fa, 0),
        0x3f8f4a,
        SURF.leaf,
      );
      k.part(
        TINY,
        tf(
          px + Math.cos(fa + 0.6) * cr * 0.55,
          top + 0.35,
          pz + Math.sin(fa + 0.6) * cr * 0.55,
          0,
          0,
          0,
          0.28,
        ),
        [0xff9ec8, 0xffd36b, 0xffffff][f % 3]!,
        SURF.petal,
        0.6,
      );
    }
    // Vines in bloom down the cliff: leafy strands with glowing flowers.
    for (let v = 0; v < 5; v++) {
      const va = h(20 + v) * 6.28;
      const len = H * (0.3 + h(25 + v) * 0.35);
      let prev = v3(px + Math.cos(va) * cr * 1.05, top, pz + Math.sin(va) * cr * 1.05);
      for (let s = 1; s <= 4; s++) {
        const y = top - (len * s) / 4;
        const t = Math.max(0, y) / H;
        const rr = r * (1 - 0.38 * t) * 1.06;
        const next = v3(px + Math.cos(va + s * 0.05) * rr, y, pz + Math.sin(va + s * 0.05) * rr);
        k.part(ROD, span(prev, next, 0.09), 0x3f8f4a, SURF.leaf);
        k.part(
          petal(0.7, 0.4, 0, -0.2, 0, 3, 1),
          tf(next.x, next.y, next.z, 0.3, va + s, 0),
          0x5fb352,
          SURF.leaf,
        );
        if (s % 2 === 0)
          k.part(
            TINY,
            tf(next.x, next.y - 0.2, next.z, 0, 0, 0, 0.32),
            [0xff9ec8, 0xf7d6ff, 0xffb3c8][(v + s) % 3]!,
            SURF.petal,
            1.0,
          );
        prev = next;
      }
    }
    tops.push([px, top, pz, r]);
  }
  // A waterfall down the tallest stack, mist at its foot.
  const tallest = tops.reduce((b, t) => (t[1] > b[1] ? t : b));
  const [wx, wy, wz, wr] = tallest;
  const wa = Math.atan2(x - wx, z - wz) + Math.PI * 0.6;
  // A sheet 1.6 wide across the cliff face (its width turned square to the radius), drawn bottom to top.
  const fall = BOX.clone().scale(1.6, 1, 0.25).rotateY(wa);
  for (let s = 0; s < 6; s++) {
    const y0 = wy - (wy * s) / 6;
    const y1 = wy - (wy * (s + 1)) / 6;
    const r0 = wr * (1 - 0.38 * (Math.max(0, y0) / wy)) * 1.08 + 0.3;
    const r1 = wr * (1 - 0.38 * (Math.max(0, y1) / wy)) * 1.08 + 0.3;
    const a0 = v3(wx + Math.sin(wa) * r0, y0, wz + Math.cos(wa) * r0);
    const a1 = v3(wx + Math.sin(wa) * r1, y1, wz + Math.cos(wa) * r1);
    k.part(fall, span(a1, a0, 1), 0xc6f2ff, SURF.water, 0.1);
  }
  for (let m = 0; m < 7; m++) {
    const ma = wa + (m - 3) * 0.35;
    const md = wr * 1.25 + hash2(m, 1, 77) * 2;
    const ms = 0.5 + hash2(m, 3, 77) * 0.5;
    k.part(
      BALL_LO,
      tf(
        wx + Math.sin(ma) * md,
        0.1 + hash2(m, 2, 77) * 0.5,
        wz + Math.cos(ma) * md,
        0,
        0,
        0,
        ms,
        ms * 0.6,
        ms,
      ),
      0xf4fcff,
      SURF.matte,
      0.2,
    );
  }
  // Rope bridges with planks and a lantern, from the centre stack to its two nearest neighbours.
  const [c0, ...rest] = tops;
  const near = rest
    .sort((a, b) => Math.hypot(a[0] - c0![0], a[2] - c0![2]) - Math.hypot(b[0] - c0![0], b[2] - c0![2]))
    .slice(0, 2);
  for (const t of near) {
    const ang = Math.atan2(t[0] - c0![0], t[2] - c0![2]);
    const a = v3(c0![0] + Math.sin(ang) * c0![3] * 0.5, c0![1] + 0.2, c0![2] + Math.cos(ang) * c0![3] * 0.5);
    const b = v3(t[0] - Math.sin(ang) * t[3] * 0.5, t[1] + 0.2, t[2] - Math.cos(ang) * t[3] * 0.5);
    const len = a.distanceTo(b);
    const n = Math.max(8, Math.round(len / 0.7));
    const sag = len * 0.08;
    for (let p = 0; p <= n; p++) {
      const u = p / n;
      const q = new Vector3().lerpVectors(a, b, u);
      q.y -= sag * 4 * u * (1 - u);
      k.part(BOX, tf(q.x, q.y, q.z, 0, ang + Math.PI / 2, 0, 0.35, 0.08, 1.3), 0xa77a4f, SURF.wood);
    }
    for (const s of [-1, 1]) {
      const off = v3(Math.cos(ang) * 0.65 * s, 0.9, -Math.sin(ang) * 0.65 * s);
      rope(k, a.clone().add(off), b.clone().add(off), sag, 0.04, 0xd8c39a);
    }
    const mid = new Vector3().lerpVectors(a, b, 0.5);
    k.part(BALL_LO, tf(mid.x, mid.y - sag + 0.6, mid.z, 0, 0, 0, 0.25, 0.32, 0.25), WARM, SURF.glass, 2.6);
  }
  // A treehouse on the centre stack: a round hut with a thatched cone and a lit window.
  const [hx, hy, hz] = c0!;
  k.part(
    new CylinderGeometry(1.3, 1.4, 1.6, 12).translate(0, 0.8, 0),
    tf(hx + 0.8, hy + 0.3, hz - 0.6),
    0x9a7650,
    SURF.wood,
  );
  k.part(CONE, tf(hx + 0.8, hy + 1.9, hz - 0.6, 0, 0, 0, 1.9, 1.5, 1.9), 0xc9a45c, SURF.matte);
  k.part(
    BOX,
    tf(hx + 0.8 + 1.32, hy + 0.9, hz - 0.6, 0, Math.PI / 2, 0, 0.6, 0.5, 0.08),
    WARM,
    SURF.glass,
    2.0,
  );
  // A natural sea arch south-east of the stacks, mossy on top.
  const [ax, az] = [x + 16, z + 16];
  k.part(
    craggy(new TorusGeometry(6.5, 1.9, 8, 20, Math.PI), 0.45, 5),
    tf(ax, -0.5, az, 0, -Math.PI / 4, 0),
    LIMESTONE[1],
    SURF.stone,
  );
  k.part(boulder(6), tf(ax, 7.6, az, 0, 0.6, 0, 2.6, 0.7, 2.4), 0x5aa65a, SURF.leaf);
  foam(k, ax + 4.6, az + 4.6, 2.2, 8, 51);
  foam(k, ax - 4.6, az - 4.6, 2.2, 8, 53);
  return k;
}
