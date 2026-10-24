import type { GameContext, GameModule } from '@/game/context';
import { forecastCrisis, getCrisis } from '@/sim/crises';
import { DIFFICULTIES, type DifficultyId } from '@/sim/difficulty';
import { FAIL_SECONDS } from '@/sim/steward';
import { foundCity } from '@/game/newCity';
import { h, setText } from '@/ui/dom';
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
      { class: 'modal panel', role: 'dialog', 'aria-label': 'Found a new city' },
      h('h2', {}, 'Found a new city'),
      h('p', { class: 'modal-sub' }, 'A fresh island and founding districts. Your current city will be replaced (save it first if you want to keep it).'),
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
              foundCity(ctx, Number(seedInput.value) || 1, choice);
              ctx.engine.speed = 1;
              ctx.cameraCtl.intro(ctx.city.size * 0.52, ctx.city.size * 0.66, 60);
              ctx.bus.emit('toast', { text: `A new city is founded (${DIFFICULTIES[choice].label})`, tone: 'ok' });
              onDone?.();
            },
          },
          'Found city',
        ),
      ),
    ),
  );
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
    ctx.services.provide('crises', { newCity: () => newCityDialog(ctx) });
    // ?drill=<crisis id> starts a crisis two seconds after boot (testing, screenshots).
    const drill = ctx.params.get('drill');
    if (drill) forecastCrisis(ctx.city, drill, Number(ctx.params.get('severity')) || 1.2, 2);

    // Banner.
    const banner = h('div', { class: 'crisis-banner' });
    const warn = h('div', { class: 'fail-warn hidden' });
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
            h('div', { class: 'cr-head' }, h('span', { class: 'cr-icon' }, d.icon), h('b', {}, d.name), status),
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
      warn.classList.toggle('hidden', st.failClock <= 0 || st.failed);
      if (st.failClock > 0) {
        const why = [city.pulse.tiers.harmony === 4 && 'harmony has collapsed', city.pulse.tiers.budget === 4 && 'the treasury is deep in debt']
          .filter(Boolean)
          .join(' and ');
        setText(warn, `⚠ The council is losing confidence${why ? ` (${why})` : ''}: ${Math.max(0, FAIL_SECONDS - st.failClock)}s to turn it around`);
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
    ctx.bus.on('crisis:end', ({ crisis }) => ctx.bus.emit('toast', { text: `${getCrisis(crisis.def).name} has passed`, tone: 'ok' }));
    ctx.bus.on('city:reset', () => {
      banner.replaceChildren();
      cards = new Map();
    });

    // Game over.
    ctx.bus.on('steward:replaced', ({ day, peakPopulation }) => {
      ctx.engine.speed = 0;
      const save = ctx.services.get('save');
      const scrim = h('div', { class: 'modal-scrim' });
      const close = () => scrim.remove();
      scrim.append(
        h(
          'section',
          { class: 'modal panel over', role: 'alertdialog', 'aria-label': 'Steward replaced' },
          h('div', { class: 'over-icon' }, '❦'),
          h('h2', {}, 'The council has replaced you'),
          h('p', { class: 'modal-sub' }, `After ${day} day${day === 1 ? '' : 's'} of stewardship the city fell into collapse for too long.`),
          h('div', { class: 'over-stats' }, h('div', {}, h('b', {}, peakPopulation.toLocaleString()), h('span', {}, 'peak residents')), h('div', {}, h('b', {}, String(day)), h('span', {}, 'days'))),
          h(
            'div',
            { class: 'modal-actions' },
            h(
              'button',
              {
                class: 'btn ghost',
                onClick: async () => {
                  if ((await save.load('slot1')) || (await save.load('autosave'))) {
                    close();
                    ctx.engine.speed = 1;
                  } else ctx.bus.emit('toast', { text: 'No save found', tone: 'bad' });
                },
              },
              'Load last save',
            ),
            h(
              'button',
              {
                class: 'btn ghost',
                onClick: () => {
                  const st = ctx.city.steward;
                  st.difficulty = 'sandbox';
                  st.failed = false;
                  st.failClock = 0;
                  ctx.engine.speed = 1;
                  close();
                  ctx.bus.emit('toast', { text: 'Continuing in Sandbox: no more fail state', tone: 'info' });
                },
              },
              'Continue in sandbox',
            ),
            h('button', { class: 'btn primary', onClick: () => (close(), newCityDialog(ctx)) }, 'Found a new city'),
          ),
        ),
      );
      ctx.hud.append(scrim);
    });
  },
};
