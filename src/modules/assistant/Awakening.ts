import { CylinderGeometry, Mesh, Quaternion, TorusGeometry, Vector3, type BufferGeometry } from 'three/webgpu';
import type { GameContext } from '@/game/context';
import { getMaterial } from '@/render/materials/library';
import { GeoBuilder, tf } from '@/render/bake';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';
import { h } from '@/ui/dom';

/**
 * Flora's awakening (D-092): the moment the "Wake Flora" project completes, played like the big deal it is.
 *
 * - **The city**: the camera comes down over the Data Spire; a column of light rises from it and two shockwave
 *   rings race out across the island (unlit `beacon` material, CPU-posed for a few seconds, then removed).
 * - **The screen**: a veil darkens the edges; her sigil assembles at the centre (the hex frame draws itself, the
 *   orbit traces round, six petals unfold one by one, the core flares with expanding rings and slow light rays);
 *   F-L-O-R-A rises letter by letter, boot lines tick in, and she greets the steward with live numbers. Then the
 *   sigil shrinks and flies into her orb, which flashes, and her console opens.
 * - **Sound**: `flora:awake` on the bus (the audio module plays a rising chord).
 *
 * CSS keyframes on transform / opacity / stroke-dashoffset only (§7½). Click, Enter, Space or Esc skips to the end.
 */

const DURATION = 6.8;
const OUT = 0.9;

function sigilSvg(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-20 -20 40 40');
  svg.setAttribute('class', 'fa-sigil');
  const hex = Array.from({ length: 6 }, (_, i) => `${(17 * Math.cos((Math.PI / 3) * i + Math.PI / 6)).toFixed(2)},${(17 * Math.sin((Math.PI / 3) * i + Math.PI / 6)).toFixed(2)}`).join(' ');
  const petals = Array.from(
    { length: 6 },
    (_, i) => `<g transform="rotate(${i * 60})"><ellipse class="p" style="--i:${i}" rx="3.1" ry="7.2" cx="0" cy="-6.2"/></g>`,
  ).join('');
  svg.innerHTML =
    `<polygon class="s-hex" pathLength="100" points="${hex}"/>` +
    `<circle class="s-orbit" pathLength="100" r="13.2"/>` +
    `<g class="s-petals">${petals}</g>` +
    `<circle class="s-flare" r="2.6"/><circle class="s-core" r="2.6"/>`;
  return svg;
}

function ringGeometry(): BufferGeometry {
  return new GeoBuilder().add(new TorusGeometry(1, 0.02, 3, 128), tf(0, 0, 0, Math.PI / 2), 0x5ff2da, 6).build();
}

function columnGeometry(): BufferGeometry {
  return new GeoBuilder()
    .add(new CylinderGeometry(0.35, 1, 1, 16, 1, true), tf(0, 0.5, 0), 0x14e0bd, 5)
    .add(new CylinderGeometry(0.12, 0.3, 1, 8, 1, true), tf(0, 0.5, 0), 0xe8fffa, 9)
    .build();
}

export class Awakening {
  private stage: HTMLElement | null = null;
  private meshes: { column: Mesh; rings: Mesh[] } | null = null;
  private at: { x: number; y: number; z: number; h: number } | null = null;
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

