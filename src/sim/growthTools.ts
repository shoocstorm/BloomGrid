import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import { PROJECTS, PROJECT_IDS, projectProgress, projectStatus } from './projects';
import { WONDERS } from './wonders';
import { CATCH_VALUE } from './fishing';
import type { UnlockId } from './growthState';
import type { City } from './City';
import { CHARTERS, MAX_ACTIVE, TIER_NAMES, charterValue, claimable, fmtValue, titles } from './charters';
import { eraOf, nextEra } from './eras';
import { stewardLegacy } from './legacy';
import { objectiveViews } from './objectives';

/** Long-term goals (plan v5, Phase 28): the era, the live legacy score, charters and a challenge's objectives. */
function longTerm(city: City) {
  const st = city.charters;
  const l = stewardLegacy(city);
  const n = nextEra(city);
  const objectives = objectiveViews(city);
  return {
    era: eraOf(city).name,
    nextEra: n ? { name: n.era.name, needs: n.needs.map((x) => `${Math.min(x.have, x.need)} / ${x.need} ${x.label}`) } : 'Bloom is the last era',
    legacy: { score: l.score, rank: l.rank.title, stars: l.stars, titles: titles(city) },
    charters: {
      note: `Take up to ${MAX_ACTIVE} at a time (Build → Goals); only those under way make progress, and dropping one resets it.`,
      list: CHARTERS.map((d) => {
        const reached = st.reached[d.id] ?? 0;
        const next = d.tiers[Math.min(2, reached)]!;
        return {
          name: d.name,
          goal: d.description,
          underWay: st.active.includes(d.id),
          reached: reached ? TIER_NAMES[reached - 1] : 'none',
          ...(claimable(city, d.id) > 0 ? { readyToClaim: true } : {}),
          ...(reached < 3
            ? { next: `${TIER_NAMES[reached]}: ${st.active.includes(d.id) ? `${fmtValue(d, charterValue(city, d))} of ` : ''}${fmtValue(d, next.need)}`, how: d.lever }
            : {}),
        };
      }),
    },
    ...(objectives.length
      ? { challenge: { status: st.challenge!.status, objectives: objectives.map((o) => `${o.done ? '✓' : '✗'} ${o.spec.label}: ${o.status}${o.left !== null ? ` (${Math.round(o.left / 60)} min left)` : ''}`) } }
      : {}),
  };
}

/**
 * Progression for the city assistant (Phase 22): what the steward is growing toward on a fresh island (unlock
 * projects and their criteria, the fish stock, sea wonders still to discover) and starting a project. On the
 * showcase city everything is already open and the tools say so.
 */
export const growthTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'goals_status',
    option: 'What to grow toward: unlock projects, the fish stock, undiscovered wonders',
    description:
      'The city\'s goals: the era and what the next needs, the live legacy score and rank, the civic charters (Carbon-zero, Ten Thousand Voices, Resilient Isle…: under way, tiers reached, how to progress) and a challenge scenario\'s objectives; then each unlock project (Sky-lane charter, Aeroline, Flora) with its status (open, running with progress, ready to start, blocked), cost and criteria met or not; the fish stock and fishing income; the sea wonders discovered and what reveals the rest. Use for "what should I aim for", "how do I unlock the Aeroline", "is the fishing OK".',
    keywords: [
      'goal',
      'goals',
      'unlock',
      'locked',
      'project',
      'charter',
      'aeroline',
      'fishing',
      'fish',
      'wonder',
      'progress',
      'next',
      'era',
      'legacy',
      'score',
      'title',
      'challenge',
    ],
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      const g = city.growth;
      if (!g.progression)
        return {
          progression: false,
          note: 'This city has everything unlocked (showcase); there are no projects to earn.',
          ...longTerm(city),
        };
      return {
        city: g.name,
        ...longTerm(city),
        projects: PROJECT_IDS.map((id) => {
          const def = PROJECTS[id];
          const status = projectStatus(city, id);
          const run = g.projects.find((p) => p.id === id);
          return {
            id,
            name: def.name,
            status,
            ...(run ? { progress: `${Math.round(projectProgress(city, run) * 100)}%` } : {}),
            cost: def.cost,
            days: def.days,
            unlocks: def.unlocks,
            ...(status === 'open' || status === 'running'
              ? {}
              : { criteria: def.criteria(city).map((c) => `${c.ok ? '✓' : '✗'} ${c.label}`) }),
          };
        }),
        fishing: {
          stock: `${Math.round(g.fish * 100)}%`,
          incomePerSecond: Math.round(city.stats.fishing * 10) / 10,
          note:
            g.fish < 0.4
              ? 'Overfished: fewer boats (or a pause) lets the stock regrow; a clean coast keeps it healthy.'
              : `Each staffed boat earns up to ◈${CATCH_VALUE}/s at full stock; two or three docks fish best.`,
        },
        wonders: {
          discovered: WONDERS.filter((w) => g.wonders.includes(w.id)).map((w) => w.name),
          hidden: WONDERS.filter((w) => !g.wonders.includes(w.id)).map((w) => `${w.name}: ${w.hint}`),
        },
      };
    },
  },
  {
    name: 'start_project',
    option: 'Start an unlock project (Sky-lane charter, the Aeroline)',
    description:
      'Starts an unlock project once its criteria are met and the credits cover it: "skylanes" (the Sky-lane charter: pod docks and hubs), "aeroline" (the maglev loop and its stations). It costs credits now and finishes after some sim days. Undoable until it finishes.',
    keywords: ['start', 'begin', 'unlock', 'charter', 'project', 'aeroline', 'sky-lanes', 'skylanes'],
    llmArgs: ['id'],
    input: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          enum: [...PROJECT_IDS],
          description: 'The project: "skylanes", "aeroline" or "flora".',
        },
      },
      required: ['id'],
    },
    effect: 'mutate',
    run({ city, commands }, { id }: { id: UnlockId }) {
      const def = PROJECTS[id];
      if (!def) throw new Error(`No project "${id}". Projects: ${PROJECT_IDS.join(', ')}`);
      const status = projectStatus(city, id);
      if (status === 'open') return { project: def.name, note: 'Already done.' };
      if (status === 'running') return { project: def.name, note: 'Already under way.' };
      if (status === 'blocked') {
        const missing = def
          .criteria(city)
          .filter((c) => !c.ok)
          .map((c) => c.label);
        if (city.credits < def.cost)
          missing.push(`◈${def.cost} to pay for it (credits ◈${Math.round(city.credits)})`);
        throw new Error(`${def.name} can't start yet: ${missing.join('; ')}.`);
      }
      if (!commands.execute('startProject', { id }))
        throw new Error(`The city refused to start ${def.name}.`);
      return {
        started: def.name,
        cost: def.cost,
        days: def.days,
        unlocks: def.unlocks,
        credits: Math.round(city.credits),
      };
    },
  },
];
