import type { GameContext } from '@/game/context';
import {
  FIREWORK_DEFS,
  GRAND_SHELLS,
  SHOW_FEE,
  SHOW_SHELLS,
  clockOf,
  launchBlocker,
  launchSites,
  novelty,
  stockTotal,
  storage,
} from '@/sim/fireworks';
import { FIREWORK_KINDS } from '@/sim/fireworksState';
import { buildingId } from '@/sim/inventory';
import { h, setText } from '@/ui/dom';

const fmt = (n: number) => Math.round(n).toLocaleString();
const signed = (n: number, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;

/**
 * Dashboard Fireworks tab (D-068): the magazine (shells per kind against storage), how many shows have run and
 * the last few, what they cost and earned, and their effect right now on harmony (afterglow less fatigue) and
 * the air (smoke). Launch and nightly-show controls run the same commands as the top-bar button and Flora.
 */
export class FireworksView {
  readonly el: HTMLElement;
  private tiles = new Map<string, { value: HTMLElement; sub: HTMLElement }>();
  private stock = h('div', { class: 'db-bars' });
  private shows = h('div', { class: 'fwv-shows' });
  private note = h('p', { class: 'fwv-note' });
  private launchBtn: HTMLButtonElement;
  private grandBtn: HTMLButtonElement;
  private autoBtn: HTMLButtonElement;

  constructor(private ctx: GameContext) {
    const tiles = h('div', { class: 'db-tiles' });
    for (const [id, label] of [
      ['shows', 'Shows so far'],
      ['stock', 'Shells in stock'],
      ['harmony', 'Harmony now'],
      ['smoke', 'Smoke'],
      ['money', 'Visitors vs costs'],
    ]) {
      const value = h('div', { class: 'db-tile-v' });
      const sub = h('div', { class: 'db-tile-s' });
      this.tiles.set(id!, { value, sub });
      tiles.append(h('div', { class: 'db-tile' }, h('div', { class: 'db-tile-k' }, label!), value, sub));
    }
    const run = (name: string, payload: object) => {
      ctx.commands.execute(name, payload);
      this.render();
    };
    this.launchBtn = h(
      'button',
      { class: 'fwv-btn', onClick: () => run('launchFireworks', {}) },
      `Launch show · ${SHOW_SHELLS}`,
    ) as HTMLButtonElement;
    this.grandBtn = h(
      'button',
      { class: 'fwv-btn', onClick: () => run('launchFireworks', { grand: true }) },
      `Grand show · ${GRAND_SHELLS}`,
    ) as HTMLButtonElement;
    this.autoBtn = h('button', {
      class: 'fwv-btn',
      onClick: () => run('setFireworksAuto', { on: !ctx.city.fireworks.auto }),
    }) as HTMLButtonElement;
    this.el = h(
      'div',
      { class: 'fwv' },
      tiles,
      h('div', { class: 'fwv-actions' }, this.launchBtn, this.grandBtn, this.autoBtn, this.note),
      h(
        'div',
        { class: 'db-cols' },
        h('div', {}, h('h3', {}, 'Magazine'), this.stock),
        h('div', {}, h('h3', {}, 'Recent shows'), this.shows),
      ),
    );
  }

  render(): void {
    const { city } = this.ctx;
    const fw = city.fireworks;
    const cap = storage(city);
    const n = stockTotal(fw.stock);
    const set = (id: string, v: string, sub: string) => {
      const t = this.tiles.get(id)!;
      setText(t.value, v);
      setText(t.sub, sub);
    };
    const nov = novelty(fw);
    set('shows', fmt(fw.shows), `${fmt(fw.fired)} shells fired${fw.show ? ' · one in the sky now' : ''}`);
    set('stock', fmt(n), cap ? `of ${fmt(cap)} storage · ${fmt(fw.produced)} made` : 'no factory yet');
    set(
      'harmony',
      signed(city.pulse.harmony.fireworks),
      nov >= 0.75
        ? 'fresh: residents love it'
        : nov >= 0.3
          ? 'novelty wearing thin'
          : nov >= 0
            ? 'jaded'
            : 'noise complaints',
    );
    set(
      'smoke',
      `${Math.round(fw.smog * 100)}%`,
      fw.smog > 0.05 ? 'adds to pollution while it clears' : 'clear skies',
    );
    set(
      'money',
      signed(fw.revenue - fw.spent, 0),
      `${fmt(fw.revenue)} visitors · ${fmt(fw.spent)} materials & crews`,
    );

    const why = launchBlocker(city);
    this.launchBtn.disabled = !!why;
    this.grandBtn.disabled = !!why;
    setText(this.autoBtn, fw.auto ? 'Nightly show: on' : 'Nightly show: off');
    this.autoBtn.classList.toggle('on', fw.auto);
    const sites = launchSites(city).map(([e]) => buildingId(city, e));
    setText(
      this.note,
      why ??
        `Crew fee ${SHOW_FEE} credits. Launches from ${sites[fw.shows % sites.length]}. Nightly show at 21:00 when ${SHOW_SHELLS}+ shells are ready.`,
    );

    const max = Math.max(1, ...FIREWORK_KINDS.map((k) => fw.stock[k]));
    this.stock.replaceChildren(
      ...FIREWORK_KINDS.map((k) =>
        h(
          'div',
          { class: 'db-bar' },
          h('span', { class: 'db-bar-l' }, FIREWORK_DEFS[k].name),
          h(
            'span',
            { class: 'db-bar-t' },
            h('i', { class: `fwv-${k}`, style: `width:${(fw.stock[k] / max) * 100}%` }),
          ),
          h('span', { class: 'db-bar-v' }, fmt(fw.stock[k])),
        ),
      ),
    );
    this.shows.replaceChildren(
      ...(fw.history.length
        ? fw.history
            .slice(-8)
            .reverse()
            .map((r) =>
              h(
                'div',
                { class: 'fwv-show' },
                h('b', {}, `Day ${r.day} · ${clockOf(r.time)}`),
                h('span', {}, `${r.grand ? 'Grand show' : 'Show'} · ${r.shells} shells`),
                h('span', { class: 'fwv-by' }, r.cause === 'night' ? 'nightly' : 'steward'),
              ),
            )
        : [h('p', { class: 'fwv-note' }, 'No shows yet.')]),
    );
  }
}