  /** Plays the ceremony; `done` runs as it ends (or is skipped). */
  play(lines: string[], greeting: string, orb: HTMLElement | null, done: () => void): void {
    if (this.stage) return;
    this.finish = done;
    this.spire();
    const name = h('div', { class: 'fa-name' }, ...'FLORA'.split('').map((c, i) => h('span', { style: `--i:${i}` }, c)));
    const stage = h(
      'div',
      { class: 'fa-stage', role: 'dialog', 'aria-label': 'Flora is waking', onClick: () => this.skip() },
      h('div', { class: 'fa-veil' }),
      h('div', { class: 'fa-rays' }),
      h(
        'div',
        { class: 'fa-core' },
        h('div', { class: 'fa-rings' }, h('i', {}), h('i', {}), h('i', {})),
        sigilSvg(),
      ),
      h(
        'div',
        { class: 'fa-text' },
        h('div', { class: 'fa-eyebrow' }, h('i', { class: 'hh-led' }), 'Civic intelligence · BG-01 · online'),
        name,
        h('div', { class: 'fa-lines' }, ...lines.map((l, i) => h('div', { style: `--i:${i}` }, h('span', {}, '›'), l))),
        h('div', { class: 'fa-greet' }, greeting),
      ),
      h('div', { class: 'fa-skip' }, 'Click to continue'),
    );
    // Where the sigil flies at the end: the orb (or straight up and away).
    const r = orb?.getBoundingClientRect();
    if (r && r.width) {
      stage.style.setProperty('--dx', `${r.left + r.width / 2 - innerWidth / 2}px`);
      stage.style.setProperty('--dy', `${r.top + r.height / 2 - innerHeight / 2}px`);
    }
    document.body.append(stage);
    document.body.classList.add('flora-waking');
    window.addEventListener('keydown', this.onKey, true);
    this.stage = stage;
    this.t = 0;
    this.outTimer = window.setTimeout(() => this.skip(), DURATION * 1000);
    this.ctx.bus.emit('flora:awake', undefined);
  }

  /** Ends the screen part: the sigil flies into the orb, the veil lifts. */
  private skip(): void {
    const stage = this.stage;
    if (!stage || stage.classList.contains('fa-out')) return;
    clearTimeout(this.outTimer);
    stage.classList.add('fa-out');
    window.removeEventListener('keydown', this.onKey, true);
    setTimeout(() => {
      stage.remove();
      document.body.classList.remove('flora-waking');
      this.stage = null;
      const done = this.finish;
      this.finish = null;
      done?.();
    }, OUT * 1000);
  }

  /** The Data Spire she wakes on: the camera goes there, and the column and shockwaves start from it. */
  private spire(): void {
    const city = this.ctx.city;
    const eid = city.buildingEntities().find((e) => city.buildingDef(e).id === 'data-spire');
    if (eid === undefined) return (this.at = null), undefined;
    const rec = city.buildingRecord(eid);
    const p = placeBuilding(city.grid, city.buildingDef(eid), rec.x, rec.z, rec.rot);
    const e = p.base.elements;
    this.at = { x: e[12]!, y: e[13]!, z: e[14]!, h: p.template.height };
    this.ctx.cameraCtl.locate(this.at.x, this.at.z, { size: 30, height: 40 });
    if (!this.meshes) {
      const mat = getMaterial('beacon');
      const ring = ringGeometry();
      this.meshes = { column: new Mesh(columnGeometry(), mat), rings: [new Mesh(ring, mat), new Mesh(ring, mat)] };
      for (const m of [this.meshes.column, ...this.meshes.rings]) {
        m.frustumCulled = false;
        m.castShadow = false;
        m.matrixAutoUpdate = false;
        m.name = 'awakening';
      }
    }
    for (const m of [this.meshes.column, ...this.meshes.rings]) this.ctx.scene.add(m);
  }

  /** Poses the column and shockwaves (render phase) while they run. */
  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const s = this.at;
    const m = this.meshes;
    if (s && m) {
      const t = this.t;
      const { q, v, sc } = this;
      // Column: shoots up over 1.2 s (after the camera has arrived), holds, then thins away by 6.5 s.
      const rise = Math.min(1, Math.max(0, (t - 1.2) / 1.2));
      const fade = 1 - Math.min(1, Math.max(0, (t - 5) / 1.5));
      const w = (1.6 + 0.4 * Math.sin(t * 7)) * fade * (0.4 + 0.6 * rise);
      m.column.visible = rise > 0 && fade > 0;
      m.column.matrix.compose(v.set(s.x, s.y + s.h * 0.6, s.z), q.identity(), sc.set(w, 4 + 260 * rise * rise, w));
      m.column.matrixWorldNeedsUpdate = true;
      // Shockwaves: two rings racing out over the island when the core flares.
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
      if (m) for (const o of [m.column, ...m.rings]) this.ctx.scene.remove(o);
    }
  }
}
