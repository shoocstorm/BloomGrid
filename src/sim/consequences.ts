import { Building, Service } from '@/ecs/components';
import type { City } from './City';
import { DAY_LENGTH } from './pulseConst';
import { seasonAt } from './seasons';
import { neutralMods, type ConsequenceMods, type FeedEntry } from './consequenceState';

/**
 * Logic and consequences (Phase 20, D-074): the city's choices ripple. Each rule measures a cause (a bare coast,
 * a dirty one, an overfished sea, towers without parks, unfunded upkeep, debt…) as a target 0..1; its intensity
 * ramps toward the target (so effects build up and fade instead of flipping) and sets modifiers that other systems
 * read on the next pulse: harmony, tourism, insurance, loan interest, crisis odds, fire spread, fishing, flood
 * damage, ageing, bloom, Flora's price. When a rule comes into force or eases off it writes to the Cause & effect
 * feed (dashboard, Flora's `why`). Measured every 5 pulses; deterministic (`city.rng` only for vandalism).
 */
export interface Measures {
  buildings: number;
  /** Waterfront buildings, and how many of them are natural (parks, mangrove seawalls). */
  coastal: number;
  coastalNatural: number;
  towers: number;
  parks: number;
  turbines: number;
  sanctuary: boolean;
  /** Share of buildings within reach of an Ember Watch station. */
  fireCover: number;
}

