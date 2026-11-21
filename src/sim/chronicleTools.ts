import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import { chronicleReport } from './chronicle';

/**
 * The Chronicle for the city assistant (D-192): the pages of the island's history this city has found, chapter by
 * chapter, and hints for the rest. Read-only: the choice at the flame stays the steward's, on the Chronicle tab.
 * Pages not found are given only as hints, so Flora never tells a story the city hasn't earned yet.
 */
export const chronicleTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'chronicle_status',
    option: "Read the island's history found so far (the Chronicle)",
    description:
      "The Chronicle: the pages of the island's history this city has found (Halcyon the drowned marble city, the Long Tide, the Seedvault, the Tidekin and their Three Promises, the Deep Choir, the mainland powers, the flame), with their text, and for each page not found yet a hint at how to find it.",
    keywords: [
      'chronicle',
      'history',
      'lore',
      'story',
      'legend',
      'halcyon',
      'meridian',
      'tidekin',
      'promises',
      'choir',
      'ruins',
      'past',
      'origin',
    ],
    input: { type: 'object', properties: {} },
    effect: 'read',
    run: ({ city }) => chronicleReport(city),
  },
];
