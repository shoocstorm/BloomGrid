import { SYSTEMS, TAX_MAX, TAX_MIN, TIERS, type HistoryMetric, type SystemKey } from '@/sim/pulseState';
import type { GameContext } from '@/game/context';
import { h, setText } from '@/ui/dom';
import { LOAN_SIZES, creditLimit, totalDebt } from '@/sim/finance';
import { isCompact, onCompactChange } from '@/platform/device';

/** A console tab's handle: bring it forward, or mark its button (e.g. Flora-Net's urgent count). */
export interface ConsoleTab {
  select(): void;
  setBadge(text: string, tone?: 'warn' | 'crit' | ''): void;
  readonly selected: boolean;
}

export interface PulseService {
  /**
   * Adds a tab to the City Pulse console (desktops). The elements move into the tab from wherever they were
   * appended (their phone home), and go back there on phones, where the console shows only the pulse.
   */
  addTab(id: string, label: string, glyph: string, ...els: HTMLElement[]): ConsoleTab;
  /** Folded to its header? */
  readonly collapsed: boolean;
  fold(folded: boolean): void;
}

declare module '@/core/Services' {
  interface GameServices {
    pulse: PulseService;
  }
}

const TAB_KEY = 'bloomgrid.console.tab';

export const SYSTEM_LABELS: Record<SystemKey, string> = {
  energy: 'Energy grid',
  water: 'Water supply',
  food: 'Food',
  jobs: 'Employment',
  mobility: 'Mobility',
  ecology: 'Ecology',
  harmony: 'Harmony',
  budget: 'Budget',
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString();

/** Draws a tiny sparkline of a history metric into a canvas. */
function sparkline(canvas: HTMLCanvasElement, data: number[], color: string): void {
  const dpr = Math.min(2, window.devicePixelRatio);
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight;
  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr;
    canvas.height = hgt * dpr;
  }
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hgt);
  if (data.length < 2) return;
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  g.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = hgt - 2 - ((v - min) / span) * (hgt - 4);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.stroke();
}

/**
 * City Pulse console: the steward's one panel on desktops (D-056), a full-height column on the left with tabs.
 * Pulse (system health tiers, demand meters, budget with tax control, harmony breakdown, trend sparklines) is its
 * own; other modules add theirs through the `pulse` service (Build: the HUD's tools and building cards; Lenses;
 * Flora-Net), so the bottom toolbar, the lens bar and the advisor no longer cover the city. Phones keep their chips
 * and sheets: there the console shows only the pulse, and adopted elements go back to their own places. Updates
 * are throttled and text-diffed.
 */
export class PulsePanel {
  readonly el: HTMLElement;
  private rows = new Map<SystemKey, { dot: HTMLElement; tier: HTMLElement; val: HTMLElement }>();
  private demand = new Map<string, HTMLElement>();
  private budget = new Map<string, HTMLElement>();
  private harmony = new Map<string, HTMLElement>();
  private sparks: { canvas: HTMLCanvasElement; metric: HistoryMetric; color: string; label: HTMLElement }[] = [];
  private taxInput: HTMLInputElement;
  private taxLabel: HTMLElement;
  private bloomEl!: HTMLElement;
  private cleanEl!: HTMLElement;
  private nightEl!: HTMLElement;
  private soilEl!: HTMLElement;
  private seaEl!: HTMLElement;
  private owed!: HTMLElement;
  private funding!: HTMLElement;
  private loanBtns: [number, HTMLButtonElement][] = [];
  private repayBtn!: HTMLButtonElement;
  private timer = 0;
  private tabsEl = h('div', { class: 'con-tabs', role: 'tablist' });
  private panes = h('div', { class: 'con-panes' });
  private tabs: { id: string; btn: HTMLElement; pane: HTMLElement; els: { el: HTMLElement; home: HTMLElement; next: Node | null }[] }[] = [];
  private current = 'pulse';

