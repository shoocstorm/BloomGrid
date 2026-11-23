import type { CommandStack } from '@/core/Commands';
import { Service } from '@/ecs/components';
import type { City } from './City';
import type { SimCtx } from './systems';
import type { ConsequenceMods } from './consequenceState';
import type {
  Dispatch,
  DispatchKind,
  Good,
  NeighbourCrisis,
  NeighbourId,
  NeighbourState,
  TradeAgreement,
  TradeDir,
} from './archipelagoState';
import { DIFFICULTIES } from './difficulty';
import { directing, queueCrisis } from './directorCore';
import { LOAN_TERM } from './finance';
import { size } from './levels';
import { PULSE_TICKS } from './pulseConst';
import { seasonAt } from './seasons';
import { startHappening } from './happenings';

/**
 * The Archipelago (plan v8, Phase 37): four neighbouring islands over the horizon, each with a steward of its own.
 * The city trades with them through standing agreements that ship energy, water or food across the sea for credits
 * (through a harbour interconnect on the main grid, so a shipment really changes supply), answers their envoys
 * (aid after their storms, families looking for a home, a shortage, a loan, a dive, a rival bid) and gets help back
 * when the island is in trouble. Relations rise with fair dealing and fall with slights; friends bring perks (the
 * consequence mods), a hostile neighbour embargoes. Their storms may reach the island through the director's queue.
 *
 * Deterministic: their moods, crises and envoys draw only on `city.rng`, and only while `auto` is on (tests switch it
 * off). Exports ship only surplus above a margin, so trade never causes a shortage at home; imports arrive only while
 * the partner has some to spare.
 */

export interface NeighbourDef {
  id: NeighbourId;
  name: string;
  faction: string;
  /** Who speaks for them (dispatch cards and Flora). */
  envoy: string;
  /** A line about them for the chart. */
  line: string;
  /** Offset from the island's centre in tiles (far out at sea; the horizon render and the chart use it). */
  at: readonly [number, number];
  bearing: string;
  /** What they can spare (imports) and what they want (exports). */
  sells: Good[];
  wants: Good[];
  /** The era (index) a growing island meets them in. */
  era: number;
  /** Where their relation settles when left alone, and how fast slights fade (1 = normal; proud neighbours slower). */
  rest: number;
  forgive: number;
  /** Chance their storm or swell reaches the island (to windward, it is higher). */
  reach: number;
  /** Their director's pace: higher = more happens there. */
  restless: number;
  /** The perk at Allied (half at Friendly), in words. */
  perk: string;
}

export const NEIGHBOURS: readonly NeighbourDef[] = [
  {
    id: 'drift',
    name: 'Brightwater Flotilla',
    faction: 'The Drift',
    envoy: 'Captain Marisol Song',
    line: 'Fairground ships and floating markets lashed together off the south-east shoals. Loud, warm, always singing.',
    at: [330, 300],
    bearing: 'south-east',
    sells: ['food'],
    wants: ['water', 'energy'],
    era: 1,
    rest: 25,
    forgive: 1.6,
    reach: 0.15,
    restless: 1.1,
    perk: 'Drift visitors spend more on the island',
  },
  {
    id: 'concord',
    name: 'Bastion Halden',
    faction: 'The Concord',
    envoy: 'Envoy Castellan',
    line: 'A walled arcology on a granite rock to the north-west: seawalls a hundred metres high, tidal turbines in the sluices.',
    at: [-360, -300],
    bearing: 'north-west',
    sells: ['energy'],
    wants: ['food'],
    era: 2,
    rest: 0,
    forgive: 0.6,
    reach: 0.35,
    restless: 0.8,
    perk: 'Concord loans come cheaper',
  },
  {
    id: 'lantern',
    name: 'Vellum Holm',
    faction: 'The Lantern Orders',
    envoy: 'Archivist Wren Sallow',
    line: 'A grey holm to the north-east stacked with archive towers, lanterns burning in every window all night.',
    at: [360, -330],
    bearing: 'north-east',
    sells: [],
    wants: ['energy'],
    era: 2,
    rest: 5,
    forgive: 1,
    reach: 0.2,
    restless: 1,
    perk: "Flora's requests cost less (the Orders share their indexes)",
  },
  {
    id: 'kestrel',
    name: 'Kestrel Cay',
    faction: 'Free island',
    envoy: 'Steward Hale Brannock',
    line: 'A young free city on a green cay to the south-west, founded by fishers who followed the same light. A friend, and a rival.',
    at: [-330, 340],
    bearing: 'south-west',
    sells: ['water'],
    wants: ['food', 'energy'],
    era: 1,
    rest: 0,
    forgive: 1,
    reach: 0.3,
    restless: 1.2,
    perk: 'Kestrel crews help repair after a crisis (less damage)',
  },
];

