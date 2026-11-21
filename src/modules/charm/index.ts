import { Vector3 } from 'three/webgpu';
import type { GameContext, GameModule } from '@/game/context';
import { Building } from '@/ecs/components';
import { voiceFor } from '@/modules/juice/quotes';
import { closeX } from '@/ui/closeX';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { PLANE_SVG } from './art';
import { Cat, homeSpot } from './cat';
import { TALK, line, type TalkKind } from './talk';
import { claimableMilestones } from '@/sim/milestones';
import { getCrisis } from '@/sim/crises';
import { SYSTEMS } from '@/sim/pulseState';
import { isOpen } from '@/sim/growthState';
import { playAdoption } from './cutscene';
import { noteText } from './notes';
import './charm.css';

/**
 * Little charms (D-175): small, harmless things that make the island feel lived in and reward a curious click.
 *
 * - **The island's cat** (`cat.ts`): each island has one (its name and coat follow the island's seed). It lives on
 *   the rooftops with a routine of its own (D-176): looks about, grooms, yawns, pads along the roof, loafs, chases
 *   butterflies and leaps from roof to roof; its eyes follow the pointer. A click pets it; every fifth pet it purrs,
 *   every tenth it brings a small gift (a resident's tip, paid by the sim's `collectTip`). It sleeps at night.
 *   Pets are counted per viewer and island (`localStorage`).
 * - **Paper planes**: every few minutes of running time a paper plane drifts across the screen; catch it to unfold
 *   a note from a resident (`notes.ts`), sometimes with a few credits folded inside. Missed planes just fly on.
 * - **Sleepy homes**: at night a "z z Z" floats from a home in view now and then.
 *
 * Cosmetic and DOM-only like the juice (transform / opacity keyframes, gentle motion); world-anchored pieces are
 * re-projected each frame (a handful at most). Off with Settings → Display → Little charms.
 */
declare module '@/core/Services' {
  interface GameServices {
    charm: CharmService;
  }
}

export interface CharmService {
  /** Charms on or off (per viewer). */
  on: boolean;
  /** Sends a paper plane now (scripts and scenes). */
  spawnPlane(): boolean;
  /** Moves the cat to a roof in view now; false when there is none. */
  wander(): boolean;
  /** Makes the cat do something now: look, groom, yawn, stretch, walk, loaf, butterfly, leap… (scenes). */
  act(name: string): void;
  /** Makes the cat say something now (scenes): an occasion from `talk.ts` or any text. */
  say(kindOrText: string): void;
  /** Plays the adoption cutscene now (scenes; the game plays it when "Befriend the stray" completes). */
  cutscene(): void;
  /** The island's cat: name, pets so far and whether it is on a roof. */
  readonly cat: { name: string; pets: number; placed: boolean };
}

const ON_KEY = 'bloomgrid.charms';
/** Running seconds before the first plane, then between planes. */
const FIRST_PLANE = 75;
const PLANE_GAP: [number, number] = [150, 260];
/** Seconds a plane takes to cross the screen, and a caught note stays up. */
const PLANE_FLIGHT = 13;
const NOTE_SHOW = 12;
/** Real seconds between sleepy "z z Z" at night. */
const ZZZ_GAP: [number, number] = [6, 10];

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

interface Anchored {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  left: number;
}

/**
 * How often the cat may speak (real seconds since its last line): moments (a milestone, a crisis) almost always,
 * small things (a new roof, a spotted plane) now and then, idle chatter rarely.
 */
const TALK_GAP = { moment: 5, minor: 16, chat: 45 } as const;
type Weight = keyof typeof TALK_GAP;
/** Running seconds between the cat's own remarks about the island. */
const CHATTER: [number, number] = [70, 130];
/** What a stray's dash says (D-178): its name is not yours to know yet. */
const STRAY_HINTS = [
  'The stray flinches and darts off. Fresh fish and a sunny garden might win it over.',
  'Too quick! It watches you from the next roof. Maybe if the harbour had more fish…',
  'A flick of the tail and it is gone. Strays like busy towns, full docks and warm gardens.',
];

/** Systems the cat worries about aloud, worst first. */
const WORRIES = ['food', 'water', 'energy', 'harmony', 'budget', 'jobs'] as const;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const isNight = (t: number) => t >= 0.9 || t < 0.22;
const later2 = (fn: () => void) => setTimeout(fn, 1200);

