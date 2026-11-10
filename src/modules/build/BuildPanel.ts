import { buildings } from '@/content';
import { CATEGORY_ICONS, CATEGORY_LABELS, type BuildingCategory, type BuildingDef } from '@/content/types';
import { isHero } from '@/content/heroes';
import { buildBlock, buildStates, type BuildState } from '@/sim/buildGate';
import type { GameContext } from '@/game/context';
import { isCompact, isTouchDevice, onCompactChange } from '@/platform/device';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { ACTION_HELP, buildingAbilities, buildingStats } from '@/ui/buildHelp';
import { gateSteps } from '@/ui/gateSteps';

const fmt = (n: number) => Math.round(n).toLocaleString();
/** Build actions in the panel, in order. Inspect is not one: leaving build mode (Done, Esc) is. */
const ACTIONS = ['road', 'channel', 'bulldoze', 'retrofit', 'mist', 'weave', 'reclaim'];
const CAT_KEY = 'bloomgrid.build.category';

/** A card's group in the list, in list order: what can be built now comes first (D-153). */
type Group = 'open' | BuildState['kind'];
const GROUPS: Group[] = ['open', 'credits', 'capped', 'locked'];
const GROUP_LABELS: Record<Group, string> = {
  open: 'Ready to build',
  credits: 'Saving up',
  capped: 'At the limit',
  locked: 'Locked',
};

/** A tab of the Build panel (Build, and Goals from the goals module, D-153). */
export interface BuildTab {
  select(): void;
  setBadge(text: string, tone?: 'warn' | 'crit' | ''): void;
  readonly selected: boolean;
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

/**
 * Build mode (D-084): its own panel, apart from City Pulse (which is for watching the city). Desktops get a
 * column on the left (City Pulse folds while it is open and comes back after); phones a bottom sheet. It has a
 * header with Done, the actions, the building categories, the open category's buildings and an explanation
 * card (with a floating 3D preview of a building on desktops). Picking a category only lists its buildings;
 * placing starts when a building is picked. Leaving: Done, Esc (first drops what is in hand, then closes), a
 * right-click (drops what is in hand), or B again.
 *
 * Each category lists what can be built now first (cheapest first), then what needs credits, what is at its
 * limit and what is locked, under small group labels; the order is re-read at 5 Hz but never moves cards under
 * the pointer. Hero buildings carry a gold mark. The Goals tab (unlock projects, milestones, sea wonders) sits
 * beside Build, since goals are mostly met by building (D-153).
 */
export class BuildPanel {
  readonly el: HTMLElement;
  /** The launcher: bottom-centre on desktops, beside Flora's orb on phones. */
  readonly fab: HTMLElement;
  private actionBtns = new Map<string, HTMLElement>();
  private catBtns = new Map<BuildingCategory, HTMLElement>();
  private cards = new Map<string, HTMLElement>();
  /** Each card's cost line (it becomes "Locked" or "3/3 · next at 1.2k pop" while blocked). */
  private cardCost = new Map<string, HTMLElement>();
  private cardKey = new Map<string, string>();
  /** Each card's group at the last sort; the list re-sorts when one changes. */
  private cardGroup = new Map<string, Group>();
  private groupLabels = new Map<Group, HTMLElement>();
  private orderKey = '';
  /** The pointer is over the list: hold the order so a card never jumps away from a click. */
  private overList = false;
  /** Ready-to-build count per category chip. */
  private catCount = new Map<BuildingCategory, HTMLElement>();
  private tabsEl = h('div', { class: 'bd-tabs', role: 'tablist' });
  private tabs: { id: string; btn: HTMLElement; pane: HTMLElement; badge: HTMLElement }[] = [];
  private tab = 'build';
  private onTab = new Set<(id: string) => void>();
  /** A blocked building that was clicked: the card explains how to get it instead of picking it up (D-130). */
  private pinned: string | null = null;
  /** The explanation card's "what next" section, refreshed at 5 Hz apart from the rest of the card. */
  private gate = h('div', { class: 'bp-gate' });
  private gateKey = '';
  private list = h('div', { class: 'bd-list' });
  private listTitle = h('div', { class: 'pulse-title bd-list-title' });
  private hint = h('span', { class: 'bd-hint' });
  /** The explanation card (see `renderBrief`). */
  private brief = h('div', { class: 'brief' });
  category: BuildingCategory = 'residential';
  /**
   * The building preview floats beside the panel, outside its glass: the stage is a transparent window the
   * `preview` module renders into, and the panel's backdrop would dim anything drawn under it. A name bar on
   * top and a caption below hold the frame's rounded corners, so the 3D stage between them (drawn on the main
   * canvas, which CSS can't round) only meets straight edges.
   */
  private floatStage = h('div', { class: 'bp-float-stage', title: 'Drag to turn · wheel to zoom · double-click to reset' });
  private floatName = h('b');
  private floatIco = h('span', { class: 'bp-float-ico' });
  private float = h(
    'div',
    { class: 'bp-float hidden' },
    h('div', { class: 'bp-float-bar' }, this.floatIco, this.floatName),
    this.floatStage,
    h('div', { class: 'bp-float-cap' }, 'Preview · drag to turn'),
  );
  /** What the explanation card shows while hovering (null = the active action or building). */
  private peeking: { tool: string } | { def: string } | null = null;
  private briefKey = '';
  /** The inspector holds the 3D stage until the card shows something else. */
  private stageTaken = false;