export const neighbourDef = (id: NeighbourId): NeighbourDef => NEIGHBOURS.find((n) => n.id === id)!;
export const neighbour = (city: City, id: NeighbourId): NeighbourState =>
  city.archipelago.neighbours.find((n) => n.id === id)!;

/** Relation tiers, lowest first, with the relation each starts at. */
export const TIERS = [
  { id: 'hostile', name: 'Hostile', from: -Infinity },
  { id: 'cool', name: 'Cool', from: -40 },
  { id: 'cordial', name: 'Cordial', from: 0 },
  { id: 'friendly', name: 'Friendly', from: 40 },
  { id: 'allied', name: 'Allied', from: 75 },
] as const;
export type TierId = (typeof TIERS)[number]['id'];
export const tierOf = (relation: number): (typeof TIERS)[number] =>
  [...TIERS].reverse().find((t) => relation >= t.from)!;
/** 0 hostile … 4 allied. */
export const tierIndex = (relation: number): number => TIERS.indexOf(tierOf(relation));

/** Base credits per unit per second (the live price adds the partner's need, prosperity and the relation). */
export const BASE_PRICE: Record<Good, number> = { energy: 0.022, water: 0.03, food: 0.006 };
/** Agreement sizes: shares of the city's own use at signing, with a floor in units. */
export const TRADE_SIZES = [
  { id: 'small', name: 'Small', share: 0.05 },
  { id: 'medium', name: 'Medium', share: 0.1 },
  { id: 'large', name: 'Large', share: 0.2 },
] as const;
const MIN_UNITS: Record<Good, number> = { energy: 10, water: 10, food: 20 };
/** Exports leave this much headroom at home: trade never tips a supply tier into shortage. */
export const EXPORT_MARGIN = 1.05;
/** Agreements in force at once. */
export const MAX_TRADES = 6;
/** Imports cost this much more than the same good sells for. */
const IMPORT_MARKUP = 1.25;
/** Premium shortage requests pay this times the live price, for this many seconds. */
export const PREMIUM = { mul: 1.5, seconds: 300 };
/** Seconds an envoy waits for an answer; seconds a rival bid runs. */
export const DISPATCH_SECONDS = 150;
export const RIVAL_SECONDS = 240;
/** Calm between envoys (seconds), and the first after contact. */
const DISPATCH_GAP: [number, number] = [300, 540];
const FIRST_DISPATCH = 240;
/** Their director: seconds between events. */
const EVENT_GAP: [number, number] = [280, 620];
/** Chance an event of theirs is a crisis, and that a crisis sends an envoy at once. */
const CRISIS_ODDS = 0.4;
const CRISIS_ENVOY = 0.7;
/** Seconds their crisis lasts. */
const CRISIS_SECONDS: [number, number] = [90, 180];
/** Harmony points and seconds for the mood after families settle or a dive is allowed / refused. */
export const MOOD = { welcome: 1, dive: -1, refuse: 0.5, seconds: 150 };

export const GOOD_NAMES: Record<Good, string> = { energy: 'energy', water: 'water', food: 'food' };
export const CRISIS_NAMES: Record<NeighbourCrisis, string> = {
  storm: 'a storm',
  drought: 'a drought',
  swell: 'a tidal swell',
  blight: 'a crop blight',
  fire: 'a harbour fire',
};
export const DISPATCH_NAMES: Record<DispatchKind, string> = {
  aid: 'A call for aid',
  families: 'Families seeking a home',
  request: 'A shortage',
  offer: 'An offer of help',
  rival: 'A rival bid',
  loan: 'A Concord loan',
  dive: 'A dive in the bay',
};

/** Whether the city knows this neighbour (the showcase knows all; a growing island meets them by era). */
export const known = (city: City, id: NeighbourId): boolean =>
  !city.growth.progression || city.charters.era >= neighbourDef(id).era;
export const metNeighbours = (city: City): NeighbourState[] => city.archipelago.neighbours.filter((n) => n.met);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round10 = (v: number) => Math.round(v / 10) * 10;

/** What their trouble does to a good: their need for it climbs, what they can spare of it falls. */
const CRISIS_GOOD: Record<NeighbourCrisis, Good | null> = {
  storm: 'energy',
  drought: 'water',
  swell: null,
  blight: 'food',
  fire: null,
};

/** 0..1: how much they want a good they buy (season, prosperity, their crisis). */
export function needOf(city: City, n: NeighbourState, good: Good): number {
  const season = seasonAt(city.tick).season.id;
  let need = 0.35 + 0.35 * (1 - n.prosperity);
  if (good === 'water') need += season === 'haze' ? 0.2 : season === 'monsoon' ? -0.15 : 0;
  if (good === 'food') need += season === 'harvest' ? -0.15 : 0;
  if (n.crisis && CRISIS_GOOD[n.crisis] === good) need += 0.4;
  return clamp(need, 0, 1);
}

