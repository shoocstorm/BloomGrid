import type { GameContext, GameModule } from '@/game/context';
import { buildings } from '@/content';
import { isOpen } from '@/sim/growthState';
import {
  HAPPENING_NAMES,
  HAPPENING_SECONDS,
  askName,
  describeHappening,
  startHappening,
} from '@/sim/happenings';
import type { Happening, HappeningKind } from '@/sim/happeningState';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { isCompact } from '@/platform/device';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { closeX } from '@/ui/closeX';
import './happenings.css';

const ICON: Record<HappeningKind, string> = {
  request: 'house',
  festival: 'sparkle',
  'bumper-catch': 'food',
  cruise: 'wave',
};
const fmt = (n: number) => Math.round(n).toLocaleString();

/** The card's one-line hint (the header carries the time, the footer the credits). */
function cardHint(hp: Happening): string {
  if (hp.kind === 'request')
    return hp.status === 'met'
      ? 'They got it. Claim the reward and enjoy the good mood.'
      : `Build one within ${hp.radius} tiles of their homes before time runs out.`;
  if (hp.kind === 'festival') return `Visitors and good cheer in ${hp.place} while it lasts.`;
  if (hp.kind === 'bumper-catch')
    return `The shoals are in off ${hp.place}: the fishing haul runs half again higher.`;
  return `A cruise ship calls at ${hp.place}: visitors are spending in town.`;
}

/**
 * Happenings card (D-123): the current residents' request or good surprise (`sim/happenings.ts`) as a card under
 * the milestone tracker: what it is, where, the time left, and what to do (Build the asked-for kind, Locate,
 * Claim). A start announces itself with a toast that flies to the spot; a claimed request plays a minor moment.
 */
class HappeningsCard {
  private card: HTMLElement;
  private ico = h('span', { class: 'jc-m-ico' });
  private kicker = h('span', { class: 'jc-m-kicker' });
  private left = h('span', { class: 'jc-m-count' });
  private title = h('b', { class: 'jc-m-title' });
  private hint = h('p', { class: 'jc-m-hint' });
  private bar = h('i');
  private value = h('span', { class: 'jc-m-reward' });
  private act = h('div', { class: 'jc-m-act hp-act' });
  private shown = '';
  private slow = 0;
  /** `id|status` the steward closed (D-128): it stays away until the request changes (met, or a new one). */
  private dismissed = '';

  constructor(private ctx: GameContext) {
    this.card = h(
      'section',
      { class: 'jc-m hp panel holo hidden', 'aria-label': 'Happening', 'aria-live': 'polite' },
      h('header', { class: 'jc-m-head hp-head' }, icon('sparkle'), this.kicker, this.left),
      h('div', { class: 'jc-m-main' }, this.ico, h('div', { class: 'jc-m-text' }, this.title, this.hint)),
      h('div', { class: 'jc-m-bar hp-bar' }, this.bar),
      h('div', { class: 'jc-m-foot' }, h('span', { class: 'jc-m-have' }, ''), this.value),
      this.act,
      closeX('this card', () => {
        const hp = ctx.city.happenings.current;
        if (hp) this.dismissed = `${hp.id}|${hp.status}`;
        this.card.classList.add('hidden');
      }),
    );
    ctx.hud.append(this.card);

    const { bus } = ctx;
    bus.on('happening:start', ({ happening: hp }) => {
      if (ctx.loading) return;
      bus.emit('toast', {
        text: `${HAPPENING_NAMES[hp.kind]}: ${describeHappening(ctx.city, hp)}`,
        tone: 'info',
        at: { x: hp.x, z: hp.z },
      });
      bus.emit('juice', { sound: 'claimable' });
      this.ping();
    });
    bus.on('happening:met', ({ happening: hp }) => {
      if (ctx.loading) return;
      bus.emit('juice', { sound: 'claimable' });
      if (isCompact())
        bus.emit('toast', {
          text: `★ ${hp.place}'s residents got what they asked for: claim ◈${fmt(hp.reward)}`,
          tone: 'ok',
        });
      this.ping();
    });
    bus.on('happening:end', ({ happening: hp, outcome }) => {
      if (ctx.loading) return;
      if (outcome === 'claimed')
        ctx.services.tryGet('moments')?.play({
          id: `happening:${hp.id}`,
          scale: 'minor',
          tone: 'bloom',
          emblem: 'house',
          eyebrow: "Residents' request · answered",
          title: `${hp.place} is delighted`,
          lines: [`${askName(hp.category ?? '')} built nearby`, `◈${fmt(hp.reward)} and a lift in harmony`],
          sound: 'milestone',
        });
      else if (outcome === 'missed')
        bus.emit('toast', {
          text: `${hp.place}'s request lapsed: residents are a little let down for a while`,
          tone: 'bad',
          at: { x: hp.x, z: hp.z },
        });
      else if (hp.earned > 1)
        bus.emit('toast', {
          text: `${HAPPENING_NAMES[hp.kind]} wrapped up: ◈${fmt(hp.earned)} from visitors`,
          tone: 'ok',
        });
      this.shown = '';
    });
    for (const ev of ['city:reset', 'load:done'] as const) bus.on(ev, () => (this.shown = ''));
  }

