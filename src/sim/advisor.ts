import { query } from 'bitecs';
import { Building, Problem, Service } from '@/ecs/components';
import type { City } from './City';
import { TIERS, type Tier } from './pulseState';

export type Severity = 0 | 1 | 2; // info, warning, critical

export interface Advisory {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Suggested remedy, phrased as an action. */
  fix: string;
  /** Where to look (tile coords), and optionally a building to select there. */
  focus?: { x: number; z: number; eid?: number };
  /** One-click remedy: start placing this building definition. */
  build?: string;
}

export type AdvisorRule = (city: City) => Advisory | null;

const rules: AdvisorRule[] = [];

/** Feature modules add their own rules; the advisor evaluates all of them. */
export function registerAdvisorRule(rule: AdvisorRule): void {
  rules.push(rule);
}

/** All current advisories, most severe first (stable order within a severity). */
export function evaluateAdvisor(city: City): Advisory[] {
  const out: Advisory[] = [];
  for (const r of rules) {
    const a = r(city);
    if (a) out.push(a);
  }
  return out.sort((a, b) => b.severity - a.severity);
}

const severityOf = (t: Tier): Severity => (t >= 3 ? 2 : t >= 2 ? 1 : 0);
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** First building with a problem bit, and how many have it. */
function problemBuildings(city: City, bit: number): { count: number; focus?: Advisory['focus'] } {
  let count = 0;
  let focus: Advisory['focus'];
  for (const eid of query(city.world, [Building])) {
    if (!(Service.problems[eid]! & bit)) continue;
    if (!focus) focus = { x: Building.x[eid]! + Building.w[eid]! / 2, z: Building.z[eid]! + Building.d[eid]! / 2, eid };
    count++;
  }
  return { count, focus };
}

