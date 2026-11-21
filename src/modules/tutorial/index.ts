import type { GameContext, GameModule } from '@/game/context';
import { SHOWCASE_SEED, foundCityStaged } from '@/game/newCity';
import type { SaveData } from '@/sim/save';
import { openingView } from '@/game/opening';
import { DIFFICULTIES, type DifficultyId } from '@/sim/difficulty';
import { CHALLENGES, TUTORIAL_KEY, guideWanted, openChapter } from './Chapter';
import { playFounding } from './founding';
import { challengeOf } from '@/sim/objectives';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { rise } from '@/ui/holo';
import './tutorial.css';


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


interface Step {
  title: string;
  body: string;
  /** Element to pulse while the step is open. */
  highlight?: string;
  /** Polled at 4 Hz once the step opens (with what it saw at the start): true completes it. */
  done?: (ctx: GameContext, start: { credits: number; x: number; z: number; distance: number }) => boolean;
}

/**
 * The how-to-play guide (D-072): six steps that complete on the real action, not on a click. Steps are data; add
 * one by appending to this list.
 */
const STEPS: Step[] = [
  {
    title: 'Look around',
    body: 'Drag to pan, scroll to zoom, right-drag (or Q / E) to orbit. Find your fishing hamlet on the coast. Every control: H, or Settings → Controls.',
    done: (c, s) =>
      Math.hypot(c.cameraCtl.target.x - s.x, c.cameraCtl.target.z - s.z) > 8 ||
      Math.abs(c.cameraCtl.distance - s.distance) > 15,
  },
  {
    title: 'Build a second fishing dock',
    body: 'Fishing pays the bills at first. Press Build (B) → Food, pick the Fishing Boat Dock (free) and click a spot that touches the sea. Done (or Esc) leaves build mode.',
    highlight: '.build-fab',
    done: (c) =>
      c.city.buildingEntities().filter((e) => c.city.buildingDef(e).id === 'fishing-dock').length >= 2,
  },
  {
    title: 'Connect it with a highway',
    body: 'Buildings need a Living Highway for power, water and workers. Build → Highway, then drag from the coast road to the new dock.',
    done: (c) => c.city.roadCount > roads,
  },
  {
    title: 'Read the City Pulse',
    body: 'The Pulse tab shows every system: green is thriving, red is failing. Budget shows your income, with Fishing apart. Press Next when you have had a look.',
    highlight: '.con-tab[title="Pulse"]',
  },
  {
    title: 'Grow your credits',
    body: 'Let time run (Space pauses, 1–3 set the speed) and earn 300 credits. Add homes along the road: residents pay tax. Pop the gold tip bubbles over happy buildings, and claim milestones from the card at the top right.',
    done: (c, s) => c.city.credits >= s.credits + 300,
  },
  {
    title: 'Set your goals',
    body: 'Open Build and its Goals tab: what to unlock next (Flora, the sky-lanes, the Aeroline), your milestones and the sea wonders still to find. Flora wakes once you have a power plant, a Data Spire and 1,500 credits saved.',
    highlight: '.build-fab, .bd-tab[title="Goals"]',
    done: () => !!document.querySelector('.build:not(.hidden) .bd-tab.on[title="Goals"]'),
  },
];
/** Highway tiles when the highway step opened (it completes on new ones). */
let roads = 0;

class Tutorial {
  readonly el: HTMLElement;
  private i = -1;
  private start = { credits: 0, x: 0, z: 0, distance: 0 };
  private title = h('b');
  private body = h('p');
  private dots = h('div', { class: 'tt-dots' });
  private next: HTMLButtonElement;
  private timer = 0;

  constructor(private ctx: GameContext) {
    this.next = h(
      'button',
      { class: 'tt-next', onClick: () => this.go(this.i + 1) },
      'Next',
    ) as HTMLButtonElement;
    this.el = h(
      'section',
      { class: 'tt panel holo hidden', role: 'dialog', 'aria-label': 'How to play' },
      h(
        'header',
        { class: 'tt-head' },
        icon('sparkle'),
        h('span', { class: 'tt-kicker' }, 'How to play'),
        this.dots,
        h(
          'button',
          {
            class: 'icon-btn',
            title: 'Skip the guide',
            'aria-label': 'Skip the guide',
            onClick: () => this.stop(true),
          },
          icon('close'),
        ),
      ),
      this.title,
      this.body,
      h(
        'div',
        { class: 'tt-foot' },
        h('button', { class: 'tt-skip', onClick: () => this.stop(true) }, 'Skip guide'),
        this.next,
      ),
    );
    ctx.hud.append(this.el);
  }

  get active(): boolean {
    return this.i >= 0;
  }

  begin(): void {
    this.go(0);
  }

