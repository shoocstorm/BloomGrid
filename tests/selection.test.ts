import { describe, expect, it } from 'vitest';
import { Building } from '@/ecs/components';
import { applyScenario } from '@/sim/scenario';
import { selectInRect } from '@/sim/select';
import { makeSim } from './helpers';

/** The founding city on the default seed (no settling needed: selection reads placement only). */
function founded() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  return s;
}

describe('group selection and batch removal (D-070)', () => {
  it('boxes buildings of the anchor’s type, or the most common type when the box starts on open ground', () => {
    const { city } = founded();
    const anchor = city.buildingEntities().find((e) => city.buildingDef(e).id === 'canopy-tower')!;
    const [ax, az] = [Building.x[anchor]!, Building.z[anchor]!];
    const r = selectInRect(city, ax, az, ax + 40, az + 40);
    expect(r.def).toBe('canopy-tower');
    expect(r.eids[0]).toBe(anchor);
    expect(r.eids.length).toBeGreaterThan(1);
    for (const e of r.eids) expect(city.buildingDef(e).id).toBe('canopy-tower');
    // Open sea: nothing.
    expect(selectInRect(city, 0, 0, 6, 6)).toEqual({ def: null, eids: [] });
  });

  it('removes a group in one step, refunds half, and one undo restores every building and id', () => {
    const s = founded();
    const { city } = s;
    const anchor = city.buildingEntities().find((e) => city.buildingDef(e).id === 'canopy-tower')!;
    const [ax, az] = [Building.x[anchor]!, Building.z[anchor]!];
    const { eids } = selectInRect(city, ax, az, ax + 40, az + 40);
    const uids = eids.map((e) => Building.uid[e]!).sort((a, b) => a - b);
    const before = city.hash();
    const credits = city.credits;
    const count = city.buildingEntities().length;
    expect(
      s.commands.execute('demolishMany', { tiles: eids.map((e) => [Building.x[e]!, Building.z[e]!]) }),
    ).toBe(true);
    expect(city.buildingEntities().length).toBe(count - eids.length);
    expect(city.credits).toBeCloseTo(credits + eids.length * city.buildingDef(anchor).stats.cost * 0.5, 3);
    s.commands.undo();
    expect(city.buildingEntities().length).toBe(count);
    expect(uids.every((u) => city.buildingByUid(u) >= 0)).toBe(true);
    expect(city.hash()).toBe(before);
    expect(s.commands.execute('demolishMany', { tiles: [[0, 0]] })).toBe(false);
  });
});
