import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  DoubleSide,
  PlaneGeometry,
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
import { float, fog, fract, length, mix, normalView, positionLocal, positionViewDirection, positionWorld, rangeFogFactor, sin, smoothstep, uniform, uv, vec3, dot, clamp, attribute } from 'three/tsl';
import { bumped } from '@/render/materials/surface';
import { U } from '@/render/uniforms';
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
import { reelClock, type Reel } from './reel';
import { playIntro, type FilmIntro } from './loading';
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
  /** The ground's colour (`groundColour`); by default the sky's low colour, darkened. */
  private groundCol = uniform(new Color());
  private groundOwn = uniform(0);
  private fogCol = uniform(new Color());
  private fogNear = uniform(10);
  private fogFar = uniform(80);
  /** The camera's world position for shaders (`U.eye` is the city's). */
  private camWorld = uniform(new Vector3());
  /** Bounds of every placed piece (`heightAt`). */
  private solids: Box3[] = [];
  private spins: { h: InstanceHandle; p: DesignPiece; m: Matrix4 }[] = [];
  private shadowIn = 0;
  private skyR = 6;
  private skyOn = true;
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
    const g0 = mix(this.skyLow.mul(0.35), this.groundCol, this.groundOwn);
    groundMat.colorNode = mix(g0, g0.mul(0.35), smoothstep(0.1, 0.5, length(uv().sub(0.5))));
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
    this.groundColour(null);
    this.setFog(null);
    this.showSky(true);
    this.shots = [];
    this.onPins = null;
    this.onFrame = null;
    this.t = 0;
  }

  /**
   * Places a building type at level `tier` (0-based) with its lot centre at (x, z), turned by `yaw`, standing at `y`.
   * Returns its bounds (roofs are its top) in stage coordinates.
   */
  addBuilding(defId: string, tier: number, x: number, z: number, yaw = 0, y = 0, scale = 1, tint?: { col: number; k: number }): Box3 {
    const def = buildings.get(defId);
    // Template pieces are placed from the footprint's centre at ground level.
    const at = new Matrix4().makeRotationY(yaw).scale(_s.setScalar(scale)).setPosition(x, y, z);
    const box = new Box3();
    const pb = new Box3();
    const m = new Matrix4();
    const tc = tint ? new Color(tint.col) : null;
    for (const p of designPieces(def, tier)) {
      m.multiplyMatrices(at, p.src.local);
      // A tint pulls every piece toward one colour (Halcyon's marble, a ruin's stone), keeping some of its own.
      const col = tc ? p.color.clone().lerp(tc, tint!.k) : p.color;
      const h = this.instancer.addMatrix(p.piece, m, col, p.params);
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

  /**
   * Cumulus: `n` clouds of soft white puffs scattered over a ring `r0`..`r1` round `c` at heights `y0`..`y1` (seeded,
   * so a film's sky is the same every time). One merged mesh; lit by the stage (or the city) like everything else.
   */
  addClouds(c: Vector3, n: number, r0: number, r1: number, y0: number, y1: number, size: number, seed = 1): Mesh {
    const parts: BufferGeometry[] = [];
    const puff = new SphereGeometry(1, 14, 10);
    for (let i = 0; i < n; i++) {
      const a = hash2(i, seed) * Math.PI * 2;
      const r = r0 + hash2(i, seed + 1) * (r1 - r0);
      const cx = c.x + Math.cos(a) * r;
      const cz = c.z + Math.sin(a) * r;
      const cy = c.y + y0 + hash2(i, seed + 2) * (y1 - y0);
      const k = size * (0.6 + hash2(i, seed + 3) * 0.8);
      const m = 4 + Math.floor(hash2(i, seed + 4) * 5);
      for (let j = 0; j < m; j++) {
        const u = (j / (m - 1) - 0.5) * 2;
        const pr = k * (0.55 + 0.45 * (1 - Math.abs(u)) + hash2(j, i + seed) * 0.25);
        const g = puff.clone().scale(pr, pr * 0.8, pr);
        g.translate(cx + Math.cos(a + 1.57) * u * k * 1.6, cy + pr * 0.35, cz + Math.sin(a + 1.57) * u * k * 1.6 + (hash2(i, j + 9) - 0.5) * k);
        parts.push(g);
      }
      // A flat underside.
      const base = puff.clone().scale(k * 1.9, k * 0.35, k * 1.1).rotateY(-a);
      base.translate(cx, cy, cz);
      parts.push(base);
    }
    const mat = new MeshStandardNodeMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    mat.emissive = new Color(0xc8d8ee);
    mat.emissiveIntensity = 0.28;
    const mesh = new Mesh(mergeGeometries(parts), mat);
    for (const p of parts) p.dispose();
    puff.dispose();
    this.set.add(mesh);
    return mesh;
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

  /**
   * A sea: a wide water surface at height `y` round `c` (its mesh, to raise for a flood), with travelling waves in
   * its shading (a world-unit height field, faded with distance), a deep / shallow colour by view angle, and a sun
   * glint. Seen from below it is the bright ceiling of an underwater shot.
   */
  addSea(c: Vector3, y: number, size: number, deep = 0x0b3a52, shallow = 0x2f8fa0): Mesh {
    const m = new MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.05, side: DoubleSide });
    const p = positionWorld;
    const t = U.clock;
    const height = sin(p.x.mul(1.3).add(t.mul(1.1)))
      .mul(0.05)
      .add(sin(p.z.mul(1.7).sub(t.mul(0.8)).add(p.x.mul(0.4))).mul(0.04))
      .add(sin(p.x.mul(4.1).add(p.z.mul(3.3)).add(t.mul(2.3))).mul(0.012));
    m.normalNode = bumped(height, float(1).sub(smoothstep(0.02, 0.12, length(p.sub(this.camWorld)).div(400))));
    const facing = clamp(dot(normalView, positionViewDirection), 0, 1);
    m.colorNode = mix(uniform(new Color(shallow)), uniform(new Color(deep)), facing.pow(0.6));
    const sea = new Mesh(new PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2), m);
    sea.position.set(c.x, y, c.z);
    sea.receiveShadow = true;
    this.set.add(sea);
    return sea;
  }

  /**
   * Fog over the set (`null` clears it): range fog from `near` to `far` in `col` (underwater haze, a storm's murk).
   * Set it up before the stage opens (far away, if it comes later): materials built without fog stay unfogged. Its
   * colour and range are uniforms, so changing them later is free.
   */
  setFog(col: number | null, near = 10, far = 80): void {
    if (col === null) {
      this.scene.fogNode = null;
      return;
    }
    this.fogCol.value.setHex(col);
    this.fogNear.value = near;
    this.fogFar.value = far;
    this.scene.fogNode ??= fog(this.fogCol, rangeFogFactor(this.fogNear, this.fogFar));
  }

  /**
   * Rain: `n` streaks falling through a box of half-size `r` and height `h` round `c`, slanted by the wind, posed
   * entirely in the shader from the clock (no uploads). Returns its mesh (`visible` to start and stop the shower).
   */
  addRain(c: Vector3, r: number, h: number, n = 2500): Mesh {
    const parts: BufferGeometry[] = [];
    const streak = new PlaneGeometry(0.012, 0.35);
    for (let i = 0; i < n; i++) {
      const g = streak.clone().rotateY(hash2(i, 77) * Math.PI);
      g.translate((hash2(i, 71) - 0.5) * 2 * r, 0, (hash2(i, 75) - 0.5) * 2 * r);
      const seed = new Float32Array(g.attributes.position!.count).fill(hash2(i, 79));
      g.setAttribute('aSeed', new BufferAttribute(seed, 1));
      parts.push(g);
    }
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
    const sd = attribute('aSeed', 'float');
    // Each streak falls through the box and wraps round to the top (whole: the offset is per streak, not per vertex).
    const fall = fract(sd.mul(7.31).sub(U.clock.mul(float(1.6).add(sd.mul(0.6)))));
    m.positionNode = positionLocal.add(vec3(fall.oneMinus().mul(h * 0.18), fall.mul(h), 0));
    m.colorNode = vec3(0.55, 0.62, 0.72).mul(0.32);
    const rain = new Mesh(mergeGeometries(parts), m);
    for (const p of parts) p.dispose();
    streak.dispose();
    rain.position.copy(c);
    rain.frustumCulled = false;
    this.set.add(rain);
    return rain;
  }

  /** Shows or hides the sky (dome, stars, moon, sun): off for an underwater shot, where the fog is the world. */
  showSky(on: boolean): void {
    this.skyOn = on;
    this.dome.visible = on;
  }

  /** A colour for the ground under the set (a park's green, a plaza's stone); null follows the sky. */
  groundColour(col: number | null): void {
    this.groundOwn.value = col === null ? 0 : 1;
    if (col !== null) this.groundCol.value.setHex(col);
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

  /**
   * The film's loading beat (D-198): shows `intro` over the reel while the first shot is prepared (its shaders built,
   * a few frames drawn), then opens onto it. Call right after `open` / `openLocation`; resolves false if skipped. The
   * shots set before it are pushed back by the time it took, so the opening move starts as the iris opens.
   */
  async ready(reel: Reel, intro: FilmIntro): Promise<boolean> {
    const t0 = this.t;
    const prepared = (async () => {
      try {
        if (this.location) await this.ctx.services.get('render').postfx.precompile();
        else {
          this.syncFx();
          await this.fx.precompile();
        }
      } catch {
        /* compiled on first draw instead */
      }
      const f0 = this.ctx.engine.frames;
      for (let i = 0; i < 80 && this.ctx.engine.frames < f0 + 4; i++) await new Promise((r) => setTimeout(r, 50));
    })();
    const ok = await playIntro(reel, intro, prepared);
    const hidden = this.t - t0;
    for (const s of this.shots) s.at += hidden;
    return ok;
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
    this.camWorld.value.copy(cam.position);
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

  /** The set's post pipeline on the city's quality settings (bloom or not decides how it is prepared). */
  private syncFx(): void {
    const q = this.ctx.quality.settings;
    if (this.fxQuality !== q) {
      this.fx.configure(q);
      this.fxQuality = q;
    }
  }

  render(): void {
    this.syncFx();
    const L = this.look;
    this.key.color.setHex(L.key);
    this.key.intensity = L.keyI;
    this.rim.intensity = L.rimI;
    this.hemi.intensity = L.hemiI;
    this.skyTop.value.setHex(L.top);
    this.skyLow.value.setHex(L.low);
    this.starsOn.value = Math.max(0, Math.min(1, (L.night - 0.35) / 0.6));
    this.stars.visible = this.moon.visible = this.skyOn && this.starsOn.value > 0.004;
    // The sun shows once the night is mostly gone, low on the sky where the look puts it.
    this.sunOn.value = Math.max(0, Math.min(1, (0.6 - L.night) / 0.4));
    this.sun.visible = this.skyOn && this.sunOn.value > 0.004;
    if (this.sun.visible) {
      _v.set(L.sunDir[0], Math.max(0.04, L.sunDir[1] * 0.45), L.sunDir[2]).normalize();
      this.sun.position.copy(this.centre).addScaledVector(_v, this.skyR * 30);
    }
    this.scene.environment = this.ctx.scene.environment;
    // The film's own materials take image light from the environment directly: dim it with the look, as `envTint`
    // dims the city's.
    this.scene.environmentIntensity = L.env ?? 1;
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
