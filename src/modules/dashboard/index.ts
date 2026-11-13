import { netIncome, paidShare, taxSplit } from '@/sim/finance';
import { sectorOf } from '@/sim/policies';
import { query } from 'bitecs';
import { CREDIT_FLOW, INDICATOR_NAMES as N, SYSTEM_ORDER } from '@/sim/indicators';
import type { GameContext, GameModule } from '@/game/context';
import { Building } from '@/ecs/components';
import { buildings } from '@/content';
import { CATEGORY_LABELS, type BuildingCategory } from '@/content/types';
import { TIERS, type HistoryMetric } from '@/sim/pulseState';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { holoHead, rise } from '@/ui/holo';
import { SYSTEM_LABELS } from '@/modules/pulse/PulsePanel';
import { LineChart } from './LineChart';
import { InventoryView } from './InventoryView';
import { IncidentLog } from './IncidentLog';
import { FireworksView } from './FireworksView';
import { CauseEffect } from './CauseEffect';
import './dashboard.css';

const HISTORY_STEP = 10; // sim seconds per history sample
const fmt = (n: number) => Math.round(n).toLocaleString();
const signed = (n: number, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
const TIER_ICON = ['●', '●', '▲', '◆', '✖'];

interface Tile {
  value: HTMLElement;
  sub: HTMLElement;
}

type Tab = 'overview' | 'inventory' | 'incidents' | 'causes' | 'fireworks';

/**
 * City dashboard. Overview (K): headline tiles, trend small-multiples (one series per chart), budget and
 * land-use breakdowns, and system health with icon + label; refreshes ~1 Hz while open. Inventory (I): every
 * object in the city, counted, searchable and inspectable (see `InventoryView`).
 */
class Dashboard {
  readonly el: HTMLElement;
  private tiles = new Map<string, Tile>();
  private charts: { metric: HistoryMetric; chart: LineChart }[] = [];
  private health = h('div', { class: 'db-health' });
  private budget = h('div', { class: 'db-bars' });
  private landuse = h('div', { class: 'db-bars' });
  private open = false;
  private timer = 0;
  private tab: Tab = 'overview';
  private tabs = new Map<Tab, { btn: HTMLElement; pane: HTMLElement }>();
  readonly inventory: InventoryView;
  readonly incidents: IncidentLog;
  readonly fireworks: FireworksView;
  readonly causes: CauseEffect;

  constructor(private ctx: GameContext) {
    const tiles = h('div', { class: 'db-tiles' });
    for (const [id, label] of [
      // INDICATOR_ORDER (mobility lives in its own lens and the health list).
      ['credits', N.credits],
      ['pop', N.residents],
      ['energy', N.energy],
      ['water', N.water],
      ['food', N.food],
      ['jobs', N.jobs],
      ['eco', N.ecology],
      ['harmony', N.harmony],
    ]) {
      const value = h('div', { class: 'db-tile-v' });
      const sub = h('div', { class: 'db-tile-s' });
      this.tiles.set(id!, { value, sub });
      tiles.append(h('div', { class: 'db-tile' }, h('div', { class: 'db-tile-k' }, label!), value, sub));
    }

    const charts = h('div', { class: 'db-charts' });
    for (const [metric, label, format] of [
      ['credits', N.credits, fmt],
      ['net', 'Credit flow (/s)', (v: number) => signed(v)],
      ['population', N.residents, fmt],
      ['energyBalance', `${N.energy} surplus`, (v: number) => signed(v, 0)],
      ['waterBalance', `${N.water} surplus`, (v: number) => signed(v, 0)],
      ['food', `${N.food} (fed)`, (v: number) => `${Math.round(v * 100)}%`],
      ['eco', N.ecology, fmt],
      ['happiness', N.harmony, (v: number) => v.toFixed(0)],
      ['bloom', N.bloom, (v: number) => `${Math.round(v * 100)}%`],
    ] as [HistoryMetric, string, (v: number) => string][]) {
      const chart = new LineChart({ format, step: HISTORY_STEP });
      this.charts.push({ metric, chart });
      charts.append(h('figure', { class: 'db-chart' }, h('figcaption', {}, label), chart.el));
    }

    const overview = h(
      'div',
      { class: 'db-pane' },
      tiles,
      h('h3', {}, 'Trends · last 40 sim-minutes'),
      charts,
      h(
        'div',
        { class: 'db-cols' },
        h('div', {}, h('h3', {}, 'System health'), this.health),
        h('div', {}, h('h3', {}, CREDIT_FLOW), this.budget),
        h('div', {}, h('h3', {}, 'Land use'), this.landuse),
      ),
    );
    this.inventory = new InventoryView(ctx, () => this.toggle(false));
    this.incidents = new IncidentLog(ctx);
    this.fireworks = new FireworksView(ctx);
    this.causes = new CauseEffect(ctx);
    const tabBar = h('nav', { class: 'db-tabs', role: 'tablist' });
    for (const [id, name, key, pane] of [
      ['overview', 'Overview', 'K', overview],
      ['inventory', 'Inventory', 'I', h('div', { class: 'db-pane' }, this.inventory.el)],
      ['incidents', 'Incidents', '', h('div', { class: 'db-pane' }, this.incidents.el)],
      ['causes', 'Causes', '', h('div', { class: 'db-pane' }, this.causes.el)],
      ['fireworks', 'Fireworks', '', h('div', { class: 'db-pane' }, this.fireworks.el)],
    ] as [Tab, string, string, HTMLElement][]) {
      const btn = h('button', { class: 'db-tab', role: 'tab', onClick: () => this.show(id) }, name, key ? h('kbd', {}, key) : null);
      tabBar.append(btn);
      this.tabs.set(id, { btn, pane });
    }
    this.el = h(
      'div',
      { class: 'db-scrim hidden', onClick: (e: Event) => e.target === this.el && this.toggle(false) },
      h(
        'section',
        { class: 'db panel holo', role: 'dialog', 'aria-label': 'City dashboard' },
        h('header', { class: 'db-head' }, holoHead(icon('dashboard'), 'Steward console · city records', 'City Dashboard'), tabBar, h('span', { class: 'db-hint' }, 'Esc to close'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: () => this.toggle(false) }, icon('close'))),
        ...[...this.tabs.values()].map((t) => t.pane),
      ),
    );
    rise(tiles.children);
    rise(charts.children, 4);
    this.show('overview');
    ctx.hud.append(this.el);
  }

  get isOpen(): boolean {
    return this.open;
  }

  get activeTab(): Tab {
    return this.tab;
  }

  toggle(open = !this.open): void {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    if (open) this.show(this.tab);
  }

  /** Opens on a tab (pressing its key again while it shows closes the dashboard). */
  openTab(tab: Tab): void {
    if (this.open && this.tab === tab) return this.toggle(false);
    this.show(tab);
    this.toggle(true);
  }

  show(tab: Tab): void {
    this.tab = tab;
    for (const [id, t] of this.tabs) {
      t.btn.classList.toggle('on', id === tab);
      t.btn.setAttribute('aria-selected', String(id === tab));
      t.pane.classList.toggle('hidden', id !== tab);
    }
    if (!this.open) return;
    if (tab === 'overview') this.refresh();
    else if (tab === 'incidents') this.incidents.render();
    else if (tab === 'fireworks') this.fireworks.render();
    else if (tab === 'causes') this.causes.render();
    else this.inventory.update(0, true);
  }

  update(dt: number): void {
    if (!this.open) return;
    if (this.tab === 'inventory') return this.inventory.update(dt);
    this.timer += dt;
    if (this.timer < 1) return;
    this.timer = 0;
    // Live fires and ruins change every second; the log only on events, but a 1 Hz rebuild covers both.
    if (this.tab === 'incidents') this.incidents.render();
    else if (this.tab === 'fireworks') this.fireworks.render();
    else if (this.tab === 'causes') this.causes.render();
    else this.refresh();
  }

  private bars(container: HTMLElement, rows: { label: string; value: number; text: string; neg?: boolean }[]): void {
    const max = Math.max(1e-6, ...rows.map((r) => Math.abs(r.value)));
    container.replaceChildren(
      ...rows.map((r) =>
        h(
          'div',
          { class: 'db-bar' },
          h('span', { class: 'db-bar-l' }, r.label),
          h('span', { class: 'db-bar-t' }, h('i', { class: r.neg ? 'neg' : '', style: `width:${(Math.abs(r.value) / max) * 100}%` })),
          h('span', { class: 'db-bar-v' }, r.text),
        ),
      ),
    );
  }

  private refresh(): void {
    const { city } = this.ctx;
    const s = city.stats;
    const p = city.pulse;
    const hist = p.history;
    const delta = (m: HistoryMetric) => {
      const a = hist[m];
      return a.length > 6 ? a[a.length - 1]! - a[a.length - 7]! : 0;
    };
    const set = (id: string, v: string, sub: string) => {
      const t = this.tiles.get(id)!;
      setText(t.value, v);
      setText(t.sub, sub);
    };
    set('pop', fmt(s.population), `${signed(delta('population'), 0)} in 1 min · capacity ${fmt(s.capacity)}`);
    set('credits', fmt(city.credits), `${signed(netIncome(city))}/s net`);
    set('harmony', Math.round(s.happiness).toString(), `${signed(delta('happiness'))} in 1 min`);
    set('energy', `${Math.round(p.energyRatio * 100)}%`, `${fmt(s.energyProduced)} made / ${fmt(s.energyUsed)} used`);
    set('water', `${Math.round(p.waterRatio * 100)}%`, `${fmt(s.waterProduced)} made / ${fmt(s.waterUsed)} used`);
    set('food', `${Math.round(p.foodRatio * 100)}%`, `${fmt(s.foodProduced)} grown · ${fmt(s.population)} eaten`);
    set('jobs', `${Math.round((1 - p.unemployment) * 100)}%`, `${fmt(s.employed)} employed · ${fmt(s.jobs)} jobs`);
    set('eco', fmt(s.eco), `${(s.eco / Math.max(1, s.buildings)).toFixed(1)} per building · ${fmt(s.pollution)} pollution`);

    for (const { metric, chart } of this.charts) chart.setData(hist[metric]);

    this.health.replaceChildren(
      ...SYSTEM_ORDER.map((k) => {
        const t = p.tiers[k];
        return h('div', { class: `db-tier t${t}` }, h('span', { class: 'db-tier-i', 'aria-hidden': 'true' }, TIER_ICON[t]!), h('span', {}, SYSTEM_LABELS[k]), h('b', {}, TIERS[t]));
      }),
    );

    // Budget and land use from live entities.
    const upkeep: Partial<Record<BuildingCategory, number>> = {};
    const count: Partial<Record<BuildingCategory, number>> = {};
    for (const eid of query(city.world, [Building])) {
      const d = buildings.at(Building.def[eid]!);
      upkeep[d.category] = (upkeep[d.category] ?? 0) + d.stats.upkeep * paidShare(city, sectorOf(d));
      count[d.category] = (count[d.category] ?? 0) + 1;
    }
    const { residents: residentsTax, business: workersTax } = taxSplit(city);
    this.bars(this.budget, [
      { label: 'Resident tax', value: residentsTax, text: signed(residentsTax) },
      { label: 'Business tax', value: workersTax, text: signed(workersTax) },
      ...(s.fishing > 0 ? [{ label: 'Fishing', value: s.fishing, text: signed(s.fishing) }] : []),
      ...(s.tourism > 0 ? [{ label: 'Visitors', value: s.tourism, text: signed(s.tourism) }] : []),
      ...(Math.abs(s.fireworks) >= 0.05 ? [{ label: 'Fireworks', value: Math.abs(s.fireworks), text: signed(s.fireworks), neg: s.fireworks < 0 }] : []),
      ...(s.insurance > 0 ? [{ label: 'Insurance', value: s.insurance, text: signed(-s.insurance), neg: true }] : []),
      ...(s.debtService > 0 ? [{ label: 'Loan repayments', value: s.debtService, text: signed(-s.debtService), neg: true }] : []),
      // Upkeep as paid: austerity (credits below zero) pays only part of it.
      ...(Object.entries(upkeep) as [BuildingCategory, number][])
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => ({ label: `${CATEGORY_LABELS[c]} upkeep`, value: v, text: signed(-v), neg: true })),
      ...(s.policyCost > 0.05 ? [{ label: 'Ordinances', value: s.policyCost, text: signed(-s.policyCost), neg: true }] : []),
    ]);
    this.bars(
      this.landuse,
      (Object.entries(count) as [BuildingCategory, number][])
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => ({ label: CATEGORY_LABELS[c], value: v, text: fmt(v) })),
    );
  }
}

