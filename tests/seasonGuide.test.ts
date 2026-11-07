import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { buildings } from '@/content';
import { lockReason } from '@/sim/projects';
import { forecastCrisis } from '@/sim/crises';
import '@/sim/disasters';
import '@/sim/hazards';
import { SEASONS, SEASON_TICKS } from '@/sim/seasons';
import { seasonGuide } from '@/sim/seasonGuide';
import { makeSim } from './helpers';

function founded() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(40);
  return s;
}

describe('season guide (D-119)', () => {
  it('explains every season with its effects, crisis odds, the next season and valid levers', () => {
    const { city } = founded();
    SEASONS.forEach((season, i) => {
      city.tick = i * SEASON_TICKS + Math.round(SEASON_TICKS * 0.3);
      const g = seasonGuide(city);
      expect(g.id).toBe(season.id);
      expect(g.effects).toHaveLength(4);
      expect(g.risks.length, season.id).toBe(Object.keys(season.crisis).length);
      for (let k = 1; k < g.risks.length; k++) expect(g.risks[k - 1]!.mul).toBeGreaterThanOrEqual(g.risks[k]!.mul);
      expect(g.next.id).toBe(SEASONS[(i + 1) % SEASONS.length]!.id);
      expect(g.levers.length, season.id).toBeGreaterThan(0);
      expect(new Set(g.levers.map((l) => l.label)).size).toBe(g.levers.length);
      for (let k = 1; k < g.levers.length; k++) expect(g.levers[k - 1]!.weight).toBeGreaterThanOrEqual(g.levers[k]!.weight);
      for (const l of g.levers) if (l.action.kind === 'place') expect(lockReason(city, l.action.def), l.action.def).toBeNull();
      for (const l of g.levers) if (l.action.kind === 'place') expect(buildings.has(l.action.def)).toBe(true);
    });
  });

  it('a forecast crisis turns the outlook to a warning and leads with its lens', () => {
    const { city } = founded();
    city.tick = SEASON_TICKS + 100; // Monsoon
    forecastCrisis(city, 'monsoon', 1, 30);
    const g = seasonGuide(city);
    expect(g.outlook).toBe(2);
    expect(g.status).toMatch(/forecast/);
    expect(g.levers[0]!.action).toEqual({ kind: 'lens', id: 'flood' });
  });

  it("late in a season, the next one's preparation joins the levers", () => {
    const { city } = founded();
    city.tick = SEASON_TICKS * 3 - 50; // the end of Harvest, Haze next
    const g = seasonGuide(city);
    expect(g.levers.some((l) => l.detail.startsWith('Haze ahead'))).toBe(true);
  });

  it('suggests only what a fresh island has unlocked', () => {
    const s = makeSim(7);
    applyScenario(s.city, 'fresh-island');
    s.step(20);
    for (let i = 0; i < SEASONS.length; i++) {
      s.city.tick = i * SEASON_TICKS + Math.round(SEASON_TICKS * 0.8);
      for (const l of seasonGuide(s.city).levers) if (l.action.kind === 'place') expect(lockReason(s.city, l.action.def), l.action.def).toBeNull();
    }
  });
});
