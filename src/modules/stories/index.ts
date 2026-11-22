import { buildings } from '@/content';
import { Building } from '@/ecs/components';
import type { GameContext, GameModule } from '@/game/context';
import { isCompact } from '@/platform/device';
import { buildingId } from '@/sim/inventory';
import { getPolicy } from '@/sim/policies';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { ARCS, CHOICE_SECONDS, LASTING, choiceBlock, getArc, homeOf, startStory, storyBeat } from '@/sim/stories';
import type { StoryRun } from '@/sim/storyState';
import { closeX } from '@/ui/closeX';
import { autoCollapse } from '@/ui/idle';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import './stories.css';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * The story card (plan v5, Phase 29): a resident's story beat (`sim/stories.ts`) in the milestone card's frame,
 * stacked under the other cards. While a choice is open it shows both, with their cost; while a goal is pending, its
 * hint and a button that does it (Build near the home, Enact the ordinance) and the time left. Every beat has
 * **Visit** (fly to their home and open it) and **Walk there** (explore on foot from their street). Toasts and a minor
 * moment mark the turns. A beat can be closed; it comes back at the next beat.
 */
class StoryCard {
  private card: HTMLElement;
  private ico = h('span', { class: 'jc-m-ico' });
  private kicker = h('span', { class: 'jc-m-kicker' });
  private left = h('span', { class: 'jc-m-count' });
  private title = h('b', { class: 'jc-m-title' });
  private hint = h('p', { class: 'jc-m-hint st-text' });
  private bar = h('i');
  private act = h('div', { class: 'jc-m-act st-act' });
  private shown = '';
  private dismissed = '';
  private slow = 0;
  private fold: ReturnType<typeof autoCollapse>;

  constructor(private ctx: GameContext) {
    const head = h('header', { class: 'jc-m-head st-head' }, icon('people'), this.kicker, this.left);
    this.card = h(
      'section',
      { class: 'jc-m hp st panel holo hidden', 'aria-label': 'Resident story', 'aria-live': 'polite' },
      head,
      h('div', { class: 'jc-m-main' }, this.ico, h('div', { class: 'jc-m-text' }, this.title, this.hint)),
      h('div', { class: 'jc-m-bar hp-bar' }, this.bar),
      this.act,
      closeX('this story', () => {
        this.dismissed = this.key();
        this.card.classList.add('hidden');
      }),
    );
    ctx.hud.append(this.card);
    // Untouched, it shrinks to its header with the time left (D-201); the next beat opens it again.
    this.fold = autoCollapse(this.card, head);
    const { bus } = ctx;
    const at = (run: StoryRun) => {
      const e = homeOf(ctx.city, run);
      return e >= 0 ? { x: Building.x[e]! + Building.w[e]! / 2, z: Building.z[e]! + Building.d[e]! / 2 } : undefined;
    };
    bus.on('story:beat', ({ run }) => {
      if (ctx.loading) return;
      const arc = getArc(run.arc);
      bus.emit('toast', { text: `${arc?.title ?? 'A story'}: ${run.name} of ${run.place} has something to ask`, tone: 'info', at: at(run) });
      bus.emit('juice', { sound: 'claimable' });
    });
    bus.on('story:resolved', ({ run, told }) => {
      if (!ctx.loading && run.status === 'between') bus.emit('toast', { text: `${run.first}: ${told}`, tone: 'ok', at: at(run) });
    });
    bus.on('story:end', ({ run, outcome }) => {
      if (ctx.loading) return;
      const arc = getArc(run.arc);
      if (outcome === 'happy')
        ctx.services.tryGet('moments')?.play({
          id: `story:${run.id}`,
          scale: 'minor',
          tone: 'bloom',
          emblem: arc?.icon ?? 'people',
          eyebrow: `A resident's story · ${arc?.title ?? ''}`,
          title: `${run.name}, ${arc?.role ?? 'resident'}`,
          lines: run.told.slice(-2),
          sub: ctx.city.stories.lasting.length ? `Lasting: ${ctx.city.stories.lasting.map((l) => LASTING[l]?.name).filter(Boolean).join(', ')}` : 'The city remembers.',
          sound: 'milestone',
        });
      else
        bus.emit('toast', {
          text: outcome === 'moved away' ? `${run.name} moved away: their home is gone` : outcome === 'faded' ? `${run.name}'s moment passed unanswered` : `${run.name} is let down: ${run.told[run.told.length - 1] ?? ''}`,
          tone: 'bad',
          at: at(run),
        });
      this.shown = '';
    });
    for (const ev of ['city:reset', 'load:done'] as const) bus.on(ev, () => (this.shown = ''));
  }

  private key(): string {
    const r = this.ctx.city.stories.current;
    return r ? `${r.id}|${r.beat}|${r.status}` : '';
  }

