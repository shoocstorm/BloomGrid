import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { ZONES, type ZoneKind } from '@/content/types';
import { Building } from '@/ecs/components';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { findSpot, makeSim } from './helpers';

const INDUSTRY = [
  'mycelium-brickworks',
  'kelp-refinery',
  'solar-glass-foundry',
  'circular-reclaimery',
  'drone-fabricator',
];
const SPORTS = ['bloom-stadium', 'aquatic-centre', 'wind-velodrome', 'climbing-tower', 'sports-fields'];

/** The founding city on the game's default seed, settled (residents moved in). */
function settled() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(400);
  return s;
}

describe('zoned founding city (D-049)', () => {
  it('plans every kind of zone and places every new building', () => {
    const { city } = settled();
    const kinds = new Set(city.districts.map((d) => d.zone));
    for (const k of Object.keys(ZONES) as ZoneKind[]) expect(kinds).toContain(k);
    const ids = new Map<string, number>();
    for (const e of city.buildingEntities())
      ids.set(city.buildingDef(e).id, (ids.get(city.buildingDef(e).id) ?? 0) + 1);
    for (const id of [...INDUSTRY, ...SPORTS, 'pod-interchange'])
      expect(ids.get(id) ?? 0, id).toBeGreaterThan(0);
  });

  it('keeps factories in industry zones and the big venues in sports zones', () => {
    const { city } = settled();
    const zoneOf = (eid: number) =>
      city.areaAt(
        Math.floor(Building.x[eid]! + Building.w[eid]! / 2),
        Math.floor(Building.z[eid]! + Building.d[eid]! / 2),
      )?.zone;
    for (const e of city.buildingEntities()) {
      const def = city.buildingDef(e);
      if (def.category === 'industry')
        expect(zoneOf(e), `${def.id} at ${Building.x[e]},${Building.z[e]}`).toBe('industry');
      if (['bloom-stadium', 'aquatic-centre', 'wind-velodrome'].includes(def.id))
        expect(zoneOf(e)).toBe('sports');
    }
  });

  it('commutes flow, everyone works, and the books balance once settled', () => {
    const { city } = settled();
    expect(city.pulse.tiers.mobility).toBeLessThanOrEqual(1);
    expect(city.pulse.flow).toBeGreaterThan(0.85);
    expect(city.pulse.unemployment).toBeLessThan(0.05);
    expect(city.stats.energyProduced).toBeGreaterThan(city.stats.energyUsed);
    expect(city.stats.income - city.stats.upkeep).toBeGreaterThan(0);
  });

  it('saves zones, and older saves load without them', () => {
    const { city } = settled();
    const data = JSON.parse(JSON.stringify(serializeCity(city))) as SaveData;
    expect(data.version).toBe(SAVE_VERSION);
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.districts).toEqual(city.districts);
    expect(other.hash()).toBe(city.hash());
    const v7 = {
      ...structuredClone(data),
      version: 7,
      districts: data.districts.map((d) => d.slice(0, 5)),
    } as unknown as SaveData;
    const old = new City(new EventBus(), 1);
    deserializeCity(old, migrateSave(v7));
    expect(old.districts.map((d) => d.name)).toEqual(city.districts.map((d) => d.name));
    expect(old.districts.every((d) => d.zone === undefined)).toBe(true);
    // The zone is part of the city's identity.
    expect(old.hash()).not.toBe(city.hash());
  });

  it('new industry and sports buildings build and undo', () => {
    const s = makeSim(5);
    for (const id of ['drone-fabricator', 'sports-fields']) {
      const { x, z } = findSpot(s.city, id);
      const before = s.city.buildingEntities().length;
      expect(s.commands.execute('build', { def: id, x, z, rot: 0 }), id).toBe(true);
      s.commands.undo();
      expect(s.city.buildingEntities().length).toBe(before);
    }
  });
});
