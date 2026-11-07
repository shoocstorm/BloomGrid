import { Vector3 } from 'three/webgpu';
import { buildings } from '@/content';
import type { GameContext, GameModule } from '@/game/context';
import { Building, Service } from '@/ecs/components';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';
import {
  MILESTONES,
  claimableMilestones,
  milestoneDone,
  nextMilestone,
  type MilestoneDef,
} from '@/sim/milestones';
import { tipValue } from '@/sim/tips';
import { isRuined } from '@/sim/hazards';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { isCompact, onCompactChange } from '@/platform/device';
import { buildBlock } from '@/sim/buildGate';
import { runGate } from '@/ui/gateSteps';
import { TIP_ICONS, quoteFor } from './quotes';
import './juice.css';

/**
 * Juice (D-118): small, quick rewards for paying attention, so the first hour on a fresh island feels alive
 * between the big moments (D-094).
 *
 * - **Tip bubbles**: every 20–35 s of running time a happy building in view floats a bubble. Popping it pays a tip
 *   (`collectTip`, valued by the sim), shows what the resident said (`quotes.ts`), and quick pops in a row build
 *   a combo (up to ×5). Bubbles left alone drift away after half a minute.
 * - **Milestone tracker**: a card under the top bar shows the next steward milestone (`sim/milestones.ts`) with
 *   its progress, a Build shortcut and, once reached, a glowing Claim button. Claiming throws confetti, flies
 *   coins into the credits counter and turns the card to the next one. It folds to a pill.
 * - **Build ready**: when a new building's last piece lands (`building:ready`), a burst of petals and what it adds
 *   ("+24 residents", "+30 energy") float off its roof; quick builds in a row step the chime up.
 * - **Coins**: tips and claims fly coins on an arc into the top bar's credits, which bump when they arrive.
 *
 * DOM only, animated with transform / opacity keyframes (§7½); world-anchored pieces re-project each frame (≤ ~12
 * at once), everything else runs on CSS. Sounds hang off the `juice` event in the audio module. Ambient motion
 * stays small (a gentle bob), per the subtle-motion rule.
 */
export type JuiceSound = 'tip' | 'coin' | 'ready' | 'claimable' | 'claim';

export interface JuiceService {
  /** Tip bubbles on or off (per viewer). */
  tips: boolean;
  /** Spawns a tip bubble now (scripts and scenes). */
  spawnTip(): boolean;
}

declare module '@/core/Services' {
  interface GameServices {
    juice: JuiceService;
  }
}

declare module '@/core/EventBus' {
  interface GameEvents {
    /** A juice cue (D-118): the audio module plays it; `step` raises the pitch for combos and build streaks. */
    juice: { sound: JuiceSound; step?: number };
  }
}

const TIPS_KEY = 'bloomgrid.tips';
const FOLD_KEY = 'bloomgrid.milestones.folded';
const MAX_BUBBLES = 3;
const BUBBLE_LIFE = 32;
/** Seconds of running time before the first bubble, then between bubbles. */
const FIRST_TIP = 10;
const TIP_GAP: [number, number] = [20, 35];
/** Pops this close together (real seconds) build a combo. */
const COMBO_WINDOW = 7;
/** Buildings ready this close together step the chime up. */
const STREAK_WINDOW = 12;
const TIP_CATEGORIES = new Set(Object.keys(TIP_ICONS));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked: lasts the session */
    }
  },
};

/** Something drawn over a point of the world (bubble, burst, floating label), re-projected every frame. */
interface Anchored {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  /** Seconds left (real time); the element is removed at 0. */
  left: number;
}

interface Bubble extends Anchored {
  uid: number;
  eid: number;
  category: string;
  /** Running-time age (holds while paused). */
  age: number;
}

class Juice {
  private world = h('div', { class: 'jc-world' });
  private top = h('div', { class: 'jc-top' });
  private bubbles: Bubble[] = [];
  private fx: Anchored[] = [];
  private ndc = new Vector3();
  private nextTip = FIRST_TIP;
  private combo = 0;
  private lastPop = -1e9;
  private streak = 0;
  private lastReady = -1e9;
  private timer = 0;
  tips = store.get(TIPS_KEY) !== 'off';

