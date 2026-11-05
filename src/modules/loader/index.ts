import type { GameContext, GameModule } from '@/game/context';
import { createBootScreen } from '@/ui/Boot';
import { isTouchDevice } from '@/platform/device';

/** Advances the loading screen to a stage (0..1) and lets it paint before the next block of work. */
export type LoadStage = (label: string, progress: number) => Promise<void>;

export interface LoaderService {
  /**
   * Runs `work` behind a full-screen loading screen (the boot screen's emblem, bar and log): the sim is paused,
   * input is held, and the city is only revealed (an iris, then `reveal`) once a few frames have drawn the new
   * city, so its first-frame shader builds stall behind the cover instead of in view.
   */
  run<T>(subtitle: string, work: (stage: LoadStage) => Promise<T>, reveal?: () => void): Promise<T>;
  readonly busy: boolean;
}

declare module '@/core/Services' {
  interface GameServices {
    loader: LoaderService;
  }
}

/** Frames drawn behind the cover after the work: renderers rebuild and compile what the new city shows. */
const SETTLE_FRAMES = 6;

/** Tips under the loading bar; `keys` tips are skipped on touch screens. */
const TIPS: { text: string; keys?: boolean }[] = [
  { text: 'Press B to open Build mode; Esc or right-click leaves it.', keys: true },
  { text: 'Tap a stat in the top bar to see what drives it and the fastest fix.' },
  { text: 'Ask Flora (bottom right) what needs attention: she can propose builds and act on many buildings at once.' },
  { text: 'Press M for the city map of named districts.', keys: true },
  { text: 'Lenses in City Pulse paint energy, water, traffic and risk over the city.' },
  { text: 'Ctrl / ⌘-drag in select mode boxes a group of buildings of one type.', keys: true },
  { text: 'Press ? or F1 for the Seedvault: guides, runbooks and your field logs.', keys: true },
  { text: 'Buildings that thrive grow a level on their own; renovate the old ones to stop the wear.' },
];

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Loader implements LoaderService {
  busy = false;
  private tip = Math.floor(Math.random() * TIPS.length);

  constructor(private ctx: GameContext) {}

  async run<T>(subtitle: string, work: (stage: LoadStage) => Promise<T>, reveal?: () => void): Promise<T> {
    // Nested loads (a load started from inside another) share the screen already up.
    if (this.busy) return work(async () => {});
    this.busy = true;
    const { engine } = this.ctx;
    const el = document.createElement('div');
    el.className = 'bt-loader';
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-label', 'Loading the city');
    document.body.append(el);
    const tips = isTouchDevice() ? TIPS.filter((t) => !t.keys) : TIPS;
    this.tip = (this.tip + 1) % tips.length;
    const screen = createBootScreen(el, subtitle.toUpperCase(), { minShow: 1100, tip: tips[this.tip]!.text });
    // The city's hotkeys never see keys pressed while it is covered.
    const hold = (e: KeyboardEvent) => (e.stopPropagation(), e.preventDefault());
    window.addEventListener('keydown', hold, true);
    const speed = engine.speed;
    engine.speed = 0;
    try {
      // Fully covered before the (synchronous) work starts: the old city fades out under the screen.
      await screen.stage('Preparing the island', 0.02);
      await wait(320);
      const result = await work(screen.stage);
      // `work` may have set its own speed (a new city starts at 1×, a closed dialog restores its own); otherwise
      // the old one resumes. Either way the city holds still until it is revealed.
      const next = engine.speed || speed;
      engine.speed = 0;
      await screen.stage('Lighting the skyline', 0.95);
      for (let i = 0; i < SETTLE_FRAMES; i++) await frame();
      engine.speed = next;
      await screen.finish(reveal);
      return result;
    } catch (e) {
      if (engine.speed === 0) engine.speed = speed;
      screen.fail((e as Error).message ?? String(e));
      await wait(1600);
      throw e;
    } finally {
      window.removeEventListener('keydown', hold, true);
      el.remove();
      this.busy = false;
    }
  }
}

/** The full-screen city loader: new island, showcase and saved-city loads run behind it (`loader` service). */
export const loaderModule: GameModule = {
  id: 'loader',
  init(ctx) {
    ctx.services.provide('loader', new Loader(ctx));
  },
};
