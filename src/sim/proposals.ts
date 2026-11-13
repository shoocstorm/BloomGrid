import { netIncome } from './finance';
import { query } from 'bitecs';
import { unavailable } from './buildGate';
import { buildings } from '@/content';
import { CATEGORY_LABELS, type BuildingCategory, type BuildingDef } from '@/content/types';
import { Building } from '@/ecs/components';
import type { City } from './City';
import { evaluateAdvisor, type Advisory } from './advisor';
import { findSites, type Site } from './actionTools';
import { activeRules } from './consequences';
import { SYSTEMS, TIERS } from './pulseState';
import { etaText, forecastFor } from './forecast';

/**
 * Build proposals (D-089): what Flora suggests building, worked out here rather than by the model. Each one
 * answers a diagnosed problem (an advisory, or a consequence rule in force) with a concrete, sized plan: the most
 * cost-effective unlocked type for the shortfall, how many (1–3) cover it with a margin, a valid lot near where it
 * is needed, the total cost, whether the treasury can pay, and what it should achieve ("+110 energy → 112%").
 * The console shows them as cards the steward builds with one click. Pure and deterministic.
 */

export type ProposalFocus = 'any' | 'energy' | 'water' | 'food' | 'jobs' | 'homes' | 'ecology' | 'traffic' | 'safety';
export const PROPOSAL_FOCUS: readonly ProposalFocus[] = ['any', 'energy', 'water', 'food', 'jobs', 'homes', 'ecology', 'traffic', 'safety'];

export interface BuildProposal {
  /** The problem it answers (advisory or rule id). */
  key: string;
  type: string;
  name: string;
  category: string;
  count: number;
  /** The problem, in a line. */
  why: string;
  /** What building it should achieve. */
  gain: string;
  cost: number;
  affordable: boolean;
  district: string;
  /** The first lot; the rest go on the nearest free lots around it. */
  site: Site;
  severity: number;
}

/** Advisories each focus covers. */
const FOCUS: Record<Exclude<ProposalFocus, 'any'>, string[]> = {
  energy: ['energy', 'forecast-energy'],
  water: ['water', 'forecast-water'],
  food: ['food', 'forecast-food'],
  jobs: ['jobs', 'staff'],
  homes: ['homes', 'staff'],
  ecology: ['pollution', 'bloom', 'dry-soil', 'symbiosis', 'harmony'],
  traffic: ['traffic'],
  safety: ['fire-cover'],
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Buildings the steward may place now (unlocked, not one-off landmarks). */
const usable = (city: City) => buildings.all().filter((d) => !d.landmark && !unavailable(city, d.id));

/**
 * Ways to cover `need` units of `stat` with at most 3 buildings of one type, best first: ones that cover it
 * before ones that don't, affordable first, then the cheapest total (or, short of covering, the most output).
 */
function sizeFor(city: City, defs: BuildingDef[], stat: (d: BuildingDef) => number, need: number): { def: BuildingDef; count: number }[] {
  const options = defs
    .filter((d) => stat(d) > 0)
    .map((d) => {
      const count = Math.max(1, Math.min(3, Math.ceil(need / stat(d))));
      return { def: d, count, covers: count * stat(d) >= need, cost: count * d.stats.cost };
    });
  const rank = (o: (typeof options)[number]) => [o.covers ? 0 : 1, o.cost <= city.credits ? 0 : 1, o.covers ? o.cost : -o.count * stat(o.def)];
  options.sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]! || a.def.id.localeCompare(b.def.id);
  });
  return options.slice(0, 5);
}

/** Centre of the district with the most buildings (where city-wide supply is most useful). */
function busiest(city: City): { x: number; z: number } {
  const n = new Map<string, number>();
  for (const e of query(city.world, [Building])) {
    const d = city.districtAt(Building.x[e]!, Building.z[e]!);
    if (d) n.set(d, (n.get(d) ?? 0) + 1);
  }
  const best = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const d = city.districts.find((a) => a.name === best);
  return d ? { x: (d.x0 + d.x1 + 1) / 2, z: (d.z0 + d.z1 + 1) / 2 } : { x: city.size / 2, z: city.size / 2 };
}

