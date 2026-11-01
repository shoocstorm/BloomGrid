import { Color } from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { allOverlays, getOverlay } from '@/sim/overlays';
import { overlayTexture, setOverlaySmooth } from '@/render/materials/overlay';
import { U } from '@/render/uniforms';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
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
 * per-tile texture that every material samples; the blend is animated. The lens list is a tab of the City
 * Pulse console on desktops (a top-centre sheet on phones), with a card explaining the hovered or active lens and
 * a live reading; the legend, with the lens name and an off button, stays up top. Esc turns the lens off.
 */
export const overlaysModule: GameModule = {
  id: 'overlays',
  deps: ['hud', 'pulse'],
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
      // Live reading for the lens card: tiles shown, and shares at the good and bad ends of the scale.
      let shown = 0;
      let good = 0;
      let bad = 0;
      for (let i = 0; i < value.length; i++) {
        if (!mask[i]) continue;
        shown++;
        const v = spec.invert ? 1 - value[i]! : value[i]!;
        if (v >= 0.67) good++;
        else if (v < 0.33) bad++;
      }
      reading = { n: shown, good: shown ? good / shown : 0, bad: shown ? bad / shown : 0 };
      showReading();
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
    const legendName = h('b');
    const legend = h(
      'div',
      { class: 'lens-legend' },
      legendName,
      legendLo,
      legendBar,
      legendHi,
      h('button', { class: 'lens-off', title: 'Turn the lens off (Esc)', 'aria-label': 'Turn the lens off', onClick: () => service.set(null) }, icon('close')),
    );
    const bar = h('div', { class: 'lens-bar panel' });
    for (const o of allOverlays()) {
      const b = h(
        'button',
        {
          class: 'lens',
          title: `${o.label} lens`,
          onClick: () => service.set(active === o.id ? null : o.id),
          // Hovering previews the lens's explanation, as the Build tab does for buildings.
          onPointerenter: () => ((peek = o.id), renderBrief()),
          onPointerleave: () => ((peek = null), renderBrief()),
        },
        h('span', { class: 'g' }, icon(`lens:${o.id}`, o.icon)),
        h('span', { class: 'l' }, o.label),
      );
      buttons.set(o.id, b);
      bar.append(b);
    }
    bar.append(h('kbd', { title: 'Cycle lenses' }, 'L'));

    // The lens card (D-081): what the hovered or active lens shows, how to read it, what to do, and a live reading.
    const brief = h('div', { class: 'brief panel holo lens-brief' });
    let peek: string | null = null;
    let reading: { n: number; good: number; bad: number } | null = null;
    const readingEl = h('div', { class: 'bp-stats lens-reading' });
    const showReading = () => {
      const spec = active ? getOverlay(active) : undefined;
      if (!spec || !reading || (peek && peek !== active)) return;
      const [lo, hi] = spec.invert ? [spec.legend[1], spec.legend[0]] : spec.legend;
      const pct = (v: number) => `${Math.round(v * 100)}%`;
      const cells = [
        ['Tiles shown', reading.n.toLocaleString(), ''],
        [hi, pct(reading.good), 'good'],
        [lo, pct(reading.bad), reading.bad > 0.1 ? 'bad' : ''],
      ];
      if (readingEl.childElementCount !== 3)
        readingEl.replaceChildren(...cells.map(() => h('div', { class: 'bp-stat' }, h('span'), h('b'))));
      cells.forEach(([label, v, tone], i) => {
        const cell = readingEl.children[i] as HTMLElement;
        cell.className = `bp-stat ${tone}`;
        setText(cell.firstElementChild as HTMLElement, label!);
        setText(cell.lastElementChild as HTMLElement, v!);
      });
    };
    let briefKey = '';
    const renderBrief = () => {
      const id = peek ?? active;
      const key = `${id}|${active}`;
      if (key === briefKey) return;
      briefKey = key;
      brief.classList.toggle('idle', !id);
      if (!id) {
        brief.replaceChildren(
          h('div', { class: 'bp-head' }, h('span', { class: 'bp-ico' }, icon('lens')), h('b', {}, 'Data lenses')),
          h('p', { class: 'bp-desc' }, 'Recolour the whole city by one measure to see where it is going wrong. Hover a lens to read about it, click to turn it on.'),
          h('div', { class: 'bp-row' }, h('span', {}, 'Keys'), h('p', {}, 'L cycles the lenses · Esc (or ✕ on the legend) turns the lens off')),
        );
        return;
      }
      const spec = getOverlay(id)!;
      const on = id === active;
      const lo = `#${(spec.invert ? HIGH : LOW).getHexString()}`;
      const hi = `#${(spec.invert ? LOW : HIGH).getHexString()}`;
      brief.replaceChildren(
        h(
          'div',
          { class: 'bp-head' },
          h('span', { class: 'bp-ico' }, icon(`lens:${spec.id}`, spec.icon)),
          h('b', {}, spec.label),
          on
            ? h('button', { class: 'lens-brief-off', title: 'Turn the lens off (Esc)', onClick: () => service.set(null) }, icon('close'), 'Off')
            : h('span', { class: 'bp-cat' }, 'Click to show'),
        ),
        h('p', { class: 'bp-desc' }, spec.about),
        h(
          'div',
          { class: 'lens-scale' },
          h('span', {}, spec.legend[0]),
          h('i', { style: `background:linear-gradient(90deg, ${lo}, #${MID.getHexString()}, ${hi})` }),
          h('span', {}, spec.legend[1]),
        ),
        h('div', { class: 'bp-row' }, h('span', {}, 'Read'), h('p', {}, spec.read)),
        h('div', { class: 'bp-row' }, h('span', {}, 'Act'), h('p', {}, spec.act)),
        ...(on ? [readingEl] : []),
      );
      if (on) {
        readingEl.replaceChildren();
        showReading();
      }
    };
    renderBrief();
    // Phones fold the lens bar behind a toggle (a HUD sheet); desktops hide the toggle.
    const wrap = h('div', { class: 'lens-wrap' });
    const toggle = h('button', { class: 'lens-toggle panel', title: 'Data lenses', onClick: () => wrap.classList.toggle('collapsed') }, h('span', { class: 'g' }, icon('lens')), h('span', { class: 'l' }, 'Lens'));
    wrap.append(toggle, bar, brief, legend);
    ctx.hud.append(wrap);
    ctx.services.get('hud').sheet(wrap);
    // Desktops: the lenses live in the City Pulse console (D-056); the legend stays up top while one is on.
    ctx.services.get('pulse').addTab('lens', 'Lenses', '◐', bar, brief);

    const service: OverlayService = {
      get active() {
        return active;
      },
      set(id) {
        active = id;
        target = id ? 1 : 0;
        for (const [k, b] of buttons) b.classList.toggle('on', k === id);
        legend.classList.toggle('show', !!id);
        reading = null;
        renderBrief();
        if (id) {
          const spec = getOverlay(id)!;
          setOverlaySmooth(spec.smooth);
          U.ovLow.value.copy(spec.invert ? HIGH : LOW);
          U.ovMid.value.copy(MID);
          U.ovHigh.value.copy(spec.invert ? LOW : HIGH);
          legendName.textContent = `${spec.icon} ${spec.label}`;
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
      // Esc turns the lens off, unless a dialog is open above the city (it closes first).
      if (e.code === 'Escape') {
        if (!active || ctx.services.tryGet('dashboard')?.isOpen || ctx.services.tryGet('citymap')?.isOpen) return false;
        if (document.querySelector('.settings:not(.hidden)')) return false;
        service.set(null);
        return true;
      }
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
