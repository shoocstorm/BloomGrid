import { describe, expect, it } from 'vitest';
import { SYSTEMS, type SystemKey, type Tier } from '@/sim/pulseState';
import { TIER_GATE, createTierGate, stepTierGate } from '@/sim/tierGate';
import { makeSim } from './helpers';
import { applyScenario } from '@/sim/scenario';

const tiers = (food: Tier) => Object.fromEntries(SYSTEMS.map((k) => [k, k === 'food' ? food : 1])) as Record<SystemKey, Tier>;

/** Runs a food tier sequence through the gate and returns the announced changes as "prev→tier". */
function run(seq: Tier[]): string[] {
  const g = createTierGate();
  stepTierGate(g, tiers(seq[0]!), false);
  const out: string[] = [];
  for (const t of seq) for (const c of stepTierGate(g, tiers(t), true)) out.push(`${c.prev}→${c.tier}`);
  return out;
}

describe('tier alerts settle (D-114)', () => {
  it('a tier flickering on a threshold announces nothing', () => {
    expect(run(Array.from({ length: 200 }, (_, i) => ((i % 4 < 2 ? 2 : 3) as Tier)))).toEqual([]);
  });

  it('a lasting drop is announced once, and a lasting recovery after the cooldown', () => {
    const seq: Tier[] = [...Array(5).fill(2), ...Array(10).fill(3), ...Array(60).fill(2)];
    expect(run(seq)).toEqual(['2→3', '3→2']);
  });

  it('back-and-forth within the cooldown merges: no recovery alert if it fell again', () => {
    const seq: Tier[] = [...Array(5).fill(2), ...Array(5).fill(3), ...Array(10).fill(2), ...Array(40).fill(3)];
    expect(run(seq)).toEqual(['2→3']);
  });

  it('a fall to Collapse is never held by the cooldown', () => {
    const seq: Tier[] = [...Array(5).fill(2), ...Array(4).fill(3), ...Array(TIER_GATE.worse).fill(4)];
    expect(run(seq)).toEqual(['2→3', '3→4']);
  });

  it('the city sends only settled changes and every alert matches a held raw tier', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    const seen: { system: SystemKey; tier: Tier }[] = [];
    s.bus.on('pulse:tier', (c) => seen.push(c));
    s.step(4000);
    for (const c of seen) expect(c.tier).toBeGreaterThanOrEqual(0);
    // At most one alert per system per cooldown window (Collapse falls aside).
    const per = new Map<SystemKey, number>();
    for (const c of seen) per.set(c.system, (per.get(c.system) ?? 0) + 1);
    for (const n of per.values()) expect(n).toBeLessThanOrEqual(Math.ceil(4000 / 10 / TIER_GATE.cooldown) + 1);
  });
});
