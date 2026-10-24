import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { NO_ENTITY } from './Grid';
import type { City } from './City';
import type { Fields } from './fields';

/**
 * Data lenses: each overlay fills a per-tile value (0..1) and a mask (1 = has data). Pure sim
 * code; the renderer uploads the result to a texture. Modules may register more overlays.
 */
export interface OverlaySpec {
  id: string;
  label: string;
  icon: string;
  /** Legend labels for value 0 and 1. */
  legend: [string, string];
  /** True when high values are bad (pollution) — flips the colour ramp. */
  invert?: boolean;
  /** Smooth (fields) or crisp per-tile (buildings / networks) sampling. */
  smooth: boolean;
  compute(city: City, fields: Fields, value: Float32Array, mask: Uint8Array): void;
}

const overlays = new Map<string, OverlaySpec>();
export const registerOverlay = (o: OverlaySpec) => void overlays.set(o.id, o);
export const getOverlay = (id: string) => overlays.get(id);
export const allOverlays = () => [...overlays.values()];

/** Per-building and per-highway service level (power or water). */
function serviceLens(kind: 'power' | 'water') {
  return (city: City, _f: Fields, value: Float32Array, mask: Uint8Array) => {
    const g = city.grid;
    const nets = city.pulse.networks;
    mask.fill(0);
    for (let i = 0; i < g.road.length; i++) {
      if (!g.road[i]) continue;
      const net = city.networks.comp[i]!;
      const s = nets[net];
      if (!s) continue;
      const used = kind === 'power' ? s.energyUsed : s.waterUsed;
      const prod = kind === 'power' ? s.energyProduced : s.waterProduced;
      value[i] = used > 0 ? Math.min(1, prod / used) : 1;
      mask[i] = 1;
    }
    for (let i = 0; i < g.occupant.length; i++) {
      const eid = g.occupant[i]!;
      if (eid === NO_ENTITY) continue;
      const st = buildings.at(Building.def[eid]!).stats;
      const needs = kind === 'power' ? st.energy < 0 : st.water < 0;
      const makes = kind === 'power' ? st.energy > 0 : st.water > 0;
      if (!needs && !makes) continue;
      value[i] = makes ? 1 : kind === 'power' ? Service.power[eid]! : Service.water[eid]!;
      mask[i] = 1;
    }
  };
}

/**
 * Field lens. `relative` stretches values to the island's own min..max (auto-contrast), so
 * subtle differences in desirability or ecology stay readable; absolute fields keep 0 = none.
 */
function fieldLens(key: 'pollution' | 'ecology' | 'desirability', scale = 1, relative = false) {
  return (_city: City, f: Fields, value: Float32Array, mask: Uint8Array) => {
    const src = f[key];
    let lo = 0;
    let span = 1 / scale;
    if (relative) {
      lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < src.length; i++) {
        if (f.shore[i] === 0) continue;
        if (src[i]! < lo) lo = src[i]!;
        if (src[i]! > hi) hi = src[i]!;
      }
      span = Math.max(1e-3, hi - lo);
    }
    for (let i = 0; i < src.length; i++) {
      value[i] = Math.min(1, Math.max(0, (src[i]! - lo) / span));
      mask[i] = f.shore[i] === 0 ? 0 : 1;
    }
  };
}

registerOverlay({ id: 'power', label: 'Power', icon: '⚡', legend: ['Blackout', 'Powered'], smooth: false, compute: serviceLens('power') });
registerOverlay({ id: 'water', label: 'Water', icon: '💧', legend: ['Dry', 'Supplied'], smooth: false, compute: serviceLens('water') });
registerOverlay({ id: 'pollution', label: 'Pollution', icon: '☁', legend: ['Clean', 'Polluted'], invert: true, smooth: true, compute: fieldLens('pollution', 1.2) });
registerOverlay({ id: 'ecology', label: 'Ecology', icon: '🌿', legend: ['Barren', 'Lush'], smooth: true, compute: fieldLens('ecology', 1, true) });
registerOverlay({ id: 'desirability', label: 'Desirability', icon: '◆', legend: ['Low', 'High'], smooth: true, compute: fieldLens('desirability', 1, true) });
registerOverlay({
  id: 'access',
  label: 'Access',
  icon: '≋',
  legend: ['Cut off', 'Connected'],
  smooth: false,
  compute(city, _f, value, mask) {
    const g = city.grid;
    mask.fill(0);
    for (let i = 0; i < g.road.length; i++) {
      if (g.road[i]) {
        value[i] = 1;
        mask[i] = 1;
        continue;
      }
      const eid = g.occupant[i]!;
      if (eid === NO_ENTITY) continue;
      const st = buildings.at(Building.def[eid]!).stats;
      if (st.energy >= 0 && st.water >= 0 && st.population === 0 && st.jobs === 0) continue;
      value[i] = Service.network[eid]! >= 0 ? 1 : 0;
      mask[i] = 1;
    }
  },
});
