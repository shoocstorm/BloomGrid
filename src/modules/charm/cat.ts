import { Vector3 } from 'three/webgpu';
import type { GameContext } from '@/game/context';
import { Building, Service } from '@/ecs/components';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';
import { isRuined } from '@/sim/hazards';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { BUTTERFLY_SVG, CAT_NAMES, CAT_SIDE_SVG, CAT_SVG, COATS } from './art';

/**
 * The island's cat (D-175, lively in D-176): a small character with a routine, not a sticker.
 *
 * Awake, it picks something to do every few seconds: look around, flick an ear, groom a paw, yawn, stretch, pad
 * along its roof (side on, legs walking), settle into a loaf, watch a butterfly and pounce, or leap in an arc to a
 * neighbouring roof. Its eyes follow the pointer when it comes near, and it perks up when hovered. A click pets it
 * (hearts, a meow, a squish; a purr every fifth pet, a gift every tenth). At night it sleeps, with the odd ear
 * twitch and tail flick.
 *
 * Everything is DOM over the city: the element is anchored to a roof each frame; poses and acts are CSS classes
 * (`pose-side`, `act-*`) on the rigged SVG (`art.ts`); the walk offset and leap arc are written per frame, one
 * element only.
 *
 * A pet (D-177): it follows the view (leaping roof to roof toward the screen's middle, or dropping in when you have
 * gone far), comes to you before it speaks, and talks in a bubble that rides above it (`talk`). Its bond with the
 * steward grows with pets (`BONDS`).
 */
export interface Spot {
  eid: number;
  x: number;
  y: number;
  z: number;
}

/** What the cat needs from the charms module: floating words / hearts, and its run of time. */
export interface CatHost {
  anchor(el: HTMLElement, x: number, y: number, z: number, life: number): void;
}

export type Act =
  | 'sit'
  | 'look'
  | 'twitchL'
  | 'twitchR'
  | 'groom'
  | 'yawn'
  | 'stretch'
  | 'walk'
  | 'loaf'
  | 'watch'
  | 'pounce'
  | 'flick'
  | 'stir';

/** Awake acts and how often each is picked. */
const AWAKE: [Act | 'leap' | 'butterfly', number][] = [
  ['sit', 2],
  ['look', 3],
  ['twitchL', 1],
  ['twitchR', 1],
  ['groom', 2],
  ['yawn', 1],
  ['stretch', 1.2],
  ['walk', 3.5],
  ['loaf', 1],
  ['butterfly', 0.9],
  ['leap', 1.6],
];
const ASLEEP: [Act, number][] = [
  ['sit', 3],
  ['twitchL', 1],
  ['twitchR', 1],
  ['flick', 1.5],
  ['stir', 0.5],
];
/** Seconds each act lasts (walks and loafs set their own). */
const LENGTH: Partial<Record<Act, number>> = {
  sit: 2.5,
  look: 2.8,
  twitchL: 0.7,
  twitchR: 0.7,
  groom: 3.4,
  yawn: 1.9,
  stretch: 2.1,
  watch: 2.6,
  pounce: 0.7,
  flick: 1,
  stir: 2.2,
};
const MEWS = ['mrrp!', 'mew?', 'prrrt', 'meow!', 'mrow', '…mew'];
const BUTTERFLIES = ['#ffd45e', '#ff9ec4', '#9fd8ff', '#c7a6ff', '#ffffff'];
/** Beyond this camera distance the cat would dwarf the roofs: it hides. */
const CAT_FAR = 260;
/** Walk speed, in roof half-widths per second. */
const WALK_SPEED = 0.42;
/** A leap reaches roofs this far (world units); farther, the cat hops off and appears on the new roof. */
const LEAP_REACH = 40;

/** The stray's shadow coat (D-178): it reads as a silhouette with lamp-bright eyes. */
const STRAY = { fur: '#3a3f4a', belly: '#4b515d', mark: '#3a3f4a', eye: '#ffd75e' };

/** A stray's visits (real seconds while the charms show): the first after founding, between visits, each visit. */
const STRAY_FIRST: [number, number] = [50, 80];
const STRAY_AWAY: [number, number] = [90, 160];
const STRAY_STAY: [number, number] = [25, 40];

