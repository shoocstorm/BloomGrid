import { BoxGeometry, Color, InstancedMesh, Matrix4, RingGeometry, Vector3 } from 'three/webgpu';
import type { GameContext, GameModule } from '@/game/context';
import { getMaterial } from '@/render/materials/library';
import { GeoBuilder, tf } from '@/render/bake';
import { RISE_PER_UNIT, type Rising } from '@/modules/construction/BuildingRenderer';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import './rising.css';

declare module '@/core/EventBus' {
  interface GameEvents {
    /** A newly placed building's last piece landed (D-118): the juice module celebrates it. */
    'building:ready': { eid: number };
  }
}

/**
 * Build progress (D-091): a newly placed building rises floor by floor over a few seconds, so the player should see
 * that it is under way and when it will stand. While it rises the lot shows:
 *
 * - a **blueprint**: the finished volume outlined in dim lines, so the final size is clear from the first frame;
 * - **scaffold posts** at its corners, growing with the construction front;
 * - a bright **scan frame** riding the front itself (where pieces are popping in, `RISE_PER_UNIT`);
 * - a **tag** over the roof: a progress ring, the building's name, the stage (foundations, walls, finishing) and
 *   the seconds left; it turns to "Ready" when the last piece lands, then everything fades.
 *
 * The timeline is the renderer's own (`BuildingRenderer.rising`), so the indicator ends when the building does.
 * Two instanced meshes on the unlit `beacon` material, posed only while something rises; DOM updates at ~5 Hz
 * (the ring eases between them in CSS), the tag's position every frame (a transform).
 */

const MAX = 8;
/** Beams per build in each mesh: 4 posts + 4 frame sides. */
const PER = 8;
/** Seconds the frame takes to fade once the building stands; the tag stays a little longer. */
const FADE = 0.8;
const TAG_HOLD = 1.6;
const OUTSET = 0.18;
/** Landing (D-121): seconds a finished building's ground ripple and dust ring take to sweep out and fade. */
const LAND = 1.1;
const RIPPLE = new Color(0x9ffff0);
const DUST = new Color(0xe8d6b0);

function beam(color: number, glow: number) {
  return new GeoBuilder().add(new BoxGeometry(1, 1, 1), tf(0, 0, 0), color, glow).build();
}

interface Build {
  eid: number;
  rise: Rising;
  name: string;
  t: number;
  tag: HTMLElement;
  ring: SVGCircleElement;
  stage: HTMLElement;
  left: HTMLElement;
  shown: string;
  ready: boolean;
}

const STAGES: [number, string][] = [
  [0.22, 'Laying foundations'],
  [0.75, 'Raising the frame'],
  [1, 'Finishing touches'],
];
const RING = 2 * Math.PI * 15;
const SVG = 'http://www.w3.org/2000/svg';

class RisingFx {
  private bright: InstancedMesh;
  private ghost: InstancedMesh;
  /** Landing rings: a bright ground ripple and a slower, warm dust ring per finished build. */
  private land: InstancedMesh;
  private builds: Build[] = [];
  private layer = h('div', { class: 'rise-tags' });
  private m = new Matrix4();
  private l = new Matrix4();
  private v = new Vector3();
  private c = new Color();
  private ndc = new Vector3();
  private warm = 3;
  private slow = 0;
  /** Lowest screen y a tag's foot may sit at: clear of the top bar (re-read at the text rate). */
  private minY = 0;

  constructor(private ctx: GameContext) {
    const mat = getMaterial('beacon');
    this.bright = new InstancedMesh(beam(0x9ffff0, 5), mat, MAX * PER);
    this.ghost = new InstancedMesh(beam(0x24857a, 0), mat, MAX * PER);
    const ring = new GeoBuilder();
    ring.add(new RingGeometry(0.9, 1, 48, 1).rotateX(-Math.PI / 2), tf(0, 0, 0), 0xffffff, 3);
    this.land = new InstancedMesh(ring.build(), getMaterial('land-ring'), MAX * 2);
    for (const o of [this.bright, this.ghost, this.land]) {
      o.frustumCulled = false;
      o.castShadow = o.receiveShadow = false;
      o.name = 'rising';
      // One zero-size instance for the first frames, so the pipelines compile in the boot warm-up.
      o.count = 1;
      o.setMatrixAt(0, new Matrix4().makeScale(1e-4, 1e-4, 1e-4));
      ctx.scene.add(o);
    }
    // Instance colours from the start, so the warm-up builds the shader the landing uses.
    this.land.setColorAt(0, new Color(0, 0, 0));
    ctx.hud.append(this.layer);
    const { bus } = ctx;
    bus.on('building:added', ({ eid }) => !ctx.loading && this.start(eid));
    bus.on('building:removed', ({ eid }) => this.drop((b) => b.eid === eid));
    bus.on('city:reset', () => this.drop(() => true));
  }

