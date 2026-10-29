import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
  type Object3D,
} from 'three/webgpu';
import { color, float, mix, positionGeometry, sin, smoothstep } from 'three/tsl';
import { GeoBuilder, tf } from '@/render/bake';
import { getMaterial } from '@/render/materials/library';
import { U } from '@/render/uniforms';

/**
 * Explore-mode avatars (D-054): a chibi steward for walking and rooftops (also the hoverboard rider), a jet
 * hoverboard, a quadcopter drone and a hot-air balloon. Each is a small group of merged meshes on the shared
 * `scenery` material (vertex colour, `aGlow` lights up at night); moving parts (limbs, rotors, flames) are their
 * own meshes so the explore loop can pose them. Only one is visible at a time, a handful of draw calls, and none
 * cast shadows (the shadow map is cached). Scale: a tile is ≈ 11 m, a storey 0.32; the steward stands ≈ 0.2.
 */

const mesh = (geo: BufferGeometry, name: string): Mesh => {
  const m = new Mesh(geo, getMaterial('scenery'));
  m.name = name;
  m.castShadow = m.receiveShadow = false;
  m.frustumCulled = false;
  return m;
};

/** Additive glow (jet and burner flames): bright at the root, fading to the tip (+Y), flickering. */
function flameMaterial(hot: number, cool: number): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  const t = positionGeometry.y.add(0.5);
  const flick = sin(U.clock.mul(37)).mul(0.15).add(0.85);
  m.colorNode = mix(color(hot), color(cool), smoothstep(0, 1, t))
    .mul(float(1).sub(t).mul(1.6))
    .mul(flick);
  return m;
}

// ── The steward ─────────────────────────────────────────────────────────────
export interface Person {
  root: Group;
  /** Poses the limbs: `phase` advances with distance walked, `amount` 0 (still) .. 1 (full stride). */
  pose(phase: number, amount: number, crouch?: number): void;
}

const SKIN = 0xf6d2b4;
const HAIR = 0x5a3b2e;
const SHIRT = 0x3fbfa6;
const TROUSERS = 0x2d4a5c;
const SHOES = 0xf4efe4;

