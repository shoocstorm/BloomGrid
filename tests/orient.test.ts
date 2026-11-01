import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { buildings } from '@/content';
import { findSites } from '@/sim/actionTools';
import { seawardScore } from '@/sim/orient';
import { makeSim } from './helpers';

describe('waterside buildings face the water (D-095)', () => {
  it('the fresh island’s dock and water works are placed facing the sea', () => {
    for (const seed of [20261024, 7, 1337]) {
      const s = makeSim(seed);
      applyScenario(s.city, 'fresh-island');
      for (const e of s.city.buildingEntities()) {
        const def = s.city.buildingDef(e);
        if (!def.placement?.nearWater) continue;
        const r = s.city.buildingRecord(e);
        expect(seawardScore(s.city, def, r.x, r.z, r.rot), `${def.id} seed ${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it('sites offered for a dock face the water', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    const dock = buildings.get('fishing-dock');
    s.city.credits = 1e6;
    // Near the founding city's waterside buildings (its coast has highways).
    const coast = s.city.buildingEntities().filter((e) => s.city.buildingDef(e).placement?.nearWater);
    let offered = 0;
    for (const e of coast.slice(0, 4)) {
      const r = s.city.buildingRecord(e);
      for (const site of findSites(s.city, dock, { x: r.x, z: r.z }, 3)) {
        offered++;
        expect(seawardScore(s.city, dock, site.x, site.z, site.rot)).toBeGreaterThan(0);
      }
    }
    expect(offered).toBeGreaterThan(0);
  });
});
