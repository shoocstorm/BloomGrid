import { describe, expect, it } from 'vitest';
import { buildings } from '@/content';
import { buildingTemplate } from '@/modules/construction/BuildingRenderer';

/** Moving parts on heroes (D-139): wheels, rides, rotors and clock hands, render-only. */
describe('moving parts (D-139)', () => {
  const spins = (id: string, tier = 2) => buildingTemplate(buildings.get(id)!, 0).pieces.concat(buildingTemplate(buildings.get(id)!, 0).ranged).filter((p) => p.spin && (p.from ?? 0) <= tier);

  it('every building with a Stop / Start action has parts that move, and each part says how', () => {
    const movers = buildings.all().filter((d) => d.motion);
    expect(movers.map((d) => d.id).sort()).toEqual(['bloom-eye', 'bloomtopia', 'great-noria', 'helix-spire']);
    for (const d of movers) {
      const parts = spins(d.id);
      expect(parts.length, d.id).toBeGreaterThan(5);
      for (const p of parts) expect(Math.abs(p.spin!.speed), d.id).toBeGreaterThan(0);
    }
  });

  it('Bloomtopia runs its wheel (level gondolas), its drop tower and its spinning rides', () => {
    const parts = spins('bloomtopia');
    expect(parts.some((p) => p.spin!.upright && p.spin!.axis === 'z')).toBe(true);
    expect(parts.some((p) => (p.spin!.lift ?? 0) > 10)).toBe(true);
    expect(new Set(parts.filter((p) => (p.spin!.axis ?? 'y') === 'y' && !p.spin!.lift).map((p) => p.spin!.at.join()))).toSatisfy((s: Set<string>) => s.size >= 3);
  });

  it('the Bloom Clock has an hour and a minute hand on each face, with no switch', () => {
    const hands = spins('bloom-clock').map((p) => p.spin!.clock);
    expect(hands.filter((h) => h === 'hour')).toHaveLength(2);
    expect(hands.filter((h) => h === 'minute')).toHaveLength(2);
    expect(buildings.get('bloom-clock')!.motion).toBeUndefined();
  });
});
