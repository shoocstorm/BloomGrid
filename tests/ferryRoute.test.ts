import { describe, expect, it } from 'vitest';
import { makeSim } from './helpers';
import { applyScenario } from '@/sim/scenario';
import { WONDER_SITES } from '@/modules/scenery/sites';
import { BERTH_ALONG, BERTH_SIDE, Course, findPier, pierPoint, seaMap, seaRoute, voyageCourse, type P2 } from '@/modules/ferry/route';

/** The cruise ferry's courses (D-141): a pier with room, and water under the hull all the way to every wonder. */
describe('ferry routes', () => {
  const { city } = makeSim(20261024);
  applyScenario(city, 'founding-city');
  const g = city.grid;
  const S = city.size;
  const sites: [string, P2, number][] = [
    ['lotus', [WONDER_SITES.lotus[0] * S, WONDER_SITES.lotus[1] * S], 30],
    ['dome', [WONDER_SITES.dome[0] * S, WONDER_SITES.dome[1] * S], 30],
    ['lighthouse', [WONDER_SITES.lighthouse[0] * S, WONDER_SITES.lighthouse[1] * S], 26],
    ['tideGates', [WONDER_SITES.tideGates[0] * S, WONDER_SITES.tideGates[1] * S], 32],
    ['stacks', [WONDER_SITES.stacks[0] * S, WONDER_SITES.stacks[1] * S], 22],
  ];
  const pier = findPier(g, [296, 436]);
  const sea = seaMap(g);

  it('finds a pier with a deep berth', () => {
    expect(pier).not.toBeNull();
    const [bx, bz] = pierPoint(pier!, BERTH_ALONG, BERTH_SIDE);
    expect(g.heightAt(bx, bz)).toBeLessThan(-0.5);
  });

  it('keeps the hull over water on every voyage', () => {
    for (const [name, at, r] of sites) {
      const plan = voyageCourse(sea, pier!, at, r);
      expect(plan, name).not.toBeNull();
      const c = plan!.course;
      const p: P2 = [0, 0];
      // Past the berth approach (the last stretch runs in beside the pier), the whole beam is over deep water.
      for (let s = 0; s < c.length - BERTH_ALONG - 12; s += 1) {
        const h = c.sample(s, p);
        const [nx, nz] = [-Math.sin(h), Math.cos(h)];
        for (const k of [-2, 0, 2]) {
          const y = g.heightAt(p[0] + nx * k, p[1] + nz * k);
          if (y > -0.3) throw new Error(`${name}: hull over ground (${y.toFixed(2)}) at ${p[0].toFixed(1)}, ${p[1].toFixed(1)}, s = ${s}`);
        }
      }
      expect(plan!.loop[1]).toBeGreaterThan(plan!.loop[0]);
    }
  });

  it('routes round a fence of obstacles rather than through it', () => {
    // A wall of obstacles straight across open water south of the island.
    const wall: P2[] = [];
    for (let x = 0; x <= 512; x += 11) wall.push([x, 470]);
    const fenced = seaMap(g, wall);
    expect(seaRoute(fenced, [300, 450], [300, 495])).toBeNull();
    expect(seaRoute(sea, [300, 450], [300, 495])).not.toBeNull();
  });

  it('samples a course by arc length', () => {
    const c = new Course([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    const p: P2 = [0, 0];
    expect(c.length).toBe(20);
    expect(c.sample(15, p)).toBeCloseTo(Math.PI / 2);
    expect(p).toEqual([10, 5]);
  });
});
