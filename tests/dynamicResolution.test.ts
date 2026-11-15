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

  it('does not climb back on frames that only meet the idle cap', () => {
    const d = new DynamicResolution();
    run(d, 1 / 40, 3.2);
    const low = d.scale;
    expect(low).toBeLessThan(1);
    // Idle: a 30 fps cap met easily for a minute says nothing about the GPU at the active cap.
    d.update(1 / 30, 30);
    for (let t = 0; t < 60; t += 1 / 30) d.update(1 / 30, 30);
    expect(d.scale).toBe(low);
  });

  it('changes rarely: no recovery within 20 s of a drop, then one step', () => {
    const d = new DynamicResolution();
    run(d, 1 / 40, 3.2);
    const low = d.scale;
    let changes = 0;
    d.update(1 / 60, 60);
    for (let t = 0; t < 15; t += 1 / 60) if (d.update(1 / 60, 60)) changes++;
    expect(changes).toBe(0);
    expect(d.scale).toBe(low);
    for (let t = 0; t < 15; t += 1 / 60) if (d.update(1 / 60, 60)) changes++;
    expect(changes).toBe(1);
  });

  it('needs two missed windows in a row to drop', () => {
    const d = new DynamicResolution();
    run(d, 1 / 40, 1.6);
    expect(d.scale).toBe(1);
  });
});
