import type { CommandStack } from '@/core/Commands';
import type { City } from './City';
import type { ConsequenceMods } from './consequenceState';
import { isOpen } from './growthState';
import { BUDGET_MAX, BUDGET_MIN, BUDGET_SECTORS, type BudgetSector } from './policyState';
import { PULSE_TICKS } from './pulseConst';
import { TAX_MAX, TAX_MIN } from './pulseState';
import type { SimCtx } from './systems';

/**
 * Policies (plan v5, Phase 25): ordinances the steward enacts, each with an upside, a downside and a running cost,
 * plus sector budgets and the business tax. Effects go through the consequence modifiers (`city.consequences.mods`,
 * rebuilt every pulse and read on the next), so every system that already reads mods answers them. Pure and
 * deterministic; state in `policyState.ts` (saved v20, hashed).
 */

export type PolicyId =
  | 'car-free-core'
  | 'night-sky'
  | 'fishing-quota'
  | 'green-roofs'
  | 'four-day-week'
  | 'tourist-levy'
  | 'rainwater-code'
  | 'free-transit';

export interface PolicyDef {
  id: PolicyId;
  name: string;
  icon: string;
  /** What it does for the city, and what it costs it, in a line each (cards, Flora, the guide). */
  upside: string;
  downside: string;
  /** One-off credits to enact it. */
  enact: number;
  /** Running cost in credits per second (may depend on the city). */
  perSec(city: City): number;
  /** Why it cannot be enacted now (null: it can). */
  requires?(city: City): string | null;
  apply(mods: ConsequenceMods, city: City): void;
}

/** Sim seconds an ordinance must stay as it is before it can change again. */
export const POLICY_COOLDOWN = 60;
/** Residents a fresh island needs before the council will hear ordinances. */
export const POLICY_POPULATION = 500;

export const POLICIES: PolicyDef[] = [
  {
    id: 'car-free-core',
    name: 'Car-free core',
    icon: 'traffic',
    upside: 'A quarter less highway traffic (smoother commutes) and calmer streets: +2 harmony.',
    downside: 'Shops lose drive-in trade: business tax brings in 5% less.',
    enact: 1500,
    perSec: () => 0.5,
    apply(m) {
      m.trafficLoad *= 0.75;
      m.harmony += 2;
      m.workerTax *= 0.95;
    },
  },
  {
    id: 'night-sky',
    name: 'Night-sky ordinance',
    icon: 'moon',
    upside: 'Dimmer streets and façades after dark: the city uses 6% less energy.',
    downside: 'Night life glows 40% less and night visitors spend 15% less.',
    enact: 800,
    perSec: () => 0,
    apply(m) {
      m.energyDemand *= 0.94;
      m.nightGlow *= 0.6;
      m.tourismMul *= 0.85;
    },
  },
  {
    id: 'fishing-quota',
    name: 'Fishing quota',
    icon: 'food',
    upside: 'Boats fish 30% less, so the fish stock recovers.',
    downside: 'The catch sells for 30% less while the quota holds.',
    enact: 600,
    perSec: () => 0,
    requires: (c) =>
      c.buildingEntities().some((e) => !!c.buildingDef(e).fishing) ? null : 'The city has no fishing docks.',
    apply(m) {
      m.fishEffort *= 0.7;
    },
  },
  {
    id: 'green-roofs',
    name: 'Green-roof mandate',
    icon: 'leaf',
    upside: 'Planted roofs cool the city: heat fires 40% rarer, heatwaves 30% less likely.',
    downside: 'Roof gardens need tending: about ◈0.002/s for every building.',
    enact: 2000,
    perSec: (c) => c.stats.buildings * 0.002,
    apply(m) {
      m.heatFire *= 0.6;
      m.crisis.heatwave = (m.crisis.heatwave ?? 1) * 0.7;
    },
  },
  {
    id: 'four-day-week',
    name: 'Four-day week',
    icon: 'calendar',
    upside: 'Rested residents: +4 harmony.',
    downside: 'Workplaces produce less: business tax brings in 10% less.',
    enact: 1000,
    perSec: () => 0,
    apply(m) {
      m.harmony += 4;
      m.workerTax *= 0.9;
    },
  },
  {
    id: 'tourist-levy',
    name: 'Tourist levy',
    icon: 'credits',
    upside: 'Visitors pay a levy: tourism brings in 30% more.',
    downside: 'Some stop coming: the city’s reputation slips a little every day.',
    enact: 500,
    perSec: () => 0,
    apply(m) {
      m.tourismMul *= 1.3;
      m.reputationDrift -= 0.15;
    },
  },
  {
    id: 'rainwater-code',
    name: 'Rainwater code',
    icon: 'drops',
    upside: 'Every roof harvests rain: water supply 8% higher.',
    downside: 'Cisterns and filters to service: ◈3/s.',
    enact: 1200,
    perSec: () => 3,
    apply(m) {
      m.waterSupply *= 1.08;
    },
  },
  {
    id: 'free-transit',
    name: 'Free sky-pods',
    icon: 'pod',
    upside: 'Free fares move commuters into pods: highway traffic 15% lower, +1.5 harmony.',
    downside: 'The city pays the fares: about ◈1/s for every 2,000 pod riders.',
    enact: 1500,
    perSec: (c) => c.pulse.podRiders * 0.0005,
    requires: (c) => (isOpen(c.growth, 'skylanes') ? null : 'Needs the Sky-lane charter (pod docks).'),
    apply(m) {
      m.trafficLoad *= 0.85;
      m.harmony += 1.5;
    },
  },
];

