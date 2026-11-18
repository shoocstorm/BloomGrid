import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { CHARTERS, MAX_ACTIVE, charterBlock, claimable, hasPerk, perks, tierCount, titles } from '@/sim/charters';
import { ERAS, eraOf, nextEra, policySlots } from '@/sim/eras';
import { objectiveViews, HOLD_LOSE, HOLD_WIN } from '@/sim/objectives';
import { policyBlock } from '@/sim/policies';
import { stewardLegacy } from '@/sim/legacy';
import { startHappening } from '@/sim/happenings';
import { forecastCrisis } from '@/sim/crises';
import { DAY_LENGTH, PULSE_TICKS } from '@/sim/pulseConst';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { makeSim } from './helpers';

function founded() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(100);
  return s;
}
const pulses = (s: ReturnType<typeof makeSim>, n: number, f?: () => void) => {
  for (let i = 0; i < n; i++) {
    f?.();
    s.step(PULSE_TICKS);
  }
};

describe('charters (plan v5, Phase 28)', () => {
  it('are data: three rising tiers each, Bronze pays, Silver a perk, Gold a perk and a title', () => {
    expect(CHARTERS.length).toBeGreaterThanOrEqual(7);
    for (const c of CHARTERS) {
      const [b, s, g] = c.tiers;
      expect(b.need, c.id).toBeLessThan(s.need);
      expect(s.need, c.id).toBeLessThan(g.need);
      expect(b.reward, c.id).toBeGreaterThan(0);
      expect(s.perk, c.id).toBeDefined();
      expect(g.perk && g.title, c.id).toBeTruthy();
    }
  });

  it('take up to three at a time; only active ones progress; dropping resets the measure; undoable', () => {
    const s = founded();
    for (const id of ['carbon-zero', 'debt-free', 'night-bloom']) expect(s.commands.execute('setCharter', { id, on: true })).toBe(true);
    expect(charterBlock(s.city, 'transit-city')).toContain(`${MAX_ACTIVE}`);
    expect(s.commands.execute('setCharter', { id: 'transit-city', on: true })).toBe(false);
    pulses(s, 30);
    expect(s.city.charters.acc['carbon-zero']).toBe(30); // the showcase runs on clean power
    expect(s.city.charters.acc['transit-city']).toBeUndefined();
    s.commands.execute('setCharter', { id: 'carbon-zero', on: false });
    expect(s.city.charters.acc['carbon-zero']).toBeUndefined();
    s.commands.undo();
    expect(s.city.charters.active).toContain('carbon-zero');
    expect(s.city.charters.acc['carbon-zero']).toBe(30);
  });

  it('a reached tier stays reached when the streak breaks, is claimed by hand for its reward, perk and title', () => {
    const s = founded();
    s.commands.execute('setCharter', { id: 'carbon-zero', on: true });
    s.city.charters.acc['carbon-zero'] = DAY_LENGTH * 7 - 2;
    pulses(s, 3);
    expect(s.city.charters.reached['carbon-zero']).toBe(3);
    expect(claimable(s.city, 'carbon-zero')).toBe(3);
    s.city.charters.acc['carbon-zero'] = 0;
    pulses(s, 1);
    expect(s.city.charters.reached['carbon-zero']).toBe(3);
    const c0 = s.city.credits;
    expect(s.commands.execute('claimCharter', { id: 'carbon-zero' }, false)).toBe(true);
    expect(s.city.credits).toBeCloseTo(c0 + 2000, 0);
    s.commands.execute('claimCharter', { id: 'carbon-zero' }, false);
    expect(hasPerk(s.city, 'clean-air')).toBe(true);
    s.commands.execute('claimCharter', { id: 'carbon-zero' }, false);
    expect(titles(s.city)).toEqual(['Carbon-zero Steward']);
    expect(s.city.charters.active).not.toContain('carbon-zero'); // Gold frees its slot
    expect(s.commands.execute('claimCharter', { id: 'carbon-zero' }, false)).toBe(false);
    // Perks write into the modifiers.
    pulses(s, 2);
    expect(s.city.consequences.mods.energyDemand).toBeLessThan(1);
    expect(perks(s.city).map((p) => p.id)).toEqual(['clean-air', 'efficient-grid']);
  });

  it('Resilient Isle counts crises weathered in a row with no ruins, and its Silver earns the Emergency reserve', () => {
    const s = founded();
    s.commands.execute('setCharter', { id: 'resilient-isle', on: true });
    expect(policyBlock(s.city, 'emergency-reserve', true)).toContain('Resilient Isle');
    for (let i = 0; i < 2; i++) {
      const c = forecastCrisis(s.city, 'king-tide', 0.3, 0);
      pulses(s, Math.ceil((c.endTick - s.city.tick) / PULSE_TICKS) + 2);
    }
    expect(s.city.charters.acc['resilient-isle']).toBe(2);
    expect(s.city.charters.reached['resilient-isle']).toBe(1);
    s.city.charters.reached['resilient-isle'] = 2;
    s.commands.execute('claimCharter', { id: 'resilient-isle' }, false);
    s.commands.execute('claimCharter', { id: 'resilient-isle' }, false);
    expect(policyBlock(s.city, 'emergency-reserve', true)).toBeNull();
    expect(s.commands.execute('setPolicy', { id: 'emergency-reserve', on: true })).toBe(true);
    pulses(s, 2);
    expect(s.city.consequences.mods.damage).toBeCloseTo(0.7, 5);
  });
});

