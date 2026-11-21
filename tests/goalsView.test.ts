import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { PROJECT_IDS, projectsInView } from '@/sim/projects';
import { makeSim } from './helpers';

/** The Goals tab lists only the projects a city can reach soon (D-180). */
describe('projectsInView', () => {
  const fresh = () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'fresh-island');
    return s.city;
  };

  it('a hamlet sees the stray and Flora, not the 2,000+ resident projects', () => {
    const city = fresh();
    city.stats.population = 200;
    const v = projectsInView(city);
    expect(v.shown).toEqual(['cat', 'flora']);
    expect(v.done).toEqual([]);
    expect(v.later).toBe(PROJECT_IDS.length - 2);
    expect(v.next).toBe(2000);
  });

  it('reveals projects as the island grows, prerequisites first', () => {
    const city = fresh();
    city.stats.population = 1200;
    expect(projectsInView(city).shown).toEqual(['cat', 'skylanes', 'flora', 'police']);
    city.stats.population = 3000;
    // The Aeroline waits on the sky-lanes, the Sky Guard on the Aegis Watch.
    expect(projectsInView(city).shown).not.toContain('aeroline');
    expect(projectsInView(city).shown).not.toContain('skyguard');
    city.growth.unlocked.push('skylanes', 'cat');
    const v = projectsInView(city);
    expect(v.shown).toContain('aeroline');
    expect(v.done).toEqual(['cat', 'skylanes']);
  });

  it('always shows the nearest locked project, however small the city', () => {
    const city = fresh();
    city.growth.unlocked.push('cat', 'flora');
    city.stats.population = 10;
    expect(projectsInView(city).shown).toEqual(['skylanes']);
  });
});