/** 0..1: the share of an agreed import they can deliver now. */
export function spareOf(n: NeighbourState, good: Good): number {
  let spare = 0.5 + 0.6 * n.prosperity;
  if (n.crisis && CRISIS_GOOD[n.crisis] === good) spare -= 0.6;
  if (n.crisis === 'swell' || n.crisis === 'fire') spare -= 0.2;
  return clamp(spare, 0, 1);
}

/** Live price per unit per second: what they pay for an export, or what an import costs. */
export function priceOf(city: City, id: NeighbourId, good: Good, dir: TradeDir): number {
  const n = neighbour(city, id);
  const rel = n.relation / 400;
  return dir === 'export'
    ? BASE_PRICE[good] * (0.75 + 0.6 * needOf(city, n, good)) * (1 + rel)
    : BASE_PRICE[good] * IMPORT_MARKUP * (1.15 - 0.3 * n.prosperity) * (1 - rel);
}

/** The city's own use of a good (food: one unit per resident), for sizing agreements. */
export const useOf = (city: City, good: Good): number =>
  good === 'energy' ? city.stats.energyUsed : good === 'water' ? city.stats.waterUsed : city.stats.population;

export const unitsFor = (city: City, good: Good, sizeIx: number): number =>
  Math.round(Math.max(MIN_UNITS[good], useOf(city, good) * (TRADE_SIZES[sizeIx]?.share ?? 0.1)));

/** Why an agreement can't be signed now, or null. */
export function tradeBlock(city: City, id: NeighbourId, good: Good, dir: TradeDir): string | null {
  const def = neighbourDef(id);
  const n = neighbour(city, id);
  if (!n.met) return `The island hasn't met ${def.name} yet`;
  if (tierOf(n.relation).id === 'hostile') return `${def.name} has an embargo on the island`;
  if (dir === 'import' && !def.sells.includes(good)) return `${def.name} has no ${GOOD_NAMES[good]} to sell`;
  if (dir === 'export' && !def.wants.includes(good)) return `${def.name} doesn't buy ${GOOD_NAMES[good]}`;
  const st = city.archipelago;
  if (st.trades.some((t) => t.partner === id && t.good === good && t.dir === dir))
    return `There is already a ${GOOD_NAMES[good]} agreement with ${def.name}`;
  if (st.trades.length >= MAX_TRADES) return `At most ${MAX_TRADES} agreements at once: end one first`;
  return null;
}

/** Notes a dealing in the log and moves the relation (emits tier changes). */
function deal(city: City, id: NeighbourId, delta: number, text: string): void {
  const st = city.archipelago;
  if (delta) shift(city, neighbour(city, id), delta);
  st.log.push({ tick: city.tick, partner: id, text, delta: Math.round(delta) });
  if (st.log.length > 24) st.log.shift();
}

/** Moves a relation, announcing a tier change; a hostile neighbour ends its agreements (embargo). */
function shift(city: City, n: NeighbourState, delta: number): void {
  const before = tierIndex(n.relation);
  n.relation = clamp(n.relation + delta, -100, 100);
  const after = tierIndex(n.relation);
  if (after === before) return;
  city.bus.emit('archipelago:tier', { id: n.id, tier: TIERS[after]!.id, up: after > before });
  if (TIERS[after]!.id === 'hostile') {
    const st = city.archipelago;
    st.trades = st.trades.filter((t) => t.partner !== n.id);
  }
}

/** Supply on the main grid and the food total, before and after trade (the pulse's pass 1). */
export interface TradeBalance {
  energy: { produced: number; used: number };
  water: { produced: number; used: number };
  food: { produced: number; used: number };
}

/**
 * Once per pulse, from the pulse's pass 1: moves each agreement's goods (exports only above `EXPORT_MARGIN` of the
 * use at home; imports only what the partner can spare), returns the change to supply per good and the credits
 * (+ earned, − paid), and moves relations with how reliably each side delivered.
 */