/** A highway tile near the coast: a good spot for intakes (water works). */
function coastalRoad(city: City): Advisory['focus'] {
  const g = city.grid;
  const shore = city.fields.shore;
  let best = -1;
  let bestD = Infinity;
  const cx = g.w / 2;
  const cz = g.h / 2;
  for (let i = 0; i < g.road.length; i++) {
    if (g.road[i] !== 1 || shore[i]! < 1 || shore[i]! > 2) continue;
    const d = Math.hypot((i % g.w) - cx, ((i / g.w) | 0) - cz);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best < 0 ? undefined : { x: (best % g.w) + 0.5, z: ((best / g.w) | 0) + 0.5 };
}

function hotspot(city: City, field: Float32Array): { value: number; focus: Advisory['focus'] } {
  let best = 0;
  for (let i = 1; i < field.length; i++) if (field[i]! > field[best]!) best = i;
  return { value: field[best]!, focus: { x: (best % city.grid.w) + 0.5, z: ((best / city.grid.w) | 0) + 0.5 } };
}

// ── Core rules ────────────────────────────────────────────────────────────────

registerAdvisorRule((city) => {
  const { count, focus } = problemBuildings(city, Problem.NO_ROAD);
  if (!count) return null;
  return {
    id: 'no-road',
    severity: count > 10 ? 2 : 1,
    title: `${count} building${count > 1 ? 's' : ''} cut off from the grid`,
    detail: 'Without a Living Highway touching them they get no power or water, and residents cannot reach work.',
    fix: 'Draw a Living Highway (G) to their edge.',
    focus,
  };
});

registerAdvisorRule((city) => {
  const t = city.pulse.tiers.energy;
  if (t < 2) return null;
  const { focus } = problemBuildings(city, Problem.NO_POWER);
  return {
    id: 'energy',
    severity: severityOf(t),
    title: `Energy grid ${TIERS[t]} (${pct(city.pulse.energyRatio)} of demand)`,
    detail: 'Brownouts dim homes, stall workplaces and stop water pumps.',
    fix: 'Build a Sunflower Spire (+40) or an Algae Bioreactor (+70) on a connected highway.',
    focus,
    build: 'solar-spire',
  };
});

registerAdvisorRule((city) => {
  const t = city.pulse.tiers.water;
  if (t < 2) return null;
  return {
    id: 'water',
    severity: severityOf(t),
    title: `Water supply ${TIERS[t]} (${pct(city.pulse.waterRatio)} of demand)`,
    detail: 'Dry taps make residents leave, and building gardens wither.',
    fix: 'Build NEWater Reclamation Works on the coast, next to a highway.',
    focus: coastalRoad(city),
    build: 'water-works',
  };
});

registerAdvisorRule((city) => {
  const t = city.pulse.tiers.food;
  if (t < 2) return null;
  return {
    id: 'food',
    severity: severityOf(t),
    title: `Food ${TIERS[t]} (${pct(city.pulse.foodRatio)} of residents fed)`,
    detail: 'Hungry residents lower harmony and move away.',
    fix: 'Build Orchard Stacks (feed 400 each).',
    build: 'vertical-farm',
  };
});

registerAdvisorRule((city) => {
  const u = city.pulse.unemployment;
  if (u < 0.1) return null;
  return {
    id: 'jobs',
    severity: u > 0.25 ? 2 : 1,
    title: `${pct(u)} of workers have no job`,
    detail: 'Unemployment drags harmony down and empties homes.',
    fix: 'Build workplaces: Mycelium Work Domes (40 jobs) or Bioreactors (20 jobs).',
    build: 'greenhouse-hub',
  };
});

registerAdvisorRule((city) => {
  const d = city.stats.demandHomes;
  if (d < 0.4) return null;
  return {
    id: 'homes',
    severity: 0,
    title: 'Residents want more homes',
    detail: 'Jobs outnumber workers; new homes will fill quickly.',
    fix: 'Build Garden Residences or Canopy Towers near workplaces.',
    build: 'garden-residence',
  };
});

registerAdvisorRule((city) => {
  const { value, focus } = hotspot(city, city.fields.pollution);
  if (value < 0.8) return null;
  return {
    id: 'pollution',
    severity: value > 1.5 ? 2 : 1,
    title: 'Pollution hotspot',
    detail: 'Polluted districts lose ecology and desirability; nearby homes empty.',
    fix: 'Pair the polluter with Bloom Parks, or let its living walls grow in (water it).',
    focus,
    build: 'pocket-park',
  };
});

registerAdvisorRule((city) => {
  const net = city.stats.income - city.stats.upkeep;
  if (net >= 0 && city.credits >= 0) return null;
  return {
    id: 'budget',
    severity: city.credits < 0 ? 2 : 1,
    title: city.credits < 0 ? 'The city is in debt' : `Running a deficit (${net.toFixed(1)}/s)`,
    detail: 'Upkeep exceeds tax income.',
    fix: 'Raise the tax rate a little (City Pulse panel), or return unused buildings to nature.',
  };
});

registerAdvisorRule((city) => {
  const t = city.pulse.tiers.harmony;
  if (t < 2) return null;
  const h = city.pulse.harmony;
  const factors: [string, number, string][] = [
    ['power & water', h.services, 'restore utilities'],
    ['unemployment', h.jobs, 'add workplaces'],
    ['food shortage', h.food, 'grow more food'],
    ['taxes', h.taxes, 'lower the tax rate'],
    ['ecology', h.ecology, 'add parks and greenery'],
  ];
  const worst = factors.sort((a, b) => a[1] - b[1])[0]!;
  return {
    id: 'harmony',
    severity: severityOf(t),
    title: `Harmony ${TIERS[t]} (${Math.round(city.stats.happiness)})`,
    detail: `The biggest drag is ${worst[0]} (${worst[1].toFixed(1)}).`,
    fix: `To recover, ${worst[2]}.`,
  };
});

registerAdvisorRule((city) => {
  const { count, focus } = problemBuildings(city, Problem.UNSTAFFED);
  const total = query(city.world, [Building]).length;
  if (count < 5 || count < total * 0.05) return null;
  return {
    id: 'staff',
    severity: 0,
    title: `${count} workplaces understaffed`,
    detail: 'Not enough workers: production and food output fall.',
    fix: 'Build homes near workplaces.',
    focus,
    build: 'garden-residence',
  };
});
