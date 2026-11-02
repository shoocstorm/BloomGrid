import { describe, expect, it } from 'vitest';
import { buildings } from '@/content';
import { buildingTemplate, heightAt, piecesAt, tierPieces } from '@/modules/construction/BuildingRenderer';

/**
 * Designed levels (D-100): every building that can grow a level shows its own level 2 and level 3, built in its
 * recipe with `b.level` / `b.upTo`, never the generic roof terrace.
 */
const levelled = buildings.all().filter((d) => d.stats.population > 0 || d.stats.jobs > 0);

describe('designed level looks', () => {
  it('covers every building that can level', () => {
    expect(levelled.length).toBeGreaterThan(60);
    const generic = levelled.filter((d) => !buildingTemplate(d, 0).ranged.length).map((d) => d.id);
    expect(generic).toEqual([]);
  });

  it('gives each level its own pieces, and level 3 more than level 2', () => {
    for (const def of levelled)
      for (let v = 0; v < (def.variants ?? 3); v++) {
        const t = buildingTemplate(def, v);
        const l2 = tierPieces(t, 1);
        const l3 = tierPieces(t, 2);
        expect(l2.length, `${def.id}#${v} level 2`).toBeGreaterThan(0);
        expect(l3.length, `${def.id}#${v} level 3`).toBeGreaterThan(0);
        // Level 3 is not just level 2 again: it shows something level 2 doesn't.
        const shown2 = new Set(l2);
        expect(l3.some((p) => !shown2.has(p)), `${def.id}#${v} level 3 adds nothing`).toBe(true);
        // A building never shrinks as it levels.
        expect(heightAt(t, 2), def.id).toBeGreaterThanOrEqual(heightAt(t, 0) - 1e-6);
        // Level 1 is the base plus only the pieces a later level replaces.
        expect(piecesAt(t, 0).length).toBe(t.pieces.length + tierPieces(t, 0).length);
      }
  });
});