export function tradeFlows(city: City, bal: TradeBalance): { delta: Record<Good, number>; credits: number } {
  const st = city.archipelago;
  const delta: Record<Good, number> = { energy: 0, water: 0, food: 0 };
  let credits = 0;
  if (!st.trades.length) return { delta, credits };
  // Tick down: gifts and premium requests end on their own.
  const ended = st.trades.filter((t) => t.until && city.tick >= t.until);
  for (const t of ended) deal(city, t.partner, 0, `${t.premium === 0 ? 'Gift' : 'Agreement'} of ${GOOD_NAMES[t.good]} ran its course`);
  if (ended.length) st.trades = st.trades.filter((t) => !ended.includes(t));
  for (const t of st.trades) {
    const n = neighbour(city, t.partner);
    const b = bal[t.good];
    let moved: number;
    if (t.dir === 'export') {
      const surplus = Math.max(0, b.produced - b.used * EXPORT_MARGIN);
      moved = Math.min(t.amount, surplus);
      b.used += moved;
      delta[t.good] -= moved;
    } else {
      moved = t.amount * spareOf(n, t.good);
      b.produced += moved;
      delta[t.good] += moved;
    }
    const fill = t.amount > 0 ? moved / t.amount : 0;
    const price = priceOf(city, t.partner, t.good, t.dir) * t.premium;
    t.moved = moved;
    t.credits = (t.dir === 'export' ? 1 : -1) * moved * price;
    credits += t.credits;
    n.traded += t.credits;
    // Steady trade warms a relation (less so the warmer it is); an export that keeps falling short cools it.
    const warm = (t.dir === 'export' ? 0.03 * fill : 0.015) * (1 - Math.max(0, n.relation) / 110);
    shift(city, n, t.dir === 'export' ? warm - 0.02 * (1 - fill) : warm);
  }
  return { delta, credits };
}

/** Builds a dispatch from `from` of `kind` if it fits now, or null. */
function propose(city: City, kind: DispatchKind, from: NeighbourId): Omit<Dispatch, 'id' | 'startTick' | 'endTick' | 'status'> | null {
  const n = neighbour(city, from);
  const def = neighbourDef(from);
  const income = Math.max(1, city.stats.income);
  if (!n.met || tierOf(n.relation).id === 'hostile') return null;
  switch (kind) {
    case 'aid':
      if (!n.crisis) return null;
      return { kind, from, cause: n.crisis, credits: round10(clamp(income * 45, 300, 6000)) };
    case 'families': {
      if (n.crisis !== 'storm' && n.crisis !== 'swell' && n.crisis !== 'fire') return null;
      const residents = Math.round(clamp(city.stats.population * 0.01, 20, 600));
      return { kind, from, cause: n.crisis, residents };
    }
    case 'request': {
      // They're short of something they buy and the island has it to spare.
      const good = def.wants
        .filter((g) => needOf(city, n, g) > 0.55 && !city.archipelago.trades.some((t) => t.partner === from && t.good === g && t.dir === 'export'))
        .find((g) => surplusOf(city, g) > unitsFor(city, g, 1));
      if (!good || city.archipelago.trades.length >= MAX_TRADES) return null;
      return { kind, from, good, amount: unitsFor(city, good, 1) };
    }
    case 'offer': {
      if (tierIndex(n.relation) < 3 || !city.steward.crises.some((c) => c.phase === 'active')) return null;
      return { kind, from, credits: round10(clamp(income * 30, 200, 4000)) };
    }
    case 'rival': {
      if (from !== 'kestrel' || !neighbour(city, 'drift').met) return null;
      const metric = city.rng.next() < 0.5 ? 'harmony' : 'ecology';
      const now = metricOf(city, metric);
      return { kind, from, metric, target: Math.round((now + (metric === 'harmony' ? 4 : 1.5)) * 10) / 10 };
    }
    case 'loan':
      if (from !== 'concord' || tierIndex(n.relation) < 2) return null;
      return { kind, from, credits: Math.round(clamp(income * 300, 3000, 40000) / 1000) * 1000 };
    case 'dive':
      if (from !== 'lantern') return null;
      return { kind, from, credits: round10(clamp(income * 25, 250, 3000)) };
  }
}

/** Units of a good the island has above its export margin (main grid for energy / water). */
export function surplusOf(city: City, good: Good): number {
  const s = city.stats;
  return good === 'energy'
    ? s.energyProduced - s.energyUsed * EXPORT_MARGIN
    : good === 'water'
      ? s.waterProduced - s.waterUsed * EXPORT_MARGIN
      : s.foodProduced - s.population * EXPORT_MARGIN;
}

/** A rival bid's measure now: harmony, or ecology per building (as the Ecology tier reads it). */
export function metricOf(city: City, metric: 'harmony' | 'ecology'): number {
  return metric === 'harmony' ? city.stats.happiness : city.stats.eco / Math.max(1, city.stats.buildings);
}

/** Puts an envoy on the table now (the scheduler, their crises, drills and tests). Returns it, or null. */
export function startDispatch(city: City, kind: DispatchKind, from: NeighbourId): Dispatch | null {
  const st = city.archipelago;
  if (st.dispatch) return null;
  const p = propose(city, kind, from);
  if (!p) return null;
  const d: Dispatch = { ...p, id: st.nextDispatchId++, status: 'open', startTick: city.tick, endTick: city.tick + DISPATCH_SECONDS * PULSE_TICKS };
  st.dispatch = d;
  city.bus.emit('archipelago:dispatch', { dispatch: d });
  return d;
}

