import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { BuildingCategory, BuildingStats } from '@/content/types';
import type { City } from './City';
import { BANYAN_LEVEL } from './weaver';
import { PULSE_TICKS } from './pulseConst';
import {
  OUTSKIRTS_KEY,
  createDistrictMood,
  type ApprovalTerms,
  type DistrictMood,
  type DistrictView,
} from './approvalState';

/**
 * District approval and migration (plan v5, Phase 26, D-159). Every named district (and the outskirts) holds its
 * own approval of the steward: the city-wide harmony terms (taxes, jobs, food, ecology, crises, policies) plus
 * what is local to it: power and water at its homes and its amenities (each against the city's mean, so they
 * shift districts apart without moving the city), smog at its homes, the trip to work and whether its workers
 * find the kind of job they want. City harmony is the resident-weighted mean of district approval.
 *
 * Approval decides who stays: homes fill toward it (not the city's mood), residents arrive faster where it is
 * high and leave faster where it is low (the "+N moved in / −N left" figures), and homes and workplaces only grow
 * a level where the district still wants more of them. Pure and deterministic: entity order, no randomness.
 */

/** Coarse job types: what residents want to do, and what each workplace offers (by category). */
export const JOB_TYPES = ['service', 'industry', 'creative', 'ecology'] as const;
export type JobType = (typeof JOB_TYPES)[number];
export const JOB_TYPE_LABEL: Record<JobType, string> = {
  service: 'service',
  industry: 'industry',
  creative: 'creative',
  ecology: 'ecology',
};
/** Share of workers who want each kind of job. */
export const JOB_WANT: Record<JobType, number> = {
  service: 0.35,
  industry: 0.2,
  creative: 0.25,
  ecology: 0.2,
};
const JOB_OF: Record<BuildingCategory, JobType> = {
  residential: 'service',
  commercial: 'service',
  utility: 'service',
  industry: 'industry',
  energy: 'industry',
  tech: 'creative',
  sports: 'creative',
  nature: 'ecology',
  food: 'ecology',
};
export const jobTypeOf = (category: BuildingCategory): JobType => JOB_OF[category] ?? 'service';
export const jobTypeIndex = (category: BuildingCategory): number => JOB_TYPES.indexOf(jobTypeOf(category));

/** Approval tuning: where protests and praise start, and how the local terms weigh. */
export const APPROVAL = {
  /** Below this for `PROTEST_PULSES`, a district takes to the streets; it calms at `calm`. */
  protest: 35,
  protestPulses: 60,
  calm: 45,
  /** Staffing at workplaces in a protesting district. */
  protestStaffing: 0.6,
  /** At or above this for `praisePulses`, a district thanks the steward. */
  praise: 75,
  praisePulses: 180,
  /** Below this a district may petition. */
  petition: 58,
  /** Smog at homes above `smogFree` costs `smogPts` per unit, up to `smogMax`. */
  smogFree: 0.3,
  smogPts: 16,
  smogMax: 8,
  /** Trips longer than `commuteFree` tiles cost `commutePts` per tile, up to `commuteMax`. */
  commuteFree: 16,
  commutePts: 0.5,
  commuteMax: 6,
  /** A matching job for fewer than `matchFree` of workers costs `matchPts` per share, up to `matchMax`. */
  matchFree: 0.75,
  matchPts: 15,
  /** Residents at which the city's workers expect the full choice of jobs (fewer: they expect less). */
  matchPopulation: 8000,
  matchMax: 4,
} as const;

/** Approval drift per pulse toward its target (city harmony uses the same). */
const DRIFT = 0.06;
/** Migration figures smooth over about half a minute. */
const MOVE_EMA = 1 / 30;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// ── District lookup ─────────────────────────────────────────────────────────

const lookups = new WeakMap<City, { list: City['districts']; len: number; key: string; grid: Int16Array }>();

/**
 * Tile → district index (−1 = outskirts), painted from the district rectangles (the first that contains a tile
 * names it, as `City.areaAt`). Rebuilt only when the district list changes.
 */
