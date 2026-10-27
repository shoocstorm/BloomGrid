import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  LatheGeometry,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three/webgpu';
import { abs, attribute, cos, mrt, normalGeometry, positionGeometry, sign, sin, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { hash2 } from '@/sim/random';
import { U } from '@/render/uniforms';
import { GeoBuilder, skyShade, tf } from './bake';

const PETALS = [0xffb7d5, 0xffe08a, 0xc9b6ff, 0x9ff0d8, 0xffc59a] as const;

/**
 * Places craft-local geometry on a circular orbit, facing along it. `o` = (centre x, centre z, radius,
 * angular speed; negative turns clockwise), `phase` = start angle. Returns world position and a
 * function rotating a local direction (normals) the same way.
 */
export function orbit(local: Node<'vec3'>, o: Node<'vec4'>, phase: Node<'float'>, lift: Node<'float'>) {
  const th = phase.add(U.clock.mul(o.w));
  const c = cos(th);
  const s = sin(th);
  const dir = sign(o.w);
  // Forward (+z local) is the orbit tangent; right (+x local) is perpendicular to it.
  const tx = s.negate().mul(dir);
  const tz = c.mul(dir);
  const rot = (v: Node<'vec3'>) =>
    vec3(v.x.mul(tz).add(v.z.mul(tx)), v.y, v.x.mul(tx.negate()).add(v.z.mul(tz)));
  const pos = vec3(o.x.add(o.z.mul(c)), lift, o.y.add(o.z.mul(s))).add(rot(local));
  return { pos, rot };
}

/**
 * Life in the sky: solar lantern balloons and a leaf-sailed airship circling the island (lit from within
 * at night), and flocks of seabirds wheeling over the coast. One draw call, all motion in the shader.
 */
export class SkyLife {
  readonly mesh: Mesh;

  constructor(S: number) {
    const b = new GeoBuilder({ aOrbit: 4, aLift: 2, aFlap: 2 });
    this.balloons(b, S);
    this.airship(b, S);
    this.birds(b, S);
    const geo = b.build();

    const o = attribute('aOrbit', 'vec4');
    const lift = attribute('aLift', 'vec2');
    const flap = attribute('aFlap', 'vec2');
    const p = positionGeometry;
    // Wings beat about the bird's body line (flap.y); everything bobs gently.
    const beat = sin(U.clock.mul(4.5).add(flap.y.mul(1.7)))
      .mul(0.32)
      .mul(abs(p.x.sub(flap.y)))
      .mul(flap.x);
    const bob = sin(U.clock.mul(0.25).add(lift.y.mul(7))).mul(1.5);
    const { pos, rot } = orbit(vec3(p.x, p.y.add(beat), p.z), o, lift.y, lift.x.add(bob));
    const m = new MeshBasicNodeMaterial({ side: DoubleSide });
    m.positionNode = pos;
    const col = attribute('color', 'vec3');
    const glow = col.mul(attribute('aGlow', 'float')).mul(U.night.mul(0.8).add(0.05));
    m.colorNode = skyShade(col, rot(normalGeometry)).add(glow);
    m.mrtNode = mrt({ emissive: glow.mul(0.6) });
    this.mesh = new Mesh(geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sky-life';
  }

  private balloons(b: GeoBuilder, S: number): void {
    // Envelope: a teardrop lathe (pivot at the basket, envelope 3–12 above it).
    const prof: Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      prof.push(
        new Vector2(Math.max(0.35, Math.sin(Math.pow(t, 0.8) * Math.PI) * 3.6 * (1 - 0.25 * t)), 3 + t * 9),
      );
    }
    const gore = new LatheGeometry(prof, 1, 0, Math.PI / 4); // one of eight striped gores
    const basket = new BoxGeometry(1.1, 0.8, 1.1).translate(0, 0.4, 0);
    const rope = new CylinderGeometry(0.03, 0.03, 2.4, 3).translate(0, 1.2, 0);
    const burner = new SphereGeometry(0.35, 8, 6).translate(0, 1.6, 0);
    const spots: [number, number][] = [
      [0.3, 0.35],
      [0.62, 0.3],
      [0.45, 0.58],
      [0.7, 0.62],
      [0.28, 0.66],
      [0.55, 0.45],
      [0.78, 0.42],
    ];
    spots.forEach(([nx, nz], i) => {
      const h = (k: number) => hash2(i, k, 2711);
      const o = [nx * S, nz * S, 30 + h(1) * 60, (0.012 + h(2) * 0.01) * (h(3) < 0.5 ? -1 : 1)];
      const ex = { aOrbit: o, aLift: [38 + h(4) * 26, h(5) * 6.28] };
      const [ca, cb] = [PETALS[i % 5]!, PETALS[(i + 2) % 5]!];
      for (let g = 0; g < 8; g++) b.add(gore, tf(0, 0, 0, 0, (g * Math.PI) / 4), g % 2 ? ca : cb, 0.55, ex);
      b.add(basket, tf(0, 0, 0), 0x9a6b43, 0, ex);
      for (const [x, z] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ] as const)
        b.add(rope, tf(x, 0.8, z), 0x6b5a48, 0, ex);
      b.add(burner, tf(0, 0.6, 0), 0xffc070, 2, ex);
    });
  }

  /** A long pearl hull, a gondola, leaf solar sails and rings of light, on a wide slow loop. */
  private airship(b: GeoBuilder, S: number): void {
    const ex = { aOrbit: [S * 0.5, S * 0.47, S * 0.36, -0.006], aLift: [92, 0] };
    b.add(new SphereGeometry(1, 20, 12), tf(0, 6, 0, 0, 0, 0, 4.2, 4.2, 15), 0xeef4f0, 0.06, ex);
    b.add(new TorusGeometry(4.3, 0.18, 6, 32), tf(0, 6, 3), 0x9ff7ff, 1.6, ex);
    b.add(new TorusGeometry(3.6, 0.16, 6, 32), tf(0, 6, -7), 0x9ff7ff, 1.6, ex);
    b.add(new BoxGeometry(2.2, 1.4, 6), tf(0, 1.4, 0), 0x4c6b5c, 0.9, ex);
    b.add(new CylinderGeometry(0.15, 0.15, 3.2, 4), tf(0, 2.6, 0), 0x6b7a72, 0, ex);
    const leaf = new SphereGeometry(1, 10, 6);
    for (const side of [-1, 1]) {
      b.add(leaf, tf(side * 5.5, 6.5, 1, 0, 0, side * 0.35, 3.2, 0.18, 5.5), 0x3fae6a, 0.15, ex);
      b.add(leaf, tf(side * 2.2, 9.5, -12, 0, 0, side * 0.9, 2.2, 0.15, 3.2), 0x3fae6a, 0.15, ex);
    }
    b.add(leaf, tf(0, 2.2, -12.5, 0, 0, 0, 0.15, 2.4, 3), 0x3fae6a, 0.15, ex);
    b.add(new ConeGeometry(0.6, 2.2, 8), tf(0, 6, 15.6, Math.PI / 2), 0xffe08a, 1.4, ex);
  }

  /** Seabirds: two-triangle gulls in loose V flocks over the coast, wings beating gently. */
  private birds(b: GeoBuilder, S: number): void {
    const wings = new BufferGeometry();
    wings.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([0, 0, 0.35, 0, 0, -0.2, -0.8, 0, -0.1, 0, 0, 0.35, 0.8, 0, -0.1, 0, 0, -0.2]),
        3,
      ),
    );
    wings.setAttribute(
      'normal',
      new BufferAttribute(new Float32Array(Array.from({ length: 6 }, () => [0, 1, 0]).flat()), 3),
    );
    const FLOCKS: [number, number][] = [
      [0.18, 0.3],
      [0.82, 0.42],
      [0.6, 0.84],
      [0.32, 0.8],
      [0.5, 0.16],
    ];
    FLOCKS.forEach(([nx, nz], f) => {
      const h = (k: number) => hash2(f, k, 3301);
      const o = [nx * S, nz * S, 24 + h(1) * 30, (0.05 + h(2) * 0.03) * (h(3) < 0.5 ? -1 : 1)];
      const n = 7 + Math.floor(h(4) * 6);
      for (let i = 0; i < n; i++) {
        const k = (q: number) => hash2(f * 17 + i, q, 3307);
        const row = Math.ceil(i / 2);
        const [x, z] = [(i % 2 ? -1 : 1) * row * 1.6 + (k(1) - 0.5), -row * 1.4 + (k(3) - 0.5)];
        const ex = { aOrbit: o, aLift: [18 + h(5) * 10 + (k(2) - 0.5) * 2, h(6) * 6.28], aFlap: [1, x] };
        b.add(wings, tf(x, 0, z, 0, 0, 0, 0.8 + k(4) * 0.4), 0xf2f4f2, 0, ex);
      }
    });
  }
}