/** How close the cat feels to the steward, by pets (D-177). */
export const BONDS = [
  { pets: 0, name: 'Shy' },
  { pets: 3, name: 'Friend' },
  { pets: 12, name: 'Buddy' },
  { pets: 30, name: 'Best friend' },
] as const;
export const bondOf = (pets: number): number => BONDS.reduce((b, l, i) => (pets >= l.pets ? i : b), 0);
/** Following: the cat moves when it sits farther than this share of the short screen side from the middle. */
const FOLLOW_AT = 0.3;

export interface TalkOptions {
  /** Seconds the bubble stays (real time). */
  ttl?: number;
  /** A button in the bubble ("Show me"). */
  action?: { label: string; run: () => void };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(table: [T, number][]): T => {
  let r = Math.random() * table.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of table) if ((r -= w) <= 0) return v;
  return table[0]![0];
};

export interface SpotOptions {
  /** Tallest roof (world units). */
  maxH?: number;
  /** Only roofs within a leap of here. */
  near?: Spot | null;
  /** Any building's roof, not only homes' (the cat follows the view anywhere, D-177). */
  any?: boolean;
  /** Following: only roofs closer to the screen centre than this (px), the closest most likely. */
  toward?: number;
}

/** A small roof in view, nearer the screen middle more often (or within a leap of `near`). */
export function homeSpot(ctx: GameContext, exclude: number | null, opts: SpotOptions = {}): Spot | null {
  const { city, camera } = ctx;
  const { maxH = 18, near = null, any = false, toward } = opts;
  const ndc = _ndc;
  const cand: { eid: number; w: number }[] = [];
  const half = Math.min(innerWidth, innerHeight) / 2;
  for (const eid of city.buildingEntities()) {
    if (eid === exclude) continue;
    const def = city.buildingDef(eid);
    if ((!any && def.category !== 'residential') || def.landmark) continue;
    if (isRuined(city, eid) || (Service.condition[eid] ?? 1) < 0.5) continue;
    const cx = Building.x[eid]! + Building.w[eid]! / 2;
    const cz = Building.z[eid]! + Building.d[eid]! / 2;
    const d = near ? Math.hypot(cx - near.x, cz - near.z) : 0;
    if (near && (d > LEAP_REACH || d < 2)) continue;
    ndc.set(cx, city.grid.heightAt(cx, cz) + 3, cz).project(camera);
    if (ndc.z > 1 || Math.abs(ndc.x) > 0.75 || ndc.y > 0.55 || ndc.y < -0.7) continue;
    let w = near ? 1 / (4 + d) : 1.2 - Math.hypot(ndc.x, ndc.y) * 0.8;
    if (toward !== undefined) {
      const px = Math.hypot((ndc.x * innerWidth) / 2, (ndc.y * innerHeight) / 2);
      if (px > toward - 30) continue;
      w = 1 / (0.15 + px / half) ** 3;
    }
    cand.push({ eid, w });
    if (cand.length > 300) break;
  }
  for (let tries = 0; tries < 6 && cand.length; tries++) {
    let r = Math.random() * cand.reduce((s, c) => s + c.w, 0);
    const i = Math.max(
      0,
      cand.findIndex((c) => (r -= c.w) <= 0),
    );
    const { eid } = cand.splice(i, 1)[0]!;
    const rec = city.buildingRecord(eid);
    const p = placeBuilding(city.grid, city.buildingDef(eid), rec.x, rec.z, rec.rot);
    if (p.template.height > maxH) continue;
    const e = p.base.elements;
    return { eid, x: e[12]!, y: e[13]! + p.template.height, z: e[14]! };
  }
  return null;
}
const _ndc = new Vector3();

export class Cat {
  readonly el: HTMLButtonElement;
  private inner = h('span', { class: 'ch-cat-in' });
  private side = h('span', { class: 'ch-side' });
  name = 'Miso';
  pets = 0;
  at: Spot | null = null;
  private ndc = new Vector3();
  private v = new Vector3();
  /** Screen position of the roof point last frame (px), for the pointer and the walk. */
  private sx = 0;
  private sy = 0;
  private visible = false;

  // Behaviour.
  private act: Act = 'sit';
  private actLeft = 0;
  private gap = 1.5;
  private busy = 0;
  private asleep = false;
  private hover = false;
  private findIn = 0;
  /** Walk: position along the roof in half-widths (−1…1), and where it is heading. */
  private wx = 0;
  private wxTo = 0;
  private lastTx = '';
  /** The roof's walkable half-width on screen (px), last frame. */
  private range = 0;
  private look = '';
  /** A leap in progress: world arc from one roof to the next. */
  private leap: { from: Spot; to: Spot; t: number; dur: number; h: number } | null = null;
  private butterfly: HTMLElement | null = null;

