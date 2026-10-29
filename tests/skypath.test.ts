import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { arcProfile, arcY, podInfo, podPathAt } from '@/modules/mobility/skypath';

describe('sky-lane flight (D-051, D-053)', () => {
  it('arcs are symmetric in their ends and lift raises the crest by exactly the lift', () => {
    for (const t of [0.1, 0.3, 0.5]) expect(arcY(3, 9, t, 40, 5)).toBeCloseTo(arcY(9, 3, 1 - t, 40, 5), 9);
    expect(arcY(3, 3, 0.5, 40, 7) - arcY(3, 3, 0.5, 40, 0)).toBeCloseTo(7, 9);
    expect(arcProfile(0)).toBe(0);
    expect(arcProfile(1)).toBe(0);
  });

  it('packs the leg lifts beside seed and speed, and a pod rides its lifted lane', () => {
    const info = new Float32Array(podInfo(3, 5, 0.25, 1.5, 6, 0));
    expect(Math.floor(info[2]!)).toBe(6);
    expect(info[2]! % 1).toBeCloseTo(0.25, 5);
    expect(info[3]! - 4 * Math.floor(info[3]! / 4)).toBeCloseTo(1.5, 5);
    // A direct pod (no hub): wherever it is along A → B, it sits on arcY with lift 6.
    const route = new Float32Array([10, 10, 50, 10]);
    const via = new Float32Array(4);
    const p = new Vector3();
    for (const clock of [0.7, 3.1, 9.4]) {
      podPathAt(route, via, info, 0, clock, p);
      const t = (p.x - 10) / 40;
      expect(p.z).toBeCloseTo(10, 4);
      expect(p.y).toBeCloseTo(arcY(3, 5, t, 40, 6), 3);
    }
  });
});
