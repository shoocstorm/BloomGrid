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
import { GOLDEN_TIP, TIP_COMBO_MAX, tipValue } from '@/sim/tips';
import { isRuined } from '@/sim/hazards';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { isCompact, onCompactChange } from '@/platform/device';
import { buildBlock } from '@/sim/buildGate';
import { runGate } from '@/ui/gateSteps';
import { TIP_ICONS, voiceFor } from './quotes';
import { FIRSTS, FIRST_IDS } from './firsts';
import { size } from '@/sim/levels';
import { closeX } from '@/ui/closeX';
import { IDLE_SECONDS, idleTimer, type IdleTimer } from '@/ui/idle';
import './juice.css';

/**
 * Juice (D-118): small, quick rewards for paying attention, so the first hour on a fresh island feels alive
 * between the big moments (D-094).
 *
 * - **Tip bubbles**: every 20–35 s of running time a happy building in view floats a bubble. Popping it pays a tip
 *   (`collectTip`, valued by the sim), shows what the resident said (`quotes.ts`), and quick pops in a row build
 *   a combo (up to ×5). Bubbles left alone drift away after half a minute. Now and then several float at once
 *   (a *shower*), so a combo is there to be had, and a live meter under the top bar shows the combo draining and
 *   what the next pop is worth. Once the player has popped a few, about one bubble in ten is *golden*: it pays
 *   ×4 (the sim's `GOLDEN_TIP`) but leaves after 18 s (D-172).
 * - **Milestone tracker**: a card under the top bar shows the next steward milestone (`sim/milestones.ts`) with
 *   its progress, a Build shortcut and, once reached, a glowing Claim button. Claiming throws confetti, flies
 *   coins into the credits counter and turns the card to the next one. It folds to a pill. Past 80% it reads
 *   "Almost there" and its bar shimmers, so the last stretch pulls (D-172).
 * - **Build ready**: when a new building's last piece lands (`building:ready`), a burst of petals and what it adds
 *   ("+24 residents", "+30 energy") float off its roof; quick builds in a row step the chime up.
 * - **Coins**: tips and claims fly coins on an arc into the top bar's credits, which bump when they arrive.
 *
 * - **Early-game life (D-173)**: boats coming home float their haul over the dock (`fishing:landed`); homes
 *   filling up float "+N" residents; the milestone card ticks "+1" as a counted goal moves; *Firsts* (`firsts.ts`)
 *   badge eighteen discoveries of a fresh island once each (saved per city, listed in Build → Goals); and each dawn
 *   a Day recap card sums up the day just ended (residents, treasury, builds, tips, catch, firsts).
 *
 * DOM only, animated with transform / opacity keyframes (§7½); world-anchored pieces re-project each frame (≤ ~12
 * at once), everything else runs on CSS. Sounds hang off the `juice` event in the audio module. Ambient motion
 * stays small (a gentle bob), per the subtle-motion rule.
 */
export type JuiceSound =
  | 'tip'
  | 'golden'
  | 'shimmer'
  | 'coin'
  | 'ready'
  | 'claimable'
  | 'claim'
  | 'catch'
  | 'first'
  | 'day'
  | 'tick'
  | 'meow'
  | 'purr'
  | 'paper'
  // The adoption cutscene (D-178).
  | 'cs-night'
  | 'cs-blink'
  | 'cs-boing'
  | 'cs-sneak'
  | 'cs-freeze'
  | 'cs-whoosh'
  | 'cs-munch'
  | 'cs-reveal'
  | 'cs-fanfare'
  | 'cs-bell';