  // Milestone tracker.
  private card: HTMLElement;
  private cTitle = h('b', { class: 'jc-m-title' });
  private cHint = h('p', { class: 'jc-m-hint' });
  private cIcon = h('span', { class: 'jc-m-ico' });
  private cCount = h('span', { class: 'jc-m-count' });
  private cBar = h('i');
  private cHave = h('span', { class: 'jc-m-have' });
  private cReward = h('span', { class: 'jc-m-reward' });
  private cAct = h('div', { class: 'jc-m-act' });
  private cWhy = h('p', { class: 'jc-m-why' });
  private cPill = h('span', { class: 'jc-m-pill-text' });
  private shown = '';
  private ready = new Set<string>();
  private folded = store.get(FOLD_KEY) === '1';

  constructor(private ctx: GameContext) {
    ctx.hud.append(this.world);
    document.body.append(this.top);
    this.card = h(
      'section',
      { class: 'jc-m panel holo hidden', 'aria-label': 'Next milestone' },
      h(
        'header',
        { class: 'jc-m-head' },
        icon('star'),
        h('span', { class: 'jc-m-kicker' }, 'Next milestone'),
        this.cCount,
        h(
          'button',
          {
            class: 'icon-btn jc-m-fold',
            title: 'Fold',
            'aria-label': 'Fold the milestone card',
            onClick: () => this.fold(true),
          },
          icon('down'),
        ),
      ),
      h('div', { class: 'jc-m-main' }, this.cIcon, h('div', { class: 'jc-m-text' }, this.cTitle, this.cHint)),
      h('div', { class: 'jc-m-bar' }, this.cBar),
      h('div', { class: 'jc-m-foot' }, this.cHave, this.cReward),
      this.cAct,
      h(
        'button',
        {
          class: 'jc-m-pill',
          title: 'Show the next milestone',
          onClick: () => {
            // Inspecting something: the card waits as a pill beside the inspector, so showing it closes that.
            if (this.card.parentElement?.querySelector(':scope > .info:not(.hidden)')) ctx.bus.emit('selection:changed', { eid: null });
            this.fold(false);
          },
        },
        icon('star'),
        this.cPill,
      ),
    );
    this.card.classList.toggle('folded', this.folded);
    // Desktops: the card heads the right column, so the inspector (and the advisor) stack under it instead of
    // sliding beneath it; while something is inspected it shrinks to its pill (CSS). Phones: a strip above Build.
    const right = ctx.services.get('hud').right;
    const place = (compact: boolean) => (compact ? ctx.hud.append(this.card) : right.prepend(this.card));
    place(isCompact());
    onCompactChange(place);

    const { bus } = ctx;
    bus.on('building:ready', ({ eid }) => this.built(eid));
    bus.on('building:removed', ({ eid }) => {
      for (const b of this.bubbles) if (b.eid === eid) b.left = Math.min(b.left, 0.01);
    });
    for (const ev of ['city:reset', 'load:done'] as const)
      bus.on(ev, () => {
        this.clear();
        this.nextTip = FIRST_TIP;
        this.shown = '';
        // A loaded or new city's finished milestones are not news: only ones reached from here on chime.
        this.ready = new Set(claimableMilestones(ctx.city).map((m) => m.id));
      });
    bus.on('milestone:claimed', ({ reward }) => this.claimed(reward));
    this.ready = new Set(claimableMilestones(ctx.city).map((m) => m.id));
  }

  private get live(): boolean {
    const c = this.ctx;
    return (
      !c.loading &&
      c.cameraCtl.enabled &&
      !document.body.classList.contains('chapter-open') &&
      !c.services.tryGet('moments')?.playing
    );
  }

  // ── Tip bubbles ──

