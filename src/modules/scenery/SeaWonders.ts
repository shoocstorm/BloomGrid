import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  Sphere,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  attribute,
  color,
  float,
  mix,
  mrt,
  normalGeometry,
  positionGeometry,
  sin,
  smoothstep,
  uv,
  vec3,
} from 'three/tsl';
import { getMaterial } from '@/render/materials/library';
import { hash2 } from '@/sim/random';
import { U } from '@/render/uniforms';
import { GeoBuilder, skyShade, tf } from '@/render/bake';
import { orbit } from './SkyLife';
import { WONDER_SITES } from './sites';

const PETAL = [0xff9ec8, 0xffc2dc, 0xf7d6ff] as const;
const CORAL = [0xff7f6e, 0xffa86b, 0xc77dff, 0xff6fae, 0xffd36b] as const;
const PEARL = 0xf3f1ea;
const LUMEN = 0x8ff7ff;
const ROCK = 0x8a8278;
const MOSS = 0x5aa65a;

// Shared unit primitives (cloned into each bake).
const BOX = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const CYL = new CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0);
const ROCKY = new IcosahedronGeometry(1, 1);
const BALL = new SphereGeometry(1, 16, 10);
const DOME = new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);

/** Roughens a primitive: pushes each vertex in or out radially by hashed noise (shared vertices stay welded). */
function craggy(g: BufferGeometry, amount: number, seed: number): BufferGeometry {
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    const n =
      (hash2(Math.round(x * 50), Math.round(z * 50) + Math.round(y * 50) * 977, seed) - 0.5) * 2 * amount;
    const len = Math.hypot(x, z) || 1;
    p.setXYZ(i, x + (x / len) * n, y, z + (z / len) * n);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Wonders of the sea, pure decoration out in the deep water off the coast (no sim state, so nothing
 * to save): the Tidewatch Lighthouse with its night beam, the Tide Gates (three giant pearl rings rising
 * out of the sea), the Lotus Atoll of giant floating flowers, the Abyssal Dome observatory, the
 * Verdant Pillars (forested sea stacks) and pods of glowing whales that surface now and then.
 * Each static wonder is one merged mesh (one draw call, culled on its own).
 */
export class SeaWonders {
  readonly group = new Group();
  private beam: Mesh;

  constructor(private S: number) {
    const at = (k: keyof typeof WONDER_SITES) => {
      const [x, z] = WONDER_SITES[k] as readonly [number, number];
      return [x * S, z * S] as const;
    };
    this.add('lighthouse', this.lighthouse(...at('lighthouse')));
    this.add('tide-gates', this.tideGates(...at('tideGates')));
    this.add('lotus-atoll', this.lotus(...at('lotus')));
    this.add('abyssal-dome', this.dome(...at('dome')));
    this.add('verdant-pillars', this.stacks(...at('stacks')));
    this.beam = this.makeBeam(...at('lighthouse'));
    this.group.add(this.beam, ...WONDER_SITES.whales.map(([x, z], p) => this.whales(x * S, z * S, p)));
  }

  private add(name: string, b: GeoBuilder): void {
    const mesh = new Mesh(b.build(), getMaterial('scenery'));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = name;
    this.group.add(mesh);
  }

  update(): void {
    this.beam.visible = U.night.value > 0.05;
    this.beam.rotation.y = U.clock.value * 0.5;
  }

  /** A jagged rock outcrop of a few squashed boulders with moss on top. */
  private rocks(b: GeoBuilder, x: number, z: number, r: number, seed: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      const h = (k: number) => hash2(seed, i * 7 + k, 811);
      const a = h(1) * 6.28;
      const d = i === 0 ? 0 : r * (0.3 + h(2) * 0.55);
      const s = r * (i === 0 ? 0.7 : 0.25 + h(3) * 0.3);
      const [px, pz] = [x + Math.cos(a) * d, z + Math.sin(a) * d];
      b.add(ROCKY, tf(px, -1.5, pz, h(4), h(5) * 6, 0, s, s * (0.55 + h(6) * 0.3), s), ROCK);
      if (i < n / 2)
        b.add(ROCKY, tf(px, -1.5 + s * 0.5, pz, 0, h(7) * 6, 0, s * 0.8, s * 0.25, s * 0.8), MOSS);
    }
  }

  private lighthouse(x: number, z: number): GeoBuilder {
    const b = new GeoBuilder();
    this.rocks(b, x, z, 9, 1, 8);
    const base = 2.5;
    const H = 24;
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands;
      const r0 = 2.4 - t0 * 0.9;
      const r1 = 2.4 - ((i + 1) / bands) * 0.9;
      const g = new CylinderGeometry(r1, r0, H / bands, 20).translate(0, H / bands / 2, 0);
      b.add(g, tf(x, base + t0 * H, z), i % 2 ? 0xff8a7a : PEARL);
    }
    const top = base + H;
    b.add(CYL, tf(x, top, z, 0, 0, 0, 2.3, 0.35, 2.3), 0x2f5f63);
    b.add(new TorusGeometry(2.25, 0.08, 4, 24), tf(x, top + 1.2, z, Math.PI / 2), 0x2f5f63);
    b.add(CYL, tf(x, top + 0.35, z, 0, 0, 0, 1.25, 2.4, 1.25), 0xfff1b8, 2.4);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.add(
        BOX,
        tf(x + Math.cos(a) * 1.28, top + 0.35, z + Math.sin(a) * 1.28, 0, -a, 0, 0.12, 2.4, 0.12),
        0x2f5f63,
      );
    }
    b.add(DOME, tf(x, top + 2.75, z, 0, 0, 0, 1.45, 1.2, 1.45), 0x3f9c8c);
    b.add(new ConeGeometry(0.12, 1.6, 6).translate(0, 0.8, 0), tf(x, top + 3.9, z), 0x3f9c8c);
    // Keeper's cottage and a little jetty.
    b.add(BOX, tf(x + 4.5, 1.6, z + 2, 0, 0.4, 0, 3.4, 2.2, 2.6), PEARL);
    b.add(
      new ConeGeometry(2.6, 1.6, 4).translate(0, 0.8, 0),
      tf(x + 4.5, 3.8, z + 2, 0, 0.4 + Math.PI / 4, 0, 1, 1, 0.8),
      0xff8a7a,
    );
    b.add(BOX, tf(x + 4.1, 2.2, z + 3.4, 0, 0.4, 0, 0.7, 0.8, 0.1), 0xffe6a8, 1.6);
    b.add(BOX, tf(x - 6, 0.4, z + 8, 0, 0.6, 0, 1.4, 0.2, 9), 0x9a6b43);
    return b;
  }

  /** Three giant pearl rings rising from the sea in a line, lumen-lined, crusted with coral at the waterline. */
  private tideGates(x: number, z: number): GeoBuilder {
    const b = new GeoBuilder();
    const yaw = Math.atan2(this.S / 2 - x, this.S / 2 - z); // the line points at the island
    const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
    [22, 15, 10].forEach((R, i) => {
      const d = -i * 20;
      const [cx, cz] = [x + fx * d, z + fz * d];
      const cy = R * 0.25;
      b.add(new TorusGeometry(R, R * 0.1, 10, 64), tf(cx, cy, cz, 0, yaw, 0), PEARL);
      b.add(new TorusGeometry(R * 0.88, R * 0.018, 6, 64), tf(cx, cy, cz, 0, yaw, 0), LUMEN, 2.2);
      b.add(BALL, tf(cx, cy + R * 0.15, cz, 0, 0, 0, R * 0.09), 0xfff1c0, 2.6);
      // Studs of light round the rim.
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const [lx, ly] = [Math.cos(a) * R, Math.sin(a) * R];
        if (cy + ly < 0.5) continue;
        b.add(BALL, tf(cx + lx * fz, cy + ly, cz - lx * fx, 0, 0, 0, R * 0.05), LUMEN, 1.6);
      }
      // Coral where each ring meets the water.
      for (const side of [-1, 1]) {
        const lx = side * Math.sqrt(R * R - cy * cy);
        for (let k = 0; k < 7; k++) {
          const h = (q: number) => hash2(i * 13 + k, side + q * 3, 4441);
          const s = R * (0.06 + h(1) * 0.08);
          const ox = lx + (h(2) - 0.5) * R * 0.35;
          b.add(
            ROCKY,
            tf(
              cx + ox * fz + (h(3) - 0.5) * 3,
              h(4) * 1.2,
              cz - ox * fx + (h(5) - 0.5) * 3,
              h(6),
              h(7) * 6,
              0,
              s,
              s * 1.5,
              s,
            ),
            CORAL[(i + k) % 5],
            0.35,
          );
        }
      }
    });
    return b;
  }

  /** Giant floating lotus flowers on lily pads, glowing softly at night. */
  private lotus(x: number, z: number): GeoBuilder {
    const b = new GeoBuilder();
    const pad = new CylinderGeometry(1, 1, 0.3, 24, 1, false, 0.25, Math.PI * 2 - 0.5).translate(0, 0.15, 0);
    for (let f = 0; f < 9; f++) {
      const h = (k: number) => hash2(f, k, 6007);
      const a = f * 2.4;
      const d = f === 0 ? 0 : 9 + f * 3.2;
      const [px, pz] = [x + Math.cos(a) * d * 1.3, z + Math.sin(a) * d * 0.8];
      const R = (f === 0 ? 1.6 : 0.7 + h(1) * 0.6) * 4;
      b.add(pad, tf(px, 0, pz, 0, h(2) * 6, 0, R * 1.9, 1, R * 1.9), 0x3f9a4f);
      if (f > 0 && h(3) < 0.3) continue; // some pads carry no flower
      const petals = (n: number, len: number, tilt: number, col: number, glow: number, spin: number) => {
        for (let k = 0; k < n; k++) {
          const ry = (k / n) * Math.PI * 2 + spin;
          const ox = Math.sin(ry) * len * 0.55;
          const oz = Math.cos(ry) * len * 0.55;
          b.add(
            BALL,
            tf(px + ox, 0.3 + len * 0.2, pz + oz, -tilt, ry, 0, len * 0.32, len * 0.08, len * 0.62),
            col,
            glow,
          );
        }
      };
      petals(10, R, 0.35, PETAL[0], 0.25, 0);
      petals(8, R * 0.8, 0.85, PETAL[1], 0.35, 0.3);
      petals(6, R * 0.55, 1.2, PETAL[2], 0.45, 0.1);
      b.add(CYL, tf(px, 0.3, pz, 0, 0, 0, R * 0.22, R * 0.45, R * 0.22), 0xffd36b, 1.8);
    }
    return b;
  }

  /** A glass sea observatory on stilts: ribbed dome, solar petals round the deck, a spire of light. */
  private dome(x: number, z: number): GeoBuilder {
    const b = new GeoBuilder();
    const R = 13;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      b.add(
        CYL,
        tf(x + Math.cos(a) * R * 0.8, -6, z + Math.sin(a) * R * 0.8, 0, 0, 0, 0.5, 8, 0.5),
        0x8c9a96,
      );
    }
    b.add(CYL, tf(x, 1.6, z, 0, 0, 0, R, 0.6, R), 0xd9d4c7);
    b.add(new TorusGeometry(R, 0.18, 6, 64), tf(x, 2.3, z, Math.PI / 2), LUMEN, 1.8);
    b.add(DOME, tf(x, 2.2, z, 0, 0, 0, R * 0.68, R * 0.62, R * 0.68), 0x9fe3e6, 0.5);
    const rib = new TorusGeometry(1, 0.025, 4, 32, Math.PI);
    for (let k = 0; k < 8; k++)
      b.add(rib, tf(x, 2.2, z, 0, (k / 8) * Math.PI, 0, R * 0.69, R * 0.63, R * 0.69), LUMEN, 1.2);
    b.add(new ConeGeometry(0.7, 8, 8).translate(0, 4, 0), tf(x, 2.2 + R * 0.6, z), PEARL);
    b.add(BALL, tf(x, 2.2 + R * 0.6 + 8.2, z, 0, 0, 0, 0.6), 0xffe08a, 2.5);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.13;
      b.add(
        BALL,
        tf(
          x + Math.cos(a) * (R + 1.1),
          2.4,
          z + Math.sin(a) * (R + 1.1),
          0.25,
          Math.PI / 2 - a,
          0,
          0.9,
          0.06,
          1.5,
        ),
        0x2d5f8a,
        0.2,
      );
    }
    b.add(BOX, tf(x - R - 6, 1.6, z, 0, Math.PI / 2, 0, 1.8, 0.25, 12), 0x9a6b43);
    return b;
  }

  /** Tall forested sea stacks, linked by a rope bridge. */
  private stacks(x: number, z: number): GeoBuilder {
    const b = new GeoBuilder();
    const tops: [number, number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const h = (k: number) => hash2(i, k, 7121);
      const a = i * 1.9;
      const d = i === 0 ? 0 : 10 + h(1) * 12;
      const [px, pz] = [x + Math.cos(a) * d, z + Math.sin(a) * d];
      const H = 12 + h(2) * 18;
      const r = 3 + h(3) * 3;
      const g = craggy(
        new CylinderGeometry(r * 0.6, r, H + 4, 10, 6).translate(0, (H + 4) / 2 - 4, 0),
        r * 0.18,
        i,
      );
      b.add(g, tf(px, 0, pz, 0, h(4) * 6), i % 2 ? 0xc9a77c : 0xb8946a);
      b.add(
        new CylinderGeometry(r * 0.9, r * 1.05, 0.6, 9).translate(0, H * 0.45, 0),
        tf(px, 0, pz),
        0xa48160,
      );
      b.add(ROCKY, tf(px, H, pz, 0, h(5) * 6, 0, r * 0.85, r * 0.3, r * 0.85), MOSS);
      for (let t = 0; t < 3; t++) {
        const k = (q: number) => hash2(i * 5 + t, q, 7129);
        const [tx, tz] = [px + (k(1) - 0.5) * r, pz + (k(2) - 0.5) * r];
        b.add(CYL, tf(tx, H, tz, 0, 0, 0, 0.18, 2.2, 0.18), 0x7a5a3a);
        b.add(ROCKY, tf(tx, H + 2.8, tz, 0, k(3) * 6, 0, 1.4 + k(4)), k(5) < 0.5 ? 0x3f8f4a : 0x5fb35a);
      }
      // Hanging vines of blossom down the cliff.
      for (let v = 0; v < 3; v++) {
        const va = h(6 + v) * 6.28;
        b.add(
          BOX,
          tf(
            px + Math.cos(va) * r * 0.82,
            H * 0.55,
            pz + Math.sin(va) * r * 0.82,
            0,
            -va,
            0,
            0.5,
            H * 0.45,
            0.2,
          ),
          0x4f9f55,
        );
        b.add(
          BALL,
          tf(px + Math.cos(va) * r * 0.86, H * 0.55, pz + Math.sin(va) * r * 0.86, 0, 0, 0, 0.45),
          PETAL[v % 3],
          0.8,
        );
      }
      tops.push([px, H, pz]);
    }
    // Rope bridge between the two tallest neighbours of the first stack.
    const [a, c] = [tops[0]!, tops[1]!];
    const len = Math.hypot(c[0] - a[0], c[2] - a[2]);
    const yaw = Math.atan2(c[0] - a[0], c[2] - a[2]);
    const pitch = -Math.atan2(c[1] - a[1], len);
    b.add(
      BOX,
      tf((a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - 0.3, (a[2] + c[2]) / 2, pitch, yaw, 0, 1, 0.12, len),
      0x9a6b43,
    );
    return b;
  }

  /** Two rotating cones of light from the lantern room, seen only at night. */
  private makeBeam(x: number, z: number): Mesh {
    const cone = new ConeGeometry(4, 70, 16, 1, true).translate(0, -35, 0).rotateZ(Math.PI / 2);
    const g = mergeGeometries([cone, cone.clone().rotateY(Math.PI)]);
    cone.dispose();
    const m = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      fog: false,
    });
    m.colorNode = color(0xfff1c0);
    // Fades out along the beam (cone uv.y runs base → tip).
    m.opacityNode = U.night.mul(0.22).mul(smoothstep(0, 0.9, uv().y));
    const mesh = new Mesh(g, m);
    mesh.position.set(x, 2.5 + 24 + 1.5, z);
    mesh.name = 'lighthouse-beam';
    mesh.renderOrder = 6;
    return mesh;
  }

  /**
   * A pod of whales gliding in slow circles, surfacing every half minute or so with a spout. Positions are
   * shader-animated from local geometry, so the pod's bounds are set by hand for culling.
   */
  private whales(x: number, z: number, p: number): Mesh {
    const b = new GeoBuilder({ aOrbit: 4, aWhale: 4 });
    for (let w = 0; w < 3; w++) {
      const h = (k: number) => hash2(p * 7 + w, k, 9901);
      const s = w === 0 ? 1.4 : 0.9 + h(1) * 0.3;
      const ex = {
        aOrbit: [x, z, 22 + w * 5, 0.035 * (p ? -1 : 1)],
        aWhale: [w * 0.5 + h(2) * 0.2, p * 2.1 + w * 0.7, 0, s],
      };
      const spout = { ...ex, aWhale: [ex.aWhale[0]!, ex.aWhale[1]!, 1, s] };
      b.add(BALL, tf(0, 0, 0, 0, 0, 0, 1.6 * s, 1.3 * s, 6 * s), 0x2e5f86, 0.25, ex);
      b.add(BALL, tf(0, -0.5 * s, 0.6 * s, 0, 0, 0, 1.3 * s, 0.9 * s, 4.8 * s), 0xdde8ea, 0.1, ex);
      b.add(BALL, tf(0, -0.3 * s, -6.2 * s, 0, 0, 0, 2.6 * s, 0.16 * s, 1.1 * s), 0x2e5f86, 0.25, ex);
      for (const side of [-1, 1])
        b.add(
          BALL,
          tf(side * 2 * s, -0.6 * s, 1.6 * s, 0, side * 0.5, side * 0.4, 1.6 * s, 0.12 * s, 0.8 * s),
          0x2e5f86,
          0.25,
          ex,
        );
      // Glowing spots along the back.
      for (let k = 0; k < 5; k++)
        b.add(BALL, tf(0, 1.15 * s, (2.5 - k * 1.4) * s, 0, 0, 0, 0.18 * s), LUMEN, 2.2, ex);
      // Spout: a column of spray under a puff of mist.
      b.add(BALL, tf(0, 1.2 * s + 1.6, 3 * s, 0, 0, 0, 0.22, 1.7, 0.22), 0xeefcff, 0.4, spout);
      b.add(BALL, tf(0, 1.2 * s + 3.3, 3 * s, 0, 0, 0, 0.9, 0.55, 0.9), 0xeefcff, 0.4, spout);
    }
    const geo = b.build();
    const o = attribute('aOrbit', 'vec4');
    const wh = attribute('aWhale', 'vec4');
    // Surfacing: mostly below the surface, rising for a few seconds each cycle; the spout grows meanwhile.
    const surf = smoothstep(0.75, 1, sin(U.clock.mul(0.18).add(wh.y)));
    const depth = float(-5)
      .mul(wh.w)
      .add(surf.mul(float(4.9).mul(wh.w)));
    const local = positionGeometry.mul(vec3(1, mix(float(1), surf, wh.z), 1));
    const { pos, rot } = orbit(local as never, o, wh.x, depth);
    const m = new MeshBasicNodeMaterial();
    m.positionNode = pos;
    const col = attribute('color', 'vec3');
    const glow = col.mul(attribute('aGlow', 'float')).mul(U.night.mul(0.9).add(0.04));
    m.colorNode = skyShade(col, rot(normalGeometry)).add(glow);
    m.mrtNode = mrt({ emissive: glow.mul(0.7) });
    const mesh = new Mesh(geo, m);
    geo.boundingSphere = new Sphere(new Vector3(x, 0, z), 48);
    mesh.name = 'whales';
    return mesh;
  }
}
