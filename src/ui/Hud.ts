import { Building, Greenery, Problem, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { CATEGORY_ICONS, CATEGORY_LABELS, type BuildingCategory, type BuildingDef } from '@/content/types';
import { NO_ENTITY } from '@/sim/Grid';
import type { GameContext, GameModule } from '@/game/context';
import { h, setText } from './dom';
import './styles.css';

const fmt = (n: number) => Math.round(n).toLocaleString();

function timeLabel(t: number, day: number): string {
  const mins = Math.floor(t * 24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `Day ${day} · ${hh}:${mm}`;
}

function tags(def: BuildingDef): HTMLElement {
  const s = def.stats;
  const t = h('div', { class: 'tags' });
  const add = (label: string, v: number, invert = false) => {
    if (!v) return;
    t.append(h('span', { class: `tag ${(invert ? v > 0 : v < 0) ? 'neg' : ''}` }, `${label} ${v > 0 ? '+' : ''}${v}`));
  };
  add('⚡', s.energy);
  add('🌿', s.eco);
  add('☺', s.happiness);
  add('👥', s.population);
  add('⚒', s.jobs);
  add('☁', s.pollution, true);
  return t;
}

class Hud {
  private root: HTMLElement;
  /** Right-hand panel column (info, advisor, help…), stacked without overlap. */
  right!: HTMLElement;
  private statEls = new Map<string, { el: HTMLElement; v: HTMLElement }>();
  private timeEl!: HTMLElement;
  private speedBtns: HTMLButtonElement[] = [];
  private toolBtns = new Map<string, HTMLElement>();
  private cards = new Map<string, HTMLElement>();
  private tray!: HTMLElement;
  private category: BuildingCategory | null = null;
  private info!: HTMLElement;
  private infoBody!: HTMLElement;
  private selected: number | null = null;
  private tooltip!: HTMLElement;
  private toasts!: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private happyMeter!: HTMLElement;
  private help!: HTMLElement;
  private timer = 0;

  constructor(private ctx: GameContext) {
    this.root = ctx.hud;
    this.buildTopBar();
    this.buildDock();
    this.buildInfo();
    this.tooltip = h('div', { class: 'tooltip panel hidden' });
    this.toasts = h('div', { class: 'toasts' });
    this.help = h(
      'div',
      { class: 'help panel' },
      h('b', {}, 'Welcome to BloomGrid'),
      h('br'),
      'Pan ',
      h('kbd', {}, 'WASD'),
      ' / drag · Orbit ',
      h('kbd', {}, 'right-drag'),
      ' ',
      h('kbd', {}, 'Q E'),
      h('br'),
      'Zoom ',
      h('kbd', {}, 'wheel'),
      ' · Rotate ',
      h('kbd', {}, 'R'),
      ' · Undo ',
      h('kbd', {}, '⌘Z'),
      h('br'),
      'Pause ',
      h('kbd', {}, 'Space'),
      ' · Speed ',
      h('kbd', {}, '1 2 3'),
      ' · Perf ',
      h('kbd', {}, 'F3'),
      h('br'),
      'Debug ',
      h('kbd', {}, '`'),
      ' · Hide this ',
      h('kbd', {}, 'H'),
    );
    this.right = h('div', { class: 'rightcol' });
    this.root.append(this.tooltip, this.toasts, this.right);
    this.right.append(this.info, this.help);
    setTimeout(() => this.help.classList.add('hidden'), 25_000);

    const { bus } = ctx;
    bus.on('tool:changed', ({ id }) => this.syncTools(id));
    bus.on('tool:tooltip', ({ text, tone }) => {
      this.tooltip.classList.toggle('hidden', !text);
      if (text) {
        setText(this.tooltip, text);
        this.tooltip.classList.toggle('bad', tone === 'bad');
      }
    });
    bus.on('toast', ({ text, tone }) => this.toast(text, tone));
    bus.on('selection:changed', ({ eid, road }) => (road !== undefined ? this.selectNetwork(road) : this.select(eid)));
    bus.on('building:removed', ({ eid }) => eid === this.selected && this.select(null));
    bus.on('save:done', () => this.toast('City saved', 'ok'));
    bus.on('load:done', () => this.toast('City restored', 'ok'));
    ctx.commands.onChange = () => this.syncUndo();
    ctx.input.onKey((e) => {
      if (e.code === 'KeyH' && !e.metaKey && !e.ctrlKey) {
        this.help.classList.toggle('hidden');
        return true;
      }
      return false;
    });
    this.syncTools(ctx.tools.active?.id ?? 'select');
    this.syncUndo();
  }

  private toast(text: string, tone: 'ok' | 'bad' | 'info' = 'info'): void {
    const t = h('div', { class: `toast panel ${tone}` }, text);
    this.toasts.append(t);
    setTimeout(() => t.remove(), 2900);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
  }

  private buildTopBar(): void {
    const { ctx } = this;
    this.timeEl = h('span', { class: 'time' });
    const seg = h('div', { class: 'seg' });
    [
      ['❚❚', 0],
      ['▶', 1],
      ['▶▶', 3],
      ['▶▶▶', 8],
    ].forEach(([label, speed]) => {
      const b = h('button', { title: `Speed ${speed}x`, onClick: () => (ctx.engine.speed = speed as number) }, label as string);
      this.speedBtns.push(b);
      seg.append(b);
    });
    const stats = h('div', { class: 'stats panel' });
    const stat = (id: string, key: string, extra?: HTMLElement) => {
      const v = h('span', { class: 'v' });
      // "◈ Credits" → icon + label; the label collapses on narrow screens, the icon and tooltip stay.
      const [icon, ...rest] = key.split(' ');
      const label = rest.join(' ');
      const el = h('div', { class: 'stat', title: label }, h('span', { class: 'ki' }, icon!), h('span', { class: 'k' }, label), v, extra ?? null);
      this.statEls.set(id, { el, v });
      stats.append(el);
    };
    stat('credits', '◈ Credits');
    stat('pop', '👥 Residents');
    stat('energy', '⚡ Energy');
    stat('water', '💧 Water');
    stat('eco', '🌿 Eco');
    this.happyMeter = h('i');
    stat('happy', '☺ Harmony', h('div', { class: 'meter' }, this.happyMeter));

    const save = ctx.services.get('save');
    this.undoBtn = h('button', { class: 'icon-btn', title: 'Undo (⌘Z)', onClick: () => ctx.commands.undo() }, '↶');
    this.redoBtn = h('button', { class: 'icon-btn', title: 'Redo (⇧⌘Z)', onClick: () => ctx.commands.redo() }, '↷');
    const actions = h(
      'div',
      { class: 'actions panel' },
      this.undoBtn,
      this.redoBtn,
      h('button', { class: 'icon-btn', title: 'City dashboard (K)', onClick: () => ctx.services.get('dashboard').toggle() }, '▤'),
      h('button', { class: 'icon-btn', title: 'Overview (O) · bookmarks: Alt+1–4 store, Shift+1–4 recall', onClick: () => ctx.cameraCtl.overview() }, '⌖'),
      h('button', { class: 'icon-btn', title: 'Save (⌘S)', onClick: () => void save.save() }, 'Save'),
      h('button', { class: 'icon-btn', title: 'Load (⌘L)', onClick: () => void save.load().then((ok) => ok || this.toast('No save yet', 'bad')) }, 'Load'),
    );
    this.root.append(
      h(
        'div',
        { class: 'topbar' },
        h('div', { class: 'brand panel' }, h('span', { class: 'logo' }), h('b', {}, 'BloomGrid')),
        h('div', { class: 'clock panel' }, this.timeEl, seg),
        stats,
        actions,
      ),
    );
  }

  private buildDock(): void {
    const { ctx } = this;
    const construction = ctx.services.get('construction');
    this.tray = h('div', { class: 'tray panel hidden' });
    const toolbar = h('div', { class: 'toolbar panel' });
    const toolBtn = (id: string, glyph: string, label: string, key: string | undefined, onClick: () => void) => {
      const b = h('button', { class: 'tool', title: label, onClick }, h('span', { class: 'g' }, glyph), h('span', { class: 'l' }, label), key ? h('kbd', {}, key) : null);
      this.toolBtns.set(id, b);
      toolbar.append(b);
    };
    for (const id of ['select', 'road', 'channel', 'bulldoze', 'retrofit']) {
      const t = ctx.tools.get(id);
      if (!t) continue;
      toolBtn(id, t.icon, t.label, t.hotkey?.replace('Key', '').replace('Escape', 'Esc'), () => {
        this.category = null;
        this.renderTray();
        ctx.tools.setActive(id);
      });
    }
    toolbar.append(h('div', { class: 'sep' }));
    const present = new Set(buildings.all().map((b) => b.category));
    const cats = (Object.keys(CATEGORY_LABELS) as BuildingCategory[]).filter((c) => present.has(c));
    cats.forEach((cat, i) => {
      toolBtn(`cat:${cat}`, CATEGORY_ICONS[cat], CATEGORY_LABELS[cat], String(i + 1 + 3), () => {
        this.category = this.category === cat ? null : cat;
        this.renderTray();
        if (this.category) {
          const first = buildings.all().find((b) => b.category === cat)!;
          construction.startBuilding(first.id);
        } else ctx.tools.setActive('select');
      });
    });
    ctx.input.onKey((e) => {
      const n = Number(e.key);
      if (!e.metaKey && !e.ctrlKey && n >= 4 && n < 4 + cats.length) {
        (this.toolBtns.get(`cat:${cats[n - 4]}`) as HTMLButtonElement).click();
        return true;
      }
      return false;
    });
    this.root.append(h('div', { class: 'dock' }, this.tray, toolbar));
  }

  private renderTray(): void {
    const { ctx } = this;
    this.tray.replaceChildren();
    this.cards.clear();
    this.tray.classList.toggle('hidden', !this.category);
    for (const [id, b] of this.toolBtns) if (id.startsWith('cat:')) b.classList.toggle('on', id === `cat:${this.category}`);
    if (!this.category) return;
    const construction = ctx.services.get('construction');
    for (const def of buildings.all().filter((b) => b.category === this.category)) {
      const card = h(
        'button',
        { class: 'card', title: def.description, onClick: () => construction.startBuilding(def.id) },
        h('div', { class: 'n' }, def.name),
        h('div', { class: 'c' }, `◈ ${fmt(def.stats.cost)} · ${def.footprint[0]}×${def.footprint[1]}`),
        tags(def),
      );
      this.cards.set(def.id, card);
      this.tray.append(card);
    }
    this.syncCards();
  }

  private syncCards(): void {
    const st = this.ctx.services.get('construction').state;
    const building = this.ctx.tools.active?.id === 'build';
    for (const [id, c] of this.cards) {
      c.classList.toggle('on', building && st.def === id);
      c.classList.toggle('poor', buildings.get(id).stats.cost > this.ctx.city.credits);
    }
  }

  private syncTools(id: string): void {
    for (const [tid, b] of this.toolBtns) if (!tid.startsWith('cat:')) b.classList.toggle('on', tid === id);
    if (id !== 'build' && this.category) {
      this.category = null;
      this.renderTray();
    }
    if (id === 'build' && !this.category) {
      this.category = buildings.get(this.ctx.services.get('construction').state.def).category;
      this.renderTray();
    }
    this.syncCards();
    this.ctx.bus.emit('tool:tooltip', { text: null });
  }

  private syncUndo(): void {
    this.undoBtn.disabled = !this.ctx.commands.canUndo;
    this.redoBtn.disabled = !this.ctx.commands.canRedo;
  }

  private buildInfo(): void {
    this.infoBody = h('div');
    this.info = h(
      'div',
      { class: 'info panel hidden' },
      h('button', { class: 'icon-btn', style: 'float:right;margin:-8px -8px 0 0', onClick: () => this.select(null) }, '✕'),
      this.infoBody,
    );
  }

  /** Highway network ("district") inspector. */
  private selectNetwork(road: number): void {
    const { city } = this.ctx;
    this.selected = null;
    const id = city.networks.comp[road]!;
    const n = city.pulse.networks[id];
    this.info.classList.toggle('hidden', !n);
    if (!n) return;
    let tiles = 0;
    for (let i = 0; i < city.networks.comp.length; i++) if (city.networks.comp[i] === id) tiles++;
    const ratio = (p: number, u: number) => (u > 0 ? `${Math.round((p / u) * 100)}%` : '—');
    const row = (k: string, v: string | number) => h('div', { class: 'row' }, h('span', {}, k), h('b', {}, String(v)));
    this.infoBody.replaceChildren(
      h('h3', {}, `Highway network #${id + 1}`),
      h('p', {}, 'Power and water flow along connected Living Highways. Everything touching this network shares its supply.'),
      row('Highway tiles', fmt(tiles)),
      row('Connected buildings', fmt(n.buildings)),
      row('Energy', `${fmt(n.energyProduced)} / ${fmt(n.energyUsed)} (${ratio(n.energyProduced, n.energyUsed)})`),
      row('Water', `${fmt(n.waterProduced)} / ${fmt(n.waterUsed)} (${ratio(n.waterProduced, n.waterUsed)})`),
    );
  }

  private select(eid: number | null): void {
    this.selected = eid === NO_ENTITY ? null : eid;
    this.info.classList.toggle('hidden', this.selected === null);
    if (this.selected === null) return;
    const def = this.ctx.city.buildingDef(this.selected);
    const s = def.stats;
    const row = (k: string, v: string | number) => h('div', { class: 'row' }, h('span', {}, k), h('b', {}, String(v)));
    this.infoBody.replaceChildren(
      h('h3', {}, def.name),
      h('p', {}, def.description),
      h('div', { class: 'grow' }, h('div', { class: 'row' }, h('span', {}, 'Greenery'), h('b', { 'data-g': '1' }, '')), h('div', { class: 'meter' }, h('i', { 'data-gm': '1' }))),
      h('div', { class: 'svc', 'data-svc': '1' }),
      row('Energy', `${s.energy > 0 ? '+' : ''}${s.energy}`),
      row('Ecology', s.eco),
      row('Residents', s.population),
      row('Jobs', s.jobs),
      row('Pollution', s.pollution),
      h('button', { class: 'tool', style: 'margin-top:10px', onClick: () => this.ctx.tools.setActive('bulldoze') }, h('span', { class: 'g' }, '⌫'), 'Return to nature'),
    );
    this.updateInfo();
  }

  private updateInfo(): void {
    if (this.selected === null) return;
    const g = Greenery.value[this.selected]!;
    const label = this.infoBody.querySelector<HTMLElement>('[data-g]');
    const meter = this.infoBody.querySelector<HTMLElement>('[data-gm]');
    if (label) setText(label, `${Math.round(g * 100)}%`);
    if (meter) meter.style.width = `${g * 100}%`;
    const svc = this.infoBody.querySelector<HTMLElement>('[data-svc]');
    if (svc) {
      const eid = this.selected;
      const st = this.ctx.city.buildingDef(eid).stats;
      const p = Service.problems[eid]!;
      const issues = [
        p & Problem.NO_ROAD && 'No highway access: connect it to a Living Highway',
        p & Problem.NO_POWER && 'Brownout: the grid lacks power',
        p & Problem.NO_WATER && 'Dry taps: the network lacks water',
        p & Problem.UNSTAFFED && 'Understaffed: not enough workers',
      ].filter(Boolean) as string[];
      const occLabel = st.population > 0 ? 'Occupancy' : st.jobs > 0 ? 'Staffing' : '';
      const def = this.ctx.city.buildingDef(eid);
      const sym = def.symbiosis;
      const extra = [
        Building.level[eid] ? '✾ Bloom Retrofit: flowering façade, sunflower crown (eco ×1.5, uses less power and water)' : '',
        def.transit ? `⇶ Pod Dock: flying ${Math.round(Service.riders[eid]!)} of up to ${def.transit.riders} commuters from homes within ${def.transit.radius} tiles` : '',
        sym ? (Service.paired[eid] ? `✓ Symbiosis: ${sym.label}` : `✗ Unpaired: place a ${sym.partners.map((p) => buildings.get(p).name).join(' or ')} within ${sym.radius} tiles`) : '',
        `Bloom ${Math.round(Service.bloom[eid]! * 100)}% · Condition ${Math.round(Service.condition[eid]! * 100)}%`,
      ].filter(Boolean);
      const lines = [
        st.energy < 0 ? `Power ${Math.round(Service.power[eid]! * 100)}%` : '',
        st.water < 0 ? `Water ${Math.round(Service.water[eid]! * 100)}%` : '',
        occLabel ? `${occLabel} ${Math.round(Service.occupancy[eid]! * 100)}%` : '',
      ].filter(Boolean);
      setText(svc, [lines.join(' · '), ...extra, ...issues.map((i) => `⚠ ${i}`)].filter(Boolean).join('\n'));
      svc.classList.toggle('bad', issues.length > 0);
    }
  }

  /** Per frame (cheap) + throttled stat refresh. */
  update(dt: number): void {
    const { ctx } = this;
    const p = ctx.input.pointer;
    // transform (not left/top) so moving the tooltip never triggers layout.
    if (!this.tooltip.classList.contains('hidden')) this.tooltip.style.transform = `translate(${p.x + 16}px, ${p.y + 16}px)`;
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    const { city, engine } = ctx;
    const s = city.stats;
    setText(this.timeEl, timeLabel(city.timeOfDay, city.day));
    const speeds = [0, 1, 3, 8];
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', speeds[i] === engine.speed));
    const set = (id: string, text: string, bad = false) => {
      const e = this.statEls.get(id)!;
      setText(e.v, text);
      e.el.classList.toggle('bad', bad);
    };
    const net = s.income - s.upkeep;
    set('credits', `${fmt(city.credits)}  ${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(1)}/s`, city.credits < 0 || net < 0);
    set('pop', `${fmt(s.population)} / ${fmt(s.capacity)}`);
    set('energy', `${fmt(s.energyProduced - s.energyUsed)}`, s.energyUsed > s.energyProduced);
    set('water', `${fmt(s.waterProduced - s.waterUsed)}`, s.waterUsed > s.waterProduced);
    set('eco', fmt(s.eco), s.eco < 0);
    set('happy', `${Math.round(s.happiness)}`);
    this.happyMeter.style.width = `${s.happiness}%`;
    document.body.classList.toggle('night', ctx.services.get('world').atmosphere.sunElevation < -0.02);
    this.syncCards();
    this.updateInfo();
  }
}

export interface HudService {
  right: HTMLElement;
}

declare module '@/core/Services' {
  interface GameServices {
    hud: HudService;
  }
}

export const hudModule: GameModule = {
  id: 'hud',
  deps: ['construction', 'world'],
  init(ctx) {
    const hud = new Hud(ctx);
    ctx.services.provide('hud', { right: hud.right });
    ctx.systems.add({ id: 'hud', phase: 'render', order: 100, update: (_c, f) => hud.update(f.dt) });
  },
};
