import { Color, Group, Mesh, TorusGeometry } from 'three/webgpu';
import { BALL, Blinker, glow, hard, joint, part, soft } from './rig';

/**
 * Flora in 3D (D-197), the city's civic intelligence as she wakes in "Hello, World": a floating flower of six petals
 * round a glowing core, a halo ring, and one eye in the core that opens, looks and blinks. `open` unfolds the bud
 * (0 = closed, 1 = in bloom); `wake` lights her (0 = dark, 1 = full glow); `look(x, y)` turns the eye.
 *
 * Flora units: about 2.4 across in bloom, centred on the root, facing +z; films place and scale the root.
 */
export class Flora3D {
  readonly root = new Group();
  private body: Group;
  private petals: Group[] = [];
  private eye: Group;
  private iris: Group;
  private halo: Mesh;
  private core: Mesh;
  private coreMat = glow(0x5ff2da, 0.2);
  private petalMat = soft(0x3fbf9e, 0.5, 0.9);
  private haloMat = glow(0x9ffff0, 0);
  private irisMat = glow(0x2fd6b8, 0.3);
  private blinker = new Blinker();
  private lid = 0;
  private time = 0;
  open = 0;
  wake = 0;
  /** 0 = eye shut, 1 = open (blinks on top). */
  eyeOpen = 0;
  private lookX = 0;
  private lookY = 0;
  private toX = 0;
  private toY = 0;

  constructor() {
    this.body = joint(this.root);
    // The petals ring the core facing +z (toward the viewer): a bud points at you, a bloom opens like a sunflower.
    const ring = joint(this.body);
    ring.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const yaw = joint(ring);
      yaw.rotation.y = (i / 6) * Math.PI * 2;
      const tilt = joint(yaw, 0, 0, 0);
      // A petal: a long cupped leaf with a paler spine, rooted at the core.
      part(BALL, this.petalMat, tilt, 0, 0.62, 0.0, 0.26, 0.62, 0.07);
      part(BALL, soft(0xb8f5dc, 0.4, 0.6), tilt, 0, 0.6, 0.05, 0.03, 0.5, 0.02);
      // A paler tip.
      part(BALL, soft(0xa8f0d8, 0.5, 0.9), tilt, 0, 1.05, 0.01, 0.16, 0.2, 0.06);
      this.petals.push(tilt);
    }
    this.core = part(BALL, this.coreMat, this.body, 0, 0, 0, 0.36);
    this.halo = part(new TorusGeometry(1, 0.02, 8, 64), this.haloMat, this.body, 0, 0, 0, 1.3);
    // The eye, facing +z out of the core.
    this.eye = joint(this.body, 0, 0, 0.33);
    part(BALL, hard(0xf4fffc, 0.15), this.eye, 0, 0, 0, 0.17, 0.13, 0.07);
    this.iris = joint(this.eye, 0, 0, 0.045);
    part(BALL, this.irisMat, this.iris, 0, 0, 0, 0.075, 0.075, 0.03);
    part(BALL, hard(0x061418, 0.2), this.iris, 0, 0, 0.018, 0.035, 0.035, 0.016);
    part(BALL, glow(0xffffff, 1.5), this.iris, 0.025, 0.025, 0.03, 0.012);
  }

  look(x: number, y: number): void {
    this.toX = x;
    this.toY = y;
  }

  blink(len = 0.2, hold = 0): void {
    this.blinker.start(len, hold);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    // Petals: closed bud (upright, overlapping) to open bloom (tilted out), breathing a little once open.
    const o = this.open;
    for (let i = 0; i < 6; i++) {
      const p = this.petals[i]!;
      p.rotation.x = 0.12 + o * (1.05 + Math.sin(t * 1.4 + i) * 0.04);
    }
    this.body.position.y = Math.sin(t * 1.1) * 0.06 * this.wake;
    this.body.rotation.y = Math.sin(t * 0.4) * 0.05;
    const w = this.wake;
    this.coreMat.emissiveIntensity = 0.1 + w * (0.55 + Math.sin(t * 2) * 0.08);
    this.haloMat.emissiveIntensity = w * 0.9;
    this.halo.scale.setScalar(1.25 + o * 0.15 + Math.sin(t * 1.7) * 0.02);
    this.halo.rotation.z = t * 0.3;
    this.petalMat.emissive = _c.set(0x2fd6b8);
    this.petalMat.emissiveIntensity = w * 0.08;
    this.irisMat.emissiveIntensity = 0.3 + w * 0.9;
    // The eye: opens, blinks, follows `look` with a quick saccade.
    const k = 1 - Math.exp(-dt * 14);
    this.lookX += (this.toX - this.lookX) * k;
    this.lookY += (this.toY - this.lookY) * k;
    this.iris.position.set(this.lookX * 0.07, this.lookY * 0.045, 0.045);
    this.lid += (this.eyeOpen - this.lid) * (1 - Math.exp(-dt * 6));
    const b = this.blinker.lid(dt);
    this.eye.scale.set(1, Math.max(0.04, this.lid * b), 1);
    this.core.scale.setScalar(0.36 * (1 + Math.sin(t * 2) * 0.015 * w));
  }
}

const _c = new Color();
