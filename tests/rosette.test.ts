import { describe, expect, it } from 'vitest';
import { makeSim } from './helpers';
import { applyScenario } from '@/sim/scenario';

describe('sky-lane rosette (D-234)', () => {
  it('lays the showcase hubs out as two rings round the Nexus, one network, ring links curved like their circle', () => {
    for (const seed of [20261024, 42]) {
      const s = makeSim(seed);
      applyScenario(s.city, 'founding-city');
      s.step(120);
      const { hubs, links } = s.city.pulse.skylanes;
      const centre = hubs.findIndex((h) => h.central);
      expect(centre, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      // The Nexus, the Skyport and the two rings (a spot or two may find no lot on another seed).
      expect(hubs.length, `seed ${seed}`).toBeGreaterThanOrEqual(17);
      expect(new Set(hubs.map((h) => h.net)).size, `seed ${seed}`).toBe(1);
      const trunks = links.filter((l) => l.kind === 'trunk');
      // Spokes from the Nexus to the inner ring.
      expect(trunks.filter((l) => l.a === centre || l.b === centre).length).toBeGreaterThanOrEqual(5);
      // Ring links and petals carry a designed curve.
      expect(trunks.filter((l) => l.bow !== undefined).length, `seed ${seed}`).toBeGreaterThanOrEqual(20);
      for (const l of trunks) if (l.bow !== undefined) expect(Math.abs(l.bow)).toBeLessThan(0.36);
    }
  });
});
