import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { buildings } from '@/content';
import { statGuide } from '@/sim/statGuide';
import { INDICATOR_NAMES, SYSTEM_LABELS } from '@/sim/indicators';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { makeSim } from './helpers';

describe('indicators (D-113)', () => {
  it('names each indicator once: the stat guides and City Pulse agree', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    s.step(40);
    expect(statGuide(s.city, 'credits').title).toBe(SYSTEM_LABELS.budget);
    expect(statGuide(s.city, 'energy').title).toBe(SYSTEM_LABELS.energy);
    expect(statGuide(s.city, 'water').title).toBe(SYSTEM_LABELS.water);
    expect(statGuide(s.city, 'food').title).toBe(SYSTEM_LABELS.food);
    expect(statGuide(s.city, 'eco').title).toBe(SYSTEM_LABELS.ecology);
    expect(statGuide(s.city, 'happy').title).toBe(SYSTEM_LABELS.harmony);
    expect(new Set(Object.values(INDICATOR_NAMES)).size).toBe(Object.keys(INDICATOR_NAMES).length);
  });

  it('the Food guide reads the fed ratio and, when short, leads with a food building', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    s.step(40);
    const g = statGuide(s.city, 'food');
    expect(g.value).toBe(`${Math.round(s.city.pulse.foodRatio * 100)}%`);
    expect(g.parts.reduce((a, p) => a + (p.label === 'Spare' || p.label === 'Short' ? 0 : p.value), 0)).toBeCloseTo(
      s.city.stats.foodProduced - s.city.stats.population,
      3,
    );
    // Starve the city: the best move is a food building.
    s.city.pulse.foodRatio = 0.6;
    const lead = statGuide(s.city, 'food').levers[0]!;
    expect(lead.action.kind).toBe('place');
    if (lead.action.kind === 'place') expect(buildings.get(lead.action.def).stats.food).toBeGreaterThan(0);
  });

  it('migrates a v15 save: the food trend starts empty and keeps recording', () => {
    const s = makeSim(7);
    applyScenario(s.city, 'founding-city');
    s.step(20);
    const data = structuredClone(serializeCity(s.city)) as SaveData;
    data.version = 15;
    delete (data.pulse.history as Record<string, number[]>).food;
    const m = migrateSave(data);
    expect(m.version).toBe(SAVE_VERSION);
    const t = makeSim(7);
    deserializeCity(t.city, m);
    t.step(400);
    expect(t.city.pulse.history.food.length).toBeGreaterThan(0);
  });
});
