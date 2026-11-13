import { unavailable } from './buildGate';
import { buildings } from '@/content';
import type { BuildingCategory, BuildingDef, BuildingStats } from '@/content/types';
import type { City } from './City';
import { LABOUR_SHARE } from './pulseConst';
import { TAX_MAX, TAX_MIN, TIERS, tierFromRatio, type HistoryMetric, type Tier } from './pulseState';
import { creditLimit, LOAN_SIZES, netIncome, totalDebt } from './finance';
import type { ProposalFocus } from './proposals';
import { INDICATOR_NAMES as N } from './indicators';
import { forecastFor, type Forecast, type ForecastMetric } from './forecast';

/**
 * Stat guides (D-092): what each top-bar indicator means, what moves it right now and the steward's best levers,
 * worked out from the same numbers the pulse uses. The HUD shows a guide as a hover card (status, one gauge, the
 * best move) and, on click, as a panel with the breakdown, the trend and one-click actions. Pure: the levers are
 * data (build a category, place a type, show a lens, change the tax…) the UI turns into commands and services.
 */

export const STAT_IDS = ['credits', 'pop', 'energy', 'water', 'food', 'eco', 'happy'] as const;
export type StatId = (typeof STAT_IDS)[number];

/** One contribution to the indicator: signed for sums (credits/s, harmony points), 0..1 for limiting factors. */
export interface GuidePart {
  label: string;
  value: number;
  /** How it reads: "+12.0/s", "−8 pts", "64%". */
  text: string;
  tone: 'good' | 'bad' | 'warn' | 'neutral';
  note?: string;
}

/** A gauge: where the value sits between `min` and `max`, with the healthy point marked. */
export interface GuideGauge {
  value: number;
  min: number;
  max: number;
  /** The "enough" line (100% of demand, full homes…). */
  mark: number;
  label: string;
  text: string;
}

export type LeverAction =
  | { kind: 'category'; category: BuildingCategory }
  | { kind: 'place'; def: string }
  | { kind: 'lens'; id: string }
  | { kind: 'tax'; rate: number }
  | { kind: 'loan'; amount: number }
  | { kind: 'causes' }
  | { kind: 'incidents' };

export interface GuideLever {
  label: string;
  /** What it does and what it costs, in a line. */
  detail: string;
  action: LeverAction;
  /** How much it would help now; levers are sorted by it and the first is the hover card's "best move". */
  weight: number;
}

export interface StatGuide {
  id: StatId;
  title: string;
  icon: string;
  value: string;
  sub: string;
  tier: Tier;
  tierName: string;
  /** The current situation, in a sentence. */
  status: string;
  /** What the indicator measures. */
  meaning: string;
  gauge: GuideGauge | null;
  partsTitle: string;
  /** 'sum': signed contributions; 'factors': 0..1 limits (100% = not holding it back). */
  partsKind: 'sum' | 'factors';
  parts: GuidePart[];
  history: HistoryMetric;
  /** Short facts worth knowing, most relevant first. */
  tips: string[];
  levers: GuideLever[];
  /** Flora's planner focus for "suggested builds" (null: none fits). */
  focus: ProposalFocus | null;
  /** Where it is heading (plan v5, `sim/forecast.ts`); null for indicators without a forecast. */
  forecast: Forecast | null;
}

