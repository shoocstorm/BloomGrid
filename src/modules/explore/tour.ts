import { MathUtils, Vector3 } from 'three/webgpu';
import { Building } from '@/ecs/components';
import type { City } from '@/sim/City';
import { ZONES } from '@/content/types';
import { WONDERS, wonderVisible } from '@/sim/wonders';
import { WONDER_SITES } from '@/modules/scenery/sites';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';
import { rooftopCandidates } from './roof';

/**
 * City tour (D-145): an automatic camera flight round the island that shows off what the steward has built. The
 * planner picks the stops (an opening overview, the landmark nearest the centre, then the tallest landmarks, the
 * largest districts, the sea wonders already discovered and the moving wonders, swept round the island by bearing,
 * and a closing overview); the director flies an orbit camera between them on high arcs, arriving from the side it
 * came from, and circles each stop slowly while its caption shows. Render-only: nothing is saved or hashed.
 */

export type TourKind = 'opening' | 'landmark' | 'district' | 'wonder' | 'ride' | 'finale';

export interface TourStop {
  kind: TourKind;
  kicker: string;
  title: string;
  facts: string;
  /** Orbit point on the ground, and how high above the ground the camera aims (a tower's middle). */
  x: number;
  z: number;
  aim: number;
  distance: number;
  pitch: number;
  /** Seconds circling the stop. */
  hold: number;
  /** A moving stop (a train, the ferry, the jet): writes where it is now; false when it is gone. */
  track?: (out: Vector3) => boolean;
}

/** A moving wonder offered by another module (where it is now, or false when it isn't running). */
export interface TourMover {
  kicker: string;
  title: string;
  facts: string;
  track: (out: Vector3) => boolean;
  /** Orbit range (default 34): a fast mover wants more room. */
  distance?: number;
}

/** Stop counts and spacing (tiles): enough to cross the island in about three minutes without crowding a quarter. */
const MAX_LANDMARKS = 7;
const MAX_DISTRICTS = 4;
/** Stops within this share of the map's width from the centre are downtown (flown first). */
const INNER = 0.16;
const LANDMARK_GAP = 26;
const DISTRICT_GAP = 45;