class Charm {
  on = store.get(ON_KEY) !== 'off';
  private world = h('div', { class: 'ch-world' });
  private top = h('div', { class: 'ch-top' });
  private ndc = new Vector3();
  private fx: Anchored[] = [];
  /** The pointer on screen (px), for the cat's eyes. */
  private pointer = { x: -1e4, y: -1e4 };
  private cat: Cat;

  // Planes and night.
  private nextPlane = FIRST_PLANE;
  private plane: HTMLElement | null = null;
  private note: HTMLElement | null = null;
  private noteLeft = 0;
  private zzzIn = rand(...ZZZ_GAP);

  // The cat's voice (D-177).
  private lastTalk = -1e9;
  private chatIn = rand(...CHATTER);
  private greetIn = 6;
  private wasAsleep: boolean | null = null;
  private eveningDay = -1;
  private claimSince = -1;
  /** The adoption film is queued or playing: the cat stays a stray until it ends. */
  private filming = false;

  constructor(private ctx: GameContext) {
    ctx.hud.append(this.world);
    document.body.append(this.top);
    this.cat = new Cat(ctx, { anchor: (el, x, y, z, life) => this.anchor(el, x, y, z, life) });
    this.cat.onPet = (pets) => {
      store.set(this.petsKey, String(pets));
      ctx.services.tryGet('juice')?.earn('cat');
    };
    this.cat.onBond = (level) => this.speakLine(line([TALK.bond[level] ?? ''], this.vars()), 'moment', true);
    this.cat.onFollow = () => Math.random() < 0.3 && this.speak('follow', 'minor');
    this.cat.onShy = () =>
      this.cat.talk(STRAY_HINTS[Math.floor(Math.random() * STRAY_HINTS.length)]!, {
        ttl: 6,
        action: { label: 'See how', run: () => this.ctx.services.tryGet('build')?.show('goals') },
      });
    this.listen();
    this.world.append(this.cat.el);
    this.adopt();
    addEventListener('pointermove', (e) => ((this.pointer.x = e.clientX), (this.pointer.y = e.clientY)), {
      passive: true,
    });
    for (const ev of ['city:reset', 'load:done'] as const)
      ctx.bus.on(ev, () => {
        this.adopt();
        this.clearPlane();
        this.closeNote();
        this.nextPlane = FIRST_PLANE;
        this.greetIn = 6;
        this.wasAsleep = null;
        this.claimSince = -1;
      });
    ctx.bus.on('building:removed', ({ eid }) => {
      if (this.cat.at?.eid === eid) this.cat.at = null;
    });
  }

  private get live(): boolean {
    const c = this.ctx;
    return (
      this.on &&
      !c.loading &&
      c.cameraCtl.enabled &&
      !document.body.classList.contains('chapter-open') &&
      !c.services.tryGet('moments')?.playing
    );
  }

  get catInfo() {
    return { name: this.cat.name, pets: this.cat.pets, placed: !!this.cat.at };
  }

  wander(): boolean {
    return this.cat.wander();
  }

  act(name: string): void {
    this.cat.perform(name as Parameters<Cat['perform']>[0]);
  }

  say(kindOrText: string): void {
    this.lastTalk = -1e9;
    if (kindOrText in TALK) this.speak(kindOrText as TalkKind, 'moment', { wake: true });
    else this.speakLine(kindOrText, 'moment', true);
  }

  private get petsKey(): string {
    return `bloomgrid.charm.pets.${this.ctx.city.seed}`;
  }

  /** The cat is the steward's (D-178): earned on a fresh island ("Befriend the stray"), always so elsewhere. */
  private get adopted(): boolean {
    return isOpen(this.ctx.city.growth, 'cat');
  }

  private adopt(): void {
    this.cat.adopt(this.ctx.city.seed, Number(store.get(this.petsKey)) || 0, !this.adopted);
  }

  /** The adoption cutscene (D-178), then the cat on a roof in view, saying hello. */
  cutscene(): void {
    const moments = this.ctx.services.tryGet('moments');
    this.filming = true;
    const run = (finish: () => void) => {
      playAdoption(
        this.ctx,
        { name: this.cat.name, coat: this.cat.colours, island: this.ctx.city.growth.name },
        () => {
          finish();
          this.filming = false;
          this.cat.befriend();
          store.set(`bloomgrid.charm.met.${this.ctx.city.seed}`, '1');
          this.greetIn = 0;
          this.cat.come();
          setTimeout(() => this.speakLine(line(TALK.adopted, this.vars()), 'moment', true), 900);
        },
      );
    };
    if (moments) moments.stage('cat-adopt', run);
    else run(() => {});
  }

