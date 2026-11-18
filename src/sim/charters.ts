import type { CommandStack } from '@/core/Commands';
import type { City } from './City';
import type { ConsequenceMods } from './consequenceState';
import { DAY_LENGTH } from './pulseConst';
import type { SimCtx } from './systems';

/**
 * Civic charters (plan v5, Phase 28): long-term goals for a city past its unlocks, the showcase included. Each charter
 * has three tiers (Bronze, Silver, Gold). The steward takes up to `MAX_ACTIVE` at a time; only active charters make
 * progress, and dropping one resets its running measure (tiers already reached are kept). A reached tier is claimed by
 * hand (`claimCharter`, like milestones): Bronze pays credits, Silver and Gold grant a permanent perk (a modifier, an
 * ordinance) and Gold a steward title. Perks write into the consequence modifiers (`applyCharters`, from
 * `updateConsequences`). Charters are data: append to `CHARTERS`. Deterministic; state in `charterState.ts`.
 */

export const MAX_ACTIVE = 3;
export const TIER_NAMES = ['Bronze', 'Silver', 'Gold'] as const;

export interface Perk {
  id: string;
  name: string;
  /** What it does, in a line. */
  text: string;
  apply?(m: ConsequenceMods): void;
}

export interface CharterTier {
  need: number;
  /** Credits on claiming it. */
  reward: number;
  perk?: Perk;
  /** A steward title (Gold). */
  title?: string;
}

export interface CharterDef {
  id: string;
  name: string;
  icon: string;
  /** The goal, in the player's words. */
  description: string;
  /** How to get there (the card's hint, Flora). */
  lever: string;
  /** How `value` reads: streak days, a count, a percentage or residents. */
  unit: 'days' | 'count' | 'pct' | 'residents';
  tiers: [CharterTier, CharterTier, CharterTier];
  /** Per pulse while active: the new running measure from the old one. */
  step(city: City, acc: number, events: CharterEvents): number;
  /** The measure the tiers compare with (defaults to the running measure). */
  value?(city: City, acc: number): number;
}

/** What happened since the last pulse, for charters that count events. */
export interface CharterEvents {
  /** Crises that ended (fires not counted), and whether each left ruins. */
  crises: { ruined: boolean }[];
  /** Festivals that ran their course, and fireworks shows that finished. */
  festivals: number;
  shows: number;
}

const days = (n: number) => n * DAY_LENGTH;
/** A streak in seconds: grows while `ok`, back to zero when not. */
const streak = (ok: (c: City) => boolean) => (c: City, acc: number) => (ok(c) ? acc + 1 : 0);
/** A share smoothed over about a minute (one bad pulse does not undo it). */
const smooth = (v: (c: City) => number) => (c: City, acc: number) => acc + (v(c) - acc) / 60;

