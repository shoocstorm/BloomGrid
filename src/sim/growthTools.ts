import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import { PROJECTS, PROJECT_IDS, projectProgress, projectStatus } from './projects';
import { WONDERS } from './wonders';
import { CATCH_VALUE } from './fishing';
import type { UnlockId } from './growthState';

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
      'The city\'s goals: each unlock project (Sky-lane charter, Aeroline, Flora) with its status (open, running with progress, ready to start, blocked), cost and criteria met or not; the fish stock and fishing income; the sea wonders discovered and what reveals the rest. Use for "what should I aim for", "how do I unlock the Aeroline", "is the fishing OK".',
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
    ],
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      const g = city.growth;
      if (!g.progression)
        return {
          progression: false,
          note: 'This city has everything unlocked (showcase); there are no projects to earn.',
        };
      return {
        city: g.name,
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
