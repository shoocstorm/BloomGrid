import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import type { TourStop } from './tour';

/**
 * The city tour's screen (D-145): letterbox bars, a caption card per stop (kicker, name, facts, "3 / 14"), a thin
 * progress line and a small control strip (pause, next stop, end) that also serves touch screens. The HUD itself is
 * hidden while touring (`#hud.touring`).
 */
export function createTourView(on: { pause(): void; next(): void; end(): void }) {
  const kicker = h('div', { class: 'k' });
  const title = h('div', { class: 't' });
  const facts = h('div', { class: 'f' });
  const count = h('div', { class: 'n' });
  const card = h('div', { class: 'tour-cap' }, kicker, title, facts, count);
  const fill = h('i');
  const prog = h('div', { class: 'tour-prog' }, fill);
  const pauseG = h('span', { class: 'g' }, icon('pause'));
  const btn = (g: Node, label: string, run: () => void) =>
    h('button', { class: 'tour-btn', title: label, 'aria-label': label, onClick: run }, g);
  const pauseBtn = btn(pauseG, 'Pause the tour (Space)', on.pause);
  const ctl = h(
    'div',
    { class: 'tour-ctl' },
    pauseBtn,
    btn(h('span', { class: 'g' }, icon('next')), 'Next stop (Tab or →)', on.next),
    h(
      'button',
      { class: 'tour-btn end', title: 'End the tour (Esc)', onClick: on.end },
      h('span', { class: 'g' }, icon('close')),
      h('span', { class: 'l' }, 'End tour'),
    ),
  );
  const root = h(
    'div',
    { class: 'tour-ui hidden', 'aria-live': 'polite' },
    h('div', { class: 'tour-bar top' }),
    h('div', { class: 'tour-bar bottom' }),
    card,
    prog,
    ctl,
  );
  document.body.append(root);

  return {
    show(open: boolean): void {
      root.classList.toggle('hidden', !open);
      // Lay out the hidden state first, so the bars slide in rather than appear.
      void root.offsetHeight;
      root.classList.toggle('on', open);
      if (!open) card.classList.remove('in');
    },
    caption(s: TourStop, i: number, n: number): void {
      setText(kicker, s.kicker);
      setText(title, s.title);
      setText(facts, s.facts);
      setText(count, s.kind === 'opening' || s.kind === 'finale' ? '' : `${i} / ${n - 2}`);
      card.dataset.kind = s.kind;
      card.classList.add('in');
    },
    leave(): void {
      card.classList.remove('in');
    },
    progress(f: number): void {
      fill.style.transform = `scaleX(${Math.max(0, Math.min(1, f)).toFixed(4)})`;
    },
    paused(p: boolean): void {
      pauseG.replaceChildren(icon(p ? 'play' : 'pause'));
      pauseBtn.title = p ? 'Resume the tour (Space)' : 'Pause the tour (Space)';
      root.classList.toggle('paused', p);
    },
  };
}
