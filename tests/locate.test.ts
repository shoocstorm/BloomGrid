import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three/webgpu';
import { CityCamera } from '@/input/CityCamera';
import type { Input } from '@/input/Input';
import type { Grid } from '@/sim/Grid';

const input = () => ({ keys: new Set<string>(), buttons: new Set<number>(), wheel: 0, gesture: null, dragDX: 0, dragDY: 0, touch: false }) as unknown as Input;
const grid = { w: 512, h: 512, heightAt: () => 2 } as unknown as Grid;

function camera() {
  const inp = input();
  const c = new CityCamera(new PerspectiveCamera(), inp, grid);
  c.lookAt(100, 100, 40, true);
  c.update(0.016);
  return { c, inp };
}

describe('locate (bird’s-eye glide)', () => {
  it('climbs over the city on the way and lands looking down at the object', () => {
    const { c } = camera();
    c.locate(400, 380, { size: 4, height: 30 });
    let peak = 0;
    let steepest = 0;
    for (let i = 0; i < 200 && c.locating; i++) {
      c.update(1 / 60);
      peak = Math.max(peak, c.distance);
      steepest = Math.max(steepest, c.pitch);
    }
    for (let i = 0; i < 60; i++) c.update(1 / 60);
    expect(c.locating).toBe(false);
    expect(c.target.x).toBeCloseTo(400, 0);
    expect(c.target.z).toBeCloseTo(380, 0);
    expect(c.pitch).toBeCloseTo(CityCamera.BIRD_PITCH, 2);
    // Framed by its height (30 × 2.4), and high in the middle of a long trip.
    expect(c.distance).toBeCloseTo(72, 0);
    expect(peak).toBeGreaterThan(150);
    expect(steepest).toBeGreaterThan(1.3);
  });

  it('a key or a drag hands the camera back where it is', () => {
    const { c, inp } = camera();
    c.locate(400, 380);
    for (let i = 0; i < 20; i++) c.update(1 / 60);
    (inp.keys as Set<string>).add('ShiftLeft');
    c.update(1 / 60);
    expect(c.locating).toBe(false);
    const x = c.target.x;
    (inp.keys as Set<string>).clear();
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(Math.abs(c.target.x - x)).toBeLessThan(1);
  });
});
