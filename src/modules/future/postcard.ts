import type { GameContext } from '@/game/context';
import type { Projection } from '@/sim/foresee';
import { proposeBuilds, type BuildProposal } from '@/sim/proposals';
import { closeX } from '@/ui/closeX';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';

/**
 * The postcard from the future (plan v7, Phase 35, D-223): what Flora's look ahead found, as numbers against today,
 * the council's verdict, and her best levers as one-click builds (proposals for the city's problems now, plus fire
 * cover when the run saw fires). Also the progress chip shown while the worker runs. Text from the sim reaches the
 * DOM as text only.
 */

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`;

export interface PostcardActions {
  watchAgain(): void;
  lookFurther(): void;
  /** Runs the same horizon again after a change (the what-if loop, D-224): the postcard shows the difference. */
  lookAgain(days: number): void;
}

/** The chip under the top bar while the forward run works (Cancel stops it). */
export class ProgressChip {
  readonly el: HTMLElement;
  private label = h('span', { class: 'fzp-label' }, 'Flora is looking ahead…');
  private fill = h('i', { class: 'fzp-fill' });

  constructor(ctx: GameContext, cancel: () => void) {
    this.el = h(
      'section',
      { class: 'fzp panel holo hidden', role: 'status', 'aria-live': 'polite' },
      h('span', { class: 'fzp-ico' }, icon('eye')),
      h('div', { class: 'fzp-main' }, this.label, h('div', { class: 'fzp-bar' }, this.fill)),
      h('button', { class: 'btn ghost fzp-cancel', onClick: cancel }, 'Cancel'),
    );
    ctx.hud.append(this.el);
  }

  show(days: number): void {
    setText(this.label, `Flora is looking ${days} days ahead…`);
    this.fill.style.transform = 'scaleX(0)';
    this.el.classList.remove('hidden');
  }

  progress(k: number): void {
    this.fill.style.transform = `scaleX(${Math.min(1, Math.max(0, k)).toFixed(3)})`;
  }

  hide(): void {
    this.el.classList.add('hidden');
  }
}

export class Postcard {
  readonly el: HTMLElement;
  private body = h('div', { class: 'fpc-body' });
  private open = false;
  /** The last postcard shown: a new look at the same horizon is compared with it (what changed made a difference). */
  private previous: Projection | null = null;
  private shownDays = 10;

  constructor(
    private ctx: GameContext,
    private actions: PostcardActions,
  ) {
    this.el = h('section', { class: 'fpc panel holo hidden', role: 'dialog', 'aria-label': 'Postcard from the future' }, this.body, closeX('the postcard', () => this.hide()));
    ctx.hud.append(this.el);
    ctx.input.onKey((e) => {
      if (!this.open || e.code !== 'Escape') return false;
      this.hide();
      return true;
    });
    ctx.bus.on('city:reset', () => this.hide());
  }

  get shown(): boolean {
    return this.open;
  }

  hide(): void {
    this.open = false;
    this.el.classList.add('hidden');
  }

  show(p: Projection): void {
    const { city } = this.ctx;
    const s = p.start;
    const e = p.end;
    // What-if (D-224): a later look at the same horizon, after the steward changed something, against the last one.
    const prev = this.previous && this.previous !== p && this.previous.days === p.days && p.start.tick >= this.previous.start.tick ? this.previous : null;
    this.previous = p;
    this.shownDays = p.days;
    const vs = (d: number, good: boolean) =>
      prev ? h('i', { class: `fpc-vs ${d === 0 ? '' : (d > 0) === good ? 'up' : 'down'}`, title: 'Against your last look ahead' }, d ? `${signed(d)} vs last` : 'as last') : null;
    const lost = p.ruined.length + p.removed.length;
    const crises = p.incidents.filter((i) => i.kind !== 'fire');
    const fires = p.incidents.length - crises.length;
    const row = (label: string, from: string, to: string, d: number, good: boolean, vsLast = 0) =>
      h(
        'div',
        { class: `fpc-row ${prev ? 'cmp' : ''}` },
        h('span', { class: 'fpc-k' }, label),
        h('span', { class: 'fpc-from' }, from),
        icon('right'),
        h('b', { class: 'fpc-to' }, to),
        h('i', { class: `fpc-d ${d === 0 ? '' : (d > 0) === good ? 'up' : 'down'}` }, d ? signed(d) : 'same'),
        vs(vsLast, good),
      );
    const verdict =
      p.replacedDay !== null
        ? h('p', { class: 'fpc-verdict bad' }, icon('st-crit'), `The council would replace you on day ${fmt(p.replacedDay)}.`)
        : e.residents < s.residents * 0.95 || e.harmony < s.harmony - 5
          ? h('p', { class: 'fpc-verdict warn' }, icon('st-warn'), 'The island slips if nothing changes.')
          : lost >= 3 || (crises.length && lost)
            ? h('p', { class: 'fpc-verdict warn' }, icon('st-warn'), `The island grows, but loses ${lost} building${lost === 1 ? '' : 's'} on the way.`)
            : h('p', { class: 'fpc-verdict ok' }, icon('st-ok'), 'The island holds its course.');
    const happenings: string[] = [];
    if (crises.length) happenings.push(`${crises.length} ${crises.length === 1 ? 'crisis' : 'crises'}: ${[...new Set(crises.map((c) => c.name))].slice(0, 3).join(', ')}`);
    if (fires) happenings.push(`${fires} fire${fires === 1 ? '' : 's'}`);
    if (lost) happenings.push(`${lost} building${lost === 1 ? '' : 's'} lost`);
    if (p.seaRise[1] - p.seaRise[0] > 0.01) happenings.push('the sea creeps higher');

    // Flora's levers: what answers the city's problems now, and fire cover if the run saw fires.
    const props: BuildProposal[] = proposeBuilds(city, { limit: 3 });
    if ((fires || lost) && !props.some((x) => x.key === 'fire-cover') && props.length < 3) props.push(...proposeBuilds(city, { focus: 'safety', limit: 1 }));
    const levers = props.length
      ? props.map((x) => this.lever(x))
      : [h('p', { class: 'fpc-note' }, 'Nothing pressing to build: keep the course, and look again after your next change.')];

    this.body.replaceChildren(
      h('header', { class: 'fpc-head' }, h('span', { class: 'fpc-stamp' }, icon('eye')), h('div', {}, h('p', { class: 'fpc-kick' }, 'Postcard from the future · if nothing changes'), h('b', { class: 'fpc-title' }, `Day ${fmt(e.day)}, ${p.days} day${p.days === 1 ? '' : 's'} from now`))),
      verdict,
      h(
        'div',
        { class: 'fpc-rows' },
        row('Residents', fmt(s.residents), fmt(e.residents), e.residents - s.residents, true, prev ? e.residents - prev.end.residents : 0),
        row('Harmony', fmt(s.harmony), fmt(e.harmony), e.harmony - s.harmony, true, prev ? e.harmony - prev.end.harmony : 0),
        row('Credits', `◈${fmt(s.credits)}`, `◈${fmt(e.credits)}`, e.credits - s.credits, true, prev ? e.credits - prev.end.credits : 0),
      ),
      prev && (prev.ruined.length + prev.removed.length !== lost || (prev.replacedDay !== null) !== (p.replacedDay !== null))
        ? h(
            'p',
            { class: 'fpc-what' },
            `Against your last look: ${fmt(prev.ruined.length + prev.removed.length)} → ${fmt(lost)} buildings lost${prev.replacedDay !== null && p.replacedDay === null ? ', and the council keeps you now' : prev.replacedDay === null && p.replacedDay !== null ? ', and now the council would replace you' : ''}.`,
          )
        : '',
      happenings.length ? h('p', { class: 'fpc-what' }, `Along the way: ${happenings.join(' · ')}.`) : h('p', { class: 'fpc-what' }, 'A quiet stretch: no crises on the way.'),
      h('p', { class: 'fpc-sec' }, icon('sparkle'), 'Flora’s levers'),
      h('div', { class: 'fpc-levers' }, ...levers),
      h(
        'div',
        { class: 'fpc-foot' },
        h('span', { class: 'fpc-small' }, 'One possible future: crises fall differently each time you change something.'),
        h('button', { class: 'btn ghost', onClick: () => this.actions.watchAgain() }, icon('play'), 'Watch again'),
        h('button', { class: 'btn ghost', onClick: () => this.actions.lookFurther() }, icon('eye'), 'Look further'),
      ),
    );
    this.open = true;
    this.el.classList.remove('hidden');
  }

  private lever(x: BuildProposal): HTMLElement {
    const go = h('button', { class: 'fpc-go', disabled: !x.affordable, title: x.affordable ? `Build ${x.count}× ${x.name} in ${x.district}` : 'Not enough credits yet' }, icon('build'), `Build ◈${fmt(x.cost)}`) as HTMLButtonElement;
    const foot = h('div', { class: 'fpc-lever-foot' }, go);
    go.addEventListener('click', async () => {
      go.disabled = true;
      const agent = this.ctx.services.get('agent');
      let built = 0;
      let error = '';
      for (let i = 0; i < x.count; i++) {
        const r = await agent.call('build', { type: x.type, x: x.site.x, z: x.site.z, rot: x.site.rot });
        if (!r.ok) {
          error = r.error;
          break;
        }
        built++;
      }
      foot.replaceChildren(
        h('span', { class: `fpc-done ${built ? 'ok' : 'bad'}` }, built ? `✓ Built ${built > 1 ? `${built}× ` : ''}${x.name}` : `✗ ${error || 'Could not build'}`),
        built ? h('button', { class: 'btn ghost fpc-again', title: 'Look ahead again with this built', onClick: () => this.actions.lookAgain(this.shownDays) }, icon('eye'), 'See the difference') : '',
      );
      if (built) this.ctx.bus.emit('toast', { text: `Built ${built > 1 ? `${built}× ` : ''}${x.name} in ${x.district}`, tone: 'ok', at: { x: x.site.x, z: x.site.z } });
    });
    return h(
      'div',
      { class: 'fpc-lever' },
      h('div', { class: 'fpc-lever-text' }, h('b', {}, `${x.count > 1 ? `${x.count}× ` : ''}${x.name}`), h('span', {}, `${x.why} · ${x.gain}`), h('span', { class: 'fpc-where' }, x.district)),
      foot,
    );
  }
}
