/** A point on the loop: position, unit tangent (direction of increasing s) and signed curvature (1/radius). */
export interface PathPoint {
  x: number;
  z: number;
  tx: number;
  tz: number;
  curv: number;
}

type Segment =
  | { kind: 'line'; s0: number; len: number; ax: number; az: number; tx: number; tz: number }
  | { kind: 'arc'; s0: number; len: number; cx: number; cz: number; r: number; a0: number; turn: number };

/**
 * A closed loop through polygon corners, each corner rounded with a circular arc of radius `r`, parametrised
 * by arc length s ∈ [0, length). Exact (no sampling), so trains, the camera and the baked guideway all agree.
 */
export class LoopPath {
  readonly length: number;
  private segs: Segment[] = [];

  constructor(corners: [number, number][], r: number) {
    const n = corners.length;
    // Tangent points of each corner's fillet.
    const fil = corners.map((c, i) => {
      const p = corners[(i + n - 1) % n]!;
      const q = corners[(i + 1) % n]!;
      const [ux, uz] = norm(p[0] - c[0], p[1] - c[1]);
      const [vx, vz] = norm(q[0] - c[0], q[1] - c[1]);
      const half = Math.acos(Math.max(-1, Math.min(1, ux * vx + uz * vz))) / 2;
      const d = r / Math.tan(half);
      const [bx, bz] = norm(ux + vx, uz + vz);
      const h = r / Math.sin(half);
      return {
        inX: c[0] + ux * d,
        inZ: c[1] + uz * d,
        outX: c[0] + vx * d,
        outZ: c[1] + vz * d,
        cx: c[0] + bx * h,
        cz: c[1] + bz * h,
        turn: Math.PI - 2 * half,
      };
    });
    let s = 0;
    for (let i = 0; i < n; i++) {
      const f = fil[i]!;
      const a0 = Math.atan2(f.inZ - f.cz, f.inX - f.cx);
      const turn = f.turn;
      this.segs.push({ kind: 'arc', s0: s, len: Math.abs(turn) * r, cx: f.cx, cz: f.cz, r, a0, turn });
      s += Math.abs(turn) * r;
      const g = fil[(i + 1) % n]!;
      const len = Math.hypot(g.inX - f.outX, g.inZ - f.outZ);
      const [tx, tz] = norm(g.inX - f.outX, g.inZ - f.outZ);
      this.segs.push({ kind: 'line', s0: s, len, ax: f.outX, az: f.outZ, tx, tz });
      s += len;
    }
    this.length = s;
    // Arc direction must agree with the lines on either side: flip any arc whose end tangent disagrees.
    for (let i = 0; i < this.segs.length; i++) {
      const a = this.segs[i]!;
      if (a.kind !== 'arc') continue;
      const next = this.segs[(i + 1) % this.segs.length]! as Extract<Segment, { kind: 'line' }>;
      const e = this.at(a.s0 + a.len - 1e-6, { x: 0, z: 0, tx: 0, tz: 0, curv: 0 });
      if (Math.hypot(e.x - next.ax, e.z - next.az) > 1e-3) a.turn = -a.turn;
    }
  }

  /** Sample positions for baking geometry: every `curveStep` on arcs, every `lineStep` on straights, plus ends. */
  samples(s0: number, s1: number, curveStep: number, lineStep: number): number[] {
    const out: number[] = [s0];
    for (const g of this.segs) {
      const a = Math.max(s0, g.s0);
      const b = Math.min(s1, g.s0 + g.len);
      if (b <= a) continue;
      const step = g.kind === 'arc' ? curveStep : lineStep;
      const k = Math.max(1, Math.ceil((b - a) / step));
      for (let i = 1; i <= k; i++) out.push(a + ((b - a) * i) / k);
    }
    return out;
  }

  /** Writes the point at arc length s (wrapped) into `out`. */
  at(s: number, out: PathPoint): PathPoint {
    s = ((s % this.length) + this.length) % this.length;
    let lo = 0;
    let hi = this.segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.segs[mid]!.s0 <= s) lo = mid;
      else hi = mid - 1;
    }
    const g = this.segs[lo]!;
    const t = s - g.s0;
    if (g.kind === 'line') {
      out.x = g.ax + g.tx * t;
      out.z = g.az + g.tz * t;
      out.tx = g.tx;
      out.tz = g.tz;
      out.curv = 0;
    } else {
      const dir = Math.sign(g.turn);
      const a = g.a0 + (t / g.r) * dir;
      out.x = g.cx + Math.cos(a) * g.r;
      out.z = g.cz + Math.sin(a) * g.r;
      out.tx = -Math.sin(a) * dir;
      out.tz = Math.cos(a) * dir;
      out.curv = dir / g.r;
    }
    return out;
  }

  /** Arc length of the point on the loop nearest (x, z), searched at 1-unit resolution then refined. */
  project(x: number, z: number): number {
    const p: PathPoint = { x: 0, z: 0, tx: 0, tz: 0, curv: 0 };
    let best = 0;
    let bd = Infinity;
    for (let s = 0; s < this.length; s += 1) {
      this.at(s, p);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) [bd, best] = [d, s];
    }
    for (let s = best - 1; s <= best + 1; s += 0.05) {
      this.at(s, p);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) [bd, best] = [d, s];
    }
    return (best + this.length) % this.length;
  }
}

function norm(x: number, z: number): [number, number] {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}
