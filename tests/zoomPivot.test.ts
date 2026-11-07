import { describe, expect, it } from 'vitest';
import { zoomPivot } from '@/input/zoomPivot';

describe('zoomPivot (D-121)', () => {
  it('halving the distance moves the target halfway to the cursor point', () => {
    const t = { x: 0, z: 0 };
    zoomPivot(t, { x: 10, z: -4 }, 0.5);
    expect(t).toEqual({ x: 5, z: -2 });
  });

  it('zooming out pushes the target away from the pivot, and a round trip returns', () => {
    const t = { x: 2, z: 3 };
    const p = { x: 12, z: 7 };
    zoomPivot(t, p, 0.8);
    zoomPivot(t, p, 1 / 0.8);
    expect(t.x).toBeCloseTo(2);
    expect(t.z).toBeCloseTo(3);
  });

  it('an unchanged distance (clamped zoom) leaves the target alone', () => {
    const t = { x: 1, z: 1 };
    zoomPivot(t, { x: 50, z: 50 }, 1);
    expect(t).toEqual({ x: 1, z: 1 });
  });
});
