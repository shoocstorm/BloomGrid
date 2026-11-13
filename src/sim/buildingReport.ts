import { ROAD_REACH } from './networks';
import { Building, Flow, Greenery, Problem, Service } from '@/ecs/components';
import type { City } from './City';
import { paidShare } from './finance';
import { sectorOf } from './policies';
import { LABOUR_SHARE } from './pulseConst';
import { MAX_TIER, THRIVE, growthHold, levelProgress, levels, size, upkeepMul, use } from './levels';

/**
 * One building, read for the player (the inspector, D-109): a status verdict, what it consumes and what it
 * produces right now (live values from the last pulse beside what it would at full service), and each problem
 * with the fix. Pure: it only reads sim state, so it is testable and the HUD stays a thin view.
 */

export type ReportTone = 'ok' | 'warn' | 'crit' | 'off';
export type FlowKey = 'energy' | 'water' | 'food' | 'workers' | 'residents' | 'jobs' | 'eco' | 'pollution' | 'upkeep' | 'riders' | 'harmony';

export interface FlowLine {
  key: FlowKey;
  label: string;
  /** Live amount per sim second (or head count); for an input, what it asks for now. */
  value: number;
  /** The same at full service (0 when it has no fixed ceiling). */
  max: number;
  /** For an input: the share of what it asks for that it receives (0..1). */
  supplied?: number;
  /** Good to have (green), bad (red), or neutral. */
  tone: '' | 'good' | 'bad';
  /** Short unit after the value ("/s", "people"). */
  unit: string;
}

export interface Issue {
  text: string;
  fix: string;
}

export interface BuildingReport {
  status: { tone: ReportTone; title: string; detail: string };
  issues: Issue[];
  consumes: FlowLine[];
  produces: FlowLine[];
  /** Key facts as 0..1 bars (occupancy / staffing only when it has residents or jobs). */
  level: { tier: number; max: number; grows: boolean; progress: number; hold: string | null };
  condition: number;
  greenery: number;
  fill: { label: string; value: number } | null;
}