export function districtGrid(city: City): Int16Array {
  const ds = city.districts;
  const hit = lookups.get(city);
  if (hit && hit.list === ds && hit.len === ds.length && hit.grid.length === city.grid.w * city.grid.h) {
    // Same array: a cheap signature catches in-place edits (scenarios push while building).
    const key = ds.length ? `${ds[0]!.name}|${ds[ds.length - 1]!.name}` : '';
    if (key === hit.key) return hit.grid;
  }
  const { w, h } = city.grid;
  const grid = new Int16Array(w * h).fill(-1);
  // Paint the least specific first so the most specific (earliest) wins.
  for (let k = ds.length - 1; k >= 0; k--) {
    const d = ds[k]!;
    const x0 = Math.max(0, d.x0);
    const x1 = Math.min(w - 1, d.x1);
    const z0 = Math.max(0, d.z0);
    const z1 = Math.min(h - 1, d.z1);
    for (let z = z0; z <= z1; z++) grid.fill(k, z * w + x0, z * w + x1 + 1);
  }
  const key = ds.length ? `${ds[0]!.name}|${ds[ds.length - 1]!.name}` : '';
  lookups.set(city, { list: ds, len: ds.length, key, grid });
  return grid;
}

/** District index of a building (by its footprint centre), −1 for the outskirts. */
export function districtIndexOf(city: City, eid: number): number {
  const x = Math.floor(Building.x[eid]! + Building.w[eid]! / 2);
  const z = Math.floor(Building.z[eid]! + Building.d[eid]! / 2);
  if (!city.grid.inBounds(x, z)) return -1;
  return districtGrid(city)[city.grid.index(x, z)]!;
}

export const districtKey = (city: City, idx: number): string =>
  idx < 0 ? OUTSKIRTS_KEY : city.districts[idx]!.name;
export const districtLabel = (key: string): string => (key === OUTSKIRTS_KEY ? 'Outskirts' : key);

/** The saved mood of a district, made on first use at the city's current harmony. */
export function moodOf(city: City, key: string): DistrictMood {
  return (city.approval.districts[key] ??= createDistrictMood(Math.round(city.stats.happiness * 100) / 100));
}

/** A building's district approval, 0..100 (city harmony before its district has one). */
export function approvalOf(city: City, eid: number): number {
  const m = city.approval.districts[districtKey(city, districtIndexOf(city, eid))];
  return m ? m.approval : city.stats.happiness;
}

/** The view of a district by name (`Outskirts` or '' for the outskirts), or null. */
export function districtView(city: City, name: string): DistrictView | null {
  const key = name.toLowerCase() === 'outskirts' ? OUTSKIRTS_KEY : name;
  return city.approval.view.districts.find((d) => d.key.toLowerCase() === key.toLowerCase()) ?? null;
}

// ── Per-home commute and job match (written by the mobility pass) ───────────

/** Per-tile layers at a home's origin tile: mean trip time to work (tiles; 0 = none) and matching-job share. */
export function homeLayers(city: City): { commute: Float32Array; match: Float32Array } {
  const g = city.grid;
  const n = g.w * g.h;
  return {
    commute: g.addLayer('homeCommute', () => new Float32Array(n)),
    match: g.addLayer('homeMatch', () => new Float32Array(n).fill(1)),
  };
}

// ── Pieces shared with the pulse ────────────────────────────────────────────

/** A building's amenity points (the pulse sums them city-wide; approval per district). */
export function amenityOf(eid: number, st: BuildingStats, bridges: Map<number, number> | null): number {
  const lvl = Building.level[eid]!;
  return (
    st.happiness +
    Building.tier[eid]! +
    (lvl === BANYAN_LEVEL ? 4 : lvl > 0 ? 2 : 0) +
    (bridges?.get(eid) ?? 0) * 3
  );
}

/**
 * How fast residents arrive and leave at an approval of `a` (0..1): faster in where people are content, faster
 * out where they are not. 1× each at about 70.
 */
