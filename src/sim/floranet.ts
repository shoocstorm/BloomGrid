import { query } from 'bitecs';
import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { City } from './City';
import { seasonAt, showerAt } from './seasons';
import { OVERGROWN } from './upkeep';

/** Soil zones are ZONE×ZONE tiles: coarse enough to save cheaply, fine enough to read as gardens. */
export const ZONE = 8;
export const MIST_COST = 120;
/** Mist radius in zones (3×3 zones around the click). */
export const MIST_RADIUS = 1;
const DRY = 0.35;
/** Per-pass relaxation rates toward the sustainable soil state (hydration ~1 min, nutrients ~3 min). */
const RELAX_H = 0.08;
const RELAX_N = 0.03;

/**
 * Flora-Net soil state (saved): hydration and nutrients per zone, 0..1. `land` marks zones with
 * dry land (sea zones are ignored everywhere).
 */
export interface SoilState {
  zw: number;
  zh: number;
  hydration: Float32Array;
  nutrients: Float32Array;
  land: Uint8Array;
}

/** A drone sortie for rendering: hive → target, with what the drone does there. */
export interface DroneJob {
  hx: number;
  hz: number;
  tx: number;
  tz: number;
  /** 0 pollinate, 1 harvest, 2 trim overgrowth, 3 mist a dry garden. */
  kind: 0 | 1 | 2 | 3;
}

export function createSoil(size: number): SoilState {
  const zw = Math.ceil(size / ZONE);
  const zh = zw;
  return { zw, zh, hydration: new Float32Array(zw * zh).fill(0.7), nutrients: new Float32Array(zw * zh).fill(0.65), land: new Uint8Array(zw * zh) };
}

export const zoneOf = (soil: SoilState, x: number, z: number) =>
  Math.min(soil.zh - 1, Math.max(0, Math.floor(z / ZONE))) * soil.zw + Math.min(soil.zw - 1, Math.max(0, Math.floor(x / ZONE)));

