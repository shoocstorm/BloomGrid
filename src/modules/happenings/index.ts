import type { GameContext, GameModule } from '@/game/context';
import { buildings } from '@/content';
import { isOpen } from '@/sim/growthState';
import {
  HAPPENING_NAMES,
  HAPPENING_SECONDS,
  askName,
  complaintFix,
  complaintLabel,
  describeHappening,
  startHappening,
} from '@/sim/happenings';
import type { Happening, HappeningKind } from '@/sim/happeningState';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { getPolicy } from '@/sim/policies';
import { moodOf } from '@/sim/approval';
import { isCompact } from '@/platform/device';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { closeX } from '@/ui/closeX';
import { autoCollapse } from '@/ui/idle';
import './happenings.css';

const ICON: Record<HappeningKind, string> = {
  request: 'house',
  festival: 'sparkle',
  'bumper-catch': 'food',
  cruise: 'wave',
  petition: 'pen',
  protest: 'st-warn',
  praise: 'star',
  expo: 'gem',
};
/** Kinds whose card leads with the district (plan v5, Phase 26). */
const DISTRICT_KINDS: HappeningKind[] = ['petition', 'protest', 'praise'];
const fmt = (n: number) => Math.round(n).toLocaleString();

/** The card's one-line hint (the header carries the time, the footer the credits). */
function cardHint(hp: Happening, approval: number): string {
  if (hp.kind === 'petition')
    return hp.status === 'met'
      ? 'Heard and answered. Claim the reward: the district warms to you for a while.'
      : hp.policy
        ? `Enact ${getPolicy(hp.policy)?.name ?? hp.policy}, or lift approval to ${hp.target} (now ${Math.round(approval)}).`
        : `Lift approval to ${hp.target} (now ${Math.round(approval)}). ${complaintFix(hp.complaint)}`;
  if (hp.kind === 'protest')
    return `Workplaces run short-staffed until approval reaches ${hp.target} (now ${Math.round(approval)}). ${complaintFix(hp.complaint)}`;
  if (hp.kind === 'praise') return 'Approval has stayed high for minutes on end. Claim their thank-you gift.';
  if (hp.kind === 'request')
    return hp.status === 'met'
      ? 'They got it. Claim the reward and enjoy the good mood.'
      : `Build one within ${hp.radius} tiles of their homes before time runs out.`;
  if (hp.kind === 'festival') return `Visitors and good cheer in ${hp.place} while it lasts.`;
  if (hp.kind === 'bumper-catch')
    return `The shoals are in off ${hp.place}: the fishing haul runs half again higher.`;
  if (hp.kind === 'expo') return `The world comes to ${hp.place}: visitors spend freely and the city glows with pride.`;
  return `A cruise ship calls at ${hp.place}: visitors are spending in town.`;
}

