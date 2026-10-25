import type { GameModule } from '@/game/context';
import { h } from '@/ui/dom';
import { spawnStressCity } from './stress';
import type { createInspector } from './inspector';

/** Perf overlay (F3) and Tweakpane inspector (`, loaded on first use). */
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
          `scale   ${c.renderer.getPixelRatio().toFixed(2)}`,
          `tick    ${c.city.tick}`,
        ].join('\n');
        if (c.systems.profile) {
          const top = [...c.systems.timings].sort((a, b) => b[1] - a[1]).slice(0, 5);
          perf.textContent += '\n' + top.map(([id, ms]) => `${id.padEnd(22)} ${ms.toFixed(2)}`).join('\n');
        }
      },
    });

    let inspector: Promise<ReturnType<typeof createInspector>> | null = null;
    const toggleInspector = async () => {
      inspector ??= import('./inspector').then((m) => m.createInspector(ctx));
      const { container, refresh } = await inspector;
      refresh();
      container.style.display = container.style.display === 'none' ? 'block' : 'none';
    };

    ctx.input.onKey((e) => {
      if (e.code === 'F3') {
        perf.classList.toggle('hidden');
        return true;
      }
      if (e.code === 'Backquote') {
        void toggleInspector();
        return true;
      }
      return false;
    });
    if (ctx.params.has('perf')) perf.classList.remove('hidden');
    if (ctx.params.has('stress')) spawnStressCity(ctx, Number(ctx.params.get('stress')) || 2000);
  },
};
