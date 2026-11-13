import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { PULSE_TICKS } from '@/sim/pulseConst';
import {
  comingUp,
  crossing,
  fitTrend,
  forecastCity,
  forecastFor,
  HORIZON,
  MIN_SAMPLES,
  warnings,
} from '@/sim/forecast';
import { evaluateAdvisor } from '@/sim/advisor';
import { proposeBuilds } from '@/sim/proposals';
import { SEASON_TICKS } from '@/sim/seasons';
import { plainIntent } from '@/ai/agent';
import { foresightTools } from '@/sim/insightTools';
import { makeSim } from './helpers';

const ramp = (n: number, start: number, step: number) =>
  Array.from({ length: n }, (_, i) => start + step * i);

describe('trend fit (plan v5, Phase 24)', () => {
  it('reads a clean ramp exactly and confidently', () => {
    const f = fitTrend(ramp(20, 100, -2));
    expect(f.slope).toBeCloseTo(-2, 6);
    expect(f.confidence).toBeGreaterThan(0.95);
  });

  it('shrugs off a single spike (Theil–Sen)', () => {
    const v = ramp(20, 100, 1);
    v[10] = 5000;
    expect(fitTrend(v).slope).toBeCloseTo(1, 6);
  });

  it('a flat series is a confident zero', () => {
    const f = fitTrend(ramp(20, 50, 0));
    expect(f.slope).toBe(0);
    expect(f.confidence).toBeGreaterThan(0.9);
  });

  it('noise round a flat line has low confidence', () => {
    // Deterministic pseudo-noise.
    const v = Array.from({ length: 30 }, (_, i) => 100 + ((Math.sin(i * 12.9898) * 43758.5453) % 10));
    expect(fitTrend(v).confidence).toBeLessThan(0.5);
  });

  it('few samples cap the confidence', () => {
    expect(fitTrend(ramp(MIN_SAMPLES, 0, 1)).confidence).toBeLessThan(
      fitTrend(ramp(MIN_SAMPLES * 3, 0, 1)).confidence,
    );
  });
});

describe('threshold crossing', () => {
  it('falling line: time to reach the threshold', () => {
    expect(crossing(100, -1, 40, 600)).toBeCloseTo(60);
  });
  it('rising or flat lines never cross; already below is now', () => {
    expect(crossing(100, 0.5, 40, 600)).toBeNull();
    expect(crossing(100, 0, 40, 600)).toBeNull();
    expect(crossing(10, 1, 40, 600)).toBe(0);
  });
  it('beyond the horizon is not reported', () => {
    expect(crossing(100, -0.01, 40, 600)).toBeNull();
  });
  it('a season step inside the horizon can decide it', () => {
    // Flat trend, but the next season takes 80 away at t = 200.
    expect(crossing(100, 0, 40, 600, -80, 200)).toBe(200);
    // After the step the trend finishes the job: 20 above at t = 100, then −0.1/s → 200 s more.
    expect(crossing(100, -0.1, 0, 600, -70, 100)).toBeCloseTo(300);
    // A step after the horizon is ignored.
    expect(crossing(100, 0, 40, 600, -80, 700)).toBeNull();
  });
});

describe('city forecasts', () => {
  const founded = (seed = 20261024) => {
    const s = makeSim(seed);
    applyScenario(s.city, 'founding-city');
    s.step(120 * PULSE_TICKS);
    return s;
  };

  it('cover every metric, deterministically', () => {
    const run = () => {
      const s = founded();
      return JSON.stringify(forecastCity(s.city));
    };
    const a = run();
    expect(a).toEqual(run());
    expect(JSON.parse(a)).toHaveLength(6);
  });

  it('a forced energy decline is forecast, advised and planned for the projected gap', () => {
    const s = founded();
    const h = s.city.pulse.history.energyBalance;
    // Generation comfortably ahead, but sliding fast: 400 a sample (≈2400/min).
    const used = s.city.stats.energyUsed;
    h.length = 0;
    h.push(...ramp(20, used * 0.6, -used * 0.02));
    s.city.stats.energyProduced = used + h[h.length - 1]!;
    s.city.pulse.count++; // a new pulse: fresh forecast
    s.city.pulse.tiers.energy = 1;
    const f = forecastFor(s.city, 'energy');
    expect(f.eta).not.toBeNull();
    expect(f.eta!).toBeLessThanOrEqual(HORIZON);
    expect(f.level).toBe('short');
    expect(f.perMin).toBeLessThan(0);
    expect(warnings(s.city)[0]?.metric).toBe('energy');
    const adv = evaluateAdvisor(s.city).find((a) => a.id === 'forecast-energy');
    expect(adv).toBeTruthy();
    expect(adv!.build).toBe('solar-spire');
    const plans = proposeBuilds(s.city, { focus: 'energy', limit: 3 }).filter(
      (p) => p.key === 'forecast-energy',
    );
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0]!.gain).toMatch(/forecast/);
    expect(comingUp(s.city).some((c) => c.kind === 'forecast' && c.metric === 'energy')).toBe(true);
  });

  it('names the season when a season change causes the shortfall', () => {
    const s = founded();
    // Just before Haze (index 3): water output drops ×0.9/1.0 → a step down. Make water barely enough.
    s.city.tick = 3 * SEASON_TICKS - 30 * PULSE_TICKS;
    const st = s.city.stats;
    st.waterUsed = 1000;
    st.waterProduced = 1050;
    const h = s.city.pulse.history.waterBalance;
    h.length = 0;
    h.push(...ramp(20, 50, 0));
    s.city.pulse.count++;
    const f = forecastFor(s.city, 'water');
    expect(f.eta).not.toBeNull();
    expect(f.season).toBe('Haze');
    expect(f.text).toMatch(/Haze/);
  });

  it('the season change is always in Coming up', () => {
    const s = founded();
    expect(comingUp(s.city, 5).some((c) => c.kind === 'season')).toBe(true);
  });
});

describe('Flora reads the forecast', () => {
  it('routes questions about the future to whats_coming', () => {
    for (const q of [
      "what's coming?",
      'will we run out of water?',
      'any forecast for energy?',
      'what is coming up next?',
    ])
      expect(plainIntent(q), q).toBe('whats_coming');
    expect(plainIntent('is a storm coming?')).toBe('crisis_status');
  });

  it('whats_coming lists trends, warnings and what lies ahead', () => {
    const s = makeSim(5);
    applyScenario(s.city, 'founding-city');
    s.step(90 * PULSE_TICKS);
    const out = foresightTools[0]!.run({ city: s.city } as never, {} as never) as {
      trends: unknown[];
      warnings: unknown[];
      ahead: { kind: string }[];
    };
    expect(out.trends).toHaveLength(6);
    expect(Array.isArray(out.warnings)).toBe(true);
    expect(out.ahead.some((a) => a.kind === 'season')).toBe(true);
  });
});
