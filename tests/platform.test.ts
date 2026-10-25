import { describe, expect, it } from 'vitest';
import { City } from '@/sim/City';
import { EventBus } from '@/core/EventBus';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { buildings } from '@/content';
import { applyScenario } from '@/sim/scenario';
import { Building } from '@/ecs/components';
import { RoadNetworks } from '@/sim/networks';
import { openingView } from '@/game/opening';
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
  it('the founding city levels a terrace at the island centre for the Wellspring Spire and its hero quarter, with road access, and saves it', () => {
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
    // The hero quarter around it, each with highway access.
    const heroes = ['helix-spire', 'hanging-gardens', 'sky-ark', 'cloud-domes'];
    heroes.push('rain-vortex', 'dragonfly-port', 'mycelium-towers', 'algae-lantern', 'vertical-forest');
    heroes.push('fog-harp', 'nautilus-library', 'quartz-spire', 'bamboo-cathedral', 'starlight-observatory');
    heroes.push('elder-banyan', 'levitating-gardens', 'solar-sail-bazaar', 'habitat-cascade', 'aeolian-reeds');
    for (const id of heroes) {
      const e = s.city.buildingEntities().find((b) => buildings.at(Building.def[b]!).id === id);
      expect(e, id).toBeDefined();
      expect(RoadNetworks.touchesRoad(g, Building.x[e!]!, Building.z[e!]!, Building.w[e!]!, Building.d[e!]!), id).toBe(true);
    }
    expect(openingView(s.city).x).toBeLessThan(h);
    s.step(10);
    const c2 = new City(new EventBus(), 1);
    deserializeCity(c2, structuredClone(serializeCity(s.city)));
    expect(c2.grid.rangeOver(x, z, 14, 14).max).toBeCloseTo(max, 2);
    expect(c2.hash()).toBe(s.city.hash());
  });
});