const WONDER_NOTES: Record<string, string> = {
  lighthouse: 'Keeps watch over the northern approaches',
  tideGates: 'Holds back the storm surges in the south-west',
  lotus: 'A coral atoll of giant lotus pads, aglow at night',
  dome: 'A research dome rising from the deep',
  stacks: 'Sea stacks grown over with rainforest',
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
/** A description's opening clause, short enough for a caption (cut at a colon, else a comma, else a word). */
export const brief = (s: string): string => {
  let t = (s.split(/(?<=[.!?])\s/)[0] ?? s).replace(/[.!?]$/, '');
  const colon = t.search(/[:;—]/);
  if (colon >= 24) t = t.slice(0, colon).trimEnd();
  if (t.length <= 90) return t;
  const comma = t.lastIndexOf(',', 90);
  if (comma >= 40) return t.slice(0, comma);
  return `${t.slice(0, t.lastIndexOf(' ', 88)).trimEnd()}…`;
};

/** The stops of a tour of `city`, in flying order (opening first, finale last). */
export function planTour(city: City, movers: TourMover[] = []): TourStop[] {
  const g = city.grid;
  const cx = g.w / 2;
  const cz = g.h / 2;
  const overview = g.w * 0.95;
  const stops: TourStop[] = [];
  const taken: [number, number][] = [];
  const far = (x: number, z: number, gap: number) =>
    taken.every(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 >= gap * gap);

  // Landmarks: the tallest first, spread out; without any, the tallest buildings stand in (a young island).
  const heightOf = (eid: number) => {
    const rec = city.buildingRecord(eid);
    return placeBuilding(g, city.buildingDef(eid), rec.x, rec.z, rec.rot).template.height;
  };
  let pool = rooftopCandidates(city);
  let kicker = 'Landmark';
  if (pool.length < 3) {
    pool = [...city.buildingEntities()];
    kicker = 'Skyline';
  }
  const ranked = pool.map((eid) => ({ eid, h: heightOf(eid) })).sort((a, b) => b.h - a.h || a.eid - b.eid);
  const landmarks: TourStop[] = [];
  for (const { eid, h } of ranked) {
    if (landmarks.length >= MAX_LANDMARKS) break;
    const rec = city.buildingRecord(eid);
    const [w, d] = [Building.w[eid]!, Building.d[eid]!];
    const x = rec.x + w / 2;
    const z = rec.z + d / 2;
    if (!far(x, z, LANDMARK_GAP)) continue;
    taken.push([x, z]);
    const def = city.buildingDef(eid);
    const size = Math.max(w, d);
    landmarks.push({
      kind: 'landmark',
      kicker,
      title: def.name,
      facts: [`Level ${Building.tier[eid]! + 1}`, brief(def.description)].filter(Boolean).join(' · '),
      x,
      z,
      aim: h * 0.45,
      distance: MathUtils.clamp(Math.max(26, h * 2.3, size * 2.8), 26, 150),
      pitch: 0.36,
      hold: 6,
    });
  }

  // Districts: the largest named areas with buildings in them, away from the landmarks already chosen.
  const recs = city.buildingEntities().map((eid) => city.buildingRecord(eid));
  const districts = [...city.districts]
    .map((d) => ({
      d,
      area: (d.x1 - d.x0 + 1) * (d.z1 - d.z0 + 1),
      n: recs.filter((r) => r.x >= d.x0 && r.x <= d.x1 && r.z >= d.z0 && r.z <= d.z1).length,
    }))
    .filter((e) => e.n > 0)
    .sort((a, b) => b.area - a.area);
  let nd = 0;
  for (const { d, n } of districts) {
    if (nd >= MAX_DISTRICTS) break;
    const x = (d.x0 + d.x1 + 1) / 2;
    const z = (d.z0 + d.z1 + 1) / 2;
    if (!far(x, z, DISTRICT_GAP)) continue;
    taken.push([x, z]);
    nd++;
    const span = Math.max(d.x1 - d.x0, d.z1 - d.z0) + 1;
    const zone = d.zone ? ZONES[d.zone]?.label : undefined;
    stops.push({
      kind: 'district',
      kicker: zone ? `District · ${zone}` : 'District',
      title: d.name,
      facts: `${fmt(n)} building${n === 1 ? '' : 's'}`,
      x,
      z,
      aim: 0,
      distance: MathUtils.clamp(span * 1.3, 50, 150),
      pitch: 0.82,
      hold: 5.5,
    });
  }
  stops.push(...landmarks);

  // Sea wonders the city has (whales roam, so they sit this one out).
  for (const w of WONDERS) {
    const site = (WONDER_SITES as Record<string, unknown>)[w.id];
    if (!Array.isArray(site) || typeof site[0] !== 'number' || !wonderVisible(city, w.id)) continue;
    const [u, v] = site as unknown as [number, number];
    stops.push({
      kind: 'wonder',
      kicker: 'Sea wonder',
      title: w.name,
      facts: WONDER_NOTES[w.id] ?? '',
      x: u * g.w,
      z: v * g.h,
      aim: 3,
      distance: 46,
      pitch: 0.28,
      hold: 6,
    });
  }

  // Moving wonders, placed by where they are when the tour starts.
  const at = new Vector3();
  for (const m of movers) {
    if (!m.track(at)) continue;
    stops.push({
      kind: 'ride',
      kicker: m.kicker,
      title: m.title,
      facts: m.facts,
      x: at.x,
      z: at.z,
      aim: 0,
      distance: m.distance ?? 34,
      pitch: 0.45,
      hold: 7,
      track: m.track,
    });
  }

  const route = orderStops(stops, cx, cz, g.w * INNER);

  const s = city.stats;
  const days = Math.max(1, Math.floor(city.day));
  const opening: TourStop = {
    kind: 'opening',
    kicker: 'City tour',
    title: city.growth.name || 'BloomGrid',
    facts: `Day ${days} · ${fmt(s.population)} residents · ${fmt(s.buildings)} buildings`,
    x: cx,
    z: cz * 1.04,
    aim: 0,
    distance: overview,
    pitch: 1.1,
    hold: 6,
  };
  const finale: TourStop = {
    ...opening,
    kind: 'finale',
    kicker: 'Tour complete',
    facts: `${fmt(s.population)} residents · harmony ${Math.round(s.happiness)} · bloom ${Math.round(city.pulse.bloomIndex * 100)}%`,
    distance: overview * 1.05,
    pitch: 1.15,
    hold: 7,
  };
  return [opening, ...route, finale];
}

const dist = (a: TourStop, b: TourStop) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Flying order: downtown first (the stop nearest the centre, then its neighbours, each the nearest unvisited), then
 * out to the rest round the island by bearing, from where downtown left off; 2-opt then uncrosses the outer loop.
 */
export function orderStops(stops: TourStop[], cx: number, cz: number, inner: number): TourStop[] {
  const fromCentre = (s: TourStop) => Math.hypot(s.x - cx, s.z - cz);
  const fixed = stops.filter((s) => s.kind !== 'ride' && fromCentre(s) <= inner);
  const route: TourStop[] = [];
  let left = fixed.slice().sort((a, b) => fromCentre(a) - fromCentre(b));
  while (left.length) {
    const last = route.at(-1);
    const next = last ? left.reduce((b, s) => (dist(last, s) < dist(last, b) ? s : b)) : left[0]!;
    route.push(next);
    left = left.filter((s) => s !== next);
  }
  const bearing = (s: TourStop) => Math.atan2(s.z - cz, s.x - cx);
  const last = route.at(-1);
  const a0 = last ? bearing(last) : 0;
  const turn = (s: TourStop) => (bearing(s) - a0 + Math.PI * 4) % (Math.PI * 2);
  const outer = stops.filter((s) => !fixed.includes(s)).sort((a, b) => turn(a) - turn(b));
  // 2-opt on the outer leg (its start joins the last downtown stop, its end is free: the finale pulls back).
  const path = last ? [last, ...outer] : outer;
  const len = (i: number, j: number) => (j < path.length ? dist(path[i]!, path[j]!) : 0);
  for (let improved = true, pass = 0; improved && pass < 20; pass++) {
    improved = false;
    for (let i = 0; i < path.length - 2; i++)
      for (let j = i + 2; j < path.length; j++) {
        const before = len(i, i + 1) + len(j, j + 1);
        const after = dist(path[i]!, path[j]!) + (j + 1 < path.length ? dist(path[i + 1]!, path[j + 1]!) : 0);
        if (after < before - 1e-6) {
          path.splice(i + 1, j - i, ...path.slice(i + 1, j + 1).reverse());
          improved = true;
        }
      }
  }
  return [...route, ...(last ? path.slice(1) : path)];
}

/** An orbit pose: the point looked at, and the camera's bearing, tilt and range round it. */
export interface TourPose {
  target: Vector3;
  yaw: number;
  pitch: number;
  distance: number;
}

const RAMP = 1.5;
/** Bearings (from the arrival side) and extra tilts tried, in order, for a clear view of a stop (D-145). */
const TRY_YAW = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.1, -2.1, Math.PI];
const TRY_TILT = [0, 0.12, 0.25, 0.4, 0.55];
/** Points along a stop's circling checked for a clear view (shares of the hold). */
const TRY_AT = [0, 1 / 3, 2 / 3, 1];
const smoother = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);
const turnTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * Flies `stops` one after another from a starting pose. `step(dt)` advances and writes the pose; it returns false
 * once the finale has been held. Captions follow `onStop` (called as the camera nears a stop) and `onLeave`.
 * With `sight` (is the view from a camera spot toward a point clear, with room above the roofs there?), each fixed
 * stop's bearing and tilt are chosen before the flight sets off so the whole circle sees it: the camera lands where it
 * can stay, rather than climbing away from a tower after it has arrived.
 */
