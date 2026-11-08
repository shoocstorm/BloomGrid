import type { GameContext } from '@/game/context';
import { DIFFICULTIES } from '@/sim/difficulty';
import { stewardLegacy, type Legacy } from '@/sim/legacy';
import { h, setText } from '@/ui/dom';
import { holoHead, rise } from '@/ui/holo';
import { icon } from '@/ui/icons';

/**
 * The game-over screen: the steward's chronicle. Rank and stars stamp in, the record counts up, a few proud moments
 * and what to try next, then a one-click fresh island (a new fishing hamlet, never the showcase) named after the one
 * that fell. Losing should feel like the end of a chapter worth beating.
 */
const BEST_KEY = 'bloomgrid:legacy-best';

const readBest = (): number => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeBest = (n: number) => {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    /* storage blocked: the best lasts the session */
  }
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

/** "Coralhaven" → "Coralhaven II" → "Coralhaven III": the next island carries the name on. */
export function nextName(name: string): string {
  const m = /^(.*?)\s+([IVX]+)$/.exec(name.trim());
  const base = (m ? m[1]! : name.trim()) || 'New Bloom';
  const n = m ? ROMAN.indexOf(m[2]!) : 1;
  return n > 0 && n + 1 < ROMAN.length ? `${base} ${ROMAN[n + 1]}` : `${base} ${ROMAN[2]}`;
}

const CAUSE: Record<Legacy['cause'], string> = {
  harmony: 'Harmony gave way',
  budget: 'the treasury sank into debt',
  both: 'Harmony gave way and the treasury sank into debt',
  unknown: 'the city stayed in collapse',
};

/** Counts `el` up to `to` (ease-out), starting after `delay` ms. Short timer chain: the engine is paused anyway. */
function countUp(el: HTMLElement, to: number, delay: number, ms = 900): void {
  const t0 = performance.now() + delay;
  setText(el, '0');
  const step = () => {
    if (!el.isConnected) return;
    const k = Math.min(1, Math.max(0, (performance.now() - t0) / ms));
    setText(el, Math.round(to * (1 - (1 - k) ** 3)).toLocaleString());
    if (k < 1) setTimeout(step, 33);
  };
  setTimeout(step, delay);
}

