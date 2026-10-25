import type { GameModule } from '@/game/context';
import { QUALITY_TIERS, type QualityTier } from '@/render/Quality';
import { POWER_MODES, type PowerMode } from '@/render/Power';
import { h } from '@/ui/dom';
import './settings.css';

const QUALITY_LABELS: Record<QualityTier, string> = {
  low: 'Low: no shadows or glow, lowest resolution',
  medium: 'Medium: shadows and glow, 1× resolution',
  high: 'High: 1.25× resolution, MSAA',
  ultra: 'Ultra: 2× resolution, large shadow maps',
};
const STORAGE_KEY = 'bloomgrid.quality';

/** Desktop shell only (Tauri): native fullscreen toggle, also on F11. */
function desktopSection(setFullscreen: (on: boolean) => Promise<void>): HTMLElement {
  let on = false;
  const toggle = () => {
    on = !on;
    void setFullscreen(on);
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F11') {
      e.preventDefault();
      toggle();
    }
  });
  return h('div', {}, h('h4', {}, 'Window'), h('button', { class: 'set-new', onClick: toggle }, '⛶ Toggle fullscreen (F11)'));
}

/**
 * Settings popover (⚙): graphics quality and power mode. Both are per-viewer conveniences kept in
 * localStorage; `?quality=` in the URL still wins for testing.
 */
export const settingsModule: GameModule = {
  id: 'settings',
  deps: ['hud'],
  init(ctx) {
    const render = ctx.services.get('render');
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as QualityTier | null;
      if (saved && saved in QUALITY_TIERS && !ctx.params.has('quality') && saved !== ctx.quality.tier) render.setQuality(saved);
    } catch {
      /* storage unavailable */
    }

    const radio = <T extends string>(name: string, options: Record<T, string>, current: T, onPick: (v: T) => void) =>
      h(
        'div',
        { class: 'set-group' },
        ...(Object.keys(options) as T[]).map((k) => {
          const input = h('input', { type: 'radio', name, value: k }) as HTMLInputElement;
          input.checked = k === current;
          input.addEventListener('change', () => onPick(k));
          return h('label', { class: 'set-opt' }, input, h('span', {}, options[k]));
        }),
      );

    const pop = h(
      'div',
      { class: 'settings panel hidden' },
      h('h4', {}, 'Power'),
      h('p', { class: 'set-hint' }, 'Caps how often the city is redrawn. The simulation runs at full speed in every mode.'),
      radio('power', Object.fromEntries(Object.entries(POWER_MODES).map(([k, v]) => [k, v.label])) as Record<PowerMode, string>, render.power.mode, (m) =>
        render.power.setMode(m),
      ),
      ...(ctx.platform.setFullscreen ? [desktopSection(ctx.platform.setFullscreen.bind(ctx.platform))] : []),
      h('h4', {}, 'Graphics'),
      radio('quality', QUALITY_LABELS, ctx.quality.tier, (q) => {
        render.setQuality(q);
        try {
          localStorage.setItem(STORAGE_KEY, q);
        } catch {
          /* ignore */
        }
      }),
    );
    pop.append(
      h('h4', {}, 'City'),
      h('button', { class: 'set-new', onClick: () => (pop.classList.add('hidden'), ctx.services.get('crises').newCity()) }, '✦ Found a new city…'),
    );
    const btn = h('button', { class: 'icon-btn', title: 'Settings', onClick: () => pop.classList.toggle('hidden') }, '⚙');
    document.querySelector('.topbar .actions')?.append(btn);
    ctx.hud.append(pop);
    window.addEventListener('pointerdown', (e) => {
      if (!pop.contains(e.target as Node) && e.target !== btn) pop.classList.add('hidden');
    });
  },
};
