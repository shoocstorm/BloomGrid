import type { GameContext } from '@/game/context';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { closeX } from '@/ui/closeX';
import type { Lighting, Studio } from './Studio';
import type { Exhibit } from './index';

interface Actions {
  select(id: string): void;
  level(level: number): void;
  step(d: number): void;
  close(): void;
}

const LIGHTS: [Lighting, string, string][] = [
  ['day', 'sun', 'Day'],
  ['dusk', 'haze', 'Dusk'],
  ['night', 'moon', 'Night'],
];

/**
 * The gallery's screen: a hall list (search, hall chips) on the left, the exhibit's card on the right, a control
 * bar at the bottom, and a transparent stage between them that orbits (drag), pans (right-drag or Shift-drag),
 * zooms (wheel, pinch) and resets (double-click). On phones the list folds into a sheet behind the List button.
 * H hides everything but the model.
 */
export class GalleryView {
  readonly el: HTMLElement;
  private stage: HTMLElement;
  private list: HTMLElement;
  private search: HTMLInputElement;
  private chips: HTMLElement;
  private count: HTMLElement;
  private card: HTMLElement;
  private levels: HTMLElement;
  private lights: HTMLElement;
  private spinBtn: HTMLElement;
  private hall = '';
  private query = '';
  private current: Exhibit | null = null;
  private all: Exhibit[] = [];
  private items = new Map<string, HTMLElement>();
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;

  constructor(
    private ctx: GameContext,
    private studio: Studio,
    private act: Actions,
  ) {
    this.search = h('input', { class: 'gal-search', type: 'search', placeholder: 'Search models', 'aria-label': 'Search models' });
    this.search.addEventListener('input', () => {
      this.query = this.search.value.trim().toLowerCase();
      this.fillList();
    });
    this.chips = h('div', { class: 'gal-chips', role: 'tablist' });
    this.count = h('span', { class: 'gal-count' });
    this.list = h('div', { class: 'gal-list', role: 'listbox', 'aria-label': 'Models' });
    const rail = h(
      'aside',
      { class: 'gal-rail panel holo' },
      h(
        'div',
        { class: 'gal-head' },
        h('span', { class: 'gal-emblem' }, icon('gallery')),
        h('div', {}, h('div', { class: 'gal-eyebrow' }, h('i', { class: 'hh-led' }), 'BloomGrid archive'), h('div', { class: 'gal-title' }, 'Model Gallery')),
      ),
      h('label', { class: 'gal-find' }, icon('search'), this.search),
      this.chips,
      this.list,
      h('div', { class: 'gal-foot' }, this.count, h('span', {}, '← → browse · G / Esc close')),
    );

    this.card = h('section', { class: 'gal-card panel holo', 'aria-live': 'polite' });
    this.levels = h('div', { class: 'gal-seg', role: 'group', 'aria-label': 'Level' });
    this.lights = h(
      'div',
      { class: 'gal-seg', role: 'group', 'aria-label': 'Lighting' },
      ...LIGHTS.map(([id, ico, label]) =>
        h('button', { class: 'gal-opt', 'data-light': id, title: `${label} lighting (L cycles)`, onClick: () => this.setLight(id) }, icon(ico), h('span', {}, label)),
      ),
    );
    this.spinBtn = h('button', { class: 'gal-opt on', title: 'Turntable (Space)', onClick: () => this.toggleSpin() }, icon('rotate'), h('span', {}, 'Turn'));
    const bar = h(
      'div',
      { class: 'gal-bar panel' },
      h('button', { class: 'icon-btn gal-nav', title: 'Previous model (←)', 'aria-label': 'Previous model', onClick: () => this.act.step(-1) }, icon('left')),
      this.levels,
      this.lights,
      h('div', { class: 'gal-seg' }, this.spinBtn, h('button', { class: 'gal-opt', title: 'Reset view (R, double-click)', onClick: () => this.studio.reset() }, icon('locate'), h('span', {}, 'Reset'))),
      h('button', { class: 'gal-opt gal-hide', title: 'Hide the interface (H)', onClick: () => this.toggleBare() }, icon('eye'), h('span', {}, 'Clean view')),
      h('button', { class: 'icon-btn gal-nav', title: 'Next model (→)', 'aria-label': 'Next model', onClick: () => this.act.step(1) }, icon('right')),
    );
    const listBtn = h('button', { class: 'gal-listbtn', onClick: () => this.el.classList.toggle('list-open') }, icon('layers'), h('span', {}, 'Models'));
    const close = closeX('Close the gallery (Esc)', () => this.act.close());
    close.classList.add('gal-close');
    this.stage = h('div', { class: 'gal-stage', 'aria-hidden': 'true' });
    this.el = h(
      'div',
      { class: 'gallery hidden', role: 'dialog', 'aria-label': 'Model gallery' },
      this.stage,
      rail,
      this.card,
      bar,
      listBtn,
      close,
      h('div', { class: 'gal-bare-hint' }, 'H or tap to show the interface'),
    );
    document.body.append(this.el);
    this.bindStage();
  }