  // ── The cat's voice (D-177) ──

  private vars(extra: Record<string, string | number> = {}): Record<string, string | number> {
    const city = this.ctx.city;
    return { cat: this.cat.name, island: city.growth.name || 'the island', day: city.day, ...extra };
  }

  /** A line for an occasion, if the cat may speak now (`wake`: even asleep; `chance`: only sometimes). */
  private speak(
    kind: TalkKind | `low.${(typeof WORRIES)[number]}`,
    weight: Weight,
    opts: {
      vars?: Record<string, string | number>;
      wake?: boolean;
      chance?: number;
      action?: { label: string; run: () => void };
    } = {},
  ): boolean {
    if (opts.chance !== undefined && Math.random() > opts.chance) return false;
    const lines = kind.startsWith('low.')
      ? TALK.low[kind.slice(4) as (typeof WORRIES)[number]]
      : (TALK[kind as TalkKind] as readonly string[]);
    return this.speakLine(line(lines, this.vars(opts.vars)), weight, opts.wake, opts.action);
  }

  private speakLine(
    text: string,
    weight: Weight,
    wake = false,
    action?: { label: string; run: () => void },
  ): boolean {
    const now = performance.now() / 1000;
    if (!text || !this.live || this.ctx.loading || this.cat.stray) return false;
    if (this.cat.asleepNow && !wake) return false;
    if (now - this.lastTalk < TALK_GAP[weight]) return false;
    if (this.cat.talking && weight !== 'moment') return false;
    this.lastTalk = now;
    this.cat.talk(text, { action });
    if (weight === 'moment') this.ctx.bus.emit('juice', { sound: 'meow' });
    return true;
  }

  /** The moments the cat reacts to. */
  private listen(): void {
    const { bus, city } = this.ctx;
    const later = (ms: number, fn: () => void) => setTimeout(fn, ms);
    bus.on('milestone:claimed', () => later(900, () => this.speak('milestone', 'moment')));
    bus.on('building:ready', ({ eid }) => {
      if (this.ctx.loading) return;
      const home = city.buildingDef(eid).category === 'residential';
      this.speak(home ? 'home' : 'built', 'minor', { chance: 0.45 });
    });
    bus.on('building:tier', ({ tier }) => tier > 1 && this.speak('level', 'minor', { chance: 0.5 }));
    bus.on('tip:collected', ({ golden, combo }) => {
      if (golden) later(600, () => this.speak('golden', 'moment'));
      else if (combo >= 3) this.speak('combo', 'minor', { chance: 0.5 });
    });
    bus.on(
      'juice',
      ({ sound }) =>
        sound === 'shimmer' && later(1000, () => this.speak('goldenSpotted', 'minor', { chance: 0.8 })),
    );
    bus.on('fireworks:start', () => this.speak('fireworks', 'moment', { wake: true }));
    bus.on('crisis:start', ({ crisis }) =>
      this.speak('crisis', 'moment', {
        wake: true,
        vars: { name: getCrisis(crisis.def)?.name ?? 'Trouble' },
      }),
    );
    bus.on('crisis:end', () => later(1500, () => this.speak('crisisEnd', 'moment')));
    bus.on('fire:start', ({ eid }) => {
      if (this.ctx.loading || city.buildingEntities().indexOf(eid) < 0) return;
      const x = Building.x[eid]! + Building.w[eid]! / 2;
      const z = Building.z[eid]! + Building.d[eid]! / 2;
      this.speak('fire', 'moment', {
        wake: true,
        action: { label: 'Show me', run: () => this.ctx.cameraCtl.locate(x, z, { size: 30 }) },
      });
    });
    bus.on('project:done', ({ id }) => {
      if (id === 'cat') return void (!this.ctx.loading && this.cutscene());
      this.speak('project', 'moment');
    });
    bus.on('happening:start', () => this.speak('happening', 'minor'));
    bus.on('bridge:opened', ({ by }) => by !== 'system' && this.speak('bridge', 'moment'));
    bus.on('wonder:discovered', ({ name }) => this.speak('wonder', 'moment', { vars: { name } }));
    bus.on('era:advanced', () => this.speak('era', 'moment'));
    bus.on('pulse:tier', ({ system, tier, prev }) => {
      if (tier >= 3 && tier > prev && (WORRIES as readonly string[]).includes(system))
        this.speak(`low.${system as (typeof WORRIES)[number]}`, 'moment', { wake: true });
    });
  }

