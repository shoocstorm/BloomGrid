import type { Material, Node } from 'three/webgpu';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { atan, clamp, color, float, fract, positionLocal, select, uniform, vec3 } from 'three/tsl';

/** Share of the loop that is rising into place at the work front. */
const BAND = 0.05;

/**
 * Aeroline construction (Phase 16 follow-up): while the Aeroline project runs, the viaduct, pylons and stations
 * rise into place around the loop with the project's progress. The finished line's materials are cloned with a
 * vertex stage that sweeps by angle round the loop's centre (the line is baked into one mesh, so there is no per-piece
 * order to reveal): ahead of the front, vertices collapse to a point (no triangles drawn); in the front band they
 * rise from below the ground with a warm welding glow. Used only during construction: the finished line swaps the
 * stock materials back, so normal play compiles and pays nothing for it.
 */
export class ConstructionLook {
  /** 0..1 share of the loop in place (the sweep front). */
  readonly built = uniform(0);
  private made: Material[] = [];

  constructor(
    private cx: number,
    private cz: number,
    /** Angle (radians, atan2(z, x) about the centre) the sweep starts from. */
    private a0: number,
    /** How far below its place a rising piece starts (world units). */
    private drop: number,
  ) {}

  /** A construction twin of a finished-line material. */
  wrap(base: Material): Material {
    const m = (base as MeshStandardNodeMaterial).clone();
    const p = positionLocal;
    const f = fract(atan(p.z.sub(this.cz), p.x.sub(this.cx)).sub(this.a0).div(Math.PI * 2).add(2));
    const k = clamp(this.built.mul(1 + BAND).sub(f).div(BAND), 0, 1);
    const t = k.mul(k).mul(float(3).sub(k.mul(2)));
    const risen = p.sub(vec3(0, float(1).sub(t).mul(this.drop), 0));
    m.positionNode = select(k.greaterThan(0), risen, vec3(this.cx, -200, this.cz));
    const front = t.mul(float(1).sub(t)).mul(4);
    const glow = color(0xffc46a).mul(front.mul(1.6));
    m.emissiveNode = m.emissiveNode ? glow.add(m.emissiveNode as Node<'vec3'>) : glow;
    this.made.push(m);
    return m;
  }

  dispose(): void {
    for (const m of this.made) m.dispose();
    this.made = [];
  }
}
