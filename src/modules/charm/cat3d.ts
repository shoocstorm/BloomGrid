import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three/webgpu';
import type { Coat } from './art';

/**
 * The island's cat in 3D (D-196), for the 3D adoption film: the same character as the SVG one (`art.ts`), built from
 * a handful of smooth primitives on a small rig (hips → neck → head, four legs, a five-segment tail) and posed on the
 * CPU each frame. A coat is a few shared materials (fur, belly, markings, eyes), so a repaint changes colours only.
 *
 * Cat units: about 1.2 long, standing 0.7 to the ears, facing +x, paws on y = 0; the film scales the root.
 * One actor of about 30 small meshes: a cutscene's cost, never drawn in the city.
 */

export type CatPose = 'idle' | 'wide' | 'creep' | 'freeze' | 'tiptoe' | 'leap' | 'land' | 'proud' | 'trust';

/** What each pose leans toward; the rig eases every value to its target, so poses blend. */
interface Targets {
  crouch: number;
  /** Walk cycle rate (cycles / s); 0 stands. */
  stride: number;
  headPitch: number;
  headYaw: number;
  tailUp: number;
  tailSwish: number;
  /** Eye size (1 = open, 1.35 = wide). */
  eye: number;
  /** Pupil width (slit 0.35 → round 1). */
  pupil: number;
  stretch: number;
  pawUp: number;
  munch: number;
}

const POSES: Record<CatPose, Targets> = {
  idle: { crouch: 0.55, stride: 0, headPitch: 0.05, headYaw: 0.35, tailUp: 0.15, tailSwish: 0.25, eye: 1, pupil: 0.55, stretch: 0, pawUp: 0, munch: 0 },
  wide: { crouch: 0.5, stride: 0, headPitch: 0.25, headYaw: 0.15, tailUp: 0.3, tailSwish: 0.6, eye: 1.35, pupil: 1, stretch: 0, pawUp: 0, munch: 0 },
  creep: { crouch: 0.45, stride: 1.4, headPitch: -0.1, headYaw: 0, tailUp: 0.05, tailSwish: 0.15, eye: 1.15, pupil: 0.9, stretch: 0, pawUp: 0, munch: 0 },
  freeze: { crouch: 0.3, stride: 0, headPitch: 0.15, headYaw: 0, tailUp: 0.9, tailSwish: 0, eye: 1.4, pupil: 1, stretch: 0, pawUp: 1, munch: 0 },
  tiptoe: { crouch: -0.2, stride: 0, headPitch: 0.3, headYaw: 0, tailUp: 1, tailSwish: 0, eye: 1.4, pupil: 1, stretch: 0, pawUp: 1, munch: 0 },
  leap: { crouch: -0.1, stride: 0, headPitch: 0.2, headYaw: 0, tailUp: 0.25, tailSwish: 0, eye: 1.2, pupil: 1, stretch: 1, pawUp: 0, munch: 0 },
  land: { crouch: 0.2, stride: 0, headPitch: -0.25, headYaw: 0, tailUp: 0.6, tailSwish: 0.4, eye: 0.8, pupil: 0.7, stretch: 0, pawUp: 0, munch: 1 },
  trust: { crouch: 0.25, stride: 0, headPitch: 0.12, headYaw: 0, tailUp: 0.7, tailSwish: 0.2, eye: 1, pupil: 0.6, stretch: 0, pawUp: 0, munch: 0 },
  proud: { crouch: 0, stride: 0, headPitch: 0.2, headYaw: 0.9, tailUp: 1, tailSwish: 0.35, eye: 1, pupil: 0.5, stretch: 0, pawUp: 0, munch: 0 },
};

const KEYS = Object.keys(POSES.idle) as (keyof Targets)[];

// Shared shapes (cloned by nobody; never disposed while a cat lives).
const BALL = new SphereGeometry(1, 20, 14);
const LEG = new CylinderGeometry(0.055, 0.065, 1, 10).translate(0, -0.5, 0);
const SEG = new CylinderGeometry(0.04, 0.05, 1, 8).translate(0, 0.5, 0);
const EAR = new ConeGeometry(1, 1, 4).translate(0, 0.5, 0);
const RING = new TorusGeometry(0.2, 0.03, 8, 24).rotateY(Math.PI / 2);

const mat = (rough = 0.85) => new MeshStandardNodeMaterial({ roughness: rough, metalness: 0 });

