import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { Service } from '@/ecs/components';
import {
  AEROLINE_LEVELS,
  MAX_AEROLINE_LEVEL,
  aerolineBlock,
  aerolineLevel,
  aerolineRiders,
  aerolineUpgradeCost,
} from '@/sim/aeroline';
import { computeMobility } from '@/sim/mobility';
import { deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { findSpot, makeSim } from './helpers';

describe('Aeroline line levels (D-170)', () => {
  it('needs a station, then upgrades to level 3 and undoes back with the credits', () => {
    const s = makeSim(7);
    s.city.credits = 1e6;
    expect(aerolineLevel(s.city)).toBe(1);
    expect(aerolineBlock(s.city)?.reason).toMatch(/station/);
    expect(s.commands.execute('upgradeAeroline', {})).toBe(false);
    const at = findSpot(s.city, 'aeroline-station');
    expect(s.commands.execute('build', { def: 'aeroline-station', x: at.x, z: at.z, rot: 0 })).toBe(true);

    const levels: number[] = [];
    s.bus.on('aeroline:level', ({ level }) => levels.push(level));
    const before = s.city.credits;
    const h1 = s.city.hash();
    expect(s.commands.execute('upgradeAeroline', {})).toBe(true);
    expect(aerolineLevel(s.city)).toBe(2);
    expect(s.city.credits).toBe(before - AEROLINE_LEVELS[1]!.cost);
    expect(s.city.hash()).not.toBe(h1);
    expect(s.commands.execute('upgradeAeroline', {})).toBe(true);
    expect(aerolineLevel(s.city)).toBe(MAX_AEROLINE_LEVEL);
    expect(aerolineUpgradeCost(s.city)).toBe(0);
    expect(s.commands.execute('upgradeAeroline', {})).toBe(false);
    s.commands.undo();
    s.commands.undo();
    expect(aerolineLevel(s.city)).toBe(1);
    expect(s.city.credits).toBe(before);
    expect(s.city.hash()).toBe(h1);
    expect(levels).toEqual([2, 3, 2, 1]);
  });

  it('is blocked without the credits', () => {
    const s = makeSim(7);
    s.city.credits = 1e6;
    const at = findSpot(s.city, 'aeroline-station');
    s.commands.execute('build', { def: 'aeroline-station', x: at.x, z: at.z, rot: 0 });
    s.city.credits = 10;
    expect(aerolineBlock(s.city)?.short).toBeGreaterThan(0);
    expect(s.commands.execute('upgradeAeroline', {})).toBe(false);
  });

  it('carries more rail riders per level', () => {
    const s = makeSim(7);
    s.city.credits = 1e6;
    const at = findSpot(s.city, 'aeroline-station');
    s.commands.execute('build', { def: 'aeroline-station', x: at.x, z: at.z, rot: 0 });
    expect(aerolineRiders(s.city)).toBe(1);
    s.commands.execute('upgradeAeroline', {});
    expect(aerolineRiders(s.city)).toBeGreaterThan(1);
    // The mobility pass runs with the multiplier without failing.
    computeMobility(s.city);
    expect(Number.isFinite(Service.riders[0] ?? 0)).toBe(true);
  });

  it('round-trips through a save, and older saves load at level 1', () => {
    const s = makeSim(7);
    s.city.credits = 1e6;
    const at = findSpot(s.city, 'aeroline-station');
    s.commands.execute('build', { def: 'aeroline-station', x: at.x, z: at.z, rot: 0 });
    s.commands.execute('upgradeAeroline', {});
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(aerolineLevel(other)).toBe(2);
    expect(other.hash()).toBe(s.city.hash());

    const old = JSON.parse(JSON.stringify(data)) as SaveData;
    old.version = 24;
    delete (old.growth as Partial<typeof old.growth>).aerolineLevel;
    const third = new City(new EventBus(), 1);
    deserializeCity(third, migrateSave(old));
    expect(aerolineLevel(third)).toBe(1);
  });
});
