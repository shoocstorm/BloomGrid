import type { CommandRecord } from '@/core/Commands';
import { buildings } from '@/content';
import type { BuildingDef } from '@/content/types';
import { Building, Service } from '@/ecs/components';
import type { City } from './City';
import { findSites, type Site } from './actionTools';
import { unavailable } from './buildGate';
import { charterBlock } from './charters';
import { netIncome } from './finance';
import { getPolicy, isActive, policyBlock, policyCost } from './policies';
import { busiest, proposeBuilds, sizeFor, type ProposalFocus } from './proposals';
import { TAX_MAX } from './pulseState';

/**
 * Flora's plans (plan v5, Phase 29): an ordered list of commands toward one goal (builds, ordinances, budgets, tax,
 * switches, a charter) that the steward approves with one click. The console runs it as one `batch` (D-091), so one
 * undo reverts the whole plan. Worked out here, not by the model: each step names why, its cost and the exact
 * command records. Steps are kept within the treasury (a step that does not fit is listed as skipped), and steps the
 * steward declined recently are left out (`avoid`: Flora's memory, kept by the assistant module). Pure.
 */

export type PlanGoal = 'fix' | 'carbon-zero' | 'harmony' | 'budget';
export const PLAN_GOALS: readonly PlanGoal[] = ['fix', 'carbon-zero', 'harmony', 'budget'];

export interface PlanStep {
  /** Stable key for memory ("build:solar-spire", "policy:night-sky"). */
  key: string;
  kind: 'build' | 'policy' | 'budget' | 'tax' | 'switch' | 'charter';
  /** What it does ("Build 2× Solar Spire in Westbrook"). */
  label: string;
  why: string;
  /** Credits it spends now (enact fees and buildings). */
  cost: number;
  records: CommandRecord[];
  /** Where it happens (Locate). */
  at?: { x: number; z: number };
}

