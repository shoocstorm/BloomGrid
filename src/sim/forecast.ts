import type { City } from './City';
import { netIncome } from './finance';
import { getCrisis } from './crises';
import { PULSE_TICKS } from './pulseConst';
import { INDICATOR_NAMES as N } from './indicators';
import { SEASONS, SEASON_SECONDS, seasonAt } from './seasons';
import type { HistoryMetric } from './pulseState';

/**
 * Foresight (plan v5, Phase 24): where the city's supplies are heading, read from the pulse history the City Pulse
 * already keeps (one sample per 10 sim seconds). Each forecast fits a robust trend (Theil–Sen: the median of the
 * pairwise slopes, so one big build or a crisis spike does not swing it) over the last few minutes and asks when
 * the line crosses the next tier threshold the system has not yet crossed: "runs short" (Strained) first, then
 * "critical". Known season changes inside the horizon are folded in as a step (Haze dries the taps, Harvest fills
 * the larders), so a forecast can name the season as its cause.
 *
 * Pure and deterministic (a function of `pulse.history`, the live stats and the tick); nothing new is saved. The
 * advisor, Flora's proactive review, the stat cards and the Coming up strip all read `forecastCity`, which is cached
 * per pulse.
 */

export const FORECAST_METRICS = ['energy', 'water', 'food', 'harmony', 'budget', 'population'] as const;
export type ForecastMetric = (typeof FORECAST_METRICS)[number];

/** Sim seconds between history samples (`HISTORY_EVERY` pulses of one sim second, `sim/pulse.ts`). */
export const SAMPLE_SECONDS = 10;
/** Samples a trend is fitted over (5 sim minutes) and the fewest that make a forecast (1 sim minute). */
export const TREND_WINDOW = 30;
export const MIN_SAMPLES = 6;
/** How far ahead forecasts look (sim seconds): 10 sim minutes. */
export const HORIZON = 600;
/** Below this fit quality a trend is too noisy to call. */
export const MIN_CONFIDENCE = 0.35;

export type ForecastLevel = 'short' | 'critical';

export interface Forecast {
  metric: ForecastMetric;
  /** Player-facing name of the indicator. */
  label: string;
  /** The history series it reads (the stat cards draw its projection). */
  history: HistoryMetric;
  /** The value now, in the series' units. */
  now: number;
  /** Trend per sim minute, in the series' units. */
  perMin: number;
  /** Fit quality 0..1 (1: the samples lie on the line). */
  confidence: number;
  /** The threshold it is heading for, and which one. */
  threshold: number | null;
  level: ForecastLevel | null;
  /** Sim seconds until the threshold is crossed (null: not within `HORIZON`). */
  eta: number | null;
  /** The value projected at the end of the horizon (season steps included). */
  atHorizon: number;
  /** A season change inside the horizon that moves this metric (its name), when it decides the crossing. */
  season: string | null;
  /** One line for cards and notices. */
  text: string;
}

export interface Fit {
  slope: number;
  confidence: number;
  n: number;
}

const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Theil–Sen slope (per sample) of the last `window` values, and how well a line explains them: 1 − MAD(residuals) /
 * MAD(values). A clean ramp scores ≈1, noise round a flat line ≈0. A perfectly flat series is a confident zero slope.
 */
export function fitTrend(series: readonly number[], window = TREND_WINDOW): Fit {
  const v = series.slice(-window);
  const n = v.length;
  if (n < 2) return { slope: 0, confidence: 0, n };
  const slopes: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) slopes.push((v[j]! - v[i]!) / (j - i));
  const slope = median(slopes);
  const icept = median(v.map((y, i) => y - slope * i));
  const res = v.map((y, i) => Math.abs(y - (icept + slope * i)));
  const mid = median(v);
  const spread = median(v.map((y) => Math.abs(y - mid)));
  const resid = median(res);
  const scale = Math.max(1e-6, Math.abs(mid) * 1e-3);
  const confidence = spread < scale ? (resid < scale ? 1 : 0) : Math.max(0, Math.min(1, 1 - resid / spread));
  return { slope, confidence: confidence * Math.min(1, n / (MIN_SAMPLES * 2)), n };
}

/**
 * First time in (0, horizon] at which `now + rate·t + step(t ≥ at)` falls below `threshold` (rate per second).
 * `step` is applied from `at` on (a season change); null when it stays at or above the threshold.
 */