export class TourDirector {
  readonly pose: TourPose = { target: new Vector3(), yaw: 0, pitch: 0.8, distance: 60 };
  index = 0;
  phase: 'travel' | 'hold' = 'travel';
  t = 0;
  paused = false;
  private from: TourPose = { target: new Vector3(), yaw: 0, pitch: 0.8, distance: 60 };
  private dur = 3;
  private lift = 0;
  private arrive = 0;
  /** The tilt chosen for the stop being flown to (its own, or steeper for a clear view). */
  private tilt = 0.8;
  private announced = false;
  private live = new Vector3();
  /** A moving stop's last position and smoothed heading (the camera trails it while circling). */
  private seen = new Vector3();
  private heading = NaN;

  constructor(
    readonly stops: TourStop[],
    start: TourPose,
    private ground: (x: number, z: number) => number,
    private onStop: (i: number) => void = () => {},
    private onLeave: (i: number) => void = () => {},
    private sight?: (from: Vector3, to: Vector3) => boolean,
  ) {
    this.pose.target.copy(start.target);
    this.pose.yaw = start.yaw;
    this.pose.pitch = start.pitch;
    this.pose.distance = start.distance;
    this.begin(0);
  }

  /** Where stop `i` is now (a moving stop follows its mover; one that has gone stays where it was last seen). */
  private targetOf(i: number, out: Vector3): Vector3 {
    const s = this.stops[i]!;
    if (s.track?.(this.live)) {
      s.x = this.live.x;
      s.z = this.live.z;
      return out.copy(this.live);
    }
    return out.set(s.x, Math.max(0, this.ground(s.x, s.z)) + s.aim, s.z);
  }

