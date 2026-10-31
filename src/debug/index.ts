import type { GameModule } from '@/game/context';
import { h, setText } from '@/ui/dom';
import { holoHead } from '@/ui/holo';
import { icon } from '@/ui/icons';
import { spawnStressCity } from './stress';
import type { createInspector } from './inspector';

/** Draw-call budget (AGENTS.md §3.7): the meter on the Draws tile fills toward it. */
const DRAW_BUDGET = 300;
/** FPS samples kept for the sparkline (4 Hz → 12 s). */
const SPARK = 48;

/** Perf overlay (F3, a telemetry panel) and Tweakpane inspector (`, loaded on first use). */
export const debugModule: GameModule = {
  id: 'debug',
  deps: ['world', 'construction'],
  init(ctx) {
    const tile = (ico: string, label: string) => {
      const v = h('b');
      const s = h('span', { class: 'pf-sub' });
      const el = h('div', { class: 'pf-tile' }, h('span', { class: 'pf-k' }, icon(ico), label), v, s);
      return { el, v, s };
    };
    const fps = h('b', { class: 'pf-fps' });
    const backend = h('span', { class: 'pf-chip' });
    const spark = h('canvas', { class: 'pf-spark', width: 440, height: 64 }) as HTMLCanvasElement;
    const t = {
      cpu: tile('chip', 'CPU ms'),
      draws: tile('layers', 'Draws'),
      tris: tile('network', 'Triangles'),
      inst: tile('build', 'Instances'),
      flora: tile('leaf', 'Flora'),
      bldgs: tile('house', 'Buildings'),
      scale: tile('maximize', 'Pixel ratio'),
      tick: tile('pause', 'Sim tick'),
    };
    const meter = h('i');
    t.draws.el.append(h('span', { class: 'pf-meter' }, meter));
    const prof = h('div', { class: 'pf-prof' });
    const perf = h(
      'div',
      { class: 'perf panel holo hidden' },
      holoHead(icon('pulse'), 'Telemetry · F3', 'Performance'),
      h('div', { class: 'pf-hero' }, h('div', { class: 'pf-big' }, fps, h('span', {}, 'fps')), backend, spark),
      h('div', { class: 'pf-grid' }, ...Object.values(t).map((x) => x.el)),
      prof,
    );
    ctx.hud.append(perf);
    const samples: number[] = [];
    const g = spark.getContext('2d')!;
    const drawSpark = () => {
      const { width: w, height: hh } = spark;
      g.clearRect(0, 0, w, hh);
      const y = (v: number) => hh - 4 - (Math.min(v, 120) / 120) * (hh - 8);
      g.strokeStyle = 'rgba(95, 242, 218, 0.18)';
      g.lineWidth = 1;
      g.setLineDash([4, 4]);
      for (const ref of [60, 30]) {
        g.beginPath();
        g.moveTo(0, y(ref));
        g.lineTo(w, y(ref));
        g.stroke();
      }
      g.setLineDash([]);
      if (samples.length < 2) return;
      const step = w / (SPARK - 1);
      const x0 = w - (samples.length - 1) * step;
      g.beginPath();
      samples.forEach((v, i) => (i ? g.lineTo(x0 + i * step, y(v)) : g.moveTo(x0, y(v))));
      g.strokeStyle = '#5ff2da';
      g.lineWidth = 2.5;
      g.stroke();
      g.lineTo(w, hh);
      g.lineTo(x0, hh);
      g.closePath();
      g.fillStyle = 'rgba(95, 242, 218, 0.12)';
      g.fill();
    };
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
        const rate = c.engine.fps;
        setText(fps, rate.toFixed(0));
        perf.dataset.tone = rate >= 55 ? 'good' : rate >= 30 ? 'warn' : 'bad';
        setText(backend, `${c.isWebGPU ? 'WebGPU' : 'WebGL2'} · ${c.quality.tier}`);
        samples.push(rate);
        if (samples.length > SPARK) samples.shift();
        drawSpark();
        setText(t.cpu.v, c.engine.frameMs.toFixed(2));
        setText(t.cpu.s, `sim ${c.engine.simMs.toFixed(2)}`);
        setText(t.draws.v, String(info.drawCalls));
        setText(t.draws.s, `budget ${DRAW_BUDGET}`);
        meter.style.transform = `scaleX(${Math.min(1, info.drawCalls / DRAW_BUDGET)})`;
        t.draws.el.classList.toggle('bad', info.drawCalls > DRAW_BUDGET);
        setText(t.tris.v, `${(info.triangles / 1000).toFixed(0)}k`);
        setText(t.inst.v, c.instancer.instanceCount.toLocaleString());
        setText(t.inst.s, `${c.instancer.batchCount} batches`);
        setText(t.flora.v, c.services.get('world').flora.instanceCount.toLocaleString());
        setText(t.bldgs.v, c.city.stats.buildings.toLocaleString());
        setText(t.scale.v, c.renderer.getPixelRatio().toFixed(2));
        setText(t.tick.v, c.city.tick.toLocaleString());
        if (c.systems.profile) {
          const top = [...c.systems.timings].sort((a, b) => b[1] - a[1]).slice(0, 5);
          prof.replaceChildren(
            h('div', { class: 'pf-prof-h' }, 'Hottest systems · ms'),
            ...top.map(([id, ms]) => h('div', { class: 'pf-row' }, h('span', {}, id), h('b', {}, ms.toFixed(2)))),
          );
        } else if (prof.childElementCount) prof.replaceChildren();
      },
    });

    let inspector: Promise<ReturnType<typeof createInspector>> | null = null;
    const toggleInspector = async () => {
      inspector ??= import('./inspector').then((m) => m.createInspector(ctx));
      const { container, refresh } = await inspector;
      refresh();
      container.classList.toggle('hidden');
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
