import { Pane } from 'tweakpane';
import type { GameContext } from '@/game/context';
import { QUALITY_TIERS, type QualityTier } from '@/render/Quality';
import { U } from '@/render/uniforms';
import { h } from '@/ui/dom';
import { spawnStressCity } from './stress';
import { allCrises, forecastCrisis } from '@/sim/crises';

/**
 * Tweakpane inspector, split into its own chunk: the debug module imports it on first use so
 * Tweakpane is not parsed at every boot.
 */
export function createInspector(ctx: GameContext): { container: HTMLElement; refresh(): void } {
  const container = h('div', { style: 'position:absolute;right:12px;top:74px;width:280px;display:none' });
  ctx.hud.append(container);
  const pane = new Pane({ title: 'BloomGrid Inspector', container });
  const state = {
    timeOfDay: ctx.city.timeOfDay,
    quality: ctx.quality.tier,
    profile: ctx.systems.profile,
    wind: 1,
    bloom: 0.9,
  };
  pane
    .addBinding(state, 'timeOfDay', { min: 0, max: 0.999, step: 0.001, label: 'time' })
    .on('change', (e) => (ctx.city.timeOfDay = e.value));
  pane
    .addBinding(state, 'quality', {
      options: Object.fromEntries(Object.keys(QUALITY_TIERS).map((k) => [k, k])),
    })
    .on('change', (e) => ctx.services.get('render').setQuality(e.value as QualityTier));
  pane.addBinding(state, 'wind', { min: 0, max: 3 }).on('change', (e) => (U.wind.value = e.value));
  pane
    .addBinding(state, 'bloom', { min: 0, max: 3 })
    .on('change', (e) => (ctx.services.get('render').postfx.strength.value = e.value));
  pane
    .addBinding(state, 'profile', { label: 'profile systems' })
    .on('change', (e) => (ctx.systems.profile = e.value));
  pane.addButton({ title: 'Spawn stress city' }).on('click', () => spawnStressCity(ctx, 2000));
  const drills = pane.addFolder({ title: 'Crisis drills', expanded: false });
  for (const c of allCrises())
    drills
      .addButton({ title: `${c.icon} ${c.name}` })
      .on('click', () => forecastCrisis(ctx.city, c.id, 1.2, 5));
  drills.addButton({ title: 'Bankrupt the city' }).on('click', () => (ctx.city.credits = -8000));
  pane.addButton({ title: 'Skip to night' }).on('click', () => (ctx.city.timeOfDay = 0.85));
  pane.addButton({ title: 'Skip to morning' }).on('click', () => (ctx.city.timeOfDay = 0.3));
  pane.addButton({ title: 'New seed' }).on('click', () => {
    ctx.city.reset(Math.floor(Math.random() * 1e6));
    ctx.commands.clearHistory();
  });
  return {
    container,
    refresh() {
      state.timeOfDay = ctx.city.timeOfDay;
      state.quality = ctx.quality.tier;
      pane.refresh();
    },
  };
}