/** The two answers to a dispatch, in words (the card and Flora). */
export function dispatchChoices(d: Dispatch): [string, string] {
  switch (d.kind) {
    case 'aid':
      return ['Send aid', 'Decline'];
    case 'families':
      return ['Welcome them', 'Turn them away'];
    case 'request':
      return ['Sign the agreement', 'Not now'];
    case 'offer':
      return ['Accept with thanks', "We'll manage"];
    case 'rival':
      return ['Take them on', 'Let Kestrel have it'];
    case 'loan':
      return ['Take the loan', 'Decline politely'];
    case 'dive':
      return ['Allow the dive', 'Refuse'];
  }
}

/** Residents the island has room for (vacant homes). */
export function vacancy(city: City): number {
  let room = 0;
  for (const e of city.buildingEntities()) {
    const pop = city.buildingDef(e).stats.population;
    if (pop > 0 && !Service.off[e]) room += pop * size(e) * (1 - Service.occupancy[e]!);
  }
  return room;
}

/** Why a choice can't be taken now, or null. */
export function answerBlock(city: City, choice: number): string | null {
  const d = city.archipelago.dispatch;
  if (!d || d.status !== 'open') return 'Nothing to answer';
  if (choice !== 0) return null;
  if (d.kind === 'aid' && city.credits < d.credits!) return `Needs ◈${d.credits!.toLocaleString('en-US')}`;
  if (d.kind === 'families' && vacancy(city) < d.residents! * 0.25) return 'No vacant homes: build homes first';
  if (d.kind === 'request' && city.archipelago.trades.length >= MAX_TRADES) return `At most ${MAX_TRADES} agreements at once`;
  return null;
}

/** Moves `count` residents into vacant homes, in building order. Returns how many settled. */
function settle(city: City, count: number): number {
  let left = count;
  for (const e of city.buildingEntities()) {
    if (left <= 0) break;
    const pop = city.buildingDef(e).stats.population * size(e);
    if (pop <= 0 || Service.off[e]) continue;
    const add = Math.min(left, pop * (1 - Service.occupancy[e]!));
    if (add <= 0) continue;
    Service.occupancy[e] = Service.occupancy[e]! + add / pop;
    left -= add;
  }
  return Math.round(count - left);
}

function setMood(city: City, mood: number): void {
  const st = city.archipelago;
  st.mood = mood;
  st.moodUntil = city.tick + MOOD.seconds * PULSE_TICKS;
}

function nextGap(city: City): number {
  const [lo, hi] = DISPATCH_GAP;
  const pace = directing(city) ? city.steward.director.pace : 1;
  return Math.round(((lo + (hi - lo) * city.rng.next()) / pace) * PULSE_TICKS);
}

function close(city: City, d: Dispatch, outcome: string): void {
  const st = city.archipelago;
  st.dispatch = null;
  st.nextDispatchTick = city.tick + (st.auto ? nextGap(city) : DISPATCH_GAP[0] * PULSE_TICKS);
  city.bus.emit('archipelago:answered', { dispatch: d, outcome });
}

/** Applies an answer (0 = the first choice, 1 = the second). `ignored` = the envoy waited in vain. */
export function answer(city: City, choice: number, ignored = false): boolean {
  const st = city.archipelago;
  const d = st.dispatch;
  if (!d || d.status !== 'open' || answerBlock(city, choice)) return false;
  const n = neighbour(city, d.from);
  const name = neighbourDef(d.from).name;
  const yes = choice === 0;
  switch (d.kind) {
    case 'aid':
      if (yes) {
        city.credits -= d.credits!;
        n.prosperity = clamp(n.prosperity + 0.08, 0, 1);
        if (n.crisis) n.crisisUntil = city.tick + Math.round((n.crisisUntil - city.tick) * 0.6);
        deal(city, d.from, 14, `Sent ◈${d.credits!.toLocaleString('en-US')} of aid after ${CRISIS_NAMES[d.cause!]}`);
      } else deal(city, d.from, ignored ? -4 : -6, ignored ? 'Their call for aid went unanswered' : 'Declined their call for aid');
      break;
    case 'families':
      if (yes) {
        const settled = settle(city, d.residents!);
        setMood(city, MOOD.welcome);
        deal(city, d.from, 12, `${settled} people from ${name} settled on the island`);
      } else deal(city, d.from, ignored ? -6 : -8, ignored ? 'Their families waited at the quay in vain' : 'Turned their families away');
      break;
    case 'request':
      if (yes) {
        sign(city, d.from, d.good!, 'export', d.amount!, PREMIUM.mul, city.tick + PREMIUM.seconds * PULSE_TICKS);
        deal(city, d.from, 6, `Agreed to ship ${GOOD_NAMES[d.good!]} at a premium through their shortage`);
      } else deal(city, d.from, -3, `Couldn't help with their ${GOOD_NAMES[d.good!]} shortage`);
      break;
    case 'offer':
      if (yes) {
        city.credits += d.credits!;
        deal(city, d.from, 3, `Accepted ◈${d.credits!.toLocaleString('en-US')} of help in a crisis`);
      } else deal(city, d.from, 1, 'Thanked them for their offer of help');
      break;
    case 'rival':
      if (yes) {
        d.status = 'goal';
        d.endTick = city.tick + RIVAL_SECONDS * PULSE_TICKS;
        city.bus.emit('archipelago:dispatch', { dispatch: d });
        return true;
      }
      deal(city, 'kestrel', 6, 'Let Kestrel Cay host the Drift regatta');
      deal(city, 'drift', -2, 'Stood aside from the regatta bid');
      break;
    case 'loan':
      if (yes) {
        const steward = city.steward;
        const rate = Math.max(0, (DIFFICULTIES[steward.difficulty].interest + city.consequences.mods.interest) * 0.5);
        const total = d.credits! * (1 + rate * (LOAN_TERM / 60));
        steward.loans.push({ id: steward.nextLoanId++, principal: d.credits!, remaining: total, payment: total / LOAN_TERM });
        city.credits += d.credits!;
        deal(city, d.from, 4, `Took a ◈${d.credits!.toLocaleString('en-US')} Concord loan at half the usual interest`);
      } else deal(city, d.from, -2, 'Declined a Concord loan');
      break;
    case 'dive':
      if (yes) {
        city.credits += d.credits!;
        setMood(city, MOOD.dive);
        deal(city, d.from, 8, `Allowed a Lantern dive on the drowned city for ◈${d.credits!.toLocaleString('en-US')}`);
      } else {
        setMood(city, MOOD.refuse);
        deal(city, d.from, -5, 'Refused a Lantern dive on the drowned city');
      }
      break;
  }
  close(city, d, ignored ? 'ignored' : yes ? 'accepted' : 'declined');
  return true;
}

