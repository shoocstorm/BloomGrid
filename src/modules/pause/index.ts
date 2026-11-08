import type { GameContext, GameModule } from '@/game/context';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { holoHead, rise } from '@/ui/holo';
import { INDICATOR_NAMES as N, SYSTEM_LABELS, SYSTEM_ORDER } from '@/sim/indicators';
import { TIERS, type SystemKey } from '@/sim/pulseState';
import { statGuide, type StatId } from '@/sim/statGuide';
import { seasonAt } from '@/sim/seasons';
import './pause.css';

/** Systems whose stat guide explains them in a sentence (the others read as "Mobility Strained"). */
const GUIDE: Partial<Record<SystemKey, StatId>> = { budget: 'credits', energy: 'energy', water: 'water', food: 'food', ecology: 'eco', harmony: 'happy' };
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const clock = (t: number) => {
  const m = Math.floor(t * 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * The pause panel (D-114): when the steward stops the clock, a card in the middle of the screen says so, shows the
 * city at a glance (credits, residents, harmony, every system's health in the shared order, the one thing that
 * needs attention) and offers one big Resume (Space works too). Turning to the city (a click on it, a tool, a
 * selection, Esc, Keep planning) folds it into a small pill under the top bar, so planning while paused is never
 * blocked. Clock holds that aren't the player's (dialogs, the loader, photo mode, game over) show nothing.
 */
class PausePanel {
  private root: HTMLElement;
  private card: HTMLElement;
  private pill: HTMLElement;
  private eyebrow: HTMLElement;
  private title: HTMLElement;
  private resumeSub: HTMLElement;
  private stats = new Map<string, HTMLElement>();
  private health = new Map<SystemKey, { dot: HTMLElement; el: HTMLElement }>();
  private focus: HTMLElement;
  private state: 'hidden' | 'open' | 'folded' = 'hidden';
  /** The speed Resume returns to (the last one the city ran at). */
  private resumeAt = 1;
  private check = 0;
  private refresh = 0;

  constructor(private ctx: GameContext) {
    const resume = () => this.resume();
    const fold = () => this.fold();
    const head = holoHead(icon('pause'), 'Time held', 'The city is paused', 'Nothing moves while you plan: build, inspect and reshape, the island waits for you.');
    this.eyebrow = head.querySelector('.hh-eyebrow')!;
    this.title = head.querySelector('.hh-title')!;
    this.resumeSub = h('span', { class: 'pz-go-s' });
    const go = h(
      'button',
      { class: 'pz-go', title: 'Resume (Space)', 'aria-label': 'Resume the city', onClick: resume },
      h('span', { class: 'pz-orb' }, h('i', { class: 'pz-ring' }), h('i', { class: 'pz-ring r2' }), h('span', { class: 'pz-orb-c' }, icon('play'))),
      h('span', { class: 'pz-go-t' }, h('b', {}, 'Resume'), this.resumeSub),
    );
    const stat = (id: string, glyph: string, label: string) => {
      const v = h('b');
      this.stats.set(id, v);
      return h('div', { class: 'pz-stat' }, h('span', { class: 'pz-stat-k' }, icon(glyph), label), v);
    };
    const stats = h('div', { class: 'pz-stats' }, stat('credits', 'credits', N.credits), stat('pop', 'people', N.residents), stat('happy', 'happy', N.harmony));
    const health = h('div', { class: 'pz-health', 'aria-label': 'System health' });
    for (const k of SYSTEM_ORDER) {
      const dot = h('i', { class: 'tier-dot' });
      const el = h('span', { class: 'pz-sys' }, dot, SYSTEM_LABELS[k]);
      this.health.set(k, { dot, el });
      health.append(el);
    }
    this.focus = h('p', { class: 'pz-focus' });
    const foot = h(
      'div',
      { class: 'pz-foot' },
      h('span', { class: 'pz-keys' }, h('kbd', {}, 'Space'), ' resume', h('i', { class: 'pz-sep' }), h('kbd', {}, '1'), h('kbd', {}, '2'), h('kbd', {}, '3'), ' pick a speed'),
      h('button', { class: 'pz-fold', title: 'Fold this away and keep planning (Esc)', onClick: fold }, icon('down'), 'Keep planning', h('kbd', {}, 'Esc')),
    );
    this.card = h('div', { class: 'pz-card holo', role: 'dialog', 'aria-label': 'The city is paused' }, head, go, stats, health, this.focus, foot);
    rise([go, stats, health, this.focus, foot]);
    this.pill = h(
      'button',
      { class: 'pz-pill', title: 'Resume (Space)', 'aria-label': 'Paused: resume the city', onClick: resume },
      h('span', { class: 'pz-pill-i' }, icon('play')),
      h('b', {}, 'Paused'),
      h('kbd', {}, 'Space'),
    );
    this.root = h('div', { class: 'pz hidden' }, h('div', { class: 'pz-veil' }), this.card, this.pill);
    ctx.hud.append(this.root);

    // Space resumes at the speed the city ran at (the global hotkey would restart at 1×).
    ctx.input.onKey((e) => {
      if (this.state === 'hidden' || e.code !== 'Space' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
      this.resume();
      return true;
    }, 5);
    // Esc folds the card after tools, dialogs and the selection have had it (before City Pulse folds, at −10).
    ctx.input.onKey((e) => {
      if (this.state !== 'open' || e.code !== 'Escape') return false;
      this.fold();
      return true;
    }, -5);
    // Turning to the city folds the card: planning while paused is the point of pausing.
    ctx.renderer.domElement.addEventListener('pointerdown', fold);
    ctx.bus.on('tool:changed', fold);
    ctx.bus.on('selection:changed', ({ eid, eids, road }) => (eid != null || eids?.length || road !== undefined) && fold());
  }

  private resume(): void {
    this.ctx.engine.speed = this.resumeAt;
  }

  private fold(): void {
    if (this.state !== 'open') return;
    this.state = 'folded';
    this.root.classList.add('folded');
  }

  /** A hold that isn't the player's: a dialog, the loader, photo mode, the city tour, the boot. */
  private heldByOther(): boolean {
    const body = document.body;
    return (
      !body.classList.contains('booted') ||
      body.classList.contains('chapter-open') ||
      !!this.ctx.services.tryGet('loader')?.busy ||
      this.ctx.hud.classList.contains('photo') ||
      this.ctx.hud.classList.contains('touring') ||
      !!document.querySelector('.modal-scrim')
    );
  }

  update(dt: number): void {
    const speed = this.ctx.engine.speed;
    if (speed) this.resumeAt = speed;
    if ((this.check += dt) < 0.1) return;
    this.check = 0;
    const paused = speed === 0 && !this.heldByOther();
    if (paused && this.state === 'hidden') {
      this.state = 'open';
      this.root.classList.remove('hidden', 'folded');
      this.refresh = Infinity;
    } else if (!paused && this.state !== 'hidden') {
      this.state = 'hidden';
      this.root.classList.add('hidden');
    }
    // The city still changes while paused (builds, demolitions): refresh twice a second.
    if (this.state === 'hidden' || (this.refresh += 0.1) < 0.5) return;
    this.refresh = 0;
    this.fill();
  }

  private fill(): void {
    const city = this.ctx.city;
    const s = city.stats;
    const p = city.pulse;
    const name = city.growth.name;
    setText(this.title, name && name !== 'BloomGrid' ? `${name} is paused` : 'The city is paused');
    const led = this.eyebrow.firstElementChild!;
    this.eyebrow.replaceChildren(led, `Time held · Day ${city.day} · ${clock(city.timeOfDay)} · ${seasonAt(city.tick).season.name}`);
    setText(this.resumeSub, `at ${this.resumeAt}× · or press Space`);
    setText(this.stats.get('credits')!, fmt(city.credits));
    setText(this.stats.get('pop')!, fmt(s.population));
    setText(this.stats.get('happy')!, `${Math.round(s.happiness)}`);
    let worst: SystemKey | null = null;
    for (const k of SYSTEM_ORDER) {
      const t = p.tiers[k];
      const r = this.health.get(k)!;
      r.dot.className = `tier-dot t${t}`;
      r.el.title = `${SYSTEM_LABELS[k]}: ${TIERS[t]}`;
      r.el.classList.toggle('warn', t >= 2);
      if (t >= 2 && (worst === null || t > p.tiers[worst])) worst = k;
    }
    if (worst === null) {
      this.focus.className = 'pz-focus ok';
      this.focus.replaceChildren(icon('st-ok'), 'Every system is Stable or better: a good moment to plan the next district.');
    } else {
      const g = GUIDE[worst];
      const why = g ? statGuide(city, g).status : `${SYSTEM_LABELS[worst]} is ${TIERS[p.tiers[worst]]}.`;
      this.focus.className = `pz-focus t${p.tiers[worst]}`;
      this.focus.replaceChildren(icon('st-warn'), h('b', {}, `${SYSTEM_LABELS[worst]} · ${TIERS[p.tiers[worst]]}`), ` ${why}`);
    }
  }
}

export const pauseModule: GameModule = {
  id: 'pause',
  deps: ['hud'],
  init(ctx) {
    const panel = new PausePanel(ctx);
    ctx.systems.add({ id: 'pause.panel', phase: 'render', order: 130, update: (_c, f) => panel.update(f.dt) });
  },
};
