import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { computeFields } from '@/sim/fields';
import { allOverlays } from '@/sim/overlays';
import { evaluateAdvisor } from '@/sim/advisor';
import { makeSim } from './helpers';

function founded() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(100);
  return s;
}

describe('spatial fields', () => {
  it('pollution concentrates around polluters and desirability stays in range', () => {
    const s = founded();
    computeFields(s.city, s.city.fields);
    const { pollution, desirability, shore } = s.city.fields;
    let maxP = 0;
    for (const v of pollution) maxP = Math.max(maxP, v);
    expect(maxP).toBeGreaterThan(0.1);
    for (let i = 0; i < desirability.length; i++) {
      expect(desirability[i]).toBeGreaterThanOrEqual(0);
      expect(desirability[i]).toBeLessThanOrEqual(1);
    }
    expect(shore.some((d) => d === 0)).toBe(true);
  });
});

describe('overlays', () => {
  it('every lens produces values in [0,1] with some data', () => {
    const s = founded();
    const n = s.city.grid.w * s.city.grid.h;
    for (const o of allOverlays()) {
      const value = new Float32Array(n);
      const mask = new Uint8Array(n);
      o.compute(s.city, s.city.fields, value, mask);
      let has = 0;
      for (let i = 0; i < n; i++) {
        if (!mask[i]) continue;
        has++;
        expect(value[i]).toBeGreaterThanOrEqual(0);
        expect(value[i]).toBeLessThanOrEqual(1);
      }
      expect(has, o.id).toBeGreaterThan(100);
    }
  });
});

describe('advisor', () => {
  it('flags the founding water shortage with a coastal fix', () => {
    const s = founded();
    const water = evaluateAdvisor(s.city).find((a) => a.id === 'water');
    expect(water).toBeDefined();
    expect(water!.build).toBe('water-works');
    expect(water!.focus).toBeDefined();
  });

  it('raises a critical energy advisory during a blackout', () => {
    const s = founded();
    for (const e of [...s.city.buildingEntities()]) {
      if (s.city.buildingDef(e).stats.energy > 0) {
        const r = s.city.buildingRecord(e);
        s.commands.execute('demolish', { x: r.x, z: r.z }, false);
      }
    }
    s.step(30);
    const list = evaluateAdvisor(s.city);
    const energy = list.find((a) => a.id === 'energy')!;
    expect(energy.severity).toBe(2);
    expect(list[0]!.severity).toBe(2); // most severe first
  });
});

describe('network stats', () => {
  it('tracks per-network supply', () => {
    const s = founded();
    const nets = s.city.pulse.networks;
    expect(nets.length).toBeGreaterThan(0);
    const main = nets.reduce((a, b) => (b.buildings > a.buildings ? b : a));
    expect(main.buildings).toBeGreaterThan(1000);
    expect(main.energyProduced).toBeGreaterThan(0);
  });
});
