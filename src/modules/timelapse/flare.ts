import { AdditiveBlending, CylinderGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial, TorusGeometry } from 'three/webgpu';
import { float, uniform, uv, vec3 } from 'three/tsl';

/**
 * A crisis flare for the films over the real island (the time-lapse, D-221; Flora's look ahead, D-223): its own
 * geometry and materials, so a film disposes them when it leaves (`disposeFlare`).
 */
/** A crisis flare: a ring running out over the ground and a pillar of light, warm red, additive. */
export function flare() {
  const on = uniform(0);
  const ringMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  ringMat.colorNode = vec3(1, 0.42, 0.22).mul(on);
  const ring = new Mesh(new TorusGeometry(1, 0.035, 6, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  const pillarMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
  pillarMat.colorNode = vec3(1, 0.5, 0.3).mul(on.mul(float(1).sub(uv().y)).mul(0.8));
  const pillar = new Mesh(new CylinderGeometry(0.06, 0.12, 1, 20, 1, true).translate(0, 0.5, 0), pillarMat);
  ring.add(pillar);
  pillar.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.frustumCulled = false;
  return { root: ring, on };
}

/** Seconds a flare burns. */
export const FLARE_S = 3.2;

/**
 * One frame of a flare `k` (0..1) into its burn, sized for a camera `distance` away: the ring runs out and fades, the
 * pillar stands a little over the ring's width (taller reads as a beam slanting off the frame from a high camera).
 */
export function burnFlare(f: ReturnType<typeof flare>, k: number, distance: number): void {
  const size = Math.max(8, distance * 0.06);
  const r = size * (0.4 + k * 1.6);
  f.root.scale.set(r, r, size * 1.3);
  f.on.value = Math.min(1, k * 6) * (1 - k) ** 1.5;
}

/** Frees a flare's own geometry and materials (nothing in it is shared). */
export function disposeFlare(f: { root: Mesh }): void {
  f.root.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (o.material as MeshBasicNodeMaterial).dispose();
    }
  });
}
