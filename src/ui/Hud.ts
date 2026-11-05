import { netIncome } from '@/sim/finance';
import { MAX_ROAD_LEVEL, ROAD_CAPACITY, ROAD_LEVEL_NAMES, levelCounts, roadLevels, roadStretch, upgradeCost as roadUpgradeCost } from '@/sim/roads';
import { ROAD } from '@/sim/City';
import { Building, Problem, Service } from '@/ecs/components';
import { buildingExposure, type Exposure } from '@/sim/risk';
import { buildings } from '@/content';
import { CATEGORY_ICONS, ZONES } from '@/content/types';
import { NO_ENTITY } from '@/sim/Grid';
import { idForSelection } from '@/sim/inventory';
import { RESPONSE_COST, fireAt, isRuined, repairCost } from '@/sim/hazards';
import { DEMOLISH_REFUND } from '@/sim/commands';
import { MAX_TIER, ageDays, levels, renovateCost, upgradeBlocker, upgradeCost } from '@/sim/levels';
import { buildingReport, type BuildingReport, type FlowKey, type FlowLine } from '@/sim/buildingReport';
import { rulesFor } from '@/sim/consequences';
import { INDICATOR_NAMES as N } from '@/sim/indicators';
import type { GameContext, GameModule } from '@/game/context';
import { isCompact, isTouchDevice, onCompactChange } from '@/platform/device';
import { h, setText } from './dom';
import { icon } from './icons';
import './styles.css';

const fmt = (n: number) => Math.round(n).toLocaleString();
/** How many steps the status bar may shed to fit (see `fitStats`). */
const FIT_LEVELS = 7;