export function gameOver(ctx: GameContext, close: () => void): HTMLElement {
  const city = ctx.city;
  const legacy = stewardLegacy(city, city.seed + city.day);
  const best = readBest();
  const record = legacy.score > best;
  if (record) writeBest(legacy.score);
  const difficulty = city.steward.difficulty;
  const name = legacy.name || 'BloomGrid';
  const next = nextName(name);

  const tiles: [string, number, string][] = [
    ['people', legacy.peakPopulation, 'peak residents'],
    ['calendar', legacy.days, legacy.days === 1 ? 'day' : 'days'],
    ['build', legacy.buildings, 'buildings'],
    ['storm', legacy.crises, legacy.crises === 1 ? 'crisis weathered' : 'crises weathered'],
    ['star', legacy.milestones, 'milestones'],
    ['wave', legacy.wonders, 'wonders risen'],
  ];
  const nums: [HTMLElement, number][] = [];
  const score = h('b', { class: 'ov-score-n' }, '0');

  const busy = (btn: HTMLButtonElement, fn: () => Promise<unknown>) => async () => {
    btn.disabled = true;
    try {
      await fn();
    } finally {
      btn.disabled = false;
    }
  };

  const loadBtn = h('button', { class: 'btn ghost' }, icon('load'), 'Load last save') as HTMLButtonElement;
  loadBtn.addEventListener(
    'click',
    busy(loadBtn, async () => {
      const save = ctx.services.get('save');
      const ok = await ctx.services.get('loader').run('Restoring your last save', async (stage) => {
        const done = (await save.load('slot1', stage)) || (await save.load('autosave', stage));
        if (done) {
          close();
          ctx.engine.speed = 1;
        }
        return done;
      });
      if (!ok) ctx.bus.emit('toast', { text: 'No save found', tone: 'bad' });
    }),
  );
  const sandboxBtn = h(
    'button',
    {
      class: 'btn ghost',
      onClick: () => {
        const st = city.steward;
        st.difficulty = 'sandbox';
        st.failed = false;
        st.failClock = 0;
        ctx.engine.speed = 1;
        close();
        ctx.bus.emit('toast', { text: 'Continuing in Sandbox: no more fail state', tone: 'info' });
      },
    },
    icon('play'),
    'Keep playing in sandbox',
  );
  const wizard = ctx.services.tryGet('wizard');
  const moreBtn = wizard
    ? h('button', { class: 'btn ghost', onClick: () => wizard.open() }, icon('settings'), 'More choices')
    : null;
  const againBtn = h('button', { class: 'btn primary ov-again' }, icon('sparkle'), `Found ${next}`) as HTMLButtonElement;
  againBtn.addEventListener(
    'click',
    busy(againBtn, async () => {
      if (wizard) await wizard.island(next, difficulty);
      else ctx.services.get('crises').newCity();
      close();
    }),
  );

  const scrim = h(
    'div',
    { class: 'modal-scrim ov-scrim' },
    h(
      'section',
      { class: 'modal panel holo crit over', role: 'alertdialog', 'aria-label': 'Steward replaced' },
      holoHead(
        icon('leaf'),
        'Council notice · steward link lost',
        'The council has replaced you',
        `After ${legacy.days} day${legacy.days === 1 ? '' : 's'} as steward of ${name}, ${CAUSE[legacy.cause]} for too long.`,
        'crit',
      ),
      h(
        'div',
        { class: 'ov-rank' },
        h(
          'div',
          { class: 'ov-stars', 'aria-label': `${legacy.stars} of 5 stars` },
          ...[1, 2, 3, 4, 5].map((i) =>
            h('i', { class: i <= legacy.stars ? 'on' : '', style: `--s:${i}` }, icon('star')),
          ),
        ),
        h(
          'div',
          { class: 'ov-title' },
          h('span', { class: 'ov-eyebrow' }, 'Steward rank'),
          h('b', {}, legacy.rank.title),
          h('span', { class: 'ov-line' }, legacy.rank.line),
        ),
        h(
          'div',
          { class: 'ov-score' },
          h('span', { class: 'ov-eyebrow' }, 'Legacy'),
          score,
          record
            ? h('span', { class: 'ov-best new' }, best ? 'New personal best!' : 'First legacy set')
            : h('span', { class: 'ov-best' }, `Best ${best.toLocaleString()}`),
        ),
      ),
      h(
        'div',
        { class: 'over-stats' },
        ...tiles.map(([glyph, n, label]) => {
          const b = h('b', {}, '0');
          nums.push([b, n]);
          return h('div', {}, icon(glyph), b, h('span', {}, label));
        }),
      ),
      legacy.highlights.length
        ? h(
            'div',
            { class: 'ov-block ov-high' },
            h('span', { class: 'ov-eyebrow' }, 'Proud moments'),
            h('ul', {}, ...legacy.highlights.map((t) => h('li', {}, icon('sparkle'), t))),
          )
        : null,
      h(
        'div',
        { class: 'ov-block ov-tips' },
        h('span', { class: 'ov-eyebrow' }, 'Next island, try this'),
        h('ul', {}, ...legacy.lessons.map((t) => h('li', {}, icon('bulb'), t))),
      ),
      h(
        'div',
        { class: 'modal-actions' },
        loadBtn,
        DIFFICULTIES[difficulty].fail ? sandboxBtn : null,
        moreBtn,
        againBtn,
      ),
    ),
  );
  rise(scrim.querySelectorAll('.ov-rank, .over-stats > div, .ov-block, .modal-actions'));
  nums.forEach(([el, n], i) => countUp(el, n, 500 + i * 90));
  countUp(score, legacy.score, 900, 1400);
  setTimeout(() => againBtn.isConnected && againBtn.focus({ preventScroll: true }), 1200);
  return scrim;
}