  constructor(private ctx: GameContext) {
    const body = h('div', { class: 'pulse-body' });
    this.el = h(
      'section',
      { class: 'pulse panel' },
      h('button', { class: 'pulse-head', onClick: () => this.el.classList.toggle('collapsed'), title: 'Toggle (P)' }, h('span', { class: 'pulse-orb' }), 'City Pulse'),
      this.tabsEl,
      this.panes,
    );
    this.addTab('pulse', 'Pulse', '◉', body);
    try {
      this.current = localStorage.getItem(TAB_KEY) ?? 'pulse';
    } catch {
      /* storage blocked: start on the pulse */
    }
    onCompactChange(() => this.place());

    this.bloomEl = h('b');
    this.cleanEl = h('b');
    this.nightEl = h('b');
    this.soilEl = h('b');
    this.seaEl = h('b');
    const bloomSec = h(
      'div',
      { class: 'pulse-sec' },
      h('div', { class: 'pulse-title' }, 'Seasonal bloom'),
      h('div', { class: 'kv' }, h('span', {}, 'Bloom index'), this.bloomEl),
      h('div', { class: 'kv' }, h('span', {}, 'Clean energy'), this.cleanEl),
      h('div', { class: 'kv', title: 'Pedestrian activity across the built city; night glow follows it' }, h('span', {}, 'Night life'), this.nightEl),
      h('div', { class: 'kv', title: 'Flora-Net: built zones with moist, nourished soil (Soil water / Nutrients lenses)' }, h('span', {}, 'Soil health'), this.soilEl),
      h('div', { class: 'kv', title: 'Sea-level rise so far (Flood risk lens); Mangrove Seawalls protect the coast' }, h('span', {}, 'Sea level'), this.seaEl),
    );
    const health = h('div', { class: 'pulse-sec' }, h('div', { class: 'pulse-title' }, 'System health'));
    for (const k of SYSTEMS) {
      const dot = h('i', { class: 'tier-dot' });
      const tier = h('span', { class: 'tier-name' });
      const val = h('span', { class: 'tier-val' });
      this.rows.set(k, { dot, tier, val });
      health.append(h('div', { class: 'tier-row' }, dot, h('span', { class: 'tier-label' }, SYSTEM_LABELS[k]), val, tier));
    }

    const demand = h('div', { class: 'pulse-sec' }, h('div', { class: 'pulse-title' }, 'Demand'));
    for (const [id, label] of [
      ['homes', 'Homes'],
      ['work', 'Work'],
      ['food', 'Food'],
    ]) {
      const fill = h('i');
      this.demand.set(id!, fill);
      demand.append(h('div', { class: 'demand-row' }, h('span', {}, label!), h('div', { class: 'demand-bar' }, h('b'), fill)));
    }

    this.taxInput = h('input', { type: 'range', min: TAX_MIN * 100, max: TAX_MAX * 100, step: 1 }) as HTMLInputElement;
    this.taxLabel = h('b');
    this.taxInput.addEventListener('input', () => setText(this.taxLabel, `${this.taxInput.value}%`));
    this.taxInput.addEventListener('change', () => ctx.commands.execute('setTax', { rate: Number(this.taxInput.value) / 100 }));
    const budget = h('div', { class: 'pulse-sec' }, h('div', { class: 'pulse-title' }, 'Budget (per second)'));
    for (const [id, label] of [
      ['income', 'Tax income'],
      ['upkeep', 'Upkeep'],
      ['debt', 'Loan repayments'],
      ['net', 'Net'],
    ]) {
      const v = h('b');
      this.budget.set(id!, v);
      budget.append(h('div', { class: 'kv' }, h('span', {}, label!), v));
    }
    budget.append(h('div', { class: 'kv tax' }, h('span', {}, 'Tax rate'), this.taxInput, this.taxLabel));
    this.owed = h('b');
    this.funding = h('b');
    budget.append(h('div', { class: 'kv' }, h('span', {}, 'Owed'), this.owed), h('div', { class: 'kv' }, h('span', {}, 'Maintenance'), this.funding));
    const loans = h('div', { class: 'loan-row' });
    for (const amount of LOAN_SIZES) {
      const b = h('button', { onClick: () => ctx.commands.execute('takeLoan', { amount }) }, `Borrow ${amount / 1000}k`) as HTMLButtonElement;
      this.loanBtns.push([amount, b]);
      loans.append(b);
    }
    this.repayBtn = h('button', { onClick: () => this.repayAll() }, 'Repay') as HTMLButtonElement;
    loans.append(this.repayBtn);
    budget.append(loans);

    const harmony = h('div', { class: 'pulse-sec' }, h('div', { class: 'pulse-title' }, 'Harmony factors'));
    for (const [id, label] of [
      ['ecology', 'Ecology'],
      ['services', 'Power & water'],
      ['jobs', 'Jobs'],
      ['food', 'Food'],
      ['taxes', 'Taxes'],
      ['amenities', 'Amenities'],
      ['crises', 'Crises'],
      ['bloom', 'Bloom'],
      ['traffic', 'Traffic'],
    ]) {
      const v = h('b');
      this.harmony.set(id!, v);
      harmony.append(h('div', { class: 'kv' }, h('span', {}, label!), v));
    }

    const trends = h('div', { class: 'pulse-sec' }, h('div', { class: 'pulse-title' }, 'Trends'));
    for (const [metric, label, color] of [
      ['population', 'Residents', '#5ff2da'],
      ['credits', 'Credits', '#ffcf6a'],
      ['happiness', 'Harmony', '#ff9fc4'],
    ] as [HistoryMetric, string, string][]) {
      const canvas = h('canvas', { class: 'spark' }) as HTMLCanvasElement;
      const lab = h('span', { class: 'spark-val' });
      this.sparks.push({ canvas, metric, color, label: lab });
      trends.append(h('div', { class: 'spark-row' }, h('span', {}, label), canvas, lab));
    }

    body.append(health, bloomSec, demand, budget, harmony, trends);
    ctx.hud.append(this.el);
    // The telemetry strip lives under the header, so it stays visible when the panel is folded.
    this.el.insertBefore(ctx.services.get('hud').readout, this.tabsEl);
    ctx.services.get('hud').sheet(this.el);
    ctx.input.onKey((e) => {
      if (e.code === 'KeyP' && !e.metaKey && !e.ctrlKey) {
        this.el.classList.toggle('collapsed');
        return true;
      }
      return false;
    });
    this.refresh();
  }