export const CHARTERS: CharterDef[] = [
  {
    id: 'carbon-zero',
    name: 'Carbon-zero',
    icon: 'sun',
    description: 'Run on clean power alone: every unit of energy from sun, wind and water, day after day.',
    lever: 'Retire or switch off any fossil plant; build solar spires and wind turbines for the margin.',
    unit: 'days',
    tiers: [
      { need: days(1), reward: 2000 },
      { need: days(3), reward: 0, perk: { id: 'clean-air', name: 'Clean-air dividend', text: '+1 harmony for good: people breathe easier.', apply: (m) => void (m.harmony += 1) } },
      { need: days(7), reward: 0, title: 'Carbon-zero Steward', perk: { id: 'efficient-grid', name: 'Efficient grid', text: 'The city uses 3% less energy.', apply: (m) => void (m.energyDemand *= 0.97) } },
    ],
    step: streak((c) => c.stats.energyProduced > 0 && c.pulse.cleanShare >= 0.995),
  },
  {
    id: 'ten-thousand-voices',
    name: 'Ten Thousand Voices',
    icon: 'people',
    description: 'Residents who live in districts approving of you at 70 or more.',
    lever: 'Lift district approval: answer petitions, fix each district\'s complaint (City map → Approval).',
    unit: 'residents',
    tiers: [
      { need: 10000, reward: 2500 },
      { need: 25000, reward: 0, perk: { id: 'civic-forum', name: 'Civic forum', text: 'Word of a listening steward spreads: tourism reputation grows faster.', apply: (m) => void (m.reputationDrift += 0.15) } },
      { need: 50000, reward: 0, title: 'Voice of the Isle', perk: { id: 'beloved', name: 'Beloved steward', text: '+1.5 harmony for good.', apply: (m) => void (m.harmony += 1.5) } },
    ],
    step: smooth((c) => {
      let n = 0;
      for (const d of c.approval.view.districts) if ((c.approval.districts[d.key]?.approval ?? 0) >= 70) n += d.residents;
      return n;
    }),
  },
  {
    id: 'resilient-isle',
    name: 'Resilient Isle',
    icon: 'storm',
    description: 'Crises weathered in a row without a single building ruined.',
    lever: 'Prepare in every warning window: Ember Watch cover, seawalls, shelters, spare power and water.',
    unit: 'count',
    tiers: [
      { need: 2, reward: 2000 },
      { need: 5, reward: 0, perk: { id: 'reserve', name: 'Emergency reserve', text: 'Unlocks the Emergency reserve ordinance (crisis damage down, part of tax income held back).' } },
      { need: 10, reward: 0, title: 'Storm Warden', perk: { id: 'hardened', name: 'Hardened city', text: 'Crises and fires do 15% less damage.', apply: (m) => void (m.damage *= 0.85) } },
    ],
    step: (_c, acc, ev) => {
      for (const k of ev.crises) acc = k.ruined ? 0 : acc + 1;
      return acc;
    },
  },
  {
    id: 'ocean-steward',
    name: 'Ocean Steward',
    icon: 'wave',
    description: 'A healthy sea: fish stock at 80%+ and a clean coast, with a fishing fleet working it.',
    lever: 'Fewer boats or a Fishing quota let the stock recover; keep factories back from the shore.',
    unit: 'days',
    tiers: [
      { need: days(0.5), reward: 1500 },
      { need: days(2), reward: 0, perk: { id: 'nursery', name: 'Fish nurseries', text: 'The catch runs 10% larger.', apply: (m) => void (m.fishing *= 1.1) } },
      { need: days(5), reward: 0, title: 'Tide Keeper', perk: { id: 'blue-coast', name: 'Blue coast', text: 'Visitors spend 10% more.', apply: (m) => void (m.tourismMul *= 1.1) } },
    ],
    step: streak((c) => c.growth.fish >= 0.8 && c.pulse.coastalPollution < 0.15 && c.buildingEntities().some((e) => !!c.buildingDef(e).fishing)),
  },
  {
    id: 'transit-city',
    name: 'Transit City',
    icon: 'pod',
    description: 'Commuters who fly the sky-lanes or ride the Aeroline instead of the highways.',
    lever: 'Pod docks within reach of homes and jobs, sky-lane hubs, Free sky-pods; keep the Aeroline running.',
    unit: 'pct',
    tiers: [
      { need: 30, reward: 2000 },
      { need: 45, reward: 0, perk: { id: 'quiet-streets', name: 'Quiet streets', text: 'Highway traffic 5% lower.', apply: (m) => void (m.trafficLoad *= 0.95) } },
      { need: 60, reward: 0, title: 'Skyway Architect', perk: { id: 'sky-city', name: 'Sky city', text: '+1 harmony for good.', apply: (m) => void (m.harmony += 1) } },
    ],
    step: smooth((c) => (c.pulse.commuters > 200 ? (100 * c.pulse.podRiders) / c.pulse.commuters : 0)),
  },
  {
    id: 'night-bloom',
    name: 'Night Bloom',
    icon: 'fireworks',
    description: 'Festivals and fireworks shows the city puts on.',
    lever: 'Keep harmony above 55 for street festivals; build a Fireworks Factory for nightly shows.',
    unit: 'count',
    tiers: [
      { need: 2, reward: 1500 },
      { need: 5, reward: 0, perk: { id: 'lanterns', name: 'Lantern streets', text: 'Night life glows 10% brighter and night visitors spend 5% more.', apply: (m) => ((m.nightGlow *= 1.1), (m.tourismMul *= 1.05)) } },
      { need: 10, reward: 0, title: 'Lantern Keeper', perk: { id: 'festival-isle', name: 'Festival isle', text: 'Visitors spend 10% more.', apply: (m) => void (m.tourismMul *= 1.1) } },
    ],
    step: (_c, acc, ev) => acc + ev.festivals + ev.shows,
  },
  {
    id: 'debt-free',
    name: 'Debt-free Decade',
    icon: 'credits',
    description: 'Days in a row with credits above zero and no loans.',
    lever: 'Repay loans early; keep credit flow positive (tax, upkeep, ordinances).',
    unit: 'days',
    tiers: [
      { need: days(2), reward: 3000 },
      { need: days(5), reward: 0, perk: { id: 'trusted-books', name: 'Trusted books', text: 'Businesses pay 3% more tax.', apply: (m) => void (m.workerTax *= 1.03) } },
      { need: days(10), reward: 0, title: 'Treasurer of the Isle', perk: { id: 'flora-rate', name: "Flora's rate", text: 'Flora works at a 10% discount.', apply: (m) => void (m.floraDiscount = Math.max(m.floraDiscount, 0.1)) } },
    ],
    step: streak((c) => c.credits >= 0 && c.steward.loans.length === 0),
  },
];

