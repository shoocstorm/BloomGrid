import type { CommandStack } from '@/core/Commands';
import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { City } from './City';
import type { Modifiers } from './stewardState';
import type { SimCtx } from './systems';
import { DAY_LENGTH, PULSE_TICKS } from './pulseConst';
import { seasonAt } from './seasons';
import { ignite } from './hazards';
import {
  FIREWORK_KINDS,
  emptyStock,
  type FireworkKind,
  type FireworkShow,
  type FireworksState,
  type ShowRecord,
  type Stock,
} from './fireworksState';

/**
 * Fireworks (D-068). Fireworks factories (`fireworks` on a building def) turn materials into shells while
 * staffed and powered, round-robin through five kinds, up to their storage. Each night at 21:00 they put on
 * a show from a factory's yard if enough shells are in stock; the steward can launch one any time (the HUD
 * button or Flora). A show lifts harmony while it lasts and leaves an afterglow that fades over hours, draws
 * visitors (a little income) and costs a crew fee; the smoke adds to pollution while it clears, and on dry
 * nights a stray shell can set a roof alight. Every show also adds novelty fatigue: a nightly show stays a
 * treat, but shows fired back to back stop delighting and, past a point, the noise grates.
 */

export interface FireworkKindDef {
  name: string;
  /** Material cost per shell (credits), smoke per shell (relative). */
  cost: number;
  smoke: number;
}

export const FIREWORK_DEFS: Record<FireworkKind, FireworkKindDef> = {
  peony: { name: 'Peony', cost: 6, smoke: 1 },
  willow: { name: 'Golden Willow', cost: 9, smoke: 1.4 },
  ring: { name: 'Halo Ring', cost: 8, smoke: 0.8 },
  palm: { name: 'Palm', cost: 7, smoke: 1.2 },
  crackle: { name: 'Crackle', cost: 10, smoke: 1.6 },
};

/** Shells in a nightly / grand show, and the fewest a steward launch needs. */
export const SHOW_SHELLS = 30;
export const GRAND_SHELLS = 60;
export const MIN_SHELLS = 12;
/** Crew and safety fee per show. */
export const SHOW_FEE = 120;
/** The nightly show starts at 21:00 (time of day 0.875) if it hasn't run tonight. */
export const SHOW_TIME = 0.875;
/** Peak harmony from a show at full novelty (grand shows a bit more). */
const JOY = 8;
/** Afterglow half-life and fatigue recovery (per sim day). */
const GLOW_HALF_LIFE = 150;
const FATIGUE_PER_SHOW = 0.4;
const FATIGUE_RECOVERY = 0.45;
/** Smoke per shell (0..1 scale) and its clearing rate per pulse. */
const SMOKE = 0.01;
const SMOG_CLEAR = 0.985;
/** Chance per shell of a stray spark igniting a building near the launch site (scaled by dryness). */
const FIRE_RISK = 0.003;
const FIRE_REACH = 8;
const HISTORY_CAP = 12;

const GLOW_DECAY = Math.pow(0.5, 1 / GLOW_HALF_LIFE);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const stockTotal = (s: Stock) => FIREWORK_KINDS.reduce((a, k) => a + s[k], 0);
/** Night for fireworks: 19:12 to 05:17. Daylight shows are faint and draw fewer people. */
export const isNight = (t: number) => t >= 0.8 || t < 0.22;

/** How much a show delights residents now (1 fresh, 0 jaded, below 0 annoyed). */
export const novelty = (fw: FireworksState) => clamp(1 - fw.fatigue * 0.6, -0.5, 1);

/** Fireworks factories, oldest first: [eid, centre x, centre z]. */
export function launchSites(city: City): [number, number, number][] {
  return city
    .buildingEntities()
    .filter((e) => city.buildingDef(e).fireworks)
    .sort((a, b) => Building.uid[a]! - Building.uid[b]!)
    .map((e) => [e, Building.x[e]! + Building.w[e]! / 2, Building.z[e]! + Building.d[e]! / 2]);
}

/** Total shell storage of every factory. */
export function storage(city: City): number {
  let cap = 0;
  for (const e of city.buildingEntities()) cap += city.buildingDef(e).fireworks?.storage ?? 0;
  return cap;
}

/** Why a show can't launch now, or null. */
export function launchBlocker(city: City): string | null {
  const fw = city.fireworks;
  if (fw.show) return 'A show is already in the sky.';
  if (!launchSites(city).length) return 'Build a Fireworks Factory first: shows launch from its yard.';
  const n = stockTotal(fw.stock);
  if (n < MIN_SHELLS) return `Not enough shells: ${n} in stock, ${MIN_SHELLS} needed.`;
  if (city.credits < SHOW_FEE) return `Not enough credits for the crew fee (${SHOW_FEE}).`;
  return null;
}

