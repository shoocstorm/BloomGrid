import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { cameraPosition, dot, exp, float, fog, max, mix, normalize, pmremTexture, positionWorld, pow, rangeFogFactor } from 'three/tsl';
import { getMaterial } from '@/render/materials/library';
import { U } from '@/render/uniforms';

type V3 = [number, number, number];

interface SkyKey {
  e: number; // sun elevation (sin)
  zenith: number;
  horizon: number;
  sun: number;
  sunI: number;
  hemiI: number;
  /** Display-space grade (D-120): lift into shadows, gain on highlights, saturation, contrast. */
  lift: V3;
  gain: V3;
  sat: number;
  con: number;
  /** Selective bloom strength. */
  bloom: number;
}

// Keyframes by sun elevation: deep night -> dusk -> golden hour -> day. Golden hour warms the light and
// cools the shadows; night lifts the shadows toward blue so the dark still reads.
const KEYS: SkyKey[] = [
  { e: -0.35, zenith: 0x070b24, horizon: 0x18204a, sun: 0x8fa8ff, sunI: 0.35, hemiI: 0.35, lift: [0, 0.012, 0.04], gain: [0.94, 0.98, 1.06], sat: 0.92, con: 1.04, bloom: 0.9 },
  { e: -0.05, zenith: 0x1c2a63, horizon: 0x6a5a9a, sun: 0xa0b4ff, sunI: 0.2, hemiI: 0.45, lift: [0.03, 0, 0.035], gain: [1.03, 0.97, 1], sat: 1.02, con: 1.04, bloom: 0.8 },
  { e: 0.08, zenith: 0x4a6fb8, horizon: 0xffb38a, sun: 0xffb070, sunI: 1.6, hemiI: 0.7, lift: [0, 0.008, 0.025], gain: [1.08, 1, 0.9], sat: 1.14, con: 1.05, bloom: 0.65 },
  { e: 0.3, zenith: 0x5aa8f0, horizon: 0xd9ecf5, sun: 0xffeccc, sunI: 2.6, hemiI: 0.9, lift: [0, 0, 0.005], gain: [1.02, 1, 0.98], sat: 1.1, con: 1.04, bloom: 0.5 },
  { e: 1.0, zenith: 0x4f9ff0, horizon: 0xcfeaff, sun: 0xfff6e6, sunI: 3.0, hemiI: 1.0, lift: [0, 0, 0], gain: [1, 1, 1], sat: 1.08, con: 1.04, bloom: 0.45 },
];

const ca = new Color();
const cb = new Color();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Sky colour the environment light was baked under (noon), for the live tint ratio. */
const NOON = new Color(0xcfeaff).multiplyScalar(0.6).add(new Color(0x4f9ff0).multiplyScalar(0.4));

/** Sky dome, sun/moon light with camera-following shadows, hemisphere fill and fog. */
export class Atmosphere {
  readonly sky: Mesh;
  readonly sun = new DirectionalLight(0xffffff, 3);
  readonly hemi = new HemisphereLight(0xcfeaff, 0x5a7a4a, 1);
  /**
   * Fog parameters (D-120): a node fog on the scene that thins with height and warms toward the sun. Writes
   * to `fog.color` reach the shader directly (it is the uniform's colour); near/far are uniforms too.
   */
  readonly fog = {
    color: U.fogColor.value as Color,
    get near() { return U.fogNear.value; },
    set near(v: number) { U.fogNear.value = v; },
    get far() { return U.fogFar.value; },
    set far(v: number) { U.fogFar.value = v; },
  };
  /** Multiplier on the ramp's bloom strength (debug inspector). */
  bloomGain = 1;
  private sunDir = new Vector3();
  /** Half-size of the shadow frustum; casters beyond it are culled from the shadow pass. */
  shadowExtent = 60;
  sunElevation = 1;

