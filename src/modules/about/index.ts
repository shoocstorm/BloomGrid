import type { GameContext, GameModule } from '@/game/context';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { rise } from '@/ui/holo';
import './about.css';

/** The game's facts for the credits: the version follows package.json, so each release shows its own number. */
export const ABOUT = {
  version: __APP_VERSION__,
  author: 'Aldrick Wan',
  made: 'November 2026',
  repo: 'https://github.com/shoocstorm/BloomGrid',
  slogan: 'Grow a city that grows back.',
  tagline: 'A solarpunk island city builder, where every rooftop dreams of a forest.',
} as const;

export interface AboutService {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

declare module '@/core/Services' {
  interface GameServices {
    about: AboutService;
  }
}

/**
 * About BloomGrid (D-101): the credits, opened by clicking the brand at the top left. A holographic card over a
 * dimmed city: a blooming emblem with orbiting rings and drifting petals, the gradient title and the slogan, the
 * version, the author, when it was made and the source link. Its animations run only while it is open
 * (display: none stops them) and use transform and opacity alone (§7½). Esc, the close button or a click outside
 * closes it.
 */
class AboutDialog implements AboutService {
  readonly el: HTMLElement;
  private shown = false;
  private copyLabel = h('span', {}, 'Copy link');

  constructor(ctx: GameContext) {
    const petals = h('div', { class: 'ab-petals', 'aria-hidden': 'true' });
    for (let i = 0; i < 14; i++) {
      const p = h('i');
      p.style.setProperty('--x', `${((i * 37) % 100).toFixed(0)}%`);
      p.style.setProperty('--d', `${(i * 0.83) % 7}s`);
      p.style.setProperty('--t', `${7 + ((i * 1.7) % 5)}s`);
      p.style.setProperty('--h', String((i * 47) % 360));
      petals.append(p);
    }
    const emblem = h(
      'div',
      { class: 'ab-emblem', 'aria-hidden': 'true' },
      h('span', { class: 'ab-orbit o1' }, h('b')),
      h('span', { class: 'ab-orbit o2' }, h('b')),
      h('span', { class: 'ab-orbit o3' }, h('b')),
      h('span', { class: 'ab-halo' }),
      h('span', { class: 'ab-gem' }),
      ...Array.from({ length: 8 }, (_, k) => {
        const leaf = h('span', { class: 'ab-leaf' });
        leaf.style.setProperty('--r', `${k * 45}deg`);
        return leaf;
      }),
    );
    const fact = (ico: string, label: string, ...value: (Node | string)[]) =>
      h('div', { class: `ab-fact${ico === 'link' ? ' wide' : ''}` }, h('span', { class: 'ab-fi' }, icon(ico)), h('span', { class: 'ab-fl' }, label), h('span', { class: 'ab-fv' }, ...value));
    const facts = h(
      'div',
      { class: 'ab-facts' },
      fact('people', 'Created by', h('b', {}, ABOUT.author)),
      fact('calendar', 'Made in', ABOUT.made),
      fact('version', 'Version', h('code', {}, `v${ABOUT.version}`)),
      fact(
        'link',
        'Source',
        h('a', { href: ABOUT.repo, target: '_blank', rel: 'noopener noreferrer' }, ABOUT.repo.replace('https://', '')),
      ),
    );
    const actions = h(
      'div',
      { class: 'ab-actions' },
      h('a', { class: 'ab-btn primary', href: ABOUT.repo, target: '_blank', rel: 'noopener noreferrer' }, icon('star'), h('span', {}, 'Star on GitHub')),
      h('button', { class: 'ab-btn', onClick: () => void this.copy() }, icon('copy'), this.copyLabel),
    );
    const card = h(
      'section',
      { class: 'about panel holo', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'About BloomGrid' },
      petals,
      h('button', { class: 'icon-btn ab-close', title: 'Close (Esc)', 'aria-label': 'Close', onClick: () => this.close() }, icon('close')),
      h(
        'div',
        { class: 'ab-hero' },
        emblem,
        h('div', { class: 'ab-eyebrow' }, h('i', { class: 'hh-led' }), `Island OS · build v${ABOUT.version}`),
        h('h1', { class: 'ab-title' }, 'BloomGrid'),
        h('p', { class: 'ab-slogan' }, ABOUT.slogan),
        h('p', { class: 'ab-tag' }, ABOUT.tagline),
      ),
      facts,
      actions,
      h(
        'footer',
        { class: 'ab-foot' },
        h('span', {}, 'Built with three.js (WebGPU) · TypeScript · Vite · Tauri'),
        h('span', {}, `© 2026 ${ABOUT.author} · Made with care for greener cities`),
      ),
    );
    rise([...card.querySelectorAll('.ab-eyebrow, .ab-title, .ab-slogan, .ab-tag, .ab-fact, .ab-actions, .ab-foot')]);
    this.el = h('div', { class: 'ab-scrim hidden', onClick: (e: Event) => e.target === this.el && this.close() }, card);
    ctx.hud.append(this.el);
    ctx.input.onKey((e) => {
      if (e.code === 'Escape' && this.shown) return (this.close(), true);
      return false;
    });
  }

  get isOpen(): boolean {
    return this.shown;
  }

  open(): void {
    this.shown = true;
    setLabel(this.copyLabel, 'Copy link');
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.shown = false;
    this.el.classList.add('hidden');
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(ABOUT.repo);
      setLabel(this.copyLabel, 'Copied!');
    } catch {
      setLabel(this.copyLabel, ABOUT.repo);
    }
  }
}

const setLabel = (el: HTMLElement, text: string) => {
  el.textContent = text;
};

export const aboutModule: GameModule = {
  id: 'about',
  deps: ['hud'],
  init(ctx) {
    ctx.services.provide('about', new AboutDialog(ctx));
  },
};