export interface JuiceService {
  /** Tip bubbles on or off (per viewer). */
  tips: boolean;
  /** Auto-collect (D-205) wanted by this viewer; it works once the city has unlocked it (`tipJar`). */
  autoTips: boolean;
  /** Whether this city has unlocked auto-collect (its treasury reached `AUTO_TIPS_AT`). */
  readonly tipJar: boolean;
  /** Treasury that unlocks auto-collect. */
  readonly autoAt: number;
  /** Spawns a tip bubble now (scripts and scenes); `golden` forces a golden one. */
  spawnTip(golden?: boolean): boolean;
  /** Every First (D-173) with whether this city has earned it, in catalogue order. */
  firsts(): { id: string; title: string; line: string; icon: string; earned: boolean }[];
  /** Shows the Day recap now for the day so far (scripts and scenes). */
  recap(): void;
  /** Marks a First earned by another module (the charms' cat and paper planes, D-175). */
  earn(id: string): void;
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
const AUTO_KEY = 'bloomgrid.tips.auto';
/**
 * Auto-collect (D-205): unlocked for a city the first time its treasury reaches this, then bubbles pop themselves
 * `AUTO_AFTER` seconds of running time after they appear (golden ones a little later), with the full pop (burst,
 * words, coins, sound). Shower bubbles appear a beat apart, so they pop a beat apart and still build a combo; the
 * player can pop any sooner.
 */
const AUTO_TIPS_AT = 1000;
const AUTO_AFTER = 3;
const AUTO_AFTER_GOLDEN = 4.5;
const FOLD_KEY = 'bloomgrid.milestones.folded';
const MAX_BUBBLES = 3;
const BUBBLE_LIFE = 32;
/** Seconds of running time before the first bubble, then between bubbles. */
const FIRST_TIP = 10;
const TIP_GAP: [number, number] = [20, 35];
/** Pops this close together (real seconds) build a combo. */
const COMBO_WINDOW = 7;
/** Golden bubbles (D-172): the chance per bubble once this many tips were popped, and their shorter life. */
const GOLDEN_CHANCE = 0.1;
const GOLDEN_AFTER = 3;
const GOLDEN_LIFE = 18;
/** The chance that a spawn turns into a shower (fills up to `MAX_BUBBLES`), once two tips were popped. */
const SHOWER_CHANCE = 0.2;
/** The milestone card reads "Almost there" from here. */
const NEAR = 0.8;
/** Move-in chips (D-173): only while the city is small (or progressing), at most this many per scan. */
const MOVE_IN_POP = 2500;
const MOVE_IN_MAX = 3;
/** Seconds a First badge or the Day recap stays up. */
const FIRST_SHOW = 4.2;
const RECAP_SHOW = IDLE_SECONDS.recap;
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
  golden: boolean;
  /** Running-time age (holds while paused) and lifetime. */
  age: number;
  life: number;
  /** Age at which it pops itself (0 = never: auto-collect off or not unlocked when it appeared). */
  auto: number;
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
  private slow = 0;
  tips = store.get(TIPS_KEY) !== 'off';
  autoTips = store.get(AUTO_KEY) !== 'off';
  /** This city unlocked auto-collect (saved with the city, D-205). */
  tipJar = false;
  private tipJarTold = false;

  // The screen stack under the top bar (D-173): combo meter, First badges, Day recap.
  private stack = h('div', { class: 'jc-stack' });
  // Firsts (D-173): earned ids, badges waiting to show, and a quiet pass after a city change.
  private firstSet = new Set<string>();
  private firstQueue: string[] = [];
  private firstUp = 0;
  private prime = true;
  // Move-in chips: residents last shown per home.
  private homes = new Map<number, number>();
  // Day recap: the day's start and what happened since.
  private day = 0;
  private dayStart = { pop: 0, credits: 0, tips: 0, tipIncome: 0, fish: 0, firsts: 0 };
  private dayBuilt = 0;
  private bestGrowth = 0;
  private recapEl: HTMLElement | null = null;
  private recapLeft = 0;
  // Milestone "+1" ticks.
  private tickId = '';
  private tickHave = 0;
  // Combo meter (D-172): shown while a combo can still grow.
  private meter = h('div', { class: 'jc-meter hidden', role: 'status' });
  private mCombo = h('b', { class: 'jc-meter-x' });
  private mNext = h('span', { class: 'jc-meter-next' });
  private mBar = h('i');

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
  /** Folds the card to its pill when left untouched (D-201); the player's own fold is the one remembered. */
  private idle!: IdleTimer;
  private cardId = '';

