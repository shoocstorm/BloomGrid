import { Building } from '@/ecs/components';
import type { City } from '@/sim/City';
import { ERAS } from '@/sim/eras';
import { UNLOCK_NAMES, type UnlockId } from '@/sim/growthState';
import { bornAt } from '@/sim/history';
import type { HistorySample } from '@/sim/historyState';
import { WONDERS } from '@/sim/wonders';

/**
 * The time-lapse's script (plan v6, D-219): the history ledger and the live city turned into what rises when on the
 * film clock. Pure (no three.js, no DOM), so it is tested on its own (`tests/timelapse.test.ts`).
 *
 * - **Founding act**: what stood before recording began (tick 0) rises ring by ring out from the city's heart.
 * - **The years**: everything built later rises in the order it was built. Film time blends real time with event
 *   rank (`WARP_REAL`), so a busy hour is not crammed into a second and a quiet week does not stall the film.
 * - **Marks**: eras, wonders, unlocks and the big crises, spaced so captions can be read (`MARK_GAP`).
 *
 * Only what stands now replays (a demolished building's ghost is plan v6 Phase 33).
 */

export interface TimelineThing {
  /** Entity id (buildings) or tile index (roads). */
  id: number;
  tick: number;
  x: number;
  z: number;
}

export interface TimelineMarkIn {
  tick: number;
  kind: 'era' | 'wonder' | 'project' | 'crisis';
  label: string;
  icon?: string;
  x?: number;
  z?: number;
}

export interface TimelineInput {
  now: number;
  day: number;
  residents: number;
  heart: { x: number; z: number };
  buildings: TimelineThing[];
  roads: TimelineThing[];
  marks: TimelineMarkIn[];
  samples: readonly HistorySample[];
}

export interface TimelineEvent {
  /** Film seconds. */
  at: number;
  kind: 'building' | 'road';
  id: number;
}

export interface TimelineMark extends TimelineMarkIn {
  at: number;
}

export interface TimelineStats {
  tick: number;
  day: number;
  residents: number;
}

export interface Timeline {
  /** Seconds of the founding act (0 when nothing stood at tick 0). */
  founding: number;
  /** Seconds of the whole replay (founding act + the years). */
  duration: number;
  /** Sorted by `at`. */
  events: TimelineEvent[];
  marks: TimelineMark[];
  /** Film time of a tick (monotone). */
  filmAt(tick: number): number;
  /** The tick shown at film time `t` (inverse of `filmAt`). */
  tickAt(t: number): number;
  /** Day and residents at film time `t`, read between the samples. */
  statsAt(t: number): TimelineStats;
}

/** Share of film time that follows the clock; the rest follows event rank. */
export const WARP_REAL = 0.35;
/** Seconds between captions at least. */
export const MARK_GAP = 2.4;
/** Length of the years after the founding act, seconds. */
export const YEARS_MIN = 20;
export const YEARS_MAX = 54;
/** With no history, a short hold on the city as it stands. */
export const YEARS_NONE = 6;
/** A building rises this long after the highway laid in the same tick. */
const AFTER_ROAD = 0.15;

const PRIORITY: Record<TimelineMarkIn['kind'], number> = { era: 4, wonder: 3, crisis: 2, project: 1 };

export const foundingLength = (n: number) => (n ? Math.min(6, Math.max(2.5, 2 + n * 0.0015)) : 0);
export const yearsLength = (n: number) => (n ? Math.min(YEARS_MAX, Math.max(YEARS_MIN, 16 + Math.sqrt(n) * 0.9)) : YEARS_NONE);

