import { Mesh, Quaternion, TorusGeometry, Vector3, type BufferGeometry } from 'three/webgpu';
import type { GameContext } from '@/game/context';
import { getMaterial } from '@/render/materials/library';
import { GeoBuilder, tf } from '@/render/bake';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';

/**
 * A city moment (D-094): the full-screen ceremony first made for Flora's awakening (D-092), for any big event.
 *
 * - **The city**: optionally the camera comes down over where it happened and shockwaves race out from it, in the moment's colours (unlit `beacon`, CPU-posed for a few seconds, then removed).
 * - **The screen**: a veil, an emblem that assembles itself (hex frame and orbit draw, six petals unfold, then the
 *   centre: Flora's core, or the moment's icon, flares with rings and slow light rays), the title letter by letter,
 *   lines ticking in, a closing sentence; then the emblem flies away (into a target such as Flora's orb) and the
 *   veil lifts.
 * - **Scale**: `grand` (≈6.8 s, dark veil) or `minor` (≈4.2 s, lighter veil, everything quicker).
 *
 * CSS keyframes on transform / opacity / stroke-dashoffset only (§7½); timings scale with `--k`. Click, Enter, Space
 * or Esc skips to the end.
 */

export type MomentTone = 'bloom' | 'gold' | 'sky' | 'sea' | 'storm';
export type MomentSound = 'awake' | 'triumph' | 'wonder' | 'milestone' | 'weathered';

export interface MomentSpec {
  /** Stable id (dedupe in the queue). */
  id: string;
  scale: 'grand' | 'minor';
  tone: MomentTone;
  /** `flora` draws her sigil's core; anything else is an icon key (`icons.ts`) at the emblem's centre. */
  emblem: string;
  eyebrow: string;
  title: string;
  lines?: string[];
  /** The closing sentence. */
  sub?: string;
  /** Where it happened (tile coordinates): camera and shockwaves. `height` of what stands there, `size` to frame. */
  at?: { x: number; z: number; y?: number; height?: number; size?: number };
  /** Move the camera there (grand moments by default). */
  camera?: boolean;
  /** The emblem flies into this element at the end (else up and away). */
  flyTo?: HTMLElement | null;
  sound: MomentSound;
}

export const TONES: Record<MomentTone, { a: number; b: number; css: [string, string] }> = {
  bloom: { a: 0x14e0bd, b: 0xe8fffa, css: ['#5ff2da', '#8ef07a'] },
  gold: { a: 0xffb84a, b: 0xfff3d0, css: ['#ffcf6a', '#ff9f5a'] },
  sky: { a: 0x6aa8ff, b: 0xeef4ff, css: ['#8fc0ff', '#c8a8ff'] },
  sea: { a: 0x2fd0ff, b: 0xe6fbff, css: ['#5fd8ff', '#5ff2da'] },
  storm: { a: 0x9fc4d8, b: 0xffffff, css: ['#b8d4e4', '#ffcf6a'] },
};

const GRAND = 6.8;
const MINOR = 4.2;
const OUT = 0.9;

function emblemSvg(flora: boolean): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-20 -20 40 40');
  svg.setAttribute('class', `fa-sigil${flora ? '' : ' generic'}`);
  const hex = Array.from({ length: 6 }, (_, i) => `${(17 * Math.cos((Math.PI / 3) * i + Math.PI / 6)).toFixed(2)},${(17 * Math.sin((Math.PI / 3) * i + Math.PI / 6)).toFixed(2)}`).join(' ');
  const petals = Array.from({ length: 6 }, (_, i) => `<g transform="rotate(${i * 60})"><ellipse class="p" style="--i:${i}" rx="3.1" ry="7.2" cx="0" cy="-6.2"/></g>`).join('');
  svg.innerHTML =
    `<polygon class="s-hex" pathLength="100" points="${hex}"/>` +
    `<circle class="s-orbit" pathLength="100" r="13.2"/>` +
    `<g class="s-petals">${petals}</g>` +
    `<circle class="s-flare" r="2.6"/>${flora ? '<circle class="s-core" r="2.6"/>' : '<circle class="s-plate" r="6.4"/>'}`;
  return svg;
}

function ringGeometry(color: number): BufferGeometry {
  return new GeoBuilder().add(new TorusGeometry(1, 0.02, 3, 128), tf(0, 0, 0, Math.PI / 2), color, 6).build();
}