const BY_ID = new Map(CHARTERS.map((c) => [c.id, c]));
export const getCharter = (id: string) => BY_ID.get(id);
export const CHARTER_IDS = CHARTERS.map((c) => c.id);

/** The measure the tiers compare with now (0 when not active). */
export function charterValue(city: City, def: CharterDef): number {
  const acc = city.charters.acc[def.id] ?? 0;
  return def.value ? def.value(city, acc) : acc;
}

/** The next tier to reach (0-based), or 3 when Gold is reached. */
export const nextTier = (city: City, id: string): number => city.charters.reached[id] ?? 0;
/** Tiers reached but not claimed. */
export const claimable = (city: City, id: string): number =>
  (city.charters.reached[id] ?? 0) - (city.charters.claimed[id] ?? 0);

/** Readable value in the charter's unit. */
export function fmtValue(def: CharterDef, v: number): string {
  if (def.unit === 'days') return `${(v / DAY_LENGTH).toFixed(v >= days(10) ? 0 : 1)} d`;
  if (def.unit === 'pct') return `${Math.round(v)}%`;
  return Math.floor(v).toLocaleString('en-US');
}

/** Every perk earned (claimed Silver and Gold tiers). */
export function perks(city: City): Perk[] {
  const out: Perk[] = [];
  for (const def of CHARTERS) {
    const n = city.charters.claimed[def.id] ?? 0;
    for (let i = 0; i < n; i++) if (def.tiers[i]!.perk) out.push(def.tiers[i]!.perk!);
  }
  return out;
}
export const hasPerk = (city: City, id: string): boolean => perks(city).some((p) => p.id === id);

/** Titles earned (claimed Gold tiers), first earned first; the steward goes by the last. */
export function titles(city: City): string[] {
  return CHARTERS.filter((d) => (city.charters.claimed[d.id] ?? 0) >= 3).map((d) => d.tiers[2].title!);
}

/** Tiers claimed across all charters, and how many of them are Gold. */
export function tierCount(city: City): { tiers: number; golds: number } {
  let tiers = 0;
  let golds = 0;
  for (const def of CHARTERS) {
    const n = city.charters.claimed[def.id] ?? 0;
    tiers += n;
    if (n >= 3) golds++;
  }
  return { tiers, golds };
}

/** What happened since last pulse (and marks it seen). */
function events(city: City): CharterEvents {
  const s = city.charters.seen;
  const ev: CharterEvents = { crises: [], festivals: 0, shows: 0 };
  for (const r of city.steward.history) {
    if (r.id <= s.incident) continue;
    s.incident = r.id;
    if (r.kind !== 'fire') ev.crises.push({ ruined: r.lost > 0 });
  }
  for (const h of city.happenings.history) {
    if (h.id <= s.happening) continue;
    s.happening = h.id;
    if (h.kind === 'festival' && h.outcome === 'done') ev.festivals++;
  }
  ev.shows = Math.max(0, city.fireworks.shows - s.show);
  s.show = city.fireworks.shows;
  return ev;
}

