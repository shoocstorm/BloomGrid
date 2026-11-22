import type { GameModule } from '@/game/context';
import type { BuildingCategory } from '@/content/types';
import { isCompact, isTouchDevice } from '@/platform/device';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { moveFee } from '@/sim/relocate';
import { BuildPanel, type BuildTab } from './BuildPanel';
import { buildings } from '@/content';
import { buildBlock } from '@/sim/buildGate';
import './build.css';

export interface BuildService {
  /** Opens build mode (optionally on a category); nothing is in hand until a building or action is picked. */
  open(category?: BuildingCategory): void;
  /** Leaves build mode: whatever is in hand is put down and the inspect tool is back. */
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
  /** Adds a tab beside Build (Goals, D-153); `pane` scrolls on its own. */
  addTab(id: string, label: string, glyph: string, pane: HTMLElement): BuildTab;
  /** Opens the panel on tab `id` ('build', 'goals'). */
  show(tab: string): void;
}

export type { BuildTab };

/** Tools whose putting-down closes build mode instead of returning to the panel (D-212). */
const QUICK = ['road', 'bulldoze'];

declare module '@/core/Services' {
  interface GameServices {
    build: BuildService;
  }
}

/**
 * Build mode (D-084): the city-building actions and building catalogue in their own panel, entered from the Build
 * button (or B, or any build hotkey) and left with Done, Esc or B. City Pulse stays a monitoring console; on
 * desktops it folds while build mode is open and comes back as it was. Goals (unlock projects, milestones) are a
 * tab of this panel (D-153): goals are met by building.
 *
 * One placement, then out (D-174): placing a building closes build mode, since most placements are one building
 * for a purpose (a milestone, a shortage, Flora's advice). Shift-click, or "Keep placing" in the panel's header,
 * keeps it in hand; then build mode still closes, saying why, once another can't be placed (credits, limit). After
 * closing, an "Another …" pill above the launcher picks the same building up again in one click.
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
        // Building wants the map: an open inspector closes (and stays hidden while build mode is open, build.css).
        ctx.bus.emit('selection:changed', { eid: null });
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
        panel.selectTab('build');
      },
      close: () => setOpen(false),
      toggle: () => setOpen(!panel.open),
      get isOpen() {
        return panel.open;
      },
      addTab: (id, label, glyph, pane) => panel.addTab(id, label, glyph, pane),
      show(tab) {
        setOpen(true);
        panel.selectTab(tab);
      },
    };
    ctx.services.provide('build', service);

    // Move in every building's inspector (D-212): the way to relocate on a phone (or a long press on the building).
    ctx.services.get('hud').buildingActions((eid) => [
      h(
        'button',
        {
          class: 'tool',
          title: isTouchDevice()
            ? `Move it to another lot (◈${moveFee(ctx.city, eid).toLocaleString()}; or long-press the building)`
            : `Move it to another lot (◈${moveFee(ctx.city, eid).toLocaleString()}; or Shift-drag it)`,
          onClick: () => ctx.services.get('construction').startMove(eid),
        },
        h('span', { class: 'g' }, icon('move')),
        'Move',
      ),
    ]);

    // Any build tool (a hotkey, Flora, the advisor's "build one") opens the panel, so there is always a way out.
    // Putting Highway or Remove down (Exit, Esc, right-click) leaves build mode altogether: they are quick tools,
    // picked mostly from the launcher, and the panel coming back afterwards was in the way (D-212).
    let held = 'select';
    ctx.bus.on('tool:changed', ({ id }) => {
      const was = held;
      held = id;
      if (id === 'select' && QUICK.includes(was) && panel.open && panel.currentTab === 'build') {
        panel.toolChanged(id);
        setOpen(false);
        return;
      }
      // Moving a building is not build mode: the inspector's Move or a long press, straight on the map.
      if (id !== 'select' && id !== 'move') {
        setOpen(true);
        panel.selectTab('build');
      }
      panel.toolChanged(id);
    });
    // The inspector takes the 3D stage; a new city starts outside build mode.
    ctx.bus.on('selection:changed', ({ eid, road, eids }) => (eid != null || road !== undefined || eids?.length) && panel.dropFloat());
    ctx.bus.on('city:reset', () => {
      setOpen(false);
      panel.hideAgain();
    });
    ctx.bus.on('build:placed', ({ def, shift }) => {
      if (!panel.open || ctx.tools.active?.id !== 'build') return;
      const block = buildBlock(ctx.city, def);
      if (shift || panel.keepPlacing) {
        if (!block) return;
        ctx.bus.emit('toast', { text: `No more ${buildings.get(def).name} for now: ${block.reason}`, tone: 'info' });
      }
      setOpen(false);
      if (!block) panel.offerAgain(def);
    });

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
