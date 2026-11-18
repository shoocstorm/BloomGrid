import { Building } from '@/ecs/components';
import { buildings } from '@/content';
import { isHero } from '@/content/heroes';
import { CATEGORY_LABELS, type BuildingCategory } from '@/content/types';
import type { CommandStack } from '@/core/Commands';
import type { City } from './City';
import type { SimCtx } from './systems';
import type { ConsequenceMods } from './consequenceState';
import { launchBlocker, startShow, SHOW_FEE } from './fireworks';
import { isOpen } from './growthState';
import type { Happening, HappeningKind } from './happeningState';
import { PULSE_TICKS } from './pulseConst';
import { directing } from './directorCore';
import { APPROVAL, COMPLAINT_TEXT, complaints, districtLabel, moodOf, setDistrictMood } from './approval';
import { OUTSKIRTS_KEY } from './approvalState';
import { getPolicy, isActive, policyBlock } from './policies';

/**
 * Happenings (D-123): between crises the city brings up good surprises and things its residents ask for, so a
 * stable city still has something to respond to. One at a time, every few minutes, never during a crisis or
 * while harmony is Critical:
 * - a **request**: residents somewhere ask for a kind of building nearby (one their area lacks and the city
 *   can build); build it before the deadline and claim the reward (credits, a harmony lift), or miss it and
 *   the mood dips for a while;
 * - a **festival** (harmony Stable or better): visitors and a harmony lift for a while, and a free fireworks
 *   show when a factory has shells;
 * - a **bumper catch** (a fishing dock): the fishing haul runs half again higher;
 * - a **cruise visit** (a waterfront): visitors spend for a while;
 * - the **Bloom Expo** (from the Canopy era, a landmark): many visitors and a harmony lift (plan v5, Phase 28).
 * Effects go through the consequence modifiers (`applyHappenings`), so visitor credits land in `stats.tourism`
 * and `netIncome`. Randomness only from `city.rng`, and only while `auto` is on (tests switch it off).
 */

/** Calm gap between happenings, in seconds (pulses). */
export const HAPPENING_GAP: [number, number] = [240, 420];
/** The first one in a new city comes this many seconds in. */
const FIRST_GAP = 150;
/** Seconds a request stays open, and each boon lasts. */
export const HAPPENING_SECONDS: Record<HappeningKind, number> = {
  request: 300,
  festival: 150,
  'bumper-catch': 180,
  cruise: 90,
  petition: 300,
  protest: 300,
  praise: 120,
  expo: 150,
};
/** District approval points after a petition answered (+) or ignored (−), praise, and a protest left to fester. */
export const DISTRICT_MOOD = { petition: 5, ignored: -4, praise: 3, festered: -3 } as const;
/** A petition asks for this many points of approval above where the district stands. */
export const PETITION_LIFT = 6;
/** Seconds after the last happening before an angry district may protest. */
const PROTEST_GAP = 60;
/** City harmony points while a protest runs (unrest is news everywhere). */
export const PROTEST_HARMONY = -1;
/** Requests look for buildings within this many tiles of the residents who asked. */
export const REQUEST_RADIUS = 12;
/** Harmony points after a claimed request (+) or a missed one (−), for this many seconds. */
export const MOOD = { claimed: 2.5, missed: -1.5, seconds: 180 };
/** Request reward: a base, plus credits per resident up to a cap. */
export const REQUEST_REWARD = { base: 250, perResident: 0.04, cap: 1500 };
/** Visitor credits per second during a boon: a flat part plus a share of tax income. */
export const VISITORS = { festival: { flat: 2, share: 0.12 }, cruise: { flat: 3, share: 0.1 }, expo: { flat: 6, share: 0.2 } };
/** Harmony points while the Bloom Expo runs, and the era it comes from. */
export const EXPO_HARMONY = 1;
export const EXPO_ERA = 2;
/** Fishing haul multiplier during a bumper catch; Harmony points during a festival. */
export const CATCH_MUL = 1.5;
export const FESTIVAL_HARMONY = 2;
/** Categories residents ask for (each needs a buildable building). */
const ASKS: BuildingCategory[] = ['nature', 'food', 'sports', 'commercial'];

export const HAPPENING_NAMES: Record<HappeningKind, string> = {
  request: "Residents' request",
  festival: 'Street festival',
  'bumper-catch': 'Bumper catch',
  cruise: 'Cruise visit',
  petition: 'District petition',
  protest: 'District protest',
  praise: 'District thanks',
  expo: 'Bloom Expo',
};

