import { Group } from 'three/webgpu';
import { BALL, Blinker, CONE, compact, hard, joint, part, soft } from './rig';

/**
 * A gull for 3D films (D-197): the island's comic relief (it steals caps, it doesn't buy tickets). A white body, grey
 * wings that flap or glide, a yellow beak that opens, orange legs that tuck in flight.
 *
 * Gull units: about 0.5 long and 1.2 across the wings, facing +x; films scale and fly the root.
 */
export type GullPose = 'fly' | 'glide' | 'stand' | 'squawk';

export class Gull3D {
  readonly root = new Group();
  private body: Group;
  private wings: Group[] = [];
  private tips: Group[] = [];
  private head: Group;
  private jaw: Group;
  private legs: Group[] = [];
  private eye = new Blinker();
  private eyes: Group[] = [];
  private time = Math.random() * 5;
  pose: GullPose = 'fly';
  /** What the beak or feet are carrying (a stolen cap), for films to fill. */
  readonly carry: Group;

  constructor() {
    const white = soft(0xf6f6f2, 0.7, 0.8);
    const grey = soft(0x9aa4ad, 0.7, 0.6);
    const dark = soft(0x2a2d33, 0.6, 0.3);
    const beak = hard(0xf2c23a, 0.4);
    const leg = hard(0xf0904a, 0.5);
    this.body = joint(this.root, 0, 0.18, 0);
    part(BALL, white, this.body, 0, 0, 0, 0.2, 0.085, 0.085);
    part(BALL, grey, this.body, -0.03, 0.04, 0, 0.16, 0.04, 0.08);
    part(CONE, white, this.body, -0.22, 0.01, 0, 0.06, 0.12, 0.025).rotation.z = Math.PI / 2;
    part(CONE, dark, this.body, -0.27, 0.015, 0, 0.035, 0.06, 0.02).rotation.z = Math.PI / 2;
    this.head = joint(this.body, 0.17, 0.07, 0);
    part(BALL, white, this.head, 0, 0, 0, 0.065, 0.06, 0.055);
    part(CONE, beak, this.head, 0.05, -0.005, 0, 0.016, 0.075, 0.014).rotation.z = -Math.PI / 2;
    this.jaw = joint(this.head, 0.05, -0.016, 0);
    part(CONE, beak, this.jaw, 0, 0, 0, 0.012, 0.06, 0.011).rotation.z = -Math.PI / 2;
    part(BALL, hard(0xe0503a, 0.4), this.jaw, 0.05, 0, 0, 0.007);
    for (const s of [1, -1]) {
      const e = joint(this.head, 0.03, 0.02, 0.042 * s);
      part(BALL, hard(0x15110e, 0.2), e, 0, 0, 0, 0.011);
      this.eyes.push(e);
      const w = joint(this.body, 0.0, 0.05, 0.05 * s);
      part(BALL, grey, w, 0, 0, 0.17 * s, 0.11, 0.012, 0.18);
      const tip = joint(w, 0, 0, 0.33 * s);
      part(BALL, grey, tip, -0.03, 0, 0.12 * s, 0.075, 0.009, 0.14);
      part(BALL, dark, tip, -0.06, 0, 0.21 * s, 0.045, 0.008, 0.07);
      this.wings.push(w);
      this.tips.push(tip);
      const l = joint(this.body, 0.0, -0.06, 0.03 * s);
      part(BALL, leg, l, 0, -0.05, 0, 0.008, 0.06, 0.008);
      part(BALL, leg, l, 0.02, -0.11, 0, 0.03, 0.005, 0.02);
      this.legs.push(l);
    }
    this.carry = joint(this.body, 0.0, -0.17, 0);
    compact(this.root, new Set());
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    const flying = this.pose === 'fly' || this.pose === 'glide';
    const flap = this.pose === 'fly' ? Math.sin(t * 13) : this.pose === 'glide' ? 0.12 + Math.sin(t * 2) * 0.05 : 0;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const w = this.wings[i]!;
      if (flying) {
        w.rotation.x = s * -flap * 0.7;
        this.tips[i]!.rotation.x = s * -flap * 0.45;
        w.rotation.y = 0;
        w.scale.setScalar(1);
      } else {
        // Folded back along the body.
        w.rotation.x = s * 0.1;
        w.rotation.y = -s * 1.42;
        w.scale.set(1, 1, 0.62);
        this.tips[i]!.rotation.x = 0;
      }
      this.legs[i]!.rotation.z = flying ? 1.3 : 0;
    }
    this.body.position.y = flying ? 0.18 + flap * 0.015 : 0.18;
    this.body.rotation.z = flying ? 0.05 : 0.15;
    const squawk = this.pose === 'squawk';
    this.jaw.rotation.z = squawk ? -0.35 - Math.abs(Math.sin(t * 9)) * 0.25 : 0;
    this.head.rotation.z = squawk ? 0.5 : flying ? -0.1 : Math.sin(t * 0.9) * 0.08;
    this.head.rotation.y = flying ? 0 : Math.sin(t * 0.6) * 0.5;
    const lid = this.eye.lid(dt);
    for (const e of this.eyes) e.scale.y = Math.max(0.1, lid);
  }
}