export const migrationRates = (a: number): { inMul: number; outMul: number } => ({
  inMul: 0.6 + 0.6 * clamp(a, 0, 1),
  outMul: 1.6 - 0.85 * clamp(a, 0, 1),
});

/** Scratch: residents moved in / out per district this pulse (index + 1; 0 = outskirts). */
let movedIn = new Float64Array(64);
let movedOut = new Float64Array(64);

/** Pulse pass 2 calls this before it moves anyone. */
export function beginMigration(city: City): void {
  const n = city.districts.length + 1;
  if (movedIn.length < n) {
    movedIn = new Float64Array(n * 2);
    movedOut = new Float64Array(n * 2);
  }
  movedIn.fill(0, 0, n);
  movedOut.fill(0, 0, n);
}

/** Records residents moving in (+) or out (−) of a district this pulse. */
export function noteMove(idx: number, residents: number): void {
  if (residents > 0) movedIn[idx + 1] += residents;
  else movedOut[idx + 1] -= residents;
}

/**
 * Local demand for more homes / workplaces in a district (level-ups need > 0): the city's demand meters, shifted
 * by how much residents like the district.
 */
export function localDemand(city: City, approval: number): { homes: number; work: number } {
  const s = city.stats;
  return { homes: s.demandHomes + (approval - 60) / 100, work: s.demandWork + 0.2 + (approval - 60) / 200 };
}

/** Whether a home or workplace's district still wants it to grow (`updateLevels`). */
export function wantsGrowth(city: City, eid: number): boolean {
  const st = buildings.at(Building.def[eid]!).stats;
  const d = localDemand(city, approvalOf(city, eid));
  return st.population > 0 ? d.homes > 0 : d.work > 0;
}

// ── The approval pass ───────────────────────────────────────────────────────

interface Acc {
  cap: number;
  res: number;
  jobs: number;
  n: number;
  svc: number;
  amen: number;
  cond: number;
  smog: number;
  commW: number;
  comm: number;
  match: number;
}
const accs: Acc[] = [];
const newAcc = (): Acc => ({
  cap: 0,
  res: 0,
  jobs: 0,
  n: 0,
  svc: 0,
  amen: 0,
  cond: 0,
  smog: 0,
  commW: 0,
  comm: 0,
  match: 0,
});

/**
 * Once per pulse, after pass 2: rebuilds every district's terms and target from its buildings, moves approval
 * toward it, steps the protest / praise streaks and the migration figures. `cityTarget` is the city-wide harmony
 * target; `services` / `amenities` its city means (the local terms are measured against them). Returns the
 * resident-weighted mean target, which becomes the city's harmony target.
 */