/**
 * Happenings card (D-123): the current residents' request or good surprise (`sim/happenings.ts`) as a card under
 * the milestone tracker: what it is, where, the time left, and what to do (Build the asked-for kind, Locate,
 * Claim). A start opens the card (on phones also a toast that flies to the spot, D-208); a claimed request plays a minor moment.
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
  private fold: ReturnType<typeof autoCollapse>;
  private head: HTMLElement;
  /** The milestone card whose width this card's folded strip shares (`matchFolded`). */
  private twin: HTMLElement | null = null;

  constructor(private ctx: GameContext) {
    const head = h('header', { class: 'jc-m-head hp-head' }, icon('sparkle'), this.kicker, this.left);
    this.head = head;
    this.card = h(
      'section',
      { class: 'jc-m hp panel holo hidden', 'aria-label': 'Happening', 'aria-live': 'polite' },
      head,
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
    // Untouched, it shrinks to its header (D-201); news (a new one, met) opens it again.
    this.fold = autoCollapse(this.card, head);

    const { bus } = ctx;
    bus.on('happening:start', ({ happening: hp }) => {
      if (ctx.loading) return;
      // The card opens with it (and has Locate); a toast too only repeated it (D-208). Phones, where the card
      // sits folded, still get one.
      if (isCompact())
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
      if (hp.kind === 'protest')
        bus.emit('toast', {
          text:
            outcome === 'done'
              ? `${hp.place} calms down: the protest is over and workers are back`
              : `${hp.place}'s protest fizzled out unheard: a grudge lingers`,
          tone: outcome === 'done' ? 'ok' : 'bad',
          at: { x: hp.x, z: hp.z },
        });
      else if (outcome === 'claimed' && (hp.kind === 'petition' || hp.kind === 'praise'))
        ctx.services.tryGet('moments')?.play({
          id: `happening:${hp.id}`,
          scale: 'minor',
          tone: 'bloom',
          emblem: 'happy',
          eyebrow: hp.kind === 'praise' ? 'District thanks' : 'Petition · answered',
          title: hp.kind === 'praise' ? `${hp.place} thanks you` : `${hp.place} feels heard`,
          lines: [`◈${fmt(hp.reward)}`, 'Approval lifts there for a while'],
          sound: 'milestone',
        });
      else if (outcome === 'missed' && hp.kind === 'petition')
        bus.emit('toast', {
          text: `${hp.place}'s petition went unanswered: approval there dips for a while`,
          tone: 'bad',
          at: { x: hp.x, z: hp.z },
        });
      else if (outcome === 'claimed')
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

  /**
   * Desktops: while this card is folded to its strip and the milestone card shows only its pill, the two take one
   * width (the wider one's natural width) and one right edge, so the pair reads as a set. Natural widths come from
   * the contents (the pill button, the header's children), never from the cards, so a shorter text shrinks them.
   */
  private matchFolded(above: HTMLElement | null, r?: DOMRect, box?: DOMRect): void {
    const pill = above?.querySelector<HTMLElement>(':scope > .jc-m-pill');
    const on = !!above && !!pill && pill.offsetWidth > 0 && this.card.classList.contains('mini');
    if (this.twin && (!on || this.twin !== above)) this.twin.style.minWidth = '';
    if (!on) {
      this.twin = null;
      this.card.style.minWidth = '';
      this.card.style.right = '';
      return;
    }
    this.twin = above;
    const cs = getComputedStyle(this.card);
    const kids = [...this.head.children] as HTMLElement[];
    const head =
      kids.reduce((w, k) => w + k.getBoundingClientRect().width, 0) +
      (kids.length - 1) * (parseFloat(getComputedStyle(this.head).columnGap) || 0);
    const own = Math.ceil(head + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight));
    const w = `${Math.max(own, Math.ceil(pill.getBoundingClientRect().width))}px`;
    this.card.style.minWidth = w;
    above.style.minWidth = w;
    this.card.style.right = `${box!.right - r!.right}px`;
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
    if (!hp || !live || closed) return this.matchFolded(null);
    // Sit under the milestone card when it shows.
    // On desktops it may sit in the right column (D-130), not in the HUD itself: compare screen rectangles.
    const above = document.querySelector<HTMLElement>('.jc-m:not(.hp):not(.hidden)');
    const r = above?.getBoundingClientRect();
    const parent = this.card.parentElement;
    const box = parent?.getBoundingClientRect();
    // Desktops: under it. Portrait phones: stacked above it (landscape sets the two side by side, ui/mobile.css).
    const compact = isCompact();
    this.card.style.top = r && r.height > 0 && box && !compact ? `${r.bottom - box.top + 8}px` : '';
    const stack = r && r.height > 0 && box && compact && innerHeight > innerWidth;
    this.card.style.bottom = stack ? `${box!.bottom - r!.top + 8}px` : '';
    this.matchFolded(!compact && r && box ? above! : null, r, box);
    const total = HAPPENING_SECONDS[hp.kind] * PULSE_TICKS;
    const remain = Math.max(0, hp.endTick - c.city.tick);
    const secs = Math.ceil(remain / PULSE_TICKS);
    this.bar.style.transform = `scaleX(${(hp.status === 'met' ? 1 : remain / total).toFixed(3)})`;
    setText(
      this.left,
      hp.status === 'met' ? 'Ready' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
    );
    const approval = hp.district !== undefined ? moodOf(c.city, hp.district).approval : 0;
    setText(this.hint, cardHint(hp, approval));
    setText(
      this.value,
      hp.reward > 0 ? `◈${fmt(hp.reward)}` : hp.earned > 0.5 ? `+◈${fmt(hp.earned)}` : '',
    );
    this.card.classList.toggle('ready', hp.status === 'met');
    const key = `${hp.id}|${hp.status}`;
    if (key === this.shown) return;
    this.shown = key;
    this.fold.wake();
    this.render(hp);
  }

  private render(hp: Happening): void {
    const c = this.ctx;
    setText(
      this.kicker,
      hp.kind === 'request' ? 'Residents ask' : DISTRICT_KINDS.includes(hp.kind) ? HAPPENING_NAMES[hp.kind] : 'Happening',
    );
    setText(
      this.title,
      hp.kind === 'request'
        ? `${hp.place}: ${askName(hp.category!)}`
        : DISTRICT_KINDS.includes(hp.kind)
          ? `${hp.place}${hp.complaint && hp.kind !== 'praise' ? `: ${complaintLabel(hp.complaint)}` : ''}`
          : HAPPENING_NAMES[hp.kind],
    );
    this.card.classList.toggle('hp-protest', hp.kind === 'protest');
    this.ico.replaceChildren(icon(ICON[hp.kind]));
    const locate = h(
      'button',
      {
        class: 'jc-do hp-locate',
        title: 'Show where',
        onClick: () => c.cameraCtl.locate(hp.x, hp.z, { size: (hp.radius ?? (hp.district !== undefined ? 14 : 6)) * 2 }),
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
    const enact =
      hp.kind === 'petition' && hp.policy
        ? h(
            'button',
            {
              class: 'jc-do',
              title: getPolicy(hp.policy)?.upside ?? '',
              onClick: () => {
                if (!c.commands.execute('setPolicy', { id: hp.policy!, on: true }))
                  c.bus.emit('toast', { text: `Can't enact ${getPolicy(hp.policy!)?.name ?? hp.policy} now`, tone: 'bad' });
              },
            },
            icon('pen'),
            `Enact ${getPolicy(hp.policy)?.name ?? hp.policy}`,
          )
        : null;
    const id =
      hp.kind === 'request'
        ? this.suggest(hp.category!)
        : hp.complaint === 'amenities' && hp.kind !== 'praise'
          ? this.suggest('nature')
          : null;
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
    this.act.replaceChildren(...(enact ? [enact] : []), ...(build ? [build] : []), locate);
  }
}

export const happeningsModule: GameModule = {
  id: 'happenings',
  deps: ['hud', 'construction', 'moments', 'juice'],
  init(ctx) {
    const card = new HappeningsCard(ctx);
    // Drill: ?happening=request|festival|bumper-catch|cruise|petition|protest|praise|expo starts one as soon as the city is up (like ?drill=).
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