  /** Its own remarks: a reward left unclaimed, a supply running low, a good day, or just a thought. */
  private chatter(): void {
    const city = this.ctx.city;
    const now = performance.now() / 1000;
    if (this.claimSince > 0 && now - this.claimSince > 20 && this.speak('claimable', 'chat')) return;
    const tiers = city.pulse.tiers;
    const worst = [...WORRIES].sort((a, b) => tiers[b] - tiers[a])[0]!;
    if (tiers[worst] >= 2 && this.speak(`low.${worst}`, 'chat')) return;
    const fine = SYSTEMS.every((s) => tiers[s] <= 1) && city.stats.happiness >= 65;
    this.speak(fine && Math.random() < 0.6 ? 'thriving' : 'idle', 'chat');
  }

  private voice(dt: number, run: number): void {
    const city = this.ctx.city;
    // Hello (the first time on this island) or welcome back, once the city is up.
    if (this.greetIn > 0 && !this.cat.stray && (this.greetIn -= dt) <= 0) {
      const key = `bloomgrid.charm.met.${city.seed}`;
      const met = store.get(key) === '1';
      store.set(key, '1');
      this.speak(met ? 'helloBack' : 'hello', 'moment');
    }
    // Waking (morning) and the lamps coming on (evening).
    const asleep = this.cat.asleepNow;
    if (this.wasAsleep === true && !asleep) later2(() => this.speak('morning', 'moment'));
    this.wasAsleep = asleep;
    const t = city.timeOfDay;
    if (t > 0.86 && t < 0.9 && this.eveningDay !== city.day) {
      this.eveningDay = city.day;
      this.speak('evening', 'minor');
    }
    // A milestone left waiting.
    const claimable = city.growth.progression && claimableMilestones(city).length > 0;
    if (!claimable) this.claimSince = -1;
    else if (this.claimSince < 0) this.claimSince = performance.now() / 1000;
    if (run > 0 && (this.chatIn -= run) <= 0) {
      this.chatIn = rand(...CHATTER);
      this.chatter();
    }
  }

  // ── Paper planes ──