  /** A happy, standing building in view (nearest the middle of the screen wins more often). */
  private pickTipSpot(): { eid: number; x: number; y: number; z: number } | null {
    const { city, camera } = this.ctx;
    const cand: { eid: number; x: number; y: number; z: number; w: number }[] = [];
    const taken = new Set(this.bubbles.map((b) => b.eid));
    // Where the bubbles already floating are on screen (NDC): a new one keeps clear of them.
    const near = this.bubbles.map((b) => this.ndc.set(b.x, b.y, b.z).project(camera).clone());
    const gap = (70 / Math.min(innerWidth, innerHeight)) * 2;
    for (const eid of city.buildingEntities()) {
      if (taken.has(eid)) continue;
      const def = city.buildingDef(eid);
      if (!TIP_CATEGORIES.has(def.category) || def.landmark) continue;
      if (Service.off[eid] || isRuined(city, eid) || (Service.condition[eid] ?? 1) < 0.5) continue;
      if (def.category === 'residential' && Service.occupancy[eid]! < 0.3) continue;
      const cx = Building.x[eid]! + Building.w[eid]! / 2;
      const cz = Building.z[eid]! + Building.d[eid]! / 2;
      this.ndc.set(cx, city.grid.heightAt(cx, cz) + 4, cz).project(camera);
      if (this.ndc.z > 1 || Math.abs(this.ndc.x) > 0.75 || this.ndc.y > 0.6 || this.ndc.y < -0.75) continue;
      if (
        near.some((n) => Math.hypot(n.x - this.ndc.x, (n.y - this.ndc.y) * (innerHeight / innerWidth)) < gap)
      )
        continue;
      cand.push({ eid, x: cx, y: 0, z: cz, w: 1.2 - Math.hypot(this.ndc.x, this.ndc.y) * 0.8 });
      if (cand.length > 400) break;
    }
    if (!cand.length) return null;
    let sum = 0;
    for (const c of cand) sum += c.w;
    let r = Math.random() * sum;
    const pick = cand.find((c) => (r -= c.w) <= 0) ?? cand[0]!;
    const rec = city.buildingRecord(pick.eid);
    const p = placeBuilding(city.grid, city.buildingDef(pick.eid), rec.x, rec.z, rec.rot);
    const e = p.base.elements;
    return { eid: pick.eid, x: e[12]!, y: e[13]! + Math.min(22, p.template.height) + 2.2, z: e[14]! };
  }

