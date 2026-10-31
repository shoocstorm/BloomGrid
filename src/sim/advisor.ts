import { query } from 'bitecs';
import { Building, Problem, Service } from '@/ecs/components';
import type { City } from './City';
import { TIERS, type Tier } from './pulseState';
import { getCrisis } from './crises';
import { FAIL_SECONDS } from './steward';
import { creditLimit } from './finance';
import { ZONE, zoneOf } from './floranet';
import { atRisk } from './coast';

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
    fix:
      city.credits < 0
        ? `Austerity is cutting maintenance. Borrow (up to ${Math.round(creditLimit(city)).toLocaleString()}) or raise taxes to get out of debt.`
        : 'Raise the tax rate a little (City Pulse panel), or return unused buildings to nature.',
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

// ── Phase 5: crises, neglect and the council ─────────────────────────────────

registerAdvisorRule((city) => {
  const st = city.steward;
  if (st.failClock <= 0 || st.failed) return null;
  const left = Math.max(0, FAIL_SECONDS - st.failClock);
  return {
    id: 'council',
    severity: 2,
    title: `The council's patience: ${left}s left`,
    detail: 'Harmony or the budget has collapsed. If it stays that way, you will be replaced as steward.',
    fix: city.pulse.tiers.budget === 4 ? 'Get the treasury out of deep debt: borrow, raise taxes, cut costly buildings.' : 'Restore power, water, food and jobs; the harmony panel shows the biggest drag.',
  };
});

registerAdvisorRule((city) => {
  const c = city.steward.crises[0];
  if (!c) return null;
  const d = getCrisis(c.def);
  const active = c.phase === 'active';
  let focus: Advisory['focus'] = c.x !== undefined ? { x: c.x, z: c.z! } : undefined;
  if (!focus && active) focus = problemBuildings(city, Problem.FLOODED).focus;
  const secs = Math.max(0, Math.ceil(((active ? c.endTick : c.startTick) - city.tick) / 10));
  return {
    id: `crisis-${c.id}`,
    severity: active ? 2 : 1,
    title: `${d.icon} ${d.name} ${active ? `under way (${secs}s left)` : `forecast in ${secs}s`}`,
    detail: d.description,
    fix: d.prep,
    focus,
  };
});

registerAdvisorRule((city) => {
  const { count, focus } = problemBuildings(city, Problem.NEGLECTED);
  if (count < 5) return null;
  return {
    id: 'neglect',
    severity: city.steward.funding < 1 ? 2 : 1,
    title: `${count} buildings worn down; nature is reclaiming them`,
    detail: 'Worn buildings run at reduced capacity and lose residents. Underfunded maintenance and floods cause it.',
    fix: city.steward.funding < 1 ? 'Get out of debt so maintenance is fully funded; buildings then recover on their own.' : 'They recover over time now that maintenance is funded.',
    focus,
  };
});

registerAdvisorRule((city) => {
  const og = city.grid.layer<Uint8Array>('overgrowth');
  if (!og || city.steward.overgrown === 0) return null;
  let blocked = 0;
  let first = -1;
  for (let i = 0; i < og.length; i++)
    if (og[i]! >= 255) {
      blocked++;
      if (first < 0) first = i;
    }
  if (!blocked) return null;
  return {
    id: 'overgrowth',
    severity: blocked > 20 ? 2 : 1,
    title: `${blocked} highway tile${blocked > 1 ? 's' : ''} overgrown`,
    detail: 'Reclaimed highways no longer carry power or water, which can split districts off the grid.',
    fix: 'Redraw the highway (G) over the overgrown stretch to clear it, and fund maintenance.',
    focus: { x: (first % city.grid.w) + 0.5, z: ((first / city.grid.w) | 0) + 0.5 },
  };
});

// ── Phase 6: Seasonal Bloom Engine ───────────────────────────────────────────

registerAdvisorRule((city) => {
  let count = 0;
  let focus: Advisory['focus'];
  let partner = '';
  for (const eid of query(city.world, [Building])) {
    const d = city.buildingDef(eid);
    if (!d.symbiosis || Service.paired[eid]) continue;
    count++;
    partner = d.symbiosis.partners[0]!;
    focus ??= { x: Building.x[eid]! + Building.w[eid]! / 2, z: Building.z[eid]! + Building.d[eid]! / 2, eid };
  }
  if (!count) return null;
  return {
    id: 'symbiosis',
    severity: 1,
    title: `${count} polluter${count > 1 ? 's' : ''} without a symbiotic partner`,
    detail: 'Paired with phyto-remediation, a Bioreactor emits a quarter of the pollution and produces 15% more.',
    fix: 'Place a Phyto Garden within 7 tiles of each Bioreactor.',
    focus,
    build: partner,
  };
});