  private start(eid: number): void {
    const rise = this.ctx.services.get('construction').renderer.rising(eid);
    if (!rise) return;
    this.drop((b) => b.eid === eid);
    if (this.builds.length >= MAX) return;
    const ring = document.createElementNS(SVG, 'circle');
    for (const [k, v] of Object.entries({ cx: 18, cy: 18, r: 15, class: 'fg', 'stroke-dasharray': RING, 'stroke-dashoffset': RING }))
      ring.setAttribute(k, String(v));
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.setAttribute('class', 'ring');
    const track = document.createElementNS(SVG, 'circle');
    for (const [k, v] of Object.entries({ cx: 18, cy: 18, r: 15, class: 'bg' })) track.setAttribute(k, String(v));
    svg.append(track, ring);
    const stage = h('span', { class: 'rise-stage' });
    const left = h('span', { class: 'rise-left' });
    const name = this.ctx.city.buildingDef(eid).name;
    const tag = h(
      'div',
      { class: 'rise-tag' },
      h('div', { class: 'rise-ring' }, svg, icon('build'), icon('sparkle')),
      h('div', { class: 'rise-text' }, h('b', {}, name), h('span', { class: 'rise-sub' }, stage, left)),
    );
    this.layer.append(tag);
    this.builds.push({ eid, rise, name, t: 0, tag, ring, stage, left, shown: '', ready: false });
  }

  private drop(which: (b: Build) => boolean): void {
    this.builds = this.builds.filter((b) => {
      if (!which(b)) return true;
      b.tag.remove();
      return false;
    });
  }

  update(dt: number): void {
    if (this.warm > 0 && --this.warm === 0) this.bright.count = this.ghost.count = this.land.count = 0;
    if (!this.builds.length) return;
    const text = (this.slow -= dt) <= 0;
    if (text) {
      this.slow = 0.2;
      // The top bar, plus the folded sheets' chips under it on phones.
      let top = 0;
      for (const el of document.querySelectorAll('#hud .topbar, #hud .collapsed')) {
        const r = el.getBoundingClientRect();
        if (r.height && r.bottom < innerHeight * 0.3) top = Math.max(top, r.bottom);
      }
      this.minY = top + 56;
    }
    const dist = this.ctx.cameraCtl.distance;
    // A line a pixel or two wide at any zoom.
    const th = Math.max(0.05, dist * 0.0016);
    let nb = 0;
    let ng = 0;
    let nl = 0;
    const W = innerWidth;
    const H = innerHeight;
    const live = this.ctx.cameraCtl.enabled;
    for (const b of this.builds) {
      b.t += dt;
      const { bounds: bd, base, seconds } = b.rise;
      const k = Math.min(1, b.t / seconds);
      const done = b.t >= seconds;
      if (done && !b.ready) {
        b.ready = true;
        this.ctx.bus.emit('building:ready', { eid: b.eid });
      }
      const fade = done ? Math.max(0, 1 - (b.t - seconds) / FADE) : 1;
      const top = Math.max(bd.top, 0.4);
      // The front: where pieces are growing in now (they start at y × RISE_PER_UNIT and take a moment to swell).
      const front = done ? top + (1 - fade) * 0.6 : Math.min(top, Math.max(0, (b.t - 0.3) / RISE_PER_UNIT));
      const [x0, x1, z0, z1] = [bd.minX - OUTSET, bd.maxX + OUTSET, bd.minZ - OUTSET, bd.maxZ + OUTSET];
      const t = th * fade;
      if (t > 1e-3) {
        const corners: [number, number][] = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]];
        const rect = (mesh: InstancedMesh, i: number, y: number, w: number) => {
          i = this.put(mesh, i, base, (x0 + x1) / 2, y, z0, x1 - x0 + w, w, w);
          i = this.put(mesh, i, base, (x0 + x1) / 2, y, z1, x1 - x0 + w, w, w);
          i = this.put(mesh, i, base, x0, y, (z0 + z1) / 2, w, w, z1 - z0 + w);
          return this.put(mesh, i, base, x1, y, (z0 + z1) / 2, w, w, z1 - z0 + w);
        };
        // Scaffold posts up to the front, the scan frame on it; the blueprint above.
        for (const [x, z] of corners) nb = this.put(this.bright, nb, base, x, front / 2, z, t, Math.max(t, front), t);
        nb = rect(this.bright, nb, front, t * 1.8);
        if (!done) {
          for (const [x, z] of corners) ng = this.put(this.ghost, ng, base, x, (front + top) / 2, z, t * 0.6, Math.max(t, top - front), t * 0.6);
          ng = rect(this.ghost, ng, top, t * 0.6);
        }
      }