/** The ordinance that answers a district's complaint, when there is one the city could enact now. */
function answeringPolicy(city: City, complaint: string | undefined): string | undefined {
  const options =
    complaint === 'commute'
      ? ['free-transit', 'car-free-core']
      : complaint === 'services' && city.pulse.waterRatio < city.pulse.energyRatio
        ? ['rainwater-code']
        : [];
  return options.find((id) => !isActive(city, id) && !policyBlock(city, id, true));
}

/** Centre of a district (its rectangle), or of the outskirts' homes. */
function districtCentre(city: City, key: string): [number, number] {
  const d = city.districts.find((x) => x.name === key);
  if (d) return [(d.x0 + d.x1 + 1) / 2, (d.z0 + d.z1 + 1) / 2];
  for (const e of city.buildingEntities())
    if (city.buildingDef(e).stats.population > 0 && !city.areaAt(Building.x[e]!, Building.z[e]!)) return centre(e);
  return [city.size / 2, city.size / 2];
}

/** Districts with residents, from the last pulse's view (lowest approval first). */
const peopled = (city: City) =>
  city.approval.view.districts
    .filter((v) => v.capacity >= 50)
    .map((v) => ({ v, m: moodOf(city, v.key) }))
    .sort((a, b) => a.m.approval - b.m.approval);

/** What a request asks for, in words ("a Nature building"). */
export const askName = (category: string): string =>
  `a ${CATEGORY_LABELS[category as BuildingCategory] ?? category} building`;

/** Request reward: grows with the city, so it stays worth chasing (rounded to tens). */
export const requestReward = (city: City): number =>
  Math.round(
    (REQUEST_REWARD.base + Math.min(REQUEST_REWARD.cap, city.stats.population * REQUEST_REWARD.perResident)) /
      10,
  ) * 10;

function centre(eid: number): [number, number] {
  return [Building.x[eid]! + Building.w[eid]! / 2, Building.z[eid]! + Building.d[eid]! / 2];
}

/** Buildings of a category whose centre lies within `r` of (x, z). */
export function countNear(city: City, category: string, x: number, z: number, r: number): number {
  let n = 0;
  for (const eid of city.buildingEntities()) {
    if (city.buildingDef(eid).category !== category) continue;
    const [cx, cz] = centre(eid);
    if ((cx - x) ** 2 + (cz - z) ** 2 <= r * r) n++;
  }
  return n;
}

const placeName = (city: City, x: number, z: number): string =>
  city.districtAt(Math.floor(x), Math.floor(z)) ?? 'the neighbourhood';

/** Can the city build something of this category now (unlocked, affordable within reason)? */
const buildable = (city: City, category: string): boolean =>
  buildings
    .all()
    .some(
      (d) =>
        d.category === category &&
        (!d.requires || isOpen(city.growth, d.requires)) &&
        d.stats.cost <= Math.max(800, city.credits),
    );