/** Signs an agreement (the command, a premium request, a gift). Returns it. */
function sign(city: City, partner: NeighbourId, good: Good, dir: TradeDir, amount: number, premium = 1, until = 0): TradeAgreement {
  const st = city.archipelago;
  const t: TradeAgreement = { id: st.nextTradeId++, partner, good, dir, amount, premium, until, since: city.tick, moved: 0, credits: 0 };
  st.trades.push(t);
  return t;
}

/** Their director, once its time comes: maybe a crisis (and its envoy), always a nudge to prosperity. */
function neighbourEvent(city: City, n: NeighbourState): void {
  const def = neighbourDef(n.id);
  const r = city.rng;
  const [lo, hi] = EVENT_GAP;
  n.nextTick = city.tick + Math.round(((lo + (hi - lo) * r.next()) / def.restless) * PULSE_TICKS);
  if (n.crisis || r.next() > CRISIS_ODDS) {
    n.prosperity = clamp(n.prosperity + 0.04, 0, 1);
    return;
  }
  const season = seasonAt(city.tick).season.id;
  const weights: [NeighbourCrisis, number][] = [
    ['storm', season === 'monsoon' ? 2.2 : 1],
    ['drought', season === 'haze' ? 2.5 : 0.6],
    ['swell', 0.6],
    ['blight', season === 'harvest' ? 2 : 0.6],
    ['fire', season === 'haze' ? 1.5 : 0.7],
  ];
  let pick = r.next() * weights.reduce((a, [, w]) => a + w, 0);
  let kind: NeighbourCrisis = 'storm';
  for (const [k, w] of weights)
    if ((pick -= w) <= 0) {
      kind = k;
      break;
    }
  const [clo, chi] = CRISIS_SECONDS;
  n.crisis = kind;
  n.crisisUntil = city.tick + Math.round((clo + (chi - clo) * r.next()) * PULSE_TICKS);
  n.prosperity = clamp(n.prosperity - (kind === 'storm' || kind === 'swell' ? 0.2 : 0.12), 0, 1);
  // Their storm or swell may be on its way (only through the director, with crises on).
  let coming: string | null = null;
  if ((kind === 'storm' || kind === 'swell') && city.steward.autoCrises && directing(city) && r.next() < def.reach) {
    coming = kind === 'swell' ? 'king-tide' : season === 'monsoon' ? 'monsoon' : 'thunderstorm';
    if (!queueCrisis(city, { crisis: coming, gap: 30, severity: 0.8, cause: `The ${kind} that struck ${def.name}`, kind: 'chain' })) coming = null;
  }
  city.bus.emit('archipelago:crisis', { id: n.id, crisis: kind, coming });
  // Their envoy often comes straight away when the table is free: families after a storm, swell or fire half the time.
  if (!city.archipelago.dispatch && r.next() < CRISIS_ENVOY) {
    const families = kind !== 'drought' && kind !== 'blight' && r.next() < 0.5;
    if (!(families && startDispatch(city, 'families', n.id))) startDispatch(city, 'aid', n.id);
  }
}