export interface Plan {
  goal: PlanGoal;
  title: string;
  /** What the plan should achieve, in a line. */
  summary: string;
  steps: PlanStep[];
  cost: number;
  /** Steps left out: over budget, or declined recently. */
  skipped: string[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const centreOf = (e: number) => ({ x: Building.x[e]! + Building.w[e]! / 2, z: Building.z[e]! + Building.d[e]! / 2 });

/** Up to `count` non-overlapping lots for `def` near `centre` (each build in a batch needs its own). */
export function lotsFor(city: City, def: BuildingDef, centre: { x: number; z: number }, count: number): Site[] {
  const out: Site[] = [];
  for (const s of findSites(city, def, centre, count * 6)) {
    const [w, d] = city.footprint(def, s.rot);
    // One tile of air between lots, so a later lot never blocks an earlier one's frontage.
    const clear = out.every((o) => {
      const [ow, od] = city.footprint(def, o.rot);
      return s.x + w + 1 <= o.x || o.x + ow + 1 <= s.x || s.z + d + 1 <= o.z || o.z + od + 1 <= s.z;
    });
    if (clear) out.push(s);
    if (out.length >= count) break;
  }
  return out;
}

function buildStep(city: City, def: BuildingDef, count: number, centre: { x: number; z: number }, why: string): PlanStep | null {
  const lots = lotsFor(city, def, centre, count);
  if (!lots.length) return null;
  return {
    key: `build:${def.id}`,
    kind: 'build',
    label: `Build ${lots.length > 1 ? `${lots.length}× ` : ''}${def.name} in ${lots[0]!.district}`,
    why,
    cost: lots.length * def.stats.cost,
    records: lots.map((s) => ({ type: 'build', payload: { def: def.id, x: s.x, z: s.z, rot: s.rot, by: 'flora' } })),
    at: { x: lots[0]!.x, z: lots[0]!.z },
  };
}

function policyStep(city: City, id: string, why: string): PlanStep | null {
  const p = getPolicy(id);
  if (!p || isActive(city, id) || policyBlock(city, id, true)) return null;
  return {
    key: `policy:${id}`,
    kind: 'policy',
    label: `Enact ${p.name}`,
    why: `${why} ${p.upside} (Trade-off: ${p.downside})`,
    cost: p.enact,
    records: [{ type: 'setPolicy', payload: { id, on: true } }],
  };
}

function charterStep(city: City, id: string, name: string): PlanStep | null {
  if (charterBlock(city, id)) return null;
  return {
    key: `charter:${id}`,
    kind: 'charter',
    label: `Take up the ${name} charter`,
    why: 'Progress only counts once it is under way.',
    cost: 0,
    records: [{ type: 'setCharter', payload: { id, on: true } }],
  };
}

/** Energy producers that pull the clean share down (polluting, not paired in a symbiosis). */
export function dirtyPlants(city: City): number[] {
  return city
    .buildingEntities()
    .filter((e) => {
      const d = city.buildingDef(e);
      return d.stats.energy > 0 && !d.cleanEnergy && !(d.stats.pollution <= 0 && !d.symbiosis) && !Service.paired[e] && !Service.off[e];
    })
    .sort((a, b) => Building.uid[a]! - Building.uid[b]!);
}

function stepsFor(city: City, goal: PlanGoal): { title: string; summary: string; steps: (PlanStep | null)[] } {
  const steps: (PlanStep | null)[] = [];
  const s = city.stats;
  switch (goal) {
    case 'carbon-zero': {
      const dirty = dirtyPlants(city);
      const dirtyOut = dirty.reduce((a, e) => a + city.buildingDef(e).stats.energy, 0);
      // Clean power for what the dirty plants make, plus a margin if the grid is already tight.
      const need = dirtyOut + Math.max(0, s.energyUsed * 1.1 - s.energyProduced);
      const clean = buildings.all().filter((d) => d.stats.energy > 0 && (d.cleanEnergy || (d.stats.pollution <= 0 && !d.symbiosis)) && !d.landmark && !unavailable(city, d.id));
      if (need > 0) {
        const best = sizeFor(city, clean, (d) => d.stats.energy, need)[0];
        if (best) steps.push(
            buildStep(
              city,
              best.def,
              best.count,
              busiest(city),
              dirtyOut > 0
                ? `Replaces ${fmt(dirtyOut)} energy from polluting plants${need > dirtyOut ? ' and adds a margin' : ''}.`
                : `A clean margin for a tight grid (power at ${Math.round(city.pulse.energyRatio * 100)}% of demand).`,
            ),
          );
      }
      for (const e of dirty.slice(0, 6)) {
        const d = city.buildingDef(e);
        const c = centreOf(e);
        const at = { x: Building.x[e]!, z: Building.z[e]! };
        steps.push({
          key: `switch:${d.id}`,
          kind: 'switch',
          label: d.interact ? `Switch off ${d.name}` : `Return ${d.name} to nature`,
          why: `It burns or pollutes for ${fmt(d.stats.energy)} energy.`,
          cost: 0,
          records: [d.interact ? { type: 'toggleBuilding', payload: { ...at, off: true } } : { type: 'demolish', payload: at }],
          at: c,
        });
      }
      steps.push(charterStep(city, 'carbon-zero', 'Carbon-zero'));
      return {
        title: 'Carbon-zero plan',
        summary: dirty.length
          ? `Replace ${dirty.length} polluting plant${dirty.length === 1 ? '' : 's'} with clean power, then hold it for the charter.`
          : 'The grid is already clean: build a margin if it is tight and start the Carbon-zero charter.',
        steps,
      };
    }
    case 'harmony': {
      for (const p of proposeBuilds(city, { focus: 'ecology', limit: 2 })) steps.push(buildStep(city, buildings.get(p.type), p.count, p.site, p.why));
      steps.push(policyStep(city, 'car-free-core', 'Calmer streets lift harmony.'));
      if (city.pulse.taxRate > 0.14)
        steps.push({ key: 'tax:down', kind: 'tax', label: `Lower resident tax to ${Math.round((city.pulse.taxRate - 0.02) * 100)}%`, why: 'Tax above the comfort band costs harmony.', cost: 0, records: [{ type: 'setTax', payload: { rate: city.pulse.taxRate - 0.02 } }] });
      return { title: 'Harmony plan', summary: 'Greener streets, calmer traffic and a lighter tax bill.', steps };
    }
    case 'budget': {
      if (city.pulse.taxRate < 0.14)
        steps.push({ key: 'tax:up', kind: 'tax', label: `Raise resident tax to ${Math.round((city.pulse.taxRate + 0.02) * 100)}%`, why: `More income; harmony ${Math.round(s.happiness)} can bear it.`, cost: 0, records: [{ type: 'setTax', payload: { rate: Math.min(TAX_MAX, city.pulse.taxRate + 0.02) } }] });
      // Repeal the costliest ordinance if they run at a loss.
      if (policyCost(city) > 0 && netIncome(city) < 0) {
        const [id] = Object.keys(city.policies.active).sort((a, b) => (getPolicy(b)?.perSec(city) ?? 0) - (getPolicy(a)?.perSec(city) ?? 0));
        const p = id ? getPolicy(id) : undefined;
        if (p && !policyBlock(city, p.id, false))
          steps.push({ key: `repeal:${p.id}`, kind: 'policy', label: `Repeal ${p.name}`, why: `Saves ◈${p.perSec(city).toFixed(1)}/s.`, cost: 0, records: [{ type: 'setPolicy', payload: { id: p.id, on: false } }] });
      }
      if (city.policies.budget.maintenance > 0.9)
        steps.push({ key: 'budget:maintenance', kind: 'budget', label: 'Trim the maintenance budget to 90%', why: 'Saves a tenth of upkeep; buildings age a little faster.', cost: 0, records: [{ type: 'setBudget', payload: { sector: 'maintenance', value: 0.9 } }] });
      steps.push(policyStep(city, 'tourist-levy', 'Visitors pay their way.'));
      return { title: 'Budget plan', summary: 'More income and fewer running costs, without building anything.', steps };
    }
    default: {
      // Fix what is failing: the build proposals, then an ordinance that answers a forecast shortfall.
      const focus: ProposalFocus = 'any';
      for (const p of proposeBuilds(city, { focus, limit: 3 })) steps.push(buildStep(city, buildings.get(p.type), p.count, p.site, `${p.why}: ${p.gain}.`));
      if (city.pulse.tiers.energy >= 2) steps.push(policyStep(city, 'night-sky', 'Power is short.'));
      if (city.pulse.tiers.water >= 2) steps.push(policyStep(city, 'rainwater-code', 'Water is short.'));
      return { title: 'Recovery plan', summary: 'Fix what is failing now, cheapest effective fixes first.', steps };
    }
  }
}

/** A plan toward `goal`, within the treasury, leaving out what the steward declined recently. */
export function proposePlan(city: City, goal: PlanGoal = 'fix', avoid: ReadonlySet<string> = new Set()): Plan {
  const { title, summary, steps } = stepsFor(city, goal);
  const out: PlanStep[] = [];
  const skipped: string[] = [];
  let budget = city.credits;
  for (const st of steps) {
    if (!st) continue;
    if (avoid.has(st.key)) {
      skipped.push(`${st.label} (declined recently)`);
      continue;
    }
    if (st.cost > budget) {
      skipped.push(`${st.label} (needs ◈${fmt(st.cost)}, ◈${fmt(Math.max(0, budget))} left)`);
      continue;
    }
    budget -= st.cost;
    out.push(st);
  }
  return { goal, title, summary, steps: out, cost: out.reduce((a, s) => a + s.cost, 0), skipped };
}

/** A plan's commands as one batch record list. */
export const planRecords = (p: Plan): CommandRecord[] => p.steps.flatMap((s) => s.records);