  /** Sets off for stop `i` from wherever the camera is now. */
  private begin(i: number): void {
    this.index = i;
    this.phase = 'travel';
    this.t = 0;
    this.announced = false;
    const p = this.pose;
    this.from.target.copy(p.target);
    this.from.yaw = p.yaw;
    this.from.pitch = p.pitch;
    this.from.distance = p.distance;
    const s = this.stops[i]!;
    const to = this.targetOf(i, this.live);
    this.seen.copy(to);
    this.heading = NaN;
    const travel = Math.hypot(to.x - p.target.x, to.z - p.target.z);
    // Arrive from the side we came from (the camera trails the flight), unless the leg is short or an overview.
    this.arrive =
      travel > 8 && s.kind !== 'opening' && s.kind !== 'finale'
        ? Math.atan2(p.target.x - to.x, p.target.z - to.z)
        : p.yaw - 0.5;
    this.tilt = s.pitch;
    if (this.sight && !s.track && s.kind !== 'opening' && s.kind !== 'finale') this.frame(i, to);
    this.dur = MathUtils.clamp(2.6 + travel / 75, 3, 7);
    // Climb with the distance (not when already high), so a long leg reads as a flight over the island.
    this.lift = MathUtils.clamp(travel * 0.32 - Math.max(0, p.distance - s.distance) * 0.5, 0, 140);
  }

  /** Bearing of the circling at `t` seconds into a hold that starts at `yaw0`. */
  private circle(i: number, yaw0: number, t: number): number {
    const s = this.stops[i]!;
    const spin = (i % 2 ? -1 : 1) * (s.kind === 'opening' || s.kind === 'finale' ? 0.05 : 0.09);
    return yaw0 + spin * (t < RAMP ? (t * t) / (2 * RAMP) : t - RAMP / 2);
  }