  /** See `PulseService.addTab`. The pulse tab's own body has no other home. */
  addTab(id: string, label: string, glyph: string, ...els: HTMLElement[]): ConsoleTab {
    const pane = h('div', { class: `con-pane p-${id}`, role: 'tabpanel' });
    const badge = h('span', { class: 'con-badge' });
    const btn = h(
      'button',
      { class: 'con-tab', role: 'tab', title: label, onClick: () => this.select(id, true) },
      h('span', { class: 'g' }, glyph),
      h('span', { class: 'l' }, label),
      badge,
    );
    this.tabsEl.append(btn);
    this.panes.append(pane);
    const tab = { id, btn, pane, els: els.map((el) => ({ el, home: el.parentElement ?? this.ctx.hud, next: el.nextSibling })) };
    this.tabs.push(tab);
    this.place();
    const isOn = () => this.current === id && !this.collapsed && !isCompact();
    return {
      select: () => this.select(id, true),
      setBadge: (text, tone = '') => {
        setText(badge, text);
        badge.className = `con-badge ${tone}`;
      },
      get selected() {
        return isOn();
      },
    };
  }

  get collapsed(): boolean {
    return this.el.classList.contains('collapsed');
  }

  /**
   * Shows tab `id`; `open` also unfolds the console. `remember` keeps it as the desktop tab (phones show the pulse
   * without forgetting it).
   */
  select(id: string, open = false, remember = true): void {
    if (!this.tabs.some((t) => t.id === id)) id = 'pulse';
    if (remember) {
      this.current = id;
      try {
        localStorage.setItem(TAB_KEY, id);
      } catch {
        /* storage blocked: the choice lasts the session */
      }
    }
    if (open) this.el.classList.remove('collapsed');
    for (const t of this.tabs) {
      const on = t.id === id;
      t.btn.classList.toggle('on', on);
      t.btn.setAttribute('aria-selected', String(on));
      t.pane.classList.toggle('on', on);
    }
    if (id === 'pulse' && this.rows.size) this.refresh();
  }

  /** Puts adopted elements in their tabs (desktop) or back in their own places (phones). */
  private place(): void {
    const compact = isCompact();
    for (const t of this.tabs)
      for (const e of t.els) {
        if (t.id === 'pulse') {
          if (e.el.parentElement !== t.pane) t.pane.append(e.el);
        } else if (compact) {
          if (e.el.parentElement === t.pane) e.home.insertBefore(e.el, e.next && e.next.parentNode === e.home ? e.next : null);
        } else if (e.el.parentElement !== t.pane) t.pane.append(e.el);
      }
    this.el.classList.toggle('console', !compact);
    this.select(compact ? 'pulse' : this.current, false, false);
  }

