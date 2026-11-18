import { defineScenario } from '../types';
import founding from './founding-city';

/**
 * Debt Island (plan v5, Phase 28): the founding city inherits its last steward's ◈30,000 loan and an empty treasury.
 * Clear the debt without letting any system fall below Strained. Built from the founding city's own layout.
 */
export default defineScenario({
  id: 'debt-island',
  name: 'Debt Island',
  description: 'The founding city with an empty treasury and a ◈30,000 loan to pay off.',
  credits: 1500,
  build: (b) => founding.build(b),
  challenge: {
    pitch: 'An empty treasury and a ◈30,000 loan. Clear it without any system falling below Strained.',
    setup: { loan: { amount: 30000, payment: 12 } },
    objectives: [
      { kind: 'clear-debt', label: 'Repay the ◈30,000 loan' },
      { kind: 'keep-tiers', worst: 2, label: 'No system below Strained' },
    ],
  },
});