  // A pet (D-177): following and talking.
  private followIn = 1;
  private chasing = false;
  private offFor = 0;
  private talkEl = h('div', { class: 'ch-talk hidden', role: 'status', 'aria-live': 'polite' });
  private talkName = h('b', {});
  private talkText = h('span', { class: 'ch-talk-t' });
  private talkAct = h('div', { class: 'ch-talk-act' });
  private talkLeft = 0;
  /** The bubble's shift to stay on screen (px). */
  private bx = 0;
  private pendingTalk: (() => void) | null = null;
  /** The module's hooks: a chase starts (it may say "wait for me"), the bond grows. */
  onFollow: (() => void) | null = null;
  /** A stray was clicked (D-178). */
  onShy: (() => void) | null = null;
  /** Before adoption: a shadow with glowing eyes, no name, keeps its distance. */
  stray = false;
  private strayIn = 60;
  private strayStay = 0;
  private coat: (typeof COATS)[number] = COATS[0]!;
  onBond: ((level: number) => void) | null = null;

  constructor(
    private ctx: GameContext,
    private host: CatHost,
  ) {
    this.inner.innerHTML = CAT_SVG;
    this.side.innerHTML = CAT_SIDE_SVG;
    this.inner.append(this.side);
    this.talkEl.append(this.talkName, this.talkText, this.talkAct);
    this.el = h('button', { class: 'ch-cat hidden' }, this.inner, this.talkEl) as HTMLButtonElement;
    // The bubble is the cat's, but a click on it is not a pet: it dismisses (or runs its button).
    this.talkEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hush();
    });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pet();
    });
    this.el.addEventListener('pointerenter', () => {
      this.hover = true;
      this.el.classList.add('hover');
    });
    this.el.addEventListener('pointerleave', () => {
      this.hover = false;
      this.el.classList.remove('hover');
    });
  }

  /** This island's cat: name and coat from the seed, pets from this viewer's count. */
  adopt(seed: number, pets: number, stray = false): void {
    const k = Math.abs(Math.floor(seed)) || 1;
    this.name = CAT_NAMES[k % CAT_NAMES.length]!;
    this.coat = COATS[Math.floor(k / 7) % COATS.length]!;
    this.stray = stray;
    this.paint();
    this.pets = pets;
    this.titleIt();
    setText(this.talkName, stray ? '???' : this.name);
    this.hush();
    this.at = null;
    this.leap = null;
    this.findIn = 2;
    this.strayIn = rand(...STRAY_FIRST);
    this.el.classList.add('hidden');
    this.setAct('sit', 1);
  }

  /** The coat, or before adoption the stray's shadow with glowing eyes (D-178). */
  private paint(): void {
    const s = this.el.style;
    const c = this.stray ? STRAY : this.coat;
    s.setProperty('--fur', c.fur);
    s.setProperty('--belly', c.belly);
    s.setProperty('--mark', c.mark);
    s.setProperty('--eye', c.eye ?? '#1f2a24');
    this.el.classList.toggle('stray', this.stray);
  }

  /** The coat it shows once adopted. */
  get colours() {
    return this.coat;
  }

  /** Adopted (D-178): its own colours, its name, and from now on a pet. */
  befriend(): void {
    this.stray = false;
    this.paint();
    this.titleIt();
    setText(this.talkName, this.name);
  }

  /**
   * Back to a stray (D-178): the city it is on hasn't befriended it (a new island founded over an old one). It
   * leaves at once and only visits later.
   */
  unfriend(): void {
    this.stray = true;
    this.paint();
    this.titleIt();
    setText(this.talkName, '???');
    this.hush();
    this.endAct();
    this.leap = null;
    this.at = null;
    this.strayIn = rand(...STRAY_FIRST);
    this.el.classList.add('hidden');
  }

  /** A stray's visit ends: off the roof and out of sight. */
  private leave(): void {
    this.endAct();
    this.hush();
    this.el.classList.remove('land', 'arrive');
    this.el.classList.add('hop');
    this.busy = 0.5;
    setTimeout(() => {
      if (!this.stray) return;
      this.at = null;
      this.el.classList.add('hidden');
    }, 420);
  }

  /** Hover title and label, with the bond. */
  private titleIt(): void {
    if (this.stray) {
      this.el.title = 'A shy stray. It might stay if the island had fish and a sunny garden…';
      this.el.setAttribute('aria-label', 'A shy stray cat');
      return;
    }
    const bond = BONDS[bondOf(this.pets)]!.name;
    this.el.title = `${this.name}, the island's cat · ${bond}`;
    this.el.setAttribute('aria-label', `Pet ${this.name}`);
  }

  get bond(): number {
    return bondOf(this.pets);
  }

  get asleepNow(): boolean {
    return this.asleep;
  }

  // ── Talking (D-177) ──

  /** Says `text` in a bubble above the cat; if it is out of sight, it comes into view first. */
  talk(text: string, opts: TalkOptions = {}): void {
    const show = () => {
      setText(this.talkText, text);
      this.talkAct.replaceChildren();
      const a = opts.action;
      if (a)
        this.talkAct.append(
          h(
            'button',
            {
              class: 'ch-talk-btn',
              onClick: (e: Event) => {
                e.stopPropagation();
                a.run();
                this.hush();
              },
            },
            a.label,
          ),
        );
      this.talkEl.classList.remove('hidden', 'pop');
      void this.talkEl.offsetWidth;
      this.talkEl.classList.add('pop');
      this.talkLeft = opts.ttl ?? Math.min(9, 3.5 + text.length / 18) + (a ? 3 : 0);
    };
    if (this.visible && this.at) return show();
    this.pendingTalk = show;
    if (!this.come()) this.pendingTalk = null;
  }

  hush(): void {
    this.talkLeft = 0;
    this.pendingTalk = null;
    this.talkEl.classList.add('hidden');
  }

  get talking(): boolean {
    return this.talkLeft > 0 || !!this.pendingTalk;
  }

  /** Into view near the middle of the screen (a drop in); true when it is (or now will be) in view. */
  come(): boolean {
    if (this.visible && this.at && !this.leap) return true;
    if (this.leap) return true;
    const spot = homeSpot(this.ctx, this.at?.eid ?? null, { any: true });
    if (!spot) return false;
    this.endAct();
    this.settle(spot);
    return true;
  }

  // ── Moving between roofs ──

  /** On a roof: `land` from a leap (a squash), `arrive` from out of sight (a drop in). */
  private settle(spot: Spot, how: 'land' | 'arrive' = 'arrive'): void {
    this.at = spot;
    this.wx = this.wxTo = 0;
    this.el.classList.remove('hidden', 'hop', 'land', 'arrive');
    void this.el.offsetWidth;
    this.el.classList.add(how);
  }

  /** To a roof in view: a leap when one is near, otherwise off this roof and onto the other. */
  wander(): boolean {
    const from = this.at;
    const near = from && this.visible ? homeSpot(this.ctx, from.eid, { near: from, any: true }) : null;
    if (from && near) return this.leapTo(near);
    const spot = homeSpot(this.ctx, from?.eid ?? null, { any: true });
    if (!spot) return false;
    if (!from) {
      this.settle(spot);
      return true;
    }
    this.endAct();
    this.el.classList.remove('land');
    this.el.classList.add('hop');
    this.busy = 0.45;
    setTimeout(() => this.settle(spot), 420);
    return true;
  }

  private leapTo(to: Spot): boolean {
    const from = this.at!;
    const start = { ...from, x: from.x, y: from.y, z: from.z };
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    this.endAct();
    this.clearButterfly();
    this.leap = { from: start, to, t: 0, dur: Math.min(1.3, 0.55 + d * 0.02), h: 2.5 + d * 0.22 };
    // Face the way it jumps (on screen).
    this.ndc.set(to.x, to.y, to.z).project(this.ctx.camera);
    const toX = ((this.ndc.x + 1) * innerWidth) / 2;
    this.face(toX >= this.sx ? 1 : -1);
    this.el.classList.add('pose-side', 'act-leap');
    this.wx = this.wxTo = 0;
    this.busy = this.leap.dur + 0.3;
    return true;
  }

  // ── Acts ──

  private face(dir: number): void {
    this.side.style.scale = dir < 0 ? '-1 1' : '1 1';
  }

  private setAct(act: Act, length = LENGTH[act] ?? 2): void {
    this.el.classList.remove(`act-${this.act}`);
    this.act = act;
    this.actLeft = length;
    if (act !== 'sit') this.el.classList.add(`act-${act}`);
    this.el.classList.toggle('pose-side', act === 'walk' || act === 'loaf');
  }

  private endAct(): void {
    this.el.classList.remove(`act-${this.act}`, 'pose-side', 'act-leap');
    this.act = 'sit';
    this.actLeft = 0;
    this.wxTo = this.wx;
  }

  /** The next thing to do. */
  private choose(range: number): void {
    if (this.asleep) {
      this.setAct(pick(ASLEEP));
      this.gap = rand(3, 7);
      return;
    }
    this.perform(pick(AWAKE), range);
  }

  /** Does `next` now (scripts name one: `charm.act('groom')`). */
  perform(next: Act | 'leap' | 'butterfly', range = this.range): void {
    if (!this.at || this.leap) return;
    this.endAct();
    if ((next === 'walk' || next === 'loaf') && range < 8) next = 'look';
    if (next === 'butterfly' && this.ctx.city.timeOfDay > 0.8) next = 'groom';
    if (next === 'leap') {
      if (!this.wander()) this.setAct('look');
      return;
    }
    if (next === 'butterfly') return this.watchButterfly();
    if (next === 'walk') {
      // Pad to another spot along the roof, side on.
      let to = rand(-1, 1);
      if (Math.abs(to - this.wx) < 0.5) to = this.wx > 0 ? rand(-1, -0.3) : rand(0.3, 1);
      this.wxTo = to;
      this.face(to > this.wx ? 1 : -1);
      this.setAct('walk', Math.abs(to - this.wx) / WALK_SPEED + 0.1);
      this.gap = rand(0.4, 1.2);
      return;
    }
    if (next === 'loaf') this.face(Math.random() < 0.5 ? 1 : -1);
    this.setAct(next, next === 'loaf' ? rand(6, 10) : undefined);
    this.gap = rand(0.8, 2.6);
  }

  private watchButterfly(): void {
    this.clearButterfly();
    const b = h('span', {
      class: 'ch-bfly',
      style: `--bf:${BUTTERFLIES[Math.floor(Math.random() * BUTTERFLIES.length)]}`,
    });
    b.innerHTML = BUTTERFLY_SVG;
    b.classList.toggle('flip', Math.random() < 0.5);
    this.inner.append(b);
    this.butterfly = b;
    this.setAct('watch');
    this.gap = 0;
    this.after = () => {
      this.setAct('pounce');
      b.classList.add('away');
      this.after = () => {
        this.clearButterfly();
        this.gap = rand(1, 2);
      };
    };
  }

  private after: (() => void) | null = null;

  private clearButterfly(): void {
    this.butterfly?.remove();
    this.butterfly = null;
    if (this.act === 'watch' || this.act === 'pounce') this.after = null;
  }

  // ── Petting ──

  /** Petting: hearts and a meow; a purr every fifth pet, a gift every tenth. Returns what it "said". */
  private pet(): void {
    const at = this.at;
    if (!at || this.busy > 0 || this.leap) return;
    if (this.stray) {
      // Too shy to be touched: it darts off, and the module says what might win it over.
      this.onShy?.();
      this.busy = 1;
      setTimeout(() => this.wander(), 350);
      return;
    }
    const { ctx } = this;
    const bond = this.bond;
    this.pets++;
    this.onPet?.(this.pets);
    this.titleIt();
    if (this.bond > bond) setTimeout(() => this.onBond?.(this.bond), 1400);
    this.endAct();
    this.clearButterfly();
    this.after = null;
    this.host.anchor(
      h('div', { class: 'ch-hearts' }, ...[0, 1, 2].map((i) => h('i', { style: `--i:${i}` }, icon('happy')))),
      at.x,
      at.y,
      at.z,
      1.6,
    );
    this.inner.classList.remove('squish');
    void this.inner.offsetWidth;
    this.inner.classList.add('squish');
    if (this.asleep) {
      ctx.bus.emit('juice', { sound: 'purr' });
      this.say(`${this.name} stretches, yawns, and goes back to sleep.`);
      this.setAct('stir');
      this.busy = 1.5;
      return;
    }
    if (this.pets % 10 === 0) {
      // A gift: a resident's tip on the cat's roof (the sim pays it, like any tip).
      const before = ctx.city.credits;
      const ok = ctx.commands.execute('collectTip', { uid: Building.uid[at.eid]!, combo: 1 }, false);
      const amount = Math.round(ctx.city.credits - before);
      ctx.bus.emit('juice', { sound: 'meow' });
      if (ok && amount > 0) {
        ctx.bus.emit('juice', { sound: 'coin' });
        this.say(`${this.name} found ◈${amount} under a bench and brought it to you!`, 'gift');
      } else this.say(`${this.name} brought you a leaf. It is a very good leaf.`, 'gift');
      this.busy = 2.2;
    } else if (this.pets % 5 === 0) {
      ctx.bus.emit('juice', { sound: 'purr' });
      this.say(`${this.name} purrs. ${this.name} likes you.`);
      this.setAct('loaf', 3);
      this.busy = 1.6;
    } else {
      ctx.bus.emit('juice', { sound: 'meow' });
      this.say(`${this.name}: ${MEWS[this.pets % MEWS.length]}`);
      this.busy = 0.9;
      // Cats don't stay put: off to another roof once the hearts are up.
      if (Math.random() < 0.5) setTimeout(() => this.at && !this.leap && this.wander(), 1000);
    }
    this.gap = rand(1, 2);
  }

  /** Set by the module: count and First. */
  onPet: ((pets: number) => void) | null = null;

  /** A short line from a pet: the bubble, briefly (a gift line stays a little longer). */
  private say(text: string, tone = ''): void {
    this.talk(text, { ttl: tone === 'gift' ? 4.5 : 2.4 });
  }

  /**
   * Stays with the steward: asleep, it only turns up again once it has been out of sight a while; awake, it drops
   * in when out of sight and otherwise leaps roof by roof toward the middle of the screen.
   */
  private follow(vis: boolean, far: boolean): void {
    if (far || this.leap || this.busy > 0 || this.hover || !this.at) return;
    // A stray keeps its distance: it visits on its own schedule (`update`), never follows.
    if (this.stray) return;
    if (!vis) {
      if (this.offFor > (this.asleep ? 4 : 0.6)) this.come();
      return;
    }
    if (this.asleep) return;
    const dc = Math.hypot(this.sx - innerWidth / 2, this.sy - innerHeight / 2);
    if (dc < FOLLOW_AT * Math.min(innerWidth, innerHeight)) {
      this.chasing = false;
      return;
    }
    const next = homeSpot(this.ctx, this.at.eid, { near: this.at, any: true, toward: dc });
    if (!next) {
      this.chasing = false;
      return;
    }
    if (!this.chasing) this.onFollow?.();
    this.chasing = true;
    this.leapTo(next);
  }

  // ── Frame ──

  /** Half the roof's width on screen (px), for walking. */
  private roofRange(at: Spot, scale: number): number {
    const r = Math.min(Building.w[at.eid] ?? 2, Building.d[at.eid] ?? 2) * 0.36;
    let best = 0;
    for (const [dx, dz] of [
      [r, 0],
      [0, r],
    ] as const) {
      this.ndc.set(at.x + dx, at.y, at.z + dz).project(this.ctx.camera);
      const px = ((this.ndc.x + 1) * innerWidth) / 2;
      best = Math.max(best, Math.abs(px - this.sx));
    }
    return Math.max(0, Math.min(70, best - 10 * scale));
  }

  update(dt: number, night: boolean, pointer: { x: number; y: number }): void {
    const { ctx } = this;
    if (this.busy > 0) this.busy -= dt;
    if (night !== this.asleep) {
      this.asleep = night;
      this.el.classList.toggle('sleep', night);
      this.endAct();
      this.clearButterfly();
      this.after = null;
    }
    if (this.stray) {
      // A stray visits (D-178): first a while after the island is founded, then now and then, for half a minute.
      if (this.at && !this.leap) {
        if ((this.strayStay -= dt) <= 0 && !this.hover && !this.talking && this.busy <= 0) {
          this.leave();
          this.strayIn = rand(...STRAY_AWAY);
        }
      } else if (!this.at && !this.leap && (this.strayIn -= dt) <= 0) {
        this.strayIn = 5;
        if (this.come()) this.strayStay = rand(...STRAY_STAY);
      }
    } else if (!this.at && !this.leap && (this.findIn -= dt) <= 0) {
      this.findIn = 3;
      this.wander();
    }
    // Where it is: on a roof, or in the air between two.
    let x: number, y: number, z: number;
    const lp = this.leap;
    if (lp) {
      lp.t = Math.min(1, lp.t + dt / lp.dur);
      const t = lp.t;
      x = lp.from.x + (lp.to.x - lp.from.x) * t;
      z = lp.from.z + (lp.to.z - lp.from.z) * t;
      y = lp.from.y + (lp.to.y - lp.from.y) * t + 4 * lp.h * t * (1 - t);
      if (t >= 1) {
        this.leap = null;
        this.el.classList.remove('act-leap', 'pose-side');
        this.settle(lp.to, 'land');
        this.gap = rand(0.8, 1.6);
      }
    } else if (this.at) ({ x, y, z } = this.at);
    else {
      this.el.classList.add('hidden');
      return;
    }
    const dist = this.v.set(x, y, z).distanceTo(ctx.camera.position);
    this.ndc.set(x, y, z).project(ctx.camera);
    const vis = dist < CAT_FAR && this.ndc.z < 1 && Math.abs(this.ndc.x) < 1.1 && Math.abs(this.ndc.y) < 1.1;
    this.visible = vis;
    this.el.classList.toggle('off', !vis);
    const scale = Math.min(1.3, Math.max(0.5, 70 / dist));
    if (vis) {
      this.sx = ((this.ndc.x + 1) * innerWidth) / 2;
      this.sy = ((1 - this.ndc.y) * innerHeight) / 2;
      this.el.style.transform = `translate3d(${this.sx.toFixed(1)}px, ${this.sy.toFixed(1)}px, 0)`;
      this.el.style.setProperty('--s', scale.toFixed(2));
    }
    // The routine.
    const range = this.at && vis && !lp ? this.roofRange(this.at, scale) : 0;
    this.range = range;
    if (!lp && this.at) {
      if (this.act === 'walk') {
        const step = WALK_SPEED * dt;
        this.wx += Math.max(-step, Math.min(step, this.wxTo - this.wx));
      }
      if (this.actLeft > 0 && (this.actLeft -= dt) <= 0) {
        this.endAct();
        const then = this.after;
        this.after = null;
        then?.();
      } else if (this.actLeft <= 0 && this.busy <= 0 && !this.hover && vis && (this.gap -= dt) <= 0)
        this.choose(range);
      // Following the steward (D-177): off screen, or drifted from the middle of it.
      if ((this.followIn -= dt) <= 0) {
        this.followIn = this.chasing ? 0.25 : 0.8;
        this.follow(vis, dist >= CAT_FAR);
      }
    }
    this.offFor = vis ? 0 : this.offFor + dt;
    const tx = `${(this.wx * range).toFixed(1)}px 0`;
    if (tx !== this.lastTx) {
      this.lastTx = tx;
      this.inner.style.translate = tx;
      this.el.style.setProperty('--wxpx', `${(this.wx * range).toFixed(1)}px`);
    }
    // The bubble: waits for the cat to be in view, then counts down.
    if (this.pendingTalk && vis && !lp) {
      const show = this.pendingTalk;
      this.pendingTalk = null;
      show();
    } else if (this.pendingTalk && this.offFor > 3) this.pendingTalk = null;
    if (this.talkLeft > 0 && !this.hover && (this.talkLeft -= dt) <= 0) this.talkEl.classList.add('hidden');
    // Keep the bubble on screen near an edge (its tail still points at the cat).
    if (this.talkLeft > 0 && vis) {
      const half = Math.min(125, innerWidth / 2 - 8);
      const cx = this.sx + this.wx * range;
      const bx = Math.round(Math.min(innerWidth - 8 - half, Math.max(8 + half, cx)) - cx);
      if (bx !== this.bx) {
        this.bx = bx;
        this.el.style.setProperty('--bx', `${bx}px`);
      }
    }
    // Eyes on the pointer when it is near (and a little head turn).
    if (vis && !night) {
      const cx = this.sx + this.wx * range;
      const cy = this.sy - 22 * scale;
      const dx = pointer.x - cx;
      const dy = pointer.y - cy;
      const d = Math.hypot(dx, dy);
      const k = d < 280 && d > 1 ? 1 : 0;
      const look = `${((k * dx) / Math.max(d, 1)).toFixed(2)}|${((k * dy) / Math.max(d, 1)).toFixed(2)}`;
      if (look !== this.look) {
        this.look = look;
        const [lx, ly] = look.split('|').map(Number) as [number, number];
        this.el.style.setProperty('--lx', String(lx));
        this.el.style.setProperty('--ly', String(ly));
      }
    }
  }
}
