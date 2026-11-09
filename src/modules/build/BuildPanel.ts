import { buildings } from '@/content';
import { CATEGORY_ICONS, CATEGORY_LABELS, type BuildingCategory, type BuildingDef } from '@/content/types';
import { buildBlock, type BuildBlock } from '@/sim/buildGate';
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
      this.catBtns.set(cat, b);
      cats.append(b);
    }

    this.el = h(
      'section',
      { class: 'build panel holo hidden', role: 'dialog', 'aria-label': 'Build' },
      head,
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
    this.fab = h(
      'button',
      { class: 'build-fab', title: 'Build (B)', 'aria-label': 'Build', onClick: onToggle },
      icon('build'),
      h('span', {}, 'Build'),
      touch ? null : h('kbd', {}, 'B'),
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
    this.list.replaceChildren();
    this.cards.clear();
    this.cardCost.clear();
    this.cardKey.clear();
    for (const def of buildings.all().filter((b) => b.category === this.category)) {
      const cost = h('div', { class: 'c' });
      const card = h(
        'button',
        {
          class: 'card',
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
        h('div', { class: 'n' }, def.name),
        cost,
        tags(def),
      );
      this.hoverPeek(card, { def: def.id });
      this.cards.set(def.id, card);
      this.cardCost.set(def.id, cost);
      this.list.append(card);
    }
    this.sync();
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
    for (const [id, c] of this.cards) {
      c.classList.toggle('on', tool === 'build' && st.def === id);
      this.syncCard(id, c, buildBlock(ctx.city, id));
    }
    const touch = isTouchDevice();
    const holding = tool !== 'select';
    setText(
      this.hint,
      holding
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
  private syncCard(id: string, c: HTMLElement, block: BuildBlock | null): void {
    const def = buildings.get(id);
    const kind = block?.kind ?? 'open';
    const key = `${kind}|${block?.short ?? ''}`;
    if (this.cardKey.get(id) === key) return;
    this.cardKey.set(id, key);
    c.classList.toggle('locked', kind === 'locked');
    c.classList.toggle('capped', kind === 'capped');
    c.classList.toggle('poor', kind === 'credits');
    c.title = block && kind !== 'credits' ? `${block.reason}. Click for how to get it.` : def.description;
    this.cardCost.get(id)?.replaceChildren(
      ...(kind === 'locked' || kind === 'capped'
        ? [icon(kind === 'locked' ? 'st-off' : 'st-warn'), ` ${block!.short}`]
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
    this.renderGate(this.open && what && 'def' in what ? what.def : null);
    const key = !this.open ? 'closed' : !what ? 'none' : 'def' in what ? `d:${what.def}` : `t:${what.tool}`;
    if (key === this.briefKey) return this.placeFloat();
    this.briefKey = key;
    this.stageTaken = false;
    if (!this.open || !what) {
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
      h('div', { class: 'bp-head' }, h('span', { class: 'bp-ico' }, icon(`cat:${def.category}`, CATEGORY_ICONS[def.category])), h('b', {}, def.name), h('span', { class: 'bp-cat' }, CATEGORY_LABELS[def.category])),
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
    const on = this.open && !this.stageTaken && !holding && this.brief.classList.contains('building') && !isCompact();
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
