import { Building, Greenery, Problem, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { CATEGORY_ICONS, CATEGORY_LABELS, ZONES, type BuildingCategory, type BuildingDef } from '@/content/types';
import { NO_ENTITY } from '@/sim/Grid';
import { idForSelection } from '@/sim/inventory';
import { RESPONSE_COST, fireAt, isRuined, repairCost } from '@/sim/hazards';
import type { GameContext, GameModule } from '@/game/context';
import { isCompact, isTouchDevice, onCompactChange } from '@/platform/device';
import { h, setText } from './dom';
import { icon } from './icons';
import './styles.css';

const fmt = (n: number) => Math.round(n).toLocaleString();

function timeLabel(t: number, day: number, short: boolean): string {
  const mins = Math.floor(t * 24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return short ? `D${day} ${hh}:${mm}` : `Day ${day} · ${hh}:${mm}`;
}

function tags(def: BuildingDef): HTMLElement {
  const s = def.stats;
  const t = h('div', { class: 'tags' });
  const add = (name: string, v: number, invert = false) => {
    if (!v) return;
    t.append(h('span', { class: `tag ${(invert ? v > 0 : v < 0) ? 'neg' : ''}` }, icon(name), `${v > 0 ? '+' : ''}${v}`));
  };
  add('energy', s.energy);
  add('eco', s.eco);
  add('happy', s.happiness);
  add('people', s.population);
  add('jobs', s.jobs);
  add('pollution', s.pollution, true);
  return t;
}

class Hud {
  private root: HTMLElement;
  /** Right-hand panel column (info, advisor, help…), stacked without overlap. */
  right!: HTMLElement;
  /** Top-bar action buttons; modules may append their own (the assistant's launcher). */
  actions!: HTMLElement;
  /** The central stats panel; modules may prepend a control (the city map button). */
  stats!: HTMLElement;
  private statEls = new Map<string, { el: HTMLElement; v: HTMLElement; sub: HTMLElement }>();
  /** Panels that become exclusive sheets on phones (see `sheet`). */
  private sheets: HTMLElement[] = [];
  private timeEl!: HTMLElement;
  private speedBtns: HTMLButtonElement[] = [];
  private toolBtns = new Map<string, HTMLElement>();
  private cards = new Map<string, HTMLElement>();
  /** Building cards of the open category, and the tool/category bar (a console may adopt both). */
  tray!: HTMLElement;
  toolbar!: HTMLElement;
  private dock!: HTMLElement;
  /** The toolbar's row; modules may add a button beside it (Flora's, on phones). */
  dockRow!: HTMLElement;
  private category: BuildingCategory | null = null;
  private info!: HTMLElement;
  private infoBody!: HTMLElement;
  private selected: number | null = null;
  private tooltip!: HTMLElement;
  private toasts!: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private happyMeter!: HTMLElement;
  private readout!: { pos: HTMLElement; hdg: HTMLElement; alt: HTMLElement; sim: HTMLElement; fps: HTMLElement };
  /** Telemetry strip; the City Pulse panel adopts it as its footer when present. */
  readoutEl!: HTMLElement;
  private help!: HTMLElement;
  private timer = 0;

  constructor(private ctx: GameContext) {
    this.root = ctx.hud;
    this.buildTopBar();
    this.buildDock();
    this.buildReadout();
    this.buildInfo();
    this.tooltip = h('div', { class: 'tooltip panel hidden' });
    this.toasts = h('div', { class: 'toasts' });
    this.help = this.welcome();
    this.right = h('div', { class: 'rightcol' });
    this.root.append(this.tooltip, this.toasts, this.right);
    this.right.append(this.info, this.help);
    // Phones have no hover: the tool hint sits in the dock above the tray instead of at the cursor.
    const placeTooltip = (compact: boolean) => (compact ? this.dock.prepend(this.tooltip) : this.root.append(this.tooltip));
    placeTooltip(isCompact());
    onCompactChange(placeTooltip);
    setTimeout(() => this.help.classList.add('hidden'), 25_000);

    const { bus } = ctx;
    // On phones a tap on the city folds every open sheet away (and the welcome card).
    ctx.renderer.domElement.addEventListener('pointerdown', () => {
      if (!document.body.classList.contains('compact')) return;
      for (const el of this.sheets) el.classList.add('collapsed');
      this.help.classList.add('hidden');
    });
    bus.on('tool:changed', ({ id }) => this.syncTools(id));
    bus.on('tool:tooltip', ({ text, tone }) => {
      this.tooltip.classList.toggle('hidden', !text);
      if (text) {
        setText(this.tooltip, text);
        this.tooltip.classList.toggle('bad', tone === 'bad');
      }
    });
    bus.on('toast', ({ text, tone, at }) => this.toast(text, tone, at));
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

  /**
   * The welcome card: a one-shot "steward link" reveal (emblem, title, staggered controls) so the first
   * seconds feel like taking the helm. Animations run once on transform/opacity only (§7½).
   */
  private welcome(): HTMLElement {
    const touch = isTouchDevice();
    const keys = (...k: string[]) => h('span', { class: 'wc-keys' }, ...k.map((x) => h('kbd', {}, x)));
    const row = (ico: string, label: string, hint: Node) =>
      h('div', { class: 'wc-row' }, icon(ico), h('span', { class: 'wc-label' }, label), hint);
    const say = (s: string) => h('span', { class: 'wc-hint' }, s);
    const rows = touch
      ? [
          row('select', 'Pan', say('drag')),
          row('rotate', 'Zoom · rotate', say('pinch · twist')),
          row('up', 'Tilt', say('two fingers')),
          row('eye', 'Inspect', say('tap')),
          row('build', 'Build', say('tap, tap again')),
        ]
      : [
          row('select', 'Pan', keys('WASD', 'drag')),
          row('rotate', 'Orbit', keys('Q', 'E', 'right-drag')),
          row('search', 'Zoom', keys('wheel')),
          row('undo', 'Undo', keys('⌘Z')),
          row('pause', 'Pause', keys('Space')),
          row('fast', 'Speed', keys('1', '2', '3')),
          row('chip', 'Perf · Debug', keys('F3', '`')),
        ];
    rows.forEach((r, i) => r.style.setProperty('--i', String(i)));
    const dismiss = () => this.help.classList.add('hidden');
    return h(
      'div',
      { class: 'help panel welcome' },
      h('div', { class: 'wc-aura' }),
      h('div', { class: 'wc-sheen' }),
      h(
        'div',
        { class: 'wc-head' },
        h('div', { class: 'wc-emblem' }, h('span', { class: 'wc-ring' }), h('span', { class: 'wc-gem' })),
        h(
          'div',
          {},
          h('div', { class: 'wc-eyebrow' }, h('i', { class: 'wc-led' }), 'Steward link · online'),
          h('div', { class: 'wc-title' }, 'BloomGrid'),
          h('div', { class: 'wc-tag' }, 'An island city that breathes. Keep it blooming.'),
        ),
      ),
      h('div', { class: 'wc-rule' }, h('span', {}, '01'), h('i'), h('span', {}, 'Controls')),
      h('div', { class: 'wc-rows' }, ...rows),
      h(
        'div',
        { class: 'wc-foot' },
        touch ? h('span') : h('span', { class: 'wc-hint' }, 'Hide ', h('kbd', {}, 'H')),
        h('button', { class: 'wc-go', onClick: dismiss }, 'Take the helm', icon('next')),
      ),
    );
  }

  /**
   * Registers a panel that folds with a `collapsed` class (city pulse, Flora-Net, lenses). On a
   * phone it starts folded, opening one folds the others, and a tap on the city folds them all.
   */
  sheet(el: HTMLElement): void {
    this.sheets.push(el);
    if (isCompact()) el.classList.add('collapsed');
    new MutationObserver(() => {
      if (el.classList.contains('collapsed') || !document.body.classList.contains('compact')) return;
      for (const o of this.sheets) if (o !== el) o.classList.add('collapsed');
      this.help.classList.add('hidden');
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  /** Where a stop sits on the sky-lane network (D-051): a hub's reach, or the hub a dock is linked to. */
  private skylaneLine(eid: number): string {
    const net = this.ctx.city.pulse.skylanes;
    const hub = net.hubs.findIndex((hh) => hh.eid === eid);
    if (hub >= 0) {
      const h = net.hubs[hub]!;
      const trunks = net.links.filter((l) => l.kind === 'trunk' && (l.a === hub || l.b === hub)).length;
      const rail = h.rail ? `, ${h.rail} Aeroline transfer${h.rail === 1 ? '' : 's'}` : '';
      return `⌬ Sky-lane ${h.central ? 'central hub' : 'hub'}: ${h.stations} dock${h.stations === 1 ? '' : 's'} linked, ${trunks} trunk${trunks === 1 ? '' : 's'} to other hubs${rail}`;
    }
    if (this.ctx.city.buildingDef(eid).transit?.rail) {
      const link = net.links.find((l) => l.kind === 'rail' && l.eid === eid);
      return link
        ? `⌬ Pod transfer: sky-lane pods from the ${this.ctx.city.buildingDef(net.hubs[link.b]!.eid).name} set riders down for the trains`
        : '⌬ No pod transfer: build a Pod Interchange or Skylane Nexus nearby so pod riders can change to the trains';
    }
    const spoke = net.links.find((l) => l.kind === 'spoke' && l.eid === eid);
    if (!spoke) return '⌬ Off the sky-lane network: build a Pod Interchange or Skylane Nexus nearby to link it (more riders)';
    const h = net.hubs[spoke.b]!;
    return `⌬ Linked to the ${this.ctx.city.buildingDef(h.eid).name}: pods route anywhere on the network`;
  }

  private toast(text: string, tone: 'ok' | 'bad' | 'info' = 'info', at?: { x: number; z: number }): void {
    // Tones are prefixed: a bare `info` class would pick up the inspector's `.info` layout (a bottom sheet on phones).
    // Located toasts (incidents) are buttons that fly there, and stay a little longer to be clicked.
    const t = at
      ? h(
          'button',
          {
            class: `toast panel tone-${tone} go`,
            title: 'Show me',
            onClick: () => (this.ctx.cameraCtl.flyTo(at.x, at.z, 36), t.remove()),
          },
          text,
          h('span', { class: 'toast-go' }, '⌖ Show'),
        )
      : h('div', { class: `toast panel tone-${tone}` }, text);
    this.toasts.append(t);
    setTimeout(() => t.remove(), at ? 5400 : 2900);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
  }

  private buildTopBar(): void {
    const { ctx } = this;
    this.timeEl = h('span', { class: 'time' });
    const seg = h('div', { class: 'seg' });
    [
      ['pause', 0],
      ['play', 1],
      ['fast', 3],
      ['fastest', 8],
    ].forEach(([name, speed]) => {
      const b = h('button', { title: speed ? `Speed ${speed}x` : 'Pause', 'aria-label': speed ? `Speed ${speed}x` : 'Pause', onClick: () => (ctx.engine.speed = speed as number) }, icon(name as string));
      this.speedBtns.push(b);
      seg.append(b);
    });
    const stats = (this.stats = h('div', { class: 'stats panel' }));
    const stat = (id: string, key: string, extra?: HTMLElement) => {
      const v = h('span');
      // Secondary part of the value (rate, capacity) that phones drop.
      const sub = h('span', { class: 'sub' });
      // "credits Credits" → icon + label; the label collapses on narrow screens, the icon and tooltip stay.
      const [name, ...rest] = key.split(' ');
      const label = rest.join(' ');
      const el = h('div', { class: `stat stat-${id}`, title: label }, h('span', { class: 'ki' }, icon(name!)), h('span', { class: 'k' }, label), h('span', { class: 'v' }, v, sub), extra ?? null);
      this.statEls.set(id, { el, v, sub });
      stats.append(el);
    };
    stat('credits', 'credits Credits');
    stat('pop', 'people Residents');
    stat('energy', 'energy Energy');
    stat('water', 'water Water');
    stat('eco', 'eco Eco');
    this.happyMeter = h('i');
    stat('happy', 'happy Harmony', h('div', { class: 'meter' }, this.happyMeter));

    const save = ctx.services.get('save');
    this.undoBtn = h('button', { class: 'icon-btn', title: 'Undo (⌘Z)', 'aria-label': 'Undo', onClick: () => ctx.commands.undo() }, icon('undo'));
    this.redoBtn = h('button', { class: 'icon-btn opt', title: 'Redo (⇧⌘Z)', 'aria-label': 'Redo', onClick: () => ctx.commands.redo() }, icon('redo'));
    const actions = (this.actions = h(
      'div',
      { class: 'actions panel' },
      this.undoBtn,
      this.redoBtn,
      h('button', { class: 'icon-btn', title: 'City dashboard (K)', 'aria-label': 'City dashboard', onClick: () => ctx.services.get('dashboard').toggle() }, icon('dashboard')),
      h('button', { class: 'icon-btn opt', title: 'Overview (O) · bookmarks: Alt+1–4 store, Shift+1–4 recall', 'aria-label': 'Overview', onClick: () => ctx.cameraCtl.overview() }, icon('overview')),
      h('button', { class: 'icon-btn', title: 'Save (⌘S)', onClick: () => void save.save() }, 'Save'),
      h('button', { class: 'icon-btn opt', title: 'Load (⌘L)', onClick: () => void save.load().then((ok) => ok || this.toast('No save yet', 'bad')) }, 'Load'),
    ));
    this.root.append(
      h(
        'div',
        { class: 'topbar' },
        h('div', { class: 'brand panel' }, h('span', { class: 'logo' }), h('b', {}, 'BloomGrid', h('span', { class: 'brand-sub' }, 'ISLAND OS · v12'))),
        h('div', { class: 'clock panel' }, this.timeEl, seg),
        stats,
        actions,
      ),
    );
  }

  /** Telemetry strip (bottom-left): camera focus coordinates, heading, altitude, sim rate, fps. */
  private buildReadout(): void {
    const cell = (label: string, cls = '') => {
      const b = h('b');
      const el = h('span', { class: cls }, `${label} `, b);
      return { el, b };
    };
    const pos = cell('POS');
    const hdg = cell('HDG');
    const alt = cell('ALT');
    const sim = cell('SIM', 'live');
    const fps = cell('FPS', 'opt');
    this.readout = { pos: pos.b, hdg: hdg.b, alt: alt.b, sim: sim.b, fps: fps.b };
    this.readoutEl = h('div', { class: 'readout panel' }, sim.el, pos.el, hdg.el, alt.el, fps.el);
    this.root.append(this.readoutEl);
  }

  private buildDock(): void {
    const { ctx } = this;
    const construction = ctx.services.get('construction');
    this.tray = h('div', { class: 'tray panel hidden' });
    const toolbar = (this.toolbar = h('div', { class: 'toolbar panel' }));
    const toolBtn = (id: string, glyph: string, label: string, key: string | undefined, onClick: () => void) => {
      const b = h('button', { class: 'tool', title: label, onClick }, h('span', { class: 'g' }, icon(id, glyph)), h('span', { class: 'l' }, label), key ? h('kbd', {}, key) : null);
      this.toolBtns.set(id, b);
      toolbar.append(b);
    };
    for (const id of ['select', 'road', 'channel', 'bulldoze', 'retrofit', 'mist', 'weave', 'reclaim']) {
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
    // Category hotkeys: 4–9 then 0 (1–3 set the speed); later categories are click-only.
    const catKey = (i: number) => (i < 6 ? String(i + 4) : i === 6 ? '0' : undefined);
    cats.forEach((cat, i) => {
      toolBtn(`cat:${cat}`, CATEGORY_ICONS[cat], CATEGORY_LABELS[cat], catKey(i), () => {
        this.category = this.category === cat ? null : cat;
        this.renderTray();
        if (this.category) {
          const first = buildings.all().find((b) => b.category === cat)!;
          construction.startBuilding(first.id);
        } else ctx.tools.setActive('select');
      });
    });
    ctx.input.onKey((e) => {
      const i = cats.findIndex((_, k) => catKey(k) === e.key);
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && i >= 0) {
        (this.toolBtns.get(`cat:${cats[i]}`) as HTMLButtonElement).click();
        return true;
      }
      return false;
    });
    this.dockRow = h('div', { class: 'dock-row' }, toolbar);
    this.dock = h('div', { class: 'dock' }, this.tray, this.dockRow);
    this.root.append(this.dock);
  }

  private renderTray(): void {
    const { ctx } = this;
    this.tray.replaceChildren();
    this.cards.clear();
    this.tray.classList.toggle('hidden', !this.category);
    for (const [id, b] of this.toolBtns) if (id.startsWith('cat:')) b.classList.toggle('on', id === `cat:${this.category}`);
    if (!this.category) return;
    const construction = ctx.services.get('construction');
    // Rotation without a keyboard (R still works).
    this.tray.append(
      h('button', { class: 'card rotate', title: 'Rotate (R)', onClick: () => (construction.state.rot = (construction.state.rot + 1) % 4) }, h('div', { class: 'n' }, icon('rotate')), h('div', { class: 'c' }, 'Rotate')),
    );
    for (const def of buildings.all().filter((b) => b.category === this.category)) {
      const card = h(
        'button',
        { class: 'card', title: def.description, onClick: () => construction.startBuilding(def.id) },
        h('div', { class: 'n' }, def.name),
        h('div', { class: 'c' }, icon('credits'), ` ${fmt(def.stats.cost)} · ${def.footprint[0]}×${def.footprint[1]}`),
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
      { class: 'info panel holo hidden' },
      h('button', { class: 'icon-btn', style: 'float:right;margin:-8px -8px 0 0', 'aria-label': 'Close', onClick: () => this.select(null) }, icon('close')),
      this.infoBody,
    );
  }

  /** Readable object id and district above the inspector title; the id opens it in the dashboard inventory. */
  private idTag(id: string | null, district: string | null): HTMLElement {
    const zone = this.ctx.city.districts.find((d) => d.name === district)?.zone;
    const z = zone ? ZONES[zone] : null;
    return h(
      'div',
      { class: 'info-id' },
      id ? h('button', { class: 'info-id-btn', title: 'Show in the inventory (I)', onClick: () => this.ctx.services.get('dashboard').openInventory(id) }, id) : null,
      h('span', {}, district ?? 'Outskirts'),
      z ? h('span', { class: 'info-zone', style: `--c:#${z.color.toString(16).padStart(6, '0')}`, title: z.note }, `${z.icon} ${z.label}`) : null,
    );
  }

  /**
   * Inspector header in the welcome card's idiom: an emblem (pulsing ring around the object's icon),
   * the id/district eyebrow with a status LED, then the title. Entrance animations replay per selection.
   */
  private infoHead(glyph: Node, tag: HTMLElement, title: string, desc: string): HTMLElement[] {
    tag.prepend(h('i', { class: 'ix-led', 'data-led': '1', title: 'Status' }));
    return [
      h('div', { class: 'ix-aura' }),
      h(
        'div',
        { class: 'ix-head' },
        h('div', { class: 'ix-emblem' }, h('span', { class: 'ix-ring' }), h('span', { class: 'ix-gem' }, glyph)),
        h('div', { class: 'ix-titles' }, tag, h('h3', {}, title)),
      ),
      h('p', { class: 'ix-desc' }, desc),
    ];
  }

  /** Action row at the foot of the inspector: the object's own actions, then "Ask Flora". */
  private infoActions(id: string | null, ...actions: HTMLElement[]): HTMLElement {
    const ask =
      id && this.ctx.services.tryGet('assistant')
        ? h('button', { class: 'tool ix-ask', title: 'Ask the city assistant about it (U)', onClick: () => this.askAbout(id) }, h('span', { class: 'g' }, icon('sparkle')), 'Ask Flora')
        : null;
    return h('div', { class: 'ix-actions' }, ...actions, ask);
  }

  /** One vital as a tile: icon, mono value, label; `tone` colours it good or bad. */
  private vital(ico: string, label: string, value: string, tone: '' | 'good' | 'bad' = ''): HTMLElement {
    return h('div', { class: `ix-vital ${tone}` }, icon(ico), h('b', {}, value), h('span', {}, label));
  }

  private askAbout(id: string): void {
    const assistant = this.ctx.services.get('assistant');
    assistant.toggle(true);
    void assistant.ask(`Tell me about ${id}: how is it doing, and what should I do about any problems?`);
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
    const objId = idForSelection(city, { road });
    this.infoBody.replaceChildren(
      ...this.infoHead(
        icon('network'),
        this.idTag(objId, city.districtAt(road % city.grid.w, (road / city.grid.w) | 0)),
        'Highway network',
        'Power and water flow along connected Living Highways. Everything touching this network shares its supply.',
      ),
      h(
        'div',
        { class: 'ix-vitals' },
        this.vital('road', 'Tiles', fmt(tiles)),
        this.vital('house', 'Buildings', fmt(n.buildings)),
        this.vital('energy', 'Power', ratio(n.energyProduced, n.energyUsed), n.energyProduced >= n.energyUsed ? 'good' : 'bad'),
      ),
      row('Energy', `${fmt(n.energyProduced)} / ${fmt(n.energyUsed)}`),
      row('Water', `${fmt(n.waterProduced)} / ${fmt(n.waterUsed)} (${ratio(n.waterProduced, n.waterUsed)})`),
      this.infoActions(objId),
    );
    this.info.querySelector('[data-led]')?.classList.toggle('bad', n.energyProduced < n.energyUsed || n.waterProduced < n.waterUsed);
  }

  private select(eid: number | null): void {
    this.selected = eid === NO_ENTITY ? null : eid;
    this.hzKey = '';
    this.info.classList.toggle('hidden', this.selected === null);
    if (this.selected === null) return;
    const def = this.ctx.city.buildingDef(this.selected);
    const s = def.stats;
    const [bx, bz] = [Building.x[this.selected]! + Building.w[this.selected]! / 2, Building.z[this.selected]! + Building.d[this.selected]! / 2];
    const id = idForSelection(this.ctx.city, { eid: this.selected });
    const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`;
    this.infoBody.replaceChildren(
      ...this.infoHead(
        icon(`cat:${def.category}`, CATEGORY_ICONS[def.category]),
        this.idTag(id, this.ctx.city.districtAt(Math.floor(bx), Math.floor(bz))),
        def.name,
        def.description,
      ),
      h('div', { class: 'grow' }, h('div', { class: 'row' }, h('span', {}, 'Greenery'), h('b', { 'data-g': '1' }, '')), h('div', { class: 'meter' }, h('i', { 'data-gm': '1' }))),
      h(
        'div',
        { class: 'ix-vitals' },
        this.vital('energy', 'Energy', signed(s.energy), s.energy > 0 ? 'good' : s.energy < 0 ? 'bad' : ''),
        this.vital('eco', 'Ecology', signed(s.eco), s.eco > 0 ? 'good' : s.eco < 0 ? 'bad' : ''),
        this.vital('pollution', 'Pollution', String(s.pollution), s.pollution > 0 ? 'bad' : ''),
        this.vital('people', 'Residents', fmt(s.population)),
        this.vital('jobs', 'Jobs', fmt(s.jobs)),
      ),
      h('div', { class: 'svc', 'data-svc': '1' }),
      h('div', { class: 'info-hz', 'data-hz': '1' }),
      this.infoActions(
        id,
        h('button', { class: 'tool ix-raze', title: 'Bulldoze: return the lot to nature', onClick: () => this.ctx.tools.setActive('bulldoze') }, h('span', { class: 'g' }, icon('bulldoze')), 'Return to nature'),
      ),
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
        p & Problem.ON_FIRE && 'On fire: evacuated; dispatch crews before it spreads',
        p & Problem.RUINED && 'A ruin: burned out or shaken down; rebuild it',
      ].filter(Boolean) as string[];
      const occLabel = st.population > 0 ? 'Occupancy' : st.jobs > 0 ? 'Staffing' : '';
      const def = this.ctx.city.buildingDef(eid);
      const sym = def.symbiosis;
      const extra = [
        Building.level[eid] ? '✾ Bloom Retrofit: flowering façade, sunflower crown (eco ×1.5, uses less power and water)' : '',
        def.transit ? `⇶ Pod Dock: flying ${Math.round(Service.riders[eid]!)} of up to ${def.transit.riders} commuters from homes within ${def.transit.radius} tiles` : '',
        def.transit ? this.skylaneLine(eid) : '',
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
      this.infoBody.querySelector('[data-led]')?.classList.toggle('bad', issues.length > 0);
      this.hazardActions(eid);
    }
  }

  private hzKey = '';
  /** Dispatch / rebuild / repair for a burning, ruined or damaged building (D-050); rebuilt only on change. */
  private hazardActions(eid: number): void {
    const box = this.infoBody.querySelector<HTMLElement>('[data-hz]');
    if (!box) return;
    const { city, commands, bus } = this.ctx;
    const fire = fireAt(city, eid);
    const ruined = isRuined(city, eid);
    const cond = Service.condition[eid]!;
    const key = `${eid}|${fire ? `f${fire.id}${fire.crew}` : ruined ? 'r' : cond < 0.95 ? `d${repairCost(city, eid)}` : ''}`;
    if (key === this.hzKey) return;
    this.hzKey = key;
    const run = (type: string, payload: unknown) => {
      if (!commands.execute(type, payload)) bus.emit('toast', { text: 'Not enough credits', tone: 'bad' });
      this.hzKey = '';
    };
    const at = { x: Building.x[eid]!, z: Building.z[eid]! };
    const btn = fire
      ? fire.crew
        ? h('span', { class: 'info-hz-note' }, '🚒 Crews are fighting the fire')
        : h('button', { class: 'tool info-hz-btn', onClick: () => run('respond', { id: fire.id }) }, icon('fire'), ' Dispatch crews · ', icon('credits'), String(RESPONSE_COST))
      : ruined
        ? h('button', { class: 'tool info-hz-btn', onClick: () => run('repair', at) }, icon('wrench'), ' Rebuild · ', icon('credits'), repairCost(city, eid).toLocaleString())
        : cond < 0.95
          ? h('button', { class: 'tool info-hz-btn', onClick: () => run('repair', at) }, `⚒ Repair ${Math.round(cond * 100)}% → 100% · ◈${repairCost(city, eid).toLocaleString()}`)
          : null;
    box.replaceChildren(...(btn ? [btn] : []));
  }

  /** Per frame (cheap) + throttled stat refresh. */
  update(dt: number): void {
    const { ctx } = this;
    const p = ctx.input.pointer;
    // transform (not left/top) so moving the tooltip never triggers layout.
    if (!this.tooltip.classList.contains('hidden') && !document.body.classList.contains('compact')) this.tooltip.style.transform = `translate(${p.x + 16}px, ${p.y + 16}px)`;
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    const { city, engine } = ctx;
    const s = city.stats;
    setText(this.timeEl, timeLabel(city.timeOfDay, city.day, document.body.classList.contains('compact')));
    const speeds = [0, 1, 3, 8];
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', speeds[i] === engine.speed));
    const set = (id: string, text: string, bad = false, sub = '') => {
      const e = this.statEls.get(id)!;
      setText(e.v, text);
      setText(e.sub, sub);
      e.el.classList.toggle('bad', bad);
    };
    const net = s.income - s.upkeep;
    set('credits', fmt(city.credits), city.credits < 0 || net < 0, `  ${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(1)}/s`);
    set('pop', fmt(s.population), false, ` / ${fmt(s.capacity)}`);
    set('energy', `${fmt(s.energyProduced - s.energyUsed)}`, s.energyUsed > s.energyProduced);
    set('water', `${fmt(s.waterProduced - s.waterUsed)}`, s.waterUsed > s.waterProduced);
    set('eco', fmt(s.eco), s.eco < 0);
    set('happy', `${Math.round(s.happiness)}`);
    this.happyMeter.style.width = `${s.happiness}%`;
    document.body.classList.toggle('night', ctx.services.get('world').atmosphere.sunElevation < -0.02);
    this.syncCards();
    this.updateInfo();
    const cam = ctx.cameraCtl;
    const r = this.readout;
    setText(r.pos, `${cam.target.x.toFixed(1).padStart(5, '0')}E ${cam.target.z.toFixed(1).padStart(5, '0')}S`);
    setText(r.hdg, `${String(Math.round((((-cam.yaw * 180) / Math.PI) % 360) + 360) % 360).padStart(3, '0')}°`);
    setText(r.alt, `${(cam.distance * 11).toFixed(0)} m`);
    setText(r.sim, engine.speed ? `${engine.speed}×` : 'HOLD');
    setText(r.fps, `${Math.round(engine.fps)}`);
  }
}

export interface HudService {
  right: HTMLElement;
  /** Top-bar action buttons. */
  actions: HTMLElement;
  /** The toolbar's row, for a button beside it. */
  dockRow: HTMLElement;
  /** The central stats panel of the top bar. */
  stats: HTMLElement;
  /** Telemetry strip (sim rate, camera focus, heading, altitude, fps); a panel may adopt it. */
  readout: HTMLElement;
  /** Build tools and categories, and the open category's cards: the City Pulse console adopts them on desktops. */
  toolbar: HTMLElement;
  tray: HTMLElement;
  /** Register a panel that folds with a `collapsed` class; phones show these as exclusive sheets. */
  sheet(el: HTMLElement): void;
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
    ctx.services.provide('hud', { right: hud.right, actions: hud.actions, dockRow: hud.dockRow, stats: hud.stats, readout: hud.readoutEl, toolbar: hud.toolbar, tray: hud.tray, sheet: (el) => hud.sheet(el) });
    ctx.systems.add({ id: 'hud', phase: 'render', order: 100, update: (_c, f) => hud.update(f.dt) });
  },
};