  /** Repays loans (oldest first) while the treasury can afford them. */
  private repayAll(): void {
    for (const l of [...this.ctx.city.steward.loans]) if (this.ctx.city.credits >= l.remaining) this.ctx.commands.execute('repayLoan', { id: l.id });
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.timer < 0.5) return;
    this.timer = 0;
    this.refresh();
  }

  private refresh(): void {
    const { city } = this.ctx;
    const p = city.pulse;
    const s = city.stats;
    const values: Record<SystemKey, string> = {
      energy: s.energyUsed ? pct(p.energyRatio) : '—',
      water: s.waterUsed ? pct(p.waterRatio) : '—',
      food: s.population > 1 ? pct(p.foodRatio) : '—',
      jobs: `${pct(p.unemployment)} idle`,
      mobility: p.commuters > 50 ? `${pct(p.flow)} flow` : '—',
      ecology: fmt(s.eco),
      harmony: `${Math.round(s.happiness)}`,
      budget: `${fmt(city.credits)}`,
    };
    for (const k of SYSTEMS) {
      const r = this.rows.get(k)!;
      const t = p.tiers[k];
      r.dot.className = `tier-dot t${t}`;
      setText(r.tier, TIERS[t]);
      r.tier.className = `tier-name t${t}`;
      setText(r.val, values[k]);
    }
    const bar = (id: string, v: number) => {
      const el = this.demand.get(id)!;
      el.style.left = v >= 0 ? '50%' : `${50 + v * 50}%`;
      el.style.width = `${Math.abs(v) * 50}%`;
      el.className = v >= 0 ? 'pos' : 'neg';
    };
    bar('homes', s.demandHomes);
    bar('work', s.demandWork);
    bar('food', s.demandFood);
    setText(this.bloomEl, `${Math.round(p.bloomIndex * 100)}%`);
    setText(this.cleanEl, `${Math.round(p.cleanShare * 100)}%`);
    setText(this.nightEl, `${Math.round(p.nightlife * 100)}%`);
    setText(this.seaEl, city.steward.seaRise > 0.005 ? `+${city.steward.seaRise.toFixed(2)} m` : 'steady');
    setText(this.soilEl, `${Math.round(p.soilHealth * 100)}%${p.dryZones ? ` · ${p.dryZones} dry` : ''}`);
    const net = s.income - s.upkeep - s.debtService;
    setText(this.budget.get('debt')!, s.debtService > 0 ? `−${s.debtService.toFixed(1)}` : '0');
    const owed = totalDebt(city);
    setText(this.owed, owed > 0 ? Math.round(owed).toLocaleString() : 'none');
    const f = city.steward.funding;
    setText(this.funding, f >= 1 ? 'Fully funded' : `Austerity (${Math.round(f * 100)}%)`);
    this.funding.className = f >= 1 ? 'good' : 'bad';
    const limit = creditLimit(city);
    for (const [amount, b] of this.loanBtns) b.disabled = amount > limit;
    this.repayBtn.disabled = owed <= 0 || city.credits < Math.min(...city.steward.loans.map((l) => l.remaining));
    setText(this.budget.get('income')!, `+${s.income.toFixed(1)}`);
    setText(this.budget.get('upkeep')!, `−${s.upkeep.toFixed(1)}`);
    const n = this.budget.get('net')!;
    setText(n, `${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(1)}`);
    n.className = net >= 0 ? 'good' : 'bad';
    if (document.activeElement !== this.taxInput) {
      this.taxInput.value = String(Math.round(p.taxRate * 100));
      setText(this.taxLabel, `${Math.round(p.taxRate * 100)}%`);
    }
    for (const [id, el] of this.harmony) {
      const v = p.harmony[id as keyof typeof p.harmony];
      setText(el, `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`);
      el.className = v >= 0 ? 'good' : 'bad';
    }
    if (!this.el.classList.contains('collapsed') && this.current === 'pulse') {
      for (const sp of this.sparks) {
        const data = p.history[sp.metric];
        sparkline(sp.canvas, data, sp.color);
        setText(sp.label, data.length ? fmt(data[data.length - 1]!) : '—');
      }
    }
  }
}
