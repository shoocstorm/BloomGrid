import { describe, expect, it } from 'vitest';
import { Mesh, Vector3 } from 'three/webgpu';
import { ease, orbit, shotAt, type Shot } from '@/modules/moments/shots';
import { LOOKS, mixLook } from '@/render/stageUniforms';
import { Cat3D } from '@/modules/charm/cat3d';

/** The 3D film stage's pure parts (D-196): camera shots, stage looks, and the 3D cat's rig. */
describe('film shots', () => {
  const a = { pos: [0, 0, 10] as [number, number, number], look: [0, 0, 0] as [number, number, number], fov: 30 };
  const b = { pos: [10, 0, 10] as [number, number, number], look: [10, 0, 0] as [number, number, number], fov: 40 };

  it('eases from 0 to 1 and clamps outside', () => {
    for (const e of ['linear', 'in', 'out', 'inOut'] as const) {
      expect(ease(e, 0)).toBe(0);
      expect(ease(e, 1)).toBe(1);
      expect(ease(e, -1)).toBe(0);
      expect(ease(e, 2)).toBe(1);
    }
    expect(ease('inOut', 0.5)).toBeCloseTo(0.5);
  });

  it('glides between framings over a shot and holds at its end', () => {
    const shots: Shot[] = [{ at: 2, dur: 4, from: a, to: b, ease: 'linear' }];
    expect(shotAt(shots, 2).pos).toEqual([0, 0, 10]);
    const mid = shotAt(shots, 4);
    expect(mid.pos[0]).toBeCloseTo(5);
    expect(mid.fov).toBeCloseTo(35);
    expect(shotAt(shots, 99).pos[0]).toBeCloseTo(10);
    // Before the first shot starts, it holds that shot's opening frame.
    expect(shotAt(shots, 0).pos[0]).toBe(0);
  });

  it('cuts to the latest shot that has started', () => {
    const shots: Shot[] = [
      { at: 0, dur: 0, from: a },
      { at: 5, dur: 0, from: b },
    ];
    expect(shotAt(shots, 4.9).look[0]).toBe(0);
    expect(shotAt(shots, 5).look[0]).toBe(10);
  });

  it('frames a tracking shot from its anchor', () => {
    const shots: Shot[] = [{ at: 0, dur: 0, from: { pos: [0, 1, 2], look: [0, 0, 0] }, rel: true }];
    const f = shotAt(shots, 1, undefined, [100, 5, -3]);
    expect(f.pos).toEqual([100, 6, -1]);
    expect(f.look).toEqual([100, 5, -3]);
  });

  it('orbits at the given distance', () => {
    const f = orbit([1, 2, 3], 5, 0.7, 0.3);
    const d = Math.hypot(f.pos[0] - 1, f.pos[1] - 2, f.pos[2] - 3);
    expect(d).toBeCloseTo(5);
    expect(orbit([0, 0, 0], 4, 0, 0).pos).toEqual([0, 0, 4]);
  });
});

describe('stage looks', () => {
  it('mixes from one look to another', () => {
    expect(mixLook(LOOKS.night, LOOKS.day, 0).night).toBe(1);
    expect(mixLook(LOOKS.night, LOOKS.day, 1).night).toBe(0);
    expect(mixLook(LOOKS.night, LOOKS.day, 1).zenith).toBe(LOOKS.day.zenith);
    const half = mixLook(LOOKS.night, LOOKS.day, 0.5);
    expect(half.keyI).toBeCloseTo((LOOKS.night.keyI + LOOKS.day.keyI) / 2);
    // The sources are never written.
    expect(LOOKS.night.night).toBe(1);
  });
});

describe('the 3D cat', () => {
  it('is a small actor that poses without NaNs', () => {
    const cat = new Cat3D();
    let meshes = 0;
    let verts = 0;
    cat.root.traverse((o) => {
      if (o instanceof Mesh) {
        meshes++;
        verts += o.geometry.attributes.position!.count;
      }
    });
    // About fifty small meshes (whiskers, catchlights, a mouth): a film actor, never drawn in the city.
    expect(meshes).toBeLessThanOrEqual(60);
    expect(verts).toBeLessThan(20_000);
    for (const p of ['creep', 'freeze', 'tiptoe', 'leap', 'land', 'proud', 'trust'] as const) {
      cat.pose(p);
      cat.blink(0.2, 0.1);
      for (let i = 0; i < 30; i++) cat.update(1 / 30);
    }
    const head = cat.headAt(new Vector3());
    expect(Number.isFinite(head.x + head.y + head.z)).toBe(true);
    cat.root.traverse((o) => expect(Number.isFinite(o.rotation.z + o.scale.y + o.position.y)).toBe(true));
  });

  it('stands its paws on the ground when idle', () => {
    const cat = new Cat3D();
    cat.pose('proud');
    for (let i = 0; i < 60; i++) cat.update(1 / 30);
    cat.root.updateMatrixWorld(true);
    let low = Infinity;
    const v = new Vector3();
    cat.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const p = o.geometry.attributes.position!;
      for (let i = 0; i < p.count; i += 7) low = Math.min(low, v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).y);
    });
    expect(Math.abs(low)).toBeLessThan(0.05);
  });

  it('repaints a coat without rebuilding', () => {
    const cat = new Cat3D();
    cat.paint({ fur: '#1b2130', belly: '#222a3a', mark: '#1b2130', eye: '#ffe27a' }, 2.6);
    expect(cat.eye.emissiveIntensity).toBe(2.6);
    cat.paintCoat({ id: 'ginger', fur: '#f0a14a', belly: '#fde6c4', mark: '#c9702a' });
    expect(cat.fur.color.getHexString()).toBe('f0a14a');
    expect(cat.eye.emissiveIntensity).toBeLessThan(0.5);
  });
});