  constructor(
    private ctx: GameContext,
    private onDone: () => void,
    onToggle: () => void,
  ) {
    try {
      const saved = localStorage.getItem(CAT_KEY) as BuildingCategory | null;
      if (saved && saved in CATEGORY_LABELS) this.category = saved;
    } catch {
      /* storage blocked: start on Living */
    }
    const touch = isTouchDevice();
    const done = h(
      'button',
      { class: 'bd-done', title: 'Done building (Esc)', 'aria-label': 'Done building', onClick: () => this.onDone() },
      icon('st-ok'),
      h('span', {}, 'Done'),
      touch ? null : h('kbd', {}, 'Esc'),
    );
    const head = h(
      'div',
      { class: 'bd-head' },
      h('span', { class: 'bd-ico' }, icon('build')),
      h('div', { class: 'bd-titles' }, h('b', {}, 'Build'), this.hint),
      done,
    );

    const actions = h('div', { class: 'bd-actions' });
    for (const id of ACTIONS) {
      const t = ctx.tools.get(id);
      if (!t) continue;
      const key = t.hotkey?.replace('Key', '');
      const b = h(
        'button',
        {
          class: 'tool bd-action',
          title: `${t.label}${key ? ` (${key})` : ''}`,
          'aria-label': t.label,
          onClick: () => ctx.tools.setActive(ctx.tools.active?.id === id ? 'select' : id),
        },
        h('span', { class: 'g' }, icon(id, t.icon)),
        h('span', { class: 'l' }, ACTION_HELP[id]?.short ?? t.label),
        key ? h('kbd', {}, key) : null,
      );
      this.hoverPeek(b, { tool: id });
      this.actionBtns.set(id, b);
      actions.append(b);
    }

    const cats = h('div', { class: 'bd-cats', role: 'tablist' });
    const present = new Set(buildings.all().map((b) => b.category));
    for (const cat of (Object.keys(CATEGORY_LABELS) as BuildingCategory[]).filter((c) => present.has(c))) {
      const b = h(
        'button',
        { class: 'tool cat', role: 'tab', title: `${CATEGORY_LABELS[cat]} buildings`, onClick: () => this.showCategory(cat) },
        h('span', { class: 'g' }, icon(`cat:${cat}`, CATEGORY_ICONS[cat])),
        h('span', { class: 'l' }, CATEGORY_LABELS[cat]),
      );
      const n = h('span', { class: 'bd-count', title: 'Ready to build' });
      b.append(n);
      this.catCount.set(cat, n);
      this.catBtns.set(cat, b);
      cats.append(b);
    }

    this.el = h(
      'section',
      { class: 'build panel holo hidden', role: 'dialog', 'aria-label': 'Build' },
      head,
      this.tabsEl,
    );
    this.addTab(
      'build',
      'Build',
      'build',
      h(
        'div',
        { class: 'bd-scroll' },
        h('div', { class: 'pulse-title bd-sec' }, 'Actions'),
        actions,
        h('div', { class: 'pulse-title bd-sec' }, 'Buildings'),
        cats,
        this.listTitle,
        // Phones lay the card and the buildings in one sideways strip (card first).
        h('div', { class: 'bd-body' }, this.list, this.brief),
      ),
    );
    this.list.addEventListener('pointerenter', () => (this.overList = true));
    this.list.addEventListener('pointerleave', () => {
      this.overList = false;
      this.sortList();
    });
    this.fab = h(
      'button',
      { class: 'build-fab', title: 'Build (B)', 'aria-label': 'Build', onClick: onToggle },
      icon('build'),
      h('span', {}, 'Build'),
      touch ? null : h('kbd', {}, 'B'),
      this.fabBadge,
    );
    ctx.hud.append(this.el, this.float);
    this.el.addEventListener('pointerleave', () => this.releaseHeight());
    // Phones: the sheet sits in the bottom dock (the tool hint above it) and the launcher beside Flora's orb.
    const hud = ctx.services.get('hud');
    const place = (compact: boolean) => {
      if (compact) {
        hud.dock.insertBefore(this.el, hud.dockRow);
        hud.dockRow.prepend(this.fab);
      } else ctx.hud.append(this.el, this.fab);
      this.placeFloat();
    };
    place(isCompact());
    onCompactChange(place);
    this.renderList();
  }

