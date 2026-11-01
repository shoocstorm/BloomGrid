import { MathUtils, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { Grid } from '@/sim/Grid';
import type { Input } from './Input';

/**
 * City-builder orbit camera: smooth pan / rotate / zoom around a ground target.
 * Controls: WASD / arrows pan, Q/E rotate, wheel zoom, right-drag orbit, middle-drag pan.
 * Left-drag panning is enabled by tools that request it (`dragPan`).
 * Touch: one-finger drag pans when the tool allows it (`touchPan`); two fingers pinch-zoom,
 * twist-rotate and drag to pan, or tilt with a parallel vertical drag where one finger already pans.
 */
export interface CameraView {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  distance: number;
}

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
  /** Damping rate; lower = slower, more cinematic glides. */
  smoothing = 10;
  /** Set by tools: left-drag pans the camera. */
  dragPan = false;
  /** Set by tools: a one-finger drag pans (tools that don't draw with a drag). */
  touchPan = true;
  /** False while an explore mode drives the camera (target / distance still describe the focus). */
  enabled = true;
  /** Set by explore modes so power pacing treats a moving first-person view as active. */
  externalMotion = false;

  minDistance = 6;
  maxDistance = 320;
  /** Distance that frames the whole island (overview). */
  get overviewDistance(): number {
    return this.grid.w * 1.1;
  }

  constructor(
    private camera: PerspectiveCamera,
    private input: Input,
    private grid: Grid,
  ) {
    this.maxDistance = grid.w * 1.2;
  }

  setGrid(grid: Grid): void {
    this.grid = grid;
    this.maxDistance = grid.w * 1.2;
  }

  lookAt(x: number, z: number, distance?: number, instant = false): void {
    this.goalTarget.set(x, 0, z);
    if (distance !== undefined) this.goalDistance = distance;
    if (instant) {
      this.target.copy(this.goalTarget);
      this.distance = this.goalDistance;
    }
  }

  private smoothTimer = 0;
  /** A locate glide in progress (see `locate`). */
  private glide: {
    t: number;
    dur: number;
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    d0: number;
    d1: number;
    lift: number;
    p0: number;
  } | null = null;

  /** Pitch of the bird's-eye view a locate settles on (≈ 68°: steep enough that towers don't hide the object). */
  static readonly BIRD_PITCH = 1.18;

  /**
   * Shows an object from above, wherever the camera is (D-090): the camera climbs on a steep, high arc (higher
   * the further it travels), crosses over, and settles looking down at the object, framed by its footprint and
   * height. Any pan, orbit, zoom or key cancels it and leaves the camera where it is.
   */
  locate(x: number, z: number, opts: { size?: number; height?: number } = {}): void {
    if (!this.enabled) return;
    const size = opts.size ?? 6;
    const height = opts.height ?? 8;
    const d1 = MathUtils.clamp(Math.max(38, size * 2.6, height * 2.4), this.minDistance, 260);
    const travel = Math.hypot(x - this.target.x, z - this.target.z);
    clearTimeout(this.smoothTimer);
    this.smoothing = 10;
    this.glide = {
      t: 0,
      dur: MathUtils.clamp(0.9 + travel / 280, 1, 2.4),
      x0: this.target.x,
      z0: this.target.z,
      x1: x,
      z1: z,
      d0: this.distance,
      d1,
      // Rise with the distance travelled (but not when already high), so the trip reads from above.
      lift: MathUtils.clamp(travel * 0.45 - Math.max(0, this.distance - d1) * 0.5, 0, 280),
      p0: this.pitch,
    };
  }

  /** True while a locate glide runs. */
  get locating(): boolean {
    return this.glide !== null;
  }

  /** Smooth, slower glide to a point (advisor "show me", bookmarks, overview). */
  flyTo(x: number, z: number, distance?: number, pitch?: number): void {
    this.goalTarget.set(x, 0, z);
    if (distance !== undefined) this.goalDistance = Math.min(this.maxDistance, distance);
    if (pitch !== undefined) this.goalPitch = pitch;
    this.smoothing = 3.5;
    clearTimeout(this.smoothTimer);
    this.smoothTimer = window.setTimeout(() => (this.smoothing = 10), 1600);
  }

  /** Frames the whole island from high above. */
  overview(): void {
    this.flyTo(this.grid.w / 2, this.grid.h * 0.52, this.overviewDistance, 1.1);
  }

  getView(): CameraView {
    return { x: this.goalTarget.x, z: this.goalTarget.z, yaw: this.goalYaw, pitch: this.goalPitch, distance: this.goalDistance };
  }

  setView(v: CameraView): void {
    this.goalYaw = v.yaw;
    this.flyTo(v.x, v.z, v.distance, v.pitch);
  }

  /** Cinematic establishing shot: start high over the island, glide down to the target view. */
  intro(x: number, z: number, distance: number, duration = 5, end: { pitch?: number; yaw?: number } = {}): void {
    if (end.yaw !== undefined) this.goalYaw = end.yaw;
    this.goalTarget.set(this.grid.w / 2, 0, this.grid.h / 2);
    this.target.copy(this.goalTarget);
    this.distance = this.goalDistance = this.overviewDistance;
    this.pitch = this.goalPitch = 1.25;
    this.yaw = this.goalYaw - 0.9;
    this.goalPitch = end.pitch ?? 0.85;
    this.goalTarget.set(x, 0, z);
    this.goalDistance = distance;
    if (duration <= 0) {
      // Hold the establishing shot.
      this.goalTarget.copy(this.target);
      this.goalDistance = this.distance;
      this.goalPitch = this.pitch;
      this.goalYaw = this.yaw;
      return;
    }
    this.smoothing = 0.9;
    setTimeout(() => (this.smoothing = 10), duration * 1000);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    const inp = this.input;
    const k = inp.keys;
    // The steward taking the controls ends a locate glide where it is.
    if (this.glide && (k.size > 0 || inp.buttons.size > 0 || inp.wheel || inp.gesture)) {
      this.glide = null;
      this.goalTarget.copy(this.target);
      this.goalDistance = this.distance;
      this.goalPitch = this.pitch;
    }
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
    const s = this.goalDistance * 0.0022;
    if (b.has(1) || (b.has(0) && (this.dragPan || (inp.touch && this.touchPan)))) this.pan(-inp.dragDX * s, -inp.dragDY * s);
    if (inp.gesture) {
      this.goalDistance *= Math.exp(-inp.pinch);
      this.goalYaw += inp.twist;
      if (inp.gestureMode === 'tilt' && this.touchPan) this.goalPitch = MathUtils.clamp(this.goalPitch + inp.gestureDY * 0.005, 0.25, 1.48);
      else this.pan(-inp.gestureDX * s, -inp.gestureDY * s);
    }
    if (inp.wheel) this.goalDistance *= Math.exp(inp.wheel * 0.0012);
    this.goalDistance = MathUtils.clamp(this.goalDistance, this.minDistance, this.maxDistance);

    const g = this.grid;
    this.goalTarget.x = MathUtils.clamp(this.goalTarget.x, 0, g.w);
    this.goalTarget.z = MathUtils.clamp(this.goalTarget.z, 0, g.h);
    this.goalTarget.y = Math.max(0, g.heightAt(this.goalTarget.x, this.goalTarget.z));

    if (this.glide) this.stepGlide(dt);

    // Exponential smoothing (frame-rate independent).
    const a = 1 - Math.exp(-dt * this.smoothing);
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

  /** Advances a locate glide: the target eases across, distance arcs up and back down, pitch tips to look down. */
  private stepGlide(dt: number): void {
    const gl = this.glide!;
    gl.t = Math.min(gl.dur, gl.t + dt);
    const u = gl.t / gl.dur;
    const s = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
    const arc = Math.sin(Math.PI * s);
    const pitch = MathUtils.lerp(gl.p0, CityCamera.BIRD_PITCH, Math.min(1, s * 1.6));
    this.goalTarget.x = this.target.x = MathUtils.lerp(gl.x0, gl.x1, s);
    this.goalTarget.z = this.target.z = MathUtils.lerp(gl.z0, gl.z1, s);
    this.goalDistance = this.distance = Math.min(this.maxDistance, MathUtils.lerp(gl.d0, gl.d1, s) + gl.lift * arc);
    // Steepest mid-flight (nearly top-down), settling on the bird's-eye pitch.
    this.goalPitch = this.pitch = Math.min(1.42, pitch + 0.2 * arc);
    if (gl.t >= gl.dur) this.glide = null;
  }

  /** True while the camera is still gliding toward its goal (or a key is held). */
  isMoving(): boolean {
    return (
      this.glide !== null ||
      this.externalMotion ||
      this.target.distanceToSquared(this.goalTarget) > 1e-4 ||
      Math.abs(this.goalDistance - this.distance) > 0.01 ||
      Math.abs(this.goalYaw - this.yaw) > 1e-4 ||
      Math.abs(this.goalPitch - this.pitch) > 1e-4 ||
      this.input.keys.size > 0
    );
  }

  /** Pan in camera-relative ground space. */
  pan(dx: number, dz: number): void {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    this.goalTarget.x += dx * c + dz * s;
    this.goalTarget.z += -dx * s + dz * c;
  }
}
