import { describe, expect, it, vi } from 'vitest';
import { getPiece, initPieces } from '@/assets/kit/pieces';
import { PowerManager } from '@/render/Power';
import type { Input } from '@/input/Input';
import type { CityCamera } from '@/input/CityCamera';

describe('frame pacing (D-150)', () => {
  const setup = (preview = false) => {
    const input = { lastActivity: -1e9, lastHover: -1e9 } as unknown as Input;
    const camera = { isMoving: () => false } as unknown as CityCamera;
    vi.stubGlobal('document', { hasFocus: () => true });
    return { input, power: new PowerManager(input, camera, () => preview) };
  };

  it('a cursor merely moving over the city does not hold the full frame rate', () => {
    const { input, power } = setup();
    input.lastHover = performance.now();
    expect(power.targetFps()).toBe(30);
  });

  it('presses, drags, keys and the wheel do, for a few seconds', () => {
    const { input, power } = setup();
    input.lastActivity = performance.now();
    expect(power.targetFps()).toBe(60);
    input.lastActivity = performance.now() - 5000;
    expect(power.targetFps()).toBe(30);
  });

  it('hover keeps the full rate while a placement preview follows the cursor', () => {
    const { input, power } = setup(true);
    input.lastHover = performance.now();
    expect(power.targetFps()).toBe(60);
  });
});

describe('far greenery models (D-150)', () => {
  initPieces();
  const tris = (id: string, far: boolean) => {
    const p = getPiece(id);
    const g = far ? p.far!.geometry : p.geometry;
    return (g.index ? g.index.count : g.attributes.position!.count) / 3;
  };

  for (const id of ['palm', 'bush', 'canopy'])
    it(`${id}: a fraction of the triangles, the same attributes, switching inside its cull distance`, () => {
      const p = getPiece(id);
      expect(p.far).toBeDefined();
      expect(tris(id, true)).toBeLessThan(tris(id, false) * 0.35);
      expect(Object.keys(p.far!.geometry.attributes).sort()).toEqual(Object.keys(p.geometry.attributes).sort());
      expect(p.far!.at).toBeLessThan(p.lod);
    });
});
