import { describe, expect, it } from 'vitest';
import { Service } from '@/ecs/components';
import { applyScenario } from '@/sim/scenario';
import { computeMobility, mobilityLayers } from '@/sim/mobility';
import { evaluateAdvisor } from '@/sim/advisor';
import { allOverlays } from '@/sim/overlays';
import { findLandRow, makeSim } from './helpers';

function founded() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(300);
  return s;
}

/** A dormitory row: towers along a highway, the only workplaces (200 jobs) at its far end. */
function commuterRow(towers: number) {
  const s = makeSim(42);
  s.city.credits = 1e7;
  const { x0, z } = findLandRow(s.city, 40);
  const g = s.city.grid;
  // Towers (3×3) north of the highway on row z, the workplaces south of it at the east end.
  expect(s.commands.execute('road', { tiles: Array.from({ length: 38 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
  for (let x = x0 + 22; x <= x0 + 34; x += 3) expect(s.commands.execute('build', { def: 'greenhouse-hub', x, z: z + 1, rot: 0 })).toBe(true);
  for (let i = 0; i < towers; i++) expect(s.commands.execute('build', { def: 'canopy-tower', x: x0 + i * 3, z: z - 3, rot: 0 })).toBe(true);
  return { s, x0, z };
}

const fillHomes = (s: ReturnType<typeof makeSim>) => {
  // One pulse joins networks; then skip the slow move-in (fill everything) and run the pass directly.
  s.step(10);
  for (let eid = 0; eid < 4096; eid++) {
    Service.occupancy[eid] = 1;
    Service.power[eid] = 1;
  }
  s.city.pulse.unemployment = 0;
  computeMobility(s.city);
};

describe('mobility', () => {
  it('commuters follow the flow field to the workplace and load the highway between', () => {
    const { s, x0, z } = commuterRow(4);
    fillHomes(s);
    const { traffic, dist, next } = mobilityLayers(s.city);
    const g = s.city.grid;
    const mid = g.index(x0 + 20, z);
    expect(traffic[mid]).toBeGreaterThan(0);
    expect(dist[mid]).toBeGreaterThan(0);
    // Main commuter direction points east, toward the workplace.
    expect(next[mid]).toBe(mid + 1);
    expect(s.city.pulse.avgCommute).toBeGreaterThan(10);
  });

  it('more commuters on one highway means congestion and a lower flow', () => {
    const light = commuterRow(1);
    fillHomes(light.s);
    const heavy = commuterRow(9);
    fillHomes(heavy.s);
    expect(heavy.s.city.pulse.flow).toBeLessThan(light.s.city.pulse.flow);
    expect(heavy.s.city.pulse.flow).toBeLessThan(0.8);
  });

  it('a Pod Dock takes commuters off the highway and opens a sky-lane', () => {
    const { s, x0, z } = commuterRow(9);
    fillHomes(s);
    const before = s.city.pulse.flow;
    expect(s.commands.execute('build', { def: 'pod-dock', x: x0 + 12, z: z + 1, rot: 0 })).toBe(true);
    fillHomes(s);
    expect(s.city.pulse.podRiders).toBeGreaterThan(100);
    expect(s.city.pulse.flow).toBeGreaterThan(before);
    expect(s.city.pulse.podRoutes.length).toBe(1);
    const r = s.city.pulse.podRoutes[0]!;
    expect(r.bx).toBeGreaterThan(r.ax + 8);
  });

  it('the founding city flows; the pulse runs the pass; jams raise an advisory', () => {
    const s = founded();
    expect(s.city.pulse.commuters).toBeGreaterThan(5000);
    expect(s.city.pulse.flow).toBeGreaterThan(0.75);
    expect(s.city.pulse.podRoutes.length).toBeGreaterThan(0);
    const lens = allOverlays().find((o) => o.id === 'traffic')!;
    expect(lens).toBeDefined();
    expect(evaluateAdvisor(s.city).some((a) => a.id === 'traffic')).toBe(s.city.pulse.tiers.mobility >= 2);
    s.city.pulse.tiers.mobility = 3;
    expect(evaluateAdvisor(s.city).find((a) => a.id === 'traffic')?.build).toBe('pod-dock');
  });

  it('is deterministic', () => {
    const run = () => {
      const s = founded();
      computeMobility(s.city);
      let h = 0;
      for (const v of mobilityLayers(s.city).traffic) h = (h * 31 + Math.round(v * 1e4)) | 0;
      return `${h}|${s.city.pulse.flow.toFixed(6)}|${s.city.hash()}`;
    };
    expect(run()).toBe(run());
  });
});
