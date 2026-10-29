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

  it('a hub links nearby docks into the sky-lane network, and linked docks carry more riders', () => {
    const { s, x0, z } = commuterRow(9);
    expect(s.commands.execute('build', { def: 'pod-dock', x: x0 + 12, z: z + 1, rot: 0 })).toBe(true);
    fillHomes(s);
    expect(s.city.pulse.skylanes.hubs.length).toBe(0);
    const alone = s.city.pulse.podRiders;
    // Two hubs: the dock links to the nearer by a spoke, the hubs to each other by a trunk.
    expect(s.commands.execute('build', { def: 'pod-interchange', x: x0 + 15, z: z + 1, rot: 0 })).toBe(true);
    expect(s.commands.execute('build', { def: 'skylane-nexus', x: x0 + 2, z: z + 1, rot: 0 })).toBe(true);
    fillHomes(s);
    const net = s.city.pulse.skylanes;
    expect(net.hubs.length).toBe(2);
    expect(net.hubs.some((h) => h.central)).toBe(true);
    expect(net.links.filter((l) => l.kind === 'trunk').length).toBe(1);
    const spoke = net.links.find((l) => l.kind === 'spoke');
    expect(spoke).toBeDefined();
    expect(net.hubs[spoke!.b]!.def).toBe('pod-interchange');
    expect(s.city.pulse.podRiders).toBeGreaterThan(alone);
  });

  it('an Aeroline station links to the nearest hub as a transfer, and the network carries more', () => {
    const { s, x0, z } = commuterRow(9);
    expect(s.commands.execute('build', { def: 'pod-dock', x: x0 + 12, z: z + 1, rot: 0 })).toBe(true);
    expect(s.commands.execute('build', { def: 'pod-interchange', x: x0 + 15, z: z + 1, rot: 0 })).toBe(true);
    fillHomes(s);
    const noRail = s.city.pulse.podRiders;
    expect(s.commands.execute('build', { def: 'aeroline-station', x: x0 + 4, z: z + 1, rot: 0 })).toBe(true);
    fillHomes(s);
    const net = s.city.pulse.skylanes;
    const rail = net.links.filter((l) => l.kind === 'rail');
    expect(rail.length).toBe(1);
    expect(net.hubs[rail[0]!.b]!.rail).toBe(1);
    expect(s.city.pulse.podRiders).toBeGreaterThan(noRail);
  });

  it("the founding city's hubs form one network round the Skylane Nexus", () => {
    const s = founded();
    const net = s.city.pulse.skylanes;
    expect(net.hubs.filter((h) => h.central).length).toBe(1);
    expect(net.hubs.length).toBeGreaterThan(5);
    expect(new Set(net.hubs.map((h) => h.net)).size).toBe(1);
    expect(net.links.filter((l) => l.kind === 'spoke').length).toBeGreaterThan(100);
    // Every Aeroline station is a transfer point.
    expect(net.links.filter((l) => l.kind === 'rail').length).toBe(4);
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
