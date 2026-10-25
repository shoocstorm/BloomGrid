import type { GameModule } from '@/game/context';
import { TIERS } from '@/sim/pulseState';
import { PulsePanel, SYSTEM_LABELS } from './PulsePanel';
import './pulse.css';

/**
 * City Pulse UI: the management view of the sim's pulse (`sim/pulse.ts`). Shows system health,
 * demand, budget and trends, and raises alerts when a system changes tier.
 */
export const pulseModule: GameModule = {
  id: 'pulse',
  deps: ['hud'],
  init(ctx) {
    const panel = new PulsePanel(ctx);
    ctx.systems.add({ id: 'pulse.panel', phase: 'render', order: 110, update: (_c, f) => panel.update(f.dt) });
    ctx.bus.on('pulse:tier', ({ system, tier, prev }) => {
      const worse = tier > prev;
      ctx.bus.emit('toast', {
        text: `${worse ? '⚠' : '✓'} ${SYSTEM_LABELS[system]} ${worse ? 'fell to' : 'recovered to'} ${TIERS[tier]}`,
        tone: worse ? (tier >= 3 ? 'bad' : 'info') : 'ok',
      });
    });
  },
};