/** Takes up to `n` shells from stock, evenly across kinds. */
function takeShells(stock: Stock, n: number): Stock {
  const out = emptyStock();
  let left = n;
  while (left > 0) {
    let took = false;
    for (const k of FIREWORK_KINDS) {
      if (left > 0 && stock[k] > 0) {
        stock[k]--;
        out[k]++;
        left--;
        took = true;
      }
    }
    if (!took) break;
  }
  return out;
}

/** Starts a show from the next factory in turn. Assumes `launchBlocker` passed. */
function startShow(city: City, grand: boolean, cause: FireworkShow['cause']): FireworkShow {
  const fw = city.fireworks;
  const sites = launchSites(city);
  const [, x, z] = sites[fw.shows % sites.length]!;
  const load = takeShells(fw.stock, grand ? GRAND_SHELLS : SHOW_SHELLS);
  const shells = stockTotal(load);
  const seconds = Math.max(15, Math.round(shells * (grand ? 0.5 : 0.65)));
  city.credits -= SHOW_FEE;
  fw.spent += SHOW_FEE;
  const show: FireworkShow = {
    id: fw.nextShowId++,
    startTick: city.tick,
    endTick: city.tick + seconds * PULSE_TICKS,
    x,
    z,
    load,
    left: { ...load },
    shells,
    fired: 0,
    fee: SHOW_FEE,
    grand,
    cause,
  };
  fw.show = show;
  fw.shows++;
  city.bus.emit('fireworks:start', { show });
  return show;
}

/** Share of a show's shells up by progress u (0..1): a steady programme, then a finale with 40% of them. */
const cadence = (u: number) => (u < 0.85 ? (0.6 * u) / 0.85 : 0.6 + (0.4 * (u - 0.85)) / 0.15);

/** The next `n` shells, interleaving the kinds still loaded. */
function nextShells(show: FireworkShow, n: number): FireworkKind[] {
  const out: FireworkKind[] = [];
  let i = show.fired;
  while (out.length < n && stockTotal(show.left) > 0) {
    const k = FIREWORK_KINDS[i++ % FIREWORK_KINDS.length]!;
    if (show.left[k] > 0) {
      show.left[k]--;
      out.push(k);
    }
  }
  return out;
}

/** How likely sparks are to catch tonight: dry seasons and heatwaves raise it, rain all but stops it. */
function dryness(city: City, mod: Modifiers): number {
  let d = seasonAt(city.tick).season.id === 'haze' ? 2.5 : 1;
  if (city.steward.crises.some((c) => c.def === 'heatwave' && c.phase === 'active')) d *= 2;
  if (mod.rain > 0.1 || city.steward.crises.some((c) => c.def === 'monsoon' && c.phase === 'active'))
    d *= 0.15;
  return d;
}

export interface FireworksEffect {
  /** Harmony points this pulse. */
  harmony: number;
  /** Extra pollution (absolute, same scale as `stats.pollution`). */
  pollution: number;
}

/**
 * Once per pulse, after occupancy is known: factories make shells, the nightly show starts, the show in the
 * sky fires its volleys, and the afterglow, fatigue and smoke move on. Deterministic (`city.rng`).
 */