/** Builds a happening of `kind` if the city qualifies, or null. */
function propose(
  city: City,
  kind: HappeningKind,
): Omit<Happening, 'id' | 'status' | 'startTick' | 'endTick' | 'earned'> | null {
  const ents = city.buildingEntities();
  const pick = <T>(list: T[]): T | undefined =>
    list.length ? list[Math.floor(city.rng.next() * list.length)] : undefined;
  switch (kind) {
    case 'request': {
      const homes = ents.filter((e) => city.buildingDef(e).category === 'residential');
      const home = pick(homes);
      if (home === undefined) return null;
      const [x, z] = centre(home);
      // Ask for what the area lacks most among what the city can build.
      const options = ASKS.filter((c) => buildable(city, c))
        .map((c) => [c, countNear(city, c, x, z, REQUEST_RADIUS)] as const)
        .sort((a, b) => a[1] - b[1]);
      if (!options.length) return null;
      const fewest = options.filter((o) => o[1] === options[0]![1]);
      const [category, baseline] = pick(fewest as (typeof options)[number][])!;
      return {
        kind,
        x,
        z,
        place: placeName(city, x, z),
        category,
        radius: REQUEST_RADIUS,
        baseline,
        reward: requestReward(city),
      };
    }
    case 'festival': {
      if (city.stats.happiness < 55 || city.stats.population < 150) return null;
      const lively = ents.filter((e) =>
        ['commercial', 'sports', 'nature'].includes(city.buildingDef(e).category),
      );
      const at = pick(lively);
      if (at === undefined) return null;
      const [x, z] = centre(at);
      return { kind, x, z, place: placeName(city, x, z), reward: 0 };
    }
    case 'bumper-catch': {
      const docks = ents.filter((e) => city.buildingDef(e).fishing);
      const at = pick(docks);
      if (at === undefined) return null;
      const [x, z] = centre(at);
      return { kind, x, z, place: placeName(city, x, z), reward: 0 };
    }
    case 'petition': {
      const low = peopled(city).find(({ m }) => m.approval < APPROVAL.petition);
      if (!low) return null;
      const complaint = complaints(low.v)[0];
      const policy = answeringPolicy(city, complaint);
      const [x, z] = districtCentre(city, low.v.key);
      return {
        kind,
        x,
        z,
        place: low.v.name,
        district: low.v.key,
        ...(complaint ? { complaint } : {}),
        ...(policy ? { policy } : {}),
        target: Math.min(95, Math.ceil(low.m.approval + PETITION_LIFT)),
        reward: requestReward(city),
      };
    }
    case 'protest': {
      const angry = peopled(city).find(({ m }) => m.lowFor >= APPROVAL.protestPulses && m.approval < APPROVAL.protest);
      if (!angry) return null;
      const complaint = complaints(angry.v)[0];
      const [x, z] = districtCentre(city, angry.v.key);
      return {
        kind,
        x,
        z,
        place: angry.v.name,
        district: angry.v.key,
        ...(complaint ? { complaint } : {}),
        target: APPROVAL.calm,
        reward: 0,
      };
    }
    case 'praise': {
      const happy = peopled(city)
        .reverse()
        .find(({ m }) => m.highFor >= APPROVAL.praisePulses);
      if (!happy) return null;
      const [x, z] = districtCentre(city, happy.v.key);
      return {
        kind,
        x,
        z,
        place: happy.v.name,
        district: happy.v.key,
        reward: Math.round(requestReward(city) / 20) * 10,
      };
    }
    case 'expo': {
      if (city.charters.era < EXPO_ERA) return null;
      const halls = ents.filter((e) => isHero(city.buildingDef(e)));
      const at = pick(halls.length ? halls : ents.filter((e) => city.buildingDef(e).category === 'sports'));
      if (at === undefined) return null;
      const [x, z] = centre(at);
      return { kind, x, z, place: placeName(city, x, z), reward: 0 };
    }
    case 'cruise': {
      if (city.stats.population < 400) return null;
      const quays = ents.filter((e) => city.buildingDef(e).placement?.nearWater);
      const at = pick(quays);
      if (at === undefined) return null;
      const [x, z] = centre(at);
      return { kind, x, z, place: placeName(city, x, z), reward: 0 };
    }
  }
}

/** Starts a happening now (the scheduler, drills and tests). Returns it, or null when the city doesn't qualify. */
export function startHappening(city: City, kind: HappeningKind): Happening | null {
  const st = city.happenings;
  if (st.current) return null;
  const p = propose(city, kind);
  if (!p) return null;
  const h: Happening = {
    ...p,
    id: st.nextId++,
    status: 'active',
    startTick: city.tick,
    endTick: city.tick + HAPPENING_SECONDS[kind] * PULSE_TICKS,
    earned: 0,
  };
  // Praise is a thank-you gift: ready to claim at once. Its streak starts over.
  if (kind === 'praise') {
    h.status = 'met';
    moodOf(city, h.district!).highFor = 0;
  }
  st.current = h;
  if (kind === 'festival' && !launchBlocker(city)) {
    // The festival's show is on the city: the crew fee is refunded.
    startShow(city, false, 'festival');
    city.credits += SHOW_FEE;
    city.fireworks.spent -= SHOW_FEE;
  }
  city.bus.emit('happening:start', { happening: h });
  return h;
}

/** Pays a met request, petition or praise and lifts the mood (the city's for requests, the district's otherwise). */
function payOut(city: City, h: Happening): void {
  const st = city.happenings;
  city.credits += h.reward;
  if (h.district !== undefined)
    setDistrictMood(city, h.district, h.kind === 'praise' ? DISTRICT_MOOD.praise : DISTRICT_MOOD.petition);
  else {
    st.mood = MOOD.claimed;
    st.moodUntil = city.tick + MOOD.seconds * PULSE_TICKS;
  }
}