export interface ConsequenceRule {
  id: string;
  name: string;
  icon: string;
  /** Cause and effect in a sentence each (the feed and Flora quote them). */
  cause(city: City, m: Measures): string;
  effect: string;
  /** Target intensity 0..1 from the city's state. */
  target(city: City, m: Measures): number;
  /** Writes this rule's effect at intensity `l` (> 0). */
  apply(mods: ConsequenceMods, l: number, city: City): void;
  /** Where to point the camera, if anywhere in particular. */
  at?(city: City): { x: number; z: number } | null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fmt = (n: number) => Math.round(n).toLocaleString();

export const RULES: ConsequenceRule[] = [
  {
    id: 'bare-coast',
    name: 'Bare coast',
    icon: '🌊',
    cause: (_c, m) =>
      `${m.coastal} waterfront buildings and only ${m.coastalNatural} parks or mangrove seawalls along the shore`,
    effect: 'Floods do more damage and the fish lose their nurseries (smaller catch).',
    target: (_c, m) => (m.coastal >= 8 ? clamp01((1 - m.coastalNatural / m.coastal - 0.75) / 0.2) : 0),
    apply(mods, l) {
      mods.flood *= 1 + 0.6 * l;
      mods.fishing *= 1 - 0.25 * l;
    },
  },
  {
    id: 'dirty-coast',
    name: 'Polluted coast',
    icon: '☁',
    cause: (c) =>
      `Coastal pollution at ${Math.round(c.pulse.coastalPollution * 100)}% (factories and runoff near the sea)`,
    effect: 'Algal blooms become likelier, the catch shrinks and beach visitors stay away.',
    target: (c) => clamp01((c.pulse.coastalPollution - 0.2) / 0.3),
    apply(mods, l) {
      mods.crisis['algal-bloom'] = (mods.crisis['algal-bloom'] ?? 1) * (1 + 2 * l);
      mods.fishing *= 1 - 0.3 * l;
    },
  },
  {
    id: 'overfishing',
    name: 'Overfished sea',
    icon: 'food',
    cause: (c) => `Fish stock down to ${Math.round(c.growth.fish * 100)}% (too many boats for the sea)`,
    effect:
      'Fishers earn little and worry: harmony falls until the stock recovers (fewer docks, cleaner coast).',
    target: (c) => clamp01((0.45 - c.growth.fish) / 0.3),
    apply(mods, l) {
      mods.harmony -= 1.5 * l;
    },
  },
  {
    id: 'heat-island',
    name: 'Heat island',
    icon: '☀',
    cause: (_c, m) => `${m.towers} towers and only ${m.parks} parks and gardens to cool them`,
    effect: 'Heatwaves come more often and start more fires; residents swelter (harmony down).',
    target: (_c, m) => (m.towers >= 8 ? clamp01((m.towers / (m.parks + 1) - 1.5) / 3) : 0),
    apply(mods, l) {
      mods.crisis.heatwave = (mods.crisis.heatwave ?? 1) * (1 + l);
      mods.heatFire *= 1 + l;
      mods.harmony -= 2 * l;
    },
  },
  {
    id: 'bird-strikes',
    name: 'Bird strikes',
    icon: '❀',
    cause: (_c, m) =>
      `${m.turbines} wind turbines${m.sanctuary ? ' (a Pollinator Sanctuary softens it)' : ' and no Pollinator Sanctuary'}`,
    effect: 'Birds and pollinators avoid the turbine rows: the bloom thins.',
    target: (_c, m) => clamp01((m.turbines - 20) / 60) * (m.sanctuary ? 0.3 : 1),
    apply(mods, l) {
      mods.bloomLoss += 0.06 * l;
    },
  },
  {
    id: 'neglect',
    name: 'Neglected upkeep',
    icon: '⚒',
    cause: () => 'The treasury is below zero: upkeep is only part paid (austerity)',
    effect: 'Buildings age twice as fast and vandals strike run-down blocks.',
    target: (c) => (c.steward.funding < 1 ? 1 : 0),
    apply(mods, l) {
      mods.ageing *= 1 + l;
    },
  },
  {
    id: 'haze-smoke',
    name: 'Smoke in the haze',
    icon: '🌫',
    cause: () => 'Fireworks smoke during the Haze season',
    effect: 'The still, hot air holds the smoke far longer, and residents notice.',
    target: (c) => (seasonAt(c.tick).season.id === 'haze' && c.fireworks.smog > 0.05 ? 1 : 0),
    apply(mods, l) {
      mods.smogHold = Math.max(mods.smogHold, l);
      mods.harmony -= 0.8 * l;
    },
  },
  {
    id: 'fire-cover',
    name: 'Thin fire cover',
    icon: '🔥',
    cause: (_c, m) =>
      `Only ${Math.round(m.fireCover * 100)}% of buildings are within reach of an Ember Watch station`,
    effect: 'Fires spread further before crews arrive, and the insurance premium rises.',
    target: (_c, m) => (m.buildings >= 30 ? clamp01((0.6 - m.fireCover) / 0.4) : 0),
    apply(mods, l, city) {
      mods.fireSpread *= 1 + l;
      mods.insurance += city.stats.upkeep * 0.12 * l;
    },
  },
  {
    id: 'harmony-streak',
    name: 'A city people love',
    icon: '☺',
    cause: (c) => `Harmony 70+ for ${(c.consequences.harmonyStreak / DAY_LENGTH).toFixed(1)} days`,
    effect: 'Word spreads: visitors come (tourism income), and Flora works at a discount.',
    target: (c) => clamp01((c.consequences.harmonyStreak - DAY_LENGTH) / DAY_LENGTH),
    apply(mods, l) {
      mods.harmony += 1 * l;
      mods.floraDiscount = Math.max(mods.floraDiscount, 0.25 * l);
    },
  },
  {
    id: 'long-debt',
    name: 'Falling credit rating',
    icon: '◈',
    cause: (c) =>
      `In debt long enough that the credit rating fell to ${Math.round(c.consequences.credit * 100)}%`,
    effect: 'New loans cost more, and residents lose faith (harmony down; some leave).',
    target: (c) => clamp01((0.6 - c.consequences.credit) / 0.4),
    apply(mods, l, city) {
      mods.interest += 0.03 * (1 - city.consequences.credit);
      mods.harmony -= 4 * l;
    },
  },
  {
    id: 'transit-city',
    name: 'A transit city',
    icon: '⇶',
    cause: (c) =>
      `${Math.round((c.pulse.podRiders / Math.max(1, c.pulse.commuters)) * 100)}% of ${fmt(c.pulse.commuters)} commuters fly or ride`,
    effect: 'Quieter streets near stations: land is worth more and residents are happier.',
    target: (c) =>
      c.pulse.commuters > 200 ? clamp01((c.pulse.podRiders / c.pulse.commuters - 0.35) / 0.3) : 0,
    apply(mods, l) {
      mods.harmony += 1.5 * l;
    },
  },
];

export const getRule = (id: string) => RULES.find((r) => r.id === id);

/** The city measurements the rules read (one pass over the buildings). */
export function measure(city: City): Measures {
  const ents = city.buildingEntities();
  const stations: { x: number; z: number; r: number }[] = [];
  const m: Measures = {
    buildings: ents.length,
    coastal: 0,
    coastalNatural: 0,
    towers: 0,
    parks: 0,
    turbines: 0,
    sanctuary: false,
    fireCover: 1,
  };
  for (const e of ents) {
    const def = city.buildingDef(e);
    if (def.tower) m.towers++;
    if (def.category === 'nature') m.parks++;
    if (def.id === 'wind-turbine') m.turbines++;
    if (def.id === 'pollinator-sanctuary') m.sanctuary = true;
    const [x, z, w, d] = [Building.x[e]!, Building.z[e]!, Building.w[e]!, Building.d[e]!];
    if (def.response) stations.push({ x: x + w / 2, z: z + d / 2, r: def.response.radius });
    // Waterfront: sea within a tile of the footprint (corners and mid-edges are enough).
    const probe: [number, number][] = [
      [x - 1, z - 1],
      [x + w, z - 1],
      [x - 1, z + d],
      [x + w, z + d],
      [x + (w >> 1), z - 1],
      [x + (w >> 1), z + d],
      [x - 1, z + (d >> 1)],
      [x + w, z + (d >> 1)],
    ];
    if (probe.some(([px, pz]) => city.isWaterTile(px, pz))) {
      m.coastal++;
      if (def.category === 'nature' || def.defence) m.coastalNatural++;
    }
  }
  if (ents.length) {
    let covered = 0;
    for (const e of ents) {
      const cx = Building.x[e]! + Building.w[e]! / 2;
      const cz = Building.z[e]! + Building.d[e]! / 2;
      if (stations.some((s) => (s.x - cx) ** 2 + (s.z - cz) ** 2 <= s.r * s.r)) covered++;
    }
    m.fireCover = covered / ents.length;
  }
  return m;
}

const EVERY = 5;
/** Intensity ramps per second toward the target: in over ~50 s, out over ~100 s. */
const UP = 0.02;
const DOWN = 0.01;
const FEED_CAP = 40;

function log(city: City, rule: ConsequenceRule, kind: FeedEntry['kind'], text: string): void {
  const st = city.consequences;
  const at = rule.at?.(city) ?? null;
  st.feed.push({
    id: st.nextFeedId++,
    rule: rule.id,
    tick: city.tick,
    day: city.day,
    kind,
    text,
    ...(at ?? {}),
  });
  if (st.feed.length > FEED_CAP) st.feed.shift();
  city.bus.emit('consequence', { rule: rule.id, kind, text });
}

/**
 * Once per pulse, at the end: stocks move (credit rating, reputation, harmony streak), rules are re-measured every
 * 5 pulses and their intensities ramp, and this pulse's modifiers are rebuilt (read by the next pulse).
 */
export function updateConsequences(city: City): void {
  const st = city.consequences;
  const s = city.stats;
  // Stocks.
  const inDebt = city.credits < 0 || city.steward.loans.length > 0;
  st.credit = clamp01(st.credit + (inDebt ? -0.25 : 0.1) / DAY_LENGTH);
  st.harmonyStreak = s.happiness >= 70 ? st.harmonyStreak + 1 : 0;
  const crisis = city.steward.crises.some((c) => c.phase === 'active');
  const dirty = st.rules['dirty-coast']?.level ?? 0;
  st.reputation = clamp01(
    st.reputation +
      ((s.happiness >= 70 ? 0.4 : s.happiness < 45 ? -0.4 : 0) - (crisis ? 0.5 : 0) - dirty * 0.6) /
        DAY_LENGTH,
  );

  if (city.pulse.count % EVERY === 0) {
    const m = measure(city);
    for (const r of RULES) {
      const target = r.target(city, m);
      const rs = (st.rules[r.id] ??= { level: 0, since: city.tick });
      const was = rs.level;
      rs.level =
        target > rs.level
          ? Math.min(target, rs.level + UP * EVERY)
          : Math.max(target, rs.level - DOWN * EVERY);
      if (was < 0.25 && rs.level >= 0.25) {
        rs.since = city.tick;
        log(city, r, 'start', `${r.name}: ${r.cause(city, m)}. ${r.effect}`);
      } else if (was >= 0.1 && rs.level < 0.1) log(city, r, 'end', `${r.name} eased off.`);
    }
    // Vandals in neglected blocks: a run-down building takes a knock now and then.
    const neglect = st.rules['neglect']?.level ?? 0;
    if (neglect > 0.5 && city.rng.next() < 0.3 * neglect) {
      const ents = city.buildingEntities().filter((e) => Service.condition[e]! < 0.7);
      if (ents.length) {
        const e = ents[Math.floor(city.rng.next() * ents.length)]!;
        Service.condition[e] = Math.max(0, Service.condition[e]! - 0.15);
      }
    }
  }

  // Modifiers for the next pulse.
  const mods = neutralMods();
  for (const r of RULES) {
    const l = st.rules[r.id]?.level ?? 0;
    if (l > 0.01) r.apply(mods, l, city);
  }
  mods.tourism = Math.max(0, s.income * 0.2 * (st.reputation - 0.3));
  st.mods = mods;
  city.credits += mods.tourism - mods.insurance;
  st.tourismIncome += mods.tourism;
  st.insurancePaid += mods.insurance;
  s.tourism = mods.tourism;
  s.insurance = mods.insurance;
}

/**
 * Rules in force that bear on one building (D-074 chain explainers): coastal rules on the waterfront, the heat
 * island on towers, neglect and debt everywhere. Each as "Rule: effect" with the day it came into force.
 */
export function rulesFor(city: City, eid: number): string[] {
  const def = city.buildingDef(eid);
  const [x, z, w, d] = [Building.x[eid]!, Building.z[eid]!, Building.w[eid]!, Building.d[eid]!];
  const coast = [
    [x - 1, z - 1],
    [x + w, z + d],
    [x + (w >> 1), z - 1],
    [x + (w >> 1), z + d],
    [x - 1, z + (d >> 1)],
    [x + w, z + (d >> 1)],
  ].some(([px, pz]) => city.isWaterTile(px!, pz!));
  const out: string[] = [];
  for (const { rule, since } of activeRules(city)) {
    const applies =
      rule.id === 'neglect' ||
      rule.id === 'long-debt' ||
      rule.id === 'harmony-streak' ||
      rule.id === 'transit-city'
        ? true
        : rule.id === 'bare-coast' || rule.id === 'dirty-coast' || rule.id === 'overfishing'
          ? coast || !!def.fishing
          : rule.id === 'heat-island'
            ? !!def.tower
            : rule.id === 'fire-cover'
              ? true
              : false;
    if (applies)
      out.push(`${rule.name} (since day ${1 + Math.floor(since / 10 / DAY_LENGTH)}): ${rule.effect}`);
  }
  return out;
}

/** Rules in force now, strongest first (for the dashboard and Flora). */
export function activeRules(city: City): { rule: ConsequenceRule; level: number; since: number }[] {
  return RULES.map((rule) => ({ rule, ...(city.consequences.rules[rule.id] ?? { level: 0, since: 0 }) }))
    .filter((r) => r.level >= 0.1)
    .sort((a, b) => b.level - a.level);
}
