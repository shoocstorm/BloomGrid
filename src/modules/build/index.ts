import type { GameModule } from '@/game/context';
import type { BuildingCategory } from '@/content/types';
import { isCompact } from '@/platform/device';
import { BuildPanel } from './BuildPanel';
import './build.css';

export interface BuildService {
  /** Opens build mode (optionally on a category); nothing is in hand until a building or action is picked. */
  open(category?: BuildingCategory): void;
  /** Leaves build mode: whatever is in hand is put down and the inspect tool is back. */
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
}

declare module '@/core/Services' {
  interface GameServices {
    build: BuildService;
  }
}

/**
 * Build mode (D-084): the city-building actions and building catalogue in their own panel, entered from the Build
 * button (or B, or any build hotkey) and left with Done, Esc or B. City Pulse stays a monitoring console; on
 * desktops it folds while build mode is open and comes back as it was.
 */
export const buildModule: GameModule = {
  id: 'build',
  deps: ['hud', 'construction', 'pulse'],
  init(ctx) {
    const pulse = ctx.services.get('pulse');
    /** City Pulse was open when build mode began (desktops): unfold it again on the way out. */
    let pulseWasOpen = false;
    const setOpen = (open: boolean) => {
      if (open === panel.open) return;
      if (open) {
        pulseWasOpen = !pulse.collapsed && !isCompact();
        pulse.fold(true);
      }
      panel.setOpen(open);
      document.body.classList.toggle('building', open);
      if (!open) {
        ctx.tools.setActive('select');
        if (pulseWasOpen) pulse.fold(false);
        pulseWasOpen = false;
      }
    };
    const panel = new BuildPanel(
      ctx,
      () => setOpen(false),
      () => setOpen(!panel.open),
    );
    const service: BuildService = {
      open(category) {
        if (category) panel.showCategory(category);
        setOpen(true);
      },
      close: () => setOpen(false),
      toggle: () => setOpen(!panel.open),
      get isOpen() {
        return panel.open;
      },
    };
    ctx.services.provide('build', service);

    // Any build tool (a hotkey, Flora, the advisor's "build one") opens the panel, so there is always a way out.
    ctx.bus.on('tool:changed', ({ id }) => {
      if (id !== 'select') setOpen(true);
      panel.toolChanged(id);
    });
    // The inspector takes the 3D stage; a new city starts outside build mode.
    ctx.bus.on('selection:changed', ({ eid, road, eids }) => (eid != null || road !== undefined || eids?.length) && panel.dropFloat());
    ctx.bus.on('city:reset', () => setOpen(false));

    ctx.input.onKey((e) => {
      if (ctx.tools.suspended || e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.code === 'KeyB' && !e.shiftKey) return setOpen(!panel.open), true;
      if (e.code !== 'Escape' || !panel.open) return false;
      // Dialogs above the city close first.
      if (ctx.services.tryGet('dashboard')?.isOpen || ctx.services.tryGet('citymap')?.isOpen) return false;
      if (document.querySelector('.settings:not(.hidden)')) return false;
      const tool = ctx.tools.active;
      // A tool's own Esc first (the weaver drops its anchor), then put down what is in hand, then leave.
      if (tool?.key?.(ctx, e)) return true;
      if (tool && tool.id !== 'select') ctx.tools.setActive('select');
      else setOpen(false);
      return true;
    });
    // A right-click (no drag) puts down what is in hand, as in most builders; right-drag still orbits.
    ctx.input.onPointerUp((e) => {
      if (e.button === 2 && panel.open && ctx.input.isTap && !ctx.tools.suspended && ctx.tools.active?.id !== 'select') ctx.tools.setActive('select');
    });

    let timer = 0;
    ctx.systems.add({
      id: 'build.panel',
      phase: 'render',
      order: 105,
      update: (_c, f) => {
        if (!panel.open) return;
        // City Pulse opened over it (P, the top-bar button): watching wins, build mode ends.
        if (!isCompact() && !pulse.collapsed) return setOpen(false);
        if ((timer += f.dt) < 0.2) return;
        timer = 0;
        panel.sync();
      },
    });
  },
};