function finish(city: City, h: Happening, outcome: 'claimed' | 'missed' | 'done'): void {
  const st = city.happenings;
  st.history.push({
    id: h.id,
    kind: h.kind,
    outcome,
    tick: city.tick,
    credits: Math.round(outcome === 'claimed' ? h.reward : h.earned),
    place: h.place,
  });
  if (st.history.length > 20) st.history.shift();
  st.current = null;
  const [lo, hi] = HAPPENING_GAP;
  // The director (plan v5, Phase 27) brings them sooner to a city that runs itself, later to one in trouble.
  const pace = directing(city) ? city.steward.director.pace : 1;
  st.nextTick = city.tick + Math.round(((lo + (hi - lo) * (st.auto ? city.rng.next() : 0.5)) / pace) * PULSE_TICKS);
  city.bus.emit('happening:end', { happening: h, outcome });
}

/** Per pulse: schedule, check requests, close what ran out. */
export function updateHappenings(city: City): void {
  const st = city.happenings;
  const h = st.current;
  if (h) {
    if (
      h.kind === 'request' &&
      h.status === 'active' &&
      countNear(city, h.category!, h.x, h.z, h.radius!) > h.baseline!
    ) {
      h.status = 'met';
      city.bus.emit('happening:met', { happening: h });
    }
    // A petition is met by the ordinance it asked for, or by approval climbing to its target.
    if (
      h.kind === 'petition' &&
      h.status === 'active' &&
      ((h.policy && isActive(city, h.policy)) || moodOf(city, h.district!).approval >= h.target!)
    ) {
      h.status = 'met';
      city.bus.emit('happening:met', { happening: h });
    }
    // A protest ends when the district calms down.
    if (h.kind === 'protest' && moodOf(city, h.district!).approval >= h.target!) {
      moodOf(city, h.district!).lowFor = 0;
      h.status = 'done';
      finish(city, h, 'done');
      return;
    }
    // A met request nobody claimed pays out on its own a little after the deadline (it must not block the next).
    if (h.status === 'met' && city.tick >= h.endTick + 120 * PULSE_TICKS) {
      payOut(city, h);
      h.status = 'done';
      finish(city, h, 'claimed');
      return;
    }
    if (city.tick >= h.endTick && h.status !== 'met') {
      if (h.kind === 'request') {
        h.status = 'missed';
        st.mood = MOOD.missed;
        st.moodUntil = city.tick + MOOD.seconds * PULSE_TICKS;
        finish(city, h, 'missed');
      } else if (h.kind === 'petition' || h.kind === 'protest') {
        // Ignored: the district holds a grudge for a while (and an unheard protest starts its count again).
        setDistrictMood(city, h.district!, h.kind === 'petition' ? DISTRICT_MOOD.ignored : DISTRICT_MOOD.festered);
        if (h.kind === 'protest') moodOf(city, h.district!).lowFor = 0;
        h.status = 'missed';
        finish(city, h, 'missed');
      } else {
        h.status = 'done';
        finish(city, h, 'done');
      }
    }
    return;
  }
  if (!st.auto) return;
  // An angry district doesn't wait for a calm gap or the end of a crisis: it takes to the streets.
  const last = st.history.length ? st.history[st.history.length - 1]!.tick : -Infinity;
  if (city.tick - last >= PROTEST_GAP * PULSE_TICKS && startHappening(city, 'protest')) return;
  if (st.nextTick === 0) st.nextTick = city.tick + FIRST_GAP * PULSE_TICKS;
  if (city.tick < st.nextTick) return;
  if (city.steward.crises.length > 0 || city.stats.happiness < 25) return;
  // Requests are the backbone; boons come when the city has what they need.
  const kinds: [HappeningKind, number][] = [
    ['request', 3],
    ['petition', 1.5],
    ['praise', 1],
    ['festival', 1.2],
    ['bumper-catch', 1],
    ['cruise', 0.8],
    ['expo', 0.8],
  ];
  const total = kinds.reduce((a, [, w]) => a + w, 0);
  let r = city.rng.next() * total;
  let kind: HappeningKind = 'request';
  for (const [k, w] of kinds)
    if ((r -= w) <= 0) {
      kind = k;
      break;
    }
  // A city that doesn't qualify for the drawn boon gets a request instead (and tries again later if not even that).
  if (!startHappening(city, kind) && !startHappening(city, 'request'))
    st.nextTick = city.tick + 60 * PULSE_TICKS;
}