  private ping(): void {
    this.card.classList.remove('jc-ping');
    void this.card.offsetWidth;
    this.card.classList.add('jc-ping');
  }

  /** The cheapest building of the asked-for kind the city can build now. */
  private suggest(category: string): string | null {
    const g = this.ctx.city.growth;
    const ok = buildings
      .all()
      .filter((d) => d.category === category && (!d.requires || isOpen(g, d.requires)));
    ok.sort((a, b) => a.stats.cost - b.stats.cost);
    return ok[0]?.id ?? null;
  }

  update(dt: number): void {
    if ((this.slow -= dt) > 0) return;
    this.slow = 0.2;
    const c = this.ctx;
    const hp = c.city.happenings.current;
    const live =
      !c.loading &&
      c.cameraCtl.enabled &&
      !document.body.classList.contains('chapter-open') &&
      !c.services.tryGet('moments')?.playing;
    const closed = !!hp && this.dismissed === `${hp.id}|${hp.status}`;
    this.card.classList.toggle('hidden', !hp || !live || closed);
    if (!hp || !live || closed) return;
    // Sit under the milestone card when it shows.
    const above = document.querySelector<HTMLElement>('#hud > .jc-m:not(.hp):not(.hidden)');
    // Desktops: under it. Portrait phones: stacked above it (landscape sets the two side by side, ui/mobile.css).
    const compact = isCompact();
    this.card.style.top = above && !compact ? `${above.offsetTop + above.offsetHeight + 8}px` : '';
    const parent = this.card.parentElement;
    const stack = above && parent && compact && innerHeight > innerWidth;
    this.card.style.bottom = stack ? `${parent.clientHeight - above.offsetTop + 8}px` : '';
    const total = HAPPENING_SECONDS[hp.kind] * PULSE_TICKS;
    const remain = Math.max(0, hp.endTick - c.city.tick);
    const secs = Math.ceil(remain / PULSE_TICKS);
    this.bar.style.transform = `scaleX(${(hp.status === 'met' ? 1 : remain / total).toFixed(3)})`;
    setText(
      this.left,
      hp.status === 'met' ? 'Ready' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
    );
    setText(this.hint, cardHint(hp));
    setText(
      this.value,
      hp.kind === 'request' ? `◈${fmt(hp.reward)}` : hp.earned > 0.5 ? `+◈${fmt(hp.earned)}` : '',
    );
    this.card.classList.toggle('ready', hp.status === 'met');
    const key = `${hp.id}|${hp.status}`;
    if (key === this.shown) return;
    this.shown = key;
    this.render(hp);
  }

  private render(hp: Happening): void {
    const c = this.ctx;
    setText(this.kicker, hp.kind === 'request' ? 'Residents ask' : 'Happening');
    setText(
      this.title,
      hp.kind === 'request' ? `${hp.place}: ${askName(hp.category!)}` : HAPPENING_NAMES[hp.kind],
    );
    this.ico.replaceChildren(icon(ICON[hp.kind]));
    const locate = h(
      'button',
      {
        class: 'jc-do hp-locate',
        title: 'Show where',
        onClick: () => c.cameraCtl.locate(hp.x, hp.z, { size: (hp.radius ?? 6) * 2 }),
      },
      icon('locate'),
      'Locate',
    );
    if (hp.status === 'met') {
      const btn: HTMLButtonElement = h(
        'button',
        {
          class: 'jc-claim',
          onClick: () => {
            btn.focus();
            c.commands.execute('claimHappening', { id: hp.id }, false);
          },
        },
        icon('star'),
        `Claim ◈${fmt(hp.reward)}`,
      );
      this.act.replaceChildren(btn);
      return;
    }
    const id = hp.kind === 'request' ? this.suggest(hp.category!) : null;
    const build = id
      ? h(
          'button',
          {
            class: 'jc-do',
            title: `Build a ${buildings.get(id).name} near ${hp.place}`,
            onClick: () => {
              c.cameraCtl.locate(hp.x, hp.z, { size: (hp.radius ?? 6) * 2 });
              c.services.get('construction').startBuilding(id);
            },
          },
          icon('build'),
          `Build ${buildings.get(id).name}`,
        )
      : null;
    this.act.replaceChildren(...(build ? [build] : []), locate);
  }
}

export const happeningsModule: GameModule = {
  id: 'happenings',
  deps: ['hud', 'construction', 'moments', 'juice'],
  init(ctx) {
    const card = new HappeningsCard(ctx);
    // Drill: ?happening=request|festival|bumper-catch|cruise starts one as soon as the city is up (like ?drill=).
    let drill = new URLSearchParams(location.search).get('happening') as HappeningKind | null;
    ctx.systems.add({
      id: 'happenings.card',
      phase: 'render',
      order: 90,
      update: (c, f) => {
        if (drill && !c.loading && c.city.tick > 0) {
          if (!startHappening(c.city, drill))
            console.warn(`[happenings] this city can't host a ${drill} now`);
          drill = null;
        }
        card.update(f.dt);
      },
    });
  },
};
