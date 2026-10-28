import { Color } from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { allOverlays, getOverlay } from '@/sim/overlays';
import { overlayTexture, setOverlaySmooth } from '@/render/materials/overlay';
import { U } from '@/render/uniforms';
import { h } from '@/ui/dom';
import './overlays.css';

export interface OverlayService {
  readonly active: string | null;
  set(id: string | null): void;
}

declare module '@/core/Services' {
  interface GameServices {
    overlays: OverlayService;
  }
}

declare module '@/core/EventBus' {
  interface GameEvents {
    'overlay:changed': { id: string | null };
  }
}

const LOW = new Color(0xff5a6e);
const MID = new Color(0xffd166);
const HIGH = new Color(0x3ccf8e);

/**
 * Data lenses: colour the whole city by a metric (power, water, pollution, ecology,
 * desirability, highway access). Values come from `sim/overlays.ts` and are uploaded to a
 * per-tile texture that every material samples; the blend is animated.
 */
export const overlaysModule: GameModule = {
  id: 'overlays',
  deps: ['hud'],
  init(ctx) {
    const { city } = ctx;
    let active: string | null = null;
    let target = 0;
    let value = new Float32Array(0);
    let mask = new Uint8Array(0);
    const data = overlayTexture.image.data as Uint8Array;

    const refresh = () => {
      if (!active) return;
      const spec = getOverlay(active)!;
      const n = city.grid.w * city.grid.h;
      if (value.length !== n) {
        value = new Float32Array(n);
        mask = new Uint8Array(n);
      }
      spec.compute(city, city.fields, value, mask);
      const tw = overlayTexture.image.width;
      for (let z = 0; z < city.grid.h; z++)
        for (let x = 0; x < city.grid.w; x++) {
          const i = z * city.grid.w + x;
          const o = (z * tw + x) * 4;
          data[o] = Math.round(Math.min(1, Math.max(0, value[i]!)) * 255);
          data[o + 1] = mask[i]! * 255;
        }
      overlayTexture.needsUpdate = true;
    };

    // Lens bar + legend.
    const buttons = new Map<string, HTMLElement>();
    const legendLo = h('span');
    const legendHi = h('span');
    const legendBar = h('i');
    const legend = h('div', { class: 'lens-legend' }, legendLo, legendBar, legendHi);
    const bar = h('div', { class: 'lens-bar panel' });
    for (const o of allOverlays()) {
      const b = h('button', { class: 'lens', title: `${o.label} lens`, onClick: () => service.set(active === o.id ? null : o.id) }, h('span', { class: 'g' }, o.icon), h('span', { class: 'l' }, o.label));
      buttons.set(o.id, b);
      bar.append(b);
    }
    bar.append(h('kbd', { title: 'Cycle lenses' }, 'L'));
    // Phones fold the lens bar behind a toggle (a HUD sheet); desktops hide the toggle.
    const wrap = h('div', { class: 'lens-wrap' });
    const toggle = h('button', { class: 'lens-toggle panel', title: 'Data lenses', onClick: () => wrap.classList.toggle('collapsed') }, h('span', { class: 'g' }, '◐'), h('span', { class: 'l' }, 'Lens'));
    wrap.append(toggle, bar, legend);
    ctx.hud.append(wrap);
    ctx.services.get('hud').sheet(wrap);

    const service: OverlayService = {
      get active() {
        return active;
      },
      set(id) {
        active = id;
        target = id ? 1 : 0;
        for (const [k, b] of buttons) b.classList.toggle('on', k === id);
        legend.classList.toggle('show', !!id);
        if (id) {
          const spec = getOverlay(id)!;
          setOverlaySmooth(spec.smooth);
          U.ovLow.value.copy(spec.invert ? HIGH : LOW);
          U.ovMid.value.copy(MID);
          U.ovHigh.value.copy(spec.invert ? LOW : HIGH);
          legendLo.textContent = spec.legend[0];
          legendHi.textContent = spec.legend[1];
          legendBar.style.background = `linear-gradient(90deg, #${U.ovLow.value.getHexString()}, #${MID.getHexString()}, #${U.ovHigh.value.getHexString()})`;
          refresh();
        }
        ctx.bus.emit('overlay:changed', { id });
      },
    };
    ctx.services.provide('overlays', service);

    ctx.bus.on('stats:updated', refresh);
    ctx.bus.on('city:reset', () => service.set(null));
    ctx.input.onKey((e) => {
      if (e.code !== 'KeyL' || e.metaKey || e.ctrlKey) return false;
      const ids = allOverlays().map((o) => o.id);
      const i = active ? ids.indexOf(active) : -1;
      service.set(i + 1 < ids.length ? ids[i + 1]! : null);
      return true;
    });
    ctx.systems.add({
      id: 'overlays.blend',
      phase: 'sync',
      update(_c, f) {
        const v = U.overlay.value;
        if (v !== target) U.overlay.value = Math.abs(target - v) < 0.01 ? target : v + (target - v) * Math.min(1, f.dt * 8);
      },
    });
  },
};
