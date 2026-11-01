import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { NO_ENTITY } from './Grid';
import type { City } from './City';
import type { Fields } from './fields';
import { soilAt } from './floranet';
import { defenceList, isProtected } from './coast';
import { buildingExposure } from './risk';

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
  /** The lens explained (City Pulse → Lenses card, D-081): what it measures, how to read it, what to do about it. */
  about: string;
  read: string;
  act: string;
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

registerOverlay({ id: 'power', label: 'Power', icon: '⚡', legend: ['Blackout', 'Powered'], about: 'Whether each building and highway gets the electricity it needs. Highways carry the grid; a network is one connected set of highways and the buildings on them.', read: 'Green is supplied, red a brownout or blackout: that network uses more than it makes.', act: 'Add generation (solar, wind, geothermal) on the struggling network, or join it to a stronger one with a highway.', smooth: false, compute: serviceLens('power') });
registerOverlay({ id: 'water', label: 'Water', icon: '💧', legend: ['Dry', 'Supplied'], about: 'Whether each building and highway gets the water it needs, per highway network (pipes run beneath the highways).', read: 'Green is supplied, red dry taps: that network draws more water than it makes.', act: 'Build water works on the dry network, or join it to one with water to spare.', smooth: false, compute: serviceLens('water') });
registerOverlay({ id: 'pollution', label: 'Pollution', icon: '☁', legend: ['Clean', 'Polluted'], about: 'Pollution spreading from industry, power plants and traffic across the island.', read: 'Green is clean air and ground, red is polluted: it lowers harmony, desirability and the coast.', act: 'Pair factories with their symbiosis partners, keep them away from homes and the shore, and plant parks between.', invert: true, smooth: true, compute: fieldLens('pollution', 1.2) });
registerOverlay({ id: 'ecology', label: 'Ecology', icon: '🌿', legend: ['Barren', 'Lush'], about: "Living green cover: parks, wild flora, gardens and greenery on buildings. Stretched to the island's own range, so differences between districts read.", read: 'Bright green is lush, brown is barren compared with the rest of the island.', act: 'Plant parks, Bloom Retrofit tired buildings, and keep the soil healthy (Soil water and Nutrients lenses).', smooth: true, compute: fieldLens('ecology', 1, true) });
registerOverlay({ id: 'desirability', label: 'Desirability', icon: '◆', legend: ['Low', 'High'], about: 'Where people want to live: nature, amenities and calm raise it; pollution and traffic lower it. Relative to the island.', read: 'Bright is sought after, dark is low: homes there fill slowly and stay unhappy.', act: 'Put new homes where it is high; lift low areas with parks and amenities, and move pollution away.', smooth: true, compute: fieldLens('desirability', 1, true) });
registerOverlay({
  id: 'bloom',
  label: 'Bloom',
  icon: '🌸',
  legend: ['Barren', 'In bloom'], about: 'The seasonal bloom on each tile: flowering peaks in Bloom season, with healthy soil and pollinators.', read: 'Pink is in bloom, grey is barren.', act: 'Pollinator Sanctuaries, Drone Hives (mist with Y), healthy soil and Bloom Retrofits spread it.',
  smooth: true,
  compute(city, f, value, mask) {
    const b = city.grid.layer<Float32Array>('bloom');
    for (let i = 0; i < value.length; i++) {
      value[i] = b ? b[i]! : 0;
      mask[i] = f.shore[i] === 0 ? 0 : 1;
    }
  },
});
registerOverlay({
  id: 'nightlife',
  label: 'Night life',
  icon: '✨',
  legend: ['Quiet', 'Bustling'], about: "Pedestrian activity after dark, relative to the busiest tile. It drives the city's night glow and visitor income.", read: 'Bright is bustling, dark is quiet at night.', act: 'Mix homes with entertainment and amenities, and link them by sky-lanes and the Aeroline.',
  smooth: true,
  compute(city, f, value, mask) {
    // Stretched to the island's busiest tile so differences between districts read.
    const a = city.grid.layer<Float32Array>('activity');
    let hi = 1e-3;
    if (a) for (let i = 0; i < a.length; i++) hi = Math.max(hi, a[i]!);
    for (let i = 0; i < value.length; i++) {
      value[i] = a ? a[i]! / hi : 0;
      mask[i] = f.shore[i] === 0 ? 0 : 1;
    }
  },
});
registerOverlay({
  id: 'traffic',
  label: 'Traffic',
  icon: '⇶',
  legend: ['Free-flowing', 'Gridlock'], about: 'Load on each highway tile from commuters travelling between homes and jobs.', read: 'Green flows freely, red is gridlock: jams slow commuters and add pollution.', act: 'Add Pod Docks and sky-lane hubs, Aeroline stations, more lanes into jammed areas, and jobs closer to homes.',
  invert: true,
  smooth: false,
  compute(city, _f, value, mask) {
    const g = city.grid;
    const t = g.layer<Float32Array>('traffic');
    mask.fill(0);
    if (!t) return;
    for (let i = 0; i < g.road.length; i++) {
      if (!g.road[i]) continue;
      value[i] = Math.min(1, t[i]! / 1.5);
      mask[i] = 1;
    }
  },
});
/** Flora-Net soil lens: zone values interpolated per tile so gardens read as smooth patches. */
function soilLens(key: 'hydration' | 'nutrients') {
  return (city: City, f: Fields, value: Float32Array, mask: Uint8Array) => {
    const g = city.grid;
    const field = city.soil[key];
    for (let i = 0; i < value.length; i++) {
      value[i] = soilAt(city.soil, field, (i % g.w) + 0.5, ((i / g.w) | 0) + 0.5);
      mask[i] = f.shore[i] === 0 ? 0 : 1;
    }
  };
}
registerOverlay({ id: 'hydration', label: 'Soil water', icon: '❖', legend: ['Parched', 'Moist'], about: 'Moisture in the Flora-Net soil, smoothed across each zone.', read: 'Blue-green is moist, pale is parched: dry soil wilts plants and the bloom.', act: 'Mist with Drone Hives (Y), run channels nearby, and watch it in the Haze and droughts.', smooth: true, compute: soilLens('hydration') });
registerOverlay({ id: 'nutrients', label: 'Nutrients', icon: '✿', legend: ['Depleted', 'Rich'], about: 'Nutrients in the Flora-Net soil, smoothed across each zone. Farms draw them down.', read: 'Rich is green, depleted is pale: poor soil weakens farms and plants.', act: 'Drone Hives tend and pollinate within reach; spread farms out and plant gardens among them.', smooth: true, compute: soilLens('nutrients') });
registerOverlay({
  id: 'flood',
  label: 'Flood risk',
  icon: '🌊',
  legend: ['Floods at a king tide', 'Safe'], about: "Height above a king tide on today's sea level; a seawall makes what it covers safe.", read: 'Red floods at a king tide, green is safe. Sea rise moves the line inland over the years.', act: 'Line the low coast with Mangrove Seawalls, keep the lowest ground for parks, or reclaim land higher.',
  smooth: true,
  compute(city, f, value, mask) {
    // Height above a king tide on today's sea; seawalls make what they protect safe.
    const g = city.grid;
    const tide = city.steward.seaRise + 0.35;
    const defences = defenceList(city);
    for (let i = 0; i < value.length; i++) {
      mask[i] = f.shore[i] === 0 ? 0 : 1;
      if (!mask[i]) continue;
      const x = (i % g.w) + 0.5;
      const z = ((i / g.w) | 0) + 0.5;
      const h = g.rangeOver(i % g.w, (i / g.w) | 0, 1, 1).min;
      value[i] = h >= tide + 1 || isProtected(defences, x, z, tide) ? 1 : Math.max(0, h - tide);
    }
  },
});
registerOverlay({
  id: 'access',
  label: 'Access',
  icon: '≋',
  legend: ['Cut off', 'Connected'], about: 'Whether each building reaches a Living Highway: power, water and commuters all travel along them.', read: 'Green is connected, red is cut off: no services, no residents, no workers.', act: 'Draw a highway to the cut-off buildings (or demolish strays).',
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
registerOverlay({
  id: 'risk',
  label: 'Risk',
  icon: '⛈',
  legend: ['Safe', 'Exposed'], about: "Each building's exposure to hazards: floods (low waterfront no seawall covers), fire (no working Ember Watch in reach), lightning (towers and turbines), tornadoes (homes with no Storm Shelter in reach) and collapse (poor condition). Click a building to see its reasons.", read: 'Green is safe, red is exposed to several hazards at once.', act: 'Mangrove Seawalls on the low coast, Ember Watch stations, Storm Shelters near homes, and repair or renovate run-down buildings. A Weather Radar doubles the warning.',
  invert: true,
  smooth: false,
  compute(city, _f, value, mask) {
    // Each building's footprint takes its hazard exposure (`buildingExposure`): flood, fire, lightning, storm, frailty.
    const g = city.grid;
    mask.fill(0);
    for (const [e, x] of buildingExposure(city)) {
      const x0 = Building.x[e]!;
      const z0 = Building.z[e]!;
      for (let dz = 0; dz < Building.d[e]!; dz++)
        for (let dx = 0; dx < Building.w[e]!; dx++) {
          const i = g.index(x0 + dx, z0 + dz);
          value[i] = x.score;
          mask[i] = 1;
        }
    }
  },
});
