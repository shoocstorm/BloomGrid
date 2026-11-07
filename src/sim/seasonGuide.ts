import { unavailable } from './buildGate';
import { buildings } from '@/content';
import type { City } from './City';
import { DAY_LENGTH, PULSE_TICKS } from './pulseConst';
import { SEASONS, SEASON_SECONDS, SEASON_TICKS, seasonAt, showerAt, type Season } from './seasons';
import { allCrises } from './crises';
import { bestFor, type GuideLever, type GuidePart } from './statGuide';
import type { ProposalFocus } from './proposals';

/**
 * The season chip's guide (D-119): the same shape of help the top-bar indicators give (D-092), for the weather. What
 * the season does to bloom, food, water and the soil, which crises it makes likelier, the weather right now (a
 * shower, a forecast or an active crisis), what comes next, and ranked one-click levers to prepare. Pure: levers are
 * the stat guides' data (`GuideLever`), so the HUD runs them through the same commands and services.
 */

export interface SeasonRisk {
  id: string;
  name: string;
  icon: string;
  /** The season's multiplier on its likelihood (1 = as any other time of year). */
  mul: number;
  text: string;
  tone: GuidePart['tone'];
}

export interface SeasonGuide {
  id: Season['id'];
  title: string;
  icon: string;
  /** "Day 1 of 2". */
  value: string;
  /** "38% through · 7 min left". */
  sub: string;
  /** 0..1 through the season. */
  progress: number;
  /** The outlook as a tier for the chip's colour: 0 fair, 1 showers, 2 warning, 3 crisis now. */
  outlook: 0 | 1 | 2 | 3;
  outlookName: string;
  /** The weather right now, in a sentence. */
  status: string;
  meaning: string;
  /** The season's effects against the rest of the year. */
  effects: GuidePart[];
  /** Crises the season makes likelier or rarer, likeliest first. */
  risks: SeasonRisk[];
  next: { id: Season['id']; name: string; icon: string; description: string; seconds: number; prep: string };
  tips: string[];
  levers: GuideLever[];
  /** Flora's planner focus for "suggested builds". */
  focus: ProposalFocus | null;
}

/** What each season asks of the steward, in a line: shown for the season ahead. */
const PREP: Record<Season['id'], string> = {
  bloom: 'Calm weeks: a good time to build, retrofit and plant while heatwaves are rare.',
  monsoon: 'Floods, king tides and tornadoes ahead: check the Flood lens, guard the low coast and keep a radar working.',
  harvest: 'Food output rises but blight spreads: keep districts green and watered, and farms spread out.',
  haze: 'Dry, hot weeks ahead: build spare water and power, and keep the soil misted.',
};

const FOCUS: Record<Season['id'], ProposalFocus> = { bloom: 'ecology', monsoon: 'safety', harvest: 'food', haze: 'water' };