  constructor(private scene: Scene) {
    this.sky = new Mesh(new SphereGeometry(1, 32, 16), getMaterial('sky'));
    this.sky.scale.setScalar(1800);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.sky.name = 'sky';
    scene.add(this.sky, this.sun, this.sun.target, this.hemi);
    scene.fogNode = fogNode();
    this.sun.castShadow = true;
    // Shadows are re-rendered on demand (see `follow`), not every frame: the shadow pass is a
    // second full draw of every caster and the single biggest avoidable GPU cost.
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.needsUpdate = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.setShadowMapSize(2048);
  }

  setShadowMapSize(size: number): void {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as never;
    this.sun.shadow.needsUpdate = true;
  }

  /** Bakes an image-based lighting environment from the daytime sky (once). */
  bakeEnvironment(renderer: WebGPURenderer): void {
    try {
      this.applyTime(0.5);
      const envScene = new Scene();
      const sky = new Mesh(this.sky.geometry, this.sky.material);
      sky.scale.setScalar(100);
      envScene.add(sky);
      const pmrem = new PMREMGenerator(renderer);
      const env = pmrem.fromScene(envScene, 0.04).texture;
      pmrem.dispose();
      this.scene.environment = env;
      // The bake is noon; a live tint carries the sky's hue so reflections warm at dusk (D-120).
      this.scene.environmentNode = pmremTexture(env).mul(U.envTint);
    } catch (e) {
      console.warn('[atmosphere] environment bake failed, continuing without IBL', e);
    }
  }

