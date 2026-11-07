import { describe, expect, it } from 'vitest';
import { Grid } from '@/sim/Grid';
import { ROAD_REACH, RoadNetworks } from '@/sim/networks';

/** A building joins a highway's utilities within `ROAD_REACH` tiles of its lot, not only when it fronts one. */
describe('highway reach', () => {
  const grid = () => {
    const g = new Grid(32, 32);
    for (let x = 0; x < 32; x++) g.road[g.index(x, 10)] = 1;
    return g;
  };

  it('connects a lot set back from the street, up to the reach', () => {
    const g = grid();
    const net = new RoadNetworks(g);
    net.recompute();
    // A 2×2 lot whose near edge is `gap` tiles from the road row (z = 10).
    for (let gap = 0; gap < ROAD_REACH; gap++) {
      const z = 11 + gap;
      expect(net.networkFor(5, z, 2, 2), `gap ${gap}`).toBe(net.comp[g.index(0, 10)]);
      expect(RoadNetworks.nearRoad(g, 5, z, 2, 2)).toBe(true);
    }
    expect(net.networkFor(5, 11 + ROAD_REACH, 2, 2)).toBe(-1);
    expect(RoadNetworks.nearRoad(g, 5, 11 + ROAD_REACH, 2, 2)).toBe(false);
    // Diagonal reach counts too (a square ring round the lot).
    const g2 = new Grid(32, 32);
    g2.road[g2.index(20, 20)] = 1;
    expect(RoadNetworks.nearRoad(g2, 21, 21, 2, 2)).toBe(true);
    expect(RoadNetworks.nearRoad(g2, 23, 23, 2, 2)).toBe(true);
    expect(RoadNetworks.nearRoad(g2, 24, 24, 2, 2)).toBe(false);
  });

  it('prefers the nearest network over a lower-numbered farther one', () => {
    const g = grid();
    for (let x = 0; x < 32; x++) g.road[g.index(x, 2)] = 1; // a second, separate road, lower in id order
    const net = new RoadNetworks(g);
    net.recompute();
    const near = net.comp[g.index(0, 10)]!;
    expect(net.comp[g.index(0, 2)]).toBeLessThan(near);
    expect(net.networkFor(5, 7, 2, 2)).toBe(near); // 1 tile from z = 10, 4 from z = 2
  });
});
