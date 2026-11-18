import {
  BackSide,
  Box3,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  Vector4,
  type Object3D,
} from 'three/webgpu';
import { abs, float, fract, length, mix, positionLocal, smoothstep, uniform, uv } from 'three/tsl';
import type { GameContext } from '@/game/context';
import { getPiece } from '@/assets/kit/pieces';
import { ChunkedInstancer, type InstanceHandle } from '@/render/Instancer';
import { PostFX } from '@/render/PostFX';
import { U } from '@/render/uniforms';
import { spinPose, type DesignPiece } from '@/modules/construction/BuildingRenderer';
import type { QualitySettings } from '@/render/Quality';

/** What the stage shows: kit pieces (a building type) and/or a module's own object. */
export interface StageModel {
  pieces?: DesignPiece[];
  object?: Object3D;
  /** Framing when the geometry's bounds don't show where its shader puts it (whales swim a wide circle). */
  frame?: { center: Vector3; radius: number };
  /** Per-frame motion of a module's object (`t` = seconds on stage). */
  update?(t: number, dt: number): void;
  /** Stands in the sea: a water plane at y = 0 instead of the studio floor. */
  water?: boolean;
  /**
   * World point the pieces and object stand on (default the origin). Buildings stand at a lived-in spot of the city,
   * because their night lighting reads the city's activity field by world position.
   */
  at?: Vector3;
}

export type Lighting = 'day' | 'dusk' | 'night';

/** The studio's look per lighting: shared uniforms the city materials read, the sky and the lights. */
const LOOKS: Record<
  Lighting,
  { night: number; sun: number; sunDir: [number, number, number]; key: number; keyI: number; rimI: number; hemiI: number; top: number; low: number; bloom: number; zenith: number; horizon: number }
> = {
  day: { night: 0, sun: 0xfff2dc, sunDir: [0.45, 0.8, 0.4], key: 0xfff2dc, keyI: 2.7, rimI: 1.0, hemiI: 1.2, top: 0x0a2e33, low: 0x2c6f6c, bloom: 0.5, zenith: 0x5fb0ff, horizon: 0xcfeaff },
  dusk: { night: 0.45, sun: 0xffb27a, sunDir: [0.7, 0.28, 0.2], key: 0xffb27a, keyI: 2.2, rimI: 1.3, hemiI: 0.75, top: 0x161a33, low: 0x5a4256, bloom: 0.75, zenith: 0x4a5a9a, horizon: 0xffb48a },
  night: { night: 1, sun: 0x9ab8ff, sunDir: [0.3, 0.7, 0.3], key: 0x8fb0ff, keyI: 0.55, rimI: 0.9, hemiI: 0.35, top: 0x02060c, low: 0x0b2238, bloom: 1.0, zenith: 0x0b1530, horizon: 0x1c2f4a },
};

const _box = new Box3();
const _pbox = new Box3();
const _size = new Vector3();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _eye = new Vector3();

/** Uniforms the studio overrides while it draws, restored after, so the city's own frame is untouched. */
const SAVED = ['night', 'lateNight', 'grid', 'overlay', 'storm', 'heat', 'algae', 'rain', 'seasonAmount', 'pollen', 'bloom', 'gradeSat', 'gradeCon', 'vignette', 'cloudShadow'] as const;
const SAVED_V = ['sunDir', 'zenith', 'horizon', 'sunColor', 'gradeLift', 'gradeGain', 'envTint', 'eye', 'walker', 'flash'] as const;

/**
 * The gallery's studio: one model alone on a lit stage, drawn full screen through its own post pipeline (bloom,
 * temporal AA, grade) in place of the city frame (`render.stage`). The city's own materials and kit pieces, so a
 * model looks exactly as it does on the island; the shared uniforms (night, sun, grade, lenses, weather) are set to
 * the studio's lighting for its draw and put back after. An orbit camera turns slowly round the model (turntable).
 */