  constructor(private ctx: GameContext) {
    ctx.hud.append(this.world);
    document.body.append(this.top);
    this.meter.append(this.mCombo, this.mNext, h('span', { class: 'jc-meter-bar' }, this.mBar));
    this.stack.append(this.meter);
    this.top.append(this.stack);
    this.meter.style.setProperty('--win', `${COMBO_WINDOW}s`);
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
            if (this.card.parentElement?.querySelector(':scope > .info:not(.hidden)'))
              ctx.bus.emit('selection:changed', { eid: null });
            this.fold(false);
          },
        },
        icon('star'),
        this.cPill,
      ),
    );
    this.card.classList.toggle('folded', this.folded);
    this.idle = idleTimer(this.card, IDLE_SECONDS.card, () => this.fold(true, false));
    if (!this.folded) this.idle.arm();
    // Desktops: the card heads the right column, so the inspector (and the advisor) stack under it instead of
    // sliding beneath it; while something is inspected it shrinks to its pill (CSS). Phones: a strip above Build.
    const right = ctx.services.get('hud').right;
    const place = (compact: boolean) => (compact ? ctx.hud.append(this.card) : right.prepend(this.card));
    place(isCompact());
    onCompactChange(place);

    const { bus } = ctx;
    bus.on('building:ready', ({ eid }) => this.built(eid));
    bus.on('fishing:landed', (e) => this.landed(e.x, e.z, e.amount));
    bus.on('building:tier', ({ tier }) => tier > 1 && !ctx.loading && this.earn('level'));
    bus.on('happening:start', () => !ctx.loading && this.earn('festival'));
    bus.on('bridge:opened', ({ by }) => by !== 'system' && !ctx.loading && this.earn('bridge'));
    bus.on('project:done', () => !ctx.loading && this.earn('project'));
    bus.on('milestone:claimed', () => this.earn('claim'));
    ctx.services.get('save').addHook({
      id: 'juice',
      save: () => ({ firsts: [...this.firstSet], best: this.bestGrowth, tipJar: this.tipJar, told: this.tipJarTold }),
      load: (_c, data) => {
        const d = (data ?? {}) as { firsts?: unknown; best?: unknown; tipJar?: unknown; told?: unknown };
        this.tipJar = d.tipJar === true;
        this.tipJarTold = d.told === true;
        this.firstSet = new Set(
          Array.isArray(d.firsts) ? d.firsts.filter((id): id is string => FIRST_IDS.has(id as string)) : [],
        );
        this.bestGrowth = typeof d.best === 'number' && Number.isFinite(d.best) ? d.best : 0;
      },
    });
    bus.on('building:removed', ({ eid }) => {
      for (const b of this.bubbles) if (b.eid === eid) b.left = Math.min(b.left, 0.01);
    });
    for (const ev of ['city:reset', 'load:done'] as const)
      bus.on(ev, () => {
        this.clear();
        this.nextTip = FIRST_TIP;
        this.shown = '';
        if (ev === 'city:reset') {
          this.firstSet.clear();
          this.bestGrowth = 0;
          this.tipJar = false;
          this.tipJarTold = false;
        }
        // What is already true of a new or loaded city is marked quietly on the next check; badges waiting for
        // the old city are dropped.
        this.prime = true;
        this.firstQueue = [];
        this.homes.clear();
        this.newDay();
        // A loaded or new city's finished milestones are not news: only ones reached from here on chime.
        this.ready = new Set(claimableMilestones(ctx.city).map((m) => m.id));
      });
    bus.on('milestone:claimed', ({ reward }) => this.claimed(reward));
    // Charter tiers (plan v5, Phase 28) pour coins too; a perk-only tier still gets the burst.
    bus.on('charter:claimed', ({ reward }) => this.claimed(reward));
    this.ready = new Set(claimableMilestones(ctx.city).map((m) => m.id));
    this.newDay();
  }

  /** Auto-collect is unlocked for this city and wanted by this viewer. */
  private get autoOn(): boolean {
    return this.tipJar && this.autoTips;
  }

  /** The first time the treasury holds `AUTO_TIPS_AT`, the tip jar opens (for good, for this city). */
  private watchTipJar(): void {
    if (!this.tipJar && this.ctx.city.credits >= AUTO_TIPS_AT) this.tipJar = true;
  }

  /** The first bubble that will collect itself says so, once per city (a fresh island has the jar from the start). */
  private tellTipJar(): void {
    if (this.tipJarTold || this.ctx.loading) return;
    this.tipJarTold = true;
    this.ctx.bus.emit('toast', {
      text: 'Tip jar: tip bubbles now collect themselves when their ring fills. Pop them sooner for a combo (Settings → Display to turn it off).',
      tone: 'ok',
    });
  }

  private armAuto(b: Bubble): void {
    b.auto = Math.max(b.age, 0) + (b.golden ? AUTO_AFTER_GOLDEN : AUTO_AFTER);
    b.el.style.setProperty('--auto', `${b.auto - Math.max(b.age, 0)}s`);
    b.el.style.setProperty('--ring-in', `${Math.max(0, -b.age)}s`);
    b.el.classList.add('auto');
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

  spawnTip(golden?: boolean, delay = 0): boolean {
    if (this.bubbles.length >= MAX_BUBBLES) return false;
    const spot = this.pickTipSpot();
    if (!spot) return false;
    const { city } = this.ctx;
    const category = city.buildingDef(spot.eid).category;
    golden ??= city.growth.tips >= GOLDEN_AFTER && Math.random() < GOLDEN_CHANCE;
    const life = golden ? GOLDEN_LIFE : BUBBLE_LIFE;
    const auto = this.autoOn ? (golden ? AUTO_AFTER_GOLDEN : AUTO_AFTER) : 0;
    const el = h(
      'button',
      {
        class: `jc-bubble${golden ? ' golden' : ''}${auto ? ' auto' : ''}`,
        style: `--in:${delay.toFixed(2)}s;--ring-in:${delay.toFixed(2)}s;--auto:${auto}s`,
        title: golden
          ? `A golden tip, worth ×${GOLDEN_TIP}: catch it before it floats away`
          : 'A resident left a tip: click to collect',
        'aria-label': golden ? 'Collect a golden tip' : 'Collect a tip',
      },
      h(
        'span',
        { class: 'jc-bubble-in' },
        icon(golden ? 'sparkle' : (TIP_ICONS[category] ?? 'happy')),
        h('span', { class: 'jc-bubble-v' }, `◈${tipValue(city, 1, golden)}`),
        ring(),
      ),
    );
    if (golden) this.ctx.bus.emit('juice', { sound: 'shimmer' });
    const b: Bubble = {
      el,
      ...spot,
      uid: Building.uid[spot.eid]!,
      category,
      golden,
      left: life + 1,
      age: -delay,
      life,
      auto,
    };
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
    if (!this.ctx.commands.execute('collectTip', { uid: b.uid, combo: this.combo, golden: b.golden }, false))
      return;
    const amount = Math.round(city.credits - before);
    b.el.classList.add('popped');
    b.left = 0.45;
    this.ctx.bus.emit('juice', { sound: b.golden ? 'golden' : 'tip', step: this.combo - 1 });
    // The burst, what was said, and the amount, over the building.
    this.anchor(
      h(
        'div',
        { class: b.golden ? 'jc-burst tone-golden' : 'jc-burst tone-tip' },
        ...petals(b.golden ? 14 : 8),
      ),
      b.x,
      b.y,
      b.z,
      0.9,
    );
    const voice = voiceFor(city, b.category, Math.random(), b.x, b.z);
    this.anchor(
      h(
        'div',
        { class: 'jc-say' },
        h('q', {}, voice.text),
        h('cite', {}, voice.by),
        b.golden
          ? h('span', { class: 'jc-combo jc-gold' }, icon('sparkle'), `Golden tip ×${GOLDEN_TIP}`)
          : null,
        this.combo > 1 ? h('span', { class: 'jc-combo' }, `Combo ×${this.combo}`) : null,
      ),
      b.x,
      b.y + 1.5,
      b.z,
      2.8,
    );
    const r = b.el.getBoundingClientRect();
    this.coins(
      r.left + r.width / 2,
      r.top + r.height / 2,
      amount,
      b.golden ? 9 : Math.min(6, 2 + this.combo),
    );
    this.showMeter();
    this.earn('tip');
    if (b.golden) this.earn('golden');
    if (this.combo >= 3) this.earn('combo');
  }

  /** The combo meter: while another bubble floats, the combo is there to grow; the bar drains with the window. */
  private showMeter(): void {
    const left = this.bubbles.filter((o) => !o.el.classList.contains('popped'));
    if (!left.length) {
      this.meter.classList.add('hidden');
      return;
    }
    const next = Math.min(TIP_COMBO_MAX, this.combo + 1);
    setText(
      this.mCombo,
      this.combo >= TIP_COMBO_MAX
        ? `Max combo ×${TIP_COMBO_MAX}`
        : this.combo < 2
          ? 'Pop another for a combo'
          : `Combo ×${this.combo}`,
    );
    setText(
      this.mNext,
      `next pop ◈${fmt(
        tipValue(
          this.ctx.city,
          next,
          left.some((o) => o.golden),
        ),
      )}`,
    );
    this.meter.classList.remove('hidden');
    // Restart the drain.
    this.mBar.classList.remove('run');
    void this.mBar.offsetWidth;
    this.mBar.classList.add('run');
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
    this.dayBuilt++;
    if (def.category === 'residential') this.earn('home');
    if (this.streak >= 2) this.earn('streak');
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

  // ── Early-game life (D-173) ──

  /** A boat is home: its haul floats off the dock (only in view, so the sea doesn't chatter off screen). */
  private landed(x: number, z: number, amount: number): void {
    if (!this.live || amount < 1) return;
    this.earn('catch');
    this.ndc.set(x, 1.5, z).project(this.ctx.camera);
    if (this.ndc.z > 1 || Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1) return;
    this.ctx.bus.emit('juice', { sound: 'catch' });
    this.anchor(
      h('div', { class: 'jc-catch' }, h('i', { class: 'jc-splash' }), icon('wave'), `+◈${fmt(amount)}`),
      x,
      1.5,
      z,
      2.4,
    );
  }

  /** Homes that gained whole residents since the last scan float "+N" (a few at a time, in view only). */
  private moveIns(): void {
    const { city, camera } = this.ctx;
    if (!this.live || !(city.growth.progression || city.stats.population < MOVE_IN_POP)) return;
    // Screen spots taken this scan (px): neighbouring homes don't pile their chips up.
    const taken: [number, number][] = [];
    for (const eid of city.buildingEntities()) {
      const def = city.buildingDef(eid);
      if (def.category !== 'residential' || def.stats.population <= 0) continue;
      const now = Math.floor(def.stats.population * size(eid) * (Service.occupancy[eid] ?? 0));
      const was = this.homes.get(eid);
      this.homes.set(eid, now);
      if (was === undefined || now <= was || taken.length >= MOVE_IN_MAX) continue;
      const cx = Building.x[eid]! + Building.w[eid]! / 2;
      const cz = Building.z[eid]! + Building.d[eid]! / 2;
      const y = city.grid.heightAt(cx, cz) + 3;
      this.ndc.set(cx, y, cz).project(camera);
      if (this.ndc.z > 1 || Math.abs(this.ndc.x) > 0.9 || Math.abs(this.ndc.y) > 0.9) continue;
      const sx = ((this.ndc.x + 1) * innerWidth) / 2;
      const sy = ((1 - this.ndc.y) * innerHeight) / 2;
      if (taken.some(([x, y]) => Math.abs(x - sx) < 64 && Math.abs(y - sy) < 28)) continue;
      taken.push([sx, sy]);
      this.anchor(h('div', { class: 'jc-movein' }, icon('people'), `+${now - was}`), cx, y, cz, 2);
    }
  }

  /** Marks a First (progression cities only); `quiet` marks it without a badge. */
  private earn(id: string, quiet = false): void {
    if (!this.ctx.city.growth.progression || this.firstSet.has(id) || !FIRST_IDS.has(id)) return;
    this.firstSet.add(id);
    if (!quiet && !this.ctx.loading) this.firstQueue.push(id);
  }

  /** The city's own Firsts (population, treasury…): the first pass after a city change marks what is already true quietly. */
  private checkFirsts(): void {
    if (!this.ctx.city.growth.progression) return;
    for (const f of FIRSTS) if (f.check?.(this.ctx.city)) this.earn(f.id, this.prime);
    this.prime = false;
  }

  /** One First badge at a time, in the stack under the top bar. */
  private showFirsts(dt: number): void {
    if (this.firstUp > 0) this.firstUp -= dt;
    if (this.firstUp > 0 || !this.firstQueue.length || !this.live) return;
    const id = this.firstQueue.shift();
    const f = FIRSTS.find((d) => d.id === id);
    if (!f) return;
    const el = h(
      'div',
      { class: 'jc-first', role: 'status' },
      h('span', { class: 'jc-first-ico' }, icon(f.icon)),
      h(
        'div',
        { class: 'jc-first-text' },
        h('small', {}, `First! · ${FIRSTS.filter((d) => this.firstSet.has(d.id)).length} / ${FIRSTS.length}`),
        h('b', {}, f.title),
        h('span', {}, f.line),
      ),
    );
    el.style.setProperty('--show', `${FIRST_SHOW}s`);
    el.addEventListener('animationend', (e) => e.target === el && el.remove());
    this.stack.append(el);
    this.firstUp = FIRST_SHOW + 0.3;
    this.ctx.bus.emit('juice', { sound: 'first' });
  }

  private newDay(): void {
    const { city } = this.ctx;
    const g = city.growth;
    this.day = city.day;
    this.dayStart = {
      pop: city.stats.population,
      credits: city.credits,
      tips: g.tips,
      tipIncome: g.tipIncome,
      fish: g.fishIncome,
      firsts: this.firstSet.size,
    };
    this.dayBuilt = 0;
  }

  /** The Day recap (D-173): what the day just ended brought, with a nod to a record. */
  recap(ended = this.ctx.city.day): void {
    const { city } = this.ctx;
    const g = city.growth;
    const s = this.dayStart;
    const grew = Math.round(city.stats.population - s.pop);
    const record = grew > 0 && grew > this.bestGrowth && this.bestGrowth > 0;
    if (grew > this.bestGrowth) this.bestGrowth = grew;
    const money = Math.round(city.credits - s.credits);
    const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
    const tone = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
    const row = (ico: string, label: string, value: string, cls = '') =>
      h('li', { class: cls }, icon(ico), h('span', {}, label), h('b', {}, value));
    const rows = [
      row(
        'people',
        'Residents',
        `${sign(grew)}${fmt(Math.abs(grew))} → ${fmt(city.stats.population)}`,
        tone(grew),
      ),
      row('credits', 'Treasury', `${sign(money)}◈${fmt(Math.abs(money))}`, tone(money)),
      row('build', 'Finished', `${this.dayBuilt} building${this.dayBuilt === 1 ? '' : 's'}`),
    ];
    const tips = g.tips - s.tips;
    if (tips > 0) rows.push(row('happy', 'Tips', `${tips} · ◈${fmt(g.tipIncome - s.tipIncome)}`));
    const fish = g.fishIncome - s.fish;
    if (fish >= 1) rows.push(row('wave', 'Catch', `◈${fmt(fish)}`));
    const firsts = this.firstSet.size - s.firsts;
    if (firsts > 0)
      rows.push(row('sparkle', 'Firsts', `+${firsts} · ${this.firstSet.size} / ${FIRSTS.length}`));
    this.recapEl?.remove();
    const el: HTMLElement = h(
      'section',
      { class: 'jc-recap panel holo', 'aria-label': `Day ${ended} recap` },
      closeX('the day recap', () => this.closeRecap()),
      h(
        'header',
        {},
        icon('sun'),
        h('b', {}, `Day ${ended} complete`),
        h('span', {}, g.name || 'Your island'),
      ),
      h('ul', {}, ...rows),
      record
        ? h('p', { class: 'jc-record' }, icon('star'), `Best day yet: ${fmt(grew)} new residents`)
        : null,
    );
    this.recapEl = el;
    this.recapLeft = RECAP_SHOW;
    this.stack.append(el);
    this.ctx.bus.emit('juice', { sound: 'day' });
  }

  private closeRecap(): void {
    const el = this.recapEl;
    if (!el) return;
    this.recapEl = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
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

  /** `remember` = the player's choice (kept per viewer); an idle fold is not, so news unfolds the card again. */
  private fold(folded: boolean, remember = true): void {
    this.folded = folded;
    if (remember) store.set(FOLD_KEY, folded ? '1' : '0');
    this.card.classList.toggle('folded', folded);
    if (folded) this.idle.disarm();
    else this.idle.arm();
  }

  /** Something new on the card (a new goal, one reached): unfold it for a while unless the player keeps it folded. */
  private wake(): void {
    if (store.get(FOLD_KEY) === '1' || isCompact()) return;
    if (this.folded) this.fold(false, false);
    else this.idle.arm();
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
    // A counted goal moved: "+N" off the count (D-173).
    const whole = Math.floor(Math.min(p.have, p.need));
    if (
      m.id === this.tickId &&
      whole > this.tickHave &&
      (m.unit ?? 'count') === 'count' &&
      p.need > 1 &&
      p.need <= 100
    ) {
      const t = h('span', { class: 'jc-tick' }, `+${whole - this.tickHave}`);
      t.addEventListener('animationend', () => t.remove());
      this.cHave.parentElement?.append(t);
      this.ctx.bus.emit('juice', { sound: 'tick' });
    }
    this.tickId = m.id;
    this.tickHave = whole;
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
    const near = !done && p.need > 1 && k >= NEAR;
    this.card.classList.toggle('near', near);
    if (near) setText(this.cPill, `Almost: ${m.title} · ${Math.round(k * 100)}%`);
    if (key === this.shown) return;
    this.shown = key;
    if (m.id !== this.cardId) {
      if (this.cardId) this.wake();
      this.cardId = m.id;
    }
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
            {
              class: 'jc-do',
              title: `Build a ${name}`,
              onClick: () => this.ctx.services.get('construction').startBuilding(build),
            },
            icon('build'),
            `Build ${name}`,
          ),
        );
      if (step)
        parts.push(
          h(
            'button',
            { class: 'jc-do jc-next', onClick: () => runGate(this.ctx, step.action) },
            icon('next'),
            step.label,
          ),
        );
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
        this.wake();
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
    this.world.classList.toggle('held', !running);
    for (const b of this.bubbles) {
      if (running && !b.el.classList.contains('popped')) b.age += dt;
      // Auto-collect (D-205): the bubble pops itself once its ring has filled, with the full pop. Bubbles already
      // floating when it is unlocked or switched on join in; switched off, the ring goes.
      const popped = b.el.classList.contains('popped');
      if (this.autoOn && !b.auto && !popped) this.armAuto(b);
      b.el.classList.toggle('auto', this.autoOn && b.auto > 0);
      if (this.autoOn && b.auto > 0 && !popped) this.tellTipJar();
      if (running && this.autoOn && b.auto > 0 && b.age >= b.auto && !popped) this.pop(b);
      if (b.age > b.life - 4) b.el.classList.add('fading');
      if (b.age >= b.life) b.left = Math.min(b.left, 0.01);
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
      const ok = this.spawnTip();
      // A shower: the rest float up one after another, so a combo is there for the taking.
      if (ok && this.ctx.city.growth.tips >= 2 && Math.random() < SHOWER_CHANCE)
        for (let i = 1; this.bubbles.length < MAX_BUBBLES && i < MAX_BUBBLES; i++)
          this.spawnTip(undefined, i * 0.35);
      this.nextTip = ok ? TIP_GAP[0] + Math.random() * (TIP_GAP[1] - TIP_GAP[0]) : 5;
    }
    // The meter goes when the window closes or nothing is left to pop.
    if (
      !this.meter.classList.contains('hidden') &&
      (!live ||
        performance.now() / 1000 - this.lastPop > COMBO_WINDOW ||
        !this.bubbles.some((b) => !b.el.classList.contains('popped')))
    )
      this.meter.classList.add('hidden');
    this.stack.classList.toggle('hidden', !live);
    this.showFirsts(dt);
    // The recap waits while the pointer is on it (D-201).
    if (this.recapEl && live && !this.recapEl.matches(':hover') && (this.recapLeft -= dt) <= 0) this.closeRecap();
    // A new day: the recap of the one that ended (fresh islands only), then a new count.
    const { city } = this.ctx;
    if (city.day !== this.day && !this.ctx.loading) {
      if (city.day === this.day + 1 && city.growth.progression) {
        this.recap(this.day);
        this.earn('dawn');
      }
      this.newDay();
    }
    if ((this.timer += dt) < 0.25) return;
    this.timer = 0;
    if (!this.ctx.loading) this.watchReady();
    this.renderCard();
    if ((this.slow += 1) < 4) return;
    this.slow = 0;
    if (this.ctx.loading) return;
    this.watchTipJar();
    this.checkFirsts();
    this.moveIns();
  }

  /** A First earned elsewhere (a module's own event). */
  earnFirst(id: string): void {
    if (!this.ctx.loading) this.earn(id);
  }

  /** Every First with whether this city has it. */
  firsts(): ReturnType<JuiceService['firsts']> {
    return FIRSTS.map((f) => ({
      id: f.id,
      title: f.title,
      line: f.line,
      icon: f.icon,
      earned: this.firstSet.has(f.id),
    }));
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

const SVG = 'http://www.w3.org/2000/svg';
/** The auto-collect countdown (D-205): a ring round the bubble that fills until it pops itself (CSS, `.auto`). */
function ring(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'jc-ring');
  svg.setAttribute('viewBox', '0 0 50 50');
  svg.setAttribute('aria-hidden', 'true');
  const c = document.createElementNS(SVG, 'circle');
  c.setAttribute('cx', '25');
  c.setAttribute('cy', '25');
  c.setAttribute('r', '23');
  c.setAttribute('pathLength', '100');
  svg.append(c);
  return svg;
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
      get autoTips() {
        return juice.autoTips;
      },
      set autoTips(on: boolean) {
        juice.autoTips = on;
        store.set(AUTO_KEY, on ? 'on' : 'off');
      },
      get tipJar() {
        return juice.tipJar;
      },
      autoAt: AUTO_TIPS_AT,
      spawnTip: (golden?: boolean) => juice.spawnTip(golden),
      firsts: () => juice.firsts(),
      recap: () => juice.recap(),
      earn: (id: string) => juice.earnFirst(id),
    });
  },
};
