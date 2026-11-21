import type { GameContext } from '@/game/context';
import type { JuiceSound } from '@/modules/juice';
import type { MomentSound } from './Ceremony';
import { h } from '@/ui/dom';
import { finishFilm } from './finish';
import './reel.css';

/**
 * The film kit (D-185): what every cutscene needs, once. A reel is a full-screen stage over the paused city with a
 * letterbox, a caption line, Skip (and Esc), a clock that scenes can hold, an end card, and a fade out that gives the
 * clock back. A film only builds its set (`reel.set`) and directs it (`on`, `say`, `cue`, `wait`).
 *
 *   const reel = openReel(ctx, { scene: 'mf', label: 'Maiden Flight' }, done);
 *   reel.set.append(sky, pod);
 *   if (!(await reel.wait(900))) return;   // false once skipped
 *   reel.on('launch');                     // a class on the root: CSS does the motion
 *   await reel.end({ kicker, title, sub, button });
 *
 * Films are DOM / SVG / CSS (transform, opacity, clip); text from the city reaches the DOM only as text.
 */

/** Held, every reel's clock stands still (scenes freeze a frame with it and `document.getAnimations()`). */
export const reelClock = { held: false };

export interface ReelOptions {
  /** The film's CSS prefix / root class (`mf`, `hw`…); unique across every stylesheet (grep before choosing). */
  scene: string;
  /** Its name, for screen readers ("Cutscene: …"). */
  label: string;
  /** Open opaque on black at once (over a loading screen, D-184); otherwise it fades in over the city. */
  instant?: boolean;
  /** Runs as the reel starts to fade out (a camera can start moving under it). */
  leaving?: () => void;
  /** The light leak's colour (the finish, D-188); amber by default. */
  leak?: string;
}

export interface EndCard {
  kicker?: string;
  title: string;
  /** Letter by letter (a name), or at once. */
  drop?: boolean;
  sub?: string;
  lines?: string[];
  button: string;
  /** Confetti colours (none when unset). */
  confetti?: string[];
  /** Seconds before it closes by itself. */
  hold?: number;
}

export interface Reel {
  readonly root: HTMLElement;
  /** The film's own layers go here (under the letterbox, caption and card). */
  readonly set: HTMLElement;
  readonly alive: boolean;
  /** Film time; resolves false once the reel has ended (skipped), so `if (!(await reel.wait(ms))) return;`. */
  wait(ms: number): Promise<boolean>;
  /** A caption in the bottom bar ('' clears it). */
  say(text: string): void;
  /**
   * Adds stage classes to the root, prefixed `s-` (`on('landed')` → `.s-landed`; CSS directs the motion). The
   * prefix keeps a stage name from ever matching a HUD class (a stage called `card` once picked up `.card`).
   */
  on(...cls: string[]): void;
  /** A juice cue (the cutscene score) or a ceremony sound. */
  cue(sound: JuiceSound): void;
  sound(sound: MomentSound): void;
  /** Re-runs a one-shot animation on an element (removes and re-adds `cls`). */
  pop(el: Element, cls?: string): void;
  /** The end card, then the reel ends on its button (or after `hold` seconds). */
  end(card: EndCard): Promise<void>;
  /** Ends it now (Skip, Esc, the card's button). */
  finish(): void;
}

let current: Reel | null = null;
let keysBound = false;

