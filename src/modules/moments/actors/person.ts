import { BoxGeometry, CylinderGeometry, Group, Mesh, TorusGeometry, type ColorRepresentation } from 'three/webgpu';

const BOX = new BoxGeometry(1, 1, 1);
import { BALL, Blend, Blinker, CONE, HEMI, ROD, glow, hard, joint, part, soft } from './rig';

/**
 * A person for 3D films (D-197): a fisher, a test pilot, a lighthouse keeper, a cheering crowd. Storybook proportions
 * (a big head, so a face reads in a medium shot), two-segment arms and legs, and a face that acts: brows, a mouth that
 * opens and smiles, blinking eyes with catchlights. Costumes are colours, a hat and a prop in the right hand.
 *
 * Person units: about 1.15 tall, facing +x, feet on y = 0; films scale the root (≈0.2 tiles is a resident's size).
 */

export type Hat = 'none' | 'souwester' | 'cap' | 'helmet' | 'beanie' | 'hood';
export type Prop = 'none' | 'rod' | 'lantern' | 'clipboard' | 'flag';

export interface Look {
  skin: ColorRepresentation;
  hair: ColorRepresentation;
  top: ColorRepresentation;
  bottom: ColorRepresentation;
  shoes?: ColorRepresentation;
  hat?: Hat;
  hatColour?: ColorRepresentation;
  beard?: boolean;
  /** Long hair (a ponytail behind). */
  long?: boolean;
  prop?: Prop;
  /** An apron / vest colour over the top (a fisher's oilskin bib, a pilot's harness). */
  vest?: ColorRepresentation;
}

export type PersonPose =
  | 'stand'
  | 'walk'
  | 'sit'
  | 'fish'
  | 'cheer'
  | 'point'
  | 'startled'
  | 'shrug'
  | 'facepalm'
  | 'wave'
  | 'slump'
  | 'hold'
  | 'think'
  | 'grip'
  | 'read';

const BASE = {
  hip: 0,
  lean: 0,
  twist: 0,
  legL: 0,
  legR: 0,
  kneeL: 0,
  kneeR: 0,
  armLup: 0.05,
  armLout: 0.12,
  elbowL: 0.15,
  armRup: 0.05,
  armRout: 0.12,
  elbowR: 0.15,
  headYaw: 0,
  headPitch: 0,
  headTilt: 0,
  brows: 0,
  mouth: 0,
  smile: 0.3,
  stride: 0,
  bounce: 0,
  wave: 0,
};
type Key = keyof typeof BASE;

const SIT = { hip: -0.2, legL: 1.45, legR: 1.4, kneeL: -1.45, kneeR: -1.4 };
const POSES: Record<PersonPose, Partial<Record<Key, number>>> = {
  stand: {},
  walk: { stride: 1.5, armLout: 0.08, armRout: 0.08 },
  sit: { ...SIT, elbowL: 0.6, elbowR: 0.6, armLup: 0.3, armRup: 0.3 },
  fish: { ...SIT, armRup: 0.85, armRout: 0.05, elbowR: 0.55, armLup: 0.75, elbowL: 0.75, armLout: -0.1, lean: 0.08, smile: 0.5 },
  grip: { ...SIT, armRup: 1.1, elbowR: 0.4, armLup: 1.1, elbowL: 0.4, lean: 0.12, brows: 0.5, mouth: 0.2, smile: 0 },
  cheer: { armLup: 2.7, armRup: 2.7, armLout: 0.35, armRout: 0.35, elbowL: 0.2, elbowR: 0.2, mouth: 0.9, brows: 0.6, smile: 1, bounce: 1 },
  point: { armRup: 1.55, armRout: 0.1, elbowR: 0, headPitch: 0.05, brows: 0.4, mouth: 0.4 },
  startled: { armLup: 1.1, armRup: 1.1, armLout: 0.9, armRout: 0.9, elbowL: 1.1, elbowR: 1.1, lean: -0.15, brows: 1, mouth: 1, smile: 0, hip: 0.03 },
  shrug: { armLout: 0.5, armRout: 0.5, armLup: 0.25, armRup: 0.25, elbowL: 1.5, elbowR: 1.5, headTilt: 0.2, brows: 0.6, mouth: 0.1, smile: 0.1 },
  facepalm: { armRup: 1.45, armRout: 0.25, elbowR: 2.35, headPitch: 0.3, lean: 0.18, brows: -0.5, smile: 0 },
  wave: { armRup: 2.4, armRout: 0.5, elbowR: 0.5, wave: 1, smile: 1, mouth: 0.4, brows: 0.4 },
  slump: { lean: 0.32, headPitch: 0.45, armLup: -0.05, armRup: -0.05, elbowL: 0.05, elbowR: 0.05, brows: -0.5, smile: -0.4 },
  hold: { armRup: 2.0, armRout: 0.15, elbowR: 0.35, headPitch: -0.2, smile: 0.4 },
  read: { armRup: 0.95, armRout: 0.05, elbowR: 1.25, armLup: 0.7, elbowL: 1.1, armLout: -0.15, headPitch: 0.35, smile: 0 },
  think: { armRup: 1.3, armRout: 0.2, elbowR: 2.1, headTilt: 0.15, headPitch: -0.1, brows: 0.3, smile: 0 },
};

