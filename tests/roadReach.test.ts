import { describe, expect, it } from 'vitest';
import { Grid } from '@/sim/Grid';
import { ROAD_REACH, RoadNetworks } from '@/sim/networks';

/** A building joins a highway's utilities within `ROAD_REACH` tiles of its lot, not only when it fronts one. */
describe('highway reach', () => {
  const N = 2 * ROAD_REACH + 24;
  const grid = (row = 10) => {
    const g = new Grid(N, N);
    for (let x = 0; x < N; x++) g.road[g.index(x, row)] = 1;
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
    const g2 = new Grid(N, N);
    g2.road[g2.index(5, 5)] = 1;
    expect(RoadNetworks.nearRoad(g2, 6, 6, 2, 2)).toBe(true);
    expect(RoadNetworks.nearRoad(g2, 5 + ROAD_REACH, 5 + ROAD_REACH, 2, 2)).toBe(true);
    expect(RoadNetworks.nearRoad(g2, 6 + ROAD_REACH, 6 + ROAD_REACH, 2, 2)).toBe(false);
  });

  it('joins the largest network in reach, not a nearer stub', () => {
    const g = grid(ROAD_REACH + 8);
    // A 3-tile stub right beside the lot, cut off from the long street further away.
    for (let x = 4; x < 7; x++) g.road[g.index(x, ROAD_REACH + 2)] = 1;
    const net = new RoadNetworks(g);
    net.recompute();
    const trunk = net.comp[g.index(0, ROAD_REACH + 8)]!;
    const stub = net.comp[g.index(5, ROAD_REACH + 2)]!;
    expect(stub).not.toBe(trunk);
    expect(net.networkFor(5, ROAD_REACH + 3, 2, 2)).toBe(trunk);
    // Only the stub in reach: it takes that.
    expect(net.networkFor(5, 1, 2, 2)).toBe(stub);
  });

  it('between equal networks, the nearer wins', () => {
    const g = grid(2);
    for (let x = 0; x < N; x++) g.road[g.index(x, ROAD_REACH + 5)] = 1;
    const net = new RoadNetworks(g);
    net.recompute();
    expect(net.networkFor(5, 4, 2, 2)).toBe(net.comp[g.index(0, 2)]);
    expect(net.networkFor(5, ROAD_REACH + 2, 2, 2)).toBe(net.comp[g.index(0, ROAD_REACH + 5)]);
  });
});