export class Cat3D {
  readonly root = new Group();
  private hips = new Group();
  private neck = new Group();
  private head = new Group();
  private legs: Group[] = [];
  private tail: Group[] = [];
  private eyes: Group[] = [];
  private pupils: Mesh[] = [];
  private collar = new Group();
  readonly fur = mat();
  readonly belly = mat();
  readonly mark = mat();
  readonly eye = new MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0 });
  private pupilMat = new MeshStandardNodeMaterial({ roughness: 0.2, color: 0x07080a });
  private nose = new MeshStandardNodeMaterial({ roughness: 0.6, color: 0xe58a9a });
  private collarMat = new MeshStandardNodeMaterial({ roughness: 0.5, color: 0xd8423c });
  private bellMat = new MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.9, color: 0xf2c45a });

  private now: Targets = { ...POSES.idle };
  private target: Targets = POSES.idle;
  private phase = 0;
  private time = 0;
  private blinkT = -1;
  private blinkLen = 0.18;
  private blinkHold = 0;

  constructor() {
    const part = (g: BufferGeometry, m: MeshStandardNodeMaterial, parent: Group, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
      const mesh = new Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    this.root.add(this.hips);
    this.hips.position.set(0, 0.41, 0);
    // Body: a long bean, a pale belly, a darker saddle (tabby back, calico patch, tuxedo coat).
    part(BALL, this.fur, this.hips, 0, 0.02, 0, 0.5, 0.24, 0.22);
    part(BALL, this.fur, this.hips, 0.28, 0.06, 0, 0.24, 0.24, 0.21);
    part(BALL, this.belly, this.hips, 0.12, -0.08, 0, 0.36, 0.16, 0.17);
    part(BALL, this.mark, this.hips, -0.12, 0.13, 0, 0.32, 0.12, 0.18);

    // Neck → head.
    this.hips.add(this.neck);
    this.neck.position.set(0.38, 0.12, 0);
    this.neck.add(this.head);
    this.head.position.set(0.1, 0.12, 0);
    part(BALL, this.fur, this.head, 0, 0, 0, 0.25, 0.22, 0.24);
    part(BALL, this.fur, this.head, 0.06, -0.06, 0.1, 0.1, 0.08, 0.09);
    part(BALL, this.fur, this.head, 0.06, -0.06, -0.1, 0.1, 0.08, 0.09);
    part(BALL, this.belly, this.head, 0.2, -0.08, 0, 0.09, 0.07, 0.12);
    part(BALL, this.mark, this.head, -0.02, 0.13, 0, 0.14, 0.05, 0.12);
    part(BALL, this.nose, this.head, 0.28, -0.04, 0, 0.024, 0.02, 0.03);
    for (const s of [1, -1]) {
      const ear = part(EAR, this.fur, this.head, 0, 0.14, 0.12 * s, 0.09, 0.18, 0.06);
      ear.rotation.set(0.32 * s, 0, -0.12);
      const inner = part(EAR, this.nose, this.head, 0.025, 0.155, 0.115 * s, 0.05, 0.12, 0.02);
      inner.rotation.copy(ear.rotation);
      const eye = new Group();
      eye.position.set(0.2, 0.03, 0.095 * s);
      eye.rotation.y = -0.45 * s;
      this.head.add(eye);
      part(BALL, this.eye, eye, 0, 0, 0, 0.04, 0.05, 0.03);
      this.pupils.push(part(BALL, this.pupilMat, eye, 0.022, 0, 0, 0.012, 0.04, 0.012));
      this.eyes.push(eye);
    }
    // Collar and bell (hidden until it lands).
    this.neck.add(this.collar);
    this.collar.position.set(0.02, 0.03, 0);
    this.collar.rotation.z = -0.5;
    part(RING, this.collarMat, this.collar, 0, 0, 0, 0.62, 0.62, 0.62);
    part(BALL, this.bellMat, this.collar, 0.13, -0.07, 0, 0.035);
    this.collar.visible = false;

    // Legs: shoulders and hips; a pale sock at each paw.
    for (const [x, z] of [[0.3, 0.11], [0.3, -0.11], [-0.28, 0.12], [-0.28, -0.12]] as const) {
      const leg = new Group();
      leg.position.set(x, -0.04, z);
      this.hips.add(leg);
      part(LEG, this.fur, leg, 0, 0, 0, 1.15, 0.32, 1.15);
      part(BALL, this.belly, leg, 0.015, -0.32, 0, 0.075, 0.05, 0.07);
      this.legs.push(leg);
    }
    // Tail: five segments, each a child of the last.
    let parent: Group = this.hips;
    for (let i = 0; i < 5; i++) {
      const seg = new Group();
      seg.position.set(i === 0 ? -0.46 : 0, i === 0 ? 0.08 : 0.15, 0);
      parent.add(seg);
      part(SEG, i === 4 ? this.mark : this.fur, seg, 0, 0, 0, 1 - i * 0.08, 0.16, 1 - i * 0.08);
      this.tail.push(seg);
      parent = seg;
    }
  }

  /** Colours a coat; `glow` lights the eyes (lamp eyes in the dark). */
  paint(c: { fur: string; belly: string; mark: string; eye?: string }, glow = 0): void {
    this.fur.color.set(c.fur);
    this.belly.color.set(c.belly);
    this.mark.color.set(c.mark);
    const eye = new Color(c.eye ?? (glow > 0 ? '#ffe27a' : '#c9e86a'));
    this.eye.color.copy(eye);
    this.eye.emissive.copy(eye);
    this.eye.emissiveIntensity = glow;
  }

  paintCoat(coat: Coat): void {
    // In the light, eyes are green-gold on every coat (a dark coat's bright eye colour reads the same).
    this.paint({ fur: coat.fur, belly: coat.belly, mark: coat.mark, eye: coat.eye ?? '#b8d65a' }, 0.15);
  }

  set collared(on: boolean) {
    this.collar.visible = on;
  }

  pose(p: CatPose): void {
    this.target = POSES[p];
  }

  /** A blink: `len` s to close and open, `hold` s shut between (a slow blink holds). */
  blink(len = 0.18, hold = 0): void {
    this.blinkT = 0;
    this.blinkLen = len;
    this.blinkHold = hold;
  }

  /** The head's world position (for screen pins), into `out`. */
  headAt<T extends { setFromMatrixPosition(m: unknown): T }>(out: T): T {
    this.head.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.head.matrixWorld);
  }

  update(dt: number): void {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 9);
    for (const key of KEYS) this.now[key] += (this.target[key] - this.now[key]) * k;
    const n = this.now;
    const t = this.time;
    this.phase += dt * n.stride * Math.PI * 2;
    const walk = Math.min(1, n.stride);

    // Hips: lowered by the crouch, a breath, a bob in the walk, stretched out in a leap.
    const breath = Math.sin(t * 2.4) * 0.006;
    this.hips.position.y = 0.41 - n.crouch * 0.13 + breath + Math.abs(Math.sin(this.phase)) * 0.015 * walk;
    this.hips.rotation.z = n.stretch * 0.12 - n.crouch * 0.04;
    this.hips.scale.set(1 + n.stretch * 0.18, 1 - n.stretch * 0.06, 1);
    const legScale = 1 - Math.max(0, n.crouch) * 0.36 + Math.max(0, -n.crouch) * 0.1;

    // Legs: diagonal pairs in step; a raised forepaw when frozen; reach and push in a leap.
    const swing = 0.42 * walk;
    const reach = n.stretch;
    const legs = this.legs;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const pair = i === 0 || i === 3 ? 0 : Math.PI;
      const leg = legs[i]!;
      leg.scale.y = legScale;
      leg.rotation.z = Math.sin(this.phase + pair) * swing + (front ? reach * 1.2 : -reach * 1.1);
    }
    legs[0]!.rotation.z += n.pawUp * 0.9;
    legs[0]!.scale.y = legScale * (1 - n.pawUp * 0.35);

    // Head: looks, and chews.
    this.neck.rotation.z = n.headPitch - n.crouch * 0.1 + Math.sin(t * 14) * 0.06 * n.munch;
    this.neck.rotation.y = n.headYaw * Math.sin(t * 0.5) * 0.6 + n.headYaw * 0.25;

    // Tail: up and curling at the tip, or out behind; a swish along it.
    const up = n.tailUp;
    for (let i = 0; i < 5; i++) {
      const seg = this.tail[i]!;
      const base = i === 0 ? 1.75 - up * 1.35 : (0.08 + up * 0.18) * (i >= 3 ? 1.6 : 0.4);
      seg.rotation.z = base;
      seg.rotation.x = Math.sin(t * 2.2 - i * 0.7) * n.tailSwish * 0.28;
    }

    // Eyes: size, pupils, blinks.
    let lid = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const half = this.blinkLen / 2;
      const b = this.blinkT;
      lid = b < half ? 1 - b / half : b < half + this.blinkHold ? 0 : Math.min(1, (b - half - this.blinkHold) / half);
      if (b > this.blinkLen + this.blinkHold) this.blinkT = -1;
    }
    for (const e of this.eyes) e.scale.set(n.eye, n.eye * Math.max(0.06, lid), n.eye);
    for (const p of this.pupils) p.scale.x = 0.012 * (0.4 + n.pupil * 0.9);
    for (const p of this.pupils) p.scale.z = 0.012 * (0.4 + n.pupil * 1.6);
  }
}

