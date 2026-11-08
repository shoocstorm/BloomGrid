import { closeX } from '@/ui/closeX';
import type { GameContext, GameModule } from '@/game/context';
import { forecastCrisis, getCrisis } from '@/sim/crises';
import { DIFFICULTIES, type DifficultyId } from '@/sim/difficulty';
import { FAIL_SECONDS } from '@/sim/steward';
import { gameOver } from './GameOver';
import { foundCityStaged } from '@/game/newCity';
import { openingView } from '@/game/opening';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { holoHead, rise } from '@/ui/holo';
import { Weather } from './Weather';
import './crises.css';

/** Opens the New City dialog (difficulty + seed). Exposed as a service for Settings and game over. */
function newCityDialog(ctx: GameContext, onDone?: () => void): void {
  let choice: DifficultyId = ctx.city.steward.difficulty;
  const seedInput = h('input', { type: 'number', value: String(Math.floor(Math.random() * 1e6)), class: 'nc-seed' }) as HTMLInputElement;
  const close = () => scrim.remove();
  const scrim = h(
    'div',
    { class: 'modal-scrim' },
    h(
      'section',
      { class: 'modal panel holo', role: 'dialog', 'aria-label': 'Found a new city' },
      holoHead(
        icon('sparkle'),
        'Steward console · new charter',
        'Found a new city',
        'A fresh island and founding districts. Your current city will be replaced (save it first if you want to keep it).',
      ),
      h(
        'div',
        { class: 'nc-diffs' },
        ...(Object.values(DIFFICULTIES) as (typeof DIFFICULTIES)[DifficultyId][]).map((d) => {
          const input = h('input', { type: 'radio', name: 'nc-diff', value: d.id }) as HTMLInputElement;
          input.checked = d.id === choice;
          input.addEventListener('change', () => (choice = d.id));
          return h('label', { class: 'nc-diff' }, input, h('b', {}, d.label), h('span', {}, d.description));
        }),
      ),
      h('label', { class: 'nc-row' }, h('span', {}, 'Island seed'), seedInput),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onClick: close }, 'Cancel'),
        h(
          'button',
          {
            class: 'btn primary',
            onClick: () => {
              close();
              const fly = () => {
                const v = openingView(ctx.city);
                ctx.cameraCtl.intro(v.x, v.z, v.distance, 6, v);
              };
              void ctx.services
                .get('loader')
                .run(
                  'Founding a new city',
                  async (stage) => {
                    await foundCityStaged(ctx, Number(seedInput.value) || 1, choice, 'fresh-island', stage);
                    ctx.engine.speed = 1;
                  },
                  fly,
                )
                .then(() => {
                  ctx.bus.emit('toast', { text: `A new city is founded (${DIFFICULTIES[choice].label})`, tone: 'ok' });
                  onDone?.();
                });
            },
          },
          'Found city',
        ),
      ),
    ),
  );
  rise(scrim.querySelectorAll('.nc-diff, .nc-row, .modal-actions'));
  ctx.hud.append(scrim);
}

declare module '@/core/Services' {
  interface GameServices {
    crises: { newCity(): void };
  }
}

/**
 * Crises & stewardship UI: weather, crisis banner with countdown and prep advice, the council's
 * fail-clock warning, the "Steward replaced" screen, and the New City dialog.
 */