  spawnTip(): boolean {
    if (this.bubbles.length >= MAX_BUBBLES) return false;
    const spot = this.pickTipSpot();
    if (!spot) return false;
    const { city } = this.ctx;
    const category = city.buildingDef(spot.eid).category;
    const el = h(
      'button',
      { class: 'jc-bubble', title: 'A resident left a tip: click to collect', 'aria-label': 'Collect a tip' },
      h(
        'span',
        { class: 'jc-bubble-in' },
        icon(TIP_ICONS[category] ?? 'happy'),
        h('span', { class: 'jc-bubble-v' }, `◈${tipValue(city, 1)}`),
      ),
    );
    const b: Bubble = { el, ...spot, uid: Building.uid[spot.eid]!, category, left: BUBBLE_LIFE + 1, age: 0 };
    el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.pop(b);
    });
    this.world.append(el);
    this.bubbles.push(b);
    return true;
  }

  private pop(b: Bubble): void {
    if (b.left <= 0 || b.el.classList.contains('popped')) return;
    const now = performance.now() / 1000;
    this.combo = now - this.lastPop < COMBO_WINDOW ? Math.min(5, this.combo + 1) : 1;
    this.lastPop = now;
    const city = this.ctx.city;
    const before = city.credits;
    // A tip is a receipt, not an edit: off the undo stack, so ⌘Z still undoes the last build.
    if (!this.ctx.commands.execute('collectTip', { uid: b.uid, combo: this.combo }, false)) return;
    const amount = Math.round(city.credits - before);
    b.el.classList.add('popped');
    b.left = 0.45;
    this.ctx.bus.emit('juice', { sound: 'tip', step: this.combo - 1 });
    // The burst, what was said, and the amount, over the building.
    this.anchor(h('div', { class: 'jc-burst tone-tip' }, ...petals(8)), b.x, b.y, b.z, 0.9);
    this.anchor(
      h(
        'div',
        { class: 'jc-say' },
        h('q', {}, quoteFor(city, b.category, Math.random())),
        this.combo > 1 ? h('span', { class: 'jc-combo' }, `Combo ×${this.combo}`) : null,
      ),
      b.x,
      b.y + 1.5,
      b.z,
      2.8,
    );
    const r = b.el.getBoundingClientRect();
    this.coins(r.left + r.width / 2, r.top + r.height / 2, amount, Math.min(6, 2 + this.combo));
  }

  // ── Build ready ──

  private built(eid: number): void {
    if (this.ctx.loading) return;
    const { city } = this.ctx;
    const def = city.buildingDef(eid);
    const rec = city.buildingRecord(eid);
    const p = placeBuilding(city.grid, def, rec.x, rec.z, rec.rot);
    const e = p.base.elements;
    const [x, y, z] = [e[12]!, e[13]! + Math.min(26, p.template.height) + 1, e[14]!];
    const now = performance.now() / 1000;
    this.streak = now - this.lastReady < STREAK_WINDOW ? Math.min(6, this.streak + 1) : 0;
    this.lastReady = now;
    this.ctx.bus.emit('juice', { sound: 'ready', step: this.streak });
    this.anchor(
      h('div', { class: 'jc-burst tone-ready' }, h('i', { class: 'jc-ring' }), ...petals(10)),
      x,
      y,
      z,
      1.1,
    );
    const gains = yields(def.id);
    if (gains.length || this.streak > 0)
      this.anchor(
        h(
          'div',
          { class: 'jc-gain' },
          ...gains.map(([ico, text]) => h('span', {}, icon(ico), text)),
          this.streak > 0
            ? h('span', { class: 'jc-streak' }, icon('sparkle'), `Build streak ×${this.streak + 1}`)
            : null,
        ),
        x,
        y + 1,
        z,
        2.6,
      );
  }

  // ── Coins into the credits counter ──

  private coins(sx: number, sy: number, amount: number, n: number): void {
    const target = document.querySelector<HTMLElement>('.topbar .stat-credits');
    const r = target?.getBoundingClientRect();
    if (!target || !r || !r.width) return;
    const tx = r.left + 18;
    const ty = r.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const jitter = (i - (n - 1) / 2) * 14;
      const coin = h(
        'span',
        {
          class: 'jc-coin',
          style: `left:${sx + jitter}px;top:${sy}px;--dx:${tx - sx - jitter}px;--dy:${ty - sy}px;--d:${i * 0.06}s`,
        },
        h('i', {}, icon('credits')),
      );
      this.top.append(coin);
      const last = i === n - 1;
      coin.addEventListener('animationend', (ev) => {
        if (ev.target !== coin) return;
        coin.remove();
        if (!last) return;
        this.ctx.bus.emit('juice', { sound: 'coin' });
        target.classList.remove('jc-bump');
        void target.offsetWidth;
        target.classList.add('jc-bump');
        const plus = h(
          'span',
          { class: 'jc-plus', style: `left:${tx}px;top:${r.bottom + 4}px` },
          `+◈${fmt(amount)}`,
        );
        this.top.append(plus);
        plus.addEventListener('animationend', () => plus.remove());
      });
    }
  }

  // ── Milestone tracker ──

  private fold(folded: boolean): void {
    this.folded = folded;
    store.set(FOLD_KEY, folded ? '1' : '0');
    this.card.classList.toggle('folded', folded);
  }

  private claim(m: MilestoneDef, from: HTMLElement): void {
    from.focus();
    this.ctx.commands.execute('claimMilestone', { id: m.id }, false);
  }

  /** A claim from anywhere (this card, the Goals tab, Flora): confetti and coins from the button that did it. */
  private claimed(reward: number): void {
    if (this.ctx.loading) return;
    const from =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : this.card;
    const r = from.getBoundingClientRect();
    this.ctx.bus.emit('juice', { sound: 'claim' });
    const conf = h(
      'div',
      { class: 'jc-confetti', style: `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px` },
      ...confetti(18),
    );
    this.top.append(conf);
    setTimeout(() => conf.remove(), 1400);
    this.coins(r.left + r.width / 2, r.top + r.height / 2, reward, 7);
    this.card.classList.remove('jc-turn');
    void this.card.offsetWidth;
    this.card.classList.add('jc-turn');
    this.shown = '';
    this.renderCard();
  }

  private renderCard(): void {
    const { city } = this.ctx;
    const m = city.growth.progression ? nextMilestone(city) : undefined;
    const hide = !m || !this.live;
    this.card.classList.toggle('hidden', hide);
    if (!m) return;
    const p = m.progress(city);
    const done = milestoneDone(city, m);
    const claimable = claimableMilestones(city).length;
    const got = city.growth.milestones.length;
    const k = Math.min(1, p.have / p.need);
    this.cBar.style.transform = `scaleX(${k.toFixed(3)})`;
    const unit = (v: number) =>
      m.unit === 'pct' ? `${fmt(v)}%` : m.unit === 'credits' ? `◈${fmt(v)}` : fmt(v);
    setText(
      this.cHave,
      p.need === 1 ? (done ? 'Done' : 'Not yet') : `${unit(Math.min(p.have, p.need))} / ${unit(p.need)}`,
    );
    setText(this.cCount, `${got + 1} / ${MILESTONES.length}`);
    setText(this.cPill, done ? `Claim ◈${fmt(m.reward)}` : `${m.title} · ${Math.round(k * 100)}%`);
    const build = done ? undefined : m.build?.(this.ctx.city);
    // Can't be built right now (locked, at its limit, too dear): the card says why and offers the way forward.
    const block = build && buildings.has(build) ? buildBlock(city, build) : null;
    if (block) setText(this.cWhy, block.reason);
    const key = `${m.id}|${done}|${claimable}|${build ?? ''}|${block?.kind ?? ''}|${block?.steps.find((s) => s.act)?.act?.label ?? ''}`;
    this.card.classList.toggle('ready', done);
    if (key === this.shown) return;
    this.shown = key;
    setText(this.cTitle, m.title);
    setText(this.cHint, m.hint);
    this.cIcon.replaceChildren(icon(m.icon));
    this.cReward.replaceChildren(icon('credits'), `${fmt(m.reward)}`);
    if (done) {
      const btn: HTMLButtonElement = h(
        'button',
        { class: 'jc-claim', onClick: () => this.claim(m, btn) },
        icon('star'),
        `Claim ◈${fmt(m.reward)}`,
        claimable > 1 ? h('span', { class: 'jc-more' }, `+${claimable - 1} more`) : null,
      );
      this.cAct.replaceChildren(btn);
    } else if (build && buildings.has(build)) {
      const name = buildings.get(build).name;
      const step = block?.steps.find((s) => s.act)?.act;
      const parts: HTMLElement[] = [];
      if (block) parts.push(this.cWhy);
      if (!block || block.kind === 'credits')
        parts.push(
          h(
            'button',
            { class: 'jc-do', title: `Build a ${name}`, onClick: () => this.ctx.services.get('construction').startBuilding(build) },
            icon('build'),
            `Build ${name}`,
          ),
        );
      if (step) parts.push(h('button', { class: 'jc-do jc-next', onClick: () => runGate(this.ctx, step.action) }, icon('next'), step.label));
      this.cAct.replaceChildren(...parts);
    } else this.cAct.replaceChildren();
  }

  /** Chimes once when a milestone is reached (not for ones already reached when the city loaded). */
  private watchReady(): void {
    const { city } = this.ctx;
    const now = claimableMilestones(city);
    for (const m of now)
      if (!this.ready.has(m.id)) {
        this.ready.add(m.id);
        this.ctx.bus.emit('juice', { sound: 'claimable' });
        this.card.classList.remove('jc-ping');
        void this.card.offsetWidth;
        this.card.classList.add('jc-ping');
        if (this.folded || isCompact())
          this.ctx.bus.emit('toast', {
            text: `★ Milestone reached: ${m.title}. Claim ◈${fmt(m.reward)}`,
            tone: 'ok',
          });
      }
    for (const id of this.ready) if (!now.some((m) => m.id === id)) this.ready.delete(id);
  }

  // ── Frame ──

  private anchor(fx: HTMLElement, x: number, y: number, z: number, life: number): void {
    // The wrapper takes the screen position; the effect inside is free to animate its own transform.
    const el = h('div', { class: 'jc-at' }, fx);
    this.world.append(el);
    const a = { el, x, y, z, left: life };
    this.fx.push(a);
    this.place(a);
  }

  private place(a: Anchored): boolean {
    this.ndc.set(a.x, a.y, a.z).project(this.ctx.camera);
    const vis = this.ndc.z < 1 && Math.abs(this.ndc.x) < 1.1 && Math.abs(this.ndc.y) < 1.1;
    a.el.classList.toggle('off', !vis);
    if (vis)
      a.el.style.transform = `translate3d(${(((this.ndc.x + 1) * innerWidth) / 2).toFixed(1)}px, ${(((1 - this.ndc.y) * innerHeight) / 2).toFixed(1)}px, 0)`;
    return vis;
  }

  private clear(): void {
    for (const a of [...this.bubbles, ...this.fx]) a.el.remove();
    this.bubbles = [];
    this.fx = [];
  }

  update(dt: number): void {
    const live = this.live;
    this.world.classList.toggle('hidden', !live);
    const running = live && this.ctx.engine.speed > 0;
    // Bubbles age only while time runs; they drift away at the end of their life.
    for (const b of this.bubbles) {
      if (running && !b.el.classList.contains('popped')) b.age += dt;
      if (b.age > BUBBLE_LIFE - 4) b.el.classList.add('fading');
      if (b.age >= BUBBLE_LIFE) b.left = Math.min(b.left, 0.01);
      if (b.el.classList.contains('popped')) b.left -= dt;
    }
    for (const a of this.fx) a.left -= dt;
    this.bubbles = this.bubbles.filter((b) => (b.left > 0 ? true : (b.el.remove(), false)));
    this.fx = this.fx.filter((a) => (a.left > 0 ? true : (a.el.remove(), false)));
    if (live) {
      for (const b of this.bubbles) this.place(b);
      for (const a of this.fx) this.place(a);
    }
    if (running && this.tips && (this.nextTip -= dt * Math.min(2, this.ctx.engine.speed)) <= 0) {
      // Nothing in view: try again shortly.
      this.nextTip = this.spawnTip() ? TIP_GAP[0] + Math.random() * (TIP_GAP[1] - TIP_GAP[0]) : 5;
    }
    if ((this.timer += dt) < 0.25) return;
    this.timer = 0;
    if (!this.ctx.loading) this.watchReady();
    this.renderCard();
  }
}

