import type { GameModule } from '@/game/context';
import { h, setText } from '@/ui/dom';
import './cleanview.css';

export interface CleanViewOptions {
  /** CSS selectors of HUD panels that stay on screen (the demo keeps Flora's console or the postcard). */
  keep?: string[];
  /** No "F2 brings it back" hint (scripted captures). */
  quiet?: boolean;
}

export interface CleanViewService {
  readonly on: boolean;
  set(on: boolean, opts?: CleanViewOptions): void;
  toggle(): void;
}

declare module '@/core/Services' {
  interface GameServices {
    cleanview: CleanViewService;
  }
}

declare module '@/core/EventBus' {
  interface GameEvents {
    /** The HUD was hidden (on) or brought back (off) for a clean view of the city (D-238). */
    'cleanview:state': { on: boolean };
  }
}

/**
 * Clean view (D-238): hides every HUD layer (top bar, consoles, toasts, cards, tip bubbles, the cat, fire pins,
 * banners) while the city keeps running, for a screenshot, a stream or the demo video. Unlike photo mode it adds
 * no letterbox and leaves the clock alone. Films and ceremonies still show: they are the city's, not the HUD's.
 * F2 or Esc brings the HUD back; Settings → Display turns it on. `keep` lets a script leave chosen panels showing.
 */
export const cleanViewModule: GameModule = {
  id: 'cleanview',
  deps: ['hud'],
  init(ctx) {
    let on = false;
    const keepStyle = h('style', { 'data-cleanview': '' });
    document.head.append(keepStyle);
    const hint = h('div', { class: 'cv-hint', 'aria-live': 'polite' });
    document.body.append(hint);
    let hintTimer = 0;

    const service: CleanViewService = {
      get on() {
        return on;
      },
      set(next, opts = {}) {
        const keep = next ? (opts.keep ?? []).filter((s) => s.trim()) : [];
        // Kept panels override the hidden HUD (a child may set `visibility: visible` under a hidden parent).
        keepStyle.textContent = keep.length ? `body.clean-view :is(${keep.join(', ')}) { visibility: visible !important; }` : '';
        if (next === on) return;
        on = next;
        document.body.classList.toggle('clean-view', on);
        window.clearTimeout(hintTimer);
        hint.classList.remove('in');
        if (on && !opts.quiet) {
          setText(hint, 'HUD hidden · F2 or Esc brings it back');
          hint.classList.add('in');
          hintTimer = window.setTimeout(() => hint.classList.remove('in'), 2600);
        }
        ctx.bus.emit('cleanview:state', { on });
      },
      toggle() {
        service.set(!on);
      },
    };
    ctx.services.provide('cleanview', service);

    ctx.input.onKey((e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.code === 'F2') return (service.toggle(), true);
      // Last in line: any dialog or dropdown takes Esc first.
      if (on && e.code === 'Escape') return (service.set(false), true);
      return false;
    }, -20);
    ctx.bus.on('city:reset', () => service.set(false));
  },
};
