import type { AgentTool } from '@/core/AgentTools';
import { buildings } from '@/content';
import { CATEGORY_LABELS, type BuildingCategory } from '@/content/types';
import { Building } from '@/ecs/components';
import type { SimCtx } from './systems';
import { evaluateAdvisor } from './advisor';
import { getCrisis } from './crises';
import { INCOME_SCALE } from './pulse';
import { HISTORY_METRICS, type HistoryMetric } from './pulseState';
import { DAY_LENGTH } from './pulseConst';
import { buildingId } from './inventory';

/**
 * Read-only agent tools that explain the city rather than list it: the advisor's advice, trends over time,
 * where the money goes, crises and how to prepare, and which building types serve a need best. Pure sim, so
 * tests and headless agents run them; they let a small model answer "why" and "what should I build" with
 * facts instead of guesses.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;
/** Sim seconds between history samples (pulse history). */
const HISTORY_STEP = 10;

export const NEEDS = ['energy', 'water', 'food', 'homes', 'jobs', 'ecology', 'harmony'] as const;
type Need = (typeof NEEDS)[number];

/** What one building of `def` adds toward a need (at full occupancy and greenery). */
function provides(need: Need, s: ReturnType<typeof buildings.get>['stats']): number {
  switch (need) {
    case 'energy':
      return Math.max(0, s.energy);
    case 'water':
      return Math.max(0, s.water);
    case 'food':
      return s.food;
    case 'homes':
      return s.population;
    case 'jobs':
      return s.jobs;
    case 'ecology':
      return s.eco;
    case 'harmony':
      return s.happiness;
  }
}

