import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { arcProfile, arcY, BOW_MAX, BOWS, legBow, legCode, legLift, legXZ, podInfo, podPathAt } from '@/modules/mobility/skypath';

describe('sky-lane flight (D-051, D-053, D-166)', () => {
  it('arcs are symmetric in their ends and lift raises the crest by exactly the lift', () => {
    for (const t of [0.1, 0.3, 0.5]) expect(arcY(3, 9, t, 40, 5)).toBeCloseTo(arcY(9, 3, 1 - t, 40, 5), 9);
    expect(arcY(3, 3, 0.5, 40, 7) - arcY(3, 3, 0.5, 40, 0)).toBeCloseTo(7, 9);
    expect(arcProfile(0)).toBe(0);
    expect(arcProfile(1)).toBe(0);
  });

  it('a leg code round-trips its lift and every bow the planner tries', () => {
    for (const lift of [0, 1, 6, 90])
      for (const bow of BOWS) {
        const c = legCode(lift, bow);
        expect(legLift(c)).toBe(lift);
        expect(legBow(c)).toBeCloseTo(bow, 9);
      }
    expect(Math.max(...BOWS)).toBeCloseTo(BOW_MAX, 9);
    expect(BOWS[0]).toBe(0);
  });

  it('a bowed track starts and ends on its ends, swings left at the middle, and its reverse is the same track', () => {
    expect(legXZ(0, 0, 40, 0, 0.25, 0)).toEqual([0, 0]);
    const [ex, ez] = legXZ(0, 0, 40, 0, 0.25, 1);
    expect(ex).toBeCloseTo(40, 9);
    expect(ez).toBeCloseTo(0, 9);
    const [mx, mz] = legXZ(0, 0, 40, 0, 0.25, 0.5);
    expect(mx).toBeCloseTo(20, 9);
    expect(mz).toBeCloseTo(10, 9);
    for (const t of [0.2, 0.5, 0.8]) {
      const [x1, z1] = legXZ(5, 3, 45, 21, 0.2, t);
      const [x2, z2] = legXZ(45, 21, 5, 3, -0.2, 1 - t);
      expect(x1).toBeCloseTo(x2, 9);
      expect(z1).toBeCloseTo(z2, 9);
    }
  });

  it('packs the leg codes beside seed and speed, and a pod rides its lifted, bowed lane', () => {
    const code = legCode(6, BOWS[3]!);
    const info = new Float32Array(podInfo(3, 5, 0.25, 1.5, code, legCode(0, 0)));
    expect(Math.floor(info[2]!)).toBe(code);
    expect(info[2]! % 1).toBeCloseTo(0.25, 3);
    expect(info[3]! - 4 * Math.floor(info[3]! / 4)).toBeCloseTo(1.5, 3);
    // A direct pod (no hub): wherever it is along A → B, it sits on the lane's bowed track at arcY with lift 6.
    const route = new Float32Array([10, 10, 50, 10]);
    const via = new Float32Array(4);
    const p = new Vector3();
    for (const clock of [0.7, 3.1, 9.4]) {
      podPathAt(route, via, info, 0, clock, p);
      const t = (p.x - 10) / 40;
      const [, z] = legXZ(10, 10, 50, 10, legBow(code), t);
      expect(p.z).toBeCloseTo(z, 3);
      expect(p.y).toBeCloseTo(arcY(3, 5, t, 40, 6), 3);
    }
  });
});