export function createPerson(): Person {
  const root = new Group();
  root.name = 'explore.person';
  // Torso, head, face and a sprouting leaf (the steward's badge) in one mesh.
  const top = new GeoBuilder()
    .add(new CapsuleGeometry(0.026, 0.03, 4, 10), tf(0, 0.087, 0), SHIRT)
    .add(new CylinderGeometry(0.03, 0.03, 0.012, 12), tf(0, 0.066, 0), TROUSERS)
    // Backpack with a solar flap.
    .add(new BoxGeometry(0.03, 0.036, 0.016), tf(0, 0.092, -0.03), 0xe8b04a)
    .add(new BoxGeometry(0.028, 0.004, 0.018), tf(0, 0.112, -0.03, 0.3), 0x2c6e5d, 0.6)
    .add(new SphereGeometry(0.046, 16, 12), tf(0, 0.152, 0), SKIN)
    // Hair: a cap over the back and top of the head, with a fringe.
    .add(
      new SphereGeometry(0.049, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      tf(0, 0.154, -0.004, -0.35),
      HAIR,
    )
    .add(new SphereGeometry(0.02, 8, 6), tf(0.018, 0.186, 0.026, 0, 0, 0, 1, 0.5, 0.8), HAIR)
    // Big eyes with highlights, blush, a little smile.
    .add(new SphereGeometry(0.0085, 8, 6), tf(0.017, 0.152, 0.041, 0, 0, 0, 1, 1.25, 0.6), 0x1f1a24)
    .add(new SphereGeometry(0.0085, 8, 6), tf(-0.017, 0.152, 0.041, 0, 0, 0, 1, 1.25, 0.6), 0x1f1a24)
    .add(new SphereGeometry(0.0028, 6, 4), tf(0.02, 0.156, 0.046), 0xffffff, 1)
    .add(new SphereGeometry(0.0028, 6, 4), tf(-0.014, 0.156, 0.046), 0xffffff, 1)
    .add(new SphereGeometry(0.008, 8, 6), tf(0.03, 0.14, 0.034, 0, 0, 0, 1, 0.55, 0.4), 0xff9aa2)
    .add(new SphereGeometry(0.008, 8, 6), tf(-0.03, 0.14, 0.034, 0, 0, 0, 1, 0.55, 0.4), 0xff9aa2)
    .add(new TorusGeometry(0.007, 0.0016, 4, 10, Math.PI), tf(0, 0.137, 0.044, 0, 0, Math.PI), 0x8a3d3d)
    // Leaf sprout on top, gently glowing at night.
    .add(new CylinderGeometry(0.0018, 0.0018, 0.022, 4), tf(0, 0.205, 0), 0x4f8f3a)
    .add(new SphereGeometry(0.012, 8, 6), tf(0.009, 0.218, 0, 0, 0, -0.6, 1, 0.35, 0.6), 0x7fd36a, 0.5)
    .add(new SphereGeometry(0.01, 8, 6), tf(-0.008, 0.214, 0, 0, 0, 0.6, 1, 0.35, 0.6), 0x9be37f, 0.5)
    .build();
  const body = mesh(top, 'person.body');
  root.add(body);
  // Limbs pivot at the hip and shoulder (their geometry hangs below the pivot).
  const limb = (r: number, len: number, col: number, end: number, endR: number) =>
    new GeoBuilder()
      .add(new CapsuleGeometry(r, len, 3, 8), tf(0, -len / 2 - r * 0.5, 0), col)
      .add(new SphereGeometry(endR, 8, 6), tf(0, -len - r, 0.004, 0, 0, 0, 1, 0.8, 1.3), end)
      .build();
  const legGeo = limb(0.012, 0.038, TROUSERS, SHOES, 0.014);
  const armGeo = limb(0.009, 0.034, SHIRT, SKIN, 0.01);
  const legs = [-1, 1].map((s) => {
    const m = mesh(legGeo, 'person.leg');
    m.position.set(s * 0.014, 0.062, 0);
    root.add(m);
    return m;
  });
  const arms = [-1, 1].map((s) => {
    const m = mesh(armGeo, 'person.arm');
    m.position.set(s * 0.032, 0.112, 0);
    m.rotation.z = s * 0.25;
    root.add(m);
    return m;
  });
  return {
    root,
    pose(phase, amount, crouch = 0) {
      const swing = Math.sin(phase) * 0.7 * amount;
      legs[0]!.rotation.x = swing - crouch * 0.5;
      legs[1]!.rotation.x = -swing - crouch * 0.5;
      arms[0]!.rotation.x = -swing * 0.8 + crouch * 0.3;
      arms[1]!.rotation.x = swing * 0.8 + crouch * 0.3;
      arms[0]!.rotation.z = -0.25 - crouch * 0.6;
      arms[1]!.rotation.z = 0.25 + crouch * 0.6;
      // A bob in the stride, a slow breath when still; a crouch lowers the body onto bent knees.
      body.position.y =
        Math.abs(Math.sin(phase)) * 0.006 * amount + Math.sin(phase * 0.3) * 0.001 - crouch * 0.012;
      body.rotation.x = crouch * 0.25 + amount * 0.06;
      for (const l of legs) l.position.y = 0.062 - crouch * 0.008;
    },
  };
}

// ── Jet hoverboard ──────────────────────────────────────────────────────────
export interface Board {
  root: Group;
  /** Jet flame length 0 (idle) .. 1 (boost). */
  thrust(k: number): void;
}

export function createBoard(): Board {
  const root = new Group();
  root.name = 'explore.board';
  // Deck along +X: a rounded pearl shell over a teal keel, glow strips underneath, twin jets at the tail.
  const deck = new SphereGeometry(1, 20, 8);
  const geo = new GeoBuilder()
    .add(deck, tf(0, 0.014, 0, 0, 0, 0, 0.15, 0.011, 0.05), 0xf2f6f3)
    .add(deck, tf(-0.004, 0.006, 0, 0, 0, 0, 0.14, 0.008, 0.045), 0x2f6f78)
    .add(new BoxGeometry(0.2, 0.002, 0.008), tf(0, 0.0, 0), 0x7ff7e6, 2.2)
    .add(new BoxGeometry(0.16, 0.002, 0.006), tf(0, 0.0, 0.026), 0x7ff7e6, 1.6)
    .add(new BoxGeometry(0.16, 0.002, 0.006), tf(0, 0.0, -0.026), 0x7ff7e6, 1.6)
    // Grip strip and a lit nose.
    .add(new BoxGeometry(0.17, 0.001, 0.05), tf(-0.01, 0.0255, 0), 0x2b3540)
    .add(new SphereGeometry(0.008, 8, 6), tf(0.148, 0.014, 0), 0xfff4d8, 3)
    // Fins and twin jet nozzles.
    .add(new BoxGeometry(0.04, 0.026, 0.003), tf(-0.13, 0.03, 0.03, 0, 0, 0.5), 0x2f6f78)
    .add(new BoxGeometry(0.04, 0.026, 0.003), tf(-0.13, 0.03, -0.03, 0, 0, 0.5), 0x2f6f78)
    .add(new CylinderGeometry(0.012, 0.016, 0.04, 12), tf(-0.15, 0.016, 0.018, 0, 0, Math.PI / 2), 0x8a96a0)
    .add(new CylinderGeometry(0.012, 0.016, 0.04, 12), tf(-0.15, 0.016, -0.018, 0, 0, Math.PI / 2), 0x8a96a0)
    .add(new TorusGeometry(0.012, 0.003, 4, 12), tf(-0.171, 0.016, 0.018, 0, Math.PI / 2), 0x7ff7e6, 2.5)
    .add(new TorusGeometry(0.012, 0.003, 4, 12), tf(-0.171, 0.016, -0.018, 0, Math.PI / 2), 0x7ff7e6, 2.5)
    .build();
  root.add(mesh(geo, 'board.deck'));
  const flameGeo = new ConeGeometry(0.011, 1, 10, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0);
  const mat = flameMaterial(0xe8fbff, 0x2fa8ff);
  const flames = [0.018, -0.018].map((z) => {
    const f = new Mesh(flameGeo, mat);
    f.position.set(-0.172, 0.016, z);
    f.frustumCulled = false;
    root.add(f);
    return f;
  });
  return {
    root,
    thrust(k) {
      const len = 0.03 + 0.16 * k + Math.sin(performance.now() * 0.05) * 0.006;
      for (const f of flames) f.scale.set(len, 1 + k * 0.4, 1 + k * 0.4);
    },
  };
}

// ── Quadcopter drone ────────────────────────────────────────────────────────
export interface Drone {
  root: Group;
  spin(dt: number, k: number): void;
}

export function createDrone(): Drone {
  const root = new Group();
  root.name = 'explore.drone';
  const b = new GeoBuilder()
    // Pearl shell with a smoked canopy and a teal belly.
    .add(new SphereGeometry(1, 18, 10), tf(0, 0, 0, 0, 0, 0, 0.09, 0.035, 0.065), 0xf2f6f3)
    .add(
      new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      tf(0.02, 0.018, 0, 0, 0, 0, 0.05, 0.03, 0.04),
      0x14313b,
    )
    .add(new SphereGeometry(1, 14, 6), tf(0, -0.018, 0, 0, 0, 0, 0.07, 0.02, 0.05), 0x2f6f78)
    // Gimbal camera under the nose.
    .add(new SphereGeometry(0.016, 10, 8), tf(0.06, -0.03, 0), 0x2b3540)
    .add(new CylinderGeometry(0.008, 0.008, 0.006, 10), tf(0.074, -0.03, 0, 0, 0, Math.PI / 2), 0x7fd8ff, 2)
    // Waist light line.
    .add(
      new TorusGeometry(1, 0.06, 3, 24),
      tf(0, 0.002, 0, Math.PI / 2, 0, 0, 0.088, 0.064, 0.1),
      0x7ff7e6,
      1.6,
    );
  const MOTORS: [number, number][] = [
    [0.1, 0.1],
    [0.1, -0.1],
    [-0.1, 0.1],
    [-0.1, -0.1],
  ];
  for (const [x, z] of MOTORS) {
    const a = Math.atan2(z, x);
    // Arm, motor pod, and a nav light (green front, coral rear).
    b.add(new BoxGeometry(0.13, 0.008, 0.014), tf(x / 2, 0.004, z / 2, 0, -a), 0xdfe6e3);
    b.add(new CylinderGeometry(0.014, 0.012, 0.024, 12), tf(x, 0.012, z), 0x2b3540);
    b.add(new TorusGeometry(0.052, 0.003, 4, 28), tf(x, 0.026, z, Math.PI / 2), 0xf2f6f3);
    b.add(new SphereGeometry(0.005, 6, 4), tf(x * 1.08, 0.0, z * 1.08), x > 0 ? 0x5dff9a : 0xff6b6b, 3);
  }
  root.add(mesh(b.build(), 'drone.body'));
  // Rotors: two blades each, and a faint blur disc.
  const blades = new GeoBuilder()
    .add(new BoxGeometry(0.1, 0.0015, 0.01), tf(0, 0, 0, 0, 0, 0.08), 0x2b3540)
    .add(new SphereGeometry(0.006, 6, 4), tf(0, 0.002, 0), 0x7ff7e6, 1.5)
    .build();
  const blur = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, opacity: 0.12 });
  blur.colorNode = color(0xdfe6e3);
  const rotors = MOTORS.map(([x, z]) => {
    const r = mesh(blades, 'drone.rotor');
    r.position.set(x, 0.03, z);
    const disc = new Mesh(new CylinderGeometry(0.05, 0.05, 0.0005, 20), blur);
    disc.frustumCulled = false;
    r.add(disc);
    root.add(r);
    return r;
  });
  let a = 0;
  return {
    root,
    spin(dt, k) {
      a += dt * (40 + 25 * k);
      rotors.forEach((r, i) => (r.rotation.y = i % 3 === 0 ? a : -a));
    },
  };
}