  private go(i: number): void {
    document.querySelectorAll('.tt-glow').forEach((e) => e.classList.remove('tt-glow'));
    if (i >= STEPS.length) {
      this.stop(false);
      this.ctx.bus.emit('toast', {
        text: '✓ Guide complete: the island is yours. Reopen it any time from Settings.',
        tone: 'ok',
      });
      return;
    }
    this.i = i;
    store.set(TUTORIAL_KEY, String(i));
    const s = STEPS[i]!;
    const c = this.ctx;
    this.start = {
      credits: c.city.credits,
      x: c.cameraCtl.target.x,
      z: c.cameraCtl.target.z,
      distance: c.cameraCtl.distance,
    };
    roads = c.city.roadCount;
    setText(this.title, `${i + 1}. ${s.title}`);
    setText(this.body, s.body);
    setText(this.next, s.done ? 'Skip step' : i === STEPS.length - 1 ? 'Finish' : 'Next');
    this.dots.replaceChildren(
      ...STEPS.map((_, k) => h('i', { class: k < i ? 'done' : k === i ? 'on' : '' })),
    );
    if (s.highlight) document.querySelectorAll(s.highlight).forEach((e) => e.classList.add('tt-glow'));
    this.el.classList.remove('hidden');
    rise([this.title, this.body]);
  }

  stop(skipped: boolean): void {
    document.querySelectorAll('.tt-glow').forEach((e) => e.classList.remove('tt-glow'));
    this.i = -1;
    this.el.classList.add('hidden');
    store.set(TUTORIAL_KEY, skipped ? 'skipped' : 'done');
  }

  update(dt: number): void {
    if (this.i < 0) return;
    this.timer += dt;
    if (this.timer < 0.25) return;
    this.timer = 0;
    const s = STEPS[this.i]!;
    if (s.done?.(this.ctx, this.start)) this.go(this.i + 1);
  }
}

/**
 * The New Chapter dialog and how-to-play guide (Phase 16, D-072, D-085). A plain boot shows the dialog on the welcome
 * screen before the engine starts (`ui/welcome`, D-148), so only the chosen city is built; this module greets that
 * city and offers the same dialog in game (`wizard.open`), where it replaces the running city behind the loader. A
 * new island starts the six-step guide (skippable; reopen from Settings).
 */
