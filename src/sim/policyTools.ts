import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import {
  POLICIES,
  POLICY_IDS,
  cooldownLeft,
  isActive,
  policiesLocked,
  policyBlock,
  getPolicy,
} from './policies';
import { BUDGET_MAX, BUDGET_MIN, BUDGET_SECTORS, type BudgetSector } from './policyState';
import { taxSplit } from './finance';

/**
 * Flora's policy tools (plan v5, Phase 25): what ordinances exist and what they trade, which are in force, the
 * sector budgets and the business tax; and enacting / repealing an ordinance or setting a budget, through the
 * same undoable commands the Policies tab uses. Registered after every other tool (with `foresightTools`) so
 * menus for other requests keep their letters.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;

export const policyTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'policies_status',
    option: 'List city ordinances (policies), budgets and business tax, with their trade-offs',
    description:
      'Every ordinance (car-free core, night-sky, fishing quota, green roofs, four-day week, tourist levy, rainwater code, free sky-pods): what it gains, what it costs, whether it is in force or why it cannot be enacted; plus the maintenance / response / ecology budgets and the business tax. Use before recommending or enacting one.',
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      return {
        locked: policiesLocked(city),
        runningCostPerSecond: r2(city.stats.policyCost),
        ordinances: POLICIES.map((p) => {
          const on = isActive(city, p.id);
          return {
            id: p.id,
            name: p.name,
            inForce: on,
            gain: p.upside,
            cost: p.downside,
            enactCredits: p.enact,
            perSecond: r2(p.perSec(city)),
            blocked: policyBlock(city, p.id, !on),
            canChangeInSeconds: Math.ceil(cooldownLeft(city, p.id)),
          };
        }),
        budgetsPercent: Object.fromEntries(
          BUDGET_SECTORS.map((s) => [s, Math.round(city.policies.budget[s] * 100)]),
        ),
        businessTaxPercent: Math.round(city.policies.businessRate * 100),
        businessTaxPerSecond: r2(taxSplit(city).business),
        residentTaxPercent: Math.round(city.pulse.taxRate * 100),
      };
    },
  },
  {
    name: 'set_policy',
    option: 'Enact or repeal an ordinance (policy)',
    description:
      'Puts an ordinance in force (on: true, pays its enact fee) or repeals it (on: false). Ordinances can change once a minute. Undoable.',
    keywords: ['ordinance', 'policy', 'enact', 'repeal', 'ban', 'law'],
    input: {
      type: 'object',
      properties: { policy: { type: 'string', enum: POLICY_IDS }, on: { type: 'boolean' } },
      required: ['policy', 'on'],
    },
    effect: 'mutate',
    run({ city, commands }, { policy, on }: { policy: string; on: boolean }) {
      const p = getPolicy(policy);
      if (!p) throw new Error(`No ordinance ${policy}. Known: ${POLICY_IDS.join(', ')}.`);
      const why = policyBlock(city, policy, on);
      if (why) throw new Error(why);
      if (!commands.execute('setPolicy', { id: policy, on }))
        throw new Error(`${p.name} could not be ${on ? 'enacted' : 'repealed'}.`);
      return {
        policy: p.name,
        inForce: on,
        gain: on ? p.upside : undefined,
        cost: on ? p.downside : undefined,
        credits: Math.round(city.credits),
      };
    },
  },
  {
    name: 'set_budget',
    option: 'Set a budget (maintenance, emergency response or ecology) in percent',
    description: `Sets how much of a sector's upkeep the city pays, ${BUDGET_MIN * 100}–${BUDGET_MAX * 100}%. Below 100% saves credits but that sector suffers (buildings wear, fires spread, gardens fade); above mends faster. Undoable.`,
    keywords: ['budget', 'funding', 'maintenance', 'response', 'ecology'],
    input: {
      type: 'object',
      properties: {
        sector: { type: 'string', enum: BUDGET_SECTORS },
        percent: { type: 'integer', minimum: BUDGET_MIN * 100, maximum: BUDGET_MAX * 100 },
      },
      required: ['sector', 'percent'],
    },
    effect: 'mutate',
    run({ city, commands }, { sector, percent }: { sector: BudgetSector; percent: number }) {
      const was = city.policies.budget[sector];
      if (!commands.execute('setBudget', { sector, value: percent / 100 }))
        return { sector, percent: Math.round(was * 100), note: 'Unchanged.' };
      return { sector, percent: Math.round(city.policies.budget[sector] * 100), was: Math.round(was * 100) };
    },
  },
];
