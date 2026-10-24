import { MathUtils, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { Grid } from '@/sim/Grid';
import type { Input } from './Input';

/**
 * City-builder orbit camera: smooth pan / rotate / zoom around a ground target.
 * Controls: WASD / arrows pan, Q/E rotate, wheel zoom, right-drag orbit, middle-drag pan.
 * Left-drag panning is enabled by tools that request it (`dragPan`).
 */
export class CityCamera {
  readonly target = new Vector3();
  yaw = Math.PI * 0.25;
  pitch = 0.85;
  distance = 70;

  private goalTarget = new Vector3();
  private goalYaw = this.yaw;
  private goalPitch = this.pitch;
  private goalDistance = this.distance;
  private tmp = new Vector3();
  /** Set by tools: left-drag pans the camera. */
  dragPan = false;

  minDistance = 6;
  maxDistance = 320;

  constructor(
    private camera: PerspectiveCamera,
    private input: Input,
    private grid: Grid,
  ) {}

  setGrid(grid: Grid): void {
    this.grid = grid;
  }

  lookAt(x: number, z: number, distance?: number, instant = false): void {
    this.goalTarget.set(x, 0, z);
    if (distance !== undefined) this.goalDistance = distance;
    if (instant) {
      this.target.copy(this.goalTarget);
      this.distance = this.goalDistance;
    }
  }

  update(dt: number): void {
    const inp = this.input;
    const k = inp.keys;
    const panSpeed = this.goalDistance * 0.9 * dt;
    let fx = 0;
    let fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (k.has('KeyQ')) this.goalYaw += 1.6 * dt;
    if (k.has('KeyE')) this.goalYaw -= 1.6 * dt;
    if (k.has('Equal') || k.has('NumpadAdd')) this.goalDistance *= 1 - 1.5 * dt;
    if (k.has('Minus') || k.has('NumpadSubtract')) this.goalDistance *= 1 + 1.5 * dt;
    if (fx || fz) this.pan(fx * panSpeed, fz * panSpeed);

    // Pointer drags.
    const b = inp.buttons;
    if (b.has(2)) {
      this.goalYaw -= inp.dragDX * 0.006;
      this.goalPitch = MathUtils.clamp(this.goalPitch + inp.dragDY * 0.005, 0.25, 1.48);
    }
    if (b.has(1) || (this.dragPan && b.has(0))) {
      const s = this.goalDistance * 0.0022;
      this.pan(-inp.dragDX * s, -inp.dragDY * s);
    }
    if (inp.wheel) this.goalDistance *= Math.exp(inp.wheel * 0.0012);
    this.goalDistance = MathUtils.clamp(this.goalDistance, this.minDistance, this.maxDistance);

    const g = this.grid;
    this.goalTarget.x = MathUtils.clamp(this.goalTarget.x, 0, g.w);
    this.goalTarget.z = MathUtils.clamp(this.goalTarget.z, 0, g.h);
    this.goalTarget.y = Math.max(0, g.heightAt(this.goalTarget.x, this.goalTarget.z));

    // Exponential smoothing (frame-rate independent).
    const a = 1 - Math.exp(-dt * 10);
    this.target.lerp(this.goalTarget, a);
    this.yaw += (this.goalYaw - this.yaw) * a;
    this.pitch += (this.goalPitch - this.pitch) * a;
    this.distance += (this.goalDistance - this.distance) * a;

    const cp = Math.cos(this.pitch);
    this.tmp.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.distance);
    const cam = this.camera.position.copy(this.target).add(this.tmp);
    const ground = Math.max(0, g.heightAt(cam.x, cam.z)) + 1.5;
    if (cam.y < ground) cam.y = ground;
    this.camera.lookAt(this.target);
  }

  /** Pan in camera-relative ground space. */
  pan(dx: number, dz: number): void {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    this.goalTarget.x += dx * c + dz * s;
    this.goalTarget.z += -dx * s + dz * c;
  }
}