  /** Sets sky colours, sun direction and light intensities for a time of day in [0,1). */
  applyTime(timeOfDay: number): void {
    const ang = (timeOfDay - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    this.sunElevation = elev;
    const az = ang * 0.6 + 0.8;
    this.sunDir.set(Math.cos(az) * Math.cos(Math.asin(elev)), elev, Math.sin(az) * Math.cos(Math.asin(elev))).normalize();

    // Interpolate keyframes.
    let i = 0;
    while (i < KEYS.length - 2 && elev > KEYS[i + 1]!.e) i++;
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    const t = Math.min(1, Math.max(0, (elev - a.e) / (b.e - a.e)));
    U.zenith.value.copy(ca.setHex(a.zenith).lerp(cb.setHex(b.zenith), t));
    U.horizon.value.copy(ca.setHex(a.horizon).lerp(cb.setHex(b.horizon), t));
    const sunCol = ca.setHex(a.sun).lerp(cb.setHex(b.sun), t);
    U.sunColor.value.copy(sunCol);
    U.sunDir.value.copy(this.sunDir);
    this.fog.color.copy(U.horizon.value);
    // Environment tint: the current sky's hue against the noon bake (brightness stays with environmentIntensity).
    const sky = ca.copy(U.horizon.value).multiplyScalar(0.6).add(cb.copy(U.zenith.value).multiplyScalar(0.4));
    sky.r /= NOON.r;
    sky.g /= NOON.g;
    sky.b /= NOON.b;
    const lum = Math.max(0.05, sky.r * 0.3 + sky.g * 0.59 + sky.b * 0.11);
    U.envTint.value.setRGB(
      lerp(1, Math.min(2, sky.r / lum), 0.6),
      lerp(1, Math.min(2, sky.g / lum), 0.6),
      lerp(1, Math.min(2, sky.b / lum), 0.6),
    );
    // Grade and bloom follow the same keys.
    U.gradeLift.value.set(lerp(a.lift[0], b.lift[0], t), lerp(a.lift[1], b.lift[1], t), lerp(a.lift[2], b.lift[2], t));
    U.gradeGain.value.set(lerp(a.gain[0], b.gain[0], t), lerp(a.gain[1], b.gain[1], t), lerp(a.gain[2], b.gain[2], t));
    U.gradeSat.value = lerp(a.sat, b.sat, t);
    U.gradeCon.value = lerp(a.con, b.con, t);
    U.bloom.value = lerp(a.bloom, b.bloom, t) * this.bloomGain;

    // Night: light comes from the moon (opposite the sun), soft and blue.
    const night = 1 - smooth(-0.12, 0.12, elev);
    U.night.value = night;
    U.cloudShadow.value = 0.13 * (1 - night);
    // Lights go out from 22:00 to 01:30 and come back before dawn (timeOfDay 0 = midnight).
    const h = (timeOfDay * 24 + 2) % 24; // hours since 22:00
    U.lateNight.value = smooth(0, 3.5, h) * (1 - smooth(6.5, 7.75, h));
    this.sun.color.copy(sunCol);
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    this.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * t;
    this.hemi.color.copy(U.horizon.value).lerp(ca.setHex(0xffffff), 0.3);
    this.hemi.groundColor.setHex(night > 0.5 ? 0x1a2a3a : 0x5a7a4a);
    if (elev < 0) this.sunDir.multiplyScalar(-1).setY(Math.max(0.35, -elev));
    this.scene.environmentIntensity = 0.25 + 0.75 * (1 - night);
  }

  private lastShadowPos = new Vector3(Infinity, 0, 0);
  private lastShadowDir = new Vector3();
  private shadowDirty = true;
  private sinceShadow = 0;
  /** Upper bound on shadow-map refreshes per second. */
  maxShadowHz = 15;
  /** 0..1 haze (set by weather): pulls the fog in so distant districts soften. */
  haze = 0;

  /** Request a shadow refresh (geometry changed: building placed, removed, growing…). */
  invalidateShadows(): void {
    this.shadowDirty = true;
  }

  /**
   * Keeps the sky centred on the camera and the shadow frustum around the view target.
   * The shadow map refreshes only when the light moved (sun angle / snapped frustum position) or
   * geometry was invalidated, throttled to `maxShadowHz`.
   */
  follow(cameraPos: Vector3, target: Vector3, distance: number, dt = 0): void {
    this.sky.position.copy(cameraPos);
    // Capped: at overview zoom, distant shadows are sub-pixel but cost a draw call per batch.
    const ext = Math.min(110, Math.max(25, distance * 0.9));
    if (Math.abs(ext - this.shadowExtent) > 4) {
      this.shadowExtent = ext;
      this.shadowDirty = true;
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -ext;
      cam.right = cam.top = ext;
      cam.near = 1;
      cam.far = 600;
      cam.updateProjectionMatrix();
    }
    // Snap to shadow texels to avoid shimmering while panning.
    const texel = (this.shadowExtent * 2) / this.sun.shadow.mapSize.x;
    const tx = Math.round(target.x / texel) * texel;
    const tz = Math.round(target.z / texel) * texel;
    this.sun.target.position.set(tx, target.y, tz);
    this.sun.position.set(tx, target.y, tz).addScaledVector(this.sunDir, 250);
    this.sinceShadow += dt;
    const moved = this.lastShadowPos.distanceToSquared(this.sun.position) > 1e-6;
    // ~0.6° of sun travel (≈ every 0.6 s at 1× speed): shadows creep imperceptibly in between.
    const turned = this.lastShadowDir.angleTo(this.sunDir) > 0.01;
    if ((moved || turned || this.shadowDirty) && this.sinceShadow >= 1 / this.maxShadowHz) {
      this.sun.shadow.needsUpdate = true;
      this.lastShadowPos.copy(this.sun.position);
      this.lastShadowDir.copy(this.sunDir);
      this.shadowDirty = false;
      this.sinceShadow = 0;
    }
    this.fog.near = Math.max(120, distance * 1.6) * (1 - 0.85 * this.haze);
    this.fog.far = this.fog.near + 700 * (1 - 0.9 * this.haze);
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Scene fog (D-120): the old range fog, thinned with height above the sea so towers and hills stand out of
 * the haze, and tinted toward the sun's colour when looking toward it (aerial perspective at dusk).
 */
function fogNode() {
  const range = rangeFogFactor(U.fogNear, U.fogFar);
  const height = exp(max(positionWorld.y, 0).mul(-1 / 45));
  const factor = range.mul(mix(float(0.6), float(1), height));
  const view = normalize(positionWorld.sub(cameraPosition));
  const toSun = pow(max(dot(view, U.sunDir), 0), 6).mul(float(1).sub(U.night)).mul(0.4);
  return fog(mix(U.fogColor, U.sunColor, toSun), factor);
}
