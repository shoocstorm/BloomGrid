import type { GameContext, GameModule } from '@/game/context';
import { buildings } from '@/content';
import type { BuildingCategory } from '@/content/types';
import { STAT_IDS, statGuide, type GuideLever, type GuidePart, type StatGuide, type StatId } from '@/sim/statGuide';
import { proposeBuilds, type BuildProposal } from '@/sim/proposals';
import { findSites } from '@/sim/actionTools';
import { buildingId } from '@/sim/inventory';
import { floraLocked } from '@/sim/flora';
import { isCompact } from '@/platform/device';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import './statinfo.css';

const fmt = (n: number) => Math.round(n).toLocaleString();
const SVG = 'http://www.w3.org/2000/svg';
/** Refresh at most this often (ms): the pulse fires faster at 3× and 8×. */
const REFRESH_MS = 500;
/** Proposals walk lots (`findSites`): re-plan only this often while the panel stays open. */
const PLAN_MS = 8000;
/** History samples drawn: one per 10 sim seconds, so 15 sim minutes. */
const SPARK_SAMPLES = 90;

const CATEGORY_ICON: Record<BuildingCategory, string> = {
  residential: 'house',
  energy: 'energy',
  utility: 'water',
  tech: 'tech',
  commercial: 'jobs',
  industry: 'industry',
  sports: 'sports',
  nature: 'nature',
  food: 'food',
};

function leverIcon(l: GuideLever): string {
  const a = l.action;
  switch (a.kind) {
    case 'category':
      return CATEGORY_ICON[a.category];
    case 'place':
      return buildings.has(a.def) ? CATEGORY_ICON[buildings.get(a.def).category] : 'build';
    case 'lens':
      return 'lens';
    case 'tax':
    case 'loan':
      return 'credits';
    case 'causes':
      return 'network';
    case 'incidents':
      return 'fire';
  }
}

const tierChip = (g: StatGuide) => h('span', { class: 'si-tier', 'data-t': String(g.tier) }, h('i'), g.tierName);

function gauge(g: StatGuide): HTMLElement | null {
  const v = g.gauge;
  if (!v) return null;
  const at = (x: number) => `${(Math.max(0, Math.min(1, (x - v.min) / (v.max - v.min))) * 100).toFixed(1)}%`;
  return h(
    'div',
    { class: `si-gauge t${g.tier}` },
    h('div', { class: 'si-gauge-h' }, h('span', {}, v.label), h('b', {}, v.text)),
    h('div', { class: 'si-track' }, h('i', { class: 'si-fill', style: `width:${at(v.value)}` }), h('i', { class: 'si-mark', style: `left:${at(v.mark)}` })),
  );
}

/** Signed contributions as bars either side of zero; 0..1 factors as fill bars with the limiting one marked. */
function parts(g: StatGuide): HTMLElement {
  const rows = g.parts;
  if (g.partsKind === 'factors') {
    const low = rows.reduce((a, r) => (r.value < a.value ? r : a), rows[0]!);
    return h(
      'div',
      { class: 'si-parts factors' },
      ...rows.map((r) =>
        h(
          'div',
          { class: `si-row ${r.tone}`, title: r.note ?? '' },
          h('span', { class: 'si-l' }, r.label, r === low && r.value < 0.95 ? h('em', {}, 'limiting') : null),
          h('span', { class: 'si-bar' }, h('i', { style: `width:${(Math.min(1, r.value) * 100).toFixed(1)}%` })),
          h('b', {}, r.text),
        ),
      ),
    );
  }
  // The harmony baseline would dwarf every factor: scale by the others.
  const scale = Math.max(0.001, ...rows.filter((r) => r.tone !== 'neutral' || rows.length < 3).map((r) => Math.abs(r.value)));
  const bar = (r: GuidePart) => {
    const w = `${(Math.min(1, Math.abs(r.value) / scale) * 50).toFixed(1)}%`;
    return h('span', { class: 'si-bar mid' }, h('i', { class: r.value < 0 ? 'neg' : 'pos', style: `width:${w}` }));
  };
  return h(
    'div',
    { class: 'si-parts' },
    ...rows.map((r) => h('div', { class: `si-row ${r.tone}`, title: r.note ?? '' }, h('span', { class: 'si-l' }, r.label, r.note ? h('small', {}, r.note) : null), bar(r), h('b', {}, r.text))),
  );
}