/** What a building adds, as up to two short lines for the ready burst. */
function yields(defId: string): [string, string][] {
  const s = buildings.get(defId).stats;
  const out: [string, string][] = [];
  if (s.population > 0) out.push(['people', `+${fmt(s.population)} residents`]);
  if (s.energy > 0) out.push(['energy', `+${fmt(s.energy)} energy`]);
  if (s.water > 0) out.push(['water', `+${fmt(s.water)} water`]);
  if (s.food > 0) out.push(['food', `feeds ${fmt(s.food)}`]);
  if (s.jobs > 0) out.push(['jobs', `+${fmt(s.jobs)} jobs`]);
  if (s.eco > 0 && out.length < 2) out.push(['eco', `+${fmt(s.eco)} ecology`]);
  if (s.happiness > 0 && out.length < 2) out.push(['happy', `+${fmt(s.happiness)} harmony`]);
  return out.slice(0, 2);
}

function petals(n: number): HTMLElement[] {
  return Array.from({ length: n }, (_, i) =>
    h('i', {
      class: 'jc-petal',
      style: `--a:${((360 / n) * i).toFixed(0)}deg;--r:${(28 + (i % 3) * 9).toFixed(0)}px`,
    }),
  );
}

function confetti(n: number): HTMLElement[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const r = 50 + Math.random() * 70;
    return h('i', {
      class: `jc-bit c${i % 4}`,
      style: `--x:${(Math.cos(a) * r).toFixed(0)}px;--y:${(Math.sin(a) * r - 30).toFixed(0)}px;--s:${(Math.random() * 540 - 270).toFixed(0)}deg`,
    });
  });
}

export const juiceModule: GameModule = {
  id: 'juice',
  deps: ['hud', 'construction', 'moments', 'rising'],
  init(ctx) {
    const juice = new Juice(ctx);
    ctx.systems.add({ id: 'juice', phase: 'render', order: 141, update: (_c, f) => juice.update(f.dt) });
    ctx.services.provide('juice', {
      get tips() {
        return juice.tips;
      },
      set tips(on: boolean) {
        juice.tips = on;
        store.set(TIPS_KEY, on ? 'on' : 'off');
      },
      spawnTip: () => juice.spawnTip(),
    });
  },
};