// ── Hot-air balloon ─────────────────────────────────────────────────────────
export interface Balloon {
  root: Group;
  /** Burner flame 0 (pilot light) .. 1 (full burn). */
  burn(k: number): void;
}

/** Envelope gores, cycled round the balloon: cream, sage, coral, gold (with a solar-fabric band). */
const GORES = [0xf6efe1, 0x8fcf9a, 0xff9b85, 0xf3c45a];

export function createBalloon(): Balloon {
  const root = new Group();
  root.name = 'explore.balloon';
  // Teardrop profile, basket at the origin; the envelope's mouth sits 0.9 above it.
  const prof: Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = 0.9 + t * 2.3;
    const r =
      t < 0.62
        ? 0.18 + Math.sin((t / 0.62) * Math.PI * 0.5) * 0.92
        : Math.cos(((t - 0.62) / 0.38) * Math.PI * 0.5) * 1.1;
    prof.push(new Vector2(Math.max(0.001, r), y));
  }
  const b = new GeoBuilder();
  const N = 16;
  for (let i = 0; i < N; i++)
    b.add(
      new LatheGeometry(prof, 3, (i / N) * Math.PI * 2, (Math.PI * 2) / N),
      tf(0, 0, 0),
      GORES[i % GORES.length]!,
    );
  // Solar-fabric belt round the widest part, a crown ring, and a lit mouth ring.
  b.add(new TorusGeometry(1.1, 0.035, 4, 48), tf(0, 2.32, 0, Math.PI / 2), 0x2c6e5d, 0.4);
  b.add(new TorusGeometry(0.2, 0.03, 4, 20), tf(0, 0.92, 0, Math.PI / 2), 0x6b4a2a);
  // Ropes from the mouth to the basket rim, the basket (wicker, with a rim), and the burner frame.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a);
    const z = Math.sin(a);
    b.add(
      new CylinderGeometry(0.006, 0.006, 0.86, 4),
      tf(x * 0.15, 0.6, z * 0.15, z * 0.06, 0, -x * 0.06),
      0x5a4632,
    );
  }
  b.add(new CylinderGeometry(0.15, 0.13, 0.17, 12), tf(0, 0.085, 0), 0xb08350);
  b.add(new TorusGeometry(0.15, 0.015, 4, 16), tf(0, 0.17, 0, Math.PI / 2), 0x7a5634);
  b.add(new CylinderGeometry(0.035, 0.03, 0.05, 10), tf(0, 0.36, 0), 0x8a96a0);
  b.add(new TorusGeometry(0.03, 0.008, 4, 10), tf(0, 0.36, 0, Math.PI / 2), 0xffb45e, 1.5);
  // Lantern string round the basket rim, lit at night.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add(new SphereGeometry(0.012, 6, 4), tf(Math.cos(a) * 0.16, 0.15, Math.sin(a) * 0.16), 0xffd58a, 2.5);
  }
  root.add(mesh(b.build(), 'balloon.body'));
  const flame = new Mesh(
    new ConeGeometry(0.05, 1, 10, 1, true).translate(0, 0.5, 0),
    flameMaterial(0xfff2c4, 0xff6a2a),
  );
  flame.position.y = 0.38;
  flame.frustumCulled = false;
  root.add(flame);
  return {
    root,
    burn(k) {
      const len = 0.05 + 0.4 * k + Math.sin(performance.now() * 0.04) * 0.02 * (0.3 + k);
      flame.scale.set(1 + k * 0.5, len, 1 + k * 0.5);
    },
  };
}

/** Hides every avatar but `show` (if any). */
export function showOnly(all: Object3D[], show?: Object3D): void {
  for (const o of all) o.visible = o === show;
}