/** The indicator's recent history as an area sparkline with the change over the window. */
function spark(ctx: GameContext, g: StatGuide): HTMLElement | null {
  const data = ctx.city.pulse.history[g.history].slice(-SPARK_SAMPLES);
  if (data.length < 3) return null;
  const W = 300;
  const H = 46;
  let lo = Math.min(...data);
  let hi = Math.max(...data);
  if (hi - lo < 1e-6) {
    hi += 1;
    lo -= 1;
  }
  const y = (v: number) => H - 3 - ((v - lo) / (hi - lo)) * (H - 6);
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'si-spark');
  const path = (d: string, cls: string) => {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    svg.append(p);
  };
  if (lo < 0 && hi > 0) path(`M0,${y(0).toFixed(1)}H${W}`, 'zero');
  path(`M${pts.join('L')}L${W},${H}L0,${H}Z`, 'area');
  path(`M${pts.join('L')}`, 'line');
  const d = data[data.length - 1]! - data[0]!;
  const mins = Math.round((data.length * 10) / 60);
  const unit = g.id === 'credits' ? '◈' : '';
  return h(
    'div',
    { class: 'si-trend' },
    h('div', { class: 'si-sec' }, `Trend · last ${mins} min`, h('b', { class: d > 0 ? 'up' : d < 0 ? 'down' : '' }, icon(d >= 0 ? 'up' : 'down'), `${d >= 0 ? '+' : '−'}${unit}${fmt(Math.abs(d))}`)),
    svg,
  );
}

/**
 * Top-bar indicator guides (D-092). Hovering a stat shows a quick card: status, one gauge and the best move.
 * Clicking pins a panel with what it means, the breakdown, the trend, ranked one-click levers (build, lens, tax,
 * loan…) and Flora's sized build proposals for it. Phones tap straight to the panel (a bottom sheet). All numbers
 * come from `sim/statGuide.ts`; levers run through commands and services, so everything undoes.
 */
class StatInfo {
  private card = h('div', { class: 'si-card panel hidden', role: 'tooltip' });
  private panel = h('div', { class: 'si-panel panel hidden', role: 'dialog', 'aria-label': 'Indicator guide' });
  private hoverId: StatId | null = null;
  private openId: StatId | null = null;
  private hoverTimer = 0;
  private last = 0;
  private planned = 0;
  private stats = new Map<StatId, HTMLElement>();
  /** The panel's sections: the static ones re-render each refresh, levers and proposals only when they change. */
  private sec = { head: h('div'), body: h('div'), levers: h('div', { class: 'si-levers' }), props: h('div', { class: 'si-props' }), foot: h('div', { class: 'si-foot' }) };
  private leverKey = '';
  private propKey = '';

