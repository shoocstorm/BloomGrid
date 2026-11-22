import type { GameContext } from '@/game/context';
import { closeX } from '@/ui/closeX';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { IDLE_SECONDS, idleTimer, type IdleTimer } from '@/ui/idle';
import { buildTimeline, timelineInputOf } from './timeline';
import './promo.css';

/**
 * Making the time-lapse known (plan v6, D-220). It is the one replay that grows with the player's own city, so it is
 * not left as one chip among the Replays:
 *
 * - **Featured card** at the top of Build → Goals: the dial, "Day 1 → day N", its running time, a **New** tag while
 *   there is history the player has not watched, and a large Watch button.
 * - **Invitation**: a call-out under the top bar (the ready call-out's slot, never at the same time) the first time the
 *   city has a story, after each new era, and once the city has grown for `GROWN_DAYS` days since it was last
 *   watched or offered. Never over a film, a dialog or while loading; untouched, it puts itself away (D-201).
 *
 * When it was last watched and offered is saved per city (module save hook `timelapse`).
 */

/** Days of new history that make the film "New" again. */
export const NEW_DAYS = 2;
/** Days of growth (since last watched or offered) before the invitation comes back. */
export const GROWN_DAYS = 5;
/** Seconds after a city change before an invitation may show (no fanfare for a saved state). */
const SETTLE = 8;

type Reason = 'first' | 'era' | 'grown';

const LINES: Record<Reason, string> = {
  first: 'Your island has a story now. Watch it rise from its founding, highway by highway.',
  era: 'A new era. See how the island got here, from its first day to this one.',
  grown: 'The island has grown since you last looked back. Watch its story so far.',
};

export class TimelapsePromo {
  /** Day the film was last watched / offered (-1 = never), per city. */
  watched = -1;
  offered = -1;
  private eraPending = false;
  private settle = SETTLE;
  private card: HTMLElement;
  private line = h('p', { class: 'tli-line' });
  private length = h('span', { class: 'tli-len' });
  private idle: IdleTimer;
  private showing = false;
  /** Running time, cached per day (the timeline reads every building and highway tile). */
  private lengthCache = { day: -1, s: 0 };

  constructor(
    private ctx: GameContext,
    private earned: () => boolean,
    private play: () => void,
  ) {
    this.card = h(
      'section',
      { class: 'tli panel holo hidden', role: 'status', 'aria-live': 'polite', 'aria-label': 'The Island Remembers' },
      h('header', { class: 'tli-kick' }, icon('calendar'), 'Your island’s story'),
      h('div', { class: 'tli-main' }, dial('tli-dial'), h('div', { class: 'tli-text' }, h('b', { class: 'tli-name' }, 'The Island Remembers'), this.line)),
      h(
        'div',
        { class: 'tli-foot' },
        this.length,
        h('button', { class: 'btn ghost tli-later', onClick: () => this.putAway() }, 'Later'),
        h('button', { class: 'tli-go', onClick: () => this.watch() }, icon('play'), 'Watch'),
      ),
      closeX('this invitation', () => this.putAway()),
    );
    this.idle = idleTimer(this.card, IDLE_SECONDS.callout, () => this.putAway());
    ctx.hud.append(this.card);
    ctx.services.get('save').addHook({
      id: 'timelapse',
      save: () => ({ watched: this.watched, offered: this.offered }),
      load: (_c, data) => {
        const d = (data ?? {}) as { watched?: unknown; offered?: unknown };
        this.watched = typeof d.watched === 'number' ? d.watched : -1;
        this.offered = typeof d.offered === 'number' ? d.offered : -1;
      },
    });
    for (const ev of ['city:reset', 'load:done'] as const)
      ctx.bus.on(ev, () => {
        // A new city starts with no record; a load's hook runs before `load:done` and keeps its own.
        if (ev === 'city:reset') this.watched = this.offered = -1;
        this.eraPending = false;
        this.settle = SETTLE;
        this.lengthCache.day = -1;
        this.hide();
      });
    ctx.bus.on('era:advanced', () => {
      if (!ctx.loading) this.eraPending = true;
    });
  }

