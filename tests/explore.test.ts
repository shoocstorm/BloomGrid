import { describe, expect, it } from 'vitest';
import { createCollider } from '@/modules/explore/collider';
import { findRoof, roofAt } from '@/modules/explore/roof';
import { initPieces } from '@/assets/kit/pieces';
import { BRIDGE_DECK } from '@/sim/City';
import { findLandRow, makeSim } from './helpers';

describe('explore collider', () => {
  it('towers are walls, parks are walkable, highways are open', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city, 30);
    const g = s.city.grid;
    expect(s.commands.execute('road', { tiles: Array.from({ length: 20 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
    expect(s.commands.execute('build', { def: 'canopy-tower', x: x0, z: z - 3, rot: 0 })).toBe(true);
    expect(s.commands.execute('build', { def: 'pocket-park', x: x0 + 6, z: z - 2, rot: 0 })).toBe(true);
    const c = createCollider(s.city);
    const feet = g.heightAt(x0 + 1.5, z + 0.5);
    // Open highway.
    expect(c.blocked(x0 + 1.5, z + 0.5, feet, false, 0)).toBe(false);
    // Inside the tower's footprint at street level: a wall.
    expect(c.blocked(x0 + 1.5, z - 1.5, feet, false, 0)).toBe(true);
    // The park's moss bed is a low step: walk onto it, and stand on its top.
    const parkFeet = g.heightAt(x0 + 7, z - 1);
    expect(c.blocked(x0 + 7, z - 1, parkFeet, false, 0)).toBe(false);
    expect(c.groundAt(x0 + 7, z - 1, parkFeet)).toBeGreaterThanOrEqual(parkFeet);
    // Off the map is blocked.
    expect(c.blocked(-1, 5, 0, true, 0)).toBe(true);
  });

  it('water stops walkers but not boards; bridge decks carry you', () => {
    const s = makeSim(42);
    const g = s.city.grid;
    const c = createCollider(s.city);
    // A deep-sea point near a map corner.
    expect(g.heightAt(4, 4)).toBeLessThan(-0.5);
    expect(c.blocked(4, 4, 0, false, 0)).toBe(true);
    expect(c.blocked(4, 4, 0, true, 0)).toBe(false);
    // Draw a short bridge over the sea next to land and stand on its deck.
    for (let z = 40; z < g.h - 40; z += 2)
      for (let x = 40; x < g.w - 40; x++) {
        if (g.heightAt(x + 0.5, z + 0.5) > -0.2 || g.heightAt(x - 0.5, z + 0.5) < 0.4) continue;
        const tiles = [g.index(x - 1, z), g.index(x, z), g.index(x + 1, z)];
        s.city.credits = 1e6;
        if (!s.commands.execute('road', { tiles, bridges: true })) continue;
        if (!g.road[g.index(x, z)] || g.road[g.index(x, z)] !== 2) continue;
        expect(c.groundAt(x + 0.5, z + 0.5, 5)).toBeCloseTo(BRIDGE_DECK + 0.035, 3);
        expect(c.blocked(x + 0.5, z + 0.5, BRIDGE_DECK, false, 0)).toBe(false);
        return;
      }
    throw new Error('no bridge spot');
  });

  it('a landmark roof is found above the street, and movement is held to it', () => {
    initPieces();
    const s = makeSim(42);
    s.city.credits = 1e7;
    const { x0, z } = findLandRow(s.city, 30);
    const g = s.city.grid;
    expect(s.commands.execute('road', { tiles: Array.from({ length: 24 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
    expect(s.commands.execute('build', { def: 'sky-ark', x: x0, z: z - 8, rot: 0 })).toBe(true);
    const eid = s.city.buildingEntities().find((e) => s.city.buildingDef(e).id === 'sky-ark')!;
    const roof = findRoof(s.city, eid)!;
    expect(roof).not.toBeNull();
    const ground = g.heightAt(roof.spawn.x, roof.spawn.z);
    expect(roof.spawn.y - ground).toBeGreaterThan(1.2);
    expect(roofAt(roof, roof.spawn.x, roof.spawn.z)).toBeCloseTo(roof.spawn.y, 5);
    // Off the building (the street in front) is not roof.
    expect(roofAt(roof, x0 + 0.5, z + 0.5)).toBeNull();
  });
});

