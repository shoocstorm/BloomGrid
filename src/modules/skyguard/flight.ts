import { Vector3, type Node } from 'three/webgpu';
import { sin, vec3 } from 'three/tsl';

/**
 * The Sky Guard jet's patrol (D-141): a figure-eight over the island with harmonics that tighten the turns at each
 * end into sharp, banked reversals and roll the height up and down, as a pure function of a phase angle. The CPU
 * poses the jet (and the chase camera) from it; the contrail shader evaluates the same curve at earlier phases, so
 * the trails follow the real track with no uploads. Change both together.
 */
export const PATROL = {
  cx: 258,
  cz: 236,
  ax: 178,
  ax3: 0.16,
  az: 108,
  az4: 0.14,
  y0: 88,
  ay3: 10,
  ay5: 5,
} as const;

/** Patrol position at phase `t` (radians, one lap per 2π) into `out`. */
export function patrolAt(t: number, out: Vector3): Vector3 {
  const P = PATROL;
  return out.set(
    P.cx + P.ax * (Math.sin(t) + P.ax3 * Math.sin(3 * t)),
    P.y0 + P.ay3 * Math.sin(3 * t + 0.7) + P.ay5 * Math.sin(5 * t + 1.3),
    P.cz + P.az * (Math.sin(2 * t) + P.az4 * Math.sin(4 * t + 0.9)),
  );
}

/** The same curve in TSL. */
export function patrolNode(t: Node<'float'>): Node<'vec3'> {
  const P = PATROL;
  return vec3(
    sin(t)
      .add(sin(t.mul(3)).mul(P.ax3))
      .mul(P.ax)
      .add(P.cx),
    sin(t.mul(3).add(0.7))
      .mul(P.ay3)
      .add(sin(t.mul(5).add(1.3)).mul(P.ay5))
      .add(P.y0),
    sin(t.mul(2))
      .add(sin(t.mul(4).add(0.9)).mul(P.az4))
      .mul(P.az)
      .add(P.cz),
  );
}

/** One lap's length in tiles (sampled). */
export function lapLength(): number {
  const a = new Vector3();
  const b = new Vector3();
  let L = 0;
  patrolAt(0, a);
  for (let i = 1; i <= 2048; i++) {
    patrolAt((i / 2048) * Math.PI * 2, b);
    L += a.distanceTo(b);
    a.copy(b);
  }
  return L;
}