function timeLabel(t: number): string {
  const mins = Math.floor(t * 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Play speeds the speed chip steps through (Space pauses; 1–3 pick one). */
const SPEEDS = [1, 3, 8];

/**
 * Fits an inspector action row: full labels, then tighter buttons without prices (`snug`), then icons only
 * (`tight`). Labels and prices stay in each button's tooltip.
 */
function fitActions(row: HTMLElement): void {
  if (!row.clientWidth) return;
  const over = () => row.scrollWidth > row.clientWidth + 1;
  row.classList.remove('snug', 'tight');
  if (over()) row.classList.add('snug');
  if (over()) row.classList.add('tight');
}

class Hud {
  private root: HTMLElement;
  /** Right-hand panel column (info, advisor, help…), stacked without overlap. */
  right!: HTMLElement;
  /** Top-bar action buttons; modules may append their own (the assistant's launcher). */
  actions!: HTMLElement;
  /** Leading group of the actions panel: City Pulse, city map and fireworks buttons (modules add them). */
  readonly lead = h('div', { class: 'act-lead' });
  /** The central stats panel; modules may prepend a control (the city map button). */
  stats!: HTMLElement;
  private statEls = new Map<string, { el: HTMLElement; v: HTMLElement; sub: HTMLElement }>();
  /** Panels that become exclusive sheets on phones (see `sheet`). */
  private sheets: HTMLElement[] = [];
  /** The clock: a day dial (play / pause), the time and day, and one speed chip. */
  private clock!: { el: HTMLElement; time: HTMLElement; day: HTMLElement; dial: HTMLElement; main: HTMLButtonElement; speed: HTMLButtonElement; x: HTMLElement };
  /** The speed play resumes at (the chip shows it while paused). */
  private playSpeed = 1;
  private clockShown = { t: -1, speed: -1, play: -1 };
  /** Bottom dock: the tool hint on phones, the build sheet (phones) and the row below it. */
  dock!: HTMLElement;
  /** The dock's row; modules add a button to it (Flora's orb, the Build launcher on phones). */
  dockRow!: HTMLElement;
  private info!: HTMLElement;
  private infoBody!: HTMLElement;
  private stage!: HTMLElement;
  private stageName = h('b', { class: 'ix-stage-name' });
  private selected: number | null = null;
  /** A group selection (Ctrl/⌘-drag in Inspect): buildings of one type, D-070. */
  private group: number[] = [];
  private tooltip!: HTMLElement;
  private toasts!: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private happyMeter!: HTMLElement;
  private readout!: { pos: HTMLElement; hdg: HTMLElement; alt: HTMLElement; sim: HTMLElement; fps: HTMLElement };
  /** Telemetry strip; the City Pulse panel adopts it as its footer when present. */
  readoutEl!: HTMLElement;
  private timer = 0;

  constructor(private ctx: GameContext) {
    this.root = ctx.hud;
    this.buildTopBar();
    this.buildDock();
    this.buildReadout();
    this.buildInfo();
    this.tooltip = h('div', { class: 'tooltip panel hidden' });
    this.toasts = h('div', { class: 'toasts' });
    this.right = h('div', { class: 'rightcol' });
    this.root.append(this.tooltip, this.toasts, this.right);
    this.right.append(this.info);
    // Phones have no hover: the tool hint sits in the dock above the build sheet instead of at the cursor.
    const placeTooltip = (compact: boolean) => (compact ? this.dock.prepend(this.tooltip) : this.root.append(this.tooltip));
    placeTooltip(isCompact());
    onCompactChange(placeTooltip);

    const { bus } = ctx;
    // On phones a tap on the city folds every open sheet away.
    ctx.renderer.domElement.addEventListener('pointerdown', () => {
      if (!document.body.classList.contains('compact')) return;
      for (const el of this.sheets) el.classList.add('collapsed');
    });
    bus.on('tool:tooltip', ({ text, tone }) => {
      this.tooltip.classList.toggle('hidden', !text);
      if (text) {
        setText(this.tooltip, text);
        this.tooltip.classList.toggle('bad', tone === 'bad');
      }
    });
    bus.on('toast', ({ text, tone, at }) => this.toast(text, tone, at));
    bus.on('selection:changed', ({ eid, road, eids }) =>
      eids?.length ? this.selectGroup(eids) : road !== undefined ? this.selectNetwork(road) : this.select(eid),
    );
    bus.on('building:removed', ({ eid }) => {
      if (eid === this.selected) this.select(null);
      else if (this.group.includes(eid)) {
        const rest = this.group.filter((e) => e !== eid);
        if (rest.length) this.selectGroup(rest);
        else this.select(null);
      }
    });
    // Buildings that grew a level on their own, announced once per pulse (D-073).
    const grown: number[] = [];
    bus.on('building:tier', ({ eid, tier, paid }) => !paid && tier > 0 && grown.push(eid));
    bus.on('stats:updated', () => {
      if (!grown.length || ctx.loading) return void (grown.length = 0);
      const e = grown[0]!;
      const where = { x: Building.x[e]! + Building.w[e]! / 2, z: Building.z[e]! + Building.d[e]! / 2 };
      this.toast(grown.length === 1 ? `⬆ ${ctx.city.buildingDef(e).name} grew to level ${Building.tier[e]! + 1}` : `⬆ ${grown.length} buildings grew a level`, 'ok', where);
      grown.length = 0;
    });
    bus.on('save:done', () => this.toast('City saved', 'ok'));
    bus.on('load:done', () => this.toast('City restored', 'ok'));
    ctx.commands.onChange = () => this.syncUndo();
    ctx.input.onKey((e) => {
      // Delete (or ⌫) returns the selected building, or the selected group, to nature.
      if ((e.code === 'Delete' || e.code === 'Backspace') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (this.group.length) return this.razeGroup(), true;
        if (this.selected !== null) return this.raze(this.selected), true;
      }
      return false;
    });
    this.syncUndo();
  }

  /**
   * Registers a panel that folds with a `collapsed` class (the City Pulse console). On a phone it starts
   * folded, opening one folds the others, and a tap on the city folds them all.
   */
  sheet(el: HTMLElement): void {
    this.sheets.push(el);
    if (isCompact()) el.classList.add('collapsed');
    new MutationObserver(() => {
      if (el.classList.contains('collapsed') || !document.body.classList.contains('compact')) return;
      for (const o of this.sheets) if (o !== el) o.classList.add('collapsed');
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
            onClick: () => (this.ctx.cameraCtl.locate(at.x, at.z), t.remove()),
          },
          text,
          h('span', { class: 'toast-go' }, '⌖ Show'),
        )
      : h('div', { class: `toast panel tone-${tone}` }, text);
    this.toasts.append(t);
    setTimeout(() => t.remove(), at ? 5400 : 2900);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
  }

  /**
   * The clock: one button for the day (a dial whose sun or moon circles with the hour, play / pause in its centre,
   * the time and day beside it) and one speed chip (click: faster, right-click or wheel: slower; it starts play
   * when paused). Space and 1–3 still work from the keyboard.
   */
  private buildClock(): HTMLElement {
    const { engine } = this.ctx;
    const time = h('span', { class: 'time' });
    const day = h('span', { class: 'cl-day' });
    const dial = h('span', { class: 'cl-dial', 'aria-hidden': 'true' }, h('span', { class: 'cl-orbit' }), h('span', { class: 'cl-face' }));
    const main = h(
      'button',
      { class: 'cl-main', onClick: () => (engine.speed = engine.speed ? 0 : this.playSpeed) },
      dial,
      h('span', { class: 'cl-read' }, time, day),
    ) as HTMLButtonElement;
    const x = h('b', { class: 'cl-x' });
    const speed = h(
      'button',
      { class: 'cl-speed', onClick: () => this.stepSpeed(1, true) },
      x,
      h('span', { class: 'cl-pips', 'aria-hidden': 'true' }, ...SPEEDS.map(() => h('i'))),
    ) as HTMLButtonElement;
    speed.addEventListener('contextmenu', (e) => (e.preventDefault(), this.stepSpeed(-1)));
    speed.addEventListener('wheel', (e) => (e.preventDefault(), e.stopPropagation(), this.stepSpeed(e.deltaY < 0 ? 1 : -1)), { passive: false });
    const el = h('div', { class: 'clock panel' }, main, speed);
    this.clock = { el, time, day, dial, main, speed, x };
    return el;
  }

  /** One step up or down the play speeds (a click wraps from the top back to 1×); from a pause, the first step plays. */
  private stepSpeed(dir: 1 | -1, wrap = false): void {
    const { engine } = this.ctx;
    const i = Math.max(0, SPEEDS.indexOf(this.playSpeed)) + dir;
    const n = SPEEDS.length;
    if (engine.speed) this.playSpeed = SPEEDS[wrap ? (i + n) % n : Math.min(n - 1, Math.max(0, i))]!;
    engine.speed = this.playSpeed;
    this.updateClock(this.ctx.city.timeOfDay, this.ctx.city.day, engine.speed);
  }

  private updateClock(t: number, day: number, speed: number): void {
    const c = this.clock;
    if (speed) this.playSpeed = speed;
    const shown = this.clockShown;
    if (Math.abs(t - shown.t) > 0.0005) {
      shown.t = t;
      setText(c.time, timeLabel(t));
      setText(c.day, `Day ${day}`);
      c.dial.style.setProperty('--t', t.toFixed(4));
      c.el.classList.toggle('night', t < 0.25 || t > 0.79);
    }
    const play = speed ? 1 : 0;
    if (play !== shown.play || this.playSpeed !== shown.speed) {
      shown.play = play;
      shown.speed = this.playSpeed;
      c.el.classList.toggle('paused', !play);
      const face = c.dial.lastElementChild!;
      face.replaceChildren(icon(play ? 'pause' : 'play'));
      const label = play ? 'Pause (Space)' : 'Play (Space)';
      c.main.title = label;
      c.main.setAttribute('aria-label', label);
      setText(c.x, `${this.playSpeed}×`);
      const lit = SPEEDS.filter((v) => v <= this.playSpeed).length;
      [...c.speed.lastElementChild!.children].forEach((p, i) => p.classList.toggle('on', i < lit));
      c.speed.title = `Speed ${this.playSpeed}× · click: next speed · right-click or scroll: slower · keys 1–3`;
      c.speed.setAttribute('aria-label', `Speed ${this.playSpeed}×, click for faster`);
    }
  }

  private buildTopBar(): void {
    const { ctx } = this;
    const clock = this.buildClock();
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
    stat('credits', `credits ${N.credits}`);
    stat('pop', `people ${N.residents}`);
    stat('energy', `energy ${N.energy}`);
    stat('water', `water ${N.water}`);
    stat('food', `food ${N.food}`);
    stat('eco', `eco ${N.ecology}`);
    this.happyMeter = h('i');
    stat('happy', `happy ${N.harmony}`, h('div', { class: 'meter' }, this.happyMeter));

    this.undoBtn = h('button', { class: 'icon-btn', title: 'Undo (⌘Z)', 'aria-label': 'Undo', onClick: () => ctx.commands.undo() }, icon('undo'));
    this.redoBtn = h('button', { class: 'icon-btn opt', title: 'Redo (⇧⌘Z)', 'aria-label': 'Redo', onClick: () => ctx.commands.redo() }, icon('redo'));
    // The dashboard sits beside City Pulse in the leading view group (City Pulse is prepended by its module).
    this.lead.append(
      h('button', { class: 'icon-btn act-dashboard', title: 'City dashboard (K)', 'aria-label': 'City dashboard', onClick: () => ctx.services.get('dashboard').toggle() }, icon('dashboard')),
    );
    const actions = (this.actions = h(
      'div',
      { class: 'actions panel' },
      this.lead,
      this.undoBtn,
      this.redoBtn,
      h('button', { class: 'icon-btn opt', title: 'Overview (O) · bookmarks: Alt+1–4 store, Shift+1–4 recall', 'aria-label': 'Overview', onClick: () => ctx.cameraCtl.overview() }, icon('overview')),
    ));
    const topbar = h(
      'div',
      { class: 'topbar' },
      h(
        'div',
        {
          class: 'brand panel',
          role: 'button',
          tabindex: '0',
          title: 'About BloomGrid',
          'aria-label': 'About BloomGrid',
          // The credits (D-101) live in the about module.
          onClick: () => ctx.services.tryGet('about')?.open(),
          onKeydown: (e: KeyboardEvent) => e.key === 'Enter' && ctx.services.tryGet('about')?.open(),
        },
        h('span', { class: 'logo' }),
        h('b', {}, 'BloomGrid', this.brandSub),
      ),
      clock,
      stats,
      actions,
    );
    this.topbar = topbar;
    this.root.append(topbar);
    // The city's name under the brand and in the window title (D-072).
    const named = () => {
      const name = ctx.city.growth.name;
      setText(this.brandSub, name === 'BloomGrid' ? `Island OS · v${__APP_VERSION__}` : name);
      document.title = name === 'BloomGrid' ? 'BloomGrid' : `${name} · BloomGrid`;
    };
    named();
    for (const ev of ['city:named', 'city:reset', 'load:done'] as const) ctx.bus.on(ev, named);
    // Refit when the bar's room changes (window, side panels) or the screen class flips.
    new ResizeObserver(() => this.fitStats()).observe(stats);
    onCompactChange(() => this.fitStats());
  }

  private topbar!: HTMLElement;
  private brandSub = h('span', { class: 'brand-sub' });

  /**
   * Fits the status bar to its width (D-071): from the full bar, each level drops something until nothing
   * clips: 1 the stat labels and the harmony meter, 2 secondary values (rate, capacity) and the brand subtitle,
   * 3 tighter spacing and the brand name, 4 the ecology stat and the fireworks count, 5 water and the fastest
   * speed, 6 redo / overview and the season bar, 7 the fast speed and the season chip. Levels are
   * cumulative classes on the top bar; phones keep their own layout (mobile.css).
   */
  private fitStats(): void {
    const bar = this.topbar;
    const el = this.stats;
    const set = (level: number) => {
      for (let i = 1; i <= FIT_LEVELS; i++) bar.classList.toggle(`fit-${i}`, i <= level);
    };
    if (isCompact()) return set(0);
    let level = 0;
    set(0);
    while (level < FIT_LEVELS && el.scrollWidth > el.clientWidth + 1) set(++level);
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

  /** The bottom dock: Flora's orb (bottom-right on desktops); on phones also the Build launcher and sheet. */
  private buildDock(): void {
    this.dockRow = h('div', { class: 'dock-row' });
    this.dock = h('div', { class: 'dock' }, this.dockRow);
    this.root.append(this.dock);
  }

  private syncUndo(): void {
    this.undoBtn.disabled = !this.ctx.commands.canUndo;
    this.redoBtn.disabled = !this.ctx.commands.canRedo;
  }

  /**
   * The inspector: a 3D stage on top (a transparent window the `preview` module draws the selected building into;
   * drag to orbit, wheel to zoom), then the details sheet. The close button sits above both.
   */
  private buildInfo(): void {
    this.infoBody = h('div', { class: 'ix-sheet' });
    this.stage = h(
      'div',
      { class: 'ix-stage', title: 'Drag to orbit · scroll to zoom · double-click to reset' },
      h('span', { class: 'ix-stage-hint' }, icon('rotate'), isTouchDevice() ? 'Drag to orbit · double-tap to reset' : 'Drag to orbit · scroll to zoom'),
      h(
        'button',
        { class: 'ix-stage-reset', title: 'Reset the view', 'aria-label': 'Reset the view', onClick: () => this.ctx.services.tryGet('preview')?.reset() },
        icon('locate'),
      ),
    );
    this.info = h(
      'div',
      { class: 'info panel holo hidden' },
      h('button', { class: 'ix-close', title: 'Close', 'aria-label': 'Close the inspector', onClick: () => this.closeInfo() }, icon('close')),
      // Above the stage: holds the panel's rounded top corners (the stage is drawn on the canvas, which CSS can't round).
      h('div', { class: 'ix-stage-bar' }, h('span', { class: 'ix-stage-tag' }, h('i'), 'Live model'), this.stageName),
      this.stage,
      this.infoBody,
    );
  }

  /** Closes the inspector and clears the selection (the select tool drops its highlight too). */
  private closeInfo(): void {
    this.ctx.bus.emit('selection:changed', { eid: null });
  }

  private closing = 0;
  private fitTimer = 0;

  private showInfo(): void {
    clearTimeout(this.closing);
    this.info.classList.remove('hidden', 'closing');
  }

  /** Fades the inspector out (opacity and transform only), then hides it. */
  private hideInfo(): void {
    this.stageFor(null);
    if (this.info.classList.contains('hidden')) return;
    this.info.classList.add('closing');
    clearTimeout(this.closing);
    this.closing = window.setTimeout(() => this.info.classList.add('hidden'), 220);
  }

  /** Returns one building to nature at once (undoable): it folds away and the inspector closes. */
  private raze(eid: number): void {
    const { ctx } = this;
    const def = ctx.city.buildingDef(eid);
    if (!ctx.commands.execute('demolish', { x: Building.x[eid]!, z: Building.z[eid]! })) return;
    ctx.bus.emit('toast', { text: `Returned ${def.name} to nature · +◈${fmt(def.stats.cost * DEMOLISH_REFUND)} (⌘Z to undo)`, tone: 'ok' });
    this.closeInfo();
  }

  /** Returns the whole group to nature in one undoable step. */
  private razeGroup(): void {
    const { ctx } = this;
    const eids = this.group.filter((e) => ctx.city.buildingEntities().includes(e));
    if (!eids.length) return;
    const def = ctx.city.buildingDef(eids[0]!);
    const refund = eids.reduce((a, e) => a + ctx.city.buildingDef(e).stats.cost * DEMOLISH_REFUND, 0);
    if (!ctx.commands.execute('demolishMany', { tiles: eids.map((e) => [Building.x[e]!, Building.z[e]!]) })) return;
    ctx.bus.emit('toast', { text: `Returned ${eids.length} × ${def.name} to nature · +◈${fmt(refund)} (⌘Z to undo)`, tone: 'ok' });
    this.closeInfo();
  }

  /** The group inspector: what was boxed, totals, every member's id, and one action for all. */
  private selectGroup(eids: number[]): void {
    const { ctx } = this;
    const { city } = ctx;
    this.group = eids.filter((e) => city.buildingEntities().includes(e));
    this.selected = null;
    if (!this.group.length) return this.select(null);
    this.showInfo();
    const def = city.buildingDef(this.group[0]!);
    const preview = ctx.services.tryGet('preview');
    this.info.classList.toggle('staged', !!preview);
    setText(this.stageName, `${this.group.length} × ${def.name}`);
    preview?.showDef(this.stage, def.id);
    let residents = 0;
    let jobs = 0;
    for (const e of this.group) {
      if (def.stats.population) residents += def.stats.population * Service.occupancy[e]!;
      if (def.stats.jobs) jobs += def.stats.jobs * Service.occupancy[e]!;
    }
    const n = this.group.length;
    const refund = n * def.stats.cost * DEMOLISH_REFUND;
    const ids = this.group.map((e) => [e, idForSelection(city, { eid: e })] as const);
    this.fillInfo(
      ...this.infoHead(
        icon(`cat:${def.category}`, CATEGORY_ICONS[def.category]),
        h('div', { class: 'info-id' }, h('span', { class: 'info-id-btn' }, `GROUP · ${n}`), h('span', {}, 'Ctrl/⌘-drag selection')),
        `${n} × ${def.name}`,
        `Every ${def.name} in the box you drew. Return them to nature together (Delete), or pick one to inspect it.`,
      ),
      h(
        'div',
        { class: 'ix-vitals' },
        this.vital('people', 'Residents', fmt(residents)),
        this.vital('jobs', 'Staffed jobs', fmt(jobs)),
        this.vital('energy', 'Energy', `${def.stats.energy * n > 0 ? '+' : ''}${fmt(def.stats.energy * n)}`, def.stats.energy > 0 ? 'good' : def.stats.energy < 0 ? 'bad' : ''),
        this.vital('pollution', 'Pollution', fmt(def.stats.pollution * n), def.stats.pollution > 0 ? 'bad' : ''),
        this.vital('credits', 'Refund', `◈${fmt(refund)}`),
      ),
      h(
        'div',
        { class: 'ix-group' },
        ...ids.slice(0, 24).map(([e, id]) =>
          h('button', { class: 'ix-chip', title: 'Inspect this one', onClick: () => ctx.bus.emit('selection:changed', { eid: e }) }, id ?? '—'),
        ),
        n > 24 ? h('span', { class: 'ix-more' }, `+${n - 24} more`) : null,
      ),
      this.infoActions(
        null,
        h(
          'button',
          { class: 'tool ix-raze', title: `Return all ${n} to nature: +◈${fmt(refund)} back (Delete; ⌘Z undoes)`, onClick: () => this.razeGroup() },
          h('span', { class: 'g' }, icon('bulldoze')),
          `Return all ${n} to nature`,
        ),
        h('button', { class: 'tool', title: 'Clear the selection (Esc)', onClick: () => this.closeInfo() }, h('span', { class: 'g' }, icon('close')), 'Clear'),
      ),
    );
  }

  /**
   * Fills the details sheet: everything scrolls in `.ix-scroll` except the action row (the last part, from
   * `infoActions`), which stays pinned at the foot of the inspector.
   */
  private fillInfo(...parts: (Node | string)[]): void {
    const last = parts[parts.length - 1];
    const foot = last instanceof HTMLElement && last.classList.contains('ix-actions') ? parts.pop()! : null;
    this.infoBody.replaceChildren(h('div', { class: 'ix-scroll' }, ...parts), foot ?? '');
  }

  /** Shows the 3D stage for a building, or folds it away (networks, nothing selected). */
  private stageFor(eid: number | null): void {
    const preview = this.ctx.services.tryGet('preview');
    const on = eid !== null && !!preview;
    this.info.classList.toggle('staged', on);
    if (on) setText(this.stageName, this.ctx.city.buildingDef(eid!).name);
    if (on) preview!.show(this.stage, eid!);
    else preview?.hide();
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

  /**
   * Action row at the foot of the inspector: the object's own actions, then "Ask Flora". Each button's text becomes
   * a `.l` label (and leads its tooltip), so a crowded row can tighten, then show icons only (`fitActions`).
   */
  private infoActions(id: string | null, ...actions: HTMLElement[]): HTMLElement {
    const ask =
      id && this.ctx.services.tryGet('assistant')
        ? h('button', { class: 'tool ix-ask', title: 'Ask the city assistant about it (U)', onClick: () => this.askAbout(id) }, h('span', { class: 'g' }, icon('sparkle')), 'Ask Flora')
        : null;
    const row = h('div', { class: 'ix-actions' }, ...actions, ask);
    for (const b of row.children) {
      const text = [...b.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
      const label = text.map((n) => n.textContent).join('').trim();
      if (!label) continue;
      // A price (" ◈780") is its own part, the first thing a crowded row drops.
      const [main, price] = label.split(/ (?=◈)/);
      const l = h('span', { class: 'l' }, main!, price ? h('span', { class: 'l-price' }, ` ${price}`) : null);
      text.forEach((n, i) => (i ? n.remove() : n.replaceWith(l)));
      const title = b.getAttribute('title');
      if (!title?.startsWith(label)) b.setAttribute('title', title ? `${label}: ${title}` : label);
      b.setAttribute('aria-label', label);
    }
    // Refit whenever the row's room changes (it is measured once it is laid out, too).
    new ResizeObserver(() => fitActions(row)).observe(row);
    return row;
  }

  /** One vital as a tile: icon, mono value, label; `tone` colours it good or bad. */
  private vital(ico: string, label: string, value: string, tone: '' | 'good' | 'bad' = ''): HTMLElement {
    return h('div', { class: `ix-vital ${tone}` }, icon(ico), h('b', {}, value), h('span', {}, label));
  }

  /** The building's switch (D-075): feather a turbine, pause a factory… with what switching does in the tooltip. */
  private switchButton(eid: number): HTMLElement[] {
    const it = this.ctx.city.buildingDef(eid).interact;
    if (!it) return [];
    const off = Service.off[eid] === 1;
    return [
      h(
        'button',
        { class: `tool ${off ? 'on' : ''}`, title: it.help, onClick: () => this.ctx.commands.execute('toggleBuilding', { x: Building.x[eid]!, z: Building.z[eid]! }) && this.select(eid) },
        h('span', { class: 'g' }, icon(off ? 'play' : 'pause')),
        off ? it.on : it.off,
      ),
    ];
  }

  /** Upgrade and Renovate (D-073): enabled when they would do something and are affordable. */
  private levelButtons(eid: number): HTMLElement[] {
    const { ctx } = this;
    const { city } = ctx;
    const at = { x: Building.x[eid]!, z: Building.z[eid]! };
    const out: HTMLElement[] = [];
    if (levels(city, eid) && Building.tier[eid]! < MAX_TIER) {
      const why = upgradeBlocker(city, eid);
      const b = h(
        'button',
        { class: 'tool', title: why ?? `Grow it to level ${Building.tier[eid]! + 2} now: more room, more output, more upkeep`, onClick: () => ctx.commands.execute('upgradeBuilding', at) && this.select(eid) },
        h('span', { class: 'g' }, icon('up')),
        `Upgrade ◈${fmt(upgradeCost(city, eid))}`,
      ) as HTMLButtonElement;
      b.disabled = !!why;
      out.push(b);
    }
    if (ageDays(eid) >= 0.5 || Service.condition[eid]! < 0.95) {
      const cost = renovateCost(city, eid);
      const b = h(
        'button',
        { class: 'tool', title: 'Renovate: like new (age and weathering reset, condition restored; upkeep drops back)', onClick: () => ctx.commands.execute('renovate', at) && this.select(eid) },
        h('span', { class: 'g' }, icon('wrench')),
        `Renovate ◈${fmt(cost)}`,
      ) as HTMLButtonElement;
      b.disabled = city.credits < cost;
      out.push(b);
    }
    return out;
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
    this.stageFor(null);
    const id = city.networks.comp[road]!;
    const n = city.pulse.networks[id];
    this.group = [];
    if (!n) return this.hideInfo();
    this.showInfo();
    let tiles = 0;
    const net: number[] = [];
    for (let i = 0; i < city.networks.comp.length; i++)
      if (city.networks.comp[i] === id) {
        tiles++;
        net.push(i);
      }
    // Highway levels (D-096): this tile's level, the network's mix, and an upgrade for the stretch clicked.
    const level = roadLevels(city)[road]!;
    const [raw, paved, blvd] = levelCounts(city, net);
    const stretch = roadStretch(city, road, 30);
    const cost = roadUpgradeCost(city, stretch);
    const next = level < MAX_ROAD_LEVEL && city.grid.road[road] === ROAD ? ROAD_LEVEL_NAMES[level + 1] : null;
    const ratio = (p: number, u: number) => (u > 0 ? `${Math.round((p / u) * 100)}%` : '—');
    const row = (k: string, v: string | number) => h('div', { class: 'row' }, h('span', {}, k), h('b', {}, String(v)));
    const objId = idForSelection(city, { road });
    this.fillInfo(
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
      row('This stretch', `${ROAD_LEVEL_NAMES[level]} · carries ×${ROAD_CAPACITY[level]}`),
      row('Levels', `${fmt(raw)} raw · ${fmt(paved)} highway · ${fmt(blvd)} boulevard`),
      h('p', { class: 'ix-note' }, level < MAX_ROAD_LEVEL ? 'Busy roads level up on their own as traffic wears them in; or upgrade this stretch now.' : 'A Bloom Boulevard: the top level.'),
      this.infoActions(
        objId,
        ...(next
          ? [
              h(
                'button',
                {
                  class: 'tool',
                  title: `Upgrade the ${stretch.length} connected ${ROAD_LEVEL_NAMES[level]} tiles here to ${next} (⌘Z undoes)`,
                  disabled: this.ctx.city.credits < cost ? 'true' : undefined,
                  onClick: () => {
                    if (this.ctx.commands.execute('upgradeRoad', { tiles: stretch })) {
                      this.ctx.bus.emit('toast', { text: `${stretch.length} tiles upgraded to ${next}`, tone: 'ok' });
                      this.selectNetwork(road);
                    }
                  },
                },
                h('span', { class: 'g' }, icon('up')),
                h('span', { class: 'l' }, `Upgrade to ${next}`, h('span', { class: 'l-price' }, ` ◈${fmt(cost)}`)),
              ),
            ]
          : []),
      ),
    );
    this.info.querySelector('[data-led]')?.classList.toggle('bad', n.energyProduced < n.energyUsed || n.waterProduced < n.waterUsed);
  }

  private select(eid: number | null): void {
    this.selected = eid === NO_ENTITY ? null : eid;
    this.group = [];
    this.hzKey = '';
    if (this.selected === null) return this.hideInfo();
    this.showInfo();
    this.stageFor(this.selected);
    const def = this.ctx.city.buildingDef(this.selected);
    const s = def.stats;
    this.liveKey = '';
    const [bx, bz] = [Building.x[this.selected]! + Building.w[this.selected]! / 2, Building.z[this.selected]! + Building.d[this.selected]! / 2];
    const id = idForSelection(this.ctx.city, { eid: this.selected });
    this.fillInfo(
      ...this.infoHead(
        icon(`cat:${def.category}`, CATEGORY_ICONS[def.category]),
        this.idTag(id, this.ctx.city.districtAt(Math.floor(bx), Math.floor(bz))),
        def.name,
        def.description,
      ),
      // Live parts (`updateInfo`): status and fixes, key facts, what it consumes and produces, notes.
      h('div', { class: 'info-hz', 'data-hz': '1' }),
      h('div', { class: 'ix-live', 'data-live': '1' }),
      this.infoActions(
        id,
        ...this.switchButton(this.selected),
        ...this.levelButtons(this.selected),
        h(
          'button',
          { class: 'tool ix-raze', title: `Return it to nature now: +◈${fmt(s.cost * DEMOLISH_REFUND)} back (Delete; ⌘Z undoes)`, onClick: () => this.raze(this.selected!) },
          h('span', { class: 'g' }, icon('bulldoze')),
          'Return to nature',
        ),
      ),
    );
    this.updateInfo();
  }

  private liveKey = '';
  /** Refreshes the live parts of the building inspector; rebuilt only when what they show changes (≈ once a pulse). */
  private updateInfo(): void {
    if (this.selected === null) return;
    const box = this.infoBody.querySelector<HTMLElement>('[data-live]');
    if (!box) return;
    const eid = this.selected;
    const r = buildingReport(this.ctx.city, eid);
    const notes = this.notes(eid);
    const key = JSON.stringify([r, notes]);
    this.hazardActions(eid);
    if (key === this.liveKey) return;
    this.liveKey = key;
    box.replaceChildren(this.statusCard(r), this.keyFacts(eid, r), this.flows(r), notes.length ? h('ul', { class: 'ix-notes' }, ...notes.map(([ico, text, tone]) => h('li', { class: tone }, icon(ico), h('span', {}, text)))) : '');
    this.infoBody.querySelector('[data-led]')?.setAttribute('data-tone', r.status.tone);
  }

  /** The verdict at a glance: a coloured banner (title + the one thing to know), then each problem with its fix. */
  private statusCard(r: BuildingReport): HTMLElement {
    const ico = { ok: 'st-ok', warn: 'st-warn', crit: 'st-crit', off: 'st-off' }[r.status.tone];
    return h(
      'div',
      { class: `ix-status ${r.status.tone}` },
      h('div', { class: 'ix-status-head' }, icon(ico), h('b', {}, r.status.title), h('span', {}, r.status.detail)),
      r.issues.length
        ? h('ol', { class: 'ix-fixes' }, ...r.issues.map((i) => h('li', {}, h('b', {}, i.text), h('span', {}, icon('next'), i.fix))))
        : '',
    );
  }

  /** Level (stars and progress), condition, occupancy or staffing, greenery: four bars, each with a caption. */
  private keyFacts(eid: number, r: BuildingReport): HTMLElement {
    const tone = (v: number, warn: number, bad: number) => (v < bad ? 'bad' : v < warn ? 'warn' : 'good');
    const fact = (label: string, value: string, bar: number, t: string, caption: string, extra?: Node) =>
      h('div', { class: `ix-fact ${t}` }, h('span', { class: 'ix-fact-l' }, label), h('b', {}, value, extra ?? ''), h('div', { class: 'ix-bar' }, h('i', { style: `width:${Math.round(Math.min(1, bar) * 100)}%` })), h('small', { title: caption }, caption));
    const L = r.level;
    const stars = h('span', { class: 'ix-stars' }, ...Array.from({ length: L.max + 1 }, (_, i) => h('i', { class: i <= L.tier ? 'on' : '' }, '')));
    const age = `${ageDays(eid).toFixed(1)} days old`;
    const lv = !L.grows
      ? fact('Level', '—', 0, '', "Doesn't grow")
      : L.tier >= L.max
        ? fact('Level', `${L.tier + 1}`, 1, 'good', 'Top level', stars)
        : fact('Level', `${L.tier + 1}`, L.progress, L.hold ? 'warn' : 'good', L.hold ? `Paused: ${L.hold}` : `Growing · ${Math.round(L.progress * 100)}% to level ${L.tier + 2}`, stars);
    return h(
      'div',
      { class: 'ix-facts' },
      lv,
      fact('Condition', `${Math.round(r.condition * 100)}%`, r.condition, tone(r.condition, 0.7, 0.35), age),
      r.fill ? fact(r.fill.label, `${Math.round(r.fill.value * 100)}%`, r.fill.value, tone(r.fill.value, 0.85, 0.5), r.fill.label === 'Occupancy' ? 'of homes lived in' : 'of jobs filled') : null,
      fact('Greenery', `${Math.round(r.greenery * 100)}%`, r.greenery, tone(r.greenery, 0.5, 0.2), r.greenery >= 0.99 ? 'Fully grown' : 'Moss and plants'),
    );
  }

  /** Consumes ← | → Produces: live amounts per sim second, bars against full service, supply shortfalls in red. */
  private flows(r: BuildingReport): HTMLElement {
    const ICON: Record<FlowKey, string> = { energy: 'energy', water: 'water', food: 'food', workers: 'people', residents: 'house', jobs: 'jobs', eco: 'eco', pollution: 'pollution', upkeep: 'credits', riders: 'pod', harmony: 'happy' };
    const num = (v: number, unit: string) => (unit === '◈/s' ? v.toFixed(2) : Math.abs(v) < 10 && v % 1 ? v.toFixed(1) : fmt(v));
    const row = (l: FlowLine) => {
      const short = l.supplied !== undefined && l.supplied < 0.8;
      const t = short ? 'bad' : l.tone;
      const share = l.max > 0 ? Math.min(1, Math.abs(l.value) / Math.abs(l.max)) : 0;
      const caption =
        l.supplied !== undefined
          ? `${l.key === 'workers' ? 'filled' : 'supplied'} ${Math.round(l.supplied * 100)}%${l.key !== 'workers' && l.max > l.value + 0.05 ? ` · ${num(l.max, l.unit)} when busy` : ''}`
          : l.max !== 0
            ? `of ${num(l.max, l.unit)} at best`
            : l.key === 'upkeep'
              ? 'running cost'
              : l.key === 'workers'
                ? 'to the job market'
                : l.key === 'jobs'
                  ? 'for residents'
                  : l.key === 'harmony'
                    ? 'amenity for the city'
                    : 'to the city';
      return h(
        'li',
        { class: `ix-flow ${t}` },
        icon(ICON[l.key]),
        h('span', { class: 'ix-flow-l' }, l.label),
        h('b', {}, num(l.value, l.unit), l.unit ? h('em', {}, ` ${l.unit}`) : ''),
        l.max !== 0 || l.supplied !== undefined ? h('div', { class: 'ix-bar' }, h('i', { style: `width:${Math.round((l.supplied ?? share) * 100)}%` })) : null,
        h('small', {}, caption),
      );
    };
    const col = (title: string, cls: string, lines: FlowLine[], input: boolean) =>
      h('div', { class: `ix-col ${cls}` }, h('h4', {}, icon(input ? 'load' : 'save'), title), lines.length ? h('ul', {}, ...lines.map(row)) : h('p', { class: 'ix-none' }, input ? 'Nothing: runs free' : 'No direct output'));
    return h('div', { class: 'ix-flows' }, col('Consumes', 'in', r.consumes, true), col('Produces', 'out', r.produces, false));
  }

  /** Situational notes: symbiosis, transit, retrofit, bloom, damage, city rules, risk. Each `[icon, text, tone]`. */
  private notes(eid: number): [string, string, string][] {
    const { city } = this.ctx;
    const def = city.buildingDef(eid);
    const sym = def.symbiosis;
    const p = Service.problems[eid]!;
    const out: [string, string, string][] = [];
    if (sym)
      out.push(
        Service.paired[eid]
          ? ['link', `Symbiosis: ${sym.label}`, 'good']
          : ['link', `Unpaired: place a ${sym.partners.map((q) => buildings.get(q).name).join(' or ')} within ${sym.radius} tiles for a bonus`, 'warn'],
      );
    if (Building.level[eid]) out.push(['retrofit', 'Bloom Retrofit: eco ×1.5, uses less power and water', 'good']);
    if (def.transit) {
      out.push(['pod', `Flying ${Math.round(Service.riders[eid]!)} of up to ${def.transit.riders} commuters from homes within ${def.transit.radius} tiles`, '']);
      out.push(['pod', this.skylaneLine(eid).replace(/^⌬ /, ''), '']);
    }
    out.push(['flower', `Bloom ${Math.round(Service.bloom[eid]! * 100)}% around it (pollinators, clean power and green lift it)`, '']);
    if (Service.scorch[eid]! > 0.05 && !(p & Problem.RUINED)) out.push(['fire', `Charred ${Math.round(Service.scorch[eid]! * 100)}%: a repair or renovation cleans it`, 'warn']);
    for (const rule of rulesFor(city, eid)) out.push(['pulse', rule, '']);
    const risk = this.riskLine(eid);
    if (risk) out.push(['st-warn', risk.replace(/^⛈ /, ''), 'warn']);
    return out;
  }

  private risk = { tick: -Infinity, map: new Map<number, Exposure>() };
  /** The Risk lens's reasons for one building (`buildingExposure`, recomputed at most once a sim second). */
  private riskLine(eid: number): string {
    const city = this.ctx.city;
    if (city.tick - this.risk.tick >= 10 || city.tick < this.risk.tick) this.risk = { tick: city.tick, map: buildingExposure(city) };
    const x = this.risk.map.get(eid);
    if (!x?.hazards.length) return '';
    const why: Record<Exposure['hazards'][number], string> = {
      flood: 'floods (low waterfront, no seawall)',
      fire: 'fire (no Ember Watch in reach)',
      lightning: 'lightning (tall)',
      storm: 'tornadoes (no Storm Shelter in reach)',
      frail: 'collapse (poor condition)',
    };
    return `⛈ Risk ${Math.round(x.score * 100)}%: ${x.hazards.map((k) => why[k]).join(', ')}`;
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
    // Values change width as they grow (10,000 residents): refit every couple of seconds.
    if ((this.fitTimer += 0.2) >= 2) {
      this.fitTimer = 0;
      this.fitStats();
    }
    const { city, engine } = ctx;
    const s = city.stats;
    this.updateClock(city.timeOfDay, city.day, engine.speed);
    const set = (id: string, text: string, bad = false, sub = '') => {
      const e = this.statEls.get(id)!;
      setText(e.v, text);
      setText(e.sub, sub);
      e.el.classList.toggle('bad', bad);
    };
    const net = netIncome(city);
    set('credits', fmt(city.credits), city.credits < 0 || net < 0, `  ${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(1)}/s`);
    set('pop', fmt(s.population), false, ` / ${fmt(s.capacity)}`);
    set('energy', `${fmt(s.energyProduced - s.energyUsed)}`, s.energyUsed > s.energyProduced);
    set('water', `${fmt(s.waterProduced - s.waterUsed)}`, s.waterUsed > s.waterProduced);
    const fed = s.population >= 1;
    set('food', fed ? `${Math.round(city.pulse.foodRatio * 100)}%` : '—', fed && city.pulse.foodRatio < 0.95);
    set('eco', fmt(s.eco), s.eco < 0);
    set('happy', `${Math.round(s.happiness)}`);
    this.happyMeter.style.width = `${s.happiness}%`;
    document.body.classList.toggle('night', ctx.services.get('world').atmosphere.sunElevation < -0.02);
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
  /** Top-bar action buttons (undo … settings); Save and Load live in Settings. */
  actions: HTMLElement;
  /** The actions panel's leading group, for view toggles (City Pulse, map, fireworks), ruled off from the rest. */
  lead: HTMLElement;
  /** The bottom dock (the tool hint sits in it on phones). */
  dock: HTMLElement;
  /** The dock's row, for a button in it (Flora's orb; the Build launcher on phones). */
  dockRow: HTMLElement;
  /** The central stats panel of the top bar. */
  stats: HTMLElement;
  /** Telemetry strip (sim rate, camera focus, heading, altitude, fps); a panel may adopt it. */
  readout: HTMLElement;
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
    ctx.services.provide('hud', { right: hud.right, actions: hud.actions, lead: hud.lead, dock: hud.dock, dockRow: hud.dockRow, stats: hud.stats, readout: hud.readoutEl, sheet: (el) => hud.sheet(el) });
    ctx.systems.add({ id: 'hud', phase: 'render', order: 100, update: (_c, f) => hud.update(f.dt) });
  },
};