/** Opens a reel; `done` runs once it has faded out (played through or skipped). One plays at a time. */
export function openReel(ctx: GameContext, opts: ReelOptions, done: () => void): Reel {
  current?.finish();
  if (!keysBound) {
    keysBound = true;
    // While a film runs it owns the keyboard: Esc skips, nothing reaches the city.
    ctx.input.onKey((e) => {
      if (!current) return false;
      if (e.code === 'Escape') current.finish();
      return true;
    }, 1000);
  }
  const speed = ctx.engine.speed;
  ctx.engine.speed = 0;
  let alive = true;

  const set = h('div', { class: 'reel-set' });
  const cap = h('p', { class: 'reel-cap' });
  const skip = h('button', { class: 'reel-skip', onClick: () => reel.finish() }, 'Skip ›');
  const card = h('div', { class: 'reel-card' });
  const confetti = h('div', { class: 'reel-confetti' });
  const root = h(
    'div',
    { class: `reel ${opts.scene}`, role: 'dialog', 'aria-label': `Cutscene: ${opts.label}` },
    set,
    confetti,
    card,
    h('div', { class: 'reel-bar top' }, skip),
    h('div', { class: 'reel-bar bot' }, cap),
  );
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  // Grade, drift, vignette, grain (D-188).
  finishFilm(root, set, opts.leak);
  if (opts.instant) root.classList.add('instant', 'in');
  document.body.append(root);
  document.body.classList.add('cutscene-on');
  if (!opts.instant) requestAnimationFrame(() => root.classList.add('in'));

  const reel: Reel = {
    root,
    set,
    get alive() {
      return alive;
    },
    async wait(ms) {
      let left = ms;
      while (left > 0 && alive) {
        const step = Math.min(50, left);
        await new Promise((r) => setTimeout(r, step));
        if (!reelClock.held) left -= step;
      }
      return alive;
    },
    say(text) {
      cap.classList.remove('show');
      void cap.offsetWidth;
      cap.textContent = text;
      if (text) cap.classList.add('show');
    },
    on: (...cls) => root.classList.add(...cls.map((c) => `s-${c}`)),
    cue: (sound) => ctx.bus.emit('juice', { sound }),
    sound: (sound) => ctx.bus.emit('moment', { id: opts.scene, sound }),
    pop(el, cls = 'go') {
      el.classList.remove(cls);
      void (el as HTMLElement).offsetWidth;
      el.classList.add(cls);
    },
    async end(c) {
      if (!alive) return;
      reel.say('');
      skip.classList.add('hidden');
      let i = 0;
      card.replaceChildren(
        ...(c.kicker ? [h('div', { class: 'reel-kick' }, c.kicker)] : []),
        h(
          'div',
          { class: 'reel-title' },
          ...(c.drop
            ? c.title
                .split(/\s+/)
                .filter(Boolean)
                .map((w) => h('span', { class: 'reel-word' }, ...[...w].map((ch) => h('span', { class: 'reel-l', style: `--i:${i++}` }, ch))))
            : [c.title]),
        ),
        ...(c.sub ? [h('p', { class: 'reel-sub' }, c.sub)] : []),
        ...(c.lines?.length ? [h('ul', { class: 'reel-lines' }, ...c.lines.map((l, k) => h('li', { style: `--k:${k}` }, l)))] : []),
        h('button', { class: 'reel-go', onClick: () => reel.finish() }, c.button),
      );
      card.style.setProperty('--len', String(Math.max(6, i || c.title.length)));
      card.classList.add('show');
      if (c.confetti?.length)
        for (let k = 0; k < 36; k++)
          confetti.append(
            h('i', {
              style: `left:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 2).toFixed(2)}s;--r:${(Math.random() * 540 - 270).toFixed(0)}deg;--s:${(0.6 + Math.random() * 0.8).toFixed(2)};--c:${c.confetti[k % c.confetti.length]};--sway:${(Math.random() * 14 - 7).toFixed(1)}vw`,
            }),
          );
      (card.querySelector('.reel-go') as HTMLElement | null)?.focus({ preventScroll: true });
      await reel.wait((c.hold ?? 14) * 1000);
      reel.finish();
    },
    finish() {
      if (!alive) return;
      alive = false;
      if (current === reel) current = null;
      root.classList.add('out');
      ctx.engine.speed = speed;
      opts.leaving?.();
      setTimeout(() => {
        root.remove();
        if (!current) document.body.classList.remove('cutscene-on');
        done();
      }, 700);
    },
  };
  current = reel;
  return reel;
}