export function crossing(
  now: number,
  rate: number,
  threshold: number,
  horizon: number,
  step = 0,
  at = Infinity,
): number | null {
  if (now < threshold) return 0;
  const end = Math.min(horizon, at);
  if (rate < 0) {
    const t = (threshold - now) / rate;
    if (t <= end) return Math.max(0, t);
  }
  if (at > horizon) return null;
  const after = now + rate * at + step;
  if (after < threshold) return at;
  if (rate >= 0) return null;
  const t = at + (threshold - after) / rate;
  return t <= horizon ? t : null;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const etaText = (s: number): string => (s < 60 ? 'under a minute' : `~${Math.round(s / 60)} min`);

interface Spec {
  metric: ForecastMetric;
  label: string;
  history: HistoryMetric;
  now: number;
  /** Thresholds "short" then "critical" (falling below is bad); empty: trend only. */
  thresholds: [number, number] | null;
  /** Per-second rate when the trend is known exactly rather than fitted (the credit flow). */
  rate?: number;
  /** Season step: the change to the value when the next season begins. */
  seasonStep?: number;
  unit: (v: number) => string;
}

function forecastOne(city: City, sp: Spec, seasonIn: number, nextSeason: string): Forecast {
  const series = city.pulse.history[sp.history];
  const fit =
    sp.rate !== undefined
      ? { slope: sp.rate * SAMPLE_SECONDS, confidence: 0.9, n: series.length }
      : fitTrend(series);
  const enough = sp.rate !== undefined || fit.n >= MIN_SAMPLES;
  const rate = enough && fit.confidence >= MIN_CONFIDENCE ? fit.slope / SAMPLE_SECONDS : 0;
  const step = sp.seasonStep ?? 0;
  const atHorizon = sp.now + rate * HORIZON + (seasonIn <= HORIZON ? step : 0);
  const base: Forecast = {
    metric: sp.metric,
    label: sp.label,
    history: sp.history,
    now: sp.now,
    perMin: enough ? fit.slope * (60 / SAMPLE_SECONDS) : 0,
    confidence: enough ? fit.confidence : 0,
    threshold: null,
    level: null,
    eta: null,
    atHorizon,
    season: null,
    text: '',
  };
  if (!sp.thresholds) {
    base.text =
      !enough || Math.abs(rate) < 1e-9
        ? `${sp.label} holding steady.`
        : `${sp.label} ${rate > 0 ? 'growing' : 'shrinking'} ${sp.unit(base.perMin)}/min.`;
    return base;
  }
  // The next threshold not yet crossed.
  const [short, critical] = sp.thresholds;
  const level: ForecastLevel | null = sp.now >= short ? 'short' : sp.now >= critical ? 'critical' : null;
  if (!level) {
    base.text = `${sp.label} is already critical.`;
    return base;
  }
  const threshold = level === 'short' ? short : critical;
  const eta = crossing(sp.now, rate, threshold, HORIZON, step, seasonIn);
  base.threshold = threshold;
  if (eta === null) {
    base.text =
      rate < 0 ? `${sp.label} slipping ${sp.unit(base.perMin)}/min, clear for now.` : `${sp.label} steady.`;
    return base;
  }
  base.level = level;
  base.eta = eta;
  // The season decides it when the trend alone would not have crossed by then.
  const trendOnly = crossing(sp.now, rate, threshold, HORIZON);
  if (step < 0 && (trendOnly === null || trendOnly > eta + 1e-6)) base.season = nextSeason;
  const what =
    level === 'short'
      ? sp.metric === 'budget'
        ? 'credits run out'
        : sp.metric === 'harmony'
          ? 'harmony turns Strained'
          : 'runs short'
      : 'turns Critical';
  const subject = sp.metric === 'budget' ? '' : `${sp.label} `;
  base.text = base.season
    ? `${subject}${what} in ${etaText(eta)}: ${base.season} begins then.`.replace(/^./, (c) =>
        c.toUpperCase(),
      )
    : `${subject}${what} in ${etaText(eta)} at this trend (${sp.unit(base.perMin)}/min).`.replace(/^./, (c) =>
        c.toUpperCase(),
      );
  return base;
}

let cache: { city: City; key: number; out: Forecast[] } | null = null;

/** Every metric's forecast, in `FORECAST_METRICS` order. Cached per pulse. */
export function forecastCity(city: City): Forecast[] {
  const key = city.pulse.count * 1e6 + city.pulse.history.population.length;
  if (cache && cache.city === city && cache.key === key) return cache.out;
  const s = city.stats;
  const p = city.pulse;
  const { season, index, progress } = seasonAt(city.tick);
  const next = SEASONS[(index + 1) % SEASONS.length]!;
  const seasonIn = (1 - progress) * SEASON_SECONDS;
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;
  const out = [
    forecastOne(
      city,
      {
        metric: 'energy',
        label: N.energy,
        history: 'energyBalance',
        now: s.energyProduced - s.energyUsed,
        thresholds: s.energyUsed > 0 ? [0, -0.15 * s.energyUsed] : null,
        unit: signed,
      },
      seasonIn,
      next.name,
    ),
    forecastOne(
      city,
      {
        metric: 'water',
        label: N.water,
        history: 'waterBalance',
        now: s.waterProduced - s.waterUsed,
        thresholds: s.waterUsed > 0 ? [0, -0.15 * s.waterUsed] : null,
        seasonStep: s.waterProduced * (next.waterMul / season.waterMul - 1),
        unit: signed,
      },
      seasonIn,
      next.name,
    ),
    forecastOne(
      city,
      {
        metric: 'food',
        label: N.food,
        history: 'food',
        now: p.foodRatio,
        thresholds: s.population > 1 ? [0.95, 0.75] : null,
        seasonStep: p.foodRatio * (next.foodMul / season.foodMul - 1),
        unit: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`,
      },
      seasonIn,
      next.name,
    ),
    forecastOne(
      city,
      {
        metric: 'harmony',
        label: N.harmony,
        history: 'happiness',
        now: s.happiness,
        thresholds: s.population > 1 ? [55, 40] : null,
        unit: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`,
      },
      seasonIn,
      next.name,
    ),
    forecastOne(
      city,
      {
        metric: 'budget',
        label: N.credits,
        history: 'credits',
        now: city.credits,
        thresholds: [0, -5000],
        rate: netIncome(city),
        unit: (v) => `${v >= 0 ? '+' : '−'}◈${fmt(Math.abs(v))}`,
      },
      seasonIn,
      next.name,
    ),
    forecastOne(
      city,
      {
        metric: 'population',
        label: N.residents,
        history: 'population',
        now: s.population,
        thresholds: null,
        unit: signed,
      },
      seasonIn,
      next.name,
    ),
  ];
  cache = { city, key, out };
  return out;
}

/** The forecasts that cross a threshold within the horizon, soonest first. */
export function warnings(city: City): Forecast[] {
  return forecastCity(city)
    .filter((f) => f.eta !== null)
    .sort(
      (a, b) => a.eta! - b.eta! || FORECAST_METRICS.indexOf(a.metric) - FORECAST_METRICS.indexOf(b.metric),
    );
}

export function forecastFor(city: City, metric: ForecastMetric): Forecast {
  return forecastCity(city).find((f) => f.metric === metric)!;
}

export interface ComingUp {
  kind: 'forecast' | 'season' | 'crisis';
  /** Sim seconds from now. */
  in: number;
  title: string;
  detail: string;
  tone: 'bad' | 'warn' | 'info';
  metric?: ForecastMetric;
}

/** What lies ahead within the horizon (plus the next season, always): forecasts, the season change, forecast crises. */
export function comingUp(city: City, limit = 3): ComingUp[] {
  const out: ComingUp[] = warnings(city).map((f) => ({
    kind: 'forecast' as const,
    in: f.eta!,
    title:
      f.level === 'critical'
        ? `${f.label} critical`
        : f.metric === 'budget'
          ? 'Credits run out'
          : f.metric === 'harmony'
            ? 'Harmony slipping'
            : `${f.label} short`,
    detail: f.text,
    tone: f.level === 'critical' ? ('bad' as const) : ('warn' as const),
    metric: f.metric,
  }));
  for (const c of city.steward.crises) {
    if (c.phase !== 'forecast') continue;
    out.push({
      kind: 'crisis',
      in: Math.max(0, (c.startTick - city.tick) / PULSE_TICKS),
      title: `${getCrisis(c.def).name} ahead`,
      detail: 'Forecast by the island watch: prepare now.',
      tone: 'bad',
    });
  }
  const { index, progress } = seasonAt(city.tick);
  const next = SEASONS[(index + 1) % SEASONS.length]!;
  out.push({
    kind: 'season',
    in: (1 - progress) * SEASON_SECONDS,
    title: `${next.name} season`,
    detail: next.description,
    tone: 'info',
  });
  const rank = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => a.in - b.in || rank[a.tone] - rank[b.tone]).slice(0, limit);
}