export function updateFireworks(
  city: City,
  ents: ArrayLike<number> & Iterable<number>,
  mod: Modifiers,
  built: number,
): FireworksEffect {
  const fw = city.fireworks;
  // Production.
  let rate = 0;
  let cap = 0;
  for (const e of ents) {
    const f = buildings.at(Building.def[e]!).fireworks;
    if (!f) continue;
    cap += f.storage;
    if (mod.down.has(e)) continue;
    rate += (f.rate / 60) * Service.occupancy[e]! * Math.min(Service.power[e]!, Service.water[e]!);
  }
  if (cap > 0) {
    fw.progress = Math.min(fw.progress + rate, 4);
    while (fw.progress >= 1 && stockTotal(fw.stock) < cap) {
      const k = FIREWORK_KINDS[fw.nextKind % FIREWORK_KINDS.length]!;
      const cost = FIREWORK_DEFS[k].cost;
      if (city.credits < cost) break;
      city.credits -= cost;
      fw.spent += cost;
      fw.stock[k]++;
      fw.produced++;
      fw.nextKind++;
      fw.progress -= 1;
    }
    if (stockTotal(fw.stock) >= cap) fw.progress = Math.min(fw.progress, 1);
  }

  // The nightly show.
  const t = city.timeOfDay;
  if (fw.auto && !fw.show && fw.lastNight !== city.day && t >= SHOW_TIME && t < SHOW_TIME + 0.06) {
    fw.lastNight = city.day;
    if (stockTotal(fw.stock) >= SHOW_SHELLS && !launchBlocker(city)) startShow(city, false, 'night');
  }

  // The show in the sky.
  const night = isNight(t) ? 1 : 0.4;
  const nov = novelty(fw);
  const show = fw.show;
  if (show) {
    const u = clamp((city.tick - show.startTick) / Math.max(1, show.endTick - show.startTick), 0, 1);
    const due = Math.min(show.shells, Math.round(cadence(u) * show.shells)) - show.fired;
    const kinds = due > 0 ? nextShells(show, due) : [];
    if (kinds.length) {
      show.fired += kinds.length;
      fw.fired += kinds.length;
      city.bus.emit('fireworks:volley', { show, kinds, finale: u >= 0.85 });
      let smoke = 0;
      for (const k of kinds) smoke += FIREWORK_DEFS[k].smoke;
      fw.smog = Math.min(1, fw.smog + smoke * SMOKE);
      fw.glow = Math.min(1, fw.glow + kinds.length * 0.04 * night * (show.grand ? 1.2 : 1));
      // Stray sparks on dry nights.
      const risk = FIRE_RISK * dryness(city, mod);
      for (let i = 0; i < kinds.length; i++) {
        if (city.rng.next() >= risk) continue;
        const bx = Math.floor(show.x + (city.rng.next() * 2 - 1) * FIRE_REACH);
        const bz = Math.floor(show.z + (city.rng.next() * 2 - 1) * FIRE_REACH);
        const eid = city.buildingAt(bx, bz);
        if (eid >= 0) ignite(city, eid, 'fireworks', 0.2);
      }
    }
    // Visitors come for the show (fewer when the novelty has worn off, or in daylight).
    const visitors = Math.max(0, city.stats.income * 0.15 * nov * night);
    city.credits += visitors;
    fw.revenue += visitors;
    // The cadence reaches every shell by the end tick, so a show always ends with its racks empty.
    if (show.fired >= show.shells) endShow(city, show);
  } else fw.glow *= GLOW_DECAY;
  fw.fatigue = Math.max(0, fw.fatigue - FATIGUE_RECOVERY / DAY_LENGTH);
  fw.smog *= SMOG_CLEAR;
  if (fw.smog < 1e-4) fw.smog = 0;
  if (fw.glow < 1e-4) fw.glow = 0;
  return {
    harmony: JOY * fw.glow * nov,
    pollution: fw.smog * Math.max(1, built) * 0.6,
  };
}

function endShow(city: City, show: FireworkShow): void {
  const fw = city.fireworks;
  fw.fatigue += FATIGUE_PER_SHOW * (show.grand ? 1.4 : 1);
  const record: ShowRecord = {
    id: show.id,
    day: city.day,
    time: Math.round(timeAt(city, show.startTick) * 1000) / 1000,
    shells: show.fired,
    grand: show.grand,
    cause: show.cause,
  };
  fw.history.push(record);
  if (fw.history.length > HISTORY_CAP) fw.history.shift();
  fw.show = null;
  city.bus.emit('fireworks:end', { record });
}

/** Time of day at an earlier tick (the clock advances 1/DAY_LENGTH per sim second). */
function timeAt(city: City, tick: number): number {
  const t = city.timeOfDay - (city.tick - tick) / PULSE_TICKS / DAY_LENGTH;
  return ((t % 1) + 1) % 1;
}

/** "21:00" for a time of day. */
export function clockOf(t: number): string {
  const m = Math.floor(t * 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

interface LaunchUndo {
  id: number;
  load: Stock;
  fee: number;
}

export function registerFireworksCommands(stack: CommandStack<SimCtx>): void {
  stack.register<{ grand?: boolean }, LaunchUndo>('launchFireworks', {
    apply({ city }, p) {
      if (launchBlocker(city)) return null;
      const show = startShow(city, !!p.grand, 'steward');
      return { id: show.id, load: { ...show.load }, fee: show.fee };
    },
    revert({ city }, _p, u) {
      // Undo puts every shell back and refunds the crew, as if the show never happened.
      const fw = city.fireworks;
      if (fw.show?.id === u.id) {
        fw.fired -= fw.show.fired;
        fw.show = null;
      } else {
        const i = fw.history.findIndex((r) => r.id === u.id);
        if (i >= 0) {
          fw.fired -= fw.history[i]!.shells;
          fw.history.splice(i, 1);
        }
      }
      for (const k of FIREWORK_KINDS) fw.stock[k] += u.load[k];
      fw.shows = Math.max(0, fw.shows - 1);
      city.credits += u.fee;
      fw.spent -= u.fee;
    },
  });

  stack.register<{ on: boolean }, { was: boolean }>('setFireworksAuto', {
    apply({ city }, p) {
      const was = city.fireworks.auto;
      if (was === p.on) return null;
      city.fireworks.auto = p.on;
      return { was };
    },
    revert({ city }, _p, u) {
      city.fireworks.auto = u.was;
    },
  });
}