/** Writes the current happening's effects into this pulse's modifiers (called by the consequences step). */
export function applyHappenings(city: City, mods: ConsequenceMods): void {
  const st = city.happenings;
  if (city.tick < st.moodUntil) mods.harmony += st.mood;
  const h = st.current;
  if (h?.kind === 'protest' && h.status === 'active') mods.harmony += PROTEST_HARMONY;
  if (!h || h.status !== 'active') return;
  const s = city.stats;
  let visitors = 0;
  if (h.kind === 'festival') {
    mods.harmony += FESTIVAL_HARMONY;
    visitors = VISITORS.festival.flat + s.income * VISITORS.festival.share;
  } else if (h.kind === 'cruise') visitors = VISITORS.cruise.flat + s.income * VISITORS.cruise.share;
  else if (h.kind === 'expo') {
    mods.harmony += EXPO_HARMONY;
    visitors = VISITORS.expo.flat + s.income * VISITORS.expo.share;
  }
  else if (h.kind === 'bumper-catch') mods.fishing *= CATCH_MUL;
  mods.tourism += visitors;
  h.earned += visitors;
}

export function registerHappeningCommands(stack: CommandStack<SimCtx>): void {
  stack.register<
    { id: number },
    {
      reward: number;
      h: Happening;
      nextTick: number;
      mood: number;
      moodUntil: number;
      district?: { boost: number; boostUntil: number };
    }
  >('claimHappening', {
    apply({ city }, p) {
      const st = city.happenings;
      const h = st.current;
      if (!h || h.id !== p.id || h.status !== 'met') return null;
      const undo = {
        reward: h.reward,
        h: structuredClone(h),
        nextTick: st.nextTick,
        mood: st.mood,
        moodUntil: st.moodUntil,
        ...(h.district !== undefined
          ? { district: (({ boost, boostUntil }) => ({ boost, boostUntil }))(moodOf(city, h.district)) }
          : {}),
      };
      payOut(city, h);
      h.status = 'done';
      finish(city, h, 'claimed');
      return undo;
    },
    revert({ city }, _p, u) {
      const st = city.happenings;
      city.credits -= u.reward;
      st.history.pop();
      st.current = u.h;
      Object.assign(st, { nextTick: u.nextTick, mood: u.mood, moodUntil: u.moodUntil });
      if (u.district && u.h.district !== undefined) Object.assign(moodOf(city, u.h.district), u.district);
    },
  });
}

/** Short status line for Flora and the card ("Westbrook asks for a Nature building within 12 tiles: 3:20 left"). */
export function describeHappening(city: City, h: Happening): string {
  const left = Math.max(0, Math.ceil((h.endTick - city.tick) / PULSE_TICKS));
  const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`;
  switch (h.kind) {
    case 'request':
      return h.status === 'met'
        ? `${h.place}'s residents got ${askName(h.category!)}: claim ${h.reward} credits`
        : `${h.place}'s residents ask for ${askName(h.category!)} within ${h.radius} tiles (${h.reward} credits, ${time})`;
    case 'festival':
      return `A street festival in ${h.place}: visitors and good cheer (${time})`;
    case 'bumper-catch':
      return `A bumper catch off ${h.place}: the haul runs half again higher (${time})`;
    case 'cruise':
      return `A cruise ship calls at ${h.place}: visitors are spending (${time})`;
    case 'expo':
      return `The Bloom Expo opens at ${h.place}: visitors from across the sea (${time})`;
    case 'petition': {
      const what = h.policy ? `the ${getPolicy(h.policy)?.name ?? h.policy} ordinance` : `approval of ${h.target} (now ${Math.round(moodOf(city, h.district!).approval)})`;
      return h.status === 'met'
        ? `${h.place}'s petition is answered: claim ${h.reward} credits`
        : `${h.place} petitions for ${what}${h.complaint ? `: ${complaintLabel(h.complaint)}` : ''} (${h.reward} credits, ${time})`;
    }
    case 'protest':
      return `${h.place} is protesting${h.complaint ? ` (${complaintLabel(h.complaint)})` : ''}: its workplaces run short-staffed until approval reaches ${h.target} (now ${Math.round(moodOf(city, h.district!).approval)}, ${time})`;
    case 'praise':
      return `${h.place} thanks the steward: claim a ${h.reward}-credit gift`;
  }
}

/** A complaint key in words ("long commutes"). */
export const complaintLabel = (key: string): string =>
  (COMPLAINT_TEXT[key as keyof typeof COMPLAINT_TEXT]?.label ?? key).toLowerCase();
/** What fixes a complaint (the card and Flora). */
export const complaintFix = (key: string | undefined): string =>
  (key && COMPLAINT_TEXT[key as keyof typeof COMPLAINT_TEXT]?.fix) || 'Power and water, amenities, lower taxes and fewer crises all help.';
export { districtLabel, OUTSKIRTS_KEY };
