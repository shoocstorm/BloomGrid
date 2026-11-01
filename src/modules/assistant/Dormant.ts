import type { GameContext } from '@/game/context';
import { buildings } from '@/content';
import { buildingId } from '@/sim/inventory';
import { FLORA_BASE, type FloraWake } from '@/sim/flora';
import type { Criterion } from '@/sim/projects';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';

const fmt = (n: number) => Math.round(n).toLocaleString();
const dur = (s: number) => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(1, Math.round(s))} s`);

/** The sleeping sigil: the hex frame and orbit, petals folded to a bud, a dim core; three floating z's. */
function sleepingSigil(): HTMLElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-20 -20 40 40');
  svg.setAttribute('class', 'fd-sigil');
  const hex = Array.from({ length: 6 }, (_, i) => `${(17 * Math.cos((Math.PI / 3) * i + Math.PI / 6)).toFixed(2)},${(17 * Math.sin((Math.PI / 3) * i + Math.PI / 6)).toFixed(2)}`).join(' ');
  const petals = Array.from({ length: 6 }, (_, i) => `<ellipse rx="3.1" ry="7.2" cx="0" cy="-6.2" transform="rotate(${i * 60})"/>`).join('');
  svg.innerHTML = `<polygon class="s-hex" points="${hex}"/><circle class="s-orbit" r="13.2"/><g class="s-petals">${petals}</g><circle class="s-core" r="2.6"/>`;
  return h('div', { class: 'fd-hero', 'aria-hidden': 'true' }, svg, h('i', { class: 'fd-z' }, 'z'), h('i', { class: 'fd-z' }, 'z'), h('i', { class: 'fd-z' }, 'Z'));
}

export interface DormantHooks {
  /** Starts the "Wake Flora" project. */
  wake(): void;
  /** Closes the console (so a picked-up building can be placed on the map). */
  close(): void;
}

/**
 * Flora asleep (D-092): what the console shows until she is woken on a fresh island. The conditions to wake her,
 * each with a one-click way to meet it (pick up the building that satisfies it, or open the budget; a met building
 * condition can be located), then the Wake button, or the waking progress. Re-rendered from `floraWake` a few
 * times a second while visible.
 */
export class DormantView {
  readonly el: HTMLElement;
  private title = h('div', { class: 'fd-title' });
  private sub = h('p', { class: 'fd-sub' });
  private eyebrow = h('div', { class: 'fd-eyebrow' });
  private list = h('ul', { class: 'fd-crit' });
  private wakeBtn: HTMLButtonElement;
  private wakeLabel = h('span', {});
  private bar = h('i', {});
  private progress = h('div', { class: 'fd-progress hidden' }, h('div', { class: 'fd-bar' }, this.bar), h('span', {}));
  private key = '';

  constructor(
    private ctx: GameContext,
    private hooks: DormantHooks,
  ) {
    this.wakeBtn = h('button', { class: 'fd-wake', onClick: () => hooks.wake() }, icon('sparkle'), this.wakeLabel) as HTMLButtonElement;
    this.el = h(
      'div',
      { class: 'ai-dormant' },
      sleepingSigil(),
      this.eyebrow,
      this.title,
      this.sub,
      this.list,
      this.wakeBtn,
      this.progress,
      h('p', { class: 'fd-note' }, `Awake, she answers, advises and acts on request; each request costs credits (from ◈${FLORA_BASE}).`),
    );
  }

  private action(c: Criterion): HTMLElement | null {
    const city = this.ctx.city;
    if (!c.ok && c.build && buildings.has(c.build)) {
      const def = buildings.get(c.build);
      return h(
        'button',
        {
          class: 'fd-do',
          title: `Pick up a ${def.name} (◈${fmt(def.stats.cost)}) and place it on the map`,
          onClick: () => {
            this.hooks.close();
            this.ctx.services.get('construction').startBuilding(def.id);
          },
        },
        icon('build'),
        `Build ${def.name}`,
      );
    }
    if (!c.ok && c.credits)
      return h('button', { class: 'fd-do', title: 'Open the budget (Dashboard)', onClick: () => (this.hooks.close(), this.ctx.services.get('dashboard').toggle()) }, icon('credits'), 'Budget');
    if (c.ok && c.build) {
      const eid = city.buildingEntities().find((e) => city.buildingDef(e).id === c.build);
      if (eid !== undefined)
        return h('button', { class: 'fd-do ghost', title: 'Show it', onClick: () => this.ctx.services.get('inventory').select(buildingId(city, eid)) }, icon('locate'));
    }
    return null;
  }

  render(w: FloraWake): void {
    const met = w.criteria.filter((c) => c.ok).length;
    // Rebuild the list only when something changed (labels carry live numbers; ~2 Hz is fine).
    const key = `${w.phase}|${w.criteria.map((c) => `${c.ok}${c.label}${Math.round((c.progress ?? 0) * 50)}`).join('|')}`;
    this.el.dataset.phase = w.phase;
    setText(this.eyebrow, w.phase === 'waking' ? 'Civic intelligence · waking' : w.phase === 'ready' ? 'Civic intelligence · ready' : 'Civic intelligence · dormant');
    setText(this.title, w.phase === 'waking' ? 'Flora is waking' : w.phase === 'ready' ? 'Flora is ready to wake' : 'Flora is asleep');
    setText(
      this.sub,
      w.phase === 'waking'
        ? 'Her mind is coming online on the Data Spire. Keep it powered.'
        : w.phase === 'ready'
          ? 'Everything she needs is in place. Wake her when you are ready.'
          : `She thinks on a Data Spire and needs power and a treasury to start. ${met} of ${w.criteria.length} conditions met.`,
    );
    if (key !== this.key) {
      this.key = key;
      this.list.replaceChildren(
        ...w.criteria.map((c) =>
          h(
            'li',
            { class: c.ok ? 'ok' : '' },
            h('span', { class: 'fd-st' }, icon(c.ok ? 'st-ok' : 'st-off')),
            h(
              'span',
              { class: 'fd-l' },
              c.label,
              !c.ok && c.progress !== undefined ? h('span', { class: 'fd-mini' }, h('i', { style: `transform:scaleX(${c.progress.toFixed(3)})` })) : null,
            ),
            this.action(c),
          ),
        ),
      );
    }
    const waking = w.phase === 'waking';
    this.wakeBtn.classList.toggle('hidden', waking);
    this.progress.classList.toggle('hidden', !waking);
    this.wakeBtn.disabled = w.phase !== 'ready';
    setText(this.wakeLabel, w.phase === 'ready' ? `Wake Flora · ◈${fmt(w.cost)} · ${dur(w.secondsLeft)}` : `Wake Flora · ◈${fmt(w.cost)}`);
    this.wakeBtn.title = w.phase === 'ready' ? 'Start waking her (the Data Spire needs a while)' : 'Meet every condition first';
    if (waking) {
      this.bar.style.transform = `scaleX(${w.progress.toFixed(3)})`;
      setText(this.progress.lastElementChild as HTMLElement, `${Math.round(w.progress * 100)}% · about ${dur(w.secondsLeft)} left`);
    }
  }
}