/** A guide before its forecast is attached (`statGuide`). */
type Base = Omit<StatGuide, 'forecast'>;

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number, d = 1, unit = '') => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}${unit}`;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const tone = (v: number): GuidePart['tone'] => (v > 0.05 ? 'good' : v < -0.05 ? 'bad' : 'neutral');
const factorTone = (v: number): GuidePart['tone'] => (v >= 0.95 ? 'good' : v >= 0.7 ? 'warn' : 'bad');

/** Credit flow per second (`sim/finance.ts`), re-exported for the guides' callers. */
export { netIncome };

/** The unlocked, placeable type with the most of `key` per credit (ties: the bigger one). */
export function bestFor(city: City, key: keyof BuildingStats, category?: BuildingCategory): BuildingDef | null {
  let best: BuildingDef | null = null;
  let score = 0;
  for (const d of buildings.all()) {
    if (d.landmark || (category && d.category !== category) || unavailable(city, d.id)) continue;
    const v = d.stats[key];
    if (v <= 0) continue;
    const sc = v / Math.max(1, d.stats.cost);
    if (sc > score * 1.0001 || (best && Math.abs(sc - score) < score * 1e-4 && v > best.stats[key])) {
      best = d;
      score = sc;
    }
  }
  return best;
}

const place = (city: City, key: keyof BuildingStats, unit: string, why: string, weight: number, category?: BuildingCategory): GuideLever | null => {
  const d = bestFor(city, key, category);
  if (!d) return null;
  return {
    label: `Build ${d.name}`,
    detail: `+${fmt(d.stats[key])} ${unit} for ◈${fmt(d.stats.cost)} · ${why}`,
    action: { kind: 'place', def: d.id },
    weight,
  };
};

const sorted = (levers: (GuideLever | null | false | undefined)[]) =>
  levers.filter((l): l is GuideLever => !!l).sort((a, b) => b.weight - a.weight);

function credits(city: City): Base {
  const s = city.stats;
  const p = city.pulse;
  const net = netIncome(city);
  const debt = totalDebt(city);
  const tier = p.tiers.budget;
  const runway = net < 0 && city.credits > 0 ? city.credits / -net : Infinity;
  const status =
    city.credits < 0
      ? `In debt: austerity pays only 40% of upkeep, so buildings and highways decay.`
      : net < 0
        ? `Losing ◈${Math.abs(net).toFixed(1)}/s: about ${fmt(runway / 60)} min until credits run out.`
        : `Earning ◈${net.toFixed(1)}/s after upkeep${debt > 0 ? ' and loan repayments' : ''}.`;
  const taxHarm = 1.5; // harmony points per tax percent (pulse: −(rate − 0.1) × 150)
  const limit = creditLimit(city);
  const loan = [...LOAN_SIZES].reverse().find((a) => a <= limit);
  const short = city.credits < 0 || net < 0;
  // Borrowing only answers debt or a treasury that empties within ten sim minutes.
  const urgent = city.credits < 0 || runway < 600;
  return {
    id: 'credits',
    title: N.credits,
    icon: 'credits',
    value: `◈${fmt(city.credits)}`,
    sub: `${signed(net)}/s`,
    tier,
    tierName: TIERS[tier],
    status,
    meaning: 'The credits the city holds. Taxes, fishing and visitors pay in every second; building upkeep, insurance and loan repayments pay out. Building costs come out of it up front.',
    gauge: null,
    partsTitle: 'Cash flow per second',
    partsKind: 'sum',
    parts: [
      { label: 'Taxes', value: s.income, text: signed(s.income), tone: 'good', note: `${Math.round(p.taxRate * 100)}% rate on residents and workers` },
      { label: 'Fishing', value: s.fishing, text: signed(s.fishing), tone: 'good' },
      { label: 'Visitors', value: s.tourism, text: signed(s.tourism), tone: 'good' },
      { label: 'Fireworks', value: s.fireworks, text: signed(s.fireworks), tone: tone(s.fireworks), note: 'shells and crews against show visitors' },
      { label: 'Upkeep', value: -s.upkeep, text: signed(-s.upkeep), tone: 'bad', note: city.steward.funding < 1 ? 'austerity: 40% paid' : `${fmt(s.buildings)} buildings` },
      { label: 'Insurance', value: -s.insurance, text: signed(-s.insurance), tone: 'bad' },
      { label: 'Loans', value: -s.debtService, text: signed(-s.debtService), tone: 'bad', note: debt > 0 ? `◈${fmt(debt)} still owed` : undefined },
    ].filter((x) => Math.abs(x.value) >= 0.05 || x.label === 'Taxes' || x.label === 'Upkeep') as GuidePart[],
    history: 'credits',
    tips: [
      short ? 'Taxes come from residents and workers: full homes and staffed jobs pay more than new buildings.' : 'A healthy margin is about a quarter of upkeep; spend the rest on growth.',
      `Each tax point costs about ${taxHarm} harmony; the rate runs ${Math.round(TAX_MIN * 100)}–${Math.round(TAX_MAX * 100)}%.`,
      'Old buildings cost more upkeep: renovate or replace tired ones (inventory filter is:old).',
    ],
    levers: sorted([
      p.taxRate < TAX_MAX && { label: 'Raise taxes 1%', detail: `≈${signed(s.income / Math.max(0.01, p.taxRate) * 0.01)}/s, about −${taxHarm} harmony`, action: { kind: 'tax', rate: p.taxRate + 0.01 }, weight: short ? 3 : 0.5 },
      p.taxRate > TAX_MIN && !short && { label: 'Lower taxes 1%', detail: `≈${signed(-s.income / Math.max(0.01, p.taxRate) * 0.01)}/s, about +${taxHarm} harmony`, action: { kind: 'tax', rate: p.taxRate - 0.01 }, weight: p.tiers.harmony >= 2 ? 2 : 0.4 },
      loan && urgent && { label: `Borrow ◈${fmt(loan)}`, detail: `repaid over 10 sim minutes with interest; ◈${fmt(limit)} available`, action: { kind: 'loan', amount: loan }, weight: city.credits < 0 ? 4 : 1 },
      s.demandHomes > 0.2 && { label: 'Build homes', detail: 'more residents, more taxpayers (jobs are waiting)', action: { kind: 'category', category: 'residential' }, weight: 1.5 },
      { label: 'Cause & effect', detail: 'credit rating, insurance and what drives them', action: { kind: 'causes' }, weight: 0.2 },
    ]),
    focus: null,
  };
}

function residents(city: City): Base {
  const s = city.stats;
  const p = city.pulse;
  const occ = s.capacity > 0 ? s.population / s.capacity : 0;
  const workers = s.population * LABOUR_SHARE;
  // The move-in factors of the pulse's occupancy target (sim/pulse.ts).
  const utilities = Math.min(1, p.energyRatio, p.waterRatio);
  const jobs = workers > s.jobs ? 0.6 + 0.4 * (s.jobs / Math.max(1, workers)) : 1;
  const harmony = clamp((s.happiness / 100) * 1.4, 0.2, 1);
  const food = clamp(p.foodRatio, 0.5, 1);
  const factors: GuidePart[] = [
    { label: 'Power & water', value: utilities, text: pct(utilities), tone: factorTone(utilities), note: 'homes empty in brownouts and dry taps' },
    { label: 'Jobs nearby', value: jobs, text: pct(jobs), tone: factorTone(jobs), note: `${fmt(s.jobs)} jobs for ${fmt(workers)} workers` },
    { label: 'Harmony', value: harmony, text: pct(harmony), tone: factorTone(harmony), note: 'below 72 harmony, fewer move in' },
    { label: 'Food', value: food, text: pct(food), tone: factorTone(food), note: `${pct(p.foodRatio)} of residents fed` },
  ];
  const worst = [...factors].sort((a, b) => a.value - b.value)[0]!;
  const tier = tierFromRatio(occ, [0.4, 0.6, 0.8, 0.92]);
  const status =
    s.capacity === 0
      ? 'No homes yet: build a residence beside a highway.'
      : worst.value < 0.95
        ? `${pct(occ)} of homes filled. ${worst.label} is holding people back (${worst.text}).`
        : s.demandHomes > 0.3
          ? `${pct(occ)} of homes filled and people want more: build homes.`
          : `${pct(occ)} of homes filled.`;
  return {
    id: 'pop',
    title: N.residents,
    icon: 'people',
    value: fmt(s.population),
    sub: `of ${fmt(s.capacity)} homes`,
    tier,
    tierName: TIERS[tier],
    status,
    meaning: 'People living on the island, out of the homes built. Homes fill when they have power and water, jobs, food and a happy, desirable neighbourhood, and empty when those fail.',
    gauge: { value: occ, min: 0, max: 1, mark: 1, label: 'Homes filled', text: pct(occ) },
    partsTitle: 'What decides who moves in',
    partsKind: 'factors',
    parts: factors,
    history: 'population',
    tips: [
      'Homes on desirable land (green, clean, by the coast) fill faster: check the Desirability lens.',
      `About ${Math.round(LABOUR_SHARE * 100)}% of residents work: homes and jobs grow together.`,
      'Residents arrive faster than they leave, so a crisis gives you a minute or two to act.',
    ],
    levers: sorted([
      s.demandHomes > 0 && place(city, 'population', 'homes', 'people want to move in', 2 + s.demandHomes, 'residential'),
      worst === factors[1] && jobs < 0.95 && place(city, 'jobs', 'jobs', 'too few jobs for the workers', 4 - jobs * 3),
      worst === factors[0] && utilities < 0.95 && { label: 'Fix power & water', detail: 'see which networks are short', action: { kind: 'lens', id: p.energyRatio <= p.waterRatio ? 'power' : 'water' }, weight: 4 - utilities * 3 },
      worst === factors[3] && food < 0.95 && place(city, 'food', 'fed', 'hungry residents leave', 4 - food * 3),
      worst === factors[2] && harmony < 0.95 && { label: 'Lift harmony', detail: 'what makes residents unhappy', action: { kind: 'causes' }, weight: 2 },
      { label: 'Desirability lens', detail: 'where people want to live', action: { kind: 'lens', id: 'desirability' }, weight: 0.3 },
      { label: 'All living buildings', detail: 'browse homes in build mode', action: { kind: 'category', category: 'residential' }, weight: 0.2 },
    ]),
    focus: 'homes',
  };
}

function utility(city: City, kind: 'energy' | 'water'): Base {
  const s = city.stats;
  const p = city.pulse;
  const energy = kind === 'energy';
  const made = energy ? s.energyProduced : s.waterProduced;
  const used = energy ? s.energyUsed : s.waterUsed;
  const ratio = energy ? p.energyRatio : p.waterRatio;
  const tier = p.tiers[kind];
  const nets = p.networks.filter((n) => n.buildings > 0);
  const short = nets.filter((n) => (energy ? n.energyUsed > n.energyProduced * 1.001 : n.waterUsed > n.waterProduced * 1.001));
  const margin = made - used;
  const status =
    used === 0
      ? `Nothing needs ${kind} yet.`
      : margin < 0
        ? `Short by ${fmt(-margin)}: supply covers ${pct(ratio)} of demand.`
        : short.length
          ? `${fmt(margin)} spare overall, but ${short.length} of ${nets.length} highway networks run short.`
          : ratio < 1.15
            ? `Covers demand with a thin ${pct(ratio - 1)} margin.`
            : `Comfortable: ${pct(ratio)} of demand.`;
  const parts: GuidePart[] = [
    { label: 'Produced', value: made, text: fmt(made), tone: 'good', note: energy ? `${pct(p.cleanShare)} clean` : undefined },
    { label: 'Used', value: -used, text: fmt(used), tone: 'bad' },
  ];
  if (nets.length > 1) parts.push({ label: 'Networks short', value: 0, text: `${short.length} / ${nets.length}`, tone: short.length ? 'bad' : 'good', note: 'each highway network is its own grid' });
  const lens = energy ? 'power' : 'water';
  const need = margin < 0 || short.length > 0 || ratio < 1.1;
  return {
    id: kind,
    title: energy ? N.energy : N.water,
    icon: kind,
    value: `${margin >= 0 ? '+' : '−'}${fmt(Math.abs(margin))}`,
    sub: `${fmt(made)} made · ${fmt(used)} used`,
    tier,
    tierName: TIERS[tier],
    status,
    meaning: energy
      ? 'Power produced minus power used. Highways carry the grid: buildings only share power within one connected highway network. Brownouts dim homes, stall work and stop water pumps.'
      : 'Water supplied minus water drawn. Pipes run beneath the highways, so each connected network shares its own water. Dry taps make residents leave and gardens wither.',
    gauge: used > 0 ? { value: Math.min(ratio, 2), min: 0, max: 2, mark: 1, label: 'Supply ÷ demand', text: pct(ratio) } : null,
    partsTitle: 'Supply and demand',
    partsKind: 'sum',
    parts,
    history: energy ? 'energyBalance' : 'waterBalance',
    tips: [
      short.length && margin >= 0
        ? `Join a short network to one with spare ${kind} by a highway, or build on the short one (the ${energy ? 'Power' : 'Water'} lens shows which).`
        : `Keep 10–15% spare: demand rises as homes fill${energy ? ' and at night' : ''}.`,
      energy
        ? 'Clean generation (sun, wind, algae) keeps pollution and ecology healthy; geothermal is steady day and night.'
        : 'Water works need a coastal or riverside lot next to a highway; channels irrigate gardens even in droughts.',
      energy ? 'Some buildings can be switched off from the inspector to save power.' : 'Heatwaves and the Haze raise demand: plan for the dry season.',
    ].filter((t): t is string => !!t),
    levers: sorted([
      place(city, kind, kind, need ? 'covers the shortfall' : 'room to grow', need ? 4 - Math.min(1, ratio) : 1, energy ? 'energy' : 'utility'),
      { label: `${energy ? 'Power' : 'Water'} lens`, detail: 'see which buildings and networks are short', action: { kind: 'lens', id: lens }, weight: short.length ? 3 : 0.4 },
      { label: `All ${energy ? 'energy' : 'water'} buildings`, detail: 'compare output and cost in build mode', action: { kind: 'category', category: energy ? 'energy' : 'utility' }, weight: 0.3 },
    ]),
    focus: kind,
  };
}

function food(city: City): Base {
  const s = city.stats;
  const p = city.pulse;
  const made = s.foodProduced;
  const need = s.population;
  const ratio = p.foodRatio;
  const tier = p.tiers.food;
  const margin = made - need;
  const status =
    need < 1
      ? 'No residents to feed yet.'
      : ratio < 0.95
        ? `Short: farms and fisheries feed ${pct(ratio)} of residents. Hunger costs up to 20 harmony.`
        : ratio < 1.15
          ? `Everyone is fed, with a thin ${pct(ratio - 1)} to spare.`
          : `Plenty: ${pct(ratio)} of what residents eat.`;
  const short = need >= 1 && ratio < 1.1;
  return {
    id: 'food',
    title: N.food,
    icon: 'food',
    value: need < 1 ? '—' : pct(ratio),
    sub: `${fmt(made)} grown · ${fmt(need)} eaten`,
    tier,
    tierName: TIERS[tier],
    status,
    meaning:
      'Food grown and caught against what residents eat (one share each). Farms, gardens and fishing docks only produce with workers and power, so a staffing or energy shortage shows up here too. Hungry residents lower harmony and growth.',
    gauge: need >= 1 ? { value: Math.min(ratio, 1.5), min: 0, max: 1.5, mark: 1, label: 'Grown ÷ eaten', text: pct(ratio) } : null,
    partsTitle: 'Grown and eaten',
    partsKind: 'sum',
    parts: [
      { label: 'Grown and caught', value: made, text: fmt(made), tone: 'good' },
      { label: 'Eaten', value: -need, text: fmt(need), tone: 'bad', note: 'one share per resident' },
      { label: margin >= 0 ? 'Spare' : 'Short', value: margin, text: `${margin >= 0 ? '+' : '−'}${fmt(Math.abs(margin))}`, tone: margin >= 0 ? 'good' : 'bad' },
    ],
    history: 'food',
    tips: [
      short ? 'Keep 10–15% spare: every new home adds mouths before its farm is staffed.' : 'Food output follows workers: a jobs shortage starves the farms first.',
      'Fishing docks feed the city from the sea; rice terraces and hanging gardens grow on land and add greenery.',
      'Harvest season grows 25% more and the Haze a little less; healthy soil and bloom raise every farm, blight cuts them.',
    ],
    levers: sorted([
      place(city, 'food', 'food', short ? 'covers the shortfall' : 'room to grow', short ? 4 - Math.min(1, ratio) : 0.8, 'food'),
      { label: 'All food buildings', detail: 'compare output and cost in build mode', action: { kind: 'category', category: 'food' }, weight: 0.3 },
    ]),
    focus: 'food',
  };
}

function ecology(city: City): Base {
  const s = city.stats;
  const p = city.pulse;
  const per = Math.max(1, s.buildings);
  const green = s.eco + s.pollution;
  const tier = p.tiers.ecology;
  const avg = s.eco / per;
  const status =
    s.eco < 0
      ? `Pollution (${fmt(s.pollution)}) outweighs greenery (${fmt(green)}): harmony and the coast suffer.`
      : avg < 1
        ? `Barely positive: ${avg.toFixed(1)} per building (aim for 1+, thriving at 4+).`
        : `Healthy: ${avg.toFixed(1)} per building, bloom ${pct(p.bloomIndex)}.`;
  return {
    id: 'eco',
    title: N.ecology,
    icon: 'eco',
    value: fmt(s.eco),
    sub: `${avg.toFixed(1)} per building`,
    tier,
    tierName: TIERS[tier],
    status,
    meaning: 'The living balance of the island: greenery on parks and buildings, minus pollution from industry, power plants, traffic and fireworks. It feeds harmony (up to +15) and keeps the coast and the bloom alive.',
    gauge: { value: clamp(avg, -6, 6), min: -6, max: 6, mark: 1, label: 'Per building', text: avg.toFixed(1) },
    partsTitle: 'Green against grey',
    partsKind: 'sum',
    parts: [
      { label: 'Greenery', value: green, text: signed(green, 0), tone: 'good', note: `gardens ${pct(p.avgGreenery)} grown` },
      { label: 'Pollution', value: -s.pollution, text: signed(-s.pollution, 0), tone: 'bad' },
      { label: 'Harmony effect', value: p.harmony.ecology, text: signed(p.harmony.ecology, 1, ' pts'), tone: tone(p.harmony.ecology) },
    ],
    history: 'eco',
    tips: [
      'Greenery only counts when watered: dry gardens give 30%, grown ones the full value.',
      'Factories paired with their symbiosis partner pollute far less; Bloom Retrofits add 50% eco.',
      'Keep industry away from homes and the shore: the Pollution lens shows where it spreads.',
    ],
    levers: sorted([
      place(city, 'eco', 'eco', s.eco < 0 ? 'offsets pollution' : 'more green', s.eco < 0 ? 4 : avg < 1 ? 3 : 1, 'nature'),
      { label: 'Pollution lens', detail: 'find the hotspots to green or move', action: { kind: 'lens', id: 'pollution' }, weight: s.pollution > green * 0.5 ? 3 : 0.5 },
      { label: 'Ecology lens', detail: 'lush and barren districts', action: { kind: 'lens', id: 'ecology' }, weight: 0.4 },
      { label: 'All nature', detail: 'parks, wild flora and gardens', action: { kind: 'category', category: 'nature' }, weight: 0.3 },
    ]),
    focus: 'ecology',
  };
}

const weaker = (c: City): 'energy' | 'water' => (c.pulse.energyRatio <= c.pulse.waterRatio ? 'energy' : 'water');

/** Harmony factors: label, value, and the lever that lifts it when it drags. */
const HARMONY: { key: keyof City['pulse']['harmony']; label: string; fix: (city: City, v: number) => GuideLever | null }[] = [
  { key: 'base', label: 'Baseline', fix: () => null },
  { key: 'services', label: 'Power & water', fix: (c, v) => (weaker(c) === 'energy' ? place(c, 'energy', 'energy', 'brownouts upset residents', -v, 'energy') : place(c, 'water', 'water', 'dry taps upset residents', -v, 'utility')) },
  { key: 'jobs', label: 'Jobs', fix: (c, v) => place(c, 'jobs', 'jobs', 'unemployment hurts', -v) },
  { key: 'food', label: 'Food', fix: (c, v) => place(c, 'food', 'fed', 'hungry residents', -v) },
  { key: 'taxes', label: 'Taxes', fix: (c, v) => (c.pulse.taxRate > TAX_MIN ? { label: 'Lower taxes 1%', detail: `+1.5 harmony, ≈${signed(-c.stats.income / Math.max(0.01, c.pulse.taxRate) * 0.01)}/s`, action: { kind: 'tax', rate: c.pulse.taxRate - 0.01 }, weight: -v } : null) },
  { key: 'ecology', label: 'Ecology', fix: (c, v) => place(c, 'eco', 'eco', 'greener streets', -v, 'nature') },
  { key: 'amenities', label: 'Amenities', fix: (c, v) => place(c, 'happiness', 'delight', 'parks, sport and culture', -v + 1) },
  { key: 'bloom', label: 'Bloom', fix: (_c, v) => ({ label: 'Bloom lens', detail: 'pollinated, flowering districts', action: { kind: 'lens', id: 'bloom' }, weight: -v }) },
  { key: 'traffic', label: 'Traffic', fix: (_c, v) => ({ label: 'Traffic lens', detail: 'find jams; add pod docks or a highway', action: { kind: 'lens', id: 'traffic' }, weight: -v }) },
  { key: 'crises', label: 'Crises', fix: (_c, v) => ({ label: 'Incidents', detail: 'active crises, fires and ruins', action: { kind: 'incidents' }, weight: -v }) },
  { key: 'fireworks', label: 'Fireworks', fix: () => null },
  { key: 'wonders', label: 'Wonders', fix: () => null },
  { key: 'consequences', label: 'Consequences', fix: (_c, v) => ({ label: 'Cause & effect', detail: 'rules in force and how to lift them', action: { kind: 'causes' }, weight: -v }) },
];

function harmony(city: City): Base {
  const s = city.stats;
  const p = city.pulse;
  const h = p.harmony;
  const target = clamp(HARMONY.reduce((a, f) => a + h[f.key], 0), 0, 100);
  const tier = p.tiers.harmony;
  const parts: GuidePart[] = HARMONY.filter((f) => f.key === 'base' || Math.abs(h[f.key]) >= 0.1).map((f) => ({
    label: f.label,
    value: h[f.key],
    text: signed(h[f.key], 1),
    tone: f.key === 'base' ? 'neutral' : tone(h[f.key]),
  }));
  const drags = HARMONY.filter((f) => f.key !== 'base' && h[f.key] < -0.5).sort((a, b) => h[a.key] - h[b.key]);
  const trend = target - s.happiness;
  const status =
    drags.length
      ? `${Math.round(s.happiness)}, ${Math.abs(trend) < 1 ? 'steady' : trend > 0 ? `rising toward ${Math.round(target)}` : `falling toward ${Math.round(target)}`}. Biggest drag: ${drags[0]!.label.toLowerCase()} (${signed(h[drags[0]!.key])}).`
      : `${Math.round(s.happiness)}, ${trend > 1 ? `rising toward ${Math.round(target)}` : 'steady'}. Nothing is dragging it down.`;
  const levers = drags.map((f) => f.fix(city, h[f.key]));
  if (h.services < -0.5) levers.push({ label: `${weaker(city) === 'energy' ? 'Power' : 'Water'} lens`, detail: 'see which networks are short', action: { kind: 'lens', id: weaker(city) === 'energy' ? 'power' : 'water' }, weight: -h.services / 2 });
  if (h.amenities < 8 && !drags.some((f) => f.key === 'amenities')) levers.push(HARMONY.find((f) => f.key === 'amenities')!.fix(city, h.amenities - 8));
  const focusOf: Partial<Record<string, ProposalFocus>> = { services: weaker(city), jobs: 'jobs', food: 'food', ecology: 'ecology', traffic: 'traffic', bloom: 'ecology' };
  return {
    id: 'happy',
    title: N.harmony,
    icon: 'happy',
    value: `${Math.round(s.happiness)}`,
    sub: '/ 100',
    tier,
    tierName: TIERS[tier],
    status,
    meaning: 'How content residents are, 0–100. It starts from 55 and moves with utilities, jobs, food, taxes, ecology, amenities, bloom, traffic and crises. It drifts toward its target, so changes show over a few seconds. Low harmony empties homes.',
    gauge: { value: s.happiness, min: 0, max: 100, mark: 55, label: `Target ${Math.round(target)}`, text: `${Math.round(s.happiness)}` },
    partsTitle: 'What adds and takes away',
    partsKind: 'sum',
    parts,
    history: 'happiness',
    tips: [
      'Above 75 is Thriving; below 40 residents start to leave.',
      'Amenities only delight when maintained: renovate neglected parks and venues.',
      'Fireworks give a lift and an afterglow, but nightly shows lose their novelty.',
    ],
    levers: sorted(levers),
    focus: drags.map((f) => focusOf[f.key]).find((f) => !!f) ?? null,
  };
}

/** The guide for one top-bar indicator, from the last pulse. */
const FORECAST_OF: Record<StatId, ForecastMetric | null> = { credits: 'budget', pop: 'population', energy: 'energy', water: 'water', food: 'food', eco: null, happy: 'harmony' };

export function statGuide(city: City, id: StatId): StatGuide {
  const g = ((): Base => {
    switch (id) {
      case 'credits':
        return credits(city);
      case 'pop':
        return residents(city);
      case 'energy':
      case 'water':
        return utility(city, id);
      case 'food':
        return food(city);
      case 'eco':
        return ecology(city);
      case 'happy':
        return harmony(city);
    }
  })();
  const m = FORECAST_OF[id];
  return { ...g, forecast: m ? forecastFor(city, m) : null };
}