  /** Picks the arrival bearing and tilt for stop `i` (at `to`) whose whole circle has a clear view; else the clearest. */
  private frame(i: number, to: Vector3): void {
    const s = this.stops[i]!;
    const cam = new Vector3();
    const mid = new Vector3();
    let best = -1;
    let pick: [number, number] = [this.arrive, this.tilt];
    for (const tilt of TRY_TILT) {
      const pitch = Math.min(1.35, s.pitch + tilt);
      const cp = Math.cos(pitch);
      for (const off of TRY_YAW) {
        let clear = 0;
        for (const k of TRY_AT) {
          const yaw = this.circle(i, this.arrive + off, k * s.hold);
          const d = s.distance * (1 - 0.1 * smoother(k));
          cam
            .set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp)
            .multiplyScalar(d)
            .add(to);
          // Toward the stop, short of it (a landmark's middle is inside its own walls).
          if (this.sight!(cam, mid.lerpVectors(cam, to, 0.75))) clear++;
        }
        if (clear > best) [best, pick] = [clear, [this.arrive + off, pitch]];
        if (clear === TRY_AT.length) {
          [this.arrive, this.tilt] = pick;
          return;
        }
      }
    }
    [this.arrive, this.tilt] = pick;
  }

  /** Skips ahead to the next stop (or ends after the finale). */
  next(): boolean {
    if (this.index + 1 >= this.stops.length) return false;
    this.onLeave(this.index);
    this.begin(this.index + 1);
    return true;
  }

  step(dt: number): boolean {
    if (this.paused) dt = 0;
    this.t += dt;
    const s = this.stops[this.index]!;
    const p = this.pose;
    const to = this.targetOf(this.index, this.live);
    if (s.track && dt > 0) {
      // Heading from the mover's motion: the camera's bearing that puts it behind (smoothed through turns).
      const vx = to.x - this.seen.x;
      const vz = to.z - this.seen.z;
      if (vx * vx + vz * vz > 1e-6) {
        const behind = Math.atan2(-vx, -vz);
        this.heading = Number.isNaN(this.heading)
          ? behind
          : this.heading + turnTo(this.heading, behind) * (1 - Math.exp(-dt * 1.2));
      }
      this.seen.copy(to);
    }
    if (this.phase === 'travel') {
      const u = Math.min(1, this.t / this.dur);
      const e = smoother(u);
      const arc = Math.sin(Math.PI * e);
      p.target.lerpVectors(this.from.target, to, e);
      p.yaw = this.from.yaw + turnTo(this.from.yaw, this.arrive) * e;
      // Look down more while high mid-flight (the island below, not the horizon).
      p.pitch = Math.min(
        1.35,
        MathUtils.lerp(this.from.pitch, this.tilt, e) + 0.42 * arc * Math.min(1, this.lift / 50),
      );
      p.distance = MathUtils.lerp(this.from.distance, s.distance, e) + this.lift * arc;
      if (!this.announced && u > 0.55) {
        this.announced = true;
        this.onStop(this.index);
      }
      if (u >= 1) {
        this.phase = 'hold';
        this.t = 0;
      }
      return true;
    }
    // Hold: circle slowly (alternate ways per stop), easing in a little closer. The circling eases in over `RAMP`
    // seconds, so the arrival (which settles to a stop) flows into it.
    const k = Math.min(1, this.t / s.hold);
    p.target.copy(to);
    p.yaw = this.circle(this.index, this.arrive, this.t);
    // A moving stop: swing round behind it (a quarter-turn off to the side, so it shows in profile) as it goes.
    if (s.track && !Number.isNaN(this.heading)) {
      const goal = this.heading + 0.6 * (this.index % 2 ? -1 : 1);
      this.arrive += turnTo(p.yaw, goal) * (1 - Math.exp(-dt * 0.8));
      p.yaw = this.circle(this.index, this.arrive, this.t);
    }
    p.pitch = this.tilt;
    p.distance = s.distance * (1 - 0.1 * smoother(k));
    if (k < 1) return true;
    if (this.index + 1 >= this.stops.length) return false;
    this.onLeave(this.index);
    this.begin(this.index + 1);
    return true;
  }
}