      // Landing: once it stands, a ripple and a dust ring sweep out over the ground from the footprint.
      if (done && b.t - seconds < LAND) {
        const u = (b.t - seconds) / LAND;
        const ease = 1 - (1 - u) ** 3;
        const r0 = Math.max(x1 - x0, z1 - z0) * 0.55;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const thin = (1 - u) * 0.9 + 0.1;
        nl = this.ring(nl, base, cx, cz, r0 + ease * (r0 + 3), thin, RIPPLE, 1 - u);
        nl = this.ring(nl, base, cx, cz, r0 + ease * (r0 * 0.6 + 1.5), thin * 1.6, DUST, (1 - u) * 0.7);
      }

      // The tag, over the roof.
      const e = base.elements;
      this.ndc.set(e[12]!, e[13]! + Math.max(top, b.rise.height) + 1, e[14]!).project(this.ctx.camera);
      const vis = live && this.ndc.z < 1 && Math.abs(this.ndc.x) < 1.05 && Math.abs(this.ndc.y) < 1.05;
      b.tag.classList.toggle('off', !vis);
      if (vis) b.tag.style.transform = `translate3d(${((this.ndc.x + 1) * W) / 2}px, ${Math.max(this.minY, ((1 - this.ndc.y) * H) / 2)}px, 0)`;
      if (text) {
        b.ring.setAttribute('stroke-dashoffset', String(RING * (1 - k)));
        const stage = done ? 'Ready' : STAGES.find(([at]) => k < at)![1];
        if (stage !== b.shown) {
          b.shown = stage;
          setText(b.stage, stage);
          b.tag.classList.toggle('done', done);
        }
        setText(b.left, done ? '' : `${Math.max(1, Math.ceil(seconds - b.t))}s`);
      }
    }
    this.bright.count = nb;
    this.ghost.count = ng;
    this.land.count = nl;
    if (nl > 0) {
      this.land.instanceMatrix.needsUpdate = true;
      if (this.land.instanceColor) this.land.instanceColor.needsUpdate = true;
    }
    this.bright.instanceMatrix.needsUpdate = nb > 0;
    this.ghost.instanceMatrix.needsUpdate = ng > 0;
    this.drop((b) => b.t > b.rise.seconds + TAG_HOLD);
  }

  /**
   * Writes a flat ring of radius `r` just above the lot, `w` thick-ish (thicker rings sit a hair lower so they
   * don't z-fight), tinted `col` × `a` (the material is additive: darker = fainter).
   */
  private ring(i: number, base: Matrix4, x: number, z: number, r: number, w: number, col: Color, a: number): number {
    this.l.makeScale(r, 1, r).setPosition(this.v.set(x, 0.06 + w * 0.01, z));
    this.land.setMatrixAt(i, this.m.multiplyMatrices(base, this.l));
    this.land.setColorAt(i, this.c.copy(col).multiplyScalar(Math.max(0, a)));
    return i + 1;
  }

  /** Writes a beam (local box centred at x, y, z with size sx, sy, sz, in the lot's frame) and returns the next slot. */
  private put(mesh: InstancedMesh, i: number, base: Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number): number {
    this.l.makeScale(sx, sy, sz).setPosition(this.v.set(x, y, z));
    mesh.setMatrixAt(i, this.m.multiplyMatrices(base, this.l));
    return i + 1;
  }
}

/** Under-construction indicator for newly placed buildings (see `RisingFx`). */
export const risingModule: GameModule = {
  id: 'rising',
  deps: ['construction'],
  init(ctx) {
    const fx = new RisingFx(ctx);
    ctx.systems.add({ id: 'rising', phase: 'sync', order: 50, update: (_c, f) => fx.update(f.dt) });
  },
};
