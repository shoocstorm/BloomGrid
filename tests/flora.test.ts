import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { buildings } from '@/content';
import { floraWake } from '@/sim/flora';
import { PROJECTS } from '@/sim/projects';
import { makeSim, findSpot } from './helpers';

function fresh() {
  const s = makeSim(7);
  applyScenario(s.city, 'fresh-island');
  s.step(20);
  return s;
}

describe('waking Flora (D-092)', () => {
  it('asleep → ready → waking → awake, with a way to meet each condition', () => {
    const s = fresh();
    let w = floraWake(s.city);
    expect(w.phase).toBe('asleep');
    const spire = w.criteria.find((c) => c.build === 'data-spire')!;
    expect(spire.ok).toBe(false);
    const power = w.criteria.find((c) => c.label === 'A power plant')!;
    expect(power.build && buildings.get(power.build).stats.energy).toBeGreaterThan(0);
    const cash = w.criteria.find((c) => c.credits)!;
    expect(cash.progress).toBeGreaterThan(0);

    s.city.credits = 50_000;
    const at = findSpot(s.city, 'data-spire', 200, 200);
    expect(s.commands.execute('build', { def: 'data-spire', ...at, rot: 0 })).toBe(true);
    if (!w.criteria[0]!.ok) {
      const p = findSpot(s.city, power.build!, 200, 230);
      s.commands.execute('build', { def: power.build!, ...p, rot: 0 });
    }
    w = floraWake(s.city);
    expect(w.criteria.every((c) => c.ok)).toBe(true);
    expect(w.phase).toBe('ready');

    expect(s.commands.execute('startProject', { id: 'flora' })).toBe(true);
    s.step(50);
    w = floraWake(s.city);
    expect(w.phase).toBe('waking');
    expect(w.progress).toBeGreaterThan(0);
    expect(w.secondsLeft).toBeLessThan(PROJECTS.flora.days * 360);

    let done = false;
    s.city.bus.on('project:done', ({ id }) => (done ||= id === 'flora'));
    s.step(Math.ceil(w.secondsLeft * 10) + 20);
    expect(done).toBe(true);
    expect(floraWake(s.city)).toMatchObject({ phase: 'awake', progress: 1, criteria: [] });
  });

  it('is always awake without progression (the showcase)', () => {
    const s = makeSim(3);
    applyScenario(s.city, 'founding-city');
    expect(floraWake(s.city).phase).toBe('awake');
  });
});
