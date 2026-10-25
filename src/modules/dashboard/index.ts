import { query } from 'bitecs';
import type { GameContext, GameModule } from '@/game/context';
import { Building } from '@/ecs/components';
import { buildings } from '@/content';
import { CATEGORY_LABELS, type BuildingCategory } from '@/content/types';
import { SYSTEMS, TIERS, type HistoryMetric } from '@/sim/pulseState';
import { h, setText } from '@/ui/dom';
import { SYSTEM_LABELS } from '@/modules/pulse/PulsePanel';
import { INCOME_SCALE } from '@/sim/pulse';
import { LineChart } from './LineChart';
import './dashboard.css';

const HISTORY_STEP = 10; // sim seconds per history sample
const fmt = (n: number) => Math.round(n).toLocaleString();
const signed = (n: number, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
const TIER_ICON = ['●', '●', '▲', '◆', '✖'];

interface Tile {
  value: HTMLElement;
  sub: HTMLElement;
}

/**
 * City dashboard (K): headline tiles, trend small-multiples (one series per chart), budget
 * and land-use breakdowns, and system health with icon + label. Refreshes ~1 Hz while open.
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

  constructor(private ctx: GameContext) {
    const tiles = h('div', { class: 'db-tiles' });
    for (const [id, label] of [
      ['pop', 'Residents'],
      ['credits', 'Treasury'],
      ['harmony', 'Harmony'],
      ['energy', 'Energy supply'],
      ['water', 'Water supply'],
      ['food', 'Food supply'],
      ['jobs', 'Employment'],
    ]) {
      const value = h('div', { class: 'db-tile-v' });
      const sub = h('div', { class: 'db-tile-s' });
      this.tiles.set(id!, { value, sub });
      tiles.append(h('div', { class: 'db-tile' }, h('div', { class: 'db-tile-k' }, label!), value, sub));
    }

    const charts = h('div', { class: 'db-charts' });
    for (const [metric, label, format] of [
      ['population', 'Residents', fmt],
      ['credits', 'Treasury (credits)', fmt],
      ['net', 'Net income (/s)', (v: number) => signed(v)],
      ['happiness', 'Harmony', (v: number) => v.toFixed(0)],
      ['energyBalance', 'Energy surplus', (v: number) => signed(v, 0)],
      ['waterBalance', 'Water surplus', (v: number) => signed(v, 0)],
      ['bloom', 'Bloom index', (v: number) => `${Math.round(v * 100)}%`],
    ] as [HistoryMetric, string, (v: number) => string][]) {
      const chart = new LineChart({ format, step: HISTORY_STEP });
      this.charts.push({ metric, chart });
      charts.append(h('figure', { class: 'db-chart' }, h('figcaption', {}, label), chart.el));
    }

    this.el = h(
      'div',
      { class: 'db-scrim hidden', onClick: (e: Event) => e.target === this.el && this.toggle(false) },
      h(
        'section',
        { class: 'db panel', role: 'dialog', 'aria-label': 'City dashboard' },
        h('header', { class: 'db-head' }, h('h2', {}, 'City Dashboard'), h('span', { class: 'db-hint' }, 'K to close'), h('button', { class: 'icon-btn', onClick: () => this.toggle(false) }, '✕')),
        tiles,
        h('h3', {}, 'Trends · last 40 sim-minutes'),
        charts,
        h(
          'div',
          { class: 'db-cols' },
          h('div', {}, h('h3', {}, 'System health'), this.health),
          h('div', {}, h('h3', {}, 'Budget per second'), this.budget),
          h('div', {}, h('h3', {}, 'Land use'), this.landuse),
        ),
      ),
    );
    ctx.hud.append(this.el);
  }

  toggle(open = !this.open): void {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    if (open) this.refresh();
  }

  update(dt: number): void {
    if (!this.open) return;
    this.timer += dt;
    if (this.timer < 1) return;
    this.timer = 0;
    this.refresh();
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
    set('credits', fmt(city.credits), `${signed(s.income - s.upkeep)}/s net`);
    set('harmony', Math.round(s.happiness).toString(), `${signed(delta('happiness'))} in 1 min`);
    set('energy', `${Math.round(p.energyRatio * 100)}%`, `${fmt(s.energyProduced)} made / ${fmt(s.energyUsed)} used`);
    set('water', `${Math.round(p.waterRatio * 100)}%`, `${fmt(s.waterProduced)} made / ${fmt(s.waterUsed)} used`);
    set('food', `${Math.round(p.foodRatio * 100)}%`, `${fmt(s.foodProduced)} fed of ${fmt(s.population)}`);
    set('jobs', `${Math.round((1 - p.unemployment) * 100)}%`, `${fmt(s.employed)} employed · ${fmt(s.jobs)} jobs`);

    for (const { metric, chart } of this.charts) chart.setData(hist[metric]);

    this.health.replaceChildren(
      ...SYSTEMS.map((k) => {
        const t = p.tiers[k];
        return h('div', { class: `db-tier t${t}` }, h('span', { class: 'db-tier-i', 'aria-hidden': 'true' }, TIER_ICON[t]!), h('span', {}, SYSTEM_LABELS[k]), h('b', {}, TIERS[t]));
      }),
    );

    // Budget and land use from live entities.
    const upkeep: Partial<Record<BuildingCategory, number>> = {};
    const count: Partial<Record<BuildingCategory, number>> = {};
    for (const eid of query(city.world, [Building])) {
      const d = buildings.at(Building.def[eid]!);
      upkeep[d.category] = (upkeep[d.category] ?? 0) + d.stats.upkeep;
      count[d.category] = (count[d.category] ?? 0) + 1;
    }
    const residentsTax = s.population * 0.6 * p.taxRate * INCOME_SCALE;
    const workersTax = s.employed * 0.4 * p.taxRate * INCOME_SCALE;
    this.bars(this.budget, [
      { label: 'Resident tax', value: residentsTax, text: signed(residentsTax) },
      { label: 'Worker tax', value: workersTax, text: signed(workersTax) },
      ...(Object.entries(upkeep) as [BuildingCategory, number][])
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => ({ label: `${CATEGORY_LABELS[c]} upkeep`, value: v, text: signed(-v), neg: true })),
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
  deps: ['pulse'],
  init(ctx) {
    const db = new Dashboard(ctx);
    ctx.systems.add({ id: 'dashboard', phase: 'render', order: 130, update: (_c, f) => db.update(f.dt) });
    ctx.input.onKey((e) => {
      if (e.code === 'KeyK' && !e.metaKey && !e.ctrlKey) return db.toggle(), true;
      return false;
    });
    ctx.services.provide('dashboard', { toggle: () => db.toggle() });
  },
};

declare module '@/core/Services' {
  interface GameServices {
    dashboard: { toggle(): void };
  }
}
