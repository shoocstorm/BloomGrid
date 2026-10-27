import {
  Color,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  SphereGeometry,
  type BufferGeometry,
} from 'three/webgpu';
import { getMaterial } from '@/render/materials/library';
import { GeoBuilder, tf } from '@/render/bake';
import type { HelixTower } from './Guideway';

/** Commuters per helix tower, their pace along the spiral (design units per second), and the lift cycle. */
const WALKERS = 14;
const PACE = 0.3;
const LIFT_CYCLE = 18;
const LANES = [1.02, 1.32];
const COATS = [0xe85d75, 0xf2c14e, 0x3fa7d6, 0x7bc67e, 0xf4f1ea, 0x9b6ad6, 0xff8c42, 0x2fb5a0];

/**
 * Life on the Bloom Helix towers: a glass lift cabin rising and falling in each core, and commuters walking the
 * spiral (up on the inner lane, down on the outer). Pure functions of the clock; two instanced meshes.
 */
export class Movers {
  readonly cabins: InstancedMesh;
  readonly walkers: InstancedMesh;

  constructor(private towers: HelixTower[]) {
    const mat = getMaterial('scenery');
    this.cabins = new InstancedMesh(cabin(), mat, Math.max(1, towers.length));
    this.walkers = new InstancedMesh(walker(), mat, Math.max(1, towers.length * WALKERS));
    const c = new Color();
    for (let i = 0; i < this.walkers.count; i++)
      this.walkers.setColorAt(i, c.setHex(COATS[(i * 5 + (i >> 3)) % COATS.length]!));
    for (const m of [this.cabins, this.walkers]) {
      m.frustumCulled = false;
      m.name = 'aeroline-movers';
    }
  }

  update(t: number): void {
    let wi = 0;
    this.towers.forEach((tw, i) => {
      // Cabin: wait at the street, rise, wait at the platform, descend (eased), each tower out of step.
      const k = (t + i * 4.7) % LIFT_CYCLE;
      const e = k < 4 ? 0 : k < 9 ? ease((k - 4) / 5) : k < 13 ? 1 : 1 - ease((k - 13) / 5);
      const y = tw.yb + 0.1 + (tw.yt - tw.yb - 0.1) * e;
      this.cabins.setMatrixAt(i, _m.multiplyMatrices(tw.m, _l.makeTranslation(0, y, 0)));
      // Walkers spaced along the spiral; odd ones walk down.
      const span = tw.th1 - tw.th0;
      const len = span * 1.2;
      for (let j = 0; j < WALKERS; j++) {
        const down = j % 2 === 1;
        let u = ((((t * PACE) / len + j / WALKERS + i * 0.37) % 1) + 1) % 1;
        if (down) u = 1 - u;
        const th = tw.th0 + span * u;
        const r = LANES[down ? 1 : 0]!;
        const bob = Math.abs(Math.sin(t * 7 + j)) * 0.02;
        _l.makeRotationY(-th + (down ? Math.PI : 0)).setPosition(
          r * Math.cos(th),
          tw.yb + (tw.yt - tw.yb) * u + bob,
          r * Math.sin(th),
        );
        this.walkers.setMatrixAt(wi++, _m.multiplyMatrices(tw.m, _l));
      }
    });
    this.cabins.instanceMatrix.needsUpdate = true;
    this.walkers.instanceMatrix.needsUpdate = true;
  }
}

const _m = new Matrix4();
const _l = new Matrix4();
const ease = (x: number) => x * x * (3 - 2 * x);

/** Lift cabin (design units, floor at y 0): pearl drum with a lit window band and a crown cap. */
function cabin(): BufferGeometry {
  const b = new GeoBuilder();
  b.add(new CylinderGeometry(0.5, 0.5, 1.1, 18).translate(0, 0.55, 0), tf(0, 0, 0), 0xf4f7f5);
  b.add(new CylinderGeometry(0.515, 0.515, 0.5, 18).translate(0, 0.6, 0), tf(0, 0, 0), 0xbff7ff, 1.8);
  b.add(new CylinderGeometry(0.3, 0.52, 0.16, 18), tf(0, 1.18, 0), 0xf4f7f5);
  return b.build();
}

/** A commuter (design units, feet at y 0): coat (tinted per instance) and a pale head. */
function walker(): BufferGeometry {
  const b = new GeoBuilder();
  b.add(new CylinderGeometry(0.055, 0.08, 0.24, 6).translate(0, 0.12, 0), tf(0, 0, 0), 0xffffff);
  b.add(new SphereGeometry(0.055, 6, 4), tf(0, 0.3, 0), 0xf3e2cf);
  return b.build();
}