export function updateApproval(
  city: City,
  ents: ArrayLike<number> & Iterable<number>,
  cityTarget: number,
  bridges: Map<number, number> | null,
  services: (eid: number) => number,
  size: (eid: number) => number,
): number {
  const ds = city.districts;
  const nd = ds.length + 1;
  while (accs.length < nd) accs.push(newAcc());
  for (let i = 0; i < nd; i++) Object.assign(accs[i]!, newAcc());
  const g = city.grid;
  const smogF = city.fields.pollution;
  const { commute, match } = homeLayers(city);
  for (const eid of ents) {
    const st = buildings.at(Building.def[eid]!).stats;
    const a = accs[districtIndexOf(city, eid) + 1]!;
    a.n++;
    a.amen += amenityOf(eid, st, bridges);
    a.cond += Service.condition[eid]!;
    a.jobs += st.jobs * size(eid);
    if (st.population <= 0) continue;
    const cap = st.population * size(eid);
    const res = cap * Service.occupancy[eid]!;
    a.cap += cap;
    a.res += res;
    a.svc += services(eid) * cap;
    const cx = Math.floor(Building.x[eid]! + Building.w[eid]! / 2);
    const cz = Math.floor(Building.z[eid]! + Building.d[eid]! / 2);
    a.smog += smogF[g.index(cx, cz)]! * cap;
    const t = g.index(Building.x[eid]!, Building.z[eid]!);
    const c = commute[t]!;
    if (c > 0) {
      a.comm += c * res;
      a.match += match[t]! * res;
      a.commW += res;
    }
  }
  // City means the local services and amenities terms are measured against (weighted by homes).
  const svcTerm = (a: Acc) => (a.cap > 0 ? -30 * (1 - a.svc / a.cap) : 0);
  const amenTerm = (a: Acc) => (a.n > 0 ? clamp((a.amen / a.n) * 2, -10, 15) * (a.cond / a.n) : 0);
  let capAll = 0;
  let svcMean = 0;
  let amenMean = 0;
  for (let i = 0; i < nd; i++) {
    const a = accs[i]!;
    capAll += a.cap;
    svcMean += svcTerm(a) * a.cap;
    amenMean += amenTerm(a) * a.cap;
  }
  if (capAll > 0) {
    svcMean /= capAll;
    amenMean /= capAll;
  }

  // A hamlet doesn't expect a choice of careers: the expectation grows with the city.
  const matchFree = APPROVAL.matchFree * clamp(city.stats.population / APPROVAL.matchPopulation, 0, 1);
  const st = city.approval;
  const view = st.view;
  const out: DistrictView[] = [];
  let weighted = 0;
  let inAll = 0;
  let outAll = 0;
  for (let i = 0; i < nd; i++) {
    const a = accs[i]!;
    const idx = i - 1;
    const key = districtKey(city, idx);
    // The outskirts only count once something stands there.
    if (idx < 0 && a.n === 0) continue;
    const m = moodOf(city, key);
    const smog = a.cap > 0 ? a.smog / a.cap : 0;
    const comm = a.commW > 0 ? a.comm / a.commW : 0;
    const matchShare = a.commW > 0 ? a.match / a.commW : 1;
    const terms: ApprovalTerms = {
      city: cityTarget,
      services: a.cap > 0 ? svcTerm(a) - svcMean : 0,
      amenities: a.n > 0 && a.cap > 0 ? amenTerm(a) - amenMean : 0,
      pollution: -clamp((smog - APPROVAL.smogFree) * APPROVAL.smogPts, 0, APPROVAL.smogMax),
      commute: -clamp((comm - APPROVAL.commuteFree) * APPROVAL.commutePts, 0, APPROVAL.commuteMax),
      jobMatch: a.commW > 0 ? -clamp((matchFree - matchShare) * APPROVAL.matchPts, 0, APPROVAL.matchMax) : 0,
      mood: city.tick < m.boostUntil ? m.boost : 0,
    };
    const target = clamp(
      terms.city +
        terms.services +
        terms.amenities +
        terms.pollution +
        terms.commute +
        terms.jobMatch +
        terms.mood,
      0,
      100,
    );
    weighted += target * a.cap;
    m.approval += (target - m.approval) * DRIFT;
    m.lowFor = m.approval < APPROVAL.protest && a.cap > 0 ? m.lowFor + 1 : 0;
    m.highFor = m.approval >= APPROVAL.praise && a.cap > 0 ? m.highFor + 1 : 0;
    const prev = view.districts.find((d) => d.key === key);
    const mi = (prev?.movedIn ?? 0) + (movedIn[i]! * 60 - (prev?.movedIn ?? 0)) * MOVE_EMA;
    const mo = (prev?.movedOut ?? 0) + (movedOut[i]! * 60 - (prev?.movedOut ?? 0)) * MOVE_EMA;
    inAll += movedIn[i]!;
    outAll += movedOut[i]!;
    const demand = localDemand(city, m.approval);
    out.push({
      name: districtLabel(key),
      key,
      target,
      terms,
      residents: a.res,
      capacity: a.cap,
      jobs: a.jobs,
      buildings: a.n,
      commute: comm,
      match: matchShare,
      smog,
      movedIn: mi,
      movedOut: mo,
      homeDemand: demand.homes,
      workDemand: demand.work,
    });
  }
  view.districts = out;
  view.movedIn += (inAll * 60 - view.movedIn) * MOVE_EMA;
  view.movedOut += (outAll * 60 - view.movedOut) * MOVE_EMA;
  return capAll > 0 ? weighted / capAll : cityTarget;
}

