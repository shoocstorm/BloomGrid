import type { GameContext, GameModule } from '@/game/context';
import { isCompact } from '@/platform/device';
import { PULSE_TICKS } from '@/sim/pulseConst';
import {
  CRISIS_NAMES,
  DISPATCH_NAMES,
  GOOD_NAMES,
  NEIGHBOURS,
  RIVAL_SECONDS,
  DISPATCH_SECONDS,
  TIERS,
  TRADE_SIZES,
  answerBlock,
  describeDispatch,
  dispatchChoices,
  metricOf,
  neighbour,
  neighbourDef,
  priceOf,
  spareOf,
  surplusOf,
  tierIndex,
  tierOf,
  tradeBlock,
  unitsFor,
} from '@/sim/archipelago';
import type { Dispatch, DispatchKind, Good, NeighbourId, TradeDir } from '@/sim/archipelagoState';
import { closeX } from '@/ui/closeX';
import { h, setText } from '@/ui/dom';
import { holoHead } from '@/ui/holo';
import { icon } from '@/ui/icons';
import { autoCollapse } from '@/ui/idle';
import { U } from '@/render/uniforms';
import { registerPickable } from '@/modules/construction/pick';
import { Mesh } from 'three/webgpu';
import { getMaterial } from '@/render/materials/library';
import { cargoBoat, Horizon, isleModel, islePos } from './horizon';
import './archipelago.css';

export interface ArchipelagoService {
  /** Opens (or closes) the chart, optionally on one neighbour. */
  toggle(open?: boolean, id?: NeighbourId): void;
  readonly isOpen: boolean;
}