/** Bilinear soil value at a world xz (for lenses and smooth sampling). */
export function soilAt(soil: SoilState, field: Float32Array, x: number, z: number): number {
  const fx = Math.min(soil.zw - 1, Math.max(0, x / ZONE - 0.5));
  const fz = Math.min(soil.zh - 1, Math.max(0, z / ZONE - 0.5));
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(soil.zw - 1, x0 + 1);
  const z1 = Math.min(soil.zh - 1, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const v = (i: number, j: number) => field[j * soil.zw + i]!;
  return (v(x0, z0) * (1 - tx) + v(x1, z0) * tx) * (1 - tz) + (v(x0, z1) * (1 - tx) + v(x1, z1) * tx) * tz;
}

/** Marks land zones (once per city; terrain is static). */
export function initSoilLand(city: City): void {
  const soil = city.soil;
  const shore = city.fields.shore;
  const g = city.grid;
  soil.land.fill(0);
  for (let i = 0; i < shore.length; i++) if (shore[i]! > 0) soil.land[zoneOf(soil, i % g.w, (i / g.w) | 0)] = 1;
}

let irrSum = new Float32Array(0);
let tileN = new Float32Array(0);
let supply = new Float32Array(0);
let users = new Float32Array(0);
let farm = new Float32Array(0);
let compost = new Float32Array(0);
let droneCare = new Float32Array(0);

/**
 * Flora-Net pass (Phase 9, pulse phase 3): soil hydration evaporates with the season and heat and
 * refills from showers, monsoon rain, filtration channels and the water network; farms draw
 * nutrients that parks, bioreactor digestate and drone harvests return. Flora-Net then acts:
 * pods mist dry zones they fly over, and Drone Hives pollinate, harvest, trim overgrown highways
 * and mist dry gardens around them. Writes `Service.soil` for every building and the derived
 * `pulse.drones` / `pulse.mists` / `pulse.dryZones` / `pulse.soilHealth`.
 */
export function computeFloraNet(city: City): void {
  const soil = city.soil;
  const g = city.grid;
  const Z = soil.zw * soil.zh;
  if (irrSum.length < Z) {
    irrSum = new Float32Array(Z);
    tileN = new Float32Array(Z);
    supply = new Float32Array(Z);
    users = new Float32Array(Z);
    farm = new Float32Array(Z);
    compost = new Float32Array(Z);
    droneCare = new Float32Array(Z);
  }
  for (const a of [irrSum, tileN, supply, users, farm, compost, droneCare]) a.fill(0, 0, Z);
  if (!soil.land.some((v) => v)) initSoilLand(city);

  const irrigation = g.layer<Float32Array>('irrigation');
  if (irrigation)
    for (let i = 0; i < irrigation.length; i++) {
      const zi = zoneOf(soil, i % g.w, (i / g.w) | 0);
      irrSum[zi] += irrigation[i]!;
      tileN[zi]++;
    }

  // Buildings: water supply, farm draw, compost sources, Drone Hives.
  const ents = query(city.world, [Building]);
  const hives: { eid: number; x: number; z: number; r: number; n: number }[] = [];
  for (const eid of ents) {
    const d = buildings.at(Building.def[eid]!);
    const st = d.stats;
    const cx = Building.x[eid]! + Building.w[eid]! / 2;
    const cz = Building.z[eid]! + Building.d[eid]! / 2;
    const zi = zoneOf(soil, cx, cz);
    if (st.water < 0) {
      supply[zi] += Service.water[eid]!;
      users[zi]++;
    }
    const occ = Service.occupancy[eid]!;
    if (st.food > 0) farm[zi] += st.food * (st.jobs > 0 ? occ : 1);
    if (d.category === 'nature') compost[zi] += 0.5 + Math.max(0, st.happiness) * 0.05;
    // Bioreactor digestate returns nutrients (only when paired: purified effluent).
    if (d.symbiosis && Service.paired[eid]) compost[zi] += 1;
    if (d.drones && Service.network[eid]! >= 0) hives.push({ eid, x: cx, z: cz, r: d.drones.radius, n: Math.round(d.drones.count * Service.power[eid]! * Math.max(0.3, occ)) });
  }

  // Hive coverage per zone (drone care: harvest bonus, misting, nutrients).
  for (const hv of hives) {
    const r = hv.r / ZONE + 0.5;
    const zx = hv.x / ZONE;
    const zz = hv.z / ZONE;
    for (let j = Math.max(0, Math.floor(zz - r)); j <= Math.min(soil.zh - 1, Math.floor(zz + r)); j++)
      for (let i = Math.max(0, Math.floor(zx - r)); i <= Math.min(soil.zw - 1, Math.floor(zx + r)); i++)
        if ((i + 0.5 - zx) ** 2 + (j + 0.5 - zz) ** 2 <= r * r) droneCare[j * soil.zw + i] = Math.min(1, droneCare[j * soil.zw + i]! + hv.n / 12);
  }

  // Soil dynamics.
  const season = seasonAt(city.tick).season;
  let heat = 0;
  let monsoon = 0;
  for (const c of city.steward.crises)
    if (c.phase === 'active') {
      if (c.def === 'heatwave') heat = Math.max(heat, c.severity);
      if (c.def === 'monsoon') monsoon = Math.max(monsoon, c.severity);
    }
  const rain = showerAt(city.tick) * 0.05 + monsoon * 0.08;
  const H = soil.hydration;
  const N = soil.nutrients;
  for (let zi = 0; zi < Z; zi++) {
    if (!soil.land[zi]) continue;
    const irr = tileN[zi]! ? irrSum[zi]! / tileN[zi]! : 0;
    const wild = !users[zi];
    const served = wild ? 0 : supply[zi]! / users[zi]!;
    // Soil relaxes toward a moisture the zone can sustain (~1 min time constant): the water network,
    // channels and wild groundwater hold it up; dry seasons and heatwaves pull it down.
    const target = clamp01(0.3 + 0.4 * served + 0.6 * irr + (wild ? 0.25 : 0) - 0.35 * (season.evaporation - 1) - 0.25 * heat);
    const h = H[zi]!;
    H[zi] = clamp01(h + RELAX_H * (target - h) + rain + (droneCare[zi]! && h < 0.5 ? 0.02 * droneCare[zi]! : 0));
    // Farms draw nutrients; parks, digestate and drone harvest compost return them (~3 min).
    const nTarget = Math.max(0.05, Math.min(1, 0.65 - farm[zi]! / 2500 + compost[zi]! * 0.08 + droneCare[zi]! * 0.15));
    N[zi] = clamp01(N[zi]! + RELAX_N * (nTarget - N[zi]!));
  }

  // Pods mist the driest zones under their sky-lanes (one pass per zone).
  const mists: { x: number; z: number }[] = [];
  for (const r of city.pulse.podRoutes) {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
    let last = -1;
    for (let s = 0; s <= len; s += ZONE / 2) {
      const t = len ? s / len : 0;
      const x = r.ax + (r.bx - r.ax) * t;
      const z = r.az + (r.bz - r.az) * t;
      const zi = zoneOf(soil, x, z);
      if (zi === last || !soil.land[zi] || H[zi]! >= DRY + 0.15) continue;
      last = zi;
      H[zi] = clamp01(H[zi]! + 0.06);
      if (mists.length < 6) mists.push({ x: x, z: z });
    }
  }

  // Per-building soil (greenery growth and plant vitality read it).
  for (const eid of ents) Service.soil[eid] = H[zoneOf(soil, Building.x[eid]! + Building.w[eid]! / 2, Building.z[eid]! + Building.d[eid]! / 2)]!;

  // Drone sorties for rendering: each hive spreads its drones over the work around it.
  const drones: DroneJob[] = [];
  const og = g.layer<Uint8Array>('overgrowth');
  for (const hv of hives) {
    if (hv.n <= 0) continue;
    const jobs: Omit<DroneJob, 'hx' | 'hz'>[] = [];
    for (const eid of ents) {
      const d = buildings.at(Building.def[eid]!);
      const cx = Building.x[eid]! + Building.w[eid]! / 2;
      const cz = Building.z[eid]! + Building.d[eid]! / 2;
      if ((cx - hv.x) ** 2 + (cz - hv.z) ** 2 > hv.r * hv.r || eid === hv.eid) continue;
      if (d.stats.food > 0) jobs.push({ tx: cx, tz: cz, kind: 1 });
      else if (Service.soil[eid]! < DRY + 0.1) jobs.push({ tx: cx, tz: cz, kind: 3 });
      else if (d.category === 'nature' || d.pollinators) jobs.push({ tx: cx, tz: cz, kind: 0 });
    }
    if (og)
      for (let j = Math.max(0, Math.floor(hv.z - hv.r)); j < Math.min(g.h, hv.z + hv.r) && jobs.length < 64; j += 2)
        for (let i = Math.max(0, Math.floor(hv.x - hv.r)); i < Math.min(g.w, hv.x + hv.r); i += 2)
          if (og[j * g.w + i]! >= 64) jobs.push({ tx: i + 0.5, tz: j + 0.5, kind: 2 });
    for (let i = 0; i < hv.n; i++) {
      const job = jobs.length ? jobs[(i * 7) % jobs.length]! : { tx: hv.x + Math.cos(i) * 4, tz: hv.z + Math.sin(i) * 4, kind: 0 as const };
      drones.push({ hx: hv.x, hz: hv.z, ...job });
    }
  }

  // Health: share of built zones with healthy soil.
  let built = 0;
  let healthy = 0;
  let dry = 0;
  for (let zi = 0; zi < Z; zi++) {
    if (!soil.land[zi] || (!users[zi] && !farm[zi])) continue;
    built++;
    if (H[zi]! < DRY) dry++;
    if (H[zi]! >= DRY && N[zi]! >= 0.3) healthy++;
  }
  const p = city.pulse;
  p.soilHealth = built ? healthy / built : 1;
  p.dryZones = dry;
  p.drones = drones;
  p.mists = mists;
  p.hives = hives.map((h) => ({ x: h.x, z: h.z, r: h.r }));
}

/** Drone crews keep highways near a hive clear even under austerity (every pulse). */
export function trimNearHives(city: City, bump: (t: number, v: number) => void): void {
  const og = city.grid.layer<Uint8Array>('overgrowth');
  if (!og || !city.steward.overgrown) return;
  const g = city.grid;
  for (const hv of city.pulse.hives) {
    for (let j = Math.max(0, Math.floor(hv.z - hv.r)); j < Math.min(g.h, hv.z + hv.r); j++)
      for (let i = Math.max(0, Math.floor(hv.x - hv.r)); i < Math.min(g.w, hv.x + hv.r); i++) {
        const t = j * g.w + i;
        if (og[t] && (i + 0.5 - hv.x) ** 2 + (j + 0.5 - hv.z) ** 2 <= hv.r * hv.r) bump(t, og[t]! - (og[t]! >= OVERGROWN ? 16 : 32));
      }
  }
}

/** Food multiplier for a farm from its zone's soil and nearby drone harvesting. */
export function farmSoilMul(city: City, x: number, z: number): number {
  const soil = city.soil;
  const zi = zoneOf(soil, x, z);
  let care = 0;
  for (const hv of city.pulse.hives) if ((hv.x - x) ** 2 + (hv.z - z) ** 2 <= hv.r * hv.r) care = 1;
  return (0.75 + 0.4 * soil.nutrients[zi]!) * (0.7 + 0.3 * Math.min(1, soil.hydration[zi]! / 0.6)) * (1 + 0.1 * care);
}

/** Zones a Mist dispatch at (x, z) would water. */
export function mistZones(city: City, x: number, z: number): number[] {
  const soil = city.soil;
  const c = zoneOf(soil, x, z);
  const cx = c % soil.zw;
  const cz = (c / soil.zw) | 0;
  const out: number[] = [];
  for (let j = cz - MIST_RADIUS; j <= cz + MIST_RADIUS; j++)
    for (let i = cx - MIST_RADIUS; i <= cx + MIST_RADIUS; i++)
      if (i >= 0 && j >= 0 && i < soil.zw && j < soil.zh && soil.land[j * soil.zw + i]) out.push(j * soil.zw + i);
  return out;
}

/** Stable checksum of the soil state (for `City.hash`). */
export function soilChecksum(soil: SoilState): number {
  let h = 0;
  for (let i = 0; i < soil.hydration.length; i++) h = (h * 31 + Math.round(soil.hydration[i]! * 1000) * 7 + Math.round(soil.nutrients[i]! * 1000)) | 0;
  return h;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