  /** Adds a tab (its pane scrolls on its own); the Build tab is the first. */
  addTab(id: string, label: string, glyph: string, pane: HTMLElement): BuildTab {
    const badge = h('span', { class: 'con-badge' });
    const btn = h(
      'button',
      { class: 'bd-tab', role: 'tab', title: label, onClick: () => this.selectTab(id) },
      icon(glyph),
      h('span', {}, label),
      badge,
    );
    pane.classList.add('bd-pane', `bd-pane-${id}`);
    pane.setAttribute('role', 'tabpanel');
    this.tabsEl.append(btn);
    this.el.append(pane);
    this.tabs.push({ id, btn, pane, badge });
    this.selectTab(this.tab);
    const selected = () => this.open && this.tab === id;
    return {
      select: () => this.selectTab(id),
      setBadge: (text, tone = '') => {
        setText(badge, text);
        badge.className = `con-badge ${tone}`;
        this.syncFabBadge();
      },
      get selected() {
        return selected();
      },
    };
  }

  /** Called with the tab id whenever the shown tab changes. */
  onTabChange(fn: (id: string) => void): void {
    this.onTab.add(fn);
  }

  get currentTab(): string {
    return this.tab;
  }

  selectTab(id: string): void {
    if (!this.tabs.some((t) => t.id === id)) id = 'build';
    const changed = id !== this.tab;
    this.tab = id;
    for (const t of this.tabs) {
      const on = t.id === id;
      t.btn.classList.toggle('on', on);
      t.btn.setAttribute('aria-selected', String(on));
      t.pane.classList.toggle('hidden', !on);
    }
    this.el.classList.toggle('on-build', id === 'build');
    if (!changed) return;
    // Leaving the Build tab puts down what is in hand: the map shouldn't place what the panel no longer shows.
    if (id !== 'build' && this.ctx.tools.active && this.ctx.tools.active.id !== 'select') this.ctx.tools.setActive('select');
    this.peeking = null;
    this.briefKey = '';
    this.sync();
    for (const fn of this.onTab) fn(id);
  }

  /** The launcher shows the other tabs' badges (Goals ready to start or claim) while the panel is closed. */
  private fabBadge = h('span', { class: 'con-badge' });
  private syncFabBadge(): void {
    const b = this.tabs.find((t) => t.id !== 'build' && t.badge.textContent);
    setText(this.fabBadge, b?.badge.textContent ?? '');
    this.fabBadge.className = b ? b.badge.className : 'con-badge';
  }

  get open(): boolean {
    return !this.el.classList.contains('hidden');
  }

  setOpen(open: boolean): void {
    this.el.classList.toggle('hidden', !open);
    this.fab.classList.toggle('on', open);
    this.fab.setAttribute('aria-pressed', String(open));
    this.peeking = null;
    this.pinned = null;
    this.briefKey = '';
    this.releaseHeight();
    if (open) this.renderList();
    else this.selectTab('build');
    this.renderBrief();
  }

  /** Lists a category's buildings (nothing is picked up until a building is chosen). */
  showCategory(cat: BuildingCategory): void {
    this.category = cat;
    try {
      localStorage.setItem(CAT_KEY, cat);
    } catch {
      /* storage blocked: the choice lasts the session */
    }
    this.renderList();
  }