  spawnPlane(): boolean {
    if (this.plane || !this.live) return false;
    const ltr = Math.random() < 0.5;
    const el = h(
      'button',
      {
        class: `ch-plane ${ltr ? 'ltr' : 'rtl'}`,
        style: `top:${Math.round(innerHeight * rand(0.22, 0.55))}px;--fly:${PLANE_FLIGHT}s`,
        title: 'A paper plane! Catch it',
        'aria-label': 'Catch the paper plane',
      },
      h('span', { class: 'ch-plane-in' }),
    );
    (el.firstChild as HTMLElement).innerHTML = PLANE_SVG;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.catchPlane(el);
    });
    el.addEventListener('animationend', (e) => e.target === el && this.clearPlane());
    this.top.append(el);
    this.plane = el;
    this.ctx.bus.emit('juice', { sound: 'paper' });
    setTimeout(() => this.plane === el && this.speak('planeSpotted', 'minor', { chance: 0.6 }), 1500);
    return true;
  }

  private clearPlane(): void {
    this.plane?.remove();
    this.plane = null;
  }

  private catchPlane(el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    this.clearPlane();
    const { ctx } = this;
    const city = ctx.city;
    ctx.bus.emit('juice', { sound: 'paper' });
    ctx.services.tryGet('juice')?.earn('letter');
    // Who wrote it: a home somewhere on the island.
    const homes = city.buildingEntities().filter((e) => city.buildingDef(e).category === 'residential');
    const from = homes.length ? homes[Math.floor(Math.random() * homes.length)]! : null;
    const fx = from === null ? 0 : Building.x[from]!;
    const fz = from === null ? 0 : Building.z[from]!;
    const by = voiceFor(city, 'residential', Math.random(), fx, fz).by;
    let gift = 0;
    if (from !== null && Math.random() < 1 / 3) {
      const before = city.credits;
      if (ctx.commands.execute('collectTip', { uid: Building.uid[from]!, combo: 1 }, false)) {
        gift = Math.round(city.credits - before);
        ctx.bus.emit('juice', { sound: 'coin' });
      }
    }
    this.closeNote();
    const note: HTMLElement = h(
      'section',
      { class: 'charm-note', role: 'status', 'aria-label': 'A note from a resident' },
      closeX('the note', () => this.closeNote()),
      h('p', {}, noteText(Math.random(), city.growth.name, this.cat.stray ? 'the stray cat' : this.cat.name)),
      h('cite', {}, by),
      gift > 0 ? h('span', { class: 'charm-note-gift' }, icon('credits'), `Folded inside: ◈${gift}`) : null,
    );
    const w = Math.min(280, innerWidth - 24);
    note.style.left = `${Math.round(Math.min(innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2)))}px`;
    note.style.top = `${Math.round(Math.min(innerHeight - 200, Math.max(70, r.top - 20)))}px`;
    note.style.width = `${w}px`;
    this.top.append(note);
    this.note = note;
    this.noteLeft = NOTE_SHOW;
  }

  private closeNote(): void {
    const n = this.note;
    if (!n) return;
    this.note = null;
    n.classList.add('out');
    setTimeout(() => n.remove(), 300);
  }

  // ── Frame ──

  private anchor(el: HTMLElement, x: number, y: number, z: number, life: number): void {
    const a = { el: h('div', { class: 'ch-at' }, el), x, y, z, left: life };
    this.world.append(a.el);
    this.fx.push(a);
    this.place(a.el, x, y, z);
  }

  private place(el: HTMLElement, x: number, y: number, z: number): boolean {
    this.ndc.set(x, y, z).project(this.ctx.camera);
    const vis = this.ndc.z < 1 && Math.abs(this.ndc.x) < 1.1 && Math.abs(this.ndc.y) < 1.1;
    el.classList.toggle('off', !vis);
    if (vis)
      el.style.transform = `translate3d(${(((this.ndc.x + 1) * innerWidth) / 2).toFixed(1)}px, ${(((1 - this.ndc.y) * innerHeight) / 2).toFixed(1)}px, 0)`;
    return vis;
  }

  private sleepy(): void {
    if (this.fx.filter((a) => a.el.firstElementChild?.classList.contains('ch-zzz')).length >= 2) return;
    const spot = homeSpot(this.ctx, this.cat.at?.eid ?? null, { maxH: 40 });
    if (!spot) return;
    this.anchor(
      h('div', { class: 'ch-zzz' }, h('i', {}, 'z'), h('i', {}, 'z'), h('i', {}, 'Z')),
      spot.x,
      spot.y + 1,
      spot.z,
      3.4,
    );
  }

  update(dt: number): void {
    const live = this.live;
    this.world.classList.toggle('hidden', !live);
    this.top.classList.toggle('hidden', !live);
    if (!live) return;
    const { ctx } = this;
    const running = ctx.engine.speed > 0;
    const run = running ? dt * Math.min(2, ctx.engine.speed) : 0;
    const night = isNight(ctx.city.timeOfDay);
    // Adoption follows the city every frame (D-178): a city change resets the cat before a new island turns
    // progression on, so reading it once at the reset would hand a fresh island a ready-made pet.
    const stray = !this.adopted;
    if (stray && !this.cat.stray) this.cat.unfriend();
    else if (!stray && this.cat.stray && !this.filming) this.cat.befriend();
    this.cat.update(dt, night, this.pointer);
    this.voice(dt, run);
    // Floating hearts, words and z's.
    for (const a of this.fx) a.left -= dt;
    this.fx = this.fx.filter((a) => (a.left > 0 ? true : (a.el.remove(), false)));
    for (const a of this.fx) this.place(a.el, a.x, a.y, a.z);
    if (night && (this.zzzIn -= dt) <= 0) {
      this.zzzIn = rand(...ZZZ_GAP);
      this.sleepy();
    }
    // Paper planes.
    if (this.note && (this.noteLeft -= dt) <= 0) this.closeNote();
    if (running && (this.nextPlane -= run) <= 0) {
      this.nextPlane = this.spawnPlane() ? rand(...PLANE_GAP) : 10;
    }
  }
}

export const charmModule: GameModule = {
  id: 'charm',
  deps: ['hud', 'juice'],
  init(ctx) {
    const charm = new Charm(ctx);
    ctx.systems.add({ id: 'charm', phase: 'render', order: 142, update: (_c, f) => charm.update(f.dt) });
    ctx.services.provide('charm', {
      get on() {
        return charm.on;
      },
      set on(v: boolean) {
        charm.on = v;
        store.set(ON_KEY, v ? 'on' : 'off');
      },
      spawnPlane: () => charm.spawnPlane(),
      wander: () => charm.wander(),
      act: (name: string) => charm.act(name),
      say: (k: string) => charm.say(k),
      cutscene: () => charm.cutscene(),
      get cat() {
        return charm.catInfo;
      },
    });
  },
};
