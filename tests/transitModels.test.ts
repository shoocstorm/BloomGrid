import { describe, expect, it } from 'vitest';
import { GLAZING, LIVERY, podGeometry } from '@/modules/mobility/podModel';

describe('sky pod model (D-147)', () => {
  const g = podGeometry();
  const glow = g.attributes.aGlow!;
  const marks = new Set(Array.from({ length: glow.count }, (_, i) => glow.getX(i)));

  it('stays within its vertex budget (the pod shader evaluates the flight per vertex, up to 1040 pods)', () => {
    expect(g.attributes.position!.count).toBeLessThanOrEqual(4400);
  });

  it('marks its glazing and livery for the shader, and carries no extra vertex attributes', () => {
    expect(marks.has(GLAZING)).toBe(true);
    expect(marks.has(LIVERY)).toBe(true);
    // position, normal, colour, aGlow: with the three instanced route attributes, 7 of WebGPU's 8 vertex buffers.
    expect(Object.keys(g.attributes).sort()).toEqual(['aGlow', 'color', 'normal', 'position']);
  });
});
