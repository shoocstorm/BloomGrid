/**
 * Camera shots for 3D films (D-196): a film's camera as data, a list of moves on the film clock. Each shot glides
 * from one framing to another over its length (or holds one framing when `to` is unset); between shots the camera
 * holds the last frame it reached, and a new shot is a cut. Pure maths on plain tuples, so it is tested without a
 * renderer (`tests/filmStage.test.ts`).
 */
export type V3 = [number, number, number];

export interface Framing {
  /** Camera position. */
  pos: V3;
  /** Point it looks at. */
  look: V3;
  /** Vertical field of view, degrees (default 34). */
  fov?: number;
}

export type Ease = 'linear' | 'in' | 'out' | 'inOut';

export interface Shot {
  /** Film time the shot starts (s). */
  at: number;
  /** Length of its move (s); 0 holds `from`. */
  dur: number;
  from: Framing;
  to?: Framing;
  ease?: Ease;
  /** Positions are offsets from a moving anchor (`shotAt`'s `anchor`): a tracking shot. */
  rel?: boolean;
}

export const DEFAULT_FOV = 34;

export function ease(e: Ease, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  switch (e) {
    case 'linear':
      return k;
    case 'in':
      return k * k * k;
    case 'out':
      return 1 - (1 - k) ** 3;
    default:
      return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
  }
}

/**
 * The framing at film time `t` (into `out`): the latest shot that has started, eased along its move; a `rel` shot is
 * offset by `anchor`.
 */
export function shotAt(
  shots: readonly Shot[],
  t: number,
  out: Required<Framing> = { pos: [0, 0, 0], look: [0, 0, 0], fov: DEFAULT_FOV },
  anchor: V3 = [0, 0, 0],
): Required<Framing> {
  let s: Shot | undefined;
  for (const c of shots) if (c.at <= t && (!s || c.at >= s.at)) s = c;
  s ??= shots[0];
  if (!s) return out;
  const a = s.from;
  const b = s.to ?? a;
  const k = s.dur > 0 ? ease(s.ease ?? 'inOut', (t - s.at) / s.dur) : 0;
  for (let i = 0; i < 3; i++) {
    const o = s.rel ? anchor[i]! : 0;
    out.pos[i] = o + a.pos[i]! + (b.pos[i]! - a.pos[i]!) * k;
    out.look[i] = o + a.look[i]! + (b.look[i]! - a.look[i]!) * k;
  }
  const fa = a.fov ?? DEFAULT_FOV;
  out.fov = fa + ((b.fov ?? DEFAULT_FOV) - fa) * k;
  return out;
}

/** A framing orbiting `look` at `dist`, `yaw` round the y axis (0 = from +z) and `pitch` up from level (radians). */
export function orbit(look: V3, dist: number, yaw: number, pitch: number, fov?: number): Framing {
  const cp = Math.cos(pitch);
  return {
    pos: [look[0] + Math.sin(yaw) * cp * dist, look[1] + Math.sin(pitch) * dist, look[2] + Math.cos(yaw) * cp * dist],
    look,
    fov,
  };
}