export const crisesModule: GameModule = {
  id: 'crises',
  deps: ['hud', 'world'],
  init(ctx) {
    const weather = new Weather(ctx, ctx.scene);
    ctx.systems.add({ id: 'crises.weather', phase: 'sync', order: 5, update: (_c, f) => weather.update(f.dt) });
    // The New Game wizard when present (name, fresh island or showcase; D-072), else the plain dialog.
    ctx.services.provide('crises', { newCity: () => (ctx.services.tryGet('wizard') ? ctx.services.get('wizard').open() : newCityDialog(ctx)) });
    // ?drill=<crisis id> starts a crisis two seconds after boot (testing, screenshots).
    const drill = ctx.params.get('drill');
    if (drill) forecastCrisis(ctx.city, drill, Number(ctx.params.get('severity')) || 1.2, 2);

    // Banner.
    const banner = h('div', { class: 'crisis-banner' });
    // Cards and the council warning close with ✕ (D-128): a card stays closed for that crisis, the warning until
    // the council's clock resets.
    const closedCrises = new Set<number>();
    let warnClosed = false;
    const warnText = h('span');
    const warn = h(
      'div',
      { class: 'fail-warn hidden' },
      warnText,
      closeX('the warning', () => {
        warnClosed = true;
        warn.classList.add('hidden');
      }),
    );
    ctx.hud.append(h('div', { class: 'crisis-wrap' }, warn, banner));
    let cards = new Map<number, { el: HTMLElement; status: HTMLElement; bar: HTMLElement }>();

    const render = () => {
      const { city } = ctx;
      const live = new Set<number>();
      for (const c of city.steward.crises) {
        live.add(c.id);
        let card = cards.get(c.id);
        const d = getCrisis(c.def);
        if (!card) {
          const status = h('span', { class: 'cr-status' });
          const bar = h('i');
          const el = h(
            'div',
            { class: 'crisis panel' },
            h(
              'div',
              { class: 'cr-head' },
              h('span', { class: 'cr-icon' }, icon(d.icon)),
              h('b', {}, d.name),
              status,
              closeX(`the ${d.name} card`, () => {
                closedCrises.add(c.id);
                el.classList.add('hidden');
              }),
            ),
            h('div', { class: 'cr-bar' }, bar),
            h('div', { class: 'cr-text' }),
            c.x !== undefined || c.def === 'grid-failure' || c.def === 'blight'
              ? h('button', { class: 'cr-show', onClick: () => c.x !== undefined && ctx.cameraCtl.flyTo(c.x, c.z!, 60) }, '⌖ Show')
              : null,
          );
          card = { el, status, bar };
          cards.set(c.id, card);
          banner.append(el);
        }
        const forecast = c.phase === 'forecast';
        card.el.classList.toggle('active', !forecast);
        const secs = Math.max(0, Math.ceil(((forecast ? c.startTick : c.endTick) - city.tick) / 10));
        setText(card.status, forecast ? `arrives in ${secs}s` : `${secs}s left`);
        const span = forecast ? d.lead * 10 : c.endTick - c.startTick;
        const done = forecast ? 1 - (c.startTick - city.tick) / span : (city.tick - c.startTick) / span;
        card.bar.style.transform = `scaleX(${Math.min(1, Math.max(0, done))})`;
        setText(card.el.querySelector('.cr-text') as HTMLElement, forecast ? `Prepare: ${d.prep}` : d.description);
      }
      for (const [id, card] of cards)
        if (!live.has(id)) {
          card.el.remove();
          cards.delete(id);
        }
      if (!live.size) cards = new Map();

      const st = city.steward;
      if (st.failClock <= 0) warnClosed = false;
      warn.classList.toggle('hidden', st.failClock <= 0 || st.failed || warnClosed);
      if (st.failClock > 0) {
        const why = [city.pulse.tiers.harmony === 4 && 'harmony has collapsed', city.pulse.tiers.budget === 4 && 'credits are deep in debt']
          .filter(Boolean)
          .join(' and ');
        setText(warnText, `⚠ The council is losing confidence${why ? ` (${why})` : ''}: ${Math.max(0, FAIL_SECONDS - st.failClock)}s to turn it around`);
      }
    };
    let timer = 0;
    ctx.systems.add({
      id: 'crises.banner',
      phase: 'render',
      order: 140,
      update(_c, f) {
        timer += f.dt;
        if (timer < 0.25) return;
        timer = 0;
        render();
      },
    });

    ctx.bus.on('crisis:forecast', ({ crisis }) => ctx.bus.emit('toast', { text: `${getCrisis(crisis.def).icon} ${getCrisis(crisis.def).name} forecast`, tone: 'info' }));
    ctx.bus.on('crisis:start', ({ crisis }) => ctx.bus.emit('toast', { text: `${getCrisis(crisis.def).icon} ${getCrisis(crisis.def).name} has begun`, tone: 'bad' }));
    ctx.bus.on('sea:rise', ({ level }) => ctx.bus.emit('toast', { text: `🌊 The sea has risen ${level.toFixed(1)} m: check the Flood risk lens`, tone: 'bad' }));
    ctx.bus.on('crisis:end', ({ crisis }) => ctx.bus.emit('toast', { text: `${getCrisis(crisis.def).name} has passed`, tone: 'ok' }));
    ctx.bus.on('city:reset', () => {
      banner.replaceChildren();
      cards = new Map();
    });

    // Game over: the steward's chronicle (rank, record, highlights, lessons) and a one-click fresh island.
    let over: HTMLElement | null = null;
    const dismiss = () => {
      over?.remove();
      over = null;
    };
    for (const ev of ['city:reset', 'load:done'] as const) ctx.bus.on(ev, dismiss);
    ctx.bus.on('steward:replaced', () => {
      ctx.engine.speed = 0;
      dismiss();
      over = gameOver(ctx, dismiss);
      ctx.hud.append(over);
    });
  },
};