  private hoverPeek(el: HTMLElement, what: { tool: string } | { def: string }): void {
    // Hovering previews the explanation card (a mouse only: on touch it would stick after a tap).
    el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && this.peek(what));
    el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && this.peek(null));
  }

  private renderList(): void {
    const { ctx } = this;
    const construction = ctx.services.get('construction');
    for (const [c, b] of this.catBtns) {
      b.classList.toggle('on', c === this.category);
      b.setAttribute('aria-selected', String(c === this.category));
    }
    setText(this.listTitle, `${CATEGORY_LABELS[this.category]} buildings`);
    this.cards.clear();
    this.cardCost.clear();
    this.cardKey.clear();
    this.cardGroup.clear();
    this.groupLabels.clear();
    this.orderKey = '';
    this.list.replaceChildren();
    for (const g of GROUPS) this.groupLabels.set(g, h('div', { class: `bd-group bd-group-${g}` }));
    for (const def of buildings.all().filter((b) => b.category === this.category)) {
      const cost = h('div', { class: 'c' });
      const hero = isHero(def);
      const card = h(
        'button',
        {
          class: hero ? 'card hero' : 'card',
          title: def.description,
          onClick: () => {
            const holding = ctx.tools.active?.id === 'build' && construction.state.def === def.id;
            // A second press on the building in hand puts it down again.
            if (holding) return ctx.tools.setActive('select');
            // Locked or at its limit: say how to get it rather than picking up a building that can't be placed.
            const block = buildBlock(ctx.city, def.id);
            if (block && block.kind !== 'credits') {
              if (ctx.tools.active?.id !== 'select') ctx.tools.setActive('select');
              this.pinned = def.id;
              this.renderBrief();
              return;
            }
            this.pinned = null;
            construction.startBuilding(def.id);
          },
        },
        h('div', { class: 'n' }, hero ? h('span', { class: 'bd-hero', title: 'Hero building: one of a kind' }, icon('star')) : null, def.name),
        cost,
        tags(def),
      );
      this.hoverPeek(card, { def: def.id });
      this.cards.set(def.id, card);
      this.cardCost.set(def.id, cost);
    }
    this.sync();
  }

  /**
   * Orders the cards by group (ready, saving up, at the limit, locked), cheapest first, with a label over each
   * group that has cards. Moves only when a card changed group, and never while the pointer is on the list.
   */
  private sortList(): void {
    if (this.overList && this.list.childElementCount) return;
    const ids = [...this.cards.keys()];
    const rank = (id: string) => GROUPS.indexOf(this.cardGroup.get(id) ?? 'open');
    const cost = (id: string) => buildings.get(id).stats.cost;
    ids.sort((a, b) => rank(a) - rank(b) || cost(a) - cost(b) || a.localeCompare(b));
    const key = ids.map((id) => `${id}:${this.cardGroup.get(id)}`).join(',');
    if (key === this.orderKey) return;
    this.orderKey = key;
    const nodes: HTMLElement[] = [];
    let last: Group | null = null;
    const shown = new Set(ids.map((id) => this.cardGroup.get(id) ?? 'open'));
    for (const id of ids) {
      const g = this.cardGroup.get(id) ?? 'open';
      // One group only (everything ready, as in the showcase): no label needed.
      if (g !== last && shown.size > 1) {
        const n = ids.filter((i) => this.cardGroup.get(i) === g).length;
        const label = this.groupLabels.get(g)!;
        setText(label, `${GROUP_LABELS[g]} · ${n}`);
        nodes.push(label);
      }
      last = g;
      nodes.push(this.cards.get(id)!);
    }
    this.list.replaceChildren(...nodes);
  }

  /** Follows the active tool: lit action, the building in hand (its category opens), the hint line. */
  toolChanged(id: string): void {
    for (const [tid, b] of this.actionBtns) b.classList.toggle('on', tid === id);
    if (id === 'build') this.pinned = null;
    if (id === 'build') {
      const cat = buildings.get(this.ctx.services.get('construction').state.def).category;
      if (cat !== this.category) this.showCategory(cat);
    }
    this.briefKey = '';
    this.sync();
  }

  /** Card states (in hand, unaffordable), the hint line and the explanation card; cheap, run at 5 Hz. */
  sync(): void {
    const { ctx } = this;
    const st = ctx.services.get('construction').state;
    const tool = ctx.tools.active?.id ?? 'select';
    if (this.open) {
      // Every building's state in one pass: the open category's cards, and the chips' ready counts.
      const all = buildings.all();
      const states = buildStates(ctx.city, all.map((d) => d.id));
      const ready = new Map<BuildingCategory, number>();
      for (const d of all) if (!states.get(d.id)) ready.set(d.category, (ready.get(d.category) ?? 0) + 1);
      for (const [cat, el] of this.catCount) setText(el, String(ready.get(cat) ?? 0));
      for (const [id, c] of this.cards) {
        c.classList.toggle('on', tool === 'build' && st.def === id);
        this.syncCard(id, c, states.get(id) ?? null);
      }
      this.sortList();
    }
    const touch = isTouchDevice();
    const holding = tool !== 'select';
    setText(
      this.hint,
      this.tab !== 'build'
        ? 'Unlock projects, milestones and sea wonders'
        : holding
        ? touch
          ? tool === 'build'
            ? 'Tap a lot to build · Done to finish'
            : 'Tap to preview, tap again to confirm · Done to finish'
          : 'Esc or right-click puts it down'
        : touch
          ? 'Pick a building or an action'
          : 'Pick a building or an action · Esc to finish',
    );
    this.el.classList.toggle('holding', holding);
    this.renderBrief();
  }

  /** A card's state and cost line: locked, at its limit (with when the next opens), unaffordable or open. */
  private syncCard(id: string, c: HTMLElement, state: BuildState | null): void {
    const def = buildings.get(id);
    const kind: Group = state?.kind ?? 'open';
    this.cardGroup.set(id, kind);
    const key = `${kind}|${state?.short ?? ''}`;
    if (this.cardKey.get(id) === key) return;
    this.cardKey.set(id, key);
    c.classList.toggle('locked', kind === 'locked');
    c.classList.toggle('capped', kind === 'capped');
    c.classList.toggle('poor', kind === 'credits');
    const hero = isHero(def) ? ' Hero building: one of a kind.' : '';
    c.title =
      state && kind !== 'credits' ? `${def.name}: ${state.short}. Click for how to get it.` : `${def.description}${hero}`;
    this.cardCost.get(id)?.replaceChildren(
      ...(kind === 'locked' || kind === 'capped'
        ? [icon(kind === 'locked' ? 'st-off' : 'st-warn'), ` ${state!.short}`]
        : [icon('credits'), ` ${fmt(def.stats.cost)} · ${def.footprint[0]}×${def.footprint[1]}`]),
    );
  }

  /** The explanation card's "what next" steps for a building that can't be built now. */
  private renderGate(defId: string | null): void {
    const block = defId ? buildBlock(this.ctx.city, defId) : null;
    const key = block ? `${defId}|${block.kind}|${block.reason}|${block.steps.map((s) => s.text).join('|')}` : '';
    if (key === this.gateKey) return;
    this.gateKey = key;
    this.gate.replaceChildren(...(block ? [gateSteps(this.ctx, block)] : []));
  }

  private peek(what: { tool: string } | { def: string } | null): void {
    // Sweeping across cards swaps the explanation card's content: hold the tallest height seen in this sweep so a
    // shorter card doesn't shrink the column (which clamped the scroll and made the list jump under the pointer).
    // The hold lasts until the pointer leaves the panel (`releaseHeight`).
    const before = this.brief.offsetHeight;
    this.peeking = what;
    this.renderBrief();
    this.brief.style.minHeight = `${Math.max(before, this.brief.offsetHeight)}px`;
  }

  private releaseHeight(): void {
    this.brief.style.minHeight = '';
  }

  /** Fills the explanation card: an action's what / how / cost, or a building's preview, numbers and abilities. */
  private renderBrief(): void {
    const { ctx } = this;
    const construction = ctx.services.get('construction');
    const active = ctx.tools.active?.id ?? 'select';
    const what =
      this.peeking ??
      (active === 'build' ? { def: construction.state.def } : active !== 'select' ? { tool: active } : this.pinned ? { def: this.pinned } : null);
    const shown = this.open && this.tab === 'build';
    this.renderGate(shown && what && 'def' in what ? what.def : null);
    const key = !shown ? 'closed' : !what ? 'none' : 'def' in what ? `d:${what.def}` : `t:${what.tool}`;
    if (key === this.briefKey) return this.placeFloat();
    this.briefKey = key;
    this.stageTaken = false;
    if (!shown || !what) {
      this.brief.className = 'brief empty';
      this.brief.replaceChildren(h('p', { class: 'bp-desc' }, isTouchDevice() ? 'Tap a building to see what it does.' : 'Point at a building or an action to see what it does; click it to pick it up.'));
      return this.placeFloat();
    }
    if ('tool' in what) {
      const t = ctx.tools.get(what.tool);
      const help = ACTION_HELP[what.tool];
      if (!t || !help) return this.placeFloat();
      const hk = t.hotkey?.replace('Key', '').replace('Escape', 'Esc');
      this.brief.className = 'brief action';
      this.brief.replaceChildren(
        h('div', { class: 'bp-head' }, h('span', { class: 'bp-ico' }, icon(t.id, t.icon)), h('b', {}, t.label), hk ? h('kbd', {}, hk) : null),
        h('p', { class: 'bp-desc' }, help.what),
        h('div', { class: 'bp-row' }, h('span', {}, 'How'), h('p', {}, help.how)),
        h('div', { class: 'bp-row' }, h('span', {}, 'Cost'), h('p', {}, help.cost)),
      );
      return this.placeFloat();
    }
    const def = buildings.get(what.def);
    const blocked = this.gate.childElementCount > 0;
    this.brief.className = 'brief building';
    this.brief.replaceChildren(
      h(
        'div',
        { class: 'bp-head' },
        h('span', { class: 'bp-ico' }, icon(`cat:${def.category}`, CATEGORY_ICONS[def.category])),
        h('b', {}, def.name),
        isHero(def) ? h('span', { class: 'bp-hero', title: 'Hero building: one of a kind' }, icon('star'), 'Hero') : null,
        h('span', { class: 'bp-cat' }, CATEGORY_LABELS[def.category]),
      ),
      // Can't be built now: why and what to do come first (D-130).
      this.gate,
      h('p', { class: 'bp-desc' }, def.description),
      h('div', { class: 'bp-stats' }, ...buildingStats(def).map((r) => h('div', { class: `bp-stat ${r.tone ?? ''}` }, h('span', {}, r.label), h('b', {}, r.value)))),
      h('ul', { class: 'bp-abilities' }, ...buildingAbilities(def).map((a) => h('li', {}, a))),
      h(
        'div',
        { class: blocked && this.pinned === def.id ? 'bp-place hidden' : 'bp-place' },
        h('span', {}, isTouchDevice() ? 'Tap a lot on the map to build it.' : 'Click the map to place it · R rotates'),
        h('button', { class: 'bp-rot', title: 'Rotate (R)', onClick: () => (construction.state.rot = (construction.state.rot + 1) % 4) }, icon('rotate'), ' Rotate'),
      ),
    );
    this.placeFloat();
    this.floatIco.replaceChildren(icon(`cat:${def.category}`, CATEGORY_ICONS[def.category]));
    setText(this.floatName, def.name);
    if (this.float.classList.contains('hidden')) return;
    // One 3D stage at a time: the building preview takes it, so an open inspector closes.
    ctx.bus.emit('selection:changed', { eid: null });
    ctx.services.tryGet('preview')?.showDef(this.floatStage, def.id);
  }

  /** Shows the floating preview beside the panel while the card describes a building (desktop only). */
  placeFloat(): void {
    // A building in hand: the map is where the steward looks, so the preview steps aside (hovering a card brings it back).
    const holding = this.ctx.tools.active?.id === 'build' && !this.peeking;
    const on = this.open && this.tab === 'build' && !this.stageTaken && !holding && this.brief.classList.contains('building') && !isCompact();
    this.float.classList.toggle('hidden', !on);
    if (!on) return;
    const r = this.el.getBoundingClientRect();
    const b = this.brief.getBoundingClientRect();
    const top = Math.max(70, Math.min(b.top, window.innerHeight - this.float.offsetHeight - 12));
    this.float.style.transform = `translate(${Math.round(r.right + 14)}px, ${Math.round(top)}px)`;
  }

  /** The inspector took the 3D stage: the floating preview would be an empty window. */
  dropFloat(): void {
    this.stageTaken = true;
    this.float.classList.add('hidden');
  }
}