export class Person3D {
  readonly root = new Group();
  private hips: Group;
  private torso: Group;
  /** The head (films attach binoculars, a sneeze's jolt, a hat). */
  readonly head: Group;
  private legs: [Group, Group][] = [];
  private arms: [Group, Group][] = [];
  /** The right hand: where a prop is held. */
  readonly hand: Group;
  /** The hat (a gull can steal it: films reparent it). */
  readonly hat = new Group();
  private eyes: Mesh[] = [];
  private brows: Mesh[] = [];
  private mouth: Mesh;
  private blinker = new Blinker();
  readonly pose = new Blend<Key>(BASE);
  private phase = 0;
  private time = Math.random() * 10;
  /** A lantern's light (`prop: 'lantern'`), for films to brighten or dim. */
  lamp: Mesh | null = null;
  /** The rod's tip (`prop: 'rod'`), where a fishing line hangs from. */
  rodTip: Group | null = null;

  constructor(look: Look) {
    const skin = soft(look.skin, 0.7, 0.35);
    const hair = soft(look.hair, 0.65, 0.8);
    const top = soft(look.top, 0.85, 0.7);
    const bottom = soft(look.bottom, 0.85, 0.6);
    const shoes = hard(look.shoes ?? 0x2b2b30, 0.5);
    const ink = hard(0x15110e, 0.25);
    const r = this.root;

    this.hips = joint(r, 0, 0.46, 0);
    part(BALL, bottom, this.hips, 0, 0, 0, 0.12, 0.09, 0.13);
    for (const s of [1, -1]) {
      const hip = joint(this.hips, 0, -0.02, 0.07 * s);
      part(ROD, bottom, hip, 0, 0, 0, 0.058, 0.22, 0.058);
      const knee = joint(hip, 0, -0.22, 0);
      part(BALL, bottom, knee, 0, 0, 0, 0.055);
      part(ROD, bottom, knee, 0, 0, 0, 0.05, 0.19, 0.05);
      part(BALL, shoes, knee, 0.035, -0.2, 0, 0.08, 0.045, 0.055);
      this.legs.push([hip, knee]);
    }

    this.torso = joint(this.hips, 0, 0.04, 0);
    // A vest (oilskin bib, flight jacket) is the body; the shirt shows at the shoulders, the collar and the sleeves.
    const body = look.vest ? soft(look.vest, 0.6, 0.35) : top;
    part(BALL, body, this.torso, 0, 0.17, 0, 0.135, 0.2, 0.16);
    part(BALL, top, this.torso, 0, 0.3, 0, 0.11, 0.07, 0.17);
    if (look.vest) for (const s of [1, -1]) part(BALL, hard(0xd8d2c4, 0.4, 0.5), this.torso, 0.128, 0.22 - 0.07 * (s + 1), 0.04, 0.012);
    for (const s of [1, -1]) {
      const sh = joint(this.torso, 0, 0.31, 0.17 * s);
      part(BALL, top, sh, 0, 0, 0, 0.055);
      part(ROD, top, sh, 0, 0, 0, 0.045, 0.15, 0.045);
      const el = joint(sh, 0, -0.15, 0);
      part(ROD, top, el, 0, 0, 0, 0.04, 0.12, 0.04);
      const hand = joint(el, 0, -0.14, 0);
      part(BALL, skin, hand, 0, 0, 0, 0.045, 0.05, 0.04);
      this.arms.push([sh, el]);
      if (s === -1) this.hand = hand;
    }
    this.hand ??= new Group();

    // Head: skin, hair, a face that acts.
    this.head = joint(this.torso, 0, 0.36, 0);
    part(ROD, skin, this.head, 0, 0.04, 0, 0.045, 0.06, 0.045);
    part(BALL, skin, this.head, 0, 0.15, 0, 0.15, 0.155, 0.145);
    part(HEMI, hair, this.head, -0.012, 0.165, 0, 0.158, 0.135, 0.153).rotation.z = 0.28;
    part(BALL, hair, this.head, -0.07, 0.14, 0, 0.1, 0.12, 0.13);
    if (look.long) part(BALL, hair, this.head, -0.16, 0.06, 0, 0.05, 0.11, 0.05).rotation.z = -0.4;
    if (look.beard) {
      part(BALL, hair, this.head, 0.065, 0.065, 0, 0.1, 0.085, 0.125);
      part(BALL, hair, this.head, 0.13, 0.1, 0, 0.02, 0.018, 0.06);
    }
    for (const s of [1, -1]) {
      part(BALL, skin, this.head, 0, 0.14, 0.145 * s, 0.022, 0.035, 0.018);
      const eye = part(BALL, ink, this.head, 0.13, 0.155, 0.055 * s, 0.016, 0.026, 0.017);
      part(BALL, glow(0xffffff, 0.6), eye, 0.6, 0.45, 0.2 * s, 0.35);
      this.eyes.push(eye);
      const brow = part(BALL, hair, this.head, 0.135, 0.2, 0.055 * s, 0.007, 0.008, 0.032);
      this.brows.push(brow);
      if (!look.beard) part(BALL, soft(0xff9a8a, 0.8, 0.2), this.head, 0.12, 0.1, 0.088 * s, 0.006, 0.018, 0.024);
    }
    part(BALL, skin, this.head, 0.15, 0.12, 0, 0.026, 0.024, 0.022);
    this.mouth = part(BALL, ink, this.head, 0.138, 0.07, 0, 0.008, 0.008, 0.03);

    this.dress(look.hat ?? 'none', look.hatColour ?? look.top, hair);
    this.head.add(this.hat);
    this.holdProp(look.prop ?? 'none');
  }