// ── Reading it ──────────────────────────────────────────────────────────────

export type ComplaintKey = Exclude<keyof ApprovalTerms, 'city' | 'mood'>;

/** What residents of a district say is wrong, worst first (terms under −1 point). */
export function complaints(v: DistrictView): ComplaintKey[] {
  const keys: ComplaintKey[] = ['services', 'amenities', 'pollution', 'commute', 'jobMatch'];
  return keys.filter((k) => v.terms[k] < -1).sort((a, b) => v.terms[a] - v.terms[b]);
}

export const COMPLAINT_TEXT: Record<ComplaintKey, { label: string; fix: string }> = {
  services: {
    label: 'Power and water',
    fix: 'Its homes are short of power or water: add supply on their highway network.',
  },
  amenities: {
    label: 'Few amenities',
    fix: 'Build parks, sport or culture there, renovate what is run down, or retrofit it.',
  },
  pollution: {
    label: 'Smog',
    fix: 'Move industry away from its homes, plant parks between them, or pair polluters with their partners.',
  },
  commute: {
    label: 'Long commutes',
    fix: 'Build workplaces nearby, a Pod Dock, or another highway out; ordinances can take cars off the road.',
  },
  jobMatch: {
    label: 'Wrong kind of jobs',
    fix: 'Its workers cannot find the work they want: build the missing kind of workplace (service, industry, creative, ecology).',
  },
};

/**
 * The line a card shows for a district: its worst local complaint, else a grudge (an ignored petition, a protest
 * left to fester), else the city-wide mood when that is what holds it down, else null (nothing to fix there).
 */
export function complaintLine(v: DistrictView, approval: number): { label: string; fix: string } | null {
  const c = complaints(v)[0];
  if (c) return COMPLAINT_TEXT[c];
  if (v.terms.mood < -1)
    return {
      label: 'Holding a grudge',
      fix: 'An ignored petition or an unheard protest: it fades in a few minutes, faster with good news.',
    };
  if (approval < 60)
    return {
      label: 'City-wide mood',
      fix: 'Nothing local: taxes, jobs, food or crises weigh on every district (see Harmony).',
    };
  return null;
}

/** The protest's district index (−2 when there is none): its workplaces walk out (pulse pass 2). */
export function protestDistrict(city: City): number {
  const h = city.happenings.current;
  if (!h || h.kind !== 'protest' || h.status !== 'active' || h.district === undefined) return -2;
  if (h.district === OUTSKIRTS_KEY) return -1;
  return city.districts.findIndex((d) => d.name === h.district);
}

/** Readable approval band. */
export const approvalBand = (a: number): 'Delighted' | 'Content' | 'Uneasy' | 'Unhappy' | 'Angry' =>
  a >= 75 ? 'Delighted' : a >= 60 ? 'Content' : a >= 45 ? 'Uneasy' : a >= 35 ? 'Unhappy' : 'Angry';

/** Hash fragment for `city.hash()`. */
export function approvalHash(city: City): string {
  return Object.keys(city.approval.districts)
    .sort()
    .map((k) => {
      const m = city.approval.districts[k]!;
      return `${k}:${m.approval.toFixed(3)}:${m.lowFor}:${m.highFor}:${m.boost}:${m.boostUntil}`;
    })
    .join(',');
}

/** Seconds a petition's mood (or a protest's bitterness) lasts. */
export const MOOD_SECONDS = 240;
/** Sets a district's passing mood (petitions, praise, protests). */
export function setDistrictMood(city: City, key: string, points: number): void {
  const m = moodOf(city, key);
  m.boost = points;
  m.boostUntil = city.tick + MOOD_SECONDS * PULSE_TICKS;
}