const pctOff = (mul: number) => (Math.abs(mul - 1) < 0.005 ? 'normal' : `${mul > 1 ? '+' : '−'}${Math.round(Math.abs(mul - 1) * 100)}%`);
const mins = (s: number) => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(0, Math.round(s))} s`);
const sorted = (levers: (GuideLever | null | false | undefined)[]) => levers.filter((l): l is GuideLever => !!l).sort((a, b) => b.weight - a.weight);

/** A named, unlocked building type as a "place" lever (null when it is locked or missing). */
function place(city: City, id: string, why: string, weight: number): GuideLever | null {
  if (!buildings.has(id) || unavailable(city, id)) return null;
  const d = buildings.get(id);
  return { label: `Build ${d.name}`, detail: `◈${Math.round(d.stats.cost).toLocaleString('en-US')} · ${why}`, action: { kind: 'place', def: id }, weight };
}

/** The cheapest unlocked source of `key` (water, energy, food) as a lever. */
function spare(city: City, key: 'water' | 'energy' | 'food', why: string, weight: number): GuideLever | null {
  const d = bestFor(city, key);
  return d ? place(city, d.id, why, weight) : null;
}

const has = (city: City, test: (def: ReturnType<City['buildingDef']>) => unknown) => city.buildingEntities().some((e) => test(city.buildingDef(e)));

/** The levers a season calls for, scaled by `k` (1 for the season now, less for the one ahead). */
function seasonLevers(city: City, id: Season['id'], k: number): (GuideLever | null)[] {
  const p = city.pulse;
  switch (id) {
    case 'monsoon':
      return [
        { label: 'Show the Flood lens', detail: 'which low ground and buildings the water reaches', action: { kind: 'lens', id: 'flood' }, weight: 2 * k },
        place(city, 'mangrove-seawall', 'holds flood water back from the coast around it', 1.6 * k),
        !has(city, (d) => d.radar) ? place(city, 'weather-radar', 'doubles the warning before storms, floods and waves', 1.4 * k) : null,
        !has(city, (d) => d.shelter) ? place(city, 'storm-shelter', 'shelters residents when a tornado touches down', 1.1 * k) : null,
      ];
    case 'haze':
      return [
        p.waterRatio < 1.25 ? spare(city, 'water', `water is at ${Math.round(p.waterRatio * 100)}%: heatwaves raise demand ~30%`, (p.waterRatio < 1.05 ? 3 : 2.2) * k) : null,
        p.energyRatio < 1.25 ? spare(city, 'energy', `power is at ${Math.round(p.energyRatio * 100)}%: cooling raises demand ~35%`, (p.energyRatio < 1.05 ? 2.8 : 2) * k) : null,
        { label: 'Show the Soil water lens', detail: 'the soil dries 70% faster: find where plants will wilt', action: { kind: 'lens', id: 'hydration' }, weight: 1.5 * k },
        place(city, 'flora-hive', 'its drones mist the soil within reach', 1.2 * k),
      ];
    case 'harvest':
      return [
        p.foodRatio < 1.1 ? spare(city, 'food', 'harvest lifts food output 25%: farms pay off most now', 1.8 * k) : null,
        { label: 'Show the Ecology lens', detail: 'blight spreads 80% likelier: rich, green districts resist it', action: { kind: 'lens', id: 'ecology' }, weight: 1.4 * k },
        place(city, 'flora-hive', 'drones pollinate and tend greenery within reach', 1 * k),
      ];
    case 'bloom':
      return [
        { label: 'Show the Bloom lens', detail: 'where the bloom runs high, and where it could', action: { kind: 'lens', id: 'bloom' }, weight: 1.3 * k },
        { label: 'Plant parks and gardens', detail: 'bloom runs 15% higher: green spaces pay back in harmony', action: { kind: 'category', category: 'nature' }, weight: 1 * k },
      ];
  }
}

export function seasonGuide(city: City): SeasonGuide {
  const { season, index, progress } = seasonAt(city.tick);
  const next = SEASONS[(index + 1) % SEASONS.length]!;
  const left = ((1 - progress) * SEASON_TICKS) / PULSE_TICKS;
  const days = Math.round(SEASON_SECONDS / DAY_LENGTH);
  const day = Math.min(days, Math.floor(progress * days) + 1);

  const crises = new Map(allCrises().map((d) => [d.id, d]));
  const threat = city.steward.crises[0];
  const td = threat ? crises.get(threat.def) : undefined;
  const secs = threat ? Math.max(0, ((threat.phase === 'forecast' ? threat.startTick : threat.endTick) - city.tick) / PULSE_TICKS) : 0;
  const shower = showerAt(city.tick);

  let outlook: SeasonGuide['outlook'] = 0;
  let outlookName = 'Fair';
  let status = `Fair weather. ${season.description}`;
  if (threat && td) {
    outlook = threat.phase === 'active' ? 3 : 2;
    outlookName = threat.phase === 'active' ? 'Crisis' : 'Warning';
    status = threat.phase === 'active' ? `${td.name} under way: ${mins(secs)} left. ${td.description}` : `${td.name} forecast in ${mins(secs)}. Prepare: ${td.prep}`;
  } else if (shower > 0.05) {
    outlook = 1;
    outlookName = 'Showers';
    status = `Passing showers (${Math.round(shower * 100)}%): the soil drinks and reservoirs fill. ${season.description}`;
  } else if (season.id === 'haze') {
    outlookName = 'Dry';
    status = `Dry and hot: the soil loses water fast. ${season.description}`;
  }

  const effects: GuidePart[] = [
    { label: 'Bloom', value: season.bloom - 1, text: pctOff(season.bloom), tone: tone(season.bloom - 1), note: 'flowers, pollen and the bloom index' },
    { label: 'Food output', value: season.foodMul - 1, text: pctOff(season.foodMul), tone: tone(season.foodMul - 1), note: 'farms, orchards and fishing' },
    { label: 'Water output', value: season.waterMul - 1, text: pctOff(season.waterMul), tone: tone(season.waterMul - 1), note: 'reservoirs and reclamation' },
    { label: 'Soil drying', value: 1 - season.evaporation, text: pctOff(season.evaporation), tone: tone(1 - season.evaporation), note: 'how fast Flora-Net soil loses water' },
  ];

  const risks: SeasonRisk[] = Object.entries(season.crisis)
    .flatMap(([id, mul]) => {
      const d = crises.get(id);
      if (!d || mul === undefined) return [];
      const text = mul >= 1 ? `×${+mul.toFixed(1)} likelier` : `${Math.round((1 - mul) * 100)}% rarer`;
      return [{ id, name: d.name, icon: d.icon, mul, text, tone: (mul >= 2 ? 'bad' : mul > 1 ? 'warn' : 'good') as GuidePart['tone'] }];
    })
    .sort((a, b) => b.mul - a.mul);

  // A crisis on the way or under way comes first: see what it reaches.
  const flood = threat && ['monsoon', 'king-tide', 'tsunami'].includes(threat.def);
  const levers = dedupe(
    sorted([
      threat && { label: flood ? 'Show the Flood lens' : 'Show the Risk lens', detail: `see what the ${td?.name.toLowerCase() ?? 'crisis'} can reach`, action: { kind: 'lens', id: flood ? 'flood' : 'risk' }, weight: 5 },
      ...seasonLevers(city, season.id, 1),
      // Late in the season, the next one's preparation joins in.
      ...(progress > 0.6 ? seasonLevers(city, next.id, 0.9).map((l) => l && { ...l, detail: `${next.name} ahead: ${l.detail}` }) : []),
      { label: 'Incident log', detail: 'past crises, what they cost and what was spared', action: { kind: 'incidents' }, weight: 0.2 },
    ]),
  );

  return {
    id: season.id,
    title: `${season.name} season`,
    icon: season.icon,
    value: `Day ${day} of ${days}`,
    sub: `${Math.round(progress * 100)}% through · ${mins(left)} left`,
    progress,
    outlook,
    outlookName,
    status,
    meaning: `The island's year turns through four engineered seasons (Bloom, Monsoon, Harvest, Haze), each two sim days (${mins(SEASON_SECONDS)} at 1×). A season scales bloom, food and water output and how fast the soil dries, and tilts which crises are likely.`,
    effects,
    risks,
    next: { id: next.id, name: next.name, icon: next.icon, description: next.description, seconds: left, prep: PREP[next.id] },
    tips: [
      PREP[season.id],
      'A working Weather Radar doubles the warning before storms, floods, tornadoes and tsunamis.',
      'Crises come one at a time with a calm gap between; the season only changes which one is likely.',
    ],
    levers,
    focus: FOCUS[season.id],
  };
}

function tone(v: number): GuidePart['tone'] {
  return v > 0.005 ? 'good' : v < -0.005 ? 'bad' : 'neutral';
}

/** The same lever offered for this season and the next keeps its stronger, earlier copy. */
function dedupe(levers: GuideLever[]): GuideLever[] {
  const seen = new Set<string>();
  return levers.filter((l) => !seen.has(l.label) && !!seen.add(l.label));
}