/** Once per pulse, after the happenings: contact, relations, their directors, envoys and rival bids. */
export function updateArchipelago(city: City): void {
  const st = city.archipelago;
  const sec = city.tick / PULSE_TICKS;
  for (const [i, n] of st.neighbours.entries()) {
    if (!n.met) {
      if (!known(city, n.id)) continue;
      n.met = true;
      // Staggered, so two neighbours met together don't have their first news on the same pulse.
      n.nextTick = city.tick + Math.round((EVENT_GAP[0] + i * 45) * PULSE_TICKS);
      if (st.nextDispatchTick === 0) st.nextDispatchTick = city.tick + FIRST_DISPATCH * PULSE_TICKS;
      city.bus.emit('archipelago:contact', { id: n.id, name: neighbourDef(n.id).name });
      continue;
    }
    // Left alone, a relation settles toward where it rests (slights fade slower with proud neighbours).
    const def = neighbourDef(n.id);
    const rest = def.rest - n.relation;
    shift(city, n, rest * 0.0015 * (rest > 0 ? def.forgive : 1));
    if (n.crisis && city.tick >= n.crisisUntil) {
      n.crisis = null;
      city.bus.emit('archipelago:crisis', { id: n.id, crisis: null, coming: null });
    }
    if (!st.auto) continue;
    // Their fortunes wander every ten seconds, pulled back toward doing well.
    if (sec % 10 === 0) n.prosperity = clamp(n.prosperity + (0.65 - n.prosperity) * 0.04 + (city.rng.next() - 0.5) * 0.03, 0, 1);
    if (city.tick >= n.nextTick) neighbourEvent(city, n);
  }
  const d = st.dispatch;
  if (d) {
    if (d.status === 'goal') {
      const won = metricOf(city, d.metric!) >= d.target!;
      if (won || city.tick >= d.endTick) {
        if (won) {
          deal(city, 'drift', 10, 'Won the Drift regatta from Kestrel Cay');
          deal(city, 'kestrel', -4, 'Beat them to the Drift regatta');
          if (!startHappening(city, 'festival')) city.credits += round10(clamp(city.stats.income * 40, 300, 5000));
        } else {
          deal(city, 'drift', -3, 'The Drift regatta went to Kestrel Cay');
          deal(city, 'kestrel', 3, 'Kestrel Cay won the regatta');
        }
        close(city, d, won ? 'won' : 'lost');
      }
    } else if (city.tick >= d.endTick) answer(city, 1, true);
    return;
  }
  if (!st.auto || !metNeighbours(city).length) return;
  // A friend in the island's trouble offers help (once per crisis).
  const active = city.steward.crises.find((c) => c.phase === 'active');
  if (active && st.offered !== active.id) {
    const friend = metNeighbours(city)
      .filter((n) => tierIndex(n.relation) >= 3)
      .sort((a, b) => b.relation - a.relation)[0];
    if (friend && startDispatch(city, 'offer', friend.id)) {
      st.offered = active.id;
      return;
    }
  }
  if (city.tick < st.nextDispatchTick || city.steward.crises.length > 0) return;
  const kinds: [DispatchKind, NeighbourId, number][] = [
    ['request', 'drift', 1.2],
    ['request', 'kestrel', 1],
    ['request', 'concord', 1],
    ['request', 'lantern', 0.8],
    ['rival', 'kestrel', 0.9],
    ['loan', 'concord', 0.6],
    ['dive', 'lantern', 0.8],
  ];
  const open = kinds.filter(([, from]) => neighbour(city, from).met);
  let r = city.rng.next() * open.reduce((a, [, , w]) => a + w, 0);
  for (const [kind, from, w] of open)
    if ((r -= w) <= 0) {
      if (startDispatch(city, kind, from)) return;
      break;
    }
  st.nextDispatchTick = city.tick + 60 * PULSE_TICKS;
}

/** Writes friends' perks and the mood of the last envoy into this pulse's modifiers (the consequences step). */
export function applyArchipelago(city: City, mods: ConsequenceMods): void {
  const st = city.archipelago;
  if (city.tick < st.moodUntil) mods.harmony += st.mood;
  for (const n of st.neighbours) {
    if (!n.met) continue;
    const t = tierIndex(n.relation);
    const k = t >= 4 ? 1 : t === 3 ? 0.5 : 0;
    if (!k) continue;
    if (n.id === 'drift') mods.tourismMul *= 1 + 0.15 * k;
    else if (n.id === 'concord') mods.interest -= 0.006 * k;
    else if (n.id === 'lantern') mods.floraDiscount = Math.min(0.9, mods.floraDiscount + 0.2 * k);
    else if (n.id === 'kestrel') mods.damage *= 1 - 0.15 * k;
  }
}