export const insightTools: AgentTool<SimCtx, never>[] = [
  {
    name: 'advisor_tips',
    option: 'Get the advisor’s current advice (problems ranked, with remedies)',
    description:
      'The Flora-Net advisor’s current advisories, most severe first: what is wrong, why it matters, and the suggested remedy (often a building type to place).',
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      return evaluateAdvisor(city)
        .slice(0, 8)
        .map((a) => ({
          severity: a.severity,
          title: a.title,
          detail: a.detail,
          fix: a.fix,
          build: a.build,
          near: a.focus ? { x: Math.round(a.focus.x), z: Math.round(a.focus.z) } : undefined,
          id: a.focus?.eid !== undefined ? buildingId(city, a.focus.eid) : undefined,
        }));
    },
  },
  {
    name: 'city_trends',
    option: 'See how a measure has changed over time (improving or worsening)',
    description: `How city measures moved over the last few sim-minutes (one sample per ${HISTORY_STEP} sim-seconds): first, last, change and direction. Metrics: ${HISTORY_METRICS.join(', ')}.`,
    input: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: HISTORY_METRICS, description: 'One metric; all when omitted.' },
        samples: {
          type: 'integer',
          minimum: 2,
          maximum: 240,
          description: 'How many recent samples (default 18 = 3 sim-minutes).',
        },
      },
    },
    effect: 'read',
    run({ city }, a: { metric?: HistoryMetric; samples?: number }) {
      const n = a.samples ?? 18;
      const one = (m: HistoryMetric) => {
        const h = city.pulse.history[m].slice(-n);
        if (h.length < 2) return { metric: m, note: 'Not enough history yet.' };
        const [first, last] = [h[0]!, h[h.length - 1]!];
        const change = last - first;
        const scale = Math.max(1e-6, ...h.map(Math.abs));
        const direction = Math.abs(change) / scale < 0.02 ? 'steady' : change > 0 ? 'rising' : 'falling';
        return {
          metric: m,
          first: r2(first),
          last: r2(last),
          change: r2(change),
          min: r2(Math.min(...h)),
          max: r2(Math.max(...h)),
          direction,
          overSeconds: (h.length - 1) * HISTORY_STEP,
        };
      };
      return a.metric ? one(a.metric) : HISTORY_METRICS.map(one);
    },
  },
  {
    name: 'budget_breakdown',
    option: 'Show where the money comes from and goes (taxes, upkeep by category, loans)',
    description:
      'Income and spending per sim-second: resident and worker tax, upkeep by building category, loan repayments, and the net; plus loans outstanding and how long the treasury lasts at this rate.',
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      const s = city.stats;
      const p = city.pulse;
      const upkeep: Partial<Record<BuildingCategory, number>> = {};
      for (const eid of city.buildingEntities()) {
        const d = buildings.at(Building.def[eid]!);
        upkeep[d.category] = (upkeep[d.category] ?? 0) + d.stats.upkeep;
      }
      const net = s.income - s.upkeep - s.debtService;
      return {
        credits: Math.round(city.credits),
        taxPercent: Math.round(p.taxRate * 100),
        income: {
          residentTax: r2(s.population * 0.6 * p.taxRate * INCOME_SCALE),
          workerTax: r2(s.employed * 0.4 * p.taxRate * INCOME_SCALE),
          total: r2(s.income),
        },
        spending: {
          upkeepPaid: r2(s.upkeep),
          upkeepByCategory: Object.fromEntries(
            (Object.entries(upkeep) as [BuildingCategory, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([c, v]) => [CATEGORY_LABELS[c], r2(v)]),
          ),
          loanRepayments: r2(s.debtService),
        },
        netPerSecond: r2(net),
        loans: city.steward.loans.map((l) => ({
          id: l.id,
          remaining: Math.round(l.remaining),
          perSecond: r2(l.payment),
        })),
        runwaySimMinutes: net < 0 ? r2(city.credits / -net / 60) : null,
      };
    },
  },
  {
    name: 'crisis_status',
    option: 'Check crises (active and forecast) and how to prepare',
    description:
      'Active and forecast crises: what each is, its phase, seconds until it starts or ends, where it hits, and what the steward can do.',
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      const tickSeconds = 0.1;
      return {
        crises: city.steward.crises.map((c) => {
          const d = getCrisis(c.def);
          return {
            crisis: c.def,
            name: d.name,
            phase: c.phase,
            severity: r2(c.severity),
            startsInSeconds:
              c.startTick > city.tick ? Math.round((c.startTick - city.tick) * tickSeconds) : 0,
            endsInSeconds: Math.max(0, Math.round((c.endTick - city.tick) * tickSeconds)),
            where:
              c.x !== undefined
                ? {
                    x: Math.round(c.x),
                    z: Math.round(c.z!),
                    radius: c.radius,
                    district: city.districtAt(Math.round(c.x), Math.round(c.z!)),
                  }
                : 'citywide',
            about: d.description,
            prepare: d.prep,
          };
        }),
        dayLengthSeconds: DAY_LENGTH,
      };
    },
  },
  {
    name: 'building_types',
    option: 'Compare building types for a need (energy, water, food, homes, jobs…) by value',
    description: `Which building types best serve a need (${NEEDS.join(', ')}), ranked by output per credit: cost, output, upkeep, footprint, placement rules. Use before building.`,
    input: {
      type: 'object',
      properties: {
        need: { type: 'string', enum: NEEDS },
        limit: { type: 'integer', minimum: 1, maximum: 12 },
      },
      required: ['need'],
    },
    effect: 'read',
    run({ city }, a: { need: Need; limit?: number }) {
      return {
        need: a.need,
        credits: Math.round(city.credits),
        types: buildings
          .all()
          .filter((d) => d.variants !== 1 && provides(a.need, d.stats) > 0)
          .map((d) => ({ d, out: provides(a.need, d.stats) }))
          .sort((x, y) => y.out / y.d.stats.cost - x.out / x.d.stats.cost)
          .slice(0, a.limit ?? 5)
          .map(({ d, out }) => ({
            type: d.id,
            name: d.name,
            category: CATEGORY_LABELS[d.category],
            output: out,
            cost: d.stats.cost,
            perThousandCredits: r2((out / d.stats.cost) * 1000),
            upkeepPerSecond: r2(d.stats.upkeep),
            footprint: d.footprint,
            ...(d.placement?.nearWater && { mustTouchWater: true }),
            ...(d.stats.energy < 0 && { usesEnergy: -d.stats.energy }),
            ...(d.stats.pollution > 0 && { pollution: d.stats.pollution }),
            affordable: city.credits >= d.stats.cost,
          })),
      };
    },
  },
];