export class Ceremony {
  private stage: HTMLElement | null = null;
  private meshes = new Map<MomentTone, { rings: Mesh[] }>();
  private live: { rings: Mesh[] } | null = null;
  private at: { x: number; y: number; z: number } | null = null;
  private t = -1;
  private finish: (() => void) | null = null;
  private outTimer = 0;
  private q = new Quaternion();
  private v = new Vector3();
  private sc = new Vector3();
  private onKey = (e: KeyboardEvent) => {
    if (['Escape', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      this.skip();
    }
  };

  constructor(private ctx: GameContext) {}

  get playing(): boolean {
    return this.stage !== null;
  }

  /** Plays a moment; `done` runs as it ends (or is skipped). */
  play(m: MomentSpec, done: () => void): void {
    if (this.stage) return;
    this.finish = done;
    const minor = m.scale === 'minor';
    const k = minor ? 0.62 : 1;
    this.place(m);
    const words = m.title.toUpperCase();
    const name = h(
      'div',
      { class: 'fa-name', style: `--len:${words.length}` },
      ...[...words].map((c, i) => (c === ' ' ? h('span', { class: 'sp' }, ' ') : h('span', { style: `--i:${i}` }, c))),
    );
    const flora = m.emblem === 'flora';
    const tone = TONES[m.tone];
    const stage = h(
      'div',
      {
        class: `fa-stage tone-${m.tone}${minor ? ' fa-minor' : ''}`,
        style: `--k:${k};--ma:${tone.css[0]};--mb:${tone.css[1]}`,
        role: 'dialog',
        'aria-label': m.title,
        onClick: () => this.skip(),
      },
      h('div', { class: 'fa-veil' }),
      h('div', { class: 'fa-rays' }),
      h(
        'div',
        { class: 'fa-core' },
        h('div', { class: 'fa-rings' }, h('i', {}), h('i', {}), h('i', {})),
        emblemSvg(flora),
        flora ? null : h('div', { class: 'fa-icon' }, icon(m.emblem)),
      ),
      h(
        'div',
        { class: 'fa-text' },
        h('div', { class: 'fa-eyebrow' }, h('i', { class: 'hh-led' }), m.eyebrow),
        name,
        m.lines?.length ? h('div', { class: 'fa-lines' }, ...m.lines.slice(0, minor ? 2 : 6).map((l, i) => h('div', { style: `--i:${i}` }, h('span', {}, '›'), l))) : null,
        m.sub ? h('div', { class: 'fa-greet' }, m.sub) : null,
      ),
      h('div', { class: 'fa-skip' }, 'Click to continue'),
    );
    const r = m.flyTo?.getBoundingClientRect();
    if (r && r.width) {
      stage.style.setProperty('--dx', `${r.left + r.width / 2 - innerWidth / 2}px`);
      stage.style.setProperty('--dy', `${r.top + r.height / 2 - innerHeight / 2}px`);
    }
    document.body.append(stage);
    document.body.classList.add('moment-on');
    window.addEventListener('keydown', this.onKey, true);
    this.stage = stage;
    this.t = 0;
    this.outTimer = window.setTimeout(() => this.skip(), (minor ? MINOR : GRAND) * 1000);
    this.ctx.bus.emit('moment', { id: m.id, sound: m.sound });
  }

  /** Ends the screen part: the emblem flies off (or into its target), the veil lifts. */
  skip(): void {
    const stage = this.stage;
    if (!stage || stage.classList.contains('fa-out')) return;
    clearTimeout(this.outTimer);
    stage.classList.add('fa-out');
    window.removeEventListener('keydown', this.onKey, true);
    setTimeout(() => {
      stage.remove();
      document.body.classList.remove('moment-on');
      this.stage = null;
      const done = this.finish;
      this.finish = null;
      done?.();
    }, OUT * 1000);
  }

  /** The 3D part: the camera over the spot, and the shockwaves in the moment's colours. */
  private place(m: MomentSpec): void {
    this.at = null;
    if (!m.at) return;
    const g = this.ctx.city.grid;
    const y = m.at.y ?? Math.max(0, g.heightAt(m.at.x, m.at.z));
    this.at = { x: m.at.x, y, z: m.at.z };
    if (m.camera ?? m.scale === 'grand') this.ctx.cameraCtl.locate(m.at.x, m.at.z, { size: m.at.size ?? 30, height: Math.max(30, m.at.height ?? 0) });
    let set = this.meshes.get(m.tone);
    if (!set) {
      const mat = getMaterial('beacon');
      const tone = TONES[m.tone];
      const ring = ringGeometry(tone.a);
      set = { rings: [new Mesh(ring, mat), new Mesh(ring, mat)] };
      for (const o of set.rings) {
        o.frustumCulled = false;
        o.castShadow = false;
        o.matrixAutoUpdate = false;
        o.name = 'moment';
      }
      this.meshes.set(m.tone, set);
    }
    if (this.live) for (const o of this.live.rings) this.ctx.scene.remove(o);
    this.live = set;
    for (const o of set.rings) {
      o.visible = false;
      this.ctx.scene.add(o);
    }
  }

  /** Poses the shockwaves (render phase) while they run. */
  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const s = this.at;
    const m = this.live;
    if (s && m) {
      const t = this.t;
      const { q, v, sc } = this;
      m.rings.forEach((ring, k) => {
        const p = Math.min(1, Math.max(0, (t - 2 - k * 0.6) / 3.6));
        ring.visible = p > 0 && p < 1;
        const r = 3 + 170 * (1 - (1 - p) ** 2);
        ring.matrix.compose(v.set(s.x, s.y + 0.8, s.z), q.identity(), sc.set(r, Math.max(1, r / 20), r));
        ring.matrixWorldNeedsUpdate = true;
      });
    }
    if (this.t > 7.5) {
      this.t = -1;
      if (m) for (const o of m.rings) this.ctx.scene.remove(o);
      this.live = null;
    }
  }
}