/** The envoy's words for the card and Flora. */
export function describeDispatch(city: City, d: Dispatch): string {
  const def = neighbourDef(d.from);
  const fmt = (v: number) => `◈${Math.round(v).toLocaleString('en-US')}`;
  switch (d.kind) {
    case 'aid':
      return `${def.envoy} sends word from ${def.name}: ${CRISIS_NAMES[d.cause!]} has hit them hard. Could the island spare ${fmt(d.credits!)} for repairs?`;
    case 'families':
      return `${def.envoy}: after ${CRISIS_NAMES[d.cause!]}, ${d.residents} people from ${def.name} have nowhere to sleep. They ask to settle on the island (they need vacant homes).`;
    case 'request': {
      const p = priceOf(city, d.from, d.good!, 'export') * PREMIUM.mul * d.amount!;
      return `${def.envoy}: ${def.name} is short of ${GOOD_NAMES[d.good!]}. They ask for ${Math.round(d.amount!)} units a second for ${PREMIUM.seconds / 60} minutes, at half again the price (about ${fmt(p)}/s while you have it to spare).`;
    }
    case 'offer':
      return `${def.envoy} has heard of the island's trouble: ${def.name} offers ${fmt(d.credits!)}, no strings attached.`;
    case 'rival':
      return d.status === 'goal'
        ? `The Drift regatta: lift the island's ${d.metric} to ${d.target} before Kestrel Cay does (now ${metricOf(city, d.metric!).toFixed(1)}).`
        : `${def.envoy} is bidding to host the Drift's regatta. The Drift will choose whichever island shows the better ${d.metric}: reach ${d.target} (now ${metricOf(city, d.metric!).toFixed(1)}) within ${RIVAL_SECONDS / 60} minutes.`;
    case 'loan':
      return `${def.envoy} offers a loan of ${fmt(d.credits!)} at half the usual interest. "Every city needs a wall, steward. Build yours however you like."`;
    case 'dive':
      return `${def.envoy} asks leave to dive the drowned city in the bay. The Orders will pay ${fmt(d.credits!)} for the privilege; some residents think the ruins should be left alone.`;
  }
}

/** Plain JSON digest of an agreement for Flora and the chart. */
export const tradeLine = (t: TradeAgreement): string =>
  `${t.dir === 'export' ? 'Ship' : 'Buy'} ${t.amount} ${GOOD_NAMES[t.good]}/s ${t.dir === 'export' ? 'to' : 'from'} ${neighbourDef(t.partner).name}${t.premium !== 1 ? (t.premium === 0 ? ' (gift)' : ' (premium)') : ''}`;

export function registerArchipelagoCommands(stack: CommandStack<SimCtx>): void {
  stack.register<{ partner: NeighbourId; good: Good; dir: TradeDir; size?: number }, { id: number; nextTradeId: number }>('signTrade', {
    apply({ city }, p) {
      if (!NEIGHBOURS.some((n) => n.id === p.partner) || tradeBlock(city, p.partner, p.good, p.dir)) return null;
      const st = city.archipelago;
      const before = st.nextTradeId;
      const t = sign(city, p.partner, p.good, p.dir, unitsFor(city, p.good, p.size ?? 1));
      city.bus.emit('archipelago:trade', { trade: t, signed: true });
      return { id: t.id, nextTradeId: before };
    },
    revert({ city }, _p, u) {
      const st = city.archipelago;
      const t = st.trades.find((x) => x.id === u.id);
      st.trades = st.trades.filter((x) => x.id !== u.id);
      st.nextTradeId = u.nextTradeId;
      if (t) city.bus.emit('archipelago:trade', { trade: t, signed: false });
    },
  });

  stack.register<{ id: number }, { trade: TradeAgreement; index: number; relation: number }>('endTrade', {
    apply({ city }, p) {
      const st = city.archipelago;
      const index = st.trades.findIndex((t) => t.id === p.id);
      const t = st.trades[index];
      if (!t) return null;
      const n = neighbour(city, t.partner);
      const undo = { trade: { ...t }, index, relation: n.relation };
      st.trades.splice(index, 1);
      // Ending an export they rely on stings a little; ending an import just loses them a customer.
      shift(city, n, t.dir === 'export' ? -3 : -1);
      city.bus.emit('archipelago:trade', { trade: t, signed: false });
      return undo;
    },
    revert({ city }, _p, u) {
      const st = city.archipelago;
      st.trades.splice(u.index, 0, u.trade);
      neighbour(city, u.trade.partner).relation = u.relation;
      city.bus.emit('archipelago:trade', { trade: u.trade, signed: true });
    },
  });

  // Answers are final (an envoy can't un-hear them): run with `undoable = false`.
  stack.register<{ id: number; choice: number }, true>('answerDispatch', {
    apply({ city }, p) {
      const d = city.archipelago.dispatch;
      if (!d || d.id !== p.id) return null;
      return answer(city, p.choice) ? true : null;
    },
    revert() {
      /* not undoable */
    },
  });
}
