import { Pane } from 'tweakpane';
import type { GameModule } from '@/game/context';
import { QUALITY_TIERS, type QualityTier } from '@/render/Quality';
import { U } from '@/render/uniforms';
import { h } from '@/ui/dom';
import { spawnStressCity } from './stress';
import { allCrises, forecastCrisis } from '@/sim/crises';

/** Perf overlay (F3) and Tweakpane inspector (`). */
export const debugModule: GameModule = {
  id: 'debug',
  deps: ['world', 'construction'],
  init(ctx) {
    const perf = h('div', { class: 'perf panel hidden' });
    ctx.hud.append(perf);
    let timer = 0;
    ctx.systems.add({
      id: 'debug.perf',
      phase: 'render',
      order: 200,
      update(c, f) {
        if (perf.classList.contains('hidden')) return;
        timer += f.dt;
        if (timer < 0.25) return;
        timer = 0;
        const info = c.renderer.info.render;
        const flora = c.services.get('world').flora;
        perf.textContent = [
          `${c.isWebGPU ? 'WebGPU' : 'WebGL2'} · ${c.quality.tier}`,
          `fps     ${c.engine.fps.toFixed(0)}`,
          `cpu ms  ${c.engine.frameMs.toFixed(2)}  (sim ${c.engine.simMs.toFixed(2)})`,
          `draws   ${info.drawCalls}`,
          `tris    ${(info.triangles / 1000).toFixed(0)}k`,
          `inst    ${c.instancer.instanceCount.toLocaleString()} in ${c.instancer.batchCount} batches`,
          `flora   ${flora.instanceCount.toLocaleString()}`,
          `bldgs   ${c.city.stats.buildings}`,
          `scale   ${(c.renderer.getPixelRatio()).toFixed(2)}`,
          `tick    ${c.city.tick}`,
        ].join('\n');
        if (c.systems.profile) {
          const top = [...c.systems.timings].sort((a, b) => b[1] - a[1]).slice(0, 5);
          perf.textContent += '\n' + top.map(([id, ms]) => `${id.padEnd(22)} ${ms.toFixed(2)}`).join('\n');
        }
      },
    });

    const container = h('div', { style: 'position:absolute;right:12px;top:74px;width:280px;display:none' });
    ctx.hud.append(container);
    const pane = new Pane({ title: 'BloomGrid Inspector', container });
    const state = { timeOfDay: ctx.city.timeOfDay, quality: ctx.quality.tier, profile: false, wind: 1, bloom: 0.9 };
    pane.addBinding(state, 'timeOfDay', { min: 0, max: 0.999, step: 0.001, label: 'time' }).on('change', (e) => (ctx.city.timeOfDay = e.value));
    pane
      .addBinding(state, 'quality', { options: Object.fromEntries(Object.keys(QUALITY_TIERS).map((k) => [k, k])) })
      .on('change', (e) => ctx.services.get('render').setQuality(e.value as QualityTier));
    pane.addBinding(state, 'wind', { min: 0, max: 3 }).on('change', (e) => (U.wind.value = e.value));
    pane.addBinding(state, 'bloom', { min: 0, max: 3 }).on('change', (e) => (ctx.services.get('render').postfx.strength.value = e.value));
    pane.addBinding(state, 'profile', { label: 'profile systems' }).on('change', (e) => (ctx.systems.profile = e.value));
    pane.addButton({ title: 'Spawn stress city' }).on('click', () => spawnStressCity(ctx, 2000));
    const drills = pane.addFolder({ title: 'Crisis drills', expanded: false });
    for (const c of allCrises()) drills.addButton({ title: `${c.icon} ${c.name}` }).on('click', () => forecastCrisis(ctx.city, c.id, 1.2, 5));
    drills.addButton({ title: 'Bankrupt the city' }).on('click', () => (ctx.city.credits = -8000));
    pane.addButton({ title: 'Skip to night' }).on('click', () => (ctx.city.timeOfDay = 0.85));
    pane.addButton({ title: 'Skip to morning' }).on('click', () => (ctx.city.timeOfDay = 0.3));
    pane.addButton({ title: 'New seed' }).on('click', () => {
      ctx.city.reset(Math.floor(Math.random() * 1e6));
      ctx.commands.clearHistory();
    });

    ctx.input.onKey((e) => {
      if (e.code === 'F3') {
        perf.classList.toggle('hidden');
        return true;
      }
      if (e.code === 'Backquote') {
        state.timeOfDay = ctx.city.timeOfDay;
        pane.refresh();
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
        return true;
      }
      return false;
    });
    if (ctx.params.has('perf')) perf.classList.remove('hidden');
    if (ctx.params.has('stress')) spawnStressCity(ctx, Number(ctx.params.get('stress')) || 2000);
  },
};
