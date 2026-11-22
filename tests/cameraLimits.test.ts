import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three/webgpu';
import { CityCamera } from '@/input/CityCamera';
import type { Input } from '@/input/Input';
import type { Grid } from '@/sim/Grid';
import { compassOf } from '@/modules/moments/returnCard';

const input = () =>
  ({ keys: new Set<string>(), buttons: new Set<number>(), wheel: 0, gesture: null, dragDX: 0, dragDY: 0, touch: false, pointer: { inside: false } }) as unknown as Input;
const grid = { w: 512, h: 512, heightAt: () => 2 } as unknown as Grid;

describe('city camera limits (D-209)', () => {
  it('stops zooming in at minDistance and tips down so the eye stays above MIN_EYE', () => {
    const inp = input();
    const cam = new PerspectiveCamera();
    const c = new CityCamera(cam, inp, grid);
    c.lookAt(200, 200, 60, true);
    c.update(1 / 60);
    // Zoom all the way in, then try to flatten the view toward the horizon.
    const w = inp as unknown as { wheel: number; buttons: Set<number>; dragDY: number };
    for (let i = 0; i < 120; i++) {
      w.wheel = -400;
      c.update(1 / 60);
    }
    w.wheel = 0;
    w.buttons.add(2);
    for (let i = 0; i < 120; i++) {
      w.dragDY = -80;
      c.update(1 / 60);
    }
    w.buttons.clear();
    w.dragDY = 0;
    for (let i = 0; i < 240; i++) c.update(1 / 60);
    expect(c.distance).toBeCloseTo(c.minDistance, 1);
    expect(c.distance * Math.sin(c.pitch)).toBeGreaterThanOrEqual(CityCamera.MIN_EYE - 0.05);
    expect(cam.position.y - 2).toBeGreaterThanOrEqual(CityCamera.MIN_EYE - 0.05);
  });

  it('leaves far views free to look across the island', () => {
    expect(CityCamera.pitchFloor(200)).toBeLessThan(0.07);
    // An aimed landmark postcard (orbit point lifted high) is not held down.
    expect(CityCamera.pitchFloor(100, 30)).toBe(0);
  });
});

describe('compassOf', () => {
  it('names where a point lies on the island (-z north, +x east)', () => {
    expect(compassOf(230, 31, 512)).toBe('north');
    expect(compassOf(471, 41, 512)).toBe('north-east');
    expect(compassOf(72, 471, 512)).toBe('south-west');
    expect(compassOf(256, 256, 512)).toBe('centre');
  });
});