  private dress(hat: Hat, col: ColorRepresentation, hair: ReturnType<typeof soft>): void {
    const h = this.hat;
    h.position.set(0, 0.15, 0);
    if (hat === 'none') return;
    const m = soft(col, 0.6, 0.4);
    if (hat === 'souwester') {
      part(HEMI, m, h, -0.01, 0.03, 0, 0.165, 0.15, 0.162);
      part(new CylinderGeometry(1, 1, 1, 24), m, h, -0.02, 0.025, 0, 0.24, 0.012, 0.23).rotation.z = -0.12;
    } else if (hat === 'cap') {
      part(HEMI, m, h, -0.005, 0.03, 0, 0.158, 0.11, 0.155);
      part(BALL, m, h, 0.15, 0.045, 0, 0.1, 0.01, 0.1);
      part(BALL, hard(0xf2c45a, 0.3, 0.8), h, 0.13, 0.1, 0, 0.012);
    } else if (hat === 'helmet') {
      part(HEMI, m, h, -0.01, 0.0, 0, 0.17, 0.165, 0.165);
      for (const s of [1, -1]) {
        // Goggles pushed up on the forehead: brass rims, sky-blue lenses.
        part(new TorusGeometry(1, 0.3, 8, 18), hard(0xc9a040, 0.3, 0.85), h, 0.135, 0.06, 0.055 * s, 0.042).rotation.y = Math.PI / 2;
        part(BALL, hard(0x9fd8ff, 0.05, 0.3), h, 0.14, 0.06, 0.055 * s, 0.014, 0.038, 0.038);
      }
      part(ROD, hard(0x3a2a1c, 0.5), h, 0.13, 0.06, 0.055, 0.01, 0.11, 0.01).rotation.x = Math.PI / 2;
      // Ear flaps.
      for (const s of [1, -1]) part(BALL, m, h, -0.01, -0.04, 0.14 * s, 0.07, 0.08, 0.025);
    } else if (hat === 'beanie') {
      part(HEMI, m, h, -0.01, 0.02, 0, 0.162, 0.17, 0.16);
      part(BALL, m, h, -0.02, 0.19, 0, 0.035);
    } else if (hat === 'hood') {
      part(HEMI, m, h, -0.03, -0.02, 0, 0.18, 0.19, 0.18);
      part(BALL, m, h, -0.06, -0.06, 0, 0.17, 0.12, 0.18);
    }
    void hair;
  }

