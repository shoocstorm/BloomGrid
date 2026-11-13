import type { GameContext, GameModule } from '@/game/context';
import { QUALITY_TIERS, type QualityTier } from '@/render/Quality';
import { POWER_MODES, type PowerMode } from '@/render/Power';
import { ago, h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { holoHead } from '@/ui/holo';
import { controlsPane } from './controls';
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

/** Volume sliders and mute for the audio service (D-077), if present. */
function soundSliders(ctx: GameContext): HTMLElement[] {
  const audio = ctx.services.tryGet('audio');
  if (!audio) return [];
  const row = (key: 'master' | 'music' | 'ambience' | 'sfx', label: string) => {
    const value = String(Math.round(audio.levels[key] * 100));
    const input = h('input', {
      type: 'range',
      min: '0',
      max: '100',
      value,
      'aria-label': label,
    }) as HTMLInputElement;
    input.addEventListener('input', () => audio.set({ [key]: Number(input.value) / 100 }));
    return h('label', { class: 'set-slider' }, h('span', {}, label), input);
  };
  const mute = h('input', { type: 'checkbox' }) as HTMLInputElement;
  mute.checked = audio.levels.muted;
  mute.addEventListener('change', () => audio.set({ muted: mute.checked }));
  return [
    row('master', 'Master'),
    row('music', 'Music'),
    row('ambience', 'Ambience'),
    row('sfx', 'Effects'),
    h('label', { class: 'set-opt' }, mute, h('span', {}, 'Mute')),
  ];
}

/**
 * The Game tab's saved-city card (D-081): what the slot holds (city, day, residents, when), Save, and Load with a
 * confirm step (loading replaces the city on screen). Moved here from the top bar; ⌘S / ⌘L still work anywhere.
 */
function saveSection(ctx: GameContext, close: () => void): { el: HTMLElement; refresh: () => void } {
  const save = ctx.services.get('save');
  const summary = h('div', { class: 'set-save-sum' });
  const when = h('div', { class: 'set-save-when' });
  let armed = 0;
  const loadBtn = h('button', { class: 'set-btn' }, icon('load'), h('span', {}, 'Load'), h('kbd', {}, '⌘L')) as HTMLButtonElement;
  const loadLabel = loadBtn.querySelector('span')!;
  const disarm = () => {
    window.clearTimeout(armed);
    armed = 0;
    loadBtn.classList.remove('warn');
    loadLabel.textContent = 'Load';
  };
  loadBtn.addEventListener('click', () => {
    if (!armed) {
      // First press asks: the city on screen is replaced (unsaved changes are lost).
      loadBtn.classList.add('warn');
      loadLabel.textContent = 'Replace this city?';
      armed = window.setTimeout(disarm, 4000);
      return;
    }
    disarm();
    void ctx.services
      .get('loader')
      .run('Restoring your city', async (stage) => {
        const ok = await save.load('slot1', stage);
        if (ok) close();
        return ok;
      })
      .then((ok) => ctx.bus.emit('toast', ok ? { text: 'City loaded', tone: 'ok' } : { text: 'No saved city yet', tone: 'bad' }));
  });
  const saveBtn = h(
    'button',
    { class: 'set-btn primary', onClick: () => void save.save().then(refresh) },
    icon('save'),
    h('span', {}, 'Save'),
    h('kbd', {}, '⌘S'),
  );
  const refresh = () => {
    disarm();
    void save.info().then((info) => {
      loadBtn.disabled = !info;
      if (!info) {
        summary.replaceChildren(h('b', {}, 'No saved city yet'));
        when.textContent = 'Save to keep this city; one slot, overwritten each time.';
        return;
      }
      summary.replaceChildren(
        h('b', {}, info.name || 'Saved city'),
        ...(info.day ? [h('span', {}, `Day ${info.day} · ${Math.round(info.residents).toLocaleString()} residents`)] : []),
      );
      when.textContent = info.at ? `Saved ${ago(info.at)} · saving overwrites it` : 'Saving overwrites it';
    });
  };
  ctx.bus.on('save:done', refresh);
  ctx.bus.on('load:done', refresh);
  const el = h(
    'div',
    { class: 'set-save' },
    h('div', { class: 'set-save-head' }, h('span', { class: 'set-save-ico' }, icon('city')), h('div', {}, summary, when)),
    h('div', { class: 'set-save-btns' }, saveBtn, loadBtn),
  );
  return { el, refresh };
}

const TABS = [
  ['game', 'Game'],
  ['sound', 'Sound'],
  ['display', 'Display'],
  ['controls', 'Controls'],
] as const;
type TabId = (typeof TABS)[number][0];
const TAB_KEY = 'bloomgrid.settings.tab';

/**
 * Settings (⚙, D-081, D-087): one panel with four tabs, sharing one grid cell so switching never jumps. **Game**: the saved city with Save / Load (moved from the top
 * bar), found a new city, the guide. **Sound**: volumes and mute. **Display**: power mode, desktop window, graphics
 * quality. **Controls**: basic controls and common hotkeys (H opens it). Quality, power and the open tab are per-viewer conveniences in localStorage; `?quality=` still wins.
 */
export interface SettingsService {
  /** Opens Settings (on a tab, else the last one). */
  open(tab?: TabId): void;
  close(): void;
  readonly isOpen: boolean;
}

declare module '@/core/Services' {
  interface GameServices {
    settings: SettingsService;
  }
}

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

    const close = () => pop.classList.add('hidden');
    const saves = saveSection(ctx, close);
    const panes: Record<TabId, HTMLElement> = {
      game: h(
        'div',
        { class: 'set-pane' },
        h('h4', {}, 'Saved city'),
        saves.el,
        h('h4', {}, 'City'),
        h('button', { class: 'set-new', onClick: () => (close(), ctx.services.get('crises').newCity()) }, icon('sparkle'), ' New chapter: resume, new island, showcase…'),
        h('button', { class: 'set-new', onClick: () => (close(), ctx.services.tryGet('wizard')?.guide()) }, icon('console'), ' How to play (guide)'),
      ),
      sound: h(
        'div',
        { class: 'set-pane' },
        h('h4', {}, 'Sound'),
        h('p', { class: 'set-hint' }, 'Generative music, island ambience and effects, all synthesised. Press , to mute.'),
        ...soundSliders(ctx),
      ),
      display: h(
        'div',
        { class: 'set-pane' },
        h('h4', {}, 'Power'),
        h('p', { class: 'set-hint' }, 'Caps how often the city is redrawn. The simulation runs at full speed in every mode.'),
        radio('power', Object.fromEntries(Object.entries(POWER_MODES).map(([k, v]) => [k, v.label])) as Record<PowerMode, string>, render.power.mode, (m) =>
          render.power.setMode(m),
        ),
        ...(ctx.platform.setFullscreen ? [desktopSection(ctx.platform.setFullscreen.bind(ctx.platform))] : []),
        ...(() => {
          // City moments (D-094): full-screen ceremonies for the big events.
          const moments = ctx.services.tryGet('moments');
          return moments
            ? [
                h('h4', {}, 'Moments'),
                h('p', { class: 'set-hint' }, 'Full-screen ceremonies for big events: Flora waking, unlocks, sea wonders, milestones. Click or Esc skips one.'),
                radio('moments', { all: 'All moments', major: 'Major only', off: 'Off' }, moments.mode, (m) => (moments.mode = m)),
              ]
            : [];
        })(),
        ...(() => {
          // Flora's foresight (plan v5): how readily she warns about forecast trouble.
          const flora = ctx.services.tryGet('assistant');
          return flora
            ? [
                h('h4', {}, 'Flora’s heads-ups'),
                h('p', { class: 'set-hint' }, 'Flora watches the trends and speaks up before a supply runs short. Normal: only trouble due within about 5 minutes that she is sure of.'),
                radio('foresight', { quiet: 'Quiet', normal: 'Normal', eager: 'Eager' }, flora.foresight, (m) => (flora.foresight = m)),
              ]
            : [];
        })(),
        ...(() => {
          // Tip bubbles (D-118): residents' tips over happy buildings.
          const juice = ctx.services.tryGet('juice');
          return juice
            ? [
                h('h4', {}, 'Tip bubbles'),
                h('p', { class: 'set-hint' }, 'Now and then a happy building floats a bubble: pop it for a small tip and a word from its residents.'),
                radio('tips', { on: 'On', off: 'Off' }, juice.tips ? 'on' : 'off', (m) => (juice.tips = m === 'on')),
              ]
            : [];
        })(),
        h('h4', {}, 'Graphics'),
        radio('quality', QUALITY_LABELS, ctx.quality.tier, (q) => {
          render.setQuality(q);
          try {
            localStorage.setItem(STORAGE_KEY, q);
          } catch {
            /* ignore */
          }
        }),
      ),
      controls: h('div', { class: 'set-pane p-controls' }, ...controlsPane(ctx)),
    };
    let current: TabId = 'game';
    try {
      const t = localStorage.getItem(TAB_KEY) as TabId | null;
      if (t && t in panes) current = t;
    } catch {
      /* storage blocked: start on Game */
    }
    const tabBtns = TABS.map(([id, label]) =>
      h('button', { class: 'set-tab', role: 'tab', onClick: () => pick(id) }, label),
    );
    const pick = (id: TabId) => {
      current = id;
      try {
        localStorage.setItem(TAB_KEY, id);
      } catch {
        /* remembered for the session only */
      }
      TABS.forEach(([t], i) => {
        tabBtns[i]!.classList.toggle('on', t === id);
        tabBtns[i]!.setAttribute('aria-selected', String(t === id));
        panes[t].classList.toggle('on', t === id);
        panes[t].setAttribute('aria-hidden', String(t !== id));
      });
      if (id === 'game') saves.refresh();
    };

    const pop = h(
      'div',
      { class: 'settings panel holo hidden', role: 'dialog', 'aria-label': 'Settings' },
      h(
        'div',
        { class: 'set-top' },
        holoHead(icon('settings'), 'Steward console', 'Settings'),
        h('button', { class: 'icon-btn', title: 'Close (Esc)', 'aria-label': 'Close', onClick: close }, icon('close')),
      ),
      h('div', { class: 'set-tabs', role: 'tablist' }, ...tabBtns),
      // All panes share one cell: the panel keeps the tallest one's size, so switching tabs never jumps.
      h('div', { class: 'set-stage' }, ...Object.values(panes)),
    );
    pick(current);
    const btn = h(
      'button',
      {
        class: 'icon-btn',
        title: 'Settings: save and load, sound, display',
        'aria-label': 'Settings',
        onClick: () => {
          pop.classList.toggle('hidden');
          if (!pop.classList.contains('hidden')) pick(current);
        },
      },
      icon('settings'),
    );
    document.querySelector('.topbar .actions')?.append(btn);
    ctx.hud.append(pop);
    window.addEventListener('pointerdown', (e) => {
      const t = e.target;
      if (!(t instanceof Node) || pop.contains(t) || btn.contains(t)) return;
      close();
    });
    const open = (tab?: TabId) => {
      pop.classList.remove('hidden');
      pick(tab ?? current);
    };
    ctx.services.provide('settings', { open, close, get isOpen() { return !pop.classList.contains('hidden'); } });
    ctx.input.onKey((e) => {
      // H: Settings → Controls (again closes it).
      if (e.code === 'KeyH' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!pop.classList.contains('hidden') && current === 'controls') close();
        else open('controls');
        return true;
      }
      if (e.code !== 'Escape' || pop.classList.contains('hidden')) return false;
      close();
      return true;
    });
  },
};