describe('eras', () => {
  it('advance with residents and claimed tiers, never go back, raise the director band; Canopy brings the Expo', () => {
    const s = founded();
    expect(eraOf(s.city).id).toBe('seedling');
    expect(nextEra(s.city)!.needs.find((n) => n.label === 'charter tiers')!.need).toBe(1);
    const events: string[] = [];
    s.bus.on('era:advanced', ({ id }) => events.push(id));
    s.city.charters.claimed = { 'carbon-zero': 3, 'debt-free': 1 };
    pulses(s, 3);
    expect(events).toEqual(['grove', 'canopy']);
    expect(s.city.charters.era).toBe(2);
    s.city.charters.claimed = {};
    pulses(s, 2);
    expect(s.city.charters.era).toBe(2);
    expect(startHappening(s.city, 'expo')?.kind).toBe('expo');
    // The showcase has every ordinance slot; a growing island has the era's.
    expect(policySlots(s.city)).toBe(Infinity);
    s.city.growth.progression = true;
    expect(policySlots(s.city)).toBe(ERAS[2]!.slots);
  });

  it('a Seedling city cannot host the Expo', () => {
    const s = founded();
    expect(startHappening(s.city, 'expo')).toBeNull();
  });

  it('feed a live legacy score', () => {
    const s = founded();
    const before = stewardLegacy(s.city).score;
    s.city.charters.claimed = { 'carbon-zero': 3 };
    s.city.charters.era = 1;
    const l = stewardLegacy(s.city);
    expect(l.score - before).toBe(3 * 300 + 500);
    expect(l.highlights.some((h) => h.includes('Carbon-zero Steward'))).toBe(true);
    expect(tierCount(s.city)).toEqual({ tiers: 3, golds: 1 });
  });
});

describe('challenge scenarios', () => {
  it('Water Crisis starts with the water works cut and is lost when time runs out', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'water-crisis');
    s.step(100);
    expect(s.city.charters.challenge?.status).toBe('playing');
    expect(s.city.pulse.tiers.water).toBeGreaterThanOrEqual(3);
    expect(objectiveViews(s.city)[0]!.left).toBeGreaterThan(1100);
    let lost = '';
    s.bus.on('objective:lost', ({ reason }) => (lost = reason));
    s.city.charters.challenge!.startTick -= 1200 * PULSE_TICKS;
    pulses(s, 2, () => (s.city.credits = Math.max(s.city.credits, 0)));
    expect(s.city.charters.challenge!.status).toBe('lost');
    expect(lost).toContain('Out of time');
  });

  it('a reach-tier goal is won once the system holds the tier', () => {
    const s = makeSim(5);
    applyScenario(s.city, 'fresh-island');
    s.step(200);
    expect(s.city.pulse.tiers.water).toBeLessThanOrEqual(1);
    s.city.charters.challenge = { scenario: 'water-crisis', status: 'playing', startTick: s.city.tick, endTick: 0, held: [0] };
    let won = false;
    s.bus.on('objective:won', () => (won = true));
    pulses(s, HOLD_WIN + 1);
    expect(won).toBe(true);
    expect(s.city.charters.challenge!.status).toBe('won');
  });

  it('Debt Island owes ◈30,000: repaying it wins; a system below Strained for long loses', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'debt-island');
    s.step(50);
    expect(s.city.steward.loans[0]!.remaining).toBeGreaterThan(29000);
    expect(s.city.credits).toBeLessThan(5000);
    // Lose path on a copy.
    const lose = new City(new EventBus(), 1);
    deserializeCity(lose, serializeCity(s.city));
    // Win path: the treasury finds the money and repays.
    s.city.credits = 40000;
    expect(s.commands.execute('repayLoan', { id: s.city.steward.loans[0]!.id })).toBe(true);
    pulses(s, 2);
    expect(s.city.charters.challenge!.status).toBe('won');

    const l = makeSim(20261024);
    applyScenario(l.city, 'debt-island');
    l.step(50);
    pulses(l, HOLD_LOSE + 2, () => (l.city.credits = -9000));
    expect(l.city.charters.challenge!.status).toBe('lost');
  });
});

describe('saves', () => {
  it('round-trips charters, era and the challenge (v23) and migrates v22 saves', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'debt-island');
    s.step(20);
    s.commands.execute('setCharter', { id: 'debt-free', on: true });
    s.city.charters.claimed['night-bloom'] = 1;
    s.city.charters.era = 1;
    pulses(s, 5);
    const data = serializeCity(s.city);
    expect(data.version).toBe(SAVE_VERSION);
    const copy = new City(new EventBus(), 1);
    deserializeCity(copy, structuredClone(data));
    expect(copy.hash()).toBe(s.city.hash());
    expect(copy.charters.challenge?.scenario).toBe('debt-island');

    const v22 = structuredClone(data) as unknown as Record<string, unknown>;
    v22.version = 22;
    delete v22.charters;
    const m = migrateSave(v22 as unknown as SaveData);
    expect(m.charters).toMatchObject({ active: [], era: 0, challenge: null });
  });

  it('is deterministic with charters in play', () => {
    const run = () => {
      const s = founded();
      s.commands.execute('setCharter', { id: 'ten-thousand-voices', on: true });
      s.commands.execute('setCharter', { id: 'transit-city', on: true });
      pulses(s, 120);
      return s.city.hash();
    };
    expect(run()).toBe(run());
  });
});