declare module '@/core/Services' {
  interface GameServices {
    archipelago: ArchipelagoService;
  }
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const rate = (n: number) => `${n >= 0 ? '+' : '−'}◈${Math.abs(n) < 10 ? Math.abs(n).toFixed(1) : fmt(Math.abs(n))}/s`;
const clock = (ticks: number) => {
  const s = Math.max(0, Math.ceil(ticks / PULSE_TICKS));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** Faction hues on the chart (the neighbour's dot, ring and route). */
const HUE: Record<NeighbourId, string> = { drift: '#ffb35c', concord: '#9fb8d6', lantern: '#e8d58a', kestrel: '#7fe0a6' };
const GOOD_ICON: Record<Good, string> = { energy: 'energy', water: 'water', food: 'food' };
const DISPATCH_ICON: Record<DispatchKind, string> = {
  aid: 'storm',
  families: 'people',
  request: 'scroll',
  offer: 'happy',
  rival: 'star',
  loan: 'credits',
  dive: 'wave',
};
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
/** Chart coordinates: the island at the centre, neighbours at their offsets (tiles), in a −460…460 box. */
const R = 460;
const pct = (v: number) => `${((v + R) / (2 * R)) * 100}%`;

/**
 * The Archipelago (plan v8, Phase 38): a sea chart of the island and its four neighbours (relation rings, trade
 * routes, a storm mark over a struck neighbour) and a pane per neighbour (who they are, their fortunes, what they
 * sell and want at today's prices, the agreements in force with End, Sign by size, what they think of the island and
 * the perk friendship brings, and recent dealings). Opened from the top bar's actions (compass) or **T**; refreshed at
 * 2 Hz while open, nothing while closed.
 */
class Chart {
  readonly el: HTMLElement;
  private open = false;
  private sel: NeighbourId = 'drift';
  private routes = svg('g', { class: 'ar-routes' });
  private rings = svg('g', { class: 'ar-rings' });
  private marks = h('div', { class: 'ar-marks' });
  private pane = h('div', { class: 'ar-pane' });
  private summary = h('div', { class: 'ar-summary' });
  private timer = 0;
  private key = '';

  constructor(private ctx: GameContext) {
    const sea = svg('svg', { class: 'ar-sea', viewBox: `${-R} ${-R} ${2 * R} ${2 * R}`, 'aria-hidden': 'true' });
    for (const r of [120, 240, 360, 450]) sea.append(svg('circle', { cx: 0, cy: 0, r, class: 'ar-swell' }));
    sea.append(svg('path', { d: `M${-R} 0H${R}M0 ${-R}V${R}`, class: 'ar-axis' }), this.routes, this.rings);
    // The home island: a soft blob at the centre.
    sea.append(svg('circle', { cx: 0, cy: 0, r: 70, class: 'ar-home' }), svg('circle', { cx: 0, cy: 0, r: 86, class: 'ar-home-ring' }));
    const stage = h('div', { class: 'ar-stage' }, sea, this.marks, h('div', { class: 'ar-compass', 'aria-hidden': 'true' }, h('b', {}, 'N'), h('i')));
    this.el = h(
      'div',
      { class: 'ar-scrim hidden', onClick: (e: Event) => e.target === this.el && this.toggle(false) },
      h(
        'section',
        { class: 'ar panel holo', role: 'dialog', 'aria-label': 'The Archipelago' },
        h(
          'header',
          { class: 'ar-head' },
          holoHead(icon('compass'), 'Shelf Sea', 'The Archipelago', 'Your neighbours over the horizon · trade, envoys, friendship'),
          this.summary,
          h('kbd', { class: 'cmap-key' }, 'T'),
          h('button', { class: 'icon-btn', title: 'Close (Esc)', 'aria-label': 'Close', onClick: () => this.toggle(false) }, icon('close')),
        ),
        h('div', { class: 'ar-body' }, h('div', { class: 'ar-chartcol' }, stage), this.pane),
      ),
    );
    ctx.hud.append(this.el);
    ctx.input.onKey((e) => {
      if (e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && !e.altKey) return (this.toggle(), true);
      if (e.code === 'Escape' && this.open) return (this.toggle(false), true);
      return false;
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(open = !this.open, id?: NeighbourId): void {
    if (id) this.sel = id;
    // Nothing to chart yet: say who comes when.
    if (open && !this.ctx.city.archipelago.neighbours.some((n) => n.met)) {
      this.ctx.bus.emit('toast', { text: 'No ships on the horizon yet: the Drift sails in once the island reaches the Grove era', tone: 'info' });
      open = false;
    }
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    if (open) {
      if (!neighbour(this.ctx.city, this.sel).met) this.sel = this.ctx.city.archipelago.neighbours.find((n) => n.met)!.id;
      this.key = '';
      this.timer = 1;
    }
  }

  update(dt: number): void {
    if (!this.open) return;
    if ((this.timer += dt) < 0.5) return;
    this.timer = 0;
    this.paint();
  }

  private paint(): void {
    const c = this.ctx.city;
    const st = c.archipelago;
    // The chart's marks and routes change rarely: rebuild them only when contact, tiers, crises or trades change.
    const key = `${st.neighbours.map((n) => `${n.met}${tierIndex(n.relation)}${n.crisis}`).join()}|${st.trades.map((t) => `${t.id}${t.moved > 0}`).join()}|${this.sel}`;
    if (key !== this.key) {
      this.key = key;
      this.paintChart();
    }
    const total = st.trades.reduce((a, t) => a + t.credits, 0);
    this.summary.replaceChildren(
      h('span', { class: 'ar-sum' }, h('i', {}, 'Agreements'), h('b', {}, String(st.trades.length))),
      h('span', { class: `ar-sum ${total >= 0 ? 'ok' : 'bad'}` }, h('i', {}, 'Trade'), h('b', {}, rate(total))),
    );
    this.paintPane();
  }

  private paintChart(): void {
    const c = this.ctx.city;
    const st = c.archipelago;
    this.routes.replaceChildren();
    this.rings.replaceChildren();
    const marks: HTMLElement[] = [];
    for (const def of NEIGHBOURS) {
      const n = neighbour(c, def.id);
      const [x, z] = def.at;
      if (!n.met) {
        marks.push(h('span', { class: 'ar-unknown', style: `left:${pct(x)};top:${pct(z)}`, title: 'Somewhere over the horizon…' }, '?'));
        continue;
      }
      // A route per agreement, bowed a little so two don't overlap; dashed while nothing moves.
      st.trades
        .filter((t) => t.partner === def.id)
        .forEach((t, k) => {
          const bow = (k - 0.5) * 50;
          const mx = x / 2 - (z / Math.hypot(x, z)) * bow;
          const mz = z / 2 + (x / Math.hypot(x, z)) * bow;
          const end = 1 - 95 / Math.hypot(x, z);
          this.routes.append(svg('path', { d: `M0 0Q${mx} ${mz} ${x * end} ${z * end}`, class: `ar-route ${t.good} ${t.moved > 0 ? '' : 'idle'}` }));
        });
      // Relation ring: a full ring at 100, coloured by tier.
      const frac = (n.relation + 100) / 200;
      const len = 2 * Math.PI * 30;
      this.rings.append(
        svg('circle', { cx: x, cy: z, r: 30, class: 'ar-ring-bg' }),
        svg('circle', { cx: x, cy: z, r: 30, class: `ar-ring t-${tierOf(n.relation).id}`, 'stroke-dasharray': `${(len * frac).toFixed(1)} ${len.toFixed(1)}`, transform: `rotate(-90 ${x} ${z})` }),
      );
      marks.push(
        h(
          'button',
          {
            class: `ar-isle ${x < 0 ? 'w' : 'e'}${this.sel === def.id ? ' on' : ''}`,
            style: `left:${pct(x)};top:${pct(z)};--hue:${HUE[def.id]}`,
            title: `${def.name} (${def.faction}): ${tierOf(n.relation).name}`,
            onClick: () => {
              this.sel = def.id;
              this.key = '';
              this.paint();
            },
          },
          h('i', { class: 'ar-dot' }),
          n.crisis ? h('span', { class: 'ar-storm', title: `Struck by ${CRISIS_NAMES[n.crisis]}` }, icon('storm')) : null,
          h('b', {}, def.name),
          h('small', {}, `${def.faction} · ${tierOf(n.relation).name}`),
        ),
      );
    }
    marks.push(h('span', { class: 'ar-home-label', style: `left:50%;top:50%` }, this.ctx.city.growth.name || 'Your island'));
    this.marks.replaceChildren(...marks);
  }

  private paintPane(): void {
    const c = this.ctx.city;
    const def = neighbourDef(this.sel);
    const n = neighbour(c, this.sel);
    const tier = tierOf(n.relation);
    const ti = tierIndex(n.relation);
    const trades = c.archipelago.trades.filter((t) => t.partner === def.id);
    const head = h(
      'div',
      { class: 'ar-who', style: `--hue:${HUE[def.id]}` },
      h('div', { class: 'ar-who-top' }, h('b', {}, def.name), h('span', { class: `ar-tier t-${tier.id}` }, tier.name)),
      h('small', {}, `${def.faction} · ${def.bearing} · ${def.envoy}`),
      h('p', {}, def.line),
      h('div', { class: 'ar-bar', title: `Relation ${Math.round(n.relation)} (−100 … 100)` }, h('i', { style: `width:${((n.relation + 100) / 2).toFixed(1)}%` })),
      h(
        'div',
        { class: 'ar-facts' },
        h('span', {}, h('i', {}, 'Fortunes'), h('b', {}, n.prosperity > 0.7 ? 'Thriving' : n.prosperity > 0.45 ? 'Steady' : n.prosperity > 0.25 ? 'Struggling' : 'In trouble')),
        h('span', {}, h('i', {}, 'Traded'), h('b', {}, `◈${fmt(n.traded)}`)),
        n.crisis ? h('span', { class: 'bad' }, h('i', {}, 'Now'), h('b', {}, `${CRISIS_NAMES[n.crisis]} · ${clock(n.crisisUntil - c.tick)}`)) : null,
      ),
      h('p', { class: `ar-perk${ti >= 3 ? ' on' : ''}` }, icon('star'), ti >= 4 ? `Allied: ${def.perk}.` : ti === 3 ? `Friendly: ${def.perk} (half; in full when Allied).` : `As friends: ${def.perk}.`),
    );
    const rows: HTMLElement[] = [];
    for (const t of trades) {
      rows.push(
        h(
          'div',
          { class: 'ar-deal' },
          h('span', { class: `ar-good ${t.good}` }, icon(GOOD_ICON[t.good])),
          h(
            'div',
            { class: 'ar-deal-t' },
            h('b', {}, `${t.dir === 'export' ? 'Shipping' : 'Buying'} ${GOOD_NAMES[t.good]}${t.premium === 0 ? ' · gift' : t.premium > 1 ? ' · premium' : ''}`),
            h('small', {}, `${fmt(t.moved)} of ${fmt(t.amount)} units/s${t.until ? ` · ends in ${clock(t.until - c.tick)}` : ''}${t.dir === 'export' && t.moved < t.amount ? ' · short: no surplus at home' : ''}`),
          ),
          h('b', { class: `ar-rate ${t.credits >= 0 ? 'ok' : 'bad'}` }, rate(t.credits)),
          h('button', { class: 'btn ghost ar-end', title: t.dir === 'export' ? 'End it (they will mind a little)' : 'End it', onClick: () => this.ctx.commands.execute('endTrade', { id: t.id }) }, 'End'),
        ),
      );
    }
    const offers: HTMLElement[] = [];
    const offer = (good: Good, dir: TradeDir) => {
      const block = tradeBlock(c, def.id, good, dir);
      if (block && /already/.test(block)) return;
      const price = priceOf(c, def.id, good, dir);
      const sub =
        dir === 'export'
          ? `They pay ◈${price.toFixed(3)}/unit · you have ${fmt(Math.max(0, surplusOf(c, good)))} spare`
          : `◈${price.toFixed(3)}/unit · they can spare ${Math.round(spareOf(n, good) * 100)}% now`;
      offers.push(
        h(
          'div',
          { class: 'ar-offer' },
          h('span', { class: `ar-good ${good}` }, icon(GOOD_ICON[good])),
          h('div', { class: 'ar-deal-t' }, h('b', {}, `${dir === 'export' ? 'Sell' : 'Buy'} ${GOOD_NAMES[good]}`), h('small', {}, sub)),
          h(
            'div',
            { class: 'ar-sizes' },
            ...TRADE_SIZES.map((sz, i) => {
              const units = unitsFor(c, good, i);
              return h(
                'button',
                {
                  class: 'btn ghost ar-size',
                  disabled: !!block,
                  title: block ?? `${sz.name}: ${fmt(units)} units/s, about ${rate((dir === 'export' ? 1 : -1) * units * price)} at today's price`,
                  onClick: () => {
                    if (this.ctx.commands.execute('signTrade', { partner: def.id, good, dir, size: i }))
                      this.ctx.bus.emit('toast', { text: `Signed with ${def.name}: ${dir === 'export' ? 'shipping' : 'buying'} ${fmt(units)} ${GOOD_NAMES[good]}/s`, tone: 'ok' });
                    this.paint();
                  },
                },
                sz.name[0]!,
              );
            }),
          ),
        ),
      );
    };
    for (const g of def.sells) offer(g, 'import');
    for (const g of def.wants) offer(g, 'export');
    const log = c.archipelago.log.filter((l) => l.partner === def.id).slice(-5).reverse();
    this.pane.replaceChildren(
      head,
      h('h4', { class: 'ar-sec' }, 'Agreements'),
      rows.length ? h('div', { class: 'ar-list' }, ...rows) : h('p', { class: 'ar-empty' }, 'None in force.'),
      h('h4', { class: 'ar-sec' }, 'Trade'),
      offers.length ? h('div', { class: 'ar-list' }, ...offers) : h('p', { class: 'ar-empty' }, tier.id === 'hostile' ? 'They have an embargo on the island.' : 'Nothing more to agree.'),
      h('h4', { class: 'ar-sec' }, 'Dealings'),
      log.length
        ? h('ul', { class: 'ar-log' }, ...log.map((l) => h('li', {}, h('span', { class: l.delta > 0 ? 'ok' : l.delta < 0 ? 'bad' : '' }, l.delta ? `${l.delta > 0 ? '+' : ''}${l.delta}` : '·'), l.text)))
        : h('p', { class: 'ar-empty' }, 'Nothing yet.'),
    );
  }
}

/**
 * The envoy card (plan v8, Phase 38): the dispatch on the table in the story card's frame, stacked under the other
 * `.jc-m` cards. Two answers with their cost or reward (disabled with the reason when they can't be taken), the time
 * left, and **Chart** to open the Archipelago on that neighbour. A rival bid taken on shows its target and progress.
 */
class DispatchCard {
  private card: HTMLElement;
  private ico = h('span', { class: 'jc-m-ico' });
  private kicker = h('span', { class: 'jc-m-kicker' });
  private left = h('span', { class: 'jc-m-count' });
  private title = h('b', { class: 'jc-m-title' });
  private hint = h('p', { class: 'jc-m-hint st-text' });
  private bar = h('i');
  private act = h('div', { class: 'jc-m-act st-act' });
  private shown = '';
  private dismissed = '';
  private slow = 0;
  private fold: ReturnType<typeof autoCollapse>;

  constructor(
    private ctx: GameContext,
    private chart: Chart,
  ) {
    const head = h('header', { class: 'jc-m-head st-head ar-card-head' }, icon('scroll'), this.kicker, this.left);
    this.card = h(
      'section',
      { class: 'jc-m hp st ar-card panel holo hidden', 'aria-label': 'Envoy', 'aria-live': 'polite' },
      head,
      h('div', { class: 'jc-m-main' }, this.ico, h('div', { class: 'jc-m-text' }, this.title, this.hint)),
      h('div', { class: 'jc-m-bar hp-bar' }, this.bar),
      this.act,
      closeX('this envoy', () => {
        this.dismissed = this.key();
        this.card.classList.add('hidden');
      }),
    );
    ctx.hud.append(this.card);
    this.fold = autoCollapse(this.card, head);
  }

  private key(): string {
    const d = this.ctx.city.archipelago.dispatch;
    return d ? `${d.id}|${d.status}` : '';
  }

  update(dt: number): void {
    if ((this.slow -= dt) > 0) return;
    this.slow = 0.25;
    const c = this.ctx;
    const d = c.city.archipelago.dispatch;
    const live = !c.loading && c.cameraCtl.enabled && !document.body.classList.contains('chapter-open') && !c.services.tryGet('moments')?.playing;
    const show = !!d && live && this.dismissed !== this.key();
    this.card.classList.toggle('hidden', !show);
    if (!show || !d) return;
    // Stack under the other cards on desktops, above them on phones (as the story card does).
    const parent = this.card.parentElement;
    const box = parent?.getBoundingClientRect();
    const rects = [...document.querySelectorAll<HTMLElement>('.jc-m:not(.ar-card):not(.hidden)')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
    const compact = isCompact();
    this.card.style.top = rects.length && box && !compact ? `${Math.max(...rects.map((r) => r.bottom)) - box.top + 8}px` : '';
    this.card.style.bottom = rects.length && box && compact ? `${box.bottom - Math.min(...rects.map((r) => r.top)) + 8}px` : '';
    const total = (d.status === 'goal' ? RIVAL_SECONDS : DISPATCH_SECONDS) * PULSE_TICKS;
    const remain = Math.max(0, d.endTick - c.city.tick);
    this.bar.style.transform = `scaleX(${(remain / total).toFixed(3)})`;
    setText(this.left, clock(remain));
    if (d.status === 'goal') setText(this.hint, describeDispatch(c.city, d));
    const k = `${this.key()}|${answerBlock(c.city, 0) ?? ''}`;
    if (k === this.shown) return;
    this.shown = k;
    this.fold.wake();
    this.render(d);
  }

  private render(d: Dispatch): void {
    const c = this.ctx;
    const def = neighbourDef(d.from);
    setText(this.kicker, `Envoy · ${def.name}`);
    setText(this.title, `${DISPATCH_NAMES[d.kind]} · ${def.faction}`);
    setText(this.hint, describeDispatch(c.city, d));
    this.ico.replaceChildren(icon(DISPATCH_ICON[d.kind]));
    const chart = h('button', { class: 'jc-do st-visit', title: `Open the Archipelago on ${def.name}`, onClick: () => this.chart.toggle(true, d.from) }, icon('compass'), 'Chart');
    if (d.status === 'goal') {
      const metric = d.metric === 'harmony' ? 'harmony' : 'ecology';
      this.act.replaceChildren(
        h('div', { class: 'st-row' }, h('span', { class: 'ar-goal' }, `${metric}: ${metricOf(c.city, d.metric!).toFixed(1)} / ${d.target}`), chart),
      );
      return;
    }
    const labels = dispatchChoices(d);
    const price = (i: number): string | null => {
      if (i !== 0) return null;
      if (d.kind === 'aid') return `◈${fmt(d.credits!)}`;
      if (d.kind === 'offer' || d.kind === 'dive' || d.kind === 'loan') return `+◈${fmt(d.credits!)}`;
      if (d.kind === 'families') return `${d.residents} residents`;
      if (d.kind === 'request') return `${fmt(d.amount!)} ${GOOD_NAMES[d.good!]}/s`;
      return null;
    };
    const choices = labels.map((label, i) => {
      const block = answerBlock(c.city, i);
      const cost = price(i);
      return h(
        'button',
        {
          class: `jc-do st-choice ${i === 0 ? 'primary' : ''}`,
          disabled: !!block,
          title: block ?? label,
          onClick: () => c.commands.execute('answerDispatch', { id: d.id, choice: i }, false),
        },
        label,
        cost ? h('span', { class: 'st-cost' }, cost) : null,
      );
    });
    this.act.replaceChildren(h('div', { class: 'st-choices' }, ...choices), h('div', { class: 'st-row' }, chart));
  }
}

/** Toasts and a minor moment for the Archipelago's news. */
function listen(ctx: GameContext, chart: Chart): void {
  const { bus } = ctx;
  // Contact made on the very first pulses of a city (the showcase, an old save) is not news: it was always there.
  let settled = 0;
  const quiet = () => ctx.loading || ctx.city.tick < settled;
  for (const ev of ['city:reset', 'load:done'] as const) bus.on(ev, () => (settled = ctx.city.tick + 3 * PULSE_TICKS));
  const at = (id: NeighbourId) => neighbourDef(id);
  bus.on('archipelago:contact', ({ id }) => {
    if (quiet()) return;
    const def = at(id);
    ctx.services.tryGet('moments')?.play({
      id: `contact:${id}`,
      scale: 'minor',
      tone: 'bloom',
      emblem: 'compass',
      eyebrow: `First contact · ${def.faction}`,
      title: def.name,
      lines: [def.line, `${def.envoy} sends greetings from the ${def.bearing}.`],
      sub: 'Open the Archipelago (T) to trade with them.',
      sound: 'milestone',
    });
  });
  bus.on('archipelago:dispatch', ({ dispatch: d }) => {
    if (quiet() || d.status !== 'open') return;
    bus.emit('toast', { text: `${at(d.from).envoy} of ${at(d.from).name}: ${DISPATCH_NAMES[d.kind].toLowerCase()}`, tone: 'info' });
    bus.emit('juice', { sound: 'claimable' });
  });
  bus.on('archipelago:tier', ({ id, tier, up }) => {
    if (quiet()) return;
    const name = TIERS.find((t) => t.id === tier)?.name ?? tier;
    bus.emit('toast', {
      text: tier === 'hostile' ? `${at(id).name} has turned Hostile: an embargo, every agreement with them ended` : `${at(id).name} is now ${name}${up && (tier === 'friendly' || tier === 'allied') ? `: ${at(id).perk.toLowerCase()}` : ''}`,
      tone: up ? 'ok' : 'bad',
    });
  });
  bus.on('archipelago:crisis', ({ id, crisis, coming }) => {
    if (quiet() || !crisis) return;
    bus.emit('toast', {
      text: coming ? `${at(id).name} was struck by ${CRISIS_NAMES[crisis]}, and it is heading for the island` : `${at(id).name} was struck by ${CRISIS_NAMES[crisis]}`,
      tone: coming ? 'bad' : 'info',
    });
  });
  bus.on('archipelago:answered', ({ dispatch: d, outcome }) => {
    if (quiet() || d.kind !== 'rival') return;
    if (outcome === 'won') bus.emit('toast', { text: 'The Drift chose the island for its regatta!', tone: 'ok' });
    else if (outcome === 'lost') bus.emit('toast', { text: 'The Drift regatta went to Kestrel Cay', tone: 'bad' });
  });
  void chart;
}

export const archipelagoModule: GameModule = {
  id: 'archipelago',
  deps: ['hud', 'moments', 'juice', 'happenings', 'stories'],
  init(ctx) {
    const chart = new Chart(ctx);
    const card = new DispatchCard(ctx, chart);
    listen(ctx, chart);
    const btn = h(
      'button',
      { class: 'icon-btn ar-btn hidden', title: 'The Archipelago: neighbours and trade (T)', 'aria-label': 'Open the Archipelago', onClick: () => chart.toggle() },
      icon('compass'),
    );
    ctx.services.get('hud').lead.append(btn);
    // On the horizon (Phase 39): the neighbours far out at sea, a squall over one in trouble, a boat per agreement.
    const S = ctx.city.size;
    const horizon = new Horizon(S);
    ctx.scene.add(horizon.group);
    const hud = ctx.services.get('hud');
    for (const def of NEIGHBOURS) {
      const key = `isle:${def.id}`;
      registerPickable({ object: key, node: horizon.isles.get(def.id)!, box: Horizon.box(def.id) });
      hud.objectInspector(key, () => {
        const n = neighbour(ctx.city, def.id);
        if (!n.met) return null;
        const trades = ctx.city.archipelago.trades.filter((t) => t.partner === def.id);
        return {
          glyph: 'compass',
          code: def.faction.toUpperCase(),
          place: `Over the horizon, ${def.bearing}`,
          title: def.name,
          desc: def.line,
          vitals: [
            ['happy', 'Relation', `${tierOf(n.relation).name} (${Math.round(n.relation)})`, tierIndex(n.relation) >= 3 ? 'good' : tierIndex(n.relation) <= 1 ? 'bad' : ''],
            ['credits', 'Trade', rate(trades.reduce((a, t) => a + t.credits, 0))],
            ['storm', 'Now', n.crisis ? CRISIS_NAMES[n.crisis] : 'Calm', n.crisis ? 'bad' : ''],
          ],
          rows: [
            ['Envoy', def.envoy],
            ['Sells', def.sells.map((g) => GOOD_NAMES[g]).join(', ') || 'Nothing to ship'],
            ['Buys', def.wants.map((g) => GOOD_NAMES[g]).join(', ')],
            ['Agreements', String(trades.length)],
          ],
          note: tierIndex(n.relation) >= 3 ? `${def.perk}.` : undefined,
          actions: [h('button', { class: 'btn', onClick: () => chart.toggle(true, def.id) }, icon('compass'), 'Open the chart')],
        };
      });
    }
    // The model gallery's Archipelago hall (D-171): the four neighbours and the cargo boat.
    const gallery = ctx.services.tryGet('gallery');
    const model = (k: ReturnType<typeof cargoBoat>) => ({ object: new Mesh(k.b.build(), getMaterial('wonder')) });
    for (const def of NEIGHBOURS)
      gallery?.add({
        id: `isle:${def.id}`,
        name: def.name,
        group: 'Archipelago',
        blurb: def.line,
        facts: [
          ['Faction', def.faction],
          ['Bearing', def.bearing],
          ['Envoy', def.envoy],
          ['Sells', def.sells.map((g) => GOOD_NAMES[g]).join(', ') || 'Nothing to ship'],
        ],
        water: true,
        build: () => model(isleModel(def.id)),
      });
    gallery?.add({
      id: 'trade-boat',
      name: 'Cargo boat',
      group: 'Archipelago',
      blurb: 'A small coaster that carries an agreement’s energy cells, water tanks or crates of food between the island and its partner.',
      water: true,
      build: () => model(cargoBoat()),
    });
    // Each boat sails out and back along its agreement's line, offset by the agreement so two don't sail together.
    const TRIP = 150;
    // A boat leaves just past the island's last land on its partner's line (scanned once per partner).
    const ports = new Map<NeighbourId, number>();
    const portFor = (id: NeighbourId, ux: number, uz: number): number => {
      let r = ports.get(id);
      if (r !== undefined) return r;
      r = 0;
      for (let k = 0; k < S; k++) {
        const x = Math.floor(S / 2 + ux * k);
        const z = Math.floor(S / 2 + uz * k);
        if (x < 0 || z < 0 || x >= S || z >= S) break;
        if (!ctx.city.isWaterTile(x, z)) r = k;
      }
      ports.set(id, (r += 10));
      return r;
    };
    const sailBoats = () => {
      const trades = ctx.city.archipelago.trades;
      horizon.boats.forEach((b, i) => {
        const t = trades[i];
        b.visible = !!t;
        if (!t) return;
        const [ix, iz] = islePos(t.partner, S);
        const dx = ix - S / 2;
        const dz = iz - S / 2;
        const d = Math.hypot(dx, dz);
        const [ux, uz] = [dx / d, dz / d];
        const from = portFor(t.partner, ux, uz);
        const to = d - 60;
        const p = ((U.clock.value / TRIP + t.id * 0.37) % 2 + 2) % 2;
        const out = p < 1;
        // Ease into and out of port; a sideways lane per direction so the two legs pass apart.
        const f = out ? p : 2 - p;
        const e = f * f * (3 - 2 * f);
        const along = from + (to - from) * e;
        const side = out ? 6 : -6;
        b.position.set(S / 2 + ux * along - uz * side, 0.1, S / 2 + uz * along + ux * side);
        b.rotation.y = Math.atan2(ux, uz) + (out ? 0 : Math.PI);
      });
    };
    ctx.services.provide('archipelago', {
      toggle: (o, id) => chart.toggle(o, id),
      get isOpen() {
        return chart.isOpen;
      },
    });
    // Drill: ?dispatch=<kind>:<neighbour> puts an envoy on the table once the city is up (like ?happening=).
    let drill = new URLSearchParams(location.search).get('dispatch');
    let slow = 0;
    ctx.systems.add({
      id: 'archipelago.ui',
      phase: 'render',
      order: 92,
      update: (c, f) => {
        if (drill && !c.loading && c.city.tick > 0) {
          const [kind, from] = drill.split(':') as [DispatchKind, NeighbourId];
          void import('@/sim/archipelago').then((m) => {
            if (!m.startDispatch(c.city, kind, from ?? 'drift')) console.warn(`[archipelago] can't send "${drill}" now`);
          });
          drill = null;
        }
        if ((slow -= f.dt) <= 0) {
          slow = 0.5;
          btn.classList.toggle('hidden', !c.city.archipelago.neighbours.some((n) => n.met));
          horizon.sync((id) => neighbour(c.city, id).met, (id) => !!neighbour(c.city, id).crisis);
        }
        if (c.city.archipelago.trades.length || horizon.boats[0]!.visible) sailBoats();
        chart.update(f.dt);
        card.update(f.dt);
      },
    });
  },
};
