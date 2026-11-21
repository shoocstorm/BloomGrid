import type { GameContext } from '@/game/context';
import { h } from '@/ui/dom';
import { CAT_NAMES, CAT_SIDE_SVG, CAT_SVG, COATS } from './art';

/** The stray's shadow coat, as the city paints it before adoption. */
const STRAY = { fur: '#3a3f4a', belly: '#4b515d', mark: '#3a3f4a', eye: '#ffd75e' };
const COAT_NAMES: Record<string, string> = { ginger: 'Ginger', grey: 'Grey', tux: 'Tuxedo', cream: 'Cream', calico: 'Calico' };

/** Acts the exhibit cycles through (its own classes on the city's rig), with a label and a length in seconds. */
const ACTS: [string, string, number][] = [
  ['', 'Sit', 2.4],
  ['act-look', 'Look', 2.8],
  ['act-groom', 'Groom', 3.4],
  ['act-yawn', 'Yawn', 1.9],
  ['act-stretch', 'Stretch', 2.1],
  ['act-twitchL', 'Ear twitch', 1.2],
  ['act-loaf', 'Loaf', 3],
  ['act-watch', 'Watch', 2.6],
  ['pose-side act-walk', 'Walk', 3],
  ['act-pounce', 'Pounce', 1.2],
];

/**
 * The island's cat in the model gallery (D-183): the city's own rigged SVG drawn large on a little stage, cycling
 * its acts (or holding one picked below it); the levels are its coats, and the stray's shadow. A click on it mews.
 */
export function addCatExhibit(ctx: GameContext): void {
  ctx.services.tryGet('gallery')?.add({
    id: 'cat',
    name: 'The island cat',
    group: 'Charms',
    blurb:
      'Every growing island has a shy stray on its rooftops. Befriend it (Build → Goals) and it becomes yours: it follows you across the roofs, talks, warns you of trouble, loves a pet and brings the odd gift.',
    facts: [
      ['Names', `${CAT_NAMES.length}, one per island`],
      ['Coats', `${COATS.length}, one per island`],
      ['Acts', `${ACTS.length} here, more on the roofs`],
      ['Earned by', 'Befriend the stray'],
    ],
    levels: [...COATS.map((c) => COAT_NAMES[c.id] ?? c.id), 'Stray'],
    panel: (level) => catPanel(ctx, level),
  });
}

function catPanel(ctx: GameContext, level: number): HTMLElement {
  const coat = COATS[level] ?? STRAY;
  const front = h('span', { class: 'ch-cat-in' });
  front.innerHTML = CAT_SVG;
  const side = h('span', { class: 'ch-side' });
  side.innerHTML = CAT_SIDE_SVG;
  front.append(side);
  const cat = h('div', { class: `ch-cat${coat === STRAY ? ' stray' : ''}` }, front);
  cat.style.setProperty('--fur', coat.fur);
  cat.style.setProperty('--belly', coat.belly);
  cat.style.setProperty('--mark', coat.mark);
  cat.style.setProperty('--eye', coat.eye ?? '#1f2a24');

  let i = 0;
  let held = -1;
  let timer = 0;
  const buttons = ACTS.map(([, label], k) =>
    h('button', { onClick: () => (held === k ? ((held = -1), play(0)) : ((held = k), play(k))) }, label),
  );
  const play = (k: number) => {
    i = k;
    cat.className = `ch-cat${coat === STRAY ? ' stray' : ''} ${ACTS[k]![0]}`.trim();
    buttons.forEach((b, n) => b.classList.toggle('on', n === k));
    clearTimeout(timer);
    // The exhibit's own loop: it stops once the gallery has moved on.
    timer = window.setTimeout(() => {
      if (!el.isConnected) return;
      play(held >= 0 ? held : (i + 1) % ACTS.length);
    }, ACTS[k]![2] * 1000);
  };
  cat.addEventListener('click', () => ctx.bus.emit('juice', { sound: 'meow' }));
  const el = h('div', { class: 'gx-cat' }, h('div', { class: 'gx-cat-stage' }, cat), h('div', { class: 'gx-acts' }, ...buttons));
  requestAnimationFrame(() => play(0));
  return el;
}
