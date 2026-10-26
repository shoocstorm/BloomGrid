import { describe, expect, it } from 'vitest';
import { City } from '@/sim/City';
import { EventBus } from '@/core/EventBus';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { buildings } from '@/content';
import { applyScenario } from '@/sim/scenario';
import { Building } from '@/ecs/components';
import { RoadNetworks } from '@/sim/networks';
import { openingView } from '@/game/opening';
import { GRID, GRID_N, GRID_S, GRID_W, HERO_IDS } from '@/content/scenarios/founding-city';
import { findBridgeSpans } from '@/sim/bridges';
import { makeSim } from './helpers';

describe('save migrations', () => {
  it('a version-1 save migrates through every step to the current format and loads', () => {
    const s = makeSim(7);
    applyScenario(s.city, 'founding-city');
    s.step(20);
    const cur = serializeCity(s.city);
    // Rebuild the oldest format: buildings as [def, x, z, rot, greenery], no later sections.
    const v1 = {
      version: 1,
      seed: cur.seed,
      tick: cur.tick,
      timeOfDay: cur.timeOfDay,
      day: cur.day,
      credits: cur.credits,
      rngState: cur.rngState,
      buildings: cur.buildings.map((b) => b.slice(0, 5)),
      roads: cur.roads,
      modules: {},
    } as unknown as SaveData;
    const m = migrateSave(structuredClone(v1));
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.buildings[0]!.length).toBe(8);
    expect(m.channels).toEqual([]);
    expect(m.terrain).toEqual([]);
    expect(m.bridges).toEqual([]);
    expect(m.steward.seaRise).toBe(0);
    const c2 = new City(new EventBus(), 1);
    deserializeCity(c2, structuredClone(v1));
    expect(c2.buildingEntities().length).toBe(s.city.buildingEntities().length);
    expect(c2.roadTiles().length).toBe(s.city.roadTiles().length);
  });

  it('refuses unknown future versions instead of loading garbage', () => {
    const s = makeSim(7);
    const data = { ...serializeCity(s.city), version: SAVE_VERSION + 1 };
    expect(() => migrateSave(data)).toThrow(/Unsupported save version/);
  });
});

describe('hero assets', () => {
  it('GLB landmarks carry a procedural fallback so the game works without the files', () => {
    const heroes = buildings.all().filter((d) => typeof d.recipe !== 'function');
    expect(heroes.map((d) => d.id).sort()).toEqual(['lotus-pavilion', 'supertree-grove']);
    for (const d of heroes) {
      const r = d.recipe as { glb: string; fallback?: unknown };
      expect(r.glb).toMatch(/^\/assets\/.+\.glb$/);
      expect(typeof r.fallback).toBe('function');
    }
  });
});

describe('central landmark', () => {
  it('the founding city grades a street grid at the island centre for the Wellspring Spire and its hero district, with road access, and saves it', () => {
    const s = makeSim(7);
    applyScenario(s.city, 'founding-city');
    const g = s.city.grid;
    const h = s.city.size / 2;
    const eid = g.occupant[g.index(h, h)]!;
    expect(eid).toBeGreaterThanOrEqual(0);
    expect(buildings.at(Building.def[eid]!).id).toBe('wellspring-spire');
    const [x, z] = [Building.x[eid]!, Building.z[eid]!];
    const { min, max } = g.rangeOver(x, z, 14, 14);
    expect(max - min).toBeLessThan(0.01);
    expect(RoadNetworks.touchesRoad(g, x, z, 14, 14)).toBe(true);
    expect(s.city.terrainEdits.size).toBeGreaterThan(200);
    // The hero district around it: every hero placed, each with highway access, and empty graded lots left
    // on the grid for future heroes.
    expect(HERO_IDS.length).toBe(39);
    for (const id of HERO_IDS) {
      const e = s.city.buildingEntities().find((b) => buildings.at(Building.def[b]!).id === id);
      expect(e, id).toBeDefined();
      expect(RoadNetworks.touchesRoad(g, Building.x[e!]!, Building.z[e!]!, Building.w[e!]!, Building.d[e!]!), id).toBe(true);
    }
    let lots = 0;
    for (let j = -GRID_N; j <= GRID_S; j++)
      for (let i = -GRID_W; i <= GRID_W; i++) {
        const [bx, bz] = [x + GRID * i, z + GRID * j];
        let free = true;
        for (let k = 0; k < (GRID - 1) ** 2 && free; k++) {
          const t = g.index(bx + (k % (GRID - 1)), bz + Math.floor(k / (GRID - 1)));
          free = g.occupant[t] === -1 && !g.road[t] && !s.city.isWaterTile(bx + (k % (GRID - 1)), bz + Math.floor(k / (GRID - 1)));
        }
        if (free && g.rangeOver(bx, bz, GRID - 1, GRID - 1).max - g.rangeOver(bx, bz, GRID - 1, GRID - 1).min < 0.01) lots++;
      }
    expect(lots).toBeGreaterThanOrEqual(10);
    expect(openingView(s.city).x).toBeLessThan(h);
    s.step(10);
    const c2 = new City(new EventBus(), 1);
    deserializeCity(c2, structuredClone(serializeCity(s.city)));
    expect(c2.grid.rangeOver(x, z, 14, 14).max).toBeCloseTo(max, 2);
    expect(c2.hash()).toBe(s.city.hash());
  });
});

describe('amusement park', () => {
  it('the founding city opens Bloomtopia on the south islet, its gate on the bridge from downtown', () => {
    for (const seed of [7, 4242]) {
      const s = makeSim(seed);
      applyScenario(s.city, 'founding-city');
      const g = s.city.grid;
      const e = s.city.buildingEntities().find((b) => buildings.at(Building.def[b]!).id === 'bloomtopia');
      expect(e, `seed ${seed}`).toBeDefined();
      const [x, z] = [Building.x[e!]!, Building.z[e!]!];
      expect(z).toBeGreaterThan(s.city.size * 0.8);
      // The bridge lands at the gate, mid-way along the north fence.
      const gate = g.index(x + Building.w[e!]! / 2, z - 1);
      expect(g.road[gate]).toBeGreaterThan(0);
      expect(g.road[gate - g.w * 14]).toBe(2); // a bridge tile over the strait
    }
  });
});


describe('signature bridges', () => {
  it('finds the founding city’s long straight bridge spans, including the strait to Bloomtopia', () => {
    const s = makeSim(7);
    applyScenario(s.city, 'founding-city');
    const spans = findBridgeSpans(s.city.grid, 8);
    expect(spans.length).toBeGreaterThanOrEqual(6);
    expect(spans.some((sp) => !sp.alongX && sp.len >= 45)).toBe(true);
    for (const sp of spans)
      for (let k = 0; k < sp.len; k++) expect(s.city.grid.road[s.city.grid.index(sp.x + (sp.alongX ? k : 0), sp.z + (sp.alongX ? 0 : k))]).toBe(2);
  });
});
