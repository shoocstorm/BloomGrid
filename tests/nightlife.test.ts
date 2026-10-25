import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { computeFields } from '@/sim/fields';
import { activityLayer, computeActivity } from '@/sim/nightlife';
import { NO_ENTITY } from '@/sim/Grid';
import { Service } from '@/ecs/components';
import { findLandRow, makeSim } from './helpers';

function founded() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(100);
  return s;
}

describe('pedestrian activity (night life)', () => {
  it('busy districts are brighter than empty land and the field stays in [0,1]', () => {
    const s = founded();
    computeFields(s.city, s.city.fields);
    computeActivity(s.city, s.city.fields);
    const a = activityLayer(s.city);
    const g = s.city.grid;
    let built = 0;
    let builtN = 0;
    let wild = 0;
    let wildN = 0;
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBeGreaterThanOrEqual(0);
      expect(a[i]).toBeLessThanOrEqual(1);
      if (s.city.fields.shore[i] === 0) expect(a[i]).toBe(0);
      else if (g.occupant[i] !== NO_ENTITY || g.road[i]) {
        built += a[i]!;
        builtN++;
      } else {
        wild += a[i]!;
        wildN++;
      }
    }
    expect(built / builtN).toBeGreaterThan(0.3);
    expect(built / builtN).toBeGreaterThan((wild / wildN) * 3);
    expect(s.city.pulse.nightlife).toBeCloseTo(built / builtN, 5);
  });

  it('a new park and homes light up their street; a blackout dims it; the pulse recomputes it', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city);
    const probe = s.city.grid.index(x0 + 3, z + 1);
    computeActivity(s.city, s.city.fields);
    expect(activityLayer(s.city)[probe]).toBe(0);
    expect(s.commands.execute('build', { def: 'pocket-park', x: x0 + 2, z, rot: 0 })).toBe(true);
    expect(s.commands.execute('build', { def: 'pocket-park', x: x0 + 4, z, rot: 0 })).toBe(true);
    computeActivity(s.city, s.city.fields);
    const lit = activityLayer(s.city)[probe]!;
    expect(lit).toBeGreaterThan(0.2);
    const park = s.city.grid.occupant[s.city.grid.index(x0 + 2, z)]!;
    Service.power[park] = 0;
    computeActivity(s.city, s.city.fields);
    expect(activityLayer(s.city)[probe]).toBeLessThan(lit);

    // The pulse refreshes the field on its own phase and announces it.
    let updates = 0;
    s.bus.on('activity:updated', () => updates++);
    s.step(10 * 6);
    expect(updates).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic for the same city', () => {
    const run = () => {
      const s = founded();
      computeFields(s.city, s.city.fields);
      computeActivity(s.city, s.city.fields);
      let h = 0;
      for (const v of activityLayer(s.city)) h = (h * 31 + Math.round(v * 1e4)) | 0;
      return h;
    };
    expect(run()).toBe(run());
  });
});
