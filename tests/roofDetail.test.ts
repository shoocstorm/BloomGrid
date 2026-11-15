import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3, Quaternion } from 'three/webgpu';
import { buildings } from '@/content';
import { isHero } from '@/content/heroes';
import type { BuildingDef } from '@/content/types';
import type { TemplatePiece } from '@/modules/construction/BuildingRenderer';
import { roofDetail } from '@/modules/construction/roofDetail';

/** Roof detail (D-160): parapets and plant on bare flat roofs, per level, never on heroes. */
const piece = (
  id: string,
  p: [number, number, number],
  s: [number, number, number],
  extra: Partial<TemplatePiece> = {},
): TemplatePiece => ({
  piece: id,
  local: new Matrix4().compose(new Vector3(...p), new Quaternion(), new Vector3(...s)),
  tint: 0xffffff,
  glow: 0,
  growAt: 0,
  seed: 0,
  y: p[1],
  ...extra,
});
const plain = buildings.all().find((d) => !isHero(d) && d.category === 'residential')!;
const hero = buildings.all().find((d) => isHero(d))!;
const block = [piece('slab', [0, 0, 0], [1.6, 1.2, 1.6])];
const roofY = (ps: TemplatePiece[]) => Math.min(...ps.map((p) => p.y));

describe('roof detail', () => {
  it('dresses a bare flat roof with a parapet and plant sitting on it', () => {
    const r = roofDetail(plain, block, [], 1.2, 1);
    const all = [...r.always, ...r.main];
    expect(all.length).toBeGreaterThan(6);
    expect(roofY(all)).toBeCloseTo(1.2, 5);
    // Everything stays inside the roof's footprint.
    for (const p of all) {
      const e = p.local.elements;
      expect(Math.abs(e[12]!)).toBeLessThanOrEqual(0.8 + 1e-6);
      expect(Math.abs(e[14]!)).toBeLessThanOrEqual(0.8 + 1e-6);
    }
    // Generic levels: the main roof's plant shows at level 1 only (the level-2 terrace covers that roof).
    expect(r.main.length).toBeGreaterThan(0);
    expect(r.always.length).toBe(4);
  });

  it('leaves heroes, nature and used roofs alone', () => {
    expect(roofDetail(hero, block, [], 1.2, 1).always).toEqual([]);
    expect(roofDetail({ ...plain, category: 'nature' } as BuildingDef, block, [], 1.2, 1).always).toEqual([]);
    const garden = [...block, piece('mossBox', [0, 1.2, 0], [1.2, 0.1, 1.2])];
    const r = roofDetail(plain, garden, [], 1.3, 1);
    expect([...r.always, ...r.main]).toEqual([]);
  });

  it('dresses a roof only for the levels nothing is built on it', () => {
    // A storey added at level 2 (tier 1) stands on the roof; its own roof is bare from then on.
    const storey = piece('glassBox', [0, 1.2, 0], [1.2, 0.8, 1.2], { from: 1, to: 2, top: 2 });
    const r = roofDetail(plain, block, [storey], 1.2, 1);
    const low = r.ranged.filter((p) => p.y < 1.5);
    const high = r.ranged.filter((p) => p.y > 1.9);
    expect(low.length).toBeGreaterThan(0);
    expect(high.length).toBeGreaterThan(0);
    for (const p of low) expect([p.from, p.to]).toEqual([0, 0]);
    for (const p of high) expect([p.from, p.to]).toEqual([1, 2]);
    expect(r.main).toEqual([]);
  });

  it('is the same for the same seed', () => {
    const a = roofDetail(plain, block, [], 1.2, 7).main.map((p) => p.local.elements.join());
    const b = roofDetail(plain, block, [], 1.2, 7).main.map((p) => p.local.elements.join());
    expect(a).toEqual(b);
  });
});
