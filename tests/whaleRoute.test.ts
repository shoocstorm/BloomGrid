import { describe, expect, it } from 'vitest';
import { terrainHeight } from '@/sim/terrain';
import { WONDER_SITES } from '@/modules/scenery/sites';
import { GROUNDS, lapSeconds, podAt } from '@/modules/scenery/whaleRoute';

const S = 512;
const standing = Object.entries(WONDER_SITES)
  .filter(([k]) => k !== 'whales' && k !== 'dolphins')
  .map(([, v]) => [(v as readonly number[])[0]! * S, (v as readonly number[])[1]! * S] as const);

describe('whale migration (D-231)', () => {
  it('starts each pod at its old home and moves it continuously round the whole ring', () => {
    expect(podAt(0, 0, S)).toMatchObject({ x: 0.3 * S, z: 0.95 * S, travel: 0 });
    expect(podAt(1, 0, S)).toMatchObject({ x: 0.68 * S, z: 0, travel: 0 });
    const lap = lapSeconds(S);
    let prev = podAt(0, 0, S);
    const seen = new Set<number>();
    for (let t = 1; t <= lap; t += 1) {
      const s = podAt(0, t, S);
      seen.add(s.ground);
      // At most the eased peak (1.5× cruise) per second, never a jump.
      expect(Math.hypot(s.x - prev.x, s.z - prev.z)).toBeLessThan(1.6);
      prev = s;
    }
    expect(seen.size).toBe(GROUNDS.length);
    const back = podAt(0, lap, S);
    expect(back.x).toBeCloseTo(0.3 * S, 3);
  });

  it('keeps every pod in deep sea and clear of the standing wonders, on any seed', () => {
    const lap = lapSeconds(S);
    for (let t = 0; t < lap; t += 4) {
      const s = podAt(0, t, S);
      // Lingering whales circle up to ~50 units out; under way the pod closes up to a third of that.
      const reach = s.travel > 0.5 ? 18 : 50;
      for (const [x, z] of standing) expect(Math.hypot(s.x - x, s.z - z), `t ${t}`).toBeGreaterThan(reach > 20 ? 52 : 30);
      for (const seed of [1, 42, 20261024])
        for (let a = 0; a < 8; a++) {
          const h = terrainHeight(s.x + Math.cos(a) * reach, s.z + Math.sin(a) * reach, seed, S);
          expect(h, `t ${t} seed ${seed}`).toBeLessThan(-3);
        }
    }
  });

  it('velocity matches the motion', () => {
    for (const t of [400, 900, 1700, 2600]) {
      const a = podAt(1, t, S);
      const b = podAt(1, t + 0.01, S);
      expect((b.x - a.x) / 0.01).toBeCloseTo(a.vx, 1);
      expect((b.z - a.z) / 0.01).toBeCloseTo(a.vz, 1);
    }
  });
});
