import { Raycaster, Vector2, Vector3, type Camera } from 'three/webgpu';
import { SEA_LEVEL, type Grid } from '@/sim/Grid';

export interface GroundHit {
  /** World-space point. */
  point: Vector3;
  /** Tile coordinates (may be out of bounds). */
  tx: number;
  tz: number;
  inBounds: boolean;
}

const ray = new Raycaster();
const ndc = new Vector2();
const p = new Vector3();

/**
 * Raycast-free ground picking: march the camera ray against the heightfield (max of terrain and
 * water level), then refine by bisection. O(steps) with no mesh tests.
 */
export function pickGround(grid: Grid, camera: Camera, nx: number, ny: number, out: GroundHit): GroundHit | null {
  ndc.set(nx, ny);
  ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin;
  const d = ray.ray.direction;
  const ground = (x: number, z: number) => Math.max(SEA_LEVEL, grid.heightAt(x, z));
  let t0 = 0;
  let t = 0;
  const maxT = 3000;
  let hit = false;
  while (t < maxT) {
    p.copy(o).addScaledVector(d, t);
    if (p.y <= ground(p.x, p.z)) {
      hit = true;
      break;
    }
    t0 = t;
    // Larger steps when far above the ground.
    t += Math.max(0.25, (p.y - ground(p.x, p.z)) * 0.5);
  }
  if (!hit) return null;
  let a = t0;
  let b = t;
  for (let i = 0; i < 12; i++) {
    const m = (a + b) / 2;
    p.copy(o).addScaledVector(d, m);
    if (p.y <= ground(p.x, p.z)) b = m;
    else a = m;
  }
  out.point.copy(o).addScaledVector(d, b);
  out.tx = Math.floor(out.point.x);
  out.tz = Math.floor(out.point.z);
  out.inBounds = grid.inBounds(out.tx, out.tz);
  return out;
}
