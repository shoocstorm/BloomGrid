import { describe, expect, it } from 'vitest';
import { buildings } from '@/content';
import { applyScenario } from '@/sim/scenario';
import { nameDistricts } from '@/sim/districtNaming';
import { deserializeCity, serializeCity } from '@/sim/save';
import { makeSim } from './helpers';

function fresh(seed = 20261024) {
  const s = makeSim(seed);
  applyScenario(s.city, 'fresh-island');
  s.city.credits = 1e6;
  return s;
}

/** Places `n` homes in a tight patch far from the hamlet; returns their centre. */
function buildPatch(s: ReturnType<typeof makeSim>, n: number, sx: number, sz: number): number {
  const def = buildings.get('garden-residence');
  let placed = 0;
  for (let z = sz; z < sz + 24 && placed < n; z += def.footprint[1] + 1)
    for (let x = sx; x < sx + 24 && placed < n; x += def.footprint[0] + 1)
      if (s.city.checkPlacement(def, x, z, 0).ok && s.commands.execute('build', { def: def.id, x, z, rot: 0 })) placed++;
  return placed;
}

/** A dry stretch of open country well away from the hamlet's district. */
function openCountry(s: ReturnType<typeof makeSim>): { x: number; z: number } {
  const c = s.city;
  for (let z = 120; z < 360; z += 8)
    for (let x = 120; x < 360; x += 8) {
      if (c.areaAt(x, z) || c.districts.some((d) => Math.abs(d.x0 - x) < 60 && Math.abs(d.z0 - z) < 60)) continue;
      const { min, max } = c.grid.rangeOver(x, z, 24, 24);
      if (min > 0.5 && max - min < 3) return { x, z };
    }
  throw new Error('no open country');
}

describe('districts that name themselves (D-242)', () => {
  it('names a cluster of new buildings in open country, once, and keeps the names unique', () => {
    const s = fresh();
    const before = s.city.districts.length;
    const at = openCountry(s);
    expect(buildPatch(s, 6, at.x, at.z)).toBeGreaterThanOrEqual(4);
    const named: string[] = [];
    s.bus.on('district:named', (e) => named.push(e.name));
    const founded = nameDistricts(s.city);
    expect(founded.length).toBe(1);
    expect(named).toEqual(founded);
    expect(s.city.districts.length).toBe(before + 1);
    const d = s.city.districts.at(-1)!;
    expect(d.zone).toBe('living');
    expect(d.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    // Every building of the patch is inside it now; a second pass founds nothing.
    expect(nameDistricts(s.city)).toEqual([]);
    const names = s.city.districts.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('leaves a lone building or two as outskirts', () => {
    const s = fresh();
    const at = openCountry(s);
    buildPatch(s, 2, at.x, at.z);
    expect(nameDistricts(s.city)).toEqual([]);
  });

  it('grows a district over a building built just past its edge, without overlapping another', () => {
    const s = fresh();
    const at = openCountry(s);
    buildPatch(s, 5, at.x, at.z);
    nameDistricts(s.city);
    const d = s.city.districts.at(-1)!;
    const width = d.x1 - d.x0;
    const def = buildings.get('pocket-park');
    let built = false;
    for (let x = d.x1 + 1; x <= d.x1 + 3 && !built; x++)
      for (let z = d.z0; z <= d.z1 && !built; z++)
        if (s.city.checkPlacement(def, x, z, 0).ok) built = !!s.commands.execute('build', { def: def.id, x, z, rot: 0 });
    expect(built).toBe(true);
    nameDistricts(s.city);
    const grown = s.city.districts.find((x) => x.name === d.name)!;
    expect(grown.x1 - grown.x0).toBeGreaterThan(width);
    for (const a of s.city.districts)
      for (const b of s.city.districts)
        if (a !== b) expect(a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1).toBe(false);
  });

  it('runs on the pulse only on growing islands, deterministically, and survives a save', () => {
    const run = () => {
      const s = fresh();
      const at = openCountry(s);
      buildPatch(s, 6, at.x, at.z);
      s.step(120);
      return s;
    };
    const a = run();
    const b = run();
    expect(a.city.districts.length).toBeGreaterThan(1);
    expect(a.city.hash()).toBe(b.city.hash());
    const back = makeSim(1);
    deserializeCity(back.city, serializeCity(a.city));
    expect(back.city.districts).toEqual(a.city.districts);

    const show = makeSim(20261024);
    applyScenario(show.city, 'founding-city');
    const names = show.city.districts.map((x) => x.name);
    show.step(120);
    expect(show.city.districts.map((x) => x.name)).toEqual(names);
  });
});
