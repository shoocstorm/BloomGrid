import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { DAY_LENGTH, PULSE_TICKS } from '@/sim/pulseConst';
import { SEASON_TICKS, SEASONS } from '@/sim/seasons';
import { RULES, getRule, measure, type Measures } from '@/sim/consequences';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { makeSim } from './helpers';

const base: Measures = {
  buildings: 100,
  coastal: 20,
  coastalNatural: 10,
  towers: 5,
  parks: 20,
  turbines: 0,
  sanctuary: false,
  fireCover: 1,
};

/** Each rule: put its cause on, then off, on a fresh city; the target follows. */
const CASES: Record<string, { on: (c: City, m: Measures) => void; off: (c: City, m: Measures) => void }> = {
  'bare-coast': {
    on: (_c, m) => ((m.coastal = 30), (m.coastalNatural = 0)),
    off: (_c, m) => ((m.coastal = 30), (m.coastalNatural = 15)),
  },
  'dirty-coast': {
    on: (c) => (c.pulse.coastalPollution = 0.5),
    off: (c) => (c.pulse.coastalPollution = 0.05),
  },
  overfishing: { on: (c) => (c.growth.fish = 0.1), off: (c) => (c.growth.fish = 0.9) },
  'heat-island': {
    on: (_c, m) => ((m.towers = 30), (m.parks = 2)),
    off: (_c, m) => ((m.towers = 30), (m.parks = 40)),
  },
  'bird-strikes': { on: (_c, m) => (m.turbines = 90), off: (_c, m) => (m.turbines = 10) },
  neglect: { on: (c) => (c.steward.funding = 0.4), off: (c) => (c.steward.funding = 1) },
  'haze-smoke': {
    on: (c) => (
      (c.tick = SEASON_TICKS * SEASONS.findIndex((s) => s.id === 'haze') + 10),
      (c.fireworks.smog = 0.4)
    ),
    off: (c) => (c.fireworks.smog = 0),
  },
  'fire-cover': { on: (_c, m) => (m.fireCover = 0.1), off: (_c, m) => (m.fireCover = 0.9) },
  'harmony-streak': {
    on: (c) => (c.consequences.harmonyStreak = DAY_LENGTH * 2.5),
    off: (c) => (c.consequences.harmonyStreak = 0),
  },
  'long-debt': { on: (c) => (c.consequences.credit = 0.1), off: (c) => (c.consequences.credit = 1) },
  'transit-city': {
    on: (c) => ((c.pulse.commuters = 1000), (c.pulse.podRiders = 700)),
    off: (c) => ((c.pulse.commuters = 1000), (c.pulse.podRiders = 100)),
  },
};

describe('logic and consequences (Phase 20, D-074)', () => {
  it('has at least ten rules, each driven by its cause (on: strong; off: none)', () => {
    expect(RULES.length).toBeGreaterThanOrEqual(10);
    for (const r of RULES) {
      const c = CASES[r.id];
      expect(c, r.id).toBeDefined();
      const city = new City(new EventBus(), 1);
      const m = { ...base };
      c!.on(city, m);
      expect(r.target(city, m), `${r.id} on`).toBeGreaterThan(0.5);
      c!.off(city, m);
      expect(r.target(city, m), `${r.id} off`).toBe(0);
    }
  });

  it('ramps a rule in, logs it, tilts the odds and the catch; eases it off and logs that too', () => {
    const s = makeSim(1);
    applyScenario(s.city, 'fresh-island');
    const pulses = (n: number, f?: () => void) => {
      for (let i = 0; i < n; i++) {
        f?.();
        s.step(PULSE_TICKS);
      }
    };
    pulses(60, () => (s.city.pulse.coastalPollution = 0.5));
    const st = s.city.consequences;
    expect(st.rules['dirty-coast']!.level).toBeGreaterThan(0.5);
    expect(st.mods.crisis['algal-bloom']).toBeGreaterThan(1.5);
    expect(st.mods.fishing).toBeLessThan(0.9);
    expect(st.feed.some((f) => f.rule === 'dirty-coast' && f.kind === 'start')).toBe(true);
    pulses(150, () => (s.city.pulse.coastalPollution = 0));
    expect(st.rules['dirty-coast']!.level).toBeLessThan(0.1);
    expect(st.feed.at(-1)).toMatchObject({ rule: 'dirty-coast', kind: 'end' });
  });

  it('debt drags the credit rating down, and a poor rating makes loans dearer', () => {
    const borrow = (credit: number) => {
      const s = makeSim(1);
      applyScenario(s.city, 'fresh-island');
      s.city.consequences.credit = credit;
      s.step(PULSE_TICKS * 5);
      s.commands.execute('takeLoan', { amount: 1000 });
      return s.city.steward.loans[0]!.remaining;
    };
    expect(borrow(0.1)).toBeGreaterThan(borrow(1));
    const s = makeSim(1);
    applyScenario(s.city, 'fresh-island');
    s.commands.execute('takeLoan', { amount: 1000 });
    s.step(PULSE_TICKS * 120);
    expect(s.city.consequences.credit).toBeLessThan(1);
  });

  it('measures the founding city; saves rules, stocks and feed; v12 saves start clean', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    const m = measure(s.city);
    expect(m.coastal).toBeGreaterThan(10);
    expect(m.fireCover).toBeGreaterThan(0.3);
    s.step(PULSE_TICKS * 30);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    expect(data.version).toBe(SAVE_VERSION);
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.hash()).toBe(s.city.hash());
    const v12 = structuredClone(data) as unknown as Record<string, unknown>;
    v12.version = 12;
    delete v12.consequences;
    expect(migrateSave(v12 as unknown as SaveData).consequences.credit).toBe(1);
    expect(getRule('neglect')).toBeDefined();
  });
});
