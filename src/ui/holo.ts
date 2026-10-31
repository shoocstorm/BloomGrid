import { h } from './dom';

/**
 * The welcome card's "steward link" idiom shared by dialogs and panels (`.holo` in theme.css): an emblem
 * with a one-shot ring pulse, a coded eyebrow with a status LED, a gradient title. Entrance animations
 * replay whenever the panel is shown again (display: none restarts them) and use transform/opacity only (§7½).
 */
export function holoHead(glyph: Node, eyebrow: string, title: string, sub?: string, tone: '' | 'crit' = ''): HTMLElement {
  return h(
    'div',
    { class: `hh ${tone}` },
    h('div', { class: 'hh-emblem' }, h('span', { class: 'hh-ring' }), h('span', { class: 'hh-gem' }, glyph)),
    h(
      'div',
      { class: 'hh-text' },
      h('div', { class: 'hh-eyebrow' }, h('i', { class: 'hh-led' }), eyebrow),
      h('div', { class: 'hh-title' }, title),
      sub ? h('div', { class: 'hh-sub' }, sub) : null,
    ),
  );
}

/** Marks elements to rise in one after another (`.rise`, delay from `--i`) after the header. */
export function rise<T extends Element>(els: Iterable<T>, from = 0): void {
  let i = from;
  for (const el of els) {
    el.classList.add('rise');
    (el as unknown as HTMLElement).style.setProperty('--i', String(i++));
  }
}