export class Studio {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.1, 4000);
  private stage = new Group();
  /** One chunk for everything, so a piece type keeps one batch. */
  private instancer = new ChunkedInstancer(this.stage, 4096);
  private fx: PostFX;
  private fxQuality: QualitySettings | null = null;
  private key = new DirectionalLight(0xfff2dc, 2.7);
  private rim = new DirectionalLight(0x8ff8ec, 1.0);
  private hemi = new HemisphereLight(0xdff6ff, 0x30443a, 1.2);
  private dome: Mesh;
  private floor: Mesh;
  private rings: Mesh;
  private sea: Mesh;
  private skyTop = uniform(new Color());
  private skyLow = uniform(new Color());
  private model: StageModel | null = null;
  private spins: { h: InstanceHandle; p: DesignPiece }[] = [];
  private origin = new Matrix4();
  private t = 0;
  private shadowDirty = true;
  lighting: Lighting = 'day';

  // Orbit camera
  readonly target = new Vector3();
  radius = 5;
  yaw = 0.6;
  pitch = 0.32;
  zoom = 1;
  /** Pan offset of the orbit point, in units of the model's radius (screen right / up). */
  pan = { x: 0, y: 0 };
  turntable = true;
  /** Share of the screen's width the model may fill (the panels cover the rest); 1 in clean view. */
  frameWidth = 1;
  /** Seconds before the turntable resumes after the player handled the view. */
  idle = 0;
  private lastYaw = NaN;

  constructor(private ctx: GameContext) {
    this.fx = new PostFX(ctx.renderer, this.scene, this.camera);
    const s = this.scene;
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.autoUpdate = false;
    s.add(this.stage, this.key, this.key.target, this.rim, this.rim.target, this.hemi);

    // Backdrop: a gradient dome (deep at the top, lighter toward the horizon), so the model stands in its own space.
    const domeMat = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
    const up = positionLocal.y.mul(0.5).add(0.5);
    domeMat.colorNode = mix(this.skyLow, this.skyTop, smoothstep(0.42, 0.95, up));
    this.dome = new Mesh(new SphereGeometry(1, 48, 24), domeMat);
    this.dome.renderOrder = -2;
    this.dome.frustumCulled = false;

    // Floor: a dark satin disc that takes the model's shadow, and survey rings over it.
    const floorMat = new MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.1 });
    floorMat.colorNode = mix(this.skyLow.mul(0.32), this.skyTop.mul(0.5), smoothstep(0.08, 0.5, length(uv().sub(0.5))));
    this.floor = new Mesh(new CircleGeometry(1, 96).rotateX(-Math.PI / 2), floorMat);
    this.floor.receiveShadow = true;
    const ringMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const r = length(uv().sub(0.5)).mul(2);
    const lines = smoothstep(0.06, 0.0, abs(fract(r.mul(8)).sub(0.5)).sub(0.44));
    ringMat.colorNode = this.skyLow.mul(0.6).add(0.35);
    ringMat.opacityNode = lines.mul(float(1).sub(smoothstep(0.3, 1, r))).mul(0.16);
    this.rings = new Mesh(new CircleGeometry(1, 96).rotateX(-Math.PI / 2), ringMat);
    this.rings.renderOrder = 1;
    // Sea: a translucent water plane at sea level for ships, wonders and sea life (what lies under it shows dimly).
    const seaMat = new MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.45, metalness: 0 });
    const fade = float(1).sub(smoothstep(0.25, 0.5, length(uv().sub(0.5))));
    seaMat.colorNode = mix(this.skyLow.mul(0.5), this.skyLow, fade.mul(0.4)).add(float(0.04));
    seaMat.opacityNode = fade.mul(0.62);
    this.sea = new Mesh(new CircleGeometry(1, 96).rotateX(-Math.PI / 2), seaMat);
    this.sea.receiveShadow = true;
    this.sea.renderOrder = 2;
    s.add(this.dome, this.floor, this.rings, this.sea);
  }

  /** Puts `model` on the stage (the previous one is taken off; module objects are kept by their entries). */
  show(model: StageModel): void {
    this.clear();
    this.model = model;
    this.t = 0;
    this.spins = [];
    _box.makeEmpty();
    this.origin.makeTranslation(model.at?.x ?? 0, model.at?.y ?? 0, model.at?.z ?? 0);
    for (const p of model.pieces ?? []) {
      _m.multiplyMatrices(this.origin, p.src.local);
      const h = this.instancer.addMatrix(p.piece, _m, p.color, p.params);
      if (p.src.spin) this.spins.push({ h, p });
      const g = getPiece(p.piece).geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      _box.union(_pbox.copy(g.boundingBox!).applyMatrix4(_m));
    }
    if (model.object) {
      if (model.at) model.object.position.copy(model.at);
      this.stage.add(model.object);
      model.object.updateMatrixWorld(true);
      _box.union(_pbox.setFromObject(model.object, true));
    }
    if (_box.isEmpty()) _box.set(new Vector3(-1, 0, -1), new Vector3(1, 1, 1));
    if (model.frame) {
      this.target.copy(model.frame.center);
      this.radius = model.frame.radius;
    } else {
      _box.getCenter(this.target);
      _box.getSize(_size);
      this.radius = Math.max(0.6, _size.length() / 2);
    }
    const R = this.radius;
    const ground = model.water ? Math.min(0, _box.min.y) - R * 0.25 : _box.min.y;
    this.dome.position.copy(this.target);
    this.dome.scale.setScalar(R * 30);
    this.floor.position.set(this.target.x, ground - 0.005, this.target.z);
    this.floor.scale.setScalar(R * 6);
    this.rings.position.set(this.target.x, ground + 0.002, this.target.z);
    this.rings.scale.setScalar(R * 3.2);
    this.rings.visible = !model.water;
    this.sea.visible = !!model.water;
    this.sea.position.set(this.target.x, 0, this.target.z);
    this.sea.scale.setScalar(R * 6);
    this.camera.near = R * 0.02;
    this.camera.far = R * 80;
    // Shadow frustum fitted round the model.
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -R * 1.6;
    sc.right = sc.top = R * 1.6;
    sc.near = R * 0.1;
    sc.far = R * 8;
    sc.updateProjectionMatrix();
    this.pan = { x: 0, y: 0 };
    this.shadowDirty = true;
  }

  private clear(): void {
    this.instancer.empty();
    if (this.model?.object) this.stage.remove(this.model.object);
    this.model = null;
  }

  /** Back to the opening framing. */
  reset(): void {
    this.yaw = 0.6;
    this.pitch = 0.32;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
  }

  /** Drops the stage's model (the gallery closed). */
  close(): void {
    this.clear();
  }

  update(dt: number): void {
    if (!this.model) return;
    this.t += dt;
    if (this.turntable && (this.idle -= dt) <= 0) this.yaw += dt * 0.18;
    // Moving parts: rides, wheels and rotors turn on stage as they do in the city.
    for (const s of this.spins) this.instancer.setMatrix(s.h, _m.multiplyMatrices(this.origin, spinPose(s.p.src, this.t, 0.42, _m2)));
    this.model.update?.(this.t, dt);
    if (this.spins.length || this.model.update) this.shadowDirty = true;

    const R = this.radius;
    const el = this.ctx.renderer.domElement;
    this.camera.aspect = Math.max(0.2, (el.clientWidth || 1) / (el.clientHeight || 1));
    // Fit the model's sphere into the narrower field of view, then zoom.
    const vfov = (this.camera.fov * Math.PI) / 360;
    const hfov = Math.atan(Math.tan(vfov) * this.camera.aspect * this.frameWidth);
    const d = (R / Math.sin(Math.min(vfov, hfov))) * 1.08 * this.zoom;
    const cp = Math.cos(this.pitch);
    const fx = Math.cos(this.yaw);
    const fz = -Math.sin(this.yaw);
    _eye.set(this.target.x + fx * this.pan.x * R, this.target.y + this.pan.y * R, this.target.z + fz * this.pan.x * R);
    this.camera.position.set(_eye.x + Math.sin(this.yaw) * cp * d, _eye.y + Math.sin(this.pitch) * d, _eye.z + Math.cos(this.yaw) * cp * d);
    this.camera.lookAt(_eye);
    this.camera.updateProjectionMatrix();

    // Key light over the camera's shoulder at the lighting's sun height; rim from behind.
    const look = LOOKS[this.lighting];
    const ky = this.yaw + 0.75;
    const [, sy] = look.sunDir;
    const kd = R * 4;
    this.key.position.set(this.target.x + Math.sin(ky) * kd, this.target.y + sy * kd * 1.2, this.target.z + Math.cos(ky) * kd);
    this.key.target.position.copy(this.target);
    this.rim.position.set(this.target.x - Math.sin(this.yaw) * kd, this.target.y + kd * 0.6, this.target.z - Math.cos(this.yaw) * kd);
    this.rim.target.position.copy(this.target);
    if (this.yaw !== this.lastYaw) this.shadowDirty = true;
    this.lastYaw = this.yaw;
    if (this.shadowDirty) {
      this.key.shadow.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.instancer.update(dt, this.camera);
  }

  /** Draws the studio in place of the city frame (`render.stage`). */
  render(): void {
    const q = this.ctx.quality.settings;
    if (this.fxQuality !== q) {
      this.fx.configure(q);
      this.fxQuality = q;
    }
    const look = LOOKS[this.lighting];
    this.key.color.setHex(look.key);
    this.key.intensity = look.keyI;
    this.rim.intensity = look.rimI;
    this.hemi.intensity = look.hemiI;
    this.skyTop.value.setHex(look.top);
    this.skyLow.value.setHex(look.low);
    this.scene.environment = this.ctx.scene.environment;

    // Hold the shared uniforms at the studio's values for this draw only.
    const saved = SAVED.map((k) => U[k].value as number);
    const savedV = SAVED_V.map((k) => (U[k].value as Vector3 | Color | Vector4).clone());
    U.night.value = look.night;
    U.lateNight.value = 0;
    U.grid.value = 0;
    U.overlay.value = 0;
    U.storm.value = U.heat.value = U.algae.value = U.rain.value = 0;
    U.seasonAmount.value = 0;
    U.pollen.value = 0;
    U.bloom.value = look.bloom;
    U.gradeSat.value = 1.04;
    U.gradeCon.value = 1.04;
    U.vignette.value = 0.32;
    U.cloudShadow.value = 0;
    U.sunDir.value.set(...look.sunDir).normalize();
    U.sunColor.value.setHex(look.sun);
    U.zenith.value.setHex(look.zenith);
    U.horizon.value.setHex(look.horizon);
    U.gradeLift.value.set(0, 0, 0);
    U.gradeGain.value.set(1, 1, 1);
    U.envTint.value.setRGB(1, 1, 1);
    U.eye.value.copy(this.camera.position);
    U.walker.value.set(0, 0, 0, 0);
    U.flash.value.w = 0;

    this.fx.render();

    SAVED.forEach((k, i) => ((U[k] as { value: number }).value = saved[i]!));
    SAVED_V.forEach((k, i) => (U[k].value as { copy(v: unknown): void }).copy(savedV[i]));
  }
}