export const tutorialModule: GameModule = {
  id: 'tutorial',
  deps: ['hud', 'pulse'],
  init(ctx) {
    const tut = new Tutorial(ctx);
    ctx.systems.add({ id: 'tutorial', phase: 'render', order: 140, update: (_c, f) => tut.update(f.dt) });

    /**
     * Founds the city behind the loading screen. A fresh island's film starts the moment the island exists, over the
     * loading screen (D-184), so the city is first seen after it; anything else flies in as the screen lifts.
     */
    const found = (
      scenario: string,
      seed: number,
      difficulty: DifficultyId,
      name?: string,
      guide = false,
    ): Promise<void> =>
      ctx.services.get('loader').run(
        scenario === 'fresh-island' ? `Founding ${name ?? 'a new island'}` : scenario === 'founding-city' ? 'Opening the showcase city' : `Opening ${CHALLENGES.find((c) => c.id === scenario)?.name ?? 'the challenge'}`,
        async (stage) => {
          await foundCityStaged(ctx, seed, difficulty, scenario, stage);
          if (name) ctx.commands.execute('nameCity', { name }, false);
          ctx.engine.speed = 1;
          const v = openingView(ctx.city);
          ctx.cameraCtl.lookAt(v.x, v.z, v.distance, true);
          if (scenario === 'fresh-island') premiere(ctx.city.growth.name || name || 'Your city', difficulty, guide);
        },
        () => {
          const v = openingView(ctx.city);
          ctx.cameraCtl.intro(v.x, v.z, v.distance, 5, v);
        },
      );

    /**
     * "First Light" (D-183) for a city just founded, started at once (D-184): it covers whatever loading screen is
     * up; when it ends the camera flies in over the hamlet, the founding toast shows and the guide starts.
     */
    const premiere = (name: string, difficulty: DifficultyId, guide: boolean) => {
      // The fly-in starts as the film fades, so the city is first seen already in flight.
      const flyIn = () => {
        const v = openingView(ctx.city);
        ctx.cameraCtl.intro(v.x, v.z, v.distance, 5, v);
      };
      const after = () => {
        ctx.bus.emit('toast', { text: `${name} is founded: a fishing hamlet on a quiet island (${DIFFICULTIES[difficulty].label})`, tone: 'ok' });
        if (guide) afterFlyIn(() => tut.begin());
      };
      const moments = ctx.services.tryGet('moments');
      if (!moments) return flyIn(), after();
      moments.stageNow('founding', (finish) =>
        playFounding(
          ctx,
          () => {
            finish();
            after();
          },
          { instant: true, leaving: flyIn },
        ),
      );
    };
    ctx.services.tryGet('moments')?.film({
      id: 'founding',
      title: 'First Light',
      icon: 'sparkle',
      blurb: 'The founding of an island: a boat at night, a seed of light, the first hamlet, and your city’s name. Cast from the island you are on.',
      // Every growing island was founded; the showcase was not.
      earned: () => ctx.city.growth.progression,
      run: (finish) => playFounding(ctx, finish),
    });
    /** Runs `fn` once the opening fly-in has settled, so "Look around" is not completed by the camera itself. */
    const afterFlyIn = (fn: () => void) => {
      const cam = ctx.cameraCtl;
      let last = { x: cam.target.x, z: cam.target.z, d: cam.distance };
      let still = 0;
      let waited = 0;
      const poll = () => {
        const moved = Math.hypot(cam.target.x - last.x, cam.target.z - last.z) + Math.abs(cam.distance - last.d);
        last = { x: cam.target.x, z: cam.target.z, d: cam.distance };
        still = moved < 0.3 ? still + 1 : 0;
        waited += 250;
        if ((still >= 2 && waited >= 1500) || waited > 15_000) fn();
        else setTimeout(poll, 250);
      };
      setTimeout(poll, 250);
    };
    const showcaseToast = () => {
      // A challenge (plan v5, Phase 28) says what to do; free play says what is here.
      const ch = challengeOf(ctx.city);
      ctx.bus.emit('toast', {
        text: ch ? `Challenge: ${ch.pitch} (Build → Goals)` : 'The showcase city: everything built and unlocked. Explore, or manage it.',
        tone: ch ? 'info' : 'ok',
      });
    };

    /** The in-game New Chapter dialog (Settings, the steward's "new city"): it replaces the running city. */
    const open = async () => {
      const save = ctx.services.get('save');
      const info = await save.info().catch(() => null);
      // The city holds still while the steward chooses (no alerts piling up behind the dialog).
      const speed = ctx.engine.speed;
      ctx.engine.speed = 0;
      // City Pulse waits until a chapter is chosen (it would show a city about to be replaced).
      document.body.classList.add('chapter-open');
      openChapter({
        host: ctx.hud,
        first: false,
        info,
        readSave: () => ctx.platform.storage.get<SaveData>('save:slot1'),
        size: ctx.city.grid.w,
        difficulty: ctx.city.steward.difficulty,
        seed: Math.floor(Math.random() * 1e6) + 1,
        guide: guideWanted(),
        onClose() {
          document.body.classList.remove('chapter-open');
          ctx.engine.speed = speed;
        },
        resume: (close) =>
          ctx.services.get('loader').run(`Restoring ${info?.name || 'your city'}`, async (stage) => {
            const ok = await save.load('slot1', stage);
            // Under the cover, so the city appears without the dialog over it.
            if (ok) close();
            return ok;
          }),
        found(name, seed, difficulty, guide) {
          void found('fresh-island', seed, difficulty, name, guide);
        },
        showcase(scenario) {
          void found(scenario, SHOWCASE_SEED, ctx.city.steward.difficulty).then(showcaseToast);
        },
      });
    };

    ctx.services.provide('wizard', {
      open: () => void open(),
      guide: () => tut.begin(),
      island: (name, difficulty) => {
        const seed = Math.floor(Math.random() * 1e6) + 1;
        return found('fresh-island', seed, difficulty, name, false);
      },
      premiere: () => {
        if (!freshStart || premiered) return false;
        premiered = true;
        premiere(ctx.city.growth.name || s!.name || 'Your city', s!.difficulty, !!s!.guide);
        return true;
      },
    });
    // A city chosen on the welcome screen (D-148): a fresh island's film starts before the boot screen lifts
    // (`premiere`, called by boot); the showcase is greeted once it is in view.
    const s = ctx.start;
    const freshStart = s?.kind === 'scenario' && s.chosen && s.scenario === 'fresh-island';
    let premiered = false;
    if (s?.kind === 'scenario' && s.chosen) {
      const greet = () => {
        if (!document.body.classList.contains('booted')) return void setTimeout(greet, 200);
        if (s.scenario !== 'fresh-island') showcaseToast();
        // A boot that never asked for the premiere still gets the film, late.
        else if (!premiered) ctx.services.get('wizard').premiere();
      };
      setTimeout(greet, 200);
    }
  },
};

declare module '@/core/Services' {
  interface GameServices {
    wizard: {
      /** Opens the New Chapter dialog (resume, new island, showcase). */
      open(): void;
      /** Starts the how-to-play guide from the first step. */
      guide(): void;
      /** Founds a fresh island at once (new seed, no guide): the steward's "try again" after game over. */
      island(name: string, difficulty: DifficultyId): Promise<void>;
      /**
       * Boot calls this just before its screen lifts (D-184): a fresh island chosen on the welcome screen starts its
       * founding film now, over the boot screen. True when a film started (boot then skips its own fly-in).
       */
      premiere(): boolean;
    };
  }
}
