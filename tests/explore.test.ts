import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { createCollider, TREE_STRIDE } from '@/modules/explore/collider';
import { doorSteps, placeBuilding } from '@/modules/construction/BuildingRenderer';
import { applyScenario } from '@/sim/scenario';
import { findRoof, roofAt } from '@/modules/explore/roof';
import { initPieces } from '@/assets/kit/pieces';
import { BRIDGE_DECK } from '@/sim/City';
import { Grid } from '@/sim/Grid';
import { ROAD_LIFT } from '@/modules/construction/RoadRenderer';
import { findLandRow, makeSim } from './helpers';

describe('explore collider', () => {
  initPieces();
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

  it('a door opens the way into a glass dome; inside is open floor, the glass is a wall (D-132)', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city, 12);
    const g = s.city.grid;
    expect(s.commands.execute('road', { tiles: Array.from({ length: 8 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
    expect(s.commands.execute('build', { def: 'greenhouse-hub', x: x0 + 2, z: z - 3, rot: 0 })).toBe(true);
    let open = false;
    const c = createCollider(s.city, undefined, () => open);
    // Walk from the street, up the plinth, through the vestibule and into the dome (local z 1.8 → 0.6).
    const [cx, cz] = [x0 + 3.5, z - 1.5];
    const walk = () => {
      let feet = g.heightAt(cx, cz + 1.8);
      let stops = 0;
      for (let lz = 1.8; lz >= 0.6; lz -= 0.04) {
        if (c.blocked(cx, cz + lz, feet, false, 0)) stops++;
        else feet = Math.max(feet, c.groundAt(cx, cz + lz, feet));
      }
      return { stops, feet };
    };
    expect(walk().stops).toBeGreaterThan(0);
    open = true;
    const inside = walk();
    expect(inside.stops).toBe(0);
    // On the dome's floor, well above the street.
    expect(inside.feet).toBeGreaterThan(g.heightAt(cx, cz + 1.8) + 0.1);
    // Open floor beside the table, but the glass skin walls the edge.
    expect(c.blocked(cx, cz + 0.6, inside.feet, false, 0)).toBe(false);
    expect(c.blocked(cx + 1.26, cz, inside.feet, false, 0)).toBe(true);
  });

  it('front steps climb to a door that stands a storey above the street (D-132)', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    const g = s.city.grid;
    // A showcase Work Dome on a sloping block: its door stands about one unit above the street.
    const eid = s.city.buildingAt(289, 312);
    expect(s.city.buildingDef(eid).id).toBe('greenhouse-hub');
    const rec = s.city.buildingRecord(eid);
    const place = placeBuilding(g, s.city.buildingDef(eid), rec.x, rec.z, rec.rot);
    const steps = doorSteps(g, s.city.buildingDef(eid), place);
    expect(steps.length).toBeGreaterThan(4);
    const c = createCollider(s.city, undefined, () => true);
    const [cx, cz] = [rec.x + 1.5, rec.z + 1.5];
    let feet = g.heightAt(cx, cz + 2.6);
    const street = feet;
    let stops = 0;
    for (let lz = 2.6; lz >= 0.6; lz -= 0.03) {
      if (c.blocked(cx, cz + lz, feet, false, 0)) stops++;
      else feet = Math.max(feet, c.groundAt(cx, cz + lz, feet));
    }
    expect(stops).toBe(0);
    expect(feet - street).toBeGreaterThan(0.8);
  });

  it('ground height follows the drawn triangles, so feet meet the surface on a twisted tile', () => {
    const g = new Grid(2, 2);
    // One saddle tile: corners (0,0) and (1,1) high, (1,0) and (0,1) low. The mesh splits it along (1,0)–(0,1).
    g.heights.set([1, 0, 0, 0, 1, 0, 0, 0, 0]);
    for (const [x, z, h] of [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 1],
    ] as const)
      expect(g.heightAt(x, z)).toBeCloseTo(h, 5);
    // On the diagonal both triangles give 0 (a bilinear blend said 0.5 at the centre: feet half a unit in the air).
    expect(g.heightAt(0.5, 0.5)).toBeCloseTo(0, 5);
    // Each half is a plane through its three corners.
    expect(g.heightAt(0.25, 0.25)).toBeCloseTo(0.5, 5);
    expect(g.heightAt(0.75, 0.75)).toBeCloseTo(0.5, 5);
    // Continuous across the diagonal.
    expect(Math.abs(g.heightAt(0.5 - 1e-4, 0.5 - 1e-4) - g.heightAt(0.5 + 1e-4, 0.5 + 1e-4))).toBeLessThan(1e-3);
  });

  it('walkers stand on the highway surface, not on the ground under it', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city, 10);
    const g = s.city.grid;
    expect(s.commands.execute('road', { tiles: Array.from({ length: 6 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
    const c = createCollider(s.city);
    expect(c.groundAt(x0 + 2.3, z + 0.6, 99)).toBeCloseTo(g.heightAt(x0 + 2.3, z + 0.6) + ROAD_LIFT, 5);
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

  it('flying bodies and cameras respect building volumes and wild trees (D-055)', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const { x0, z } = findLandRow(s.city, 30);
    const g = s.city.grid;
    expect(s.commands.execute('road', { tiles: Array.from({ length: 20 }, (_, i) => g.index(x0 + i, z)) })).toBe(true);
    expect(s.commands.execute('build', { def: 'canopy-tower', x: x0, z: z - 3, rot: 0 })).toBe(true);
    // One wild tree in the open, two tiles along the street.
    const tile = g.index(x0 + 12, z + 2);
    const ty = g.heightAt(x0 + 12.5, z + 2.5);
    const tree = [x0 + 12.5, z + 2.5, ty, 0.8, 0.04, ty + 0.9, 0.3];
    expect(tree.length).toBe(TREE_STRIDE);
    const c = createCollider(s.city, (t) => (t === tile ? tree : undefined));
    const top = c.groundAt(x0 + 1.5, z - 1.5, 999);
    const street = g.heightAt(x0 + 1.5, z + 0.5);
    expect(top).toBeGreaterThan(street + 1);
    // A drone-sized ball inside the tower hits; clear above its roof garden, or over the street, it is free.
    expect(c.hits(x0 + 1.5, street + 0.6, z - 1.5, 0.15)).toBe(true);
    expect(c.hits(x0 + 1.5, top + 1.5, z - 1.5, 0.15)).toBe(false);
    expect(c.hits(x0 + 1.5, street + 0.6, z + 0.5, 0.15)).toBe(false);
    // A chase camera sweeping from the street into the tower stops short of its wall.
    const k = c.reach(new Vector3(x0 + 1.5, street + 0.6, z + 0.6), new Vector3(x0 + 1.5, street + 0.6, z - 2.5), 0.035);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(0.6);
    // Wild trees: the trunk stops a walker, the crown stops a drone, the air beside them is free.
    expect(c.blocked(x0 + 12.5, z + 2.5, ty, false, -10)).toBe(true);
    expect(c.hits(x0 + 12.5, ty + 0.9, z + 2.5, 0.15)).toBe(true);
    expect(c.hits(x0 + 13.4, ty + 0.9, z + 2.5, 0.15)).toBe(false);
  });
});