export const POLICY_IDS = POLICIES.map((p) => p.id);
export const getPolicy = (id: string): PolicyDef | undefined => POLICIES.find((p) => p.id === id);
export const isActive = (city: City, id: string): boolean => city.policies.active[id] !== undefined;

/** Sim seconds until an ordinance may change again (0: now). */
export function cooldownLeft(city: City, id: string): number {
  const at = city.policies.changed[id];
  return at === undefined ? 0 : Math.max(0, POLICY_COOLDOWN - (city.tick - at) / PULSE_TICKS);
}

/** Why the council will not hear ordinances yet (fresh islands), or null. */
export function policiesLocked(city: City): string | null {
  return city.growth.progression && city.stats.population < POLICY_POPULATION
    ? `The council hears ordinances from ${POLICY_POPULATION} residents (now ${Math.floor(city.stats.population)}).`
    : null;
}

/** Why `id` cannot be switched to `on` now, or null when it can. */
export function policyBlock(city: City, id: string, on = !isActive(city, id)): string | null {
  const p = getPolicy(id);
  if (!p) return `No ordinance called ${id}.`;
  if (on === isActive(city, id)) return on ? `${p.name} is already in force.` : `${p.name} is not in force.`;
  const wait = cooldownLeft(city, id);
  if (wait > 0) return `${p.name} changed recently: wait ${Math.ceil(wait)} s.`;
  if (!on) return null;
  const locked = policiesLocked(city);
  if (locked) return locked;
  const req = p.requires?.(city);
  if (req) return req;
  if (city.credits < p.enact)
    return `Enacting it costs ◈${p.enact.toLocaleString('en-US')}; the city has ◈${Math.floor(city.credits).toLocaleString('en-US')}.`;
  return null;
}

/** Running cost of every ordinance in force (credits per second). */
export function policyCost(city: City): number {
  let s = 0;
  for (const p of POLICIES) if (isActive(city, p.id)) s += p.perSec(city);
  return s;
}

/**
 * Once per pulse, from `updateConsequences`: ordinances and sector budgets write their modifiers, and the running
 * cost is charged (booked in `stats.policyCost`, part of `netIncome`).
 */
export function applyPolicies(city: City, mods: ConsequenceMods): void {
  for (const p of POLICIES) if (isActive(city, p.id)) p.apply(mods, city);
  const b = city.policies.budget;
  // Emergency response: crews and stations funded above or below plan put fires out faster or slower.
  mods.fireSpread *= 1.5 - 0.5 * b.response;
  // Ecology: park crews keep gardens in bloom; cuts let them fade.
  mods.bloomLoss += (1 - b.ecology) * 0.1;
  mods.natureEco *= 0.6 + 0.4 * b.ecology;
  const cost = policyCost(city);
  city.stats.policyCost = cost;
  city.credits -= cost;
}

/** Which budget sector a building's upkeep belongs to. */
export function sectorOf(def: { category: string; response?: unknown }): BudgetSector {
  return def.response ? 'response' : def.category === 'nature' ? 'ecology' : 'maintenance';
}

export interface PolicyPayload {
  id: string;
  on: boolean;
}

interface PolicyUndo {
  since: number | undefined;
  changed: number | undefined;
  fee: number;
}

export function registerPolicyCommands(stack: CommandStack<SimCtx>): void {
  stack.register<PolicyPayload, PolicyUndo>('setPolicy', {
    apply({ city }, p) {
      const def = getPolicy(p.id);
      if (!def || policyBlock(city, p.id, p.on)) return null;
      const st = city.policies;
      const undo: PolicyUndo = {
        since: st.active[p.id],
        changed: st.changed[p.id],
        fee: p.on ? def.enact : 0,
      };
      if (p.on) {
        st.active[p.id] = city.tick;
        city.credits -= def.enact;
      } else delete st.active[p.id];
      st.changed[p.id] = city.tick;
      city.bus.emit('policy:changed', { id: p.id, on: p.on });
      return undo;
    },
    revert({ city }, p, u) {
      const st = city.policies;
      if (u.since === undefined) delete st.active[p.id];
      else st.active[p.id] = u.since;
      if (u.changed === undefined) delete st.changed[p.id];
      else st.changed[p.id] = u.changed;
      city.credits += u.fee;
      city.bus.emit('policy:changed', { id: p.id, on: !p.on });
    },
  });

  stack.register<{ sector: BudgetSector; value: number }, number>('setBudget', {
    apply({ city }, p) {
      if (!BUDGET_SECTORS.includes(p.sector)) return null;
      const v = Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.round(p.value * 20) / 20));
      const prev = city.policies.budget[p.sector];
      if (v === prev) return null;
      city.policies.budget[p.sector] = v;
      return prev;
    },
    revert({ city }, p, prev) {
      city.policies.budget[p.sector] = prev;
    },
  });

  stack.register<{ rate: number }, number>('setBusinessTax', {
    apply({ city }, p) {
      const rate = Math.min(TAX_MAX, Math.max(TAX_MIN, Math.round(p.rate * 100) / 100));
      const prev = city.policies.businessRate;
      if (rate === prev) return null;
      city.policies.businessRate = rate;
      return prev;
    },
    revert({ city }, _p, prev) {
      city.policies.businessRate = prev;
    },
  });
}

/** Hash fragment for `City.hash()`. */
export function policyHash(city: City): string {
  const st = city.policies;
  const active = Object.keys(st.active)
    .sort()
    .map((k) => `${k}@${st.active[k]}`)
    .join(',');
  const changed = Object.keys(st.changed)
    .sort()
    .map((k) => `${k}@${st.changed[k]}`)
    .join(',');
  return `${active}|${changed}|${BUDGET_SECTORS.map((s) => st.budget[s]).join(',')}|${st.businessRate}`;
}
