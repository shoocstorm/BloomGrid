import { query } from 'bitecs';
import { Building, Greenery, Service } from '@/ecs/components';
import { buildings } from '@/content';
import type { City } from './City';
import type { Fields } from './fields';
import { blurPeak, boxBlur } from './blur';
import { seasonAt } from './seasons';

const IRRIGATION_RANGE = 4;

export interface BloomLayers {
  pollen: Float32Array;
  /** 0..1 flowering / pollination health per tile. */
  bloom: Float32Array;
  /** 0..1 irrigation from nearby filtration channels (1 on a channel). */
  irrigation: Float32Array;
  /** 0 none, 1 channel, 2 lush channel (lily pads & koi after a retrofit). */
  channel: Uint8Array;
}

export function bloomLayers(city: City): BloomLayers {
  const g = city.grid;
  const n = g.w * g.h;
  return {
    pollen: g.addLayer('pollen', () => new Float32Array(n)),
    bloom: g.addLayer('bloom', () => new Float32Array(n)),
    irrigation: g.addLayer('irrigation', () => new Float32Array(n)),
    channel: g.addLayer('channel', () => new Uint8Array(n)),
  };
}

/** Irrigation falloff from filtration channels (BFS, recomputed when channels change). */
export function computeIrrigation(city: City): void {
  const g = city.grid;
  const { irrigation, channel } = bloomLayers(city);
  const dist = new Uint8Array(g.w * g.h).fill(255);
  const q = new Int32Array(g.w * g.h);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < channel.length; i++)
    if (channel[i]) {
      dist[i] = 0;
      q[tail++] = i;
    }
  while (head < tail) {
    const t = q[head++]!;
    const d = dist[t]! + 1;
    if (d > IRRIGATION_RANGE) continue;
    const x = t % g.w;
    const z = (t / g.w) | 0;
    for (const [nx, nz] of [
      [x - 1, z],
      [x + 1, z],
      [x, z - 1],
      [x, z + 1],
    ] as const) {
      if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue;
      const i = nz * g.w + nx;
      if (dist[i]! > d) {
        dist[i] = d;
        q[tail++] = i;
      }
    }
  }
  for (let i = 0; i < irrigation.length; i++) irrigation[i] = dist[i]! > IRRIGATION_RANGE ? 0 : 1 - dist[i]! / (IRRIGATION_RANGE + 1);
}

const POLLEN_BLUR = { r: 4, passes: 2 };
const POLLEN_SCALE = 1 / blurPeak(POLLEN_BLUR.r, POLLEN_BLUR.passes);

/**
 * Seasonal Bloom Engine field pass (every few pulses, after `computeFields`):
 * pollen spreads from pollinator habitat (parks, sanctuaries, lush buildings, wild meadows);
 * bloom = pollen × water × clean air × season × clean-energy share, plus channel irrigation.
 * Channels also scrub nearby pollution. Writes the city bloom index and clean-energy share.
 */
export function computeBloom(city: City, f: Fields): void {
  const g = city.grid;
  const n = g.w * g.h;
  const L = bloomLayers(city);
  const { pollen, bloom, irrigation } = L;
  // Wild meadows and forests are strong pollen sources (in proportion to their ecology).
  for (let i = 0; i < n; i++) pollen[i] = f.shore[i] === 0 ? 0 : g.occupant[i] === -1 && !g.road[i] ? f.ecology[i]! * 1.1 : 0;
  let clean = 0;
  let total = 0;
  for (const eid of query(city.world, [Building])) {
    const d = buildings.at(Building.def[eid]!);
    const lush = Greenery.value[eid]! > 0.7 ? 0.15 : 0;
    const p = (d.pollinators ?? 0) + lush + (Building.level[eid]! > 0 ? 0.35 : 0);
    // Point deposit at the centre; the blur below spreads it (~9 tiles).
    if (p > 0) pollen[g.index(Building.x[eid]! + (Building.w[eid]! >> 1), Building.z[eid]! + (Building.d[eid]! >> 1))] += p * 0.18 * POLLEN_SCALE;
    if (d.stats.energy > 0) {
      total += d.stats.energy;
      if (d.cleanEnergy || (d.stats.pollution <= 0 && !d.symbiosis) || Service.paired[eid]) clean += d.stats.energy;
    }
  }
  boxBlur(pollen, g.w, g.h, POLLEN_BLUR.r, POLLEN_BLUR.passes);
  const cleanShare = total > 0 ? clean / total : 1;
  const season = seasonAt(city.tick).season;
  const water = Math.min(1, city.pulse.waterRatio);
  const k = season.bloom * (0.75 + 0.25 * cleanShare) * (0.6 + 0.4 * water);
  let sum = 0;
  let land = 0;
  for (let i = 0; i < n; i++) {
    if (f.shore[i] === 0) {
      bloom[i] = 0;
      continue;
    }
    // Channels scrub nearby pollution and lift desirability a little.
    if (irrigation[i]! > 0) {
      f.pollution[i] = f.pollution[i]! * (1 - 0.6 * irrigation[i]!);
      f.desirability[i] = Math.min(1, f.desirability[i]! + 0.08 * irrigation[i]!);
    }
    const b = Math.min(1, Math.max(0, Math.min(1.2, pollen[i]!) * k * (1 - Math.min(1, f.pollution[i]!) * 0.8) + irrigation[i]! * 0.25));
    bloom[i] = b;
    // The index the steward manages: bloom across the built city (buildings + highways).
    if (g.occupant[i] !== -1 || g.road[i]) {
      sum += b;
      land++;
    }
  }
  city.pulse.bloomIndex = land ? sum / land : 0;
  city.pulse.cleanShare = cleanShare;
}

/**
 * Symbiotic pairing: a building with `symbiosis` is paired when any partner building's centre
 * lies within its radius. O(buildings × partners), recomputed on the field cadence.
 */
export function computePairing(city: City): void {
  const ents = query(city.world, [Building]);
  const centres = new Map<string, [number, number][]>();
  for (const eid of ents) {
    const id = buildings.at(Building.def[eid]!).id;
    let l = centres.get(id);
    if (!l) centres.set(id, (l = []));
    l.push([Building.x[eid]! + Building.w[eid]! / 2, Building.z[eid]! + Building.d[eid]! / 2]);
  }
  for (const eid of ents) {
    const s = buildings.at(Building.def[eid]!).symbiosis;
    if (!s) {
      Service.paired[eid] = 0;
      continue;
    }
    const cx = Building.x[eid]! + Building.w[eid]! / 2;
    const cz = Building.z[eid]! + Building.d[eid]! / 2;
    let paired = 0;
    for (const p of s.partners)
      for (const [x, z] of centres.get(p) ?? [])
        if ((x - cx) ** 2 + (z - cz) ** 2 <= s.radius * s.radius) {
          paired = 1;
          break;
        }
    Service.paired[eid] = paired;
  }
}
