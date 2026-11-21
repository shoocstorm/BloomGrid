import type { GameContext } from '@/game/context';
import { PROJECTS, projectStatus, PROJECT_IDS } from '@/sim/projects';
import type { UnlockId } from '@/sim/growthState';
import { DAY_LENGTH } from '@/sim/pulseConst';
import { closeX } from '@/ui/closeX';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';

declare module '@/core/EventBus' {
  interface GameEvents {
    /** An unlock project just became ready to start (D-181): the call-out shows, the stray asks to be adopted. */
    'project:ready': { id: UnlockId };
  }
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
/**
 * Seconds a project must stay unmet before the card lets it go: residents or credits hovering on a threshold
 * would otherwise hide and re-show the card every second, pulling the button out from under the pointer.
 */
const LOSE = 5;

/** A project's start button in its own words (D-181): "Adopt Mochi", "Wake Flora", "Open the skies". */
export function projectVerb(ctx: GameContext, id: UnlockId): string {
  return PROJECTS[id].verb.replace('{cat}', ctx.services.tryGet('charm')?.cat.name || 'the stray');
}

/** How long a project takes, in words. */
export function projectTime(id: UnlockId): string {
  const d = PROJECTS[id].days;
  return d >= 1 ? `${d} day${d > 1 ? 's' : ''}` : d * 24 >= 2 ? `${Math.round(d * 24)} h` : `${Math.round(d * DAY_LENGTH)} s`;
}

/**
 * The ready call-out (D-181): the moment an unlock project can start, a glowing card drops in under the top bar
 * with the project's own verb as one button, a chime and sparkles, and the Build launcher pulses until it is started.
 * "Later" (or ×) puts it away until the project next becomes ready; the Goals tab keeps the same button.
 */
export class ReadyCall {
  private card: HTMLElement;
  private ico = h('span', { class: 'rc-ico' });
  private name = h('b', { class: 'rc-name' });
  private line = h('p', { class: 'rc-line' });
  private go = h('button', { class: 'rc-go' }) as HTMLButtonElement;
  private cost = h('span', { class: 'rc-cost' });
  private shown: UnlockId | null = null;
  private ready = new Set<UnlockId>();
  /** Seconds each ready project has been unmet in a row (the LOSE grace). */
  private unmet = new Map<UnlockId, number>();
  private wait = h('span', { class: 'rc-wait' });
  private later = new Set<UnlockId>();
  /** Ready ones are announced only once the city has settled after a load (no fanfare for a saved state). */
  private armIn = 3;

  constructor(private ctx: GameContext) {
    this.card = h(
      'section',
      { class: 'rc panel holo hidden', role: 'status', 'aria-live': 'polite', 'aria-label': 'Ready to unlock' },
      h('div', { class: 'rc-spark' }, ...Array.from({ length: 10 }, (_, i) => h('i', { style: `--i:${i}` }))),
      h('header', { class: 'rc-kick' }, icon('sparkle'), 'Ready to unlock'),
      h('div', { class: 'rc-main' }, this.ico, h('div', { class: 'rc-text' }, this.name, this.line)),
      h(
        'div',
        { class: 'rc-foot' },
        this.cost,
        this.wait,
        h('button', { class: 'btn ghost rc-later', onClick: () => this.putAway() }, 'Later'),
        this.go,
      ),
      closeX('this call-out', () => this.putAway()),
    );
    this.go.addEventListener('click', () => this.start());
    ctx.hud.append(this.card);
    for (const ev of ['city:reset', 'load:done'] as const)
      ctx.bus.on(ev, () => {
        this.armIn = 3;
        this.later.clear();
        this.hide();
      });
    ctx.bus.on('project:start', () => this.refresh());
  }

  /** Once a second: who is ready, who just became so, and what the card shows. */
  tick(): void {
    const { city } = this.ctx;
    const now = city.growth.progression ? PROJECT_IDS.filter((id) => projectStatus(city, id) === 'ready') : [];
    if (this.armIn > 0) {
      this.armIn--;
      this.ready = new Set(now);
      // A city loaded with a project waiting still gets the card, quietly.
      if (this.armIn === 0) this.refresh();
      return;
    }
    for (const id of now) {
      this.unmet.delete(id);
      if (!this.ready.has(id)) {
        this.ready.add(id);
        this.later.delete(id);
        this.ctx.bus.emit('project:ready', { id });
      }
    }
    // A project that slips stays in hand for LOSE seconds (its button disabled), then goes.
    for (const id of [...this.ready]) {
      if (now.includes(id)) continue;
      const n = (this.unmet.get(id) ?? 0) + 1;
      // Started or done: gone at once.
      const st = projectStatus(city, id);
      if (n >= LOSE || st === 'running' || st === 'open') {
        this.ready.delete(id);
        this.unmet.delete(id);
        this.later.delete(id);
        if (this.shown === id) this.shown = null;
      } else this.unmet.set(id, n);
    }
    this.refresh();
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

  private refresh(): void {
    const { city } = this.ctx;
    const ready = [...this.ready].filter((id) => {
      const st = projectStatus(city, id);
      return st === 'ready' || st === 'blocked';
    });
    document.body.classList.toggle('project-ready', ready.length > 0);
    // The one on show keeps its place; otherwise the first not put away.
    const id = (this.shown && ready.includes(this.shown) && !this.later.has(this.shown) ? this.shown : null) ?? ready.find((r) => !this.later.has(r)) ?? null;
    if (!id || !this.live) return this.hide();
    const now = projectStatus(city, id) === 'ready';
    this.go.disabled = !now;
    this.go.title = now ? '' : 'A condition slipped for a moment: wait a few seconds';
    setText(this.wait, now ? '' : 'Waiting…');
    this.card.classList.toggle('rc-slip', !now);
    const fresh = id !== this.shown;
    const hidden = this.card.classList.contains('hidden');
    if (!fresh && !hidden) return;
    this.shown = id;
    if (!fresh) return void this.card.classList.remove('hidden');
    const def = PROJECTS[id];
    this.ico.replaceChildren(icon(def.icon));
    setText(this.name, def.name);
    setText(this.line, def.readyLine);
    setText(this.cost, `◈${fmt(def.cost)} · ${projectTime(id)}`);
    this.go.replaceChildren(icon('sparkle'), projectVerb(this.ctx, id));
    this.card.classList.remove('hidden', 'rc-in');
    void this.card.offsetWidth;
    this.card.classList.add('rc-in');
    if (fresh) this.ctx.bus.emit('juice', { sound: 'claimable' });
  }

  private hide(): void {
    this.card.classList.add('hidden');
  }

  private putAway(): void {
    if (this.shown) this.later.add(this.shown);
    this.shown = null;
    this.refresh();
  }

  private start(): void {
    const id = this.shown;
    if (!id) return;
    if (!this.ctx.commands.execute('startProject', { id }))
      return void this.ctx.bus.emit('toast', { text: `${PROJECTS[id].name} can't start yet: check the credits.`, tone: 'bad' });
    this.ctx.bus.emit('juice', { sound: 'claim' });
    this.ctx.bus.emit('toast', { text: `${PROJECTS[id].name}: under way (${projectTime(id)})`, tone: 'ok' });
    this.shown = null;
    this.refresh();
  }
}
