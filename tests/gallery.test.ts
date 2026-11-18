import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three/webgpu';
import { buildings } from '@/content';
import { buildingTemplate, designPieces, spinPose } from '@/modules/construction/BuildingRenderer';

/**
 * The model gallery's building exhibits (modules/gallery): every procedural building type shows as designed at each
 * level, and moving parts pose the same way the city turns them.
 */
const procedural = buildings.all().filter((d) => typeof d.recipe === 'function' || !!d.recipe.fallback);

describe('gallery building exhibits', () => {
  it('draws every building type at every level', () => {
    expect(procedural.length).toBeGreaterThan(60);
    for (const def of procedural)
      for (const tier of [0, 1, 2]) expect(designPieces(def, tier).length, `${def.id} level ${tier + 1}`).toBeGreaterThan(0);
  });

  it('shows a designed level’s own pieces and drops the roof it replaces', () => {
    const def = procedural.find((d) => buildingTemplate(d, 0).ranged.some((p) => p.to === 0))!;
    expect(def).toBeDefined();
    const ids = (tier: number) => new Set(designPieces(def, tier).map((p) => p.src));
    const l1 = ids(0);
    const l3 = ids(2);
    const t = buildingTemplate(def, 0);
    for (const p of t.ranged) {
      expect(l1.has(p), `${def.id}: level 1`).toBe(p.from! <= 0 && 0 <= p.to!);
      expect(l3.has(p), `${def.id}: level 3`).toBe(p.from! <= 2 && 2 <= p.to!);
    }
  });

  it('poses moving parts from their pivot (a turning ride comes back after a full turn)', () => {
    const def = procedural.find((d) => buildingTemplate(d, 0).pieces.some((p) => p.spin && !p.spin.clock && !p.spin.lift && !p.spin.upright))!;
    const p = buildingTemplate(def, 0).pieces.find((q) => q.spin && !q.spin.clock && !q.spin.lift && !q.spin.upright)!;
    const at = new Vector3();
    const start = new Vector3().setFromMatrixPosition(spinPose(p, 0, 0.5, new Matrix4()));
    expect(start.distanceTo(at.setFromMatrixPosition(p.local))).toBeLessThan(1e-6);
    const full = (Math.PI * 2) / Math.abs(p.spin!.speed);
    const back = new Vector3().setFromMatrixPosition(spinPose(p, full, 0.5, new Matrix4()));
    expect(back.distanceTo(start)).toBeLessThan(1e-4);
  });
});