export const dashboardModule: GameModule = {
  id: 'dashboard',
  deps: ['pulse', 'inventory'],
  init(ctx) {
    const db = new Dashboard(ctx);
    ctx.systems.add({ id: 'dashboard', phase: 'render', order: 130, update: (_c, f) => db.update(f.dt) });
    ctx.input.onKey((e) => {
      if (e.metaKey || e.ctrlKey) return false;
      if (e.code === 'KeyK') return db.openTab('overview'), true;
      if (e.code === 'KeyI') {
        db.openTab('inventory');
        if (db.isOpen) setTimeout(() => db.inventory.focusSearch());
        return true;
      }
      if (e.code === 'Escape' && db.isOpen) return db.toggle(false), true;
      return false;
    });
    // A rule coming into force is news (D-074): a toast that names it; good ones in green.
    ctx.bus.on('consequence', ({ rule, kind, text }) => {
      if (kind !== 'start' || ctx.loading) return;
      const good = rule === 'harmony-streak' || rule === 'transit-city';
      ctx.bus.emit('toast', { text: `⚖ ${text.split('. ')[0]} (Dashboard → Causes)`, tone: good ? 'ok' : 'bad' });
    });
    ctx.services.provide('dashboard', {
      get isOpen() {
        return db.isOpen;
      },
      toggle: () => db.toggle(),
      openInventory(id?: string) {
        if (!db.isOpen || db.activeTab !== 'inventory') db.openTab('inventory');
        if (id) db.inventory.choose(id);
      },
      openIncidents() {
        if (!db.isOpen || db.activeTab !== 'incidents') db.openTab('incidents');
      },
      openFireworks() {
        if (!db.isOpen || db.activeTab !== 'fireworks') db.openTab('fireworks');
      },
      openCauses() {
        if (!db.isOpen || db.activeTab !== 'causes') db.openTab('causes');
      },
    });
  },
};

declare module '@/core/Services' {
  interface GameServices {
    dashboard: {
      toggle(): void;
      readonly isOpen: boolean;
      /** Opens the Inventory tab, optionally on one object id. */
      openInventory(id?: string): void;
      /** Opens the Incidents tab: fires and ruins now, and the incident log (D-050). */
      openIncidents(): void;
      /** Opens the Fireworks tab: stock, shows so far and their effects (D-068). */
      openFireworks(): void;
      /** Opens the Cause & effect tab: rules in force, stocks and the feed (D-074). */
      openCauses(): void;
    };
  }
}
