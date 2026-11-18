import { defineScenario } from '../types';
import founding from './founding-city';

/**
 * Water Crisis Rescue (plan v5, Phase 28): the founding city with most of its water works gone (a contamination
 * scare shut them). Bring water back to Stable within twenty sim minutes. Built from the founding city's own layout,
 * so the showcase balance and this challenge never drift apart.
 */
export default defineScenario({
  id: 'water-crisis',
  name: 'Water Crisis Rescue',
  description: 'The founding city, its water works shut by a contamination scare: the taps are running dry.',
  credits: 20000,
  build: (b) => founding.build(b),
  challenge: {
    pitch: 'Most of the water works are shut. Get water back to Stable within 20 minutes.',
    setup: { remove: { resource: 'water', share: 0.3 } },
    objectives: [{ kind: 'reach-tier', system: 'water', tier: 1, within: 1200, label: 'Water back to Stable within 20 minutes' }],
  },
});