/** The bait: a fish on a string, hanging from `length` above its nose (+y up), with a sway and a twitch. */
export class Fish3D {
  readonly root = new Group();
  private body = new Group();
  private time = 0;
  twitch = 0;

  constructor(length: number) {
    const m = (c: number, r = 0.35, metal = 0.2) => new MeshStandardNodeMaterial({ color: c, roughness: r, metalness: metal });
    // Tied by the tail, nose down.
    const string = new Mesh(new CylinderGeometry(0.004, 0.004, length, 4).translate(0, length / 2, 0), m(0xe9e4d4, 0.9, 0));
    string.position.y = 0.2;
    this.root.add(string, this.body);
    const b = new Mesh(BALL, m(0x9fd0e8));
    b.scale.set(0.05, 0.13, 0.035);
    const tail = new Mesh(new ConeGeometry(0.06, 0.08, 4).rotateZ(Math.PI), m(0x7fb6d2));
    tail.position.y = 0.16;
    tail.scale.z = 0.4;
    const eye = new Mesh(BALL, m(0x1d2a33, 0.3, 0));
    eye.position.set(0.02, -0.08, 0.026);
    eye.scale.setScalar(0.012);
    for (const mesh of [b, tail, eye]) mesh.castShadow = true;
    this.body.add(b, tail, eye);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.root.rotation.z = Math.sin(t * 1.3) * 0.08 + Math.sin(t * 31) * 0.12 * this.twitch;
    this.body.rotation.y = Math.sin(t * 0.9) * 0.6;
  }
}
