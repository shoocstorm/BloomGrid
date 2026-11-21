import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { forecastCrisis, getCrisis } from '@/sim/crises';
import { risksBuilding } from '@/sim/consequences';
import { comingUp } from '@/sim/forecast';
import { CALM_MAX, CHAIN_GAP, MIN_GAP, PACE, directing, directorReport, queueCrisis } from '@/sim/director';
import { slopeSites } from '@/sim/slopes';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import type { CrisisInstance } from '@/sim/stewardState';
import { makeSim } from './helpers';

function founded(seed = 20261024) {
  const s = makeSim(seed);
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
/** Keeps the city deep in debt with a ruined credit rating: long debt boils over into a strike. */
const inDebt = (s: ReturnType<typeof makeSim>) => () => {
  s.city.credits = Math.min(s.city.credits, -500);
  s.city.consequences.credit = 0.05;
};

describe('the director (plan v5, Phase 27)', () => {
  // Long sim runs: ~7 s alone, past 30 s under the full parallel suite.
  it('pulls a calm city up: pace rises, drift builds and lifts demand; dials stay in bounds', () => {
    const s = founded();
    s.city.steward.autoDirector = true;
    expect(directing(s.city)).toBe(true);
    const used0 = s.city.stats.energyUsed;
    pulses(s, 600);
    const d = s.city.steward.director;
    expect(directorReport(s.city).mood).toBe('calm');
    expect(d.pace).toBeGreaterThan(1.5);
    expect(d.pace).toBeLessThanOrEqual(PACE[1]);
    expect(d.calm).toBe(1);
    expect(d.drift).toBeGreaterThan(0.1);
    expect(s.city.steward.modifiers.energyDemand).toBeGreaterThan(1.05);
    expect(s.city.stats.energyUsed).toBeGreaterThan(used0);
  }, 90_000);

  it('eases off a spiralling city: pace falls, the calm gap stretches, drift clears', () => {
    const s = founded();
    s.city.steward.autoDirector = true;
    s.city.steward.director.drift = 0.5;
    pulses(s, 300, () => (s.city.credits = -9000));
    const d = s.city.steward.director;
    expect(directorReport(s.city).mood).toBe('spiralling');
    expect(d.pace).toBeLessThan(1);
    expect(d.pace).toBeGreaterThanOrEqual(PACE[0]);
    expect(d.calm).toBeGreaterThan(1.5);
    expect(d.calm).toBeLessThanOrEqual(CALM_MAX);
    expect(d.drift).toBe(0);
  });

  it('stays out of Sandbox and out of tests: neutral dials, no drift', () => {
    const s = founded();
    pulses(s, 100);
    expect(s.city.steward.director.pace).toBe(1);
    s.city.steward.autoDirector = true;
    s.city.steward.difficulty = 'sandbox';
    expect(directing(s.city)).toBe(false);
    pulses(s, 100);
    expect(s.city.steward.director).toMatchObject({ pace: 1, calm: 1, drift: 0 });
  });

  it('long debt boils over into a strike, forecast after the calm gap with its cause; deterministic', () => {
    const run = () => {
      const s = founded();
      s.city.steward.autoCrises = true;
      const forecasts: CrisisInstance[] = [];
      s.bus.on('crisis:forecast', ({ crisis }) => forecasts.push(crisis));
      let risk = false;
      pulses(s, 120, () => {
        inDebt(s)();
        if (risksBuilding(s.city).some((r) => r.crisis === 'strike')) risk = true;
      });
      expect(risk).toBe(true);
      expect(s.city.consequences.rules['long-debt']!.fired).toBe(true);
      expect(s.city.consequences.feed.some((f) => f.kind === 'escalate' && f.rule === 'long-debt')).toBe(true);
      const strike = forecasts.find((c) => c.def === 'strike');
      expect(strike?.cause).toBe('Falling credit rating');
      return s.city.hash();
    };
    expect(run()).toBe(run());
  });

  it('a strike walks workers out (half as hard out of debt), and the escalation re-arms only after the cause eases', () => {
    const s = founded();
    const c = forecastCrisis(s.city, 'strike', 1, 0);
    pulses(s, 20, () => (s.city.credits = -100));
    expect(c.phase).toBe('active');
    expect(s.city.steward.modifiers.staffing).toBeLessThan(0.75);
    // Out of debt, it does half the harm.
    s.city.credits = 1000;
    pulses(s, 1);
    expect(s.city.steward.modifiers.staffing).toBeGreaterThan(0.8);
    s.city.consequences.rules['long-debt'] = { level: 0.7, since: 0, fired: true };
    pulses(s, 5);
    expect(s.city.consequences.rules['long-debt']!.fired).toBe(true);
    s.city.consequences.rules['long-debt'] = { level: 0.2, since: 0, fired: true };
    pulses(s, 5);
    expect(s.city.consequences.rules['long-debt']!.fired).toBe(false);
  });

  it('a landslide strikes the barest steep slope and damages what stands there', () => {
    const s = founded();
    const site = slopeSites(s.city)[0];
    expect(site).toBeDefined();
    const c = forecastCrisis(s.city, 'landslide', 1, 0);
    pulses(s, 2);
    expect(c.x).toBeCloseTo(site!.x, 5);
    expect(c.hits ?? 0).toBeGreaterThan(0);
    expect(c.cost ?? 0).toBeGreaterThan(0);
  });

  it('chains: a heatwave can bring a fire close behind (CHAIN_GAP, not MIN_GAP)', () => {
    const s = founded();
    s.city.steward.autoCrises = true;
    const link = getCrisis('heatwave').followUps![0]!;
    const chance = link.chance;
    link.chance = 1;
    try {
      const forecasts: { def: string; tick: number; cause?: string }[] = [];
      s.bus.on('crisis:forecast', ({ crisis }) => forecasts.push({ def: crisis.def, tick: s.city.tick, cause: crisis.cause }));
      const heat = forecastCrisis(s.city, 'heatwave', 1, 0);
      pulses(s, Math.ceil((heat.endTick - heat.startTick) / PULSE_TICKS) + CHAIN_GAP + 10);
      const fire = forecasts.find((f) => f.def === 'industrial-fire');
      expect(fire?.cause).toContain('Heatwave');
      expect((fire!.tick - heat.endTick) / PULSE_TICKS).toBeLessThan(MIN_GAP);
    } finally {
      link.chance = chance;
    }
  });

  it('never two crises at once from the scheduler, a calm gap of MIN_GAP or more between them', () => {
    const s = founded();
    s.city.steward.autoCrises = true;
    s.city.steward.autoDirector = true;
    s.city.steward.difficulty = 'hard';
    let n = 0;
    s.bus.on('crisis:forecast', ({ crisis }) => {
      // Chain links (cause "<Crisis>: …") and quake tsunamis follow close behind by design.
      if (crisis.cause?.includes(':') || crisis.def === 'tsunami') return;
      n++;
      expect(s.city.steward.crises.length).toBe(1);
      expect((s.city.tick - s.city.steward.lastCrisisEndTick) / PULSE_TICKS).toBeGreaterThanOrEqual(MIN_GAP);
    });
    let strained = false;
    pulses(s, 1500, () => {
      if (Object.values(s.city.pulse.tiers).some((t) => t >= 2)) strained = true;
    });
    expect(n).toBeGreaterThan(0);
    // The showcase no longer runs itself.
    expect(strained).toBe(true);
  }, 120_000);

  it('the queue holds one entry per crisis, a few at most, chains first; Coming up shows what is brewing', () => {
    const s = founded();
    const q = (crisis: string, kind: 'chain' | 'escalation') =>
      queueCrisis(s.city, { crisis, gap: MIN_GAP, severity: 1, cause: 'Test', kind });
    expect(q('heatwave', 'escalation')).toBe(true);
    expect(q('heatwave', 'escalation')).toBe(false);
    expect(q('strike', 'escalation')).toBe(true);
    expect(q('landslide', 'chain')).toBe(true);
    expect(s.city.steward.director.queue[0]!.crisis).toBe('landslide');
    expect(q('algal-bloom', 'escalation')).toBe(true); // displaces the chain link
    expect(s.city.steward.director.queue.map((x) => x.crisis)).toEqual(['heatwave', 'strike', 'algal-bloom']);
    expect(comingUp(s.city, 8).some((c) => c.title === 'Heatwave brewing')).toBe(true);
  });

  it('saves and restores the director (v22), and migrates v21 saves', () => {
    const s = founded();
    s.city.steward.autoDirector = true;
    pulses(s, 50);
    queueCrisis(s.city, { crisis: 'strike', gap: MIN_GAP, severity: 1, cause: 'Falling credit rating', kind: 'escalation' });
    const data = serializeCity(s.city);
    expect(data.version).toBe(SAVE_VERSION);
    const copy = new City(new EventBus(), 1);
    deserializeCity(copy, structuredClone(data));
    expect(copy.hash()).toBe(s.city.hash());
    expect(copy.steward.director.queue[0]!.crisis).toBe('strike');

    const v21 = structuredClone(data) as unknown as { version: number; steward: Record<string, unknown> };
    v21.version = 21;
    delete v21.steward.autoDirector;
    delete v21.steward.director;
    const m = migrateSave(v21 as unknown as SaveData);
    expect(m.steward.autoDirector).toBe(true);
    expect(m.steward.director).toMatchObject({ pace: 1, calm: 1, drift: 0, queue: [] });
  });
});