  open(all: Exhibit[]): void {
    this.all = all;
    this.fillChips();
    this.fillList();
    this.el.classList.remove('hidden', 'bare');
    this.markLight();
  }

  close(): void {
    this.el.classList.add('hidden');
    this.el.classList.remove('list-open');
  }

  /** The exhibits the list shows now (the hall and the search), for ← / →. */
  visible(all: Exhibit[]): Exhibit[] {
    const q = this.query;
    return all.filter((e) => (!this.hall || e.group === this.hall) && (!q || `${e.name} ${e.group}`.toLowerCase().includes(q)));
  }

  showExhibit(ex: Exhibit, level: number, all: Exhibit[]): void {
    this.all = all;
    this.current = ex;
    for (const [id, el] of this.items) el.classList.toggle('on', id === ex.id);
    this.items.get(ex.id)?.scrollIntoView({ block: 'nearest' });
    const i = all.indexOf(ex);
    const body: (Node | null)[] = [
      h('div', { class: 'gal-eyebrow' }, h('i', { class: 'hh-led' }), `${ex.group} · ${String(i + 1).padStart(2, '0')} / ${all.length}`),
      h('h1', { class: 'gal-name' }, ex.name, ex.hero ? h('span', { class: 'gal-star', title: 'Hero building' }, icon('star')) : null),
      ex.levels.length ? h('div', { class: 'gal-lvname' }, ex.levels[level]!) : null,
      h('p', { class: 'gal-blurb' }, ex.blurb),
      ex.facts.length
        ? h('dl', { class: 'gal-facts' }, ...ex.facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))
        : null,
    ];
    this.card.replaceChildren(...body.filter((n): n is Node => !!n));
    this.levels.replaceChildren(
      ...ex.levels.map((label, lv) =>
        h('button', { class: `gal-opt gal-lv${lv === level ? ' on' : ''}`, title: `${label} (${lv + 1})`, onClick: () => this.act.level(lv) }, h('b', {}, String(lv + 1)), h('span', {}, label.replace(/^Level \d$/, '').trim() || null)),
      ),
    );
    this.levels.classList.toggle('hidden', ex.levels.length < 2);
    this.el.classList.remove('list-open');
  }

  /** Keys while the gallery is open: it takes every key it knows (and swallows camera keys). */
  key(e: KeyboardEvent): boolean {
    const c = e.code;
    if (c === 'Escape') {
      if (this.el.classList.contains('bare')) this.el.classList.remove('bare');
      else this.act.close();
      return true;
    }
    if (c === 'KeyG') return this.act.close(), true;
    if (c === 'ArrowRight' || c === 'ArrowDown' || c === 'PageDown') return this.act.step(1), true;
    if (c === 'ArrowLeft' || c === 'ArrowUp' || c === 'PageUp') return this.act.step(-1), true;
    if (c === 'Space') return this.toggleSpin(), true;
    if (c === 'KeyR') return this.studio.reset(), true;
    if (c === 'KeyH') return this.toggleBare(), true;
    if (c === 'KeyL') {
      const i = LIGHTS.findIndex(([id]) => id === this.studio.lighting);
      return this.setLight(LIGHTS[(i + 1) % LIGHTS.length]![0]), true;
    }
    const n = /^Digit([1-3])$/.exec(c);
    if (n && this.current && this.current.levels.length > Number(n[1]) - 1) return this.act.level(Number(n[1]) - 1), true;
    // Swallow the city's hotkeys and camera keys while the gallery covers the screen.
    return !e.metaKey && !e.ctrlKey;
  }

  update(): void {
    this.spinBtn.classList.toggle('on', this.studio.turntable);
    // Fit the model between the list and the card (phones and clean view: the whole width).
    const w = window.innerWidth;
    const bare = this.el.classList.contains('bare') || document.body.classList.contains('compact');
    this.studio.frameWidth = bare ? 1 : Math.max(0.45, (w - 700) / w);
  }

  private setLight(l: Lighting): void {
    this.studio.lighting = l;
    this.markLight();
  }

  private markLight(): void {
    for (const b of this.lights.querySelectorAll<HTMLElement>('[data-light]')) b.classList.toggle('on', b.dataset.light === this.studio.lighting);
  }

  private toggleSpin(): void {
    this.studio.turntable = !this.studio.turntable;
    this.studio.idle = 0;
  }

  private toggleBare(): void {
    this.el.classList.toggle('bare');
  }

  private fillChips(): void {
    const halls = [...new Set(this.all.map((e) => e.group))];
    const chip = (id: string, label: string) =>
      h(
        'button',
        {
          class: `gal-chip${this.hall === id ? ' on' : ''}`,
          role: 'tab',
          onClick: () => {
            this.hall = this.hall === id ? '' : id;
            this.fillChips();
            this.fillList();
          },
        },
        label,
        h('span', {}, String(id ? this.all.filter((e) => e.group === id).length : this.all.length)),
      );
    this.chips.replaceChildren(chip('', 'All'), ...halls.map((g) => chip(g, g)));
  }

  private fillList(): void {
    this.items.clear();
    const shown = this.visible(this.all);
    const out: HTMLElement[] = [];
    let section = null as HTMLElement | null;
    for (const ex of shown) {
      // One section per hall, so each hall's sticky header gives way to the next.
      if (section?.dataset.group !== ex.group) {
        section = h('section', { class: 'gal-sec', 'data-group': ex.group }, h('div', { class: 'gal-group' }, ex.group));
        out.push(section);
      }
      const item = h(
        'button',
        { class: `gal-item${ex.id === this.current?.id ? ' on' : ''}`, role: 'option', onClick: () => this.act.select(ex.id) },
        h('span', { class: 'gal-iname' }, ex.name),
        ex.hero ? h('span', { class: 'gal-star' }, icon('star')) : null,
      );
      this.items.set(ex.id, item);
      section.append(item);
    }
    if (!shown.length) out.push(h('div', { class: 'gal-empty' }, 'No model matches.'));
    this.list.replaceChildren(...out);
    setText(this.count, `${shown.length} model${shown.length === 1 ? '' : 's'}`);
  }

  /** Orbit, pan and zoom on the stage; a tap in clean view brings the interface back. */
  private bindStage(): void {
    const s = this.stage;
    const st = this.studio;
    let moved = 0;
    const wake = () => {
      st.idle = 4;
      this.ctx.input.lastActivity = performance.now();
    };
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    s.addEventListener('pointerdown', (e) => {
      s.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (this.pointers.size === 2) this.pinch = this.spread();
      s.classList.add('dragging');
    });
    s.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      wake();
      if (this.pointers.size >= 2) {
        // Two fingers: pinch zooms, the pair's drift pans.
        const d = this.spread();
        if (this.pinch > 0 && d > 0) st.zoom = clamp(st.zoom * (this.pinch / d), 0.25, 4);
        this.pinch = d;
        this.panBy(dx / 2, dy / 2);
        return;
      }
      if (e.buttons & 2 || e.buttons & 4 || e.shiftKey) this.panBy(dx, dy);
      else {
        st.yaw -= dx * 0.008;
        st.pitch = clamp(st.pitch + dy * 0.006, -0.25, 1.45);
      }
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      if (!this.pointers.size) s.classList.remove('dragging');
      if (moved < 4 && this.el.classList.contains('bare') && e.type === 'pointerup') this.el.classList.remove('bare');
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        st.zoom = clamp(st.zoom * Math.exp(e.deltaY * (e.deltaMode === 1 ? 16 : 1) * 0.0012), 0.25, 4);
        wake();
      },
      { passive: false },
    );
    s.addEventListener('dblclick', () => st.reset());
  }

  private panBy(dx: number, dy: number): void {
    const st = this.studio;
    const k = (2.2 * st.zoom) / Math.max(320, window.innerHeight);
    st.pan.x = clamp(st.pan.x - dx * k, -2, 2);
    st.pan.y = clamp(st.pan.y + dy * k, -1.5, 2);
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
