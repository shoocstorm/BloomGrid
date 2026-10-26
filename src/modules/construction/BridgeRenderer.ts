import { Color, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { InstanceHandle } from '@/render/Instancer';
import { BRIDGE, BRIDGE_DECK } from '@/sim/City';
import { hash2 } from '@/sim/random';
import { findBridgeSpans, type BridgeSpan as Span } from '@/sim/bridges';
import type { GameContext } from '@/game/context';

/** Spans shorter than this keep the plain deck and piers. */
const MIN_SPAN = 8;
const TAU = Math.PI * 2;

type Style = 'suspension' | 'stayed' | 'helix' | 'arch';

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _d = new Vector3();
const UP = new Vector3(0, 1, 0);
const WHITE = new Color(0xf4f1ea);
const PEARL = new Color(0xeaf6f4);
const PETAL = [new Color(0xffb7d5), new Color(0xffe08a), new Color(0xc9b6ff)] as const;
const DIM = [1, 0, 0.25, 1];
const LIT = [1, 0, 0.8, 1];

/**
 * Signature bridges: every straight run of bridge tiles at least MIN_SPAN long is dressed by span length (and a
 * hash of where it starts): suspension towers and catenary cables over wide straits, a cable-stayed A-pylon
 * over channels, a Helix (twin steel-and-light spirals) or a leaning Bloom Arch over rivers. Pure render: the
 * sim still sees highway tiles, so saves, bridges the player builds and the weaver's bridges all get dressed.
 * Spans are re-derived from the grid whenever a highway change touches a bridge (a full scan is ≈1 ms).
 */
export class BridgeRenderer {
  private handles: InstanceHandle[] = [];
  /** Bridge tiles currently dressed, to notice when one is removed. */
  private dressed = new Set<number>();

  constructor(private ctx: GameContext) {
    ctx.bus.on('road:changed', ({ tiles }) => {
      const g = ctx.city.grid;
      if (tiles.some((t) => g.road[t] === BRIDGE || this.dressed.has(t))) this.rebuild();
    });
    ctx.bus.on('city:reset', () => this.clear());
    this.rebuild();
  }

  private clear(): void {
    for (const h of this.handles) this.ctx.instancer.remove(h);
    this.handles = [];
    this.dressed.clear();
  }

  rebuild(): void {
    this.clear();
    for (const sp of findBridgeSpans(this.ctx.city.grid, MIN_SPAN)) {
      const style = this.styleOf(sp);
      if (style === 'suspension') this.suspension(sp);
      else if (style === 'stayed') this.stayed(sp);
      else if (style === 'helix') this.helix(sp);
      else this.arch(sp);
      const g = this.ctx.city.grid;
      for (let k = 0; k < sp.len; k++) this.dressed.add(sp.alongX ? g.index(sp.x + k, sp.z) : g.index(sp.x, sp.z + k));
    }
    this.ctx.services.get('world').atmosphere.invalidateShadows();
  }

  private styleOf(sp: Span): Style {
    if (sp.len >= 45) return 'suspension';
    if (sp.len >= 28) return 'stayed';
    if (sp.len >= 14) return hash2(sp.x, sp.z, 4021) < 0.5 ? 'helix' : 'arch';
    return 'arch';
  }

  /** World point at distance u along the span (0 = first tile's near edge), v across it, height y. */
  private at(sp: Span, u: number, v: number, y: number): Vector3 {
    return sp.alongX ? new Vector3(sp.x + u, y, sp.z + 0.5 + v) : new Vector3(sp.x + 0.5 + v, y, sp.z + u);
  }

  /** River or sea floor under a span point. */
  private floor(p: Vector3): number {
    return Math.min(0, this.ctx.city.grid.heightAt(p.x, p.z)) - 0.5;
  }

  /** A unit piece (pivot at its base, +y up) stretched from a to c. */
  private beam(piece: string, a: Vector3, c: Vector3, thick: number, color = WHITE, params = DIM): void {
    _d.subVectors(c, a);
    const len = _d.length() || 1e-3;
    _q.setFromUnitVectors(UP, _d.divideScalar(len));
    this.handles.push(this.ctx.instancer.addMatrix(piece, _m.compose(a, _q, _s.set(thick, len, thick)), color, params));
  }

  private put(piece: string, p: Vector3, s: Vector3, color = WHITE, params = DIM, q = _q.identity()): void {
    this.handles.push(this.ctx.instancer.addMatrix(piece, _m.compose(p, q, s), color, params));
  }

  /** A crown of petals and a ring of light. */
  private crown(p: Vector3, size: number, seed: number): void {
    for (let k = 0; k < 6; k++) {
      _q.setFromAxisAngle(UP, (k / 6) * TAU).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -0.55));
      this.put('solarLeaf', p, new Vector3(size, 1, size * 0.6), PETAL[(seed + k) % 3], LIT, _q.clone());
    }
    this.put('haloRing', p.clone().setY(p.y - 0.2), new Vector3(size * 1.6, 4, size * 1.6), PEARL, LIT);
  }

  /**
   * Suspension: two towers with petal crowns, lit main cables sagging between them, hangers to the deck. Towers
   * are portals (twin legs, three cross-beams) or lotus A-frames (legs leaning in to meet under the crown).
   */
  private suspension(sp: Span): void {
    const L = sp.len;
    const D = BRIDGE_DECK;
    const H = D + Math.min(15, 6 + L * 0.09);
    const towers = [L * 0.2, L * 0.8];
    const sag = D + 1.4;
    const lotus = Math.floor(sp.x / 64) % 2 === 1; // varies round the coast
    for (const u of towers) {
      for (const v of [-1, 1]) {
        const base = this.at(sp, u, v * (lotus ? 1.5 : 0.85), 0);
        base.y = this.floor(base);
        this.beam('concreteCyl', base, this.at(sp, u, v * (lotus ? 0.12 : 0.6), H), lotus ? 0.5 : 0.55);
      }
      const beams = lotus ? [D - 0.2] : [D + 1.6, H - 2.4, H - 0.3];
      for (const y of beams) this.beam('slab', this.at(sp, u, lotus ? -1.45 : -0.75, y), this.at(sp, u, lotus ? 1.45 : 0.75, y), 0.32);
      this.crown(this.at(sp, u, 0, H), lotus ? 2.4 : 1.8, sp.x + Math.round(u));
      this.beam('lumenRib', this.at(sp, u, 0, H - 2.4), this.at(sp, u, 0, H + 1.6), 0.12, PEARL, LIT);
    }
    // Main cables: anchors at the span ends, up over the towers, a parabola between them.
    const cable = (u: number) => {
      const [a, b] = towers as [number, number];
      if (u <= a) return D + 0.2 + ((H - D - 0.2) * u) / a;
      if (u >= b) return D + 0.2 + ((H - D - 0.2) * (L - u)) / (L - b);
      const t = (u - a) / (b - a);
      return sag + (H - sag) * (2 * t - 1) ** 2;
    };
    for (const v of [-0.62, 0.62]) {
      const STEP = 1.5;
      for (let u = 0; u < L - 1e-6; u += STEP) {
        const u2 = Math.min(L, u + STEP);
        this.beam('lumenRib', this.at(sp, u, v, cable(u)), this.at(sp, u2, v, cable(u2)), 0.1, PEARL, LIT);
      }
      for (let u = 1.5; u < L - 1; u += 1.5) {
        if (towers.some((t) => Math.abs(t - u) < 0.8)) continue;
        this.beam('lumenRib', this.at(sp, u, v, D), this.at(sp, u, v, cable(u)), 0.03, PEARL, DIM);
      }
    }
  }

  /** Cable-stayed: an A-pylon at mid-span, a fan of stays to both deck edges. */
  private stayed(sp: Span): void {
    const L = sp.len;
    const D = BRIDGE_DECK;
    const mid = L / 2;
    const H = D + Math.min(16, 5 + L * 0.3);
    for (const v of [-1.1, 1.1]) {
      const base = this.at(sp, mid, v, 0);
      base.y = this.floor(base);
      this.beam('concreteCyl', base, this.at(sp, mid, 0, H), 0.6);
    }
    this.beam('slab', this.at(sp, mid, -0.9, D + 0.9), this.at(sp, mid, 0.9, D + 0.9), 0.3);
    this.crown(this.at(sp, mid, 0, H), 1.8, sp.z);
    for (let u = 1.5; u < mid - 1; u += 1.5) {
      const k = u / mid;
      const top = this.at(sp, mid, 0, H - 0.6 - (1 - k) * (H - D) * 0.45);
      for (const side of [-1, 1]) for (const v of [-0.5, 0.5]) this.beam('lumenRib', this.at(sp, mid + side * (mid - u), v, D), top, 0.04, PEARL, LIT);
    }
  }

  /** Helix: a steel spiral and a spiral of light wound round the deck, joined by glowing rungs. */
  private helix(sp: Span): void {
    const L = sp.len;
    const D = BRIDGE_DECK;
    const [R, PITCH, STEP] = [1.15, 5, 0.5];
    const pt = (u: number, phase: number) => {
      const a = (u / PITCH) * TAU + phase;
      return this.at(sp, u, Math.cos(a) * R, D + 0.9 + Math.sin(a) * R);
    };
    for (let u = 0; u < L - 1e-6; u += STEP) {
      const u2 = Math.min(L, u + STEP);
      this.beam('concreteCyl', pt(u, 0), pt(u2, 0), 0.11);
      this.beam('lumenRib', pt(u, Math.PI), pt(u2, Math.PI), 0.09, PEARL, LIT);
      if (Math.round(u / STEP) % 3 === 0) this.beam('lumenRib', pt(u, 0), pt(u, Math.PI), 0.035, PEARL, DIM);
    }
    // Piers carry the helix as well as the deck: a pearl ring at each end.
    for (const u of [0.3, L - 0.3]) {
      const q = new Quaternion().setFromAxisAngle(sp.alongX ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0), Math.PI / 2);
      this.put('haloRing', this.at(sp, u, 0, D + 0.9), new Vector3(R * 2.2, 6, R * 2.2), PEARL, LIT, q);
    }
  }

  /** Bloom Arch: twin arches leaning in over the deck, hangers, and a petal crown at the keystone. */
  private arch(sp: Span): void {
    const L = sp.len;
    const D = BRIDGE_DECK;
    const rise = Math.min(9, 2.5 + L * 0.3);
    const N = Math.max(8, Math.round(L));
    const curve = (t: number, side: number) =>
      this.at(sp, t * L, side * (0.85 - 0.6 * Math.sin(t * Math.PI)), D + rise * Math.sin(t * Math.PI));
    for (const side of [-1, 1]) {
      for (let i = 0; i < N; i++) this.beam('concreteCyl', curve(i / N, side), curve((i + 1) / N, side), 0.2);
      for (let i = 2; i < N - 1; i += 2) {
        const p = curve(i / N, side);
        this.beam('lumenRib', this.at(sp, (i / N) * L, side * 0.55, D), p, 0.03, PEARL, DIM);
      }
    }
    for (let i = 3; i < N - 2; i += 3) this.beam('lumenRib', curve(i / N, -1), curve(i / N, 1), 0.06, PEARL, LIT);
    this.crown(this.at(sp, L / 2, 0, D + rise), 1.3, sp.x + sp.z);
  }
}
