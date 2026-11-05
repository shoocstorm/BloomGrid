import { SYSTEMS, type SystemKey, type Tier } from './pulseState';

/**
 * Settled tier changes (D-114). A supply that hovers on a threshold flips its tier every few pulses ("Food fell to
 * Critical", "Food recovered to Strained", again and again). The sim keeps using the raw tier (`pulse.tiers`); the
 * `pulse:tier` alerts (toasts, Flora, the advisor log, sounds, the fix log) report a change only once it holds:
 * a drop for `worse` pulses, a recovery for `better` pulses, and at most once per `cooldown` pulses per system
 * (a fall to Collapse is never held back by the cooldown). Changes during the cooldown merge into one alert.
 * Notification state only: not saved or hashed, rebuilt from the first pulse after a reset or load.
 */
export const TIER_GATE = { worse: 3, better: 8, cooldown: 30 } as const;

export interface TierGate {
  /** The tier last announced (what the alerts believe). */
  shown: Record<SystemKey, Tier>;
  /** Pulses the raw tier has stayed on one side of `shown`. */
  held: Record<SystemKey, number>;
  /** Which side: 1 worse, −1 better, 0 none. */
  side: Record<SystemKey, number>;
  /** Pulses until this system may be announced again. */
  quiet: Record<SystemKey, number>;
}

const per = <T>(v: T) => Object.fromEntries(SYSTEMS.map((k) => [k, v])) as Record<SystemKey, T>;

export function createTierGate(): TierGate {
  return { shown: per<Tier>(1), held: per(0), side: per(0), quiet: per(0) };
}

/** One pulse of raw tiers in; the settled changes to announce out. Before the city is primed it only follows. */
export function stepTierGate(g: TierGate, tiers: Record<SystemKey, Tier>, primed: boolean): { system: SystemKey; tier: Tier; prev: Tier }[] {
  const out: { system: SystemKey; tier: Tier; prev: Tier }[] = [];
  for (const k of SYSTEMS) {
    const raw = tiers[k];
    const shown = g.shown[k];
    if (g.quiet[k] > 0) g.quiet[k]--;
    if (!primed) {
      g.shown[k] = raw;
      continue;
    }
    if (raw === shown) {
      g.held[k] = g.side[k] = 0;
      continue;
    }
    const side = raw > shown ? 1 : -1;
    g.held[k] = g.side[k] === side ? g.held[k] + 1 : 1;
    g.side[k] = side;
    if (g.held[k] < (side > 0 ? TIER_GATE.worse : TIER_GATE.better)) continue;
    if (g.quiet[k] > 0 && !(side > 0 && raw === 4)) continue;
    out.push({ system: k, tier: raw, prev: shown });
    g.shown[k] = raw;
    g.held[k] = g.side[k] = 0;
    g.quiet[k] = TIER_GATE.cooldown;
  }
  return out;
}
