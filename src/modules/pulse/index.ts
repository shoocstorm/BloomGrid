import type { GameModule } from '@/game/context';
import { TIERS } from '@/sim/pulseState';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { PulsePanel, SYSTEM_LABELS } from './PulsePanel';
import './pulse.css';

/**
 * City Pulse UI: the management view of the sim's pulse (`sim/pulse.ts`). Shows system health,
 * demand, budget and trends, and raises alerts when a system changes tier. On desktops the panel is the
 * steward's monitoring console (D-056): other modules add tabs through the `pulse` service. Building has its own
 * panel (`modules/build`, D-084).
 */
export const pulseModule: GameModule = {
  id: 'pulse',
  deps: ['hud'],
  init(ctx) {
    const panel = new PulsePanel(ctx);
    ctx.services.provide('pulse', {
      addTab: (id, label, glyph, ...els) => panel.addTab(id, label, glyph, ...els),
      body: panel.body,
      get collapsed() {
        return panel.collapsed;
      },
      fold: (folded) => void panel.el.classList.toggle('collapsed', folded),
    });
    const hud = ctx.services.get('hud');
    // Show / hide the console from the top bar (P does the same); lit while it is open.
    const toggle = h(
      'button',
      {
        class: 'icon-btn act-pulse',
        title: 'Show / hide City Pulse (P)',
        'aria-label': 'Show or hide City Pulse',
        onClick: () => panel.el.classList.toggle('collapsed'),
      },
      icon('pulse'),
    );
    const lit = () => {
      const open = !panel.collapsed;
      toggle.classList.toggle('on', open);
      toggle.setAttribute('aria-pressed', String(open));
    };
    new MutationObserver(lit).observe(panel.el, { attributes: true, attributeFilter: ['class'] });
    lit();
    hud.lead.prepend(toggle);
    // Esc folds the console last: dialogs, tools, the selection and the lens take it first.
    ctx.input.onKey((e) => {
      if (e.code !== 'Escape' || panel.collapsed) return false;
      panel.el.classList.add('collapsed');
      return true;
    }, -10);
    ctx.systems.add({ id: 'pulse.panel', phase: 'render', order: 110, update: (_c, f) => panel.update(f.dt) });
    ctx.bus.on('pulse:tier', ({ system, tier, prev }) => {
      // A new city's first pulses settle occupancy and staffing from their starting values: no alarms yet.
      if (ctx.city.tick < 80) return;
      const worse = tier > prev;
      ctx.bus.emit('toast', {
        text: `${worse ? '⚠' : '✓'} ${SYSTEM_LABELS[system]} ${worse ? 'fell to' : 'recovered to'} ${TIERS[tier]}`,
        tone: worse ? (tier >= 3 ? 'bad' : 'info') : 'ok',
      });
    });
  },
};
