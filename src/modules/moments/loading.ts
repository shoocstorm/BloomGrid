import { h } from '@/ui/dom';
import type { Reel } from './reel';
import './loading.css';

/**
 * The films' loading beat (D-198): while a 3D film's first shot is being prepared (its shaders compiled, a few frames
 * drawn), the reel shows a short themed opening instead of a black or frozen frame: an emblem of the film (Flora's
 * bloom, the stray's eyes, a pod on its lane, Meridian's seal, a pearl in the swell) lit in its own colours, with a
 * bloom, rings running out, motes, and a line of title writing itself; then it opens as an iris out of the emblem's
 * light onto the film. Shown at least `min` ms so a fast machine never sees a flash.
 *
 * Transform and opacity only (compositor), so it keeps moving while the main thread is busy compiling. "First Light"
 * has its own (the lantern, `tutorial/founding.ts`), because it plays over the loading screen.
 */
export interface FilmIntro {
  /** A small line above the title ("Civic intelligence · cold boot"). */
  kicker: string;
  /** The title that writes itself ("Waking BG-01"). */
  title: string;
  /** The emblem: static SVG markup we wrote (its contents, drawn in a 100 × 100 box), shaded with `currentColor`. */
  emblem: string;
  /** Accent (the emblem, rings, motes) and glow (the bloom) colours. */
  accent: string;
  glow: string;
  /** Motes: embers rising, stars twinkling, bubbles drifting. */
  motes?: 'rise' | 'twinkle' | 'drift';
  /** An indeterminate scan line under the title (a machine booting). */
  scan?: boolean;
}

export const INTRO_MIN_MS = 1300;

/**
 * Shows `intro` over the reel until `ready` resolves (and at least `min` ms), then opens onto the film. Resolves false
 * if the reel was skipped meanwhile.
 */