interface Plan {
  def: BuildingDef;
  count: number;
  gain: string;
}

/** Sized plans for an advisory, best first (empty when there is nothing to build for it). */
function planFor(city: City, a: Advisory | { id: string; build?: string }, defs: BuildingDef[]): Plan[] {
  const s = city.stats;
  const p = city.pulse;
  const inCat = (...c: BuildingCategory[]) => defs.filter((d) => c.includes(d.category));
  switch (a.id) {
    case 'energy': {
      const need = Math.max(1, s.energyUsed * 1.15 - s.energyProduced);
      return sizeFor(city, inCat('energy'), (d) => d.stats.energy, need).map((r) => {
        const add = r.count * r.def.stats.energy;
        return { ...r, gain: `+${fmt(add)} energy → ${pct((s.energyProduced + add) / Math.max(1, s.energyUsed))} of demand` };
      });
    }
    case 'water': {
      const need = Math.max(1, s.waterUsed * 1.15 - s.waterProduced);
      return sizeFor(city, defs.filter((d) => d.category !== 'residential'), (d) => d.stats.water, need).map((r) => {
        const add = r.count * r.def.stats.water;
        return { ...r, gain: `+${fmt(add)} water → ${pct((s.waterProduced + add) / Math.max(1, s.waterUsed))} of demand` };
      });
    }
    case 'food': {
      const need = Math.max(1, s.population * 1.1 - s.foodProduced);
      const fish = city.growth.fish;
      return sizeFor(city, inCat('food').filter((d) => !d.fishing || fish > 0.6), (d) => d.stats.food, need).map((r) => {
        const add = r.count * r.def.stats.food;
        return { ...r, gain: `feeds ${fmt(add)} more → ${pct((s.foodProduced + add) / Math.max(1, s.population))} fed` };
      });
    }
    case 'jobs': {
      const need = Math.max(1, p.unemployment * Math.max(1, s.employed) / Math.max(0.05, 1 - p.unemployment));
      return sizeFor(city, inCat('commercial', 'tech'), (d) => d.stats.jobs, need).map((r) => ({ ...r, gain: `+${fmt(r.count * r.def.stats.jobs)} jobs for ${fmt(need)} jobless` }));
    }
    case 'homes':
    case 'staff': {
      const need = Math.max(1, s.capacity * 0.1);
      return sizeFor(city, inCat('residential'), (d) => d.stats.population, need).map((r) => ({ ...r, gain: `+${fmt(r.count * r.def.stats.population)} homes${a.id === 'staff' ? ' for workers nearby' : ''}` }));
    }
    // Forecast trouble (plan v5): sized to the gap projected at the horizon, not today's, with a 15% margin.
    case 'forecast-energy': {
      const f = forecastFor(city, 'energy');
      const need = Math.max(1, s.energyUsed * 0.15 - f.atHorizon);
      return sizeFor(city, inCat('energy'), (d) => d.stats.energy, need).map((r) => ({ ...r, gain: `+${fmt(r.count * r.def.stats.energy)} energy covers the gap forecast ${f.eta !== null ? `in ${etaText(f.eta)}` : 'ahead'}` }));
    }
    case 'forecast-water': {
      const f = forecastFor(city, 'water');
      const need = Math.max(1, s.waterUsed * 0.15 - f.atHorizon);
      return sizeFor(city, defs.filter((d) => d.category !== 'residential'), (d) => d.stats.water, need).map((r) => ({ ...r, gain: `+${fmt(r.count * r.def.stats.water)} water covers the gap forecast ${f.eta !== null ? `in ${etaText(f.eta)}` : 'ahead'}` }));
    }
    case 'forecast-food': {
      const f = forecastFor(city, 'food');
      const need = Math.max(1, s.population * (1.1 - f.atHorizon));
      const fish = city.growth.fish;
      return sizeFor(city, inCat('food').filter((d) => !d.fishing || fish > 0.6), (d) => d.stats.food, need).map((r) => ({ ...r, gain: `feeds ${fmt(r.count * r.def.stats.food)} more before the shortfall ${f.eta !== null ? `in ${etaText(f.eta)}` : 'ahead'}` }));
    }
    case 'fire-cover': {
      const def = defs.find((d) => d.response);
      return def ? [{ def, count: 1, gain: `fire cover ${def.response!.radius} tiles round it` }] : [];
    }
    default: {
      const def = a.build ? defs.find((d) => d.id === a.build) : undefined;
      if (!def) return [];
      const gain =
        def.category === 'nature'
          ? `+${def.stats.eco} ecology, +${def.stats.happiness} harmony nearby`
          : def.transit
            ? 'takes commuters off the highways'
            : `${CATEGORY_LABELS[def.category]} where it is needed`;
      return [{ def, count: 1, gain }];
    }
  }
}