  constructor(private ctx: GameContext) {
    ctx.hud.append(this.card, this.panel);
    const s = this.sec;
    this.panel.append(s.head, h('div', { class: 'si-scroll' }, s.body, s.levers, s.props), s.foot);
    const root = ctx.services.get('hud').stats;
    for (const id of STAT_IDS) {
      const el = root.querySelector<HTMLElement>(`.stat-${id}`);
      if (!el) continue;
      this.stats.set(id, el);
      // The card replaces the native tooltip.
      el.removeAttribute('title');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `${statGuide(ctx.city, id).title}: details`);
      el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && this.hover(id));
      el.addEventListener('pointerleave', () => this.hover(null));
      el.addEventListener('click', () => this.toggle(id));
      el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), this.toggle(id)));
    }
    ctx.bus.on('stats:updated', () => this.refresh());
    // A press anywhere else closes the panel (the stats toggle it themselves).
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (this.openId && !this.panel.contains(t) && !root.contains(t)) this.close();
    });
    ctx.input.onKey((e) => (e.code === 'Escape' && this.openId ? (this.close(), true) : false));
    for (const ev of ['city:reset', 'load:done'] as const) ctx.bus.on(ev, () => this.close());
  }

  private hover(id: StatId | null): void {
    clearTimeout(this.hoverTimer);
    if (!id || id === this.openId) {
      this.hoverId = null;
      this.card.classList.add('hidden');
      return;
    }
    // A short delay so sweeping across the bar doesn't flash cards; moving between stats swaps at once.
    const show = () => {
      this.hoverId = id;
      this.renderCard();
      this.card.classList.remove('hidden');
      this.place(this.card, id);
    };
    if (this.hoverId) show();
    else this.hoverTimer = window.setTimeout(show, 160);
  }

  private toggle(id: StatId): void {
    if (this.openId === id) return this.close();
    this.hover(null);
    for (const [k, el] of this.stats) el.classList.toggle('si-on', k === id);
    this.openId = id;
    this.leverKey = this.propKey = '';
    this.planned = 0;
    this.renderPanel();
    this.panel.classList.remove('hidden');
    // Replay the entrance when switching between stats.
    this.panel.classList.remove('si-in');
    void this.panel.offsetWidth;
    this.panel.classList.add('si-in');
    this.place(this.panel, id);
  }

  private close(): void {
    this.openId = null;
    this.panel.classList.add('hidden');
    for (const el of this.stats.values()) el.classList.remove('si-on');
  }

  /** Under the stat, centred and kept on screen (phones: a bottom sheet from CSS). */
  private place(el: HTMLElement, id: StatId): void {
    if (isCompact()) return void (el.style.transform = '');
    const r = this.stats.get(id)!.getBoundingClientRect();
    const w = el.offsetWidth;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(r.bottom + 8)}px)`;
    el.style.setProperty('--nub', `${Math.round(r.left + r.width / 2 - x)}px`);
  }

  private refresh(): void {
    if (!this.hoverId && !this.openId) return;
    const now = performance.now();
    if (now - this.last < REFRESH_MS) return;
    this.last = now;
    if (this.hoverId) this.renderCard();
    if (this.openId) this.renderPanel();
  }

  private renderCard(): void {
    const g = statGuide(this.ctx.city, this.hoverId!);
    const best = g.levers[0];
    this.card.replaceChildren(
      h('div', { class: 'si-h' }, h('span', { class: 'si-ic' }, icon(g.icon)), h('b', {}, g.title), tierChip(g)),
      h('div', { class: 'si-val' }, h('b', {}, g.value), h('span', {}, g.sub)),
      gauge(g) ?? '',
      h('p', { class: 'si-status' }, g.status),
      best ? h('div', { class: 'si-best' }, h('span', { class: 'si-sec' }, 'Best move'), h('div', {}, icon(leverIcon(best)), h('b', {}, best.label), h('small', {}, best.detail))) : '',
      h('div', { class: 'si-hint' }, 'Click for the breakdown and actions'),
    );
  }

  private renderPanel(): void {
    const { ctx } = this;
    const g = statGuide(ctx.city, this.openId!);
    const s = this.sec;
    s.head.replaceChildren(
      h(
        'div',
        { class: 'si-head' },
        h('span', { class: 'si-ic big' }, icon(g.icon)),
        h('div', { class: 'si-titles' }, h('div', { class: 'si-eyebrow' }, 'Indicator', tierChip(g)), h('div', { class: 'si-title' }, g.title, h('span', { class: 'si-v' }, g.value), h('small', {}, g.sub))),
        h('button', { class: 'icon-btn si-x', 'aria-label': 'Close', title: 'Close (Esc)', onClick: () => this.close() }, icon('close')),
      ),
    );
    s.body.replaceChildren(
      h('p', { class: 'si-status big' }, g.status),
      gauge(g) ?? '',
      h('div', { class: 'si-sec' }, g.partsTitle),
      parts(g),
      spark(ctx, g) ?? '',
      h('details', { class: 'si-about' }, h('summary', {}, icon('book'), 'What this measures'), h('p', {}, g.meaning), h('ul', {}, ...g.tips.map((t) => h('li', {}, t)))),
    );
    const key = g.levers.map((l) => `${l.label}|${l.detail}`).join(';');
    if (key !== this.leverKey) {
      this.leverKey = key;
      s.levers.replaceChildren(h('div', { class: 'si-sec' }, 'How to improve'), ...g.levers.slice(0, 5).map((l, i) => this.lever(l, i === 0)));
    }
    const now = performance.now();
    if (now - this.planned > PLAN_MS) {
      this.planned = now;
      const list = g.focus ? proposeBuilds(ctx.city, { focus: g.focus, limit: 2 }) : [];
      const pk = list.map((p) => `${p.type}×${p.count}@${p.site.x},${p.site.z}`).join(';');
      if (pk !== this.propKey) {
        this.propKey = pk;
        s.props.replaceChildren(...(list.length ? [h('div', { class: 'si-sec' }, icon('sparkle'), 'Suggested builds · sited and sized'), ...list.map((p) => this.proposal(p))] : []));
      }
    }
    const flora = ctx.services.tryGet('assistant');
    s.foot.replaceChildren(
      h('button', { class: 'si-link', onClick: () => (ctx.services.get('dashboard').toggle(), this.close()) }, icon('dashboard'), 'City dashboard'),
      flora && !floraLocked(ctx.city)
        ? h(
            'button',
            {
              class: 'si-link ask',
              onClick: () => {
                flora.toggle(true);
                void flora.ask(`How can I improve ${g.title.toLowerCase()}? It is ${g.value} (${g.tierName}).`);
                this.close();
              },
            },
            icon('sparkle'),
            'Ask Flora',
          )
        : '',
    );
  }

  private lever(l: GuideLever, best: boolean): HTMLElement {
    return h(
      'button',
      { class: `si-lever ${best ? 'best' : ''}`, onClick: () => this.run(l) },
      h('span', { class: 'si-lever-i' }, icon(leverIcon(l))),
      h('span', { class: 'si-lever-t' }, h('b', {}, l.label, best ? h('em', {}, 'best move') : null), h('small', {}, l.detail)),
      h('span', { class: 'si-go' }, icon('next')),
    );
  }

  /** Runs a lever: the same commands and services the rest of the HUD uses, so everything undoes. */
  private run(l: GuideLever): void {
    const { ctx } = this;
    const a = l.action;
    const toast = (text: string, tone: 'ok' | 'bad' = 'ok') => ctx.bus.emit('toast', { text, tone });
    switch (a.kind) {
      case 'category':
        ctx.services.get('build').open(a.category);
        return this.close();
      case 'place':
        ctx.services.get('build').open(buildings.get(a.def).category);
        ctx.services.get('construction').startBuilding(a.def);
        toast(`Placing ${buildings.get(a.def).name}: click a lot beside a highway (Esc to cancel)`);
        return this.close();
      case 'lens':
        ctx.services.get('overlays').set(a.id);
        return this.close();
      case 'tax':
        if (ctx.commands.execute('setTax', { rate: a.rate })) toast(`Tax rate now ${Math.round(ctx.city.pulse.taxRate * 100)}% (⌘Z undoes)`);
        break;
      case 'loan':
        if (ctx.commands.execute('takeLoan', { amount: a.amount })) toast(`Borrowed ◈${fmt(a.amount)} (⌘Z undoes)`);
        else toast('The bank declined the loan', 'bad');
        break;
      case 'causes':
        ctx.services.get('dashboard').openCauses();
        return this.close();
      case 'incidents':
        ctx.services.get('dashboard').openIncidents();
        return this.close();
    }
    this.leverKey = '';
    this.last = 0;
    this.renderPanel();
  }

  /** A sited proposal (D-089) with one-click Build (count lots, nearest free first) and a look at the lot. */
  private proposal(p: BuildProposal): HTMLElement {
    const { ctx } = this;
    const def = buildings.get(p.type);
    const go = h('button', { class: 'si-build', title: `Build ${p.count > 1 ? `${p.count}× ` : ''}${p.name} in ${p.district}` }, icon('build'), `Build ◈${fmt(p.cost)}`) as HTMLButtonElement;
    go.disabled = ctx.city.credits < p.cost;
    if (go.disabled) go.title = `Needs ◈${fmt(p.cost)}; you have ◈${fmt(ctx.city.credits)}`;
    const el = h(
      'div',
      { class: 'si-prop' },
      h('div', { class: 'si-prop-h' }, icon(CATEGORY_ICON[def.category]), h('b', {}, `${p.count > 1 ? `${p.count}× ` : ''}${p.name}`), h('span', {}, p.district)),
      h('div', { class: 'si-prop-gain' }, p.gain),
      h(
        'div',
        { class: 'si-prop-btns' },
        go,
        h('button', { class: 'si-chip', title: 'Fly to the proposed lot', onClick: () => ctx.cameraCtl.locate(p.site.x, p.site.z, { size: Math.max(...def.footprint) }) }, icon('locate'), 'Lot'),
      ),
    );
    go.onclick = () => {
      const ids: string[] = [];
      for (let i = 0; i < p.count; i++) {
        const site = i === 0 ? p.site : findSites(ctx.city, def, p.site, 1)[0];
        if (!site || ctx.city.credits < def.stats.cost || !ctx.commands.execute('build', { def: def.id, x: site.x, z: site.z, rot: site.rot })) break;
        ids.push(buildingId(ctx.city, ctx.city.buildingAt(site.x, site.z)));
      }
      if (!ids.length) return void ctx.bus.emit('toast', { text: `Couldn't build ${p.name} there any more`, tone: 'bad' });
      ctx.bus.emit('toast', { text: `Built ${ids.length > 1 ? `${ids.length}× ` : ''}${p.name} in ${p.district} (⌘Z undoes)`, tone: 'ok', at: p.site });
      ctx.services.get('inventory').select(ids[0]!);
      el.classList.add('done');
      setText(go, 'Built');
      go.disabled = true;
      this.planned = 0;
    };
    return el;
  }
}

export const statInfoModule: GameModule = {
  id: 'statinfo',
  deps: ['hud', 'build', 'overlays', 'dashboard', 'inventory', 'construction'],
  init(ctx) {
    new StatInfo(ctx);
  },
};
