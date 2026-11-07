import { describe, expect, it } from 'vitest';
import { buildings } from '@/content';
import { placementPreview, serviceArea } from '@/sim/placementPreview';
import { findLandRow, makeSim } from './helpers';

describe('placement preview (D-121)', () => {
  it('names the partner a bioreactor would pair with, and the one a reed bed would complete', () => {
    const s = makeSim(7);
    const { x0, z } = findLandRow(s.city);
    expect(s.commands.execute('build', { def: 'phyto-garden', x: x0, z, rot: 0 })).toBe(true);
    const reactor = buildings.get('bioreactor');
    const near = placementPreview(s.city, reactor, x0 + 4, z, 0);
    expect(near.pairsWith).toEqual([buildings.get('phyto-garden').name]);
    expect(near.area?.label).toBe('pairing range');
    const far = placementPreview(s.city, reactor, x0 + 30, z, 0);
    expect(far.pairsWith).toEqual([]);

    expect(s.commands.execute('build', { def: 'bioreactor', x: x0 + 30, z, rot: 0 })).toBe(true);
    const reeds = placementPreview(s.city, buildings.get('phyto-garden'), x0 + 26, z, 0);
    expect(reeds.completes).toEqual([reactor.name]);
  });

  it('reads the lot land value and gives service buildings an area', () => {
    const s = makeSim(7);
    const { x0, z } = findLandRow(s.city);
    const p = placementPreview(s.city, buildings.get('garden-residence'), x0, z, 0);
    expect(p.landValue).toBeGreaterThan(0);
    expect(p.landValue).toBeLessThanOrEqual(1);
    expect(p.area).toBeNull();
    const withArea = buildings.all().filter((d) => serviceArea(d));
    expect(withArea.length).toBeGreaterThan(3);
    for (const d of withArea) expect(serviceArea(d)!.radius).toBeGreaterThan(0);
  });
});
