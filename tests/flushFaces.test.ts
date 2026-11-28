import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { buildings } from '@/content';
import { buildingTemplate, piecesAt } from '@/modules/construction/BuildingRenderer';
import { FACE_LIFT, separateFlushFaces } from '@/modules/construction/flushFaces';

/**
 * Flush faces (D-237, D-238): two faces of differing pieces in one plane z-fight and flash as the camera moves, from
 * the bird's-eye view (tops) and from the side (walls, cylinders). Templates move the smaller piece's face out; no
 * building may show such a pair.
 */
const BOX = new Set(['slab', 'plinth', 'glassBox', 'mossBox', 'pitch', 'pool', 'timberBox', 'screen']);
const CYL = new Set(['glassCyl', 'concreteCyl', 'algaeTank']);
/** A unit piece (base at its origin) scaled to `s` at `p`, turned `yaw` about y. */
const at = (p: [number, number, number], s: [number, number, number], yaw = 0) =>
  new Matrix4().compose(new Vector3(...p), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(...s));

describe('flush faces', () => {
  it('lifts the smaller of two differing flush tops, by millimetres', () => {
    const big = { piece: 'slab', tint: 1, local: at([0, 0, 0], [4, 0.2, 4]) };
    const small = { piece: 'pool', tint: 2, local: at([0, 0, 0], [2, 0.2, 2]) };
    const twin = { piece: 'slab', tint: 1, local: at([0, 0, 0], [4, 0.2, 4]) };
    expect(separateFlushFaces([small, big, twin])).toBe(1);
    expect(big.local.elements[5]).toBeCloseTo(0.2, 9);
    expect(twin.local.elements[5]).toBeCloseTo(0.2, 9);
    expect(small.local.elements[5]).toBeCloseTo(0.2 + FACE_LIFT, 9);
  });

  it('moves a flush wall of a smaller piece out, also when turned', () => {
    const yaw = 0.7;
    const podium = { piece: 'slab', tint: 1, local: at([0, 0, 0], [6, 1, 4], yaw) };
    // A glazed front whose outer face is flush with the podium's +z face.
    const front = { piece: 'glassBox', tint: 2, local: at([0, 0, 0], [5, 0.8, 1], yaw).premultiply(new Matrix4().makeTranslation(Math.sin(yaw) * 1.5, 0, Math.cos(yaw) * 1.5)) };
    expect(separateFlushFaces([podium, front])).toBe(1);
    expect(new Vector3(front.local.elements[8], 0, front.local.elements[10]).length()).toBeCloseTo(1 + 2 * FACE_LIFT, 9);
    expect(new Vector3(podium.local.elements[8], 0, podium.local.elements[10]).length()).toBeCloseTo(4, 9);
  });

  it('widens the shorter of two coaxial cylinders of one radius', () => {
    const drum = { piece: 'glassCyl', tint: 1, local: at([0, 0, 0], [2, 6, 2]) };
    const band = { piece: 'concreteCyl', tint: 2, local: at([0, 2, 0], [2, 0.3, 2]) };
    expect(separateFlushFaces([drum, band])).toBe(1);
    expect(band.local.elements[0]).toBeCloseTo(2 + 2 * FACE_LIFT, 9);
    expect(drum.local.elements[0]).toBeCloseTo(2, 9);
  });

  it('leaves no building with differing coplanar faces', () => {
    const bad: string[] = [];
    const e4 = (m: Matrix4) => m.elements;
    for (const def of buildings.all())
      for (let variant = 0; variant < (def.variants ?? 3); variant++) {
        const t = buildingTemplate(def, variant);
        for (let tier = 0; tier < 3; tier++) {
          type F = { p: string; tint: number; nx: number; ny: number; nz: number; d: number; a0: number; a1: number; b0: number; b1: number };
          const faces: F[] = [];
          const cyls: { p: string; tint: number; x: number; z: number; r: number; y0: number; y1: number }[] = [];
          for (const p of piecesAt(t, tier)) {
            if (p.door || p.spin) continue;
            const e = e4(p.local);
            const h = Math.hypot(e[4]!, e[5]!, e[6]!);
            if (h < 1e-6 || e[5]! / h < 0.999) continue;
            const [cx, cz, y0, y1] = [e[12]!, e[14]!, e[13]!, e[13]! + e[5]!];
            if (CYL.has(p.piece)) {
              cyls.push({ p: p.piece, tint: p.tint, x: cx, z: cz, r: Math.hypot(e[0]!, e[2]!) / 2, y0, y1 });
              continue;
            }
            if (!BOX.has(p.piece)) continue;
            const hx = (Math.abs(e[0]!) + Math.abs(e[8]!)) * 0.5;
            const hz = (Math.abs(e[2]!) + Math.abs(e[10]!)) * 0.5;
            faces.push({ p: p.piece, tint: p.tint, nx: 0, ny: 1, nz: 0, d: y1, a0: cx - hx, a1: cx + hx, b0: cz - hz, b1: cz + hz });
            for (const [i, j] of [[0, 8], [8, 0]] as const) {
              const len = Math.hypot(e[i]!, e[i + 2]!);
              const wid = Math.hypot(e[j]!, e[j + 2]!);
              for (const s of [1, -1]) {
                const [nx, nz] = [(e[i]! / len) * s, (e[i + 2]! / len) * s];
                const tc = cx * -nz + cz * nx;
                faces.push({ p: p.piece, tint: p.tint, nx, ny: 0, nz, d: cx * nx + cz * nz + len / 2, a0: tc - wid / 2, a1: tc + wid / 2, b0: y0, b1: y1 });
              }
            }
          }
          for (let i = 0; i < faces.length; i++)
            for (let j = i + 1; j < faces.length; j++) {
              const [a, b] = [faces[i]!, faces[j]!];
              if (a.nx * b.nx + a.ny * b.ny + a.nz * b.nz < 0.9999 || Math.abs(a.d - b.d) > 0.001) continue;
              if (a.p === b.p && a.tint === b.tint) continue;
              if (Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0) > 0.05 && Math.min(a.b1, b.b1) - Math.max(a.b0, b.b0) > 0.05)
                bad.push(`${def.id}#${variant} L${tier + 1}: ${a.p}/${b.p} ${a.ny ? 'top' : 'wall'} at ${a.d.toFixed(3)}`);
            }
          for (let i = 0; i < cyls.length; i++)
            for (let j = i + 1; j < cyls.length; j++) {
              const [a, b] = [cyls[i]!, cyls[j]!];
              if (Math.hypot(a.x - b.x, a.z - b.z) > 0.001 || Math.abs(a.r - b.r) > 0.001 || (a.p === b.p && a.tint === b.tint)) continue;
              if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.02) bad.push(`${def.id}#${variant} L${tier + 1}: ${a.p}/${b.p} cylinder r ${a.r.toFixed(3)}`);
            }
        }
      }
    expect(bad.slice(0, 20)).toEqual([]);
  });
});