export async function playIntro(reel: Reel, intro: FilmIntro, ready: Promise<unknown>, min = INTRO_MIN_MS): Promise<boolean> {
  const t0 = performance.now();
  const motes = h(
    'div',
    { class: `ld-motes ${intro.motes ?? 'rise'}` },
    ...Array.from({ length: 22 }, () =>
      h('i', {
        style: `--x:${(Math.random() * 40 - 20).toFixed(1)}vmin;--y:${(Math.random() * 30 - 15).toFixed(1)}vmin;--drift:${(Math.random() * 10 - 5).toFixed(1)}vmin;--d:${(0.4 + Math.random() * 2.2).toFixed(2)}s;--t:${(1.8 + Math.random() * 1.8).toFixed(2)}s;--s:${(0.5 + Math.random() * 0.9).toFixed(2)}`,
      }),
    ),
  );
  const emblem = h('div', { class: 'ld-emblem' });
  emblem.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${intro.emblem}</svg>`;
  let i = 0;
  const title = h(
    'p',
    { class: 'ld-title' },
    ...intro.title.split(' ').map((w) => h('span', { class: 'ld-word' }, ...[...w].map((ch) => h('span', { style: `--i:${i++}` }, ch)))),
  );
  const el = h(
    'div',
    { class: 'ld', role: 'status', 'aria-label': `${intro.title}…`, style: `--ld-a:${intro.accent};--ld-g:${intro.glow}` },
    h('i', { class: 'ld-back' }),
    h(
      'div',
      { class: 'ld-stage' },
      h(
        'div',
        { class: 'ld-glow' },
        h('i', { class: 'ld-rays' }),
        h('i', { class: 'ld-bloom' }),
        h('i', { class: 'ld-ring' }),
        h('i', { class: 'ld-ring r2' }),
        h('i', { class: 'ld-ring r3' }),
        motes,
        emblem,
      ),
      h('i', { class: 'ld-flare' }),
    ),
    h('div', { class: 'ld-words' }, h('p', { class: 'ld-kick' }, intro.kicker), title, ...(intro.scan ? [h('i', { class: 'ld-scan' })] : [])),
  );
  reel.root.append(el);
  await ready.catch(() => undefined);
  const left = min - (performance.now() - t0);
  if (left > 0 && !(await reel.wait(left))) return (el.remove(), false);
  if (!reel.alive) return (el.remove(), false);
  // Open: the emblem's light bursts and the backdrop opens as an iris out of it.
  el.classList.add('open');
  setTimeout(() => el.remove(), 1900);
  return reel.wait(450);
}

const FLORA = `<g>${Array.from({ length: 6 }, (_, k) => `<g transform="rotate(${k * 60} 50 50)"><ellipse class="unfold" style="--k:${k}" cx="50" cy="27" rx="9" ry="21" fill="currentColor" opacity="0.55"/></g>`).join('')}</g>
<circle class="pulse" cx="50" cy="50" r="15" fill="currentColor"/>
<g class="blink"><ellipse cx="50" cy="50" rx="10" ry="7" fill="#f4fffc"/><circle cx="50" cy="50" r="4.5" fill="#0b3a36"/><circle cx="51.6" cy="48.4" r="1.4" fill="#fff"/></g>`;

const EYES = `<g class="blink"><path d="M16 50 Q31 33 46 50 Q31 63 16 50Z" fill="currentColor"/><path d="M54 50 Q69 33 84 50 Q69 63 54 50Z" fill="currentColor"/>
<ellipse cx="31" cy="50" rx="2.6" ry="8" fill="#1a1406"/><ellipse cx="69" cy="50" rx="2.6" ry="8" fill="#1a1406"/>
<circle cx="34.5" cy="45" r="1.8" fill="#fff"/><circle cx="72.5" cy="45" r="1.8" fill="#fff"/></g>`;

const POD = `<path d="M6 74 Q50 50 94 66" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>
<path d="M6 74 Q50 50 94 66" fill="none" stroke="#fff" stroke-width="0.8" stroke-linecap="round" opacity="0.6"/>
<g class="glide"><path d="M24 52 Q28 35 52 35 Q76 37 80 50 Q72 59 50 59 Q30 59 24 52Z" fill="#eef6ff"/>
<path d="M43 37 Q56 29 69 40 Q58 45 45 43Z" fill="currentColor" opacity="0.9"/><path d="M24 50 Q52 56 80 50" fill="none" stroke="currentColor" stroke-width="1.6"/>
<circle cx="81" cy="50" r="2.4" fill="#fff3c0"/><path d="M22 49 l-12 -4 v9z" fill="currentColor" opacity="0.8"/></g>`;

const SEAL = `<circle class="turn" cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 5"/>
<circle class="pulse" cx="50" cy="40" r="16" fill="currentColor"/>
<path d="M17 64 q8.25 -7 16.5 0 t16.5 0 t16.5 0 t16.5 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
<path d="M14 76 H86" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`;

const PEARL = `<circle class="pulse" cx="50" cy="42" r="12" fill="#f4fbff"/><circle cx="45.5" cy="37.5" r="3.2" fill="#fff"/>
<path d="M8 62 q10.5 -8 21 0 t21 0 t21 0 t21 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
<path d="M16 73 q8.5 -6 17 0 t17 0 t17 0 t17 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.6"/>`;

/** Each 3D film's loading beat. */
export const INTROS = {
  stray: { kicker: 'Somewhere on the rooftops', title: 'Something is watching', emblem: EYES, accent: '#ffe27a', glow: '#ffb84a', motes: 'twinkle' },
  flight: { kicker: 'Sky-lane charter', title: 'Clearing the sky lanes', emblem: POD, accent: '#7ff7e6', glow: '#5fb8ff', motes: 'rise' },
  flora: { kicker: 'Civic intelligence · cold boot', title: 'Waking BG-01', emblem: FLORA, accent: '#5ff2da', glow: '#2fd6b8', motes: 'rise', scan: true },
  remembers: { kicker: 'A chapter found', title: 'Remembering Halcyon', emblem: SEAL, accent: '#ffe6a8', glow: '#ffc870', motes: 'twinkle' },
  stirs: { kicker: 'Off the coast', title: 'Something stirs', emblem: PEARL, accent: '#9ffff0', glow: '#4fc8e8', motes: 'drift' },
} satisfies Record<string, FilmIntro>;
