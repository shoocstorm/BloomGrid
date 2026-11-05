import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import { PROPOSAL_FOCUS, diagnose, proposeBuilds, type ProposalFocus } from './proposals';

/**
 * `propose_builds` (D-089): Flora's planner. Diagnoses what is failing and returns concrete, sized build
 * proposals (type, count, district, cost, expected gain) that the console shows as one-click Build cards. Read
 * only: nothing is built until the steward clicks, so Flora can offer it after any analysis.
 */
export const proposalTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'propose_builds',
    option: 'Diagnose the city and propose what to build (one-click build cards)',
    description:
      'Diagnoses which systems are failing and proposes up to 3 concrete builds that fix them: the most cost-effective type, how many, which district, total cost, whether the credits cover it and the expected gain. The steward builds each with one click on the cards shown; nothing is built by this tool.',
    keywords: ['propose', 'plan', 'suggest', 'recommend', 'should', 'build', 'need', 'improve', 'fix', 'next', 'priority'],
    input: {
      type: 'object',
      properties: {
        focus: { type: 'string', enum: PROPOSAL_FOCUS, description: 'Only proposals for this need' },
        district: { type: 'string', description: 'Put the proposals in this district' },
      },
    },
    llmArgs: ['focus', 'district'],
    effect: 'read',
    run({ city }, a: { focus?: ProposalFocus; district?: string }) {
      const proposals = proposeBuilds(city, { focus: a.focus, district: a.district });
      return {
        diagnosis: diagnose(city).join('; ') || 'every system Stable or better',
        proposals: proposals.map((p, i) => ({
          n: i + 1,
          build: `${p.count}× ${p.name}`,
          type: p.type,
          count: p.count,
          where: p.district,
          why: p.why,
          gain: p.gain,
          cost: p.cost,
          affordable: p.affordable,
          site: { x: p.site.x, z: p.site.z, rot: p.site.rot },
        })),
        credits: Math.round(city.credits),
        ...(proposals.length
          ? { note: 'Shown to the steward as cards with a Build button: recommend them by name.' }
          : { note: 'Nothing worth building for this right now.' }),
      };
    },
  },
];
