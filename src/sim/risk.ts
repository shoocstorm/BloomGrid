import { Building, Service } from '@/ecs/components';
import type { City } from './City';
import { getCrisis } from './crises';
import { seasonAt } from './seasons';
import { defenceList, isProtected } from './coast';
import { measure } from './consequences';
import { wonderVisible } from './wonders';
import './disasters'; // registers the tornado and tsunami

/**
 * Hazard risk (Phase 21, D-076): for each hazard, how likely and how harmful it is right now, as a level and the
 * factors behind it, each a multiplier with a reason ("No Weather Radar: half the warning"). Reads the same inputs
 * the sim uses: crisis weights, the season, consequence tilts, prevention buildings. Pure; for the dashboard's
 * Risk panel and Flora's `risk_status`.
 */
export interface RiskFactor {
  label: string;
  /** > 1 raises the risk, < 1 lowers it. */
  mul: number;
}

export interface HazardRisk {
  id: string;
  name: string;
  icon: string;
  /** 0..1 and its word. */
  score: number;
  level: 'Low' | 'Moderate' | 'High' | 'Severe';
  factors: RiskFactor[];
  /** What would lower it most. */
  advice: string;
}

const word = (v: number): HazardRisk['level'] =>
  v < 0.25 ? 'Low' : v < 0.5 ? 'Moderate' : v < 0.75 ? 'High' : 'Severe';

export function riskReport(city: City): HazardRisk[] {
  const m = measure(city);
  const season = seasonAt(city.tick).season;
  const tilt = city.consequences.mods.crisis;
  const ents = city.buildingEntities();
  const has = (pred: (e: number) => boolean) => ents.some(pred);
  const radar = has((e) => !!city.buildingDef(e).radar && !Service.off[e]);
  const shelters = ents.filter((e) => city.buildingDef(e).shelter).length;
  const spinning = ents.filter((e) => city.buildingDef(e).id === 'wind-turbine' && !Service.off[e]).length;
  // Low waterfront: buildings near the sea (shore field < 8) on ground under 1.5, and how many a seawall covers.
  const defences = defenceList(city);
  const shore = city.fields.shore;
  let low = 0;
  let walled = 0;
  for (const e of ents) {
    const g = city.grid.rangeOver(Building.x[e]!, Building.z[e]!, Building.w[e]!, Building.d[e]!).min;
    if (
      g >= 1.5 ||
      shore[
        city.grid.index(Building.x[e]! + (Building.w[e]! >> 1), Building.z[e]! + (Building.d[e]! >> 1))
      ]! >= 8
    )
      continue;
    low++;
    if (isProtected(defences, Building.x[e]! + Building.w[e]! / 2, Building.z[e]! + Building.d[e]! / 2, 2))
      walled++;
  }
  const base = (id: string) => getCrisis(id).weight(city) * (season.crisis[id] ?? 1) * (tilt[id] ?? 1);
  const out: HazardRisk[] = [];
  const push = (id: string, raw: number, factors: RiskFactor[], advice: string) => {
    const d = getCrisis(id);
    const score = Math.min(1, raw * factors.reduce((a, f) => a * f.mul, 1));
    out.push({ id, name: d.name, icon: d.icon, score, level: word(score), factors, advice });
  };
  push(
    'tornado',
    base('tornado') * 0.6,
    [
      {
        label: season.id === 'monsoon' ? 'Monsoon season: tornado weather' : `${season.name} season`,
        mul: season.id === 'monsoon' ? 1.6 : 0.8,
      },
      {
        label: `${spinning} turbines spinning (feather them before a storm)`,
        mul: 1 + Math.min(0.8, spinning / 120),
      },
      {
        label: m.parks >= 20 ? `${m.parks} parks as windbreaks` : `Only ${m.parks} parks to break the wind`,
        mul: m.parks >= 20 ? 0.75 : 1.1,
      },
      {
        label: shelters ? `${shelters} Storm Shelter${shelters > 1 ? 's' : ''}` : 'No Storm Shelters',
        mul: shelters ? 0.7 : 1.15,
      },
      { label: radar ? 'Weather Radar: double warning' : 'No Weather Radar', mul: radar ? 0.8 : 1 },
    ],
    shelters
      ? 'Feather turbines when a tornado is forecast.'
      : 'Build Storm Shelters near homes and parks as windbreaks.',
  );
  push(
    'tsunami',
    base('tsunami') * 3,
    [
      { label: `${low} low-lying buildings on the waterfront`, mul: 0.5 + Math.min(1.5, low / 300) },
      {
        label: low ? `${walled} of them behind a seawall` : 'Nothing low to flood',
        mul: low ? 1 - 0.6 * (walled / low) : 0.3,
      },
      {
        label: wonderVisible(city, 'tideGates') ? 'Tide Gates can be closed' : 'No Tide Gates yet',
        mul: wonderVisible(city, 'tideGates') ? 0.75 : 1,
      },
      {
        label: radar ? 'Weather Radar: double warning to evacuate' : 'No Weather Radar',
        mul: radar ? 0.8 : 1,
      },
    ],
    walled < low
      ? 'Line the low coast with Mangrove Seawalls; evacuate when a tsunami is forecast.'
      : 'Keep the seawalls in repair.',
  );
  push(
    'thunderstorm',
    base('thunderstorm') * 0.35,
    [
      {
        label: `${m.towers} towers and ${spinning} spinning turbines draw lightning`,
        mul: 1 + Math.min(0.6, (m.towers + spinning) / 600),
      },
      {
        label: `Ember Watch reaches ${Math.round(m.fireCover * 100)}% of buildings`,
        mul: 1.4 - 0.6 * m.fireCover,
      },
    ],
    'Cover tall districts with Ember Watch stations; feather turbines in storms.',
  );
  push(
    'heatwave',
    base('heatwave') * 0.6,
    [
      {
        label: `Heat island ${Math.round((city.consequences.rules['heat-island']?.level ?? 0) * 100)}%`,
        mul: 1 + (city.consequences.rules['heat-island']?.level ?? 0),
      },
      {
        label: season.id === 'haze' ? 'Haze season' : `${season.name} season`,
        mul: season.id === 'haze' ? 1.5 : 0.9,
      },
    ],
    'Plant parks among the towers.',
  );
  push(
    'monsoon',
    base('monsoon') * 0.3,
    [
      {
        label: `Flood damage ×${city.consequences.mods.flood.toFixed(2)} (bare coast)`,
        mul: city.consequences.mods.flood,
      },
      { label: `${low} low-lying waterfront buildings`, mul: 0.6 + Math.min(1, low / 300) },
    ],
    'Keep low ground for parks; build seawalls.',
  );
  push(
    'algal-bloom',
    base('algal-bloom') * 0.5,
    [
      {
        label: `Coastal pollution ${Math.round(city.pulse.coastalPollution * 100)}%`,
        mul: 0.6 + city.pulse.coastalPollution * 2,
      },
    ],
    'Move or pair factories away from the coast.',
  );
  return out.sort((a, b) => b.score - a.score);
}