  /** History the player has not watched yet. */
  get isNew(): boolean {
    return this.earned() && (this.watched < 0 || this.ctx.city.day - this.watched >= NEW_DAYS);
  }

  /** Never watched at all (the Goals badge counts it). */
  get unseen(): boolean {
    return this.earned() && this.watched < 0;
  }

  /** The film's running time now, seconds. */
  seconds(): number {
    const day = this.ctx.city.day;
    if (this.lengthCache.day !== day) this.lengthCache = { day, s: Math.round(buildTimeline(timelineInputOf(this.ctx.city)).duration) };
    return this.lengthCache.s;
  }

  /** Called as the film starts (from any entry point). */
  noteWatched(): void {
    this.watched = this.ctx.city.day;
    this.eraPending = false;
    this.hide();
  }

  /** Once a second. */
  tick(): void {
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    if (!this.live) {
      // Something else took the screen: step aside, and come back when it is clear.
      if (this.showing) this.card.classList.add('hidden');
      return;
    }
    if (this.showing) return void this.card.classList.remove('hidden');
    // Replays list it as soon as anything was built; the invitation waits for a day's worth of story.
    if (!this.earned() || this.ctx.city.day < 2) return;
    const day = this.ctx.city.day;
    const reason: Reason | null =
      this.watched < 0 && this.offered < 0 ? 'first' : this.eraPending ? 'era' : day - Math.max(this.watched, this.offered) >= GROWN_DAYS ? 'grown' : null;
    if (reason) this.show(reason);
  }

  /** The Goals tab's featured card. */
  feature(): HTMLElement {
    const day = this.ctx.city.day;
    const fresh = this.isNew;
    return h(
      'section',
      { class: `tlf ${fresh ? 'new' : ''}` },
      dial('tlf-dial'),
      h(
        'div',
        { class: 'tlf-text' },
        h('p', { class: 'tlf-kick' }, 'Your island’s story', fresh ? h('span', { class: 'tlf-new' }, 'New') : null),
        h('b', { class: 'tlf-name' }, 'The Island Remembers'),
        h('p', { class: 'tlf-line' }, `Day 1 → day ${day.toLocaleString('en-US')}, rising again in the order you built it.`),
      ),
      h(
        'button',
        { class: 'tlf-go', title: 'Watch the time-lapse of your island', onClick: () => this.play() },
        icon('play'),
        h('span', {}, 'Watch your island’s story'),
        h('small', {}, `${this.seconds()} s`),
      ),
    );
  }

  private get live(): boolean {
    const c = this.ctx;
    return (
      !c.loading &&
      c.cameraCtl.enabled &&
      !c.services.tryGet('moments')?.playing &&
      !document.body.classList.contains('chapter-open') &&
      !document.body.classList.contains('city-paused') &&
      !document.querySelector('.modal-scrim') &&
      // The ready call-out has the same slot and the stronger claim.
      !document.querySelector('.rc:not(.hidden)')
    );
  }

  private show(reason: Reason): void {
    this.offered = this.ctx.city.day;
    this.eraPending = false;
    this.showing = true;
    setText(this.line, LINES[reason]);
    setText(this.length, `${this.seconds()} s film`);
    this.card.classList.remove('hidden', 'tli-in');
    void this.card.offsetWidth;
    this.card.classList.add('tli-in');
    this.ctx.bus.emit('juice', { sound: 'claimable' });
    this.idle.arm();
  }

  private hide(): void {
    this.showing = false;
    this.card.classList.add('hidden');
    this.idle.disarm();
  }

  private putAway(): void {
    this.hide();
  }

  private watch(): void {
    this.hide();
    this.play();
  }
}

/** The film's emblem: a dial whose hand sweeps back (static SVG we wrote). */
function dial(cls: string): HTMLElement {
  const el = h('span', { class: cls, 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="1 3.2" opacity="0.7"/><g class="hand"><path d="M20 20 V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></g><circle cx="20" cy="20" r="2.2" fill="currentColor"/><path d="M10 9 A14 14 0 0 0 7 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 11 L7 14.5 L10.5 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return el;
}
