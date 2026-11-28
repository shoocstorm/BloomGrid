import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';

/** The two looks (D-243): Bloom is the stylised solarpunk storybook, Natural a realistic take on the same island. */
export type VisualStyle = 'bloom' | 'natural';

export const VISUAL_STYLES: Record<VisualStyle, string> = {
  bloom: 'Bloom: the stylised solarpunk look, saturated colour and glow',
  natural: 'Natural: realistic sunlight, colour and atmosphere',
};

export interface StyleService {
  readonly style: VisualStyle;
  /** Switches the look; `instant` skips the ease (scripts, captures). Remembered per viewer. */
  set(style: VisualStyle, instant?: boolean): void;
  toggle(): void;
}

declare module '@/core/Services' {
  interface GameServices {
    style: StyleService;
  }
}

declare module '@/core/EventBus' {
  interface GameEvents {
    'style:changed': { style: VisualStyle };
  }
}

const STORAGE_KEY = 'bloomgrid.style';
/** Seconds the switch eases over: a cross-fade of light and colour, not a cut. */
const EASE = 0.9;

/**
 * Visual style switch (D-243). Every look difference is driven by one uniform, `U.realism` (materials, sky, water,
 * terrain, fog, grade and the atmosphere's keys all blend on it), so a switch compiles nothing and costs nothing per
 * frame beyond the blend. Settings → Display, **F4**, `?style=natural|bloom`; the choice is kept in localStorage.
 */
export const styleModule: GameModule = {
  id: 'style',
  init(ctx) {
    const isStyle = (v: unknown): v is VisualStyle => v === 'bloom' || v === 'natural';
    let style: VisualStyle = 'bloom';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isStyle(saved)) style = saved;
    } catch {
      /* storage blocked: Bloom */
    }
    const param = ctx.params.get('style');
    if (isStyle(param)) style = param;
    let target = style === 'natural' ? 1 : 0;
    U.realism.value = target;

    const service: StyleService = {
      get style() {
        return style;
      },
      set(next, instant = false) {
        if (next !== style) {
          style = next;
          try {
            localStorage.setItem(STORAGE_KEY, next);
          } catch {
            /* remembered for the session only */
          }
          ctx.bus.emit('style:changed', { style: next });
        }
        target = next === 'natural' ? 1 : 0;
        if (instant) U.realism.value = target;
      },
      toggle() {
        service.set(style === 'natural' ? 'bloom' : 'natural');
        ctx.bus.emit('toast', { text: style === 'natural' ? 'Visual style: Natural' : 'Visual style: Bloom', tone: 'info' });
      },
    };
    ctx.services.provide('style', service);

    ctx.systems.add({
      id: 'style.ease',
      phase: 'sync',
      update(_c, f) {
        const r = U.realism.value;
        if (r === target) return;
        const step = Math.min(1, f.dt / EASE);
        U.realism.value = Math.abs(target - r) <= step ? target : r + Math.sign(target - r) * step;
      },
    });

    ctx.input.onKey((e) => {
      if (e.code !== 'F4' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
      service.toggle();
      return true;
    });
  },
};
