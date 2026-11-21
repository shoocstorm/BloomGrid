import type { GameModule } from '@/game/context';
import {
  CHAPTERS,
  PAGES,
  endingBlock,
  foundPages,
  getPage,
  pageFound,
  type ChroniclePage,
} from '@/sim/chronicle';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import './chronicle.css';

/**
 * The Chronicle (D-192): the island's history, as a Build panel tab. Chapters in the island's order; pages found
 * are read in full, pages still to find show their hint, and the last page (The Flame) carries the city's one
 * choice (`chronicleEnding`). A page found raises a toast (with a Read button: the tab opens on it), earns the
 * "Old stories" First, and opens its chapter's Seedvault guide (`unlock` front matter, gated here). The canon is
 * `docs/lore/bible.md`; pages and triggers are data in `sim/chronicle.ts`.
 */
export const chronicleModule: GameModule = {
  id: 'chronicle',
  deps: ['build', 'hud', 'knowledge'],
  init(ctx) {
    const { city } = ctx;
    const el = h('div', { class: 'chronicle' });
    const build = ctx.services.get('build');
    const tab = build.addTab('chronicle', 'Chronicle', 'book', el);
    let key = '';
    /** Page to scroll to on the next render (a toast's Read). */
    let focus: string | null = null;

    // The Seedvault's history shelf opens a chapter at a time, with the page that begins it.
    const kb = ctx.services.get('knowledge').base;
    kb.setGate((d) => !d.unlock || d.unlock.some((id) => pageFound(ctx.city, id)));

    const page = (p: ChroniclePage, found: boolean): HTMLElement => {
      if (!found)
        return h(
          'div',
          { class: 'cr-page locked' },
          h('b', {}, 'A page not yet found'),
          h('p', { class: 'gl-note' }, p.hint),
        );
      const card = h(
        'article',
        { class: 'cr-page', 'data-page': p.id },
        h('b', {}, p.title),
        ...p.text.map((t) => h('p', {}, t)),
      );
      if (p.id === 'flame') {
        const block = endingBlock(city);
        if (city.chronicle.ending)
          card.append(h('p', { class: 'gl-note' }, 'The city has chosen. Its answer is the next page.'));
        else if (!block)
          card.append(
            h('p', { class: 'cr-ask' }, 'What should the city do with the flame?'),
            h(
              'div',
              { class: 'cr-choices' },
              h(
                'button',
                {
                  class: 'btn',
                  title: 'Run a line to the colonnade and let the old mind speak',
                  onClick: () => ctx.commands.execute('chronicleEnding', { ending: 'relit' }, false),
                },
                icon('bulb'),
                h('span', {}, 'Relight it'),
              ),
              h(
                'button',
                {
                  class: 'btn',
                  title: 'The island has one mind already: let the flame go out',
                  onClick: () => ctx.commands.execute('chronicleEnding', { ending: 'rest' }, false),
                },
                icon('moon'),
                h('span', {}, 'Lay it to rest'),
              ),
            ),
          );
      }
      return card;
    };

    const render = (force = false) => {
      const found = new Set(foundPages(city).map((p) => p.id));
      const k = `${city.growth.progression ? 1 : 0}|${[...found].join()}|${city.chronicle.ending ?? ''}`;
      if (!force && k === key) return;
      if (!force && el.querySelector('button:hover')) return;
      key = k;
      const total = PAGES.filter((p) => p.when).length;
      const count = PAGES.filter((p) => p.when && found.has(p.id)).length;
      el.replaceChildren(
        h(
          'p',
          { class: 'gl-note cr-intro' },
          city.growth.progression
            ? `The island is older than the city. ${count} of ${total} pages of its history found; the rest wait for what the city does and lives through.`
            : 'Every page of the island’s history is open in this city. Found a fresh island to discover them one by one.',
        ),
        ...CHAPTERS.flatMap((ch) => {
          const pages = PAGES.filter((p) => p.chapter === ch.id && (p.when || found.has(p.id)));
          const have = pages.filter((p) => found.has(p.id)).length;
          if (!have) return [];
          return [
            h(
              'div',
              { class: 'pulse-title cr-chapter' },
              icon(ch.icon),
              h('span', {}, ch.name),
              h('span', { class: 'cr-count' }, `${have}/${pages.length}`),
            ),
            ...pages.map((p) => page(p, found.has(p.id))),
          ];
        }),
        ...(CHAPTERS.some((ch) => !PAGES.some((p) => p.chapter === ch.id && found.has(p.id)))
          ? [h('p', { class: 'gl-note cr-more' }, 'More chapters are still to be found.')]
          : []),
      );
      if (focus) {
        // Scroll only the panel's own scroller: `scrollIntoView` would scroll the page and push the city off screen.
        const target = el.querySelector<HTMLElement>(`[data-page="${focus}"]`);
        let box: HTMLElement | null = el;
        while (
          box &&
          !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))
        )
          box = box.parentElement;
        if (target && box)
          box.scrollTop += target.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
        focus = null;
      }
    };

    let unread = 0;
    const badge = () => tab.setBadge(unread ? String(unread) : '', unread ? 'warn' : '');
    let wasShown = false;
    ctx.systems.add({
      id: 'chronicle',
      phase: 'render',
      order: 113,
      update() {
        const now = tab.selected;
        if (now && !wasShown) {
          unread = 0;
          badge();
          render();
        }
        wasShown = now;
      },
    });

    ctx.bus.on('chronicle:found', ({ id, title }) => {
      key = '';
      kb.refresh();
      if (tab.selected) render(true);
      if (ctx.loading) return;
      if (id !== 'keeper') ctx.services.tryGet('juice')?.earn('chronicle');
      unread++;
      badge();
      const p = getPage(id);
      ctx.bus.emit('toast', {
        text: `A page of the Chronicle: ${p ? p.title : title}. Build → Chronicle to read it.`,
        tone: 'info',
      });
      focus = id;
    });
    for (const ev of ['city:reset', 'load:done'] as const)
      ctx.bus.on(ev, () => {
        key = '';
        unread = 0;
        badge();
        kb.refresh();
        render(true);
      });
    render(true);
  },
};