const HOLD: Record<keyof typeof THRIVE, string> = {
  power: `needs ${THRIVE.power * 100}% power`,
  water: `needs ${THRIVE.water * 100}% water`,
  occupancy: `needs to be ${THRIVE.occupancy * 100}% full`,
  condition: `needs ${THRIVE.condition * 100}% condition`,
  greenery: `needs ${THRIVE.greenery * 100}% greenery`,
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function buildingReport(city: City, eid: number): BuildingReport {
  const def = city.buildingDef(eid);
  const st = def.stats;
  const p = Service.problems[eid]!;
  const occ = Service.occupancy[eid]!;
  const cond = Service.condition[eid]!;
  const off = Service.off[eid] === 1;
  const big = size(eid);
  const draw = use(eid);
  const home = st.population > 0;
  const work = !home && st.jobs > 0;

  const consumes: FlowLine[] = [];
  const produces: FlowLine[] = [];
  // Energy and water: inputs show what it draws and how much of that the network delivers.
  if (st.energy < 0)
    consumes.push({ key: 'energy', label: 'Energy', value: -Flow.energy[eid]!, max: -st.energy * draw, supplied: Service.power[eid]!, tone: '', unit: '/s' });
  if (st.water < 0)
    consumes.push({ key: 'water', label: 'Water', value: -Flow.water[eid]!, max: -st.water * draw, supplied: Service.water[eid]!, tone: '', unit: '/s' });
  if (work)
    consumes.push({ key: 'workers', label: 'Workers', value: st.jobs * big, max: st.jobs * big, supplied: occ, tone: '', unit: 'staff' });
  if (st.upkeep > 0)
    consumes.push({ key: 'upkeep', label: 'Upkeep', value: st.upkeep * upkeepMul(eid) * paidShare(city, sectorOf(def)), max: 0, tone: '', unit: '◈/s' });
  if (st.energy > 0) produces.push({ key: 'energy', label: 'Energy', value: Flow.energy[eid]!, max: st.energy * big, tone: 'good', unit: '/s' });
  if (st.water > 0) produces.push({ key: 'water', label: 'Water', value: Flow.water[eid]!, max: st.water * big, tone: 'good', unit: '/s' });
  if (st.food > 0) produces.push({ key: 'food', label: 'Food', value: Flow.food[eid]!, max: st.food * big, tone: 'good', unit: 'fed' });
  if (home) {
    produces.push({ key: 'residents', label: 'Homes', value: st.population * big * occ, max: st.population * big, tone: 'good', unit: 'people' });
    produces.push({ key: 'workers', label: 'Workers', value: st.population * big * occ * LABOUR_SHARE, max: 0, tone: 'good', unit: 'staff' });
  }
  if (work) produces.push({ key: 'jobs', label: 'Jobs', value: st.jobs * big, max: 0, tone: 'good', unit: 'offered' });
  if (def.transit) produces.push({ key: 'riders', label: 'Riders', value: Service.riders[eid]!, max: def.transit.riders, tone: 'good', unit: 'trips' });
  const eco = Flow.eco[eid]!;
  // Negative ecology (paved, industrial) shows as a red output: what the building takes from nature.
  if (st.eco !== 0) produces.push({ key: 'eco', label: 'Ecology', value: eco, max: st.eco, tone: st.eco < 0 ? 'bad' : 'good', unit: 'eco' });
  // Amenity feeds city harmony (a grown building adds a point per level, `sim/pulse.ts`).
  if (st.happiness !== 0)
    produces.push({ key: 'harmony', label: 'Harmony', value: st.happiness + Building.tier[eid]!, max: 0, tone: st.happiness < 0 ? 'bad' : 'good', unit: '' });
  if (st.pollution > 0) produces.push({ key: 'pollution', label: 'Pollution', value: Flow.pollution[eid]!, max: st.pollution, tone: 'bad', unit: 'smog' });

  const issues: Issue[] = [];
  const add = (text: string, fix: string) => issues.push({ text, fix });
  if (p & Problem.NO_ROAD) add('No highway access', `Draw a Living Highway within ${ROAD_REACH} tiles of its lot: power, water and workers arrive by road.`);
  if (p & Problem.NO_POWER) add(`Brownout: gets ${pct(Service.power[eid]!)} of its power`, 'Build power on this highway network (Energy), or switch off a big consumer.');
  if (p & Problem.NO_WATER) add(`Dry taps: gets ${pct(Service.water[eid]!)} of its water`, 'Build water works on this network (Water); they need power to pump.');
  if (p & Problem.UNSTAFFED && !off) add(`Understaffed: ${pct(occ)} of jobs filled`, `Build homes: about ${pct(LABOUR_SHARE)} of residents work. Unemployed workers fill the gaps first.`);
  if (home && occ < 0.5 && !(p & (Problem.FLOODED | Problem.ON_FIRE | Problem.RUINED)))
    add(`Half empty: ${pct(occ)} occupied`, 'Residents move in where there is power, water, jobs, food and a happy, green city.');
  if (p & Problem.NEGLECTED && !(p & Problem.RUINED)) add(`Run down: ${pct(cond)} condition`, cond < 0.2 ? 'It barely works: repair or renovate it now.' : 'Repair or renovate it; full maintenance funding mends it slowly.');

  const status = ((): BuildingReport['status'] => {
    if (p & Problem.RUINED) return { tone: 'crit', title: 'Ruined', detail: 'Burned out or shaken down: no output until you rebuild it.' };
    if (p & Problem.ON_FIRE) return { tone: 'crit', title: 'On fire', detail: 'Evacuated: dispatch crews before it spreads to its neighbours.' };
    if (p & Problem.FLOODED) return { tone: 'crit', title: 'Flooded', detail: 'Evacuated until the water drops. A seawall keeps the next flood out.' };
    if (p & Problem.OFFLINE) return { tone: 'crit', title: 'Offline', detail: 'Tripped by the crisis: it comes back when the crisis ends.' };
    if (off) return { tone: 'off', title: 'Switched off', detail: def.interact?.help ?? 'No output and no draw until you switch it back on.' };
    if (issues.length) {
      const crit = p & Problem.NO_ROAD || Service.power[eid]! < 0.5 || Service.water[eid]! < 0.5 || cond < 0.2;
      const n = issues.length;
      return { tone: crit ? 'crit' : 'warn', title: crit ? 'Not working' : 'Struggling', detail: n === 1 ? 'One problem to fix:' : `${n} problems to fix:` };
    }
    const out = produces.find((l) => l.max > 0 && l.tone === 'good');
    const tail = out ? `${out.label} at ${pct(Math.min(1, out.value / out.max))}` : 'All services supplied';
    return { tone: 'ok', title: 'Running well', detail: home ? `${pct(occ)} occupied · ${tail}` : work ? `${pct(occ)} staffed · ${tail}` : tail };
  })();

  const grows = levels(city, eid);
  const hold = grows && Building.tier[eid]! < MAX_TIER ? growthHold(eid) : null;
  return {
    status,
    issues,
    consumes,
    produces,
    level: { tier: Building.tier[eid]!, max: MAX_TIER, grows, progress: levelProgress(eid), hold: hold && HOLD[hold] },
    condition: cond,
    greenery: Greenery.value[eid]!,
    fill: home ? { label: 'Occupancy', value: occ } : work ? { label: 'Staffing', value: occ } : null,
  };
}