/** Once per pulse: active charters step their measure and mark the tiers they reach. */
export function updateCharters(city: City): void {
  const st = city.charters;
  const ev = events(city);
  for (const id of st.active) {
    const def = BY_ID.get(id);
    if (!def) continue;
    st.acc[id] = def.step(city, st.acc[id] ?? 0, ev);
    const v = charterValue(city, def);
    let r = st.reached[id] ?? 0;
    while (r < 3 && v >= def.tiers[r]!.need) r++;
    if (r > (st.reached[id] ?? 0)) {
      st.reached[id] = r;
      city.bus.emit('charter:reached', { id, tier: r });
    }
  }
}

/** Perks write into the modifiers (from `updateConsequences`, after the ordinances). */
export function applyCharters(city: City, mods: ConsequenceMods): void {
  for (const p of perks(city)) p.apply?.(mods);
}

/** Why `id` cannot be taken up now, or null. */
export function charterBlock(city: City, id: string): string | null {
  const def = BY_ID.get(id);
  if (!def) return `No charter called ${id}.`;
  const st = city.charters;
  if (st.active.includes(id)) return `${def.name} is already under way.`;
  if ((st.reached[id] ?? 0) >= 3) return `${def.name} is complete (Gold).`;
  if (st.active.length >= MAX_ACTIVE) return `Up to ${MAX_ACTIVE} charters at a time: drop one first.`;
  return null;
}

export function registerCharterCommands(stack: CommandStack<SimCtx>): void {
  // Taking a charter up or dropping it is a choice (undoable); dropping resets its running measure.
  stack.register<{ id: string; on: boolean }, { acc: number | undefined; index: number }>('setCharter', {
    apply({ city }, p) {
      const st = city.charters;
      if (p.on) {
        if (charterBlock(city, p.id)) return null;
        st.active.push(p.id);
        const acc = st.acc[p.id];
        st.acc[p.id] = 0;
        city.bus.emit('charter:changed', { id: p.id, on: true });
        return { acc, index: st.active.length - 1 };
      }
      const index = st.active.indexOf(p.id);
      if (index < 0) return null;
      const acc = st.acc[p.id];
      st.active.splice(index, 1);
      delete st.acc[p.id];
      city.bus.emit('charter:changed', { id: p.id, on: false });
      return { acc, index };
    },
    revert({ city }, p, u) {
      const st = city.charters;
      if (p.on) {
        st.active.splice(st.active.indexOf(p.id), 1);
        if (u.acc === undefined) delete st.acc[p.id];
        else st.acc[p.id] = u.acc;
      } else {
        st.active.splice(u.index, 0, p.id);
        if (u.acc !== undefined) st.acc[p.id] = u.acc;
      }
      city.bus.emit('charter:changed', { id: p.id, on: !p.on });
    },
  });

  // Claiming pays out and grants the perk; like milestones it runs with undoable = false.
  stack.register<{ id: string }, { tier: number; reward: number }>('claimCharter', {
    apply({ city }, p) {
      const def = BY_ID.get(p.id);
      if (!def || claimable(city, p.id) <= 0) return null;
      const st = city.charters;
      const tier = (st.claimed[p.id] ?? 0) + 1;
      st.claimed[p.id] = tier;
      const t = def.tiers[tier - 1]!;
      city.credits += t.reward;
      // A completed charter steps aside, freeing its slot.
      if (tier >= 3) {
        const i = st.active.indexOf(p.id);
        if (i >= 0) st.active.splice(i, 1);
        delete st.acc[p.id];
      }
      city.bus.emit('charter:claimed', { id: p.id, tier, reward: t.reward, title: t.title ?? null, perk: t.perk?.name ?? null });
      return { tier, reward: t.reward };
    },
    revert({ city }, p, u) {
      city.charters.claimed[p.id] = u.tier - 1;
      city.credits -= u.reward;
    },
  });
}

export function charterHash(city: City): string {
  const st = city.charters;
  const rec = (r: Record<string, number>) =>
    Object.keys(r)
      .sort()
      .map((k) => `${k}:${r[k]!.toFixed(2)}`)
      .join(',');
  return `${st.active.join(',')}|${rec(st.reached)}|${rec(st.claimed)}|${rec(st.acc)}|${st.era}@${st.eraTick}|${st.challenge ? `${st.challenge.status}:${st.challenge.held.join(',')}` : ''}`;
}