export interface ProposalOptions {
  focus?: ProposalFocus;
  /** Put every proposal in this district. */
  district?: string;
  limit?: number;
}

/** Build proposals for the city's current problems, most severe first. */
export function proposeBuilds(city: City, o: ProposalOptions = {}): BuildProposal[] {
  const defs = usable(city);
  const focus = o.focus && o.focus !== 'any' ? new Set(FOCUS[o.focus]) : null;
  const problems: (Advisory | { id: string; severity: number; title: string; detail: string; focus?: Advisory['focus']; build?: string })[] = [
    ...evaluateAdvisor(city),
  ];
  const fire = activeRules(city).find((r) => r.rule.id === 'fire-cover');
  if (fire) problems.push({ id: 'fire-cover', severity: 1, title: 'Fire cover is thin', detail: fire.rule.effect });
  const district = o.district ? city.districts.find((d) => d.name.toLowerCase() === o.district!.trim().toLowerCase()) : undefined;
  const out: BuildProposal[] = [];
  const seen = new Set<string>();
  for (const a of problems) {
    if (out.length >= (o.limit ?? 3)) break;
    if (focus ? !focus.has(a.id) : a.severity < 1 && a.id !== 'homes' && a.id !== 'bloom') continue;
    const centre = district ? { x: (district.x0 + district.x1 + 1) / 2, z: (district.z0 + district.z1 + 1) / 2 } : (a.focus ?? busiest(city));
    // The best plan that has a lot: in a named district, inside it (its centre may be built out).
    let plan: Plan | undefined;
    let site: Site | undefined;
    for (const c of planFor(city, a, defs)) {
      if (seen.has(c.def.id)) continue;
      const sites = findSites(city, c.def, centre, district ? 12 : 1, district ? 60 : 80);
      site = district ? sites.find((x) => x.district === district.name) : sites[0];
      if (site) {
        plan = c;
        break;
      }
    }
    if (!plan || !site) continue;
    seen.add(plan.def.id);
    const cost = plan.count * plan.def.stats.cost;
    out.push({
      key: a.id,
      type: plan.def.id,
      name: plan.def.name,
      category: CATEGORY_LABELS[plan.def.category],
      count: plan.count,
      why: a.title,
      gain: plan.gain,
      cost,
      affordable: cost <= city.credits,
      district: site.district,
      site,
      severity: a.severity,
    });
  }
  return out;
}

/** The systems not at Stable or better, with their reading: the diagnosis a proposal answers. */
export function diagnose(city: City): string[] {
  const p = city.pulse;
  const s = city.stats;
  const read: Record<string, string> = {
    energy: `${pct(p.energyRatio)} of demand`,
    water: `${pct(p.waterRatio)} of demand`,
    food: `${pct(p.foodRatio)} fed`,
    jobs: `${pct(p.unemployment)} unemployed`,
    mobility: `traffic flow ${pct(p.flow)}`,
    ecology: `bloom ${pct(p.bloomIndex)}`,
    harmony: `${Math.round(s.happiness)}/100`,
    budget: `credits ${fmt(city.credits)}, net ${netIncome(city).toFixed(1)}/s`,
  };
  return SYSTEMS.filter((k) => p.tiers[k] >= 2)
    .sort((a, b) => p.tiers[b] - p.tiers[a])
    .map((k) => `${k} ${TIERS[p.tiers[k]]} (${read[k] ?? ''})`);
}
