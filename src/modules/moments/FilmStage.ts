import {
  AdditiveBlending,
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
  OctahedronGeometry,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three/webgpu';
import { float, length, mix, positionLocal, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameContext } from '@/game/context';
import { buildings } from '@/content';
import { getPiece } from '@/assets/kit/pieces';
import { ChunkedInstancer, type InstanceHandle } from '@/render/Instancer';
import { PostFX } from '@/render/PostFX';
import { LOOKS, mixLook, withStageLook, type StageLook } from '@/render/stageUniforms';
import type { QualitySettings } from '@/render/Quality';
import { designPieces, spinPose, type DesignPiece } from '@/modules/construction/BuildingRenderer';
import { hash2 } from '@/sim/random';
import { reelClock } from './reel';
import { shotAt, type Shot } from './shots';

/**
 * The 3D film stage (D-196): a set for cutscenes made of the game's own models, drawn full screen through its own
 * post pipeline in place of the city frame (`render.stage`, as the gallery's studio is). A reel still owns the
 * letterbox, captions, Skip and the end card: those are DOM over this canvas, so a film mixes 2D and 3D.
 *
 * - **Set**: real buildings by type (`addBuilding`: the city's kit pieces and materials) and any module mesh (`add`),
 *   a gradient sky with stars and a moon, and a dark ground below the rooftops.
 * - **Light**: a `StageLook` (`render/stageUniforms.ts`) the film can grade between (`grade(a, b, t)`, night → dawn).
 * - **Camera**: shots as data on the film clock (`shots.ts`); `project` pins DOM to a 3D point.
 * - **Clock**: film time stops while `reelClock.held` (frame-exact snaps), like the reels' own waits.
 *
 * Built once per page on first use and kept: a film rebuilds only its set (`clear`), never shared geometry.
 */
export class FilmStage {
  /** The stage on screen, if any: the moments module updates it each frame. */
  static active: FilmStage | null = null;
  private static made: FilmStage | null = null;

  /** The page's stage (made on first use). */
  static get(ctx: GameContext): FilmStage {
    return (FilmStage.made ??= new FilmStage(ctx));
  }

  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(34, 1, 0.05, 3000);
  /** What a film adds; `clear` takes it all off. */
  readonly set = new Group();
  /** Kit pieces (one chunk, so a piece type keeps one batch). */
  private pieces = new Group();
  private instancer = new ChunkedInstancer(this.pieces, 4096);
  private fx: PostFX;
  private fxQuality: QualitySettings | null = null;
  private key = new DirectionalLight(0xffffff, 1);
  private rim = new DirectionalLight(0x8ff8ec, 1);
  private hemi = new HemisphereLight(0xdff6ff, 0x30443a, 1);
  private dome: Mesh;
  private ground: Mesh;
  private stars: Mesh;
  private moon: Mesh;
  private sun: Mesh;
  private sunOn = uniform(0);
  private skyTop = uniform(new Color());
  private skyLow = uniform(new Color());
  private starsOn = uniform(1);
  /** Bounds of every placed piece (`heightAt`). */
  private solids: Box3[] = [];
  private spins: { h: InstanceHandle; p: DesignPiece; m: Matrix4 }[] = [];
  private shadowIn = 0;
  private skyR = 6;
  private resume: { speed: number; suspended: boolean; camera: boolean } | null = null;
  /** On location (D-197): the real city is the set, seen through the city camera; else the stage's own scene. */
  private location = false;
  private cityView: { x: number; z: number; yaw: number; pitch: number; distance: number; aim: number; fov: number; near: number } | null = null;
  private time: number | null = null;

  /** The stage's light now (films set it, or grade between two). */
  look: StageLook = mixLook(LOOKS.night, LOOKS.night, 0);
  shots: Shot[] = [];
  /** Film seconds since `open` (held with the reels' clock). */
  t = 0;
  /** Where the light and the sky centre (the set's middle). */
  readonly centre = new Vector3();
  /** Per-frame direction of the film's own actors (`t` = film time). */
  onFrame: ((t: number, dt: number) => void) | null = null;
  /**
   * Handheld: a slow drift of the aim (radians at 1, ~0.004 rad by default), so no frame is a locked-off still. A film
   * raises it for a shaking moment (a wonder breaking the surface) and drops it to 0 for a still one.
   */
  shake = 1;
  /** After the camera has moved this frame: DOM pinned to the set (`project`). */
  onPins: (() => void) | null = null;
  /** Where shots with `rel` are framed from (a film moves it with its actor: tracking shots). */
  readonly anchor = new Vector3();

  private constructor(private ctx: GameContext) {
    this.fx = new PostFX(ctx.renderer, this.scene, this.camera);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.autoUpdate = false;
    this.scene.add(this.set, this.pieces, this.key, this.key.target, this.rim, this.rim.target, this.hemi);

    const domeMat = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
    domeMat.colorNode = mix(this.skyLow, this.skyTop, smoothstep(0.0, 0.55, positionLocal.y));
    this.dome = new Mesh(new SphereGeometry(1, 48, 24), domeMat);
    this.dome.renderOrder = -2;
    this.dome.frustumCulled = false;

    const groundMat = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    groundMat.colorNode = mix(this.skyLow.mul(0.35), this.skyLow.mul(0.12), smoothstep(0.1, 0.5, length(uv().sub(0.5))));
    this.ground = new Mesh(new CircleGeometry(1, 64).rotateX(-Math.PI / 2), groundMat);
    this.ground.receiveShadow = true;

    // Stars: one merged mesh of tiny points high on the dome, glowing (bloom) until dawn puts them out.
    const parts: BufferGeometry[] = [];
    const star = new OctahedronGeometry(1, 0);
    for (let i = 0; i < 420; i++) {
      const a = hash2(i, 1) * Math.PI * 2;
      const e = 0.05 + hash2(i, 2) ** 0.8 * 1.35;
      const s = 0.0022 + hash2(i, 3) ** 3 * 0.0045;
      const g = star.clone().scale(s, s, s);
      g.translate(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      parts.push(g);
    }
    // Added light (they fade into the dawn sky rather than darken it), drawn over the dome.
    const starMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
    starMat.colorNode = vec3(1, 0.96, 0.88).mul(mix(float(0.7), float(1.6), positionLocal.y).mul(this.starsOn));
    this.stars = new Mesh(mergeGeometries(parts), starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    for (const p of parts) p.dispose();
    const moonMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
    moonMat.colorNode = vec3(1, 0.96, 0.84).mul(this.starsOn.mul(1.4));
    this.moon = new Mesh(new SphereGeometry(1, 24, 16), moonMat);
    this.moon.renderOrder = -1;
    // The sun: a warm disc with a halo (bloom) that comes up as the night lifts, along the look's sun direction.
    const sunMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
    sunMat.colorNode = vec3(1.6, 1.15, 0.7).mul(this.sunOn);
    this.sun = new Mesh(new SphereGeometry(1, 24, 16), sunMat);
    this.sun.renderOrder = -1;
    this.sun.frustumCulled = false;
    this.scene.add(this.dome, this.ground, this.stars, this.moon, this.sun);
  }

  /** Takes the set down (the previous film's buildings and actors). */
  clear(): void {
    this.instancer.empty();
    this.set.clear();
    this.spins = [];
    this.solids = [];
    this.shots = [];
    this.onPins = null;
    this.onFrame = null;
    this.t = 0;
  }

  /**
   * Places a building type at level `tier` (0-based) with its lot centre at (x, z), turned by `yaw`, standing at `y`.
   * Returns its bounds (roofs are its top) in stage coordinates.
   */
  addBuilding(defId: string, tier: number, x: number, z: number, yaw = 0, y = 0): Box3 {
    const def = buildings.get(defId);
    // Template pieces are placed from the footprint's centre at ground level.
    const at = new Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    const box = new Box3();
    const pb = new Box3();
    const m = new Matrix4();
    for (const p of designPieces(def, tier)) {
      m.multiplyMatrices(at, p.src.local);
      const h = this.instancer.addMatrix(p.piece, m, p.color, p.params);
      if (p.src.spin) this.spins.push({ h, p, m: at.clone() });
      const g = getPiece(p.piece).geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      pb.copy(g.boundingBox!).applyMatrix4(m);
      this.solids.push(pb.clone());
      box.union(pb);
    }
    return box;
  }

  /**
   * Top of the set at (x, z): the highest placed piece over that point (its bounds) at least `min` wide each way, so
   * slabs and roofs count and the trees, lamps and planters on them don't; `base` on open ground.
   */
  heightAt(x: number, z: number, base = 0, min = 0.8): number {
    let y = base;
    for (const b of this.solids)
      if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y > y && b.max.x - b.min.x >= min && b.max.z - b.min.z >= min)
        y = b.max.y;
    return y;
  }

  add(...objects: Object3D[]): void {
    this.set.add(...objects);
  }

  /** Lays out the sky, ground (at `base`), moon and shadow round the set's middle `c`, sized to `r`. */
  frame(c: Vector3, r: number, moon: Vector3, base = 0): void {
    this.centre.copy(c);
    this.dome.position.copy(c);
    this.dome.scale.setScalar(r * 40);
    this.stars.position.copy(c);
    this.stars.scale.setScalar(r * 38);
    this.ground.position.set(c.x, base - 0.01, c.z);
    this.ground.scale.setScalar(r * 12);
    this.moon.position.copy(moon).normalize().multiplyScalar(r * 30).add(c);
    this.moon.scale.setScalar(r * 0.7);
    this.sun.scale.setScalar(r * 1.1);
    this.skyR = r;
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -r * 1.4;
    sc.right = sc.top = r * 1.4;
    sc.near = r * 0.1;
    sc.far = r * 8;
    sc.updateProjectionMatrix();
    this.camera.far = r * 90;
  }

  /** The light between two looks (`t` in [0, 1]); stars fade out as the night lifts. */
  grade(a: StageLook, b: StageLook, t: number): void {
    mixLook(a, b, t, this.look);
  }

  /** The camera in use: the stage's own, or the city's on location. */
  get cam(): PerspectiveCamera {
    return this.location ? this.ctx.camera : this.camera;
  }

  /**
   * Shoots on location (D-197): the real island is the set, drawn by the city's own pipeline from the city camera,
   * which the film poses (`cameraCtl.cinematic`, as the tour does: LODs, shadows and fog follow it). The film's
   * actors (`add`) join the city scene for the film; `timeOfDay` (render only) sets the hour the sky shows.
   */
  openLocation(timeOfDay: number | null = null): void {
    const { ctx } = this;
    const c = ctx.cameraCtl;
    this.location = true;
    this.cityView ??= { x: c.target.x, z: c.target.z, yaw: c.yaw, pitch: c.pitch, distance: c.distance, aim: c.aim, fov: ctx.camera.fov, near: ctx.camera.near };
    ctx.scene.add(this.set, this.pieces);
    c.cinematic = true;
    c.externalMotion = true;
    this.setTime(timeOfDay);
    this.open();
  }

  /** The hour the sky shows on location ([0, 1), render only), or null for the city's own. */
  setTime(t: number | null): void {
    this.time = t;
    const world = this.ctx.services.tryGet('world');
    if (world) world.timeOverride = t === null ? null : ((t % 1) + 1) % 1;
  }

  get timeOfDay(): number | null {
    return this.time;
  }

  open(): void {
    FilmStage.active = this;
    const { ctx } = this;
    this.resume ??= { speed: ctx.engine.speed, suspended: ctx.tools.suspended, camera: ctx.cameraCtl.enabled };
    ctx.tools.suspended = true;
    ctx.cameraCtl.enabled = false;
    const render = ctx.services.get('render');
    if (!this.location) render.stage = this;
    render.power.animating = true;
    // Its first frames compile the set's shaders: don't let them cut the render scale (D-142).
    render.dynamicResolution.hold(3);
    this.shadowIn = 0;
    this.update(0);
  }

  close(): void {
    if (FilmStage.active !== this) return;
    FilmStage.active = null;
    const { ctx } = this;
    const render = ctx.services.get('render');
    if (render.stage === this) render.stage = null;
    render.power.animating = false;
    render.dynamicResolution.hold(1);
    if (this.resume) {
      ctx.tools.suspended = this.resume.suspended;
      ctx.cameraCtl.enabled = this.resume.camera;
      this.resume = null;
    }
    if (this.location) {
      // Back to the steward's view, exactly as it was.
      const c = ctx.cameraCtl;
      ctx.scene.remove(this.set, this.pieces);
      this.setTime(null);
      c.cinematic = false;
      c.externalMotion = false;
      const v = this.cityView!;
      ctx.camera.fov = v.fov;
      ctx.camera.near = v.near;
      ctx.camera.updateProjectionMatrix();
      c.holdAt({ x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch, distance: v.distance, aim: v.aim });
      this.cityView = null;
      this.location = false;
      this.scene.add(this.set, this.pieces);
    }
    this.shake = 1;
    this.clear();
  }

  private anchorT: [number, number, number] = [0, 0, 0];
  private framing = { pos: [0, 0, 0] as [number, number, number], look: [0, 0, 0] as [number, number, number], fov: 34 };

  update(dt: number): void {
    if (!reelClock.held) this.t += dt;
    else dt = 0;
    this.onFrame?.(this.t, dt);
    const a = this.anchorT;
    a[0] = this.anchor.x;
    a[1] = this.anchor.y;
    a[2] = this.anchor.z;
    const f = shotAt(this.shots, this.t, this.framing, a);
    const cam = this.cam;
    const el = this.ctx.renderer.domElement;
    cam.aspect = Math.max(0.2, (el.clientWidth || 1) / (el.clientHeight || 1));
    cam.fov = f.fov;
    cam.position.set(...f.pos);
    // Handheld drift: two slow, incommensurate sines per axis, scaled by distance so a close-up and a wide sway alike.
    const d = cam.position.distanceTo(_v.set(...f.look));
    const k = this.shake * 0.004 * d;
    const t = this.t;
    _v.x += (Math.sin(t * 0.61) + Math.sin(t * 1.37 + 1.3) * 0.5) * k;
    _v.y += (Math.sin(t * 0.83 + 2.1) + Math.sin(t * 1.91) * 0.4) * k * 0.7;
    _v.z += Math.sin(t * 0.47 + 0.7) * k;
    if (this.shake > 2) _v.addScaledVector(_s.set(Math.sin(t * 31), Math.sin(t * 27 + 1), Math.sin(t * 23 + 2)), k * 0.35);
    cam.lookAt(_v);
    cam.near = Math.max(0.01, d * 0.02);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    if (this.location) {
      // The city view's focus (shadows, fog, walkers, LODs) follows the film, as it follows the tour.
      const c = this.ctx.cameraCtl;
      c.target.copy(_v);
      c.distance = d;
      _s.subVectors(cam.position, _v);
      c.yaw = Math.atan2(_s.x, _s.z);
      c.pitch = Math.asin(Math.max(-1, Math.min(1, _s.y / Math.max(1e-6, d))));
    }
    this.onPins?.();

    for (const s of this.spins) this.instancer.setMatrix(s.h, _m.multiplyMatrices(s.m, spinPose(s.p.src, this.t, 0.42, _m2)));
    if (this.location) {
      this.instancer.update(dt, cam);
      return;
    }

    // Lights: the key from the look's sun (the moon at night), a cool rim opposite.
    const L = this.look;
    const c = this.centre;
    const r = this.key.shadow.camera.right / 1.4;
    this.key.position.set(c.x + L.sunDir[0] * r * 4, c.y + L.sunDir[1] * r * 4, c.z + L.sunDir[2] * r * 4);
    this.key.target.position.copy(c);
    this.rim.position.set(c.x - L.sunDir[0] * r * 4, c.y + r * 2, c.z - L.sunDir[2] * r * 4);
    this.rim.target.position.copy(c);
    // The actors move all film long: the shadow map (a small, tight one) refreshes at about 30 Hz, not per frame.
    if ((this.shadowIn -= dt) <= 0) {
      this.key.shadow.needsUpdate = true;
      this.shadowIn = 1 / 30;
    }
    this.instancer.update(dt, this.camera);
  }

  render(): void {
    const q = this.ctx.quality.settings;
    if (this.fxQuality !== q) {
      this.fx.configure(q);
      this.fxQuality = q;
    }
    const L = this.look;
    this.key.color.setHex(L.key);
    this.key.intensity = L.keyI;
    this.rim.intensity = L.rimI;
    this.hemi.intensity = L.hemiI;
    this.skyTop.value.setHex(L.top);
    this.skyLow.value.setHex(L.low);
    this.starsOn.value = Math.max(0, Math.min(1, (L.night - 0.35) / 0.6));
    this.stars.visible = this.moon.visible = this.starsOn.value > 0.004;
    // The sun shows once the night is mostly gone, low on the sky where the look puts it.
    this.sunOn.value = Math.max(0, Math.min(1, (0.6 - L.night) / 0.4));
    this.sun.visible = this.sunOn.value > 0.004;
    if (this.sun.visible) {
      _v.set(L.sunDir[0], Math.max(0.04, L.sunDir[1] * 0.45), L.sunDir[2]).normalize();
      this.sun.position.copy(this.centre).addScaledVector(_v, this.skyR * 30);
    }
    this.scene.environment = this.ctx.scene.environment;
    withStageLook(L, this.camera.position, () => this.fx.render());
  }

  /** Screen position (CSS px in the viewport) of a stage point, for DOM pinned to it; `on` false behind the camera. */
  project(p: Vector3, out = { x: 0, y: 0, on: false }): { x: number; y: number; on: boolean } {
    _v.copy(p).project(this.cam);
    const r = this.ctx.renderer.domElement.getBoundingClientRect();
    out.x = r.left + ((_v.x + 1) / 2) * r.width;
    out.y = r.top + ((1 - _v.y) / 2) * r.height;
    out.on = _v.z < 1;
    return out;
  }
}

const _m = new Matrix4();
const _m2 = new Matrix4();
const _v = new Vector3();
const _s = new Vector3();
