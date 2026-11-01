import { describe, expect, it } from 'vitest';
import { Building } from '@/ecs/components';
import { applyScenario } from '@/sim/scenario';
import { forecastCrisis, leadFor, getCrisis } from '@/sim/crises';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { buildingExposure, riskReport } from '@/sim/risk';
import { getOverlay } from '@/sim/overlays';
import { makeSim } from './helpers';

const seconds = (s: ReturnType<typeof makeSim>, n: number) => s.step(n * PULSE_TICKS);

function settled() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(200);
  s.city.credits += 1e5;
  return s;
}
const turbines = (s: ReturnType<typeof makeSim>) =>
  s.city.buildingEntities().filter((e) => s.city.buildingDef(e).id === 'wind-turbine');

/** A tornado aimed straight through the wind farm; returns its log entry. */
function tornadoThroughTurbines(feather: boolean) {
  const s = settled();
  const ts = turbines(s);
  if (feather)
    for (const e of ts) s.commands.execute('toggleBuilding', { x: Building.x[e]!, z: Building.z[e]! });
  const c = forecastCrisis(s.city, 'tornado', 1, 0);
  seconds(s, 1);
  const t = ts[Math.floor(ts.length / 2)]!;
  [c.x, c.z, c.vx, c.vz] = [Building.x[t]! - 10, Building.z[t]!, 0.5, 0];
  seconds(s, 50);
  return s.city.steward.history.find((h) => h.kind === 'tornado')!;
}

describe('tornadoes, tsunamis, risk and prevention (Phase 21, D-076)', () => {
  it('a tornado tracks across the city and is logged; feathered turbines suffer less', () => {
    const spinning = tornadoThroughTurbines(false);
    const feathered = tornadoThroughTurbines(true);
    expect(spinning.hits).toBeGreaterThan(3);
    expect(spinning.cost).toBeGreaterThan(0);
    expect(feathered.cost).toBeLessThan(spinning.cost);
  });

  it('a tsunami floods the low coast; closing the Tide Gates and evacuating cut the losses', () => {
    const run = (prepare: boolean) => {
      const s = settled();
      forecastCrisis(s.city, 'tsunami', 1.2, 5);
      if (prepare) {
        expect(s.commands.execute('closeTideGates', {})).toBe(true);
        expect(s.commands.execute('evacuate', {})).toBe(true);
      }
      let peak = 0;
      for (let i = 0; i < 50; i++) {
        seconds(s, 1);
        peak = Math.max(peak, s.city.steward.modifiers.surge);
      }
      return { peak, rec: s.city.steward.history.find((h) => h.kind === 'tsunami')! };
    };
    const bare = run(false);
    const ready = run(true);
    expect(bare.peak).toBeGreaterThan(1);
    expect(ready.peak).toBeLessThan(bare.peak);
    expect(bare.rec.hits).toBeGreaterThan(0);
    expect(ready.rec.cost).toBeLessThanOrEqual(bare.rec.cost);
    expect(ready.rec.prevented?.some((p) => /Tide Gates/.test(p))).toBe(true);
  });

  it('a Weather Radar doubles the warning; the risk report reflects prevention', () => {
    const s = settled();
    expect(leadFor(s.city, 'tornado')).toBe(getCrisis('tornado').lead);
    const before = riskReport(s.city).find((r) => r.id === 'tornado')!;
    for (const e of turbines(s))
      s.commands.execute('toggleBuilding', { x: Building.x[e]!, z: Building.z[e]! });
    const after = riskReport(s.city).find((r) => r.id === 'tornado')!;
    expect(after.score).toBeLessThan(before.score);
    expect(before.factors.length).toBeGreaterThan(2);
    // A radar anywhere on the grid.
    const radar = 'weather-radar';
    let built = false;
    for (let z = 100; z < 400 && !built; z += 3)
      for (let x = 100; x < 400 && !built; x += 3)
        built = s.commands.execute('build', { def: radar, x, z, rot: 0 });
    expect(built).toBe(true);
    expect(leadFor(s.city, 'tornado')).toBe(getCrisis('tornado').lead * 2);
    expect(leadFor(s.city, 'heatwave')).toBe(getCrisis('heatwave').lead);
  });

  it('the Risk lens marks exposed buildings; a Storm Shelter takes homes off the tornado list', () => {
    const s = settled();
    const ex = buildingExposure(s.city);
    expect(ex.size).toBe(s.city.buildingEntities().length);
    const home = [...ex].find(([e, x]) => x.hazards.includes('storm') && s.city.buildingDef(e).stats.population > 0);
    expect(home).toBeDefined();
    const [eid] = home!;
    let built = false;
    for (let r = 3; r < 20 && !built; r++)
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]] as const)
        if (!built) built = s.commands.execute('build', { def: 'storm-shelter', x: Building.x[eid]! + dx, z: Building.z[eid]! + dz, rot: 0 });
    expect(built).toBe(true);
    expect(buildingExposure(s.city).get(eid)!.hazards).not.toContain('storm');
    // The lens paints every building footprint and nothing else.
    const n = s.city.grid.w * s.city.grid.h;
    const value = new Float32Array(n);
    const mask = new Uint8Array(n);
    getOverlay('risk')!.compute(s.city, s.city.fields, value, mask);
    const i = s.city.grid.index(Building.x[eid]!, Building.z[eid]!);
    expect(mask[i]).toBe(1);
    expect(value[i]).toBeCloseTo(buildingExposure(s.city).get(eid)!.score, 5);
  });

  it('is deterministic', () => {
    const run = () => {
      const s = settled();
      forecastCrisis(s.city, 'tornado', 1, 0);
      forecastCrisis(s.city, 'tsunami', 1, 0);
      seconds(s, 45);
      return s.city.hash();
    };
    expect(run()).toBe(run());
  });
});