registerAdvisorRule((city) => {
  if (city.pulse.bloomIndex >= 0.3) return null;
  return {
    id: 'bloom',
    severity: 0,
    title: `Bloom is low (${Math.round(city.pulse.bloomIndex * 100)}%)`,
    detail: 'Bloom speeds greenery, pollinates farms (more food) and lifts harmony. It needs pollinators, water, clean air and clean energy.',
    fix: 'Add Pollinator Sanctuaries and Bloom Parks, dig Filtration Channels (C), and favour Sunflower Spires.',
    build: 'pollinator-sanctuary',
  };
});

registerAdvisorRule((city) => {
  // Suggest a Bloom Retrofit once the treasury can comfortably afford one.
  if (city.credits < 15000 || city.steward.crises.length) return null;
  const unretro = query(city.world, [Building]).filter((e) => !Building.level[e]).length;
  if (unretro < 20) return null;
  return {
    id: 'retrofit',
    severity: 0,
    title: 'The treasury can fund a Bloom Retrofit',
    detail: 'Transform a district: flowering façades, sunflower roofs, lily-pad channels. Ecology ×1.5, less power and water use.',
    fix: 'Choose Bloom Retrofit (B) and click the heart of a busy district.',
  };
});

registerAdvisorRule((city) => {
  const t = city.pulse.tiers.mobility;
  if (t < 2) return null;
  const traffic = city.grid.layer<Float32Array>('traffic');
  const worst = traffic ? hotspot(city, traffic) : undefined;
  return {
    id: 'traffic',
    severity: severityOf(t),
    title: `Highways are jammed (${pct(city.pulse.flow)} flow)`,
    detail: `Commutes take ${Math.round((1 / Math.max(0.05, city.pulse.flow) - 1) * 100)}% longer than on empty highways, which wears residents down.`,
    fix: 'Build a Green Pod Dock among crowded homes (pods fly commuters over the jam), add jobs closer to homes, or draw a parallel highway.',
    focus: worst?.focus,
    build: 'pod-dock',
  };
});

/** The driest (or most depleted) built soil zone, as a focus point. */
function worstZone(city: City, field: Float32Array, limit: number): { count: number; focus?: Advisory['focus'] } {
  const soil = city.soil;
  const built = new Uint8Array(field.length);
  for (const eid of query(city.world, [Building])) {
    const d = city.buildingDef(eid);
    if (d.stats.water < 0 || d.stats.food > 0) built[zoneOf(soil, Building.x[eid]! + Building.w[eid]! / 2, Building.z[eid]! + Building.d[eid]! / 2)] = 1;
  }
  let count = 0;
  let best = -1;
  for (let i = 0; i < field.length; i++) {
    if (!built[i] || field[i]! >= limit) continue;
    count++;
    if (best < 0 || field[i]! < field[best]!) best = i;
  }
  return { count, focus: best < 0 ? undefined : { x: ((best % soil.zw) + 0.5) * ZONE, z: (Math.floor(best / soil.zw) + 0.5) * ZONE } };
}

registerAdvisorRule((city) => {
  const { count, focus } = worstZone(city, city.soil.hydration, 0.35);
  if (!count) return null;
  return {
    id: 'dry-soil',
    severity: count > 8 ? 2 : 1,
    title: `${count} garden zone${count > 1 ? 's are' : ' is'} parched`,
    detail: 'Dry soil starves living walls and roof meadows even when the taps run, and cuts harvests. Haze season and heatwaves dry it fastest.',
    fix: 'Dispatch a Flora-Net mist (Y) over them, dig Filtration Channels (C), or place a Drone Hive (drones mist dry gardens).',
    focus,
    build: 'flora-hive',
  };
});

registerAdvisorRule((city) => {
  const { count, focus } = worstZone(city, city.soil.nutrients, 0.3);
  if (!count) return null;
  return {
    id: 'depleted-soil',
    severity: 1,
    title: `Soil is depleted in ${count} zone${count > 1 ? 's' : ''}`,
    detail: 'Farms draw nutrients faster than the land returns them; yields fall by up to a quarter.',
    fix: 'Build Bloom Parks or a Drone Hive near the farms (drones return harvest compost), and pair Bioreactors with Phyto Gardens (digestate).',
    focus,
    build: 'flora-hive',
  };
});

registerAdvisorRule((city) => {
  const rise = city.steward.seaRise;
  if (rise <= 0.02) return null;
  // Buildings a king tide on today's sea would flood.
  const { count, focus } = atRisk(city, rise + 0.35);
  if (!count) return null;
  const drowned = atRisk(city, rise).count;
  return {
    id: 'sea-rise',
    severity: drowned ? 2 : count > 10 ? 1 : 0,
    title: drowned ? `The risen sea is flooding ${drowned} building${drowned > 1 ? 's' : ''}` : `${count} coastal building${count > 1 ? 's' : ''} at risk from the rising sea`,
    detail: `Sea level is up ${rise.toFixed(2)} m and still rising; king tides add about 0.35 m on top.`,
    fix: 'Build Mangrove Seawalls on the shore in front of them (each protects 9 tiles up to 1.4 m), or reclaim higher land (T) further out.',
    focus,
    build: 'mangrove-seawall',
  };
});