  update(dt: number): void {
    if ((this.slow -= dt) > 0) return;
    this.slow = 0.25;
    const c = this.ctx;
    const b = storyBeat(c.city);
    const live = !c.loading && c.cameraCtl.enabled && !document.body.classList.contains('chapter-open') && !c.services.tryGet('moments')?.playing;
    const show = !!b && b.run.status !== 'between' && live && this.dismissed !== this.key();
    this.card.classList.toggle('hidden', !show);
    if (!show || !b) return;
    // Under the other cards on desktops; above them on portrait phones (like the happenings card).
    // The milestone card may sit in the right column (D-130), not in the HUD itself: compare screen rectangles.
    const parent = this.card.parentElement;
    const box = parent?.getBoundingClientRect();
    const rects = [...document.querySelectorAll<HTMLElement>('.jc-m:not(.st):not(.hidden)')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
    const compact = isCompact();
    const bottom = rects.length ? Math.max(...rects.map((r) => r.bottom)) : 0;
    const top = rects.length ? Math.min(...rects.map((r) => r.top)) : 0;
    this.card.style.top = rects.length && box && !compact ? `${bottom - box.top + 8}px` : '';
    this.card.style.bottom = rects.length && box && compact ? `${box.bottom - top + 8}px` : '';
    const { run, beat } = b;
    const total = (run.status === 'choosing' ? CHOICE_SECONDS : beat.choices[run.choice!]!.goal!.within) * PULSE_TICKS;
    const remain = Math.max(0, run.status === 'choosing' ? run.beatTick + total - c.city.tick : run.until! - c.city.tick);
    const secs = Math.ceil(remain / PULSE_TICKS);
    this.bar.style.transform = `scaleX(${(remain / total).toFixed(3)})`;
    setText(this.left, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    const k = this.key();
    if (k === this.shown) return;
    this.shown = k;
    this.fold.wake();
    this.render();
  }

  private render(): void {
    const c = this.ctx;
    const b = storyBeat(c.city)!;
    const { run, beat, arc } = b;
    setText(this.kicker, `${arc.title} · ${run.told.length + 1} of ${arc.beats.length}`);
    setText(this.title, `${run.name} · ${arc.role}, ${run.place}`);
    this.ico.replaceChildren(icon(arc.icon));
    const home = homeOf(c.city, run);
    const visit = h(
      'button',
      { class: 'jc-do st-visit', title: `Fly to ${run.first}'s home and open it`, onClick: () => home >= 0 && c.services.get('inventory').select(buildingId(c.city, home)) },
      icon('locate'),
      'Visit',
    );
    const walk = h(
      'button',
      {
        class: 'jc-do st-visit',
        title: `Walk ${run.first}'s street (explore on foot; Esc back)`,
        onClick: () => {
          if (home < 0) return;
          c.cameraCtl.locate(Building.x[home]! + Building.w[home]! / 2, Building.z[home]! + Building.d[home]! / 2, { size: 6 });
          setTimeout(() => c.services.tryGet('explore')?.setMode('walk'), 1300);
        },
      },
      icon('walk'),
      'Walk there',
    );
    if (run.status === 'choosing') {
      setText(this.hint, beat.text(run));
      const choices = beat.choices.map((ch, i) => {
        const block = choiceBlock(c.city, i);
        return h(
          'button',
          {
            class: `jc-do st-choice ${i === 0 ? 'primary' : ''}`,
            disabled: !!block,
            title: block ?? (ch.goal ? `${ch.goal.hint} (within ${Math.round(ch.goal.within / 60)} min)` : ch.told),
            onClick: () => c.commands.execute('storyChoice', { choice: i }, false),
          },
          ch.label,
          ch.cost ? h('span', { class: 'st-cost' }, `◈${fmt(ch.cost)}`) : ch.reward ? h('span', { class: 'st-cost' }, `+◈${fmt(ch.reward)}`) : null,
        );
      });
      this.act.replaceChildren(h('div', { class: 'st-choices' }, ...choices), h('div', { class: 'st-row' }, visit, walk));
      return;
    }
    const goal = beat.choices[run.choice!]!.goal!;
    setText(this.hint, `${goal.hint}. ${run.first} is counting on it.`);
    const def = goal.build?.(c.city);
    const doIt = def
      ? h(
          'button',
          {
            class: 'jc-do',
            title: `Build a ${buildings.get(def).name} near ${run.first}'s home`,
            onClick: () => {
              if (home >= 0) c.cameraCtl.locate(Building.x[home]!, Building.z[home]!, { size: 24 });
              c.services.get('construction').startBuilding(def);
            },
          },
          icon('build'),
          `Build ${buildings.get(def).name}`,
        )
      : goal.policy
        ? h(
            'button',
            {
              class: 'jc-do',
              title: getPolicy(goal.policy)?.upside ?? '',
              onClick: () => {
                if (!c.commands.execute('setPolicy', { id: goal.policy!, on: true }))
                  c.bus.emit('toast', { text: `Can't enact ${getPolicy(goal.policy!)?.name ?? goal.policy} now (City Pulse → Policies says why)`, tone: 'bad' });
              },
            },
            icon('pen'),
            `Enact ${getPolicy(goal.policy)?.name ?? goal.policy}`,
          )
        : null;
    this.act.replaceChildren(h('div', { class: 'st-row' }, ...(doIt ? [doIt] : []), visit, walk));
  }
}

export const storiesModule: GameModule = {
  id: 'stories',
  deps: ['hud', 'construction', 'inventory', 'moments', 'juice', 'happenings'],
  init(ctx) {
    const card = new StoryCard(ctx);
    // Drill: ?story=fisher|founder|family starts one as soon as the city is up (like ?happening=).
    let drill = new URLSearchParams(location.search).get('story');
    ctx.systems.add({
      id: 'stories.card',
      phase: 'render',
      order: 91,
      update: (c, f) => {
        if (drill && !c.loading && c.city.tick > 0) {
          if (!ARCS.some((a) => a.id === drill) || !startStory(c.city, drill)) console.warn(`[stories] this city can't tell "${drill}" now`);
          drill = null;
        }
        card.update(f.dt);
      },
    });
  },
};