  private holdProp(prop: Prop): void {
    const h = this.hand;
    if (prop === 'rod') {
      const rod = joint(h, 0, -0.02, 0);
      rod.rotation.z = -2.2;
      part(ROD, hard(0x8a5a3a, 0.6), rod, 0, 0.1, 0, 0.008, 1.4, 0.008).rotation.z = Math.PI;
      part(BALL, hard(0x3a3a40, 0.3, 0.7), rod, 0, 0.05, 0.025, 0.02, 0.02, 0.012);
      this.rodTip = joint(rod, 0, 1.5, 0);
    } else if (prop === 'lantern') {
      const l = joint(h, 0, -0.05, 0);
      part(ROD, hard(0x2e2a26, 0.4, 0.6), l, 0, 0, 0, 0.005, 0.06, 0.005);
      part(new CylinderGeometry(1, 1, 1, 8), hard(0x2e2a26, 0.4, 0.6), l, 0, -0.065, 0, 0.035, 0.012, 0.035);
      this.lamp = part(BALL, glow(0xffc46a, 3), l, 0, -0.11, 0, 0.03, 0.04, 0.03);
      part(new CylinderGeometry(1, 1, 1, 8), hard(0x2e2a26, 0.4, 0.6), l, 0, -0.155, 0, 0.04, 0.012, 0.04);
    } else if (prop === 'clipboard') {
      const c = joint(h, 0.03, -0.02, 0);
      c.rotation.set(0, 0, -1.2);
      part(BOX, hard(0x8a5a3a, 0.6), c, 0, 0, 0, 0.2, 0.012, 0.15);
      part(BOX, hard(0xf6f2e6, 0.8), c, 0, 0.008, 0, 0.17, 0.004, 0.125);
      part(BOX, hard(0xc9ccd2, 0.3, 0.8), c, 0.085, 0.012, 0, 0.03, 0.012, 0.06);
    } else if (prop === 'flag') {
      const f = joint(h, 0, 0, 0);
      part(ROD, hard(0xe9e4d4, 0.6), f, 0, 0.3, 0, 0.006, 0.45, 0.006);
      part(BALL, soft(0x7fd1c7, 0.8, 0.3), f, 0, 0.24, 0.07, 0.003, 0.05, 0.07);
    }
    void CONE;
  }

  /** Sets a pose (blending from the current one); `face` overrides apply on top. */
  act(p: PersonPose, face: Partial<Record<'brows' | 'mouth' | 'smile' | 'headYaw' | 'headPitch', number>> = {}): void {
    this.pose.to({ ...POSES[p], ...face }, BASE);
  }

  look(yaw: number, pitch = 0): void {
    this.pose.to({ headYaw: yaw, headPitch: pitch });
  }

  blink(len = 0.18, hold = 0): void {
    this.blinker.start(len, hold);
  }

  /** World position of the head's centre, into `out`. */
  headAt<T extends { setFromMatrixPosition(m: unknown): T }>(out: T): T {
    this.head.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.head.matrixWorld);
  }

  update(dt: number): void {
    this.time += dt;
    this.pose.step(dt);
    const v = this.pose.v;
    const t = this.time;
    this.phase += dt * v.stride * Math.PI * 2;
    const walk = Math.min(1, v.stride);
    const sw = Math.sin(this.phase) * 0.55 * walk;
    const hop = Math.abs(Math.sin(t * 7)) * 0.06 * v.bounce;

    this.hips.position.y = 0.46 + v.hip * 0.46 + Math.abs(Math.cos(this.phase)) * 0.02 * walk + hop;
    this.torso.rotation.z = -v.lean;
    this.torso.rotation.y = v.twist + Math.sin(this.phase) * 0.08 * walk;
    this.torso.position.y = 0.04 + Math.sin(t * 2.2) * 0.003;
    const [[hl, kl], [hr, kr]] = this.legs as [[Group, Group], [Group, Group]];
    hl.rotation.z = v.legL + sw;
    hr.rotation.z = v.legR - sw;
    kl.rotation.z = v.kneeL - Math.max(0, -Math.cos(this.phase)) * 0.6 * walk;
    kr.rotation.z = v.kneeR - Math.max(0, Math.cos(this.phase)) * 0.6 * walk;
    const [[sl, el], [sr, er]] = this.arms as [[Group, Group], [Group, Group]];
    sl.rotation.z = v.armLup - sw * 0.7;
    sl.rotation.x = -v.armLout;
    el.rotation.z = v.elbowL + 0.15 * walk;
    sr.rotation.z = v.armRup + sw * 0.7;
    sr.rotation.x = v.armRout;
    er.rotation.z = v.elbowR + Math.sin(t * 11) * 0.45 * v.wave;
    this.head.rotation.set(v.headTilt, v.headYaw, -v.headPitch + Math.sin(t * 1.3) * 0.015);

    const lid = this.blinker.lid(dt);
    const wide = 1 + Math.max(0, v.brows) * 0.25;
    for (const e of this.eyes) e.scale.set(0.016 * wide, 0.026 * wide * Math.max(0.08, lid), 0.017 * wide);
    for (let i = 0; i < 2; i++) {
      const b = this.brows[i]!;
      b.position.y = 0.2 + v.brows * 0.018;
      b.rotation.x = (i === 0 ? 1 : -1) * v.brows * 0.25;
    }
    const m = this.mouth;
    m.scale.set(0.008, 0.006 + v.mouth * 0.022, 0.026 + Math.max(0, v.smile) * 0.012 - v.mouth * 0.008);
    m.position.y = 0.07 - v.mouth * 0.008 + Math.min(0, v.smile) * -0.004;
  }
}
