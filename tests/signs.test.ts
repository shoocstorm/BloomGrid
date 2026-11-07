import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { buildings } from '@/content';
import { initPieces } from '@/assets/kit/pieces';
import { Grid } from '@/sim/Grid';
import { doorwayOf, placeBuilding, signSpots } from '@/modules/construction/BuildingRenderer';
import { packSign } from '@/modules/signs';

/** The shader's decoding (signs/index.ts), in JS: three base-96 glyphs per float, count + 64 × kind last. */
function unpack(p: Float32Array): { text: string; kind: number } {
  const meta = p[11]!;
  const kind = meta >= 64 ? 1 : 0;
  const n = meta - kind * 64;
  let text = '';
  for (let i = 0; i < n; i++) {
    const v = p[Math.floor(i / 3)]!;
    const ch = Math.floor(v / 96 ** (i % 3)) % 96;
    text += ch === 95 ? '·' : String.fromCharCode(32 + ch);
  }
  return { text, kind };
}

describe('building signs (D-133)', () => {
  initPieces();
  const grid = new Grid(16, 16);

  it('packs 33 characters and the kind into twelve floats, exactly', () => {
    const out = new Float32Array(12);
    for (const [text, kind] of [
      ['Mycelium Work Dome', 0],
      ['COM-0042', 1],
      ['Wellspring Spire · HER-1234 ~{}', 0],
    ] as const) {
      packSign(text, kind, out, 0);
      expect(unpack(out)).toEqual({ text, kind });
    }
  });

  it('name strips face out of the building; a building without signs gets a front plate', () => {
    const named = buildings.all().find((d) => typeof d.recipe === 'function' && signSpots(placeBuilding(grid, d, 4, 4, 0)).some((s) => s.kind === 'name'));
    expect(named).toBeDefined();
    const place = placeBuilding(grid, named!, 4, 4, 0);
    const centre = new Vector3().setFromMatrixPosition(place.base);
    for (const s of signSpots(place)) {
      expect(s.normal.dot(s.at.clone().sub(centre))).toBeGreaterThan(0);
      // Reading direction: right-handed with up and the outward normal.
      expect(new Vector3(0, 1, 0).cross(s.normal).dot(s.right)).toBeCloseTo(1, 5);
    }
    const plain = buildings.all().find((d) => typeof d.recipe === 'function' && !placeBuilding(grid, d, 4, 4, 0).template.pieces.some((p) => p.sign));
    expect(plain).toBeDefined();
    const spots = signSpots(placeBuilding(grid, plain!, 4, 4, 0));
    expect(spots.map((s) => s.kind)).toEqual(['number']);
  });

  it("the Work Dome's door is its glass doors, facing its front (+z), turned with the building", () => {
    const dome = buildings.get('greenhouse-hub');
    for (const rot of [0, 1, 2, 3]) {
      const d = doorwayOf(grid, dome, placeBuilding(grid, dome, 4, 4, rot));
      const front = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), -rot * (Math.PI / 2));
      expect(d.nx * front.x + d.nz * front.z).toBeCloseTo(1, 5);
      expect(Math.hypot(d.x - 5.5 - front.x * 1.4, d.z - 5.5 - front.z * 1.4)).toBeLessThan(0.05);
    }
  });
});
