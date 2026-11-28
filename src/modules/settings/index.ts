import type { GameContext, GameModule } from '@/game/context';
import { QUALITY_TIERS, type QualityTier } from '@/render/Quality';
import { POWER_MODES, type PowerMode } from '@/render/Power';
import { ago, h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { holoHead } from '@/ui/holo';
import { floraLocked } from '@/sim/flora';
import { controlsPane } from './controls';
import { STYLE_ORDER, VISUAL_STYLES } from '@/modules/style';
import './settings.css';

const QUALITY_LABELS: Record<QualityTier, string> = {
  low: 'No shadows, glow or post effects, lowest resolution: for older laptops and phones.',
  medium: 'Shadows, glow and temporal anti-aliasing at 1× resolution.',
  high: 'Sharper: 1.25× resolution.',
  ultra: '2× resolution and large shadow maps: for a strong GPU.',
};
const POWER_SHORT: Record<PowerMode, string> = { battery: 'Battery', balanced: 'Balanced', max: 'Max' };
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
  return h('button', { class: 'set-new', onClick: toggle }, icon('maximize'), ' Toggle fullscreen (F11)');
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
 * The Game tab's saved-city card (D-081, D-207): this island's own slot (city, day, residents, when), Save (writes
 * only this island's slot) and Islands, which opens the New Chapter dialog on the list of saved islands (resume or
 * delete any of them). ⌘S / ⌘L still work anywhere.
 */
function saveSection(ctx: GameContext, close: () => void): { el: HTMLElement; refresh: () => void } {
  const save = ctx.services.get('save');
  const summary = h('div', { class: 'set-save-sum' });
  const when = h('div', { class: 'set-save-when' });
  const count = h('span', {}, 'Islands');
  const loadBtn = h(
    'button',
    {
      class: 'set-btn',
      title: 'Resume or delete a saved island',
      onClick: () => {
        close();
        ctx.services.tryGet('wizard')?.open('resume');
      },
    },
    icon('load'),
    count,
    h('kbd', {}, '⌘L'),
  ) as HTMLButtonElement;
  const saveBtn = h(
    'button',
    { class: 'set-btn primary', onClick: () => void save.save().then(refresh) },
    icon('save'),
    h('span', {}, 'Save'),
    h('kbd', {}, '⌘S'),
  );
  const refresh = () => {
    void save.list().then((all) => {
      loadBtn.disabled = !all.length || !ctx.services.tryGet('wizard');
      count.textContent = all.length ? `Islands · ${all.length}` : 'Islands';
    });
    void save.info().then((info) => {
      if (!info) {
        summary.replaceChildren(h('b', {}, ctx.city.growth.name || 'This island'));
        when.textContent = 'Not saved yet: Save keeps it beside your other islands.';
        return;
      }
      summary.replaceChildren(
        h('b', {}, info.name || 'Saved city'),
        ...(info.day ? [h('span', {}, `Day ${info.day} · ${Math.round(info.residents).toLocaleString()} residents`)] : []),
      );
      when.textContent = info.at ? `Saved ${ago(info.at)} · saving updates this island only` : 'Saving updates this island only';
    });
  };
  for (const ev of ['save:done', 'load:done', 'save:deleted', 'city:reset'] as const) ctx.bus.on(ev, refresh);
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
 * bar), found a new city, the guide, and gameplay preferences (moments, Flora's heads-ups, tips, charms). **Sound**:
 * volumes and mute. **Display** (D-244): visual style, graphics quality, frame rate, clean view and the desktop window. **Controls**: basic controls and common hotkeys (Shift+H opens it). Quality, power and the open tab are per-viewer conveniences in localStorage; `?quality=` still wins.
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

    /**
     * A segmented control (one choice of a few, short labels) with a hint line under it that describes the chosen
     * option. Radio inputs underneath, so arrow keys and screen readers work as for any radio group.
     */
    const segmented = <T extends string>(
      name: string,
      options: Record<T, { label: string; hint?: string }>,
      current: T,
      onPick: (v: T) => void,
    ) => {
      const hint = h('p', { class: 'set-seg-hint' });
      const show = (k: T) => (hint.textContent = options[k].hint ?? '');
      const row = h(
        'div',
        { class: 'set-seg', role: 'radiogroup' },
        ...(Object.keys(options) as T[]).map((k) => {
          const input = h('input', { type: 'radio', name, value: k }) as HTMLInputElement;
          input.checked = k === current;
          input.addEventListener('change', () => (show(k), onPick(k)));
          return h('label', { class: 'set-seg-opt' }, input, h('span', {}, options[k].label));
        }),
      );
      show(current);
      return h('div', { class: 'set-seg-wrap' }, row, hint);
    };

    /** An on / off setting as one row: name and explanation on the left, a switch on the right. */
    const toggle = (label: string, hint: string, on: boolean, onChange: (on: boolean) => void) => {
      const input = h('input', { type: 'checkbox', role: 'switch' }) as HTMLInputElement;
      input.checked = on;
      input.addEventListener('change', () => onChange(input.checked));
      return h('label', { class: 'set-toggle' }, h('span', { class: 'set-toggle-text' }, h('b', {}, label), h('span', {}, hint)), input, h('i', { class: 'set-switch', 'aria-hidden': 'true' }));
    };

    /** A titled block of settings (one per subject, so each tab reads as a few short sections). */
    const section = (title: string, ...body: (HTMLElement | null | false | undefined)[]) =>
      h('section', { class: 'set-sec' }, h('h4', {}, title), ...body.filter((b): b is HTMLElement => !!b));

    let refreshLookNote = () => {};
    /** Visual style (D-243, D-244, D-245): a card per look, with a swatch that suggests it. */
    const styleCards = () => {
      const style = ctx.services.tryGet('style');
      if (!style) return null;
      const cards = STYLE_ORDER.map((id) => {
        const s = VISUAL_STYLES[id];
        const input = h('input', { type: 'radio', name: 'style', value: id }) as HTMLInputElement;
        input.checked = id === style.style;
        input.addEventListener('change', () => style.set(id));
        return h('label', { class: `set-look look-${id}` }, input, h('span', { class: 'set-look-swatch', 'aria-hidden': 'true' }), h('b', {}, s.name), h('span', {}, s.blurb));
      });
      const lowNote = h('p', { class: 'set-hint set-look-note' }, 'This look is drawn by post-processing: on Low graphics only its colours show. Medium or higher draws all of it.');
      const sync = () => lowNote.classList.toggle('hidden', !(VISUAL_STYLES[style.style].post && ctx.quality.tier === 'low'));
      ctx.bus.on('style:changed', sync);
      refreshLookNote = sync;
      sync();
      return section('Visual style', h('p', { class: 'set-hint' }, 'The same island in eight looks. F4 cycles through them.'), h('div', { class: 'set-looks', role: 'radiogroup' }, ...cards), lowNote);
    };

    const close = () => pop.classList.add('hidden');
    const saves = saveSection(ctx, close);
    const moments = ctx.services.tryGet('moments');
    const flora = ctx.services.tryGet('assistant');
    const juice = ctx.services.tryGet('juice');
    const charm = ctx.services.tryGet('charm');
    const qualityNote = (q: QualityTier) => ({ label: q[0]!.toUpperCase() + q.slice(1), hint: QUALITY_LABELS[q] });
    const panes: Record<TabId, HTMLElement> = {
      game: h(
        'div',
        { class: 'set-pane' },
        section('Saved city', saves.el),
        section(
          'City',
          h('button', { class: 'set-new', onClick: () => (close(), ctx.services.get('crises').newCity()) }, icon('sparkle'), ' New chapter: resume, new island, showcase…'),
          h('button', { class: 'set-new', onClick: () => (close(), ctx.services.tryGet('wizard')?.guide()) }, icon('console'), ' How to play (guide)'),
        ),
        // Gameplay preferences (moved from Display): how the game talks to the steward.
        moments &&
          section(
            'Moments',
            segmented(
              'moments',
              {
                all: { label: 'All', hint: 'Full-screen ceremonies for big events: Flora waking, unlocks, sea wonders, milestones. Click or Esc skips one.' },
                major: { label: 'Major only', hint: 'Only the grand, once-a-city moments; smaller ones are skipped.' },
                off: { label: 'Off', hint: 'No ceremonies.' },
              },
              moments.mode,
              (m) => (moments.mode = m),
            ),
          ),
        flora &&
          !floraLocked(ctx.city) &&
          section(
            'Flora’s heads-ups',
            segmented(
              'foresight',
              {
                quiet: { label: 'Quiet', hint: 'Flora does not warn about forecasts on her own; ask her what is coming.' },
                normal: { label: 'Normal', hint: 'Flora speaks up about trouble due within about 5 minutes that she is sure of.' },
                eager: { label: 'Eager', hint: 'Flora speaks up early and more often, even about trends that may still turn.' },
              },
              flora.foresight,
              (m) => (flora.foresight = m),
            ),
          ),
        (juice || charm) &&
          section(
            'Little extras',
            juice && toggle('Tip bubbles', 'Happy buildings now and then float a bubble: pop it for a small tip and a word from residents.', juice.tips, (on) => (juice.tips = on)),
            juice &&
              toggle(
                'Auto-collect tips',
                juice.tipJar
                  ? 'Bubbles collect themselves after a few seconds. Pop them sooner for a bigger combo.'
                  : `Unlocks when the treasury first reaches ◈${juice.autoAt.toLocaleString('en-US')}.`,
                juice.autoTips,
                (on) => (juice.autoTips = on),
              ),
            charm && toggle('Little charms', "The island's cat on the rooftops, paper planes with notes and sleepy homes at night.", charm.on, (on) => (charm.on = on)),
          ),
      ),
      sound: h(
        'div',
        { class: 'set-pane' },
        section('Sound', h('p', { class: 'set-hint' }, 'Generative music, island ambience and effects, all synthesised. Press , to mute.'), ...soundSliders(ctx)),
      ),
      display: h(
        'div',
        { class: 'set-pane' },
        styleCards(),
        section(
          'Graphics',
          segmented(
            'quality',
            Object.fromEntries((Object.keys(QUALITY_TIERS) as QualityTier[]).map((q) => [q, qualityNote(q)])) as Record<QualityTier, { label: string; hint: string }>,
            ctx.quality.tier,
            (q) => {
              render.setQuality(q);
              try {
                localStorage.setItem(STORAGE_KEY, q);
              } catch {
                /* ignore */
              }
              refreshLookNote();
            },
          ),
        ),
        section(
          'Frame rate',
          segmented(
            'power',
            Object.fromEntries(Object.entries(POWER_MODES).map(([k, v]) => [k, { label: POWER_SHORT[k as PowerMode], hint: `${v.label}. The simulation runs at full speed in every mode.` }])) as Record<
              PowerMode,
              { label: string; hint: string }
            >,
            render.power.mode,
            (m) => render.power.setMode(m),
          ),
        ),
        section(
          'Screen',
          // Clean view (D-238): the city with no HUD, for screenshots and streams (registered after Settings).
          h('button', { class: 'set-new', onClick: () => (close(), ctx.services.tryGet('cleanview')?.set(true)) }, icon('eye'), ' Hide the HUD (F2): F2 or Esc brings it back'),
          ...(ctx.platform.setFullscreen ? [desktopSection(ctx.platform.setFullscreen.bind(ctx.platform))] : []),
        ),
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
    // F4 switches the style with the panel open: keep its radio in step.
    ctx.bus.on('style:changed', ({ style }) => {
      const input = pop.querySelector<HTMLInputElement>(`input[name="style"][value="${style}"]`);
      if (input) input.checked = true;
    });
    ctx.services.provide('settings', { open, close, get isOpen() { return !pop.classList.contains('hidden'); } });
    ctx.input.onKey((e) => {
      // Shift+H: Settings → Controls (again closes it). Plain H is the highway tool (D-212).
      if (e.code === 'KeyH' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
