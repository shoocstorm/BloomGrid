import { describe, expect, it } from 'vitest';
import { DynamicResolution } from '@/render/Quality';

/** Feeds `seconds` of frames of length `dt` (with an optional one-off hitch first) at a 60 fps cap. */
function run(d: DynamicResolution, dt: number, seconds: number, hitch = 0): void {
  d.update(dt, 60); // the first call only records the cap
  if (hitch) d.update(hitch, 60);
  for (let t = 0; t < seconds; t += dt) d.update(dt, 60);
}

describe('dynamic resolution', () => {
  it('keeps full resolution through a one-off hitch', () => {
    const d = new DynamicResolution();
    run(d, 1 / 60, 6, 0.6);
    expect(d.scale).toBe(1);
  });

  it('lowers the scale when every frame misses the cap, and recovers when they meet it', () => {
    const d = new DynamicResolution();
    run(d, 1 / 40, 3.2);
    expect(d.scale).toBeLessThan(1);
    run(d, 1 / 60, 30);
    expect(d.scale).toBe(1);
  });

  it('ignores the frames inside a hold, then reports the return to full scale', () => {
    const d = new DynamicResolution();
    run(d, 1 / 40, 3.2);
    expect(d.scale).toBeLessThan(1);
    d.hold(2);
    expect(d.update(1 / 40, 60)).toBe(true); // the caller re-applies the size once
    run(d, 1 / 40, 1.9);
    expect(d.scale).toBe(1);
  });
});