export function buildTimeline(input: TimelineInput): Timeline {
  const now = Math.max(1, input.now);
  const early = [...input.buildings, ...input.roads].filter((b) => b.tick <= 0);
  const late = [...input.buildings, ...input.roads].filter((b) => b.tick > 0);
  const founding = foundingLength(early.length);
  const years = yearsLength(late.length);

  // The warp: a blend of the clock and the rank of distinct event ticks (piecewise linear between them).
  const ticks = [...new Set(late.map((b) => Math.min(now, b.tick)))].sort((a, b) => a - b);
  const rank = (tick: number): number => {
    if (!ticks.length) return tick / now;
    if (tick <= 0) return 0;
    let lo = 0;
    let hi = ticks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ticks[mid]! < tick) lo = mid + 1;
      else hi = mid;
    }
    // `lo` ticks lie before `tick`: interpolate between the previous event tick and this one.
    const prev = lo ? ticks[lo - 1]! : 0;
    const next = lo < ticks.length ? ticks[lo]! : now;
    const k = next > prev ? (tick - prev) / (next - prev) : 1;
    return Math.min(1, (lo + (lo < ticks.length ? k : 0)) / ticks.length);
  };
  const warp = (tick: number) => WARP_REAL * Math.min(1, Math.max(0, tick / now)) + (1 - WARP_REAL) * rank(tick);
  const filmAt = (tick: number) => (tick <= 0 ? 0 : founding + warp(tick) * years);
  const tickAt = (t: number): number => {
    if (t <= founding) return 0;
    let lo = 0;
    let hi = now;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (filmAt(mid) < t) lo = mid;
      else hi = mid;
    }
    return hi;
  };

  // The founding act: out from the heart, quickest near it (a ring that slows as it widens).
  const dist = (b: TimelineThing) => Math.hypot(b.x - input.heart.x, b.z - input.heart.z);
  const far = Math.max(1, ...early.map(dist));
  const events: TimelineEvent[] = [];
  const roadSet = new Set(input.roads);
  for (const b of early) {
    const road = roadSet.has(b);
    events.push({ at: founding * 0.92 * (dist(b) / far) ** 0.8 + (road ? 0 : 0.12), kind: road ? 'road' : 'building', id: b.id });
  }
  for (const b of late) {
    const road = roadSet.has(b);
    events.push({ at: filmAt(Math.min(now, b.tick)) + (road ? 0 : AFTER_ROAD), kind: road ? 'road' : 'building', id: b.id });
  }
  events.sort((a, b) => a.at - b.at || (a.kind === b.kind ? a.id - b.id : a.kind === 'road' ? -1 : 1));
  const duration = founding + years;

  // Marks: the most telling first, then whatever fits between them.
  const placed: TimelineMark[] = [];
  const ranked = input.marks
    .filter((m) => m.tick > 0 && m.tick <= now)
    .map((m) => ({ ...m, at: filmAt(m.tick) }))
    .sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || a.tick - b.tick);
  for (const m of ranked) if (m.at < duration - 1 && placed.every((p) => Math.abs(p.at - m.at) >= MARK_GAP)) placed.push(m);
  placed.sort((a, b) => a.at - b.at);

  // Samples, with the city as it stands now as the last one.
  const samples: HistorySample[] = [...input.samples.filter((s) => s[0] <= now), [now, input.day, input.residents, 0, 0, 0]];
  const statsAt = (t: number): TimelineStats => {
    const tick = tickAt(Math.min(duration, Math.max(0, t)));
    let i = 0;
    while (i < samples.length - 1 && samples[i + 1]![0] < tick) i++;
    const a = samples[i]!;
    const b = samples[Math.min(samples.length - 1, i + 1)]!;
    if (tick <= a[0] || a === b) return { tick, day: a[1], residents: a[2] };
    const k = (tick - a[0]) / Math.max(1, b[0] - a[0]);
    return { tick, day: Math.floor(a[1] + (b[1] - a[1]) * k), residents: Math.round(a[2] + (b[2] - a[2]) * k) };
  };

  return { founding, duration, events, marks: placed, filmAt, tickAt, statsAt };
}

/** The labels a mark kind shows (eras by name, wonders and unlocks by their names). */
export function markLabel(kind: string, id: string): { label: string; icon: string } | null {
  if (kind === 'era') {
    const e = ERAS.find((x) => x.id === id);
    return e && e !== ERAS[0] ? { label: `The ${e.name} era`, icon: e.icon } : null;
  }
  if (kind === 'wonder') {
    const w = WONDERS.find((x) => x.id === id);
    return w ? { label: `${w.name} rises`, icon: 'sparkle' } : null;
  }
  if (kind === 'project') {
    const n = UNLOCK_NAMES[id as UnlockId];
    return n ? { label: `Unlocked: ${n}`, icon: 'star' } : null;
  }
  return null;
}

/** What the film replays, read from the live city and its ledger. */
export function timelineInputOf(city: City): TimelineInput {
  const h = city.history;
  const g = city.grid;
  const buildings: TimelineThing[] = city.buildingEntities().map((eid) => ({
    id: eid,
    tick: bornAt(h, Building.uid[eid]!),
    x: Building.x[eid]! + Building.w[eid]! / 2,
    z: Building.z[eid]! + Building.d[eid]! / 2,
  }));
  const roads: TimelineThing[] = city.roadTiles().map((t) => ({ id: t, tick: h.roads.get(t) ?? 0, x: (t % g.w) + 0.5, z: ((t / g.w) | 0) + 0.5 }));
  // The heart: the middle of the founding content (or of everything, on an island founded empty).
  const core = buildings.some((b) => b.tick <= 0) ? buildings.filter((b) => b.tick <= 0) : buildings;
  const heart = core.length
    ? { x: core.reduce((s, b) => s + b.x, 0) / core.length, z: core.reduce((s, b) => s + b.z, 0) / core.length }
    : { x: city.size / 2, z: city.size / 2 };
  const marks: TimelineMarkIn[] = [];
  for (const [tick, kind, id] of h.marks) {
    const l = markLabel(kind, id);
    if (l) marks.push({ tick, kind: kind as TimelineMarkIn['kind'], ...l });
  }
  // Crises from the incident log; fires only when they cost the city a building.
  for (const r of city.steward.history) {
    if (r.kind === 'fire' && !r.lost) continue;
    marks.push({ tick: r.startTick, kind: 'crisis', label: r.district ? `${r.name} · ${r.district}` : r.name, icon: r.icon, x: r.x, z: r.z });
  }
  return { now: city.tick, day: city.day, residents: city.stats.population, heart, buildings, roads, marks, samples: h.samples };
}
