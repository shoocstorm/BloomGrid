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
import {
  cameraPosition,
  dot,
  exp,
  float,
  fog,
  length,
  max,
  mix,
  normalize,
  PCFShadowFilter,
  pmremTexture,
  positionWorld,
  pow,
  rangeFogFactor,
  smoothstep,
  type vec2,
} from 'three/tsl';
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
// cools the shadows; night is a bright moonlit blue (D-203): the city stays readable and playable after dark.
const KEYS: SkyKey[] = [
  { e: -0.35, zenith: 0x0e1a40, horizon: 0x283a6a, sun: 0xa8bcff, sunI: 0.75, hemiI: 0.6, lift: [0.012, 0.024, 0.055], gain: [1.02, 1.06, 1.13], sat: 0.96, con: 1.02, bloom: 0.85 },
  { e: -0.05, zenith: 0x22346e, horizon: 0x6e60a0, sun: 0xaabcff, sunI: 0.55, hemiI: 0.62, lift: [0.032, 0.012, 0.042], gain: [1.05, 1, 1.04], sat: 1.03, con: 1.03, bloom: 0.76 },
  { e: 0.08, zenith: 0x4a6fb8, horizon: 0xffb38a, sun: 0xffb070, sunI: 1.8, hemiI: 0.55, lift: [0, 0.008, 0.025], gain: [1.08, 1, 0.9], sat: 1.14, con: 1.05, bloom: 0.65 },
  // Morning and late afternoon (D-230): the warm light lasts past the first hour, so a day has a shape, not one noon.
  { e: 0.2, zenith: 0x5596e2, horizon: 0xf0d8bc, sun: 0xffd8a6, sunI: 2.5, hemiI: 0.58, lift: [0, 0.004, 0.018], gain: [1.06, 1, 0.93], sat: 1.08, con: 1.07, bloom: 0.55 },
  { e: 0.42, zenith: 0x4f9ced, horizon: 0xd2e7f6, sun: 0xffeccc, sunI: 3.0, hemiI: 0.62, lift: [0, 0, 0.006], gain: [1.03, 1, 0.97], sat: 1.05, con: 1.07, bloom: 0.5 },
  // Day: a bluer sky and a little less saturation than before (the old milky horizon flattened everything behind
  // the island). Noon keeps its fill and contrast: more of either made thin spokes and rails flicker (D-230).
  { e: 1.0, zenith: 0x438fe6, horizon: 0xc2def5, sun: 0xfff6e6, sunI: 3.3, hemiI: 0.72, lift: [0, 0, 0], gain: [1, 1, 1], sat: 1.04, con: 1.04, bloom: 0.45 },
];

/**
 * The Natural style's keys (D-243), at the same sun elevations as `KEYS` so the two blend key by key on
 * `U.realism`. Real daylight is a hard sun over a weak sky fill (shadow sides fall off, contrast rises), a deeper
 * zenith over a paler, hazier horizon, golden hours that redden the light and drain the sky, and a moonlit night that
 * is darker and greyer than the Bloom style's but still playable. The grade stays near neutral: less saturation, a
 * filmic contrast, little lift and a weaker bloom (lamps, not neon).
 */
const NATURAL: SkyKey[] = [
  { e: -0.35, zenith: 0x070d22, horizon: 0x1a2440, sun: 0x9fb2dc, sunI: 0.62, hemiI: 0.4, lift: [0.008, 0.014, 0.032], gain: [1, 1.03, 1.08], sat: 0.84, con: 1.07, bloom: 0.62 },
  { e: -0.05, zenith: 0x1b2a56, horizon: 0x7d6476, sun: 0xa9b6e2, sunI: 0.48, hemiI: 0.42, lift: [0.018, 0.008, 0.024], gain: [1.04, 1, 1.02], sat: 0.9, con: 1.08, bloom: 0.52 },
  { e: 0.08, zenith: 0x3b5f9c, horizon: 0xf0a56c, sun: 0xff9c56, sunI: 2.3, hemiI: 0.32, lift: [0, 0.004, 0.014], gain: [1.1, 1, 0.86], sat: 1.0, con: 1.12, bloom: 0.42 },
  { e: 0.2, zenith: 0x3f7cc8, horizon: 0xe6d3bc, sun: 0xffd4a4, sunI: 3.3, hemiI: 0.34, lift: [0, 0.002, 0.008], gain: [1.05, 1, 0.94], sat: 0.94, con: 1.12, bloom: 0.34 },
  { e: 0.42, zenith: 0x3a7fd2, horizon: 0xcfdcea, sun: 0xfff0da, sunI: 3.9, hemiI: 0.36, lift: [0, 0, 0.004], gain: [1.02, 1, 0.98], sat: 0.92, con: 1.12, bloom: 0.3 },
  { e: 1.0, zenith: 0x2f74cf, horizon: 0xc6d7e8, sun: 0xfff8ee, sunI: 4.2, hemiI: 0.38, lift: [0, 0, 0], gain: [1, 1, 1], sat: 0.92, con: 1.12, bloom: 0.27 },
];
/** The key the atmosphere reads: Bloom and Natural keys blended on `U.realism` (rebuilt each `applyTime`). */
const BLENDED: SkyKey[] = KEYS.map((k) => ({ ...k, lift: [...k.lift] as V3, gain: [...k.gain] as V3 }));

const ca = new Color();
const cb = new Color();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Sky colour the environment light was baked under (noon), for the live tint ratio. */
const NOON = new Color(0xc2def5).multiplyScalar(0.6).add(new Color(0x438fe6).multiplyScalar(0.4));

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
  /** 0 until the first `follow` picks a level (and configures the shadow camera). */
  shadowExtent = 0;
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
    // Shadows fade out toward the shadow map's edge (`U.shadowFade`, D-231): chunks switch their casting on and off
    // as the view pans (to keep the shadow pass small), and a hard map edge or a chunk's shadows vanishing at once
    // read as blinking from the island view. Faded in the map's own space, neither shows.
    const pcf = PCFShadowFilter as unknown as (a: unknown) => ReturnType<typeof float>;
    // three calls the filter as a plain function of { depthTexture, shadowCoord, shadow, depthLayer }.
    (this.sun.shadow as unknown as { filterNode: unknown }).filterNode = (args: { shadowCoord: { xy: ReturnType<typeof vec2> } }) => {
      const r = length(args.shadowCoord.xy.sub(0.5).mul(2));
      return mix(pcf(args), float(1), smoothstep(U.shadowFade.x, U.shadowFade.y, r));
    };
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
    // Baked in the Bloom style whatever the current one: `envTint` measures the live sky against this noon (`NOON`).
    const r = U.realism.value;
    U.realism.value = 0;
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
    } finally {
      U.realism.value = r;
    }
  }

  /** Sets sky colours, sun direction and light intensities for a time of day in [0,1). */
  applyTime(timeOfDay: number): void {
    const ang = (timeOfDay - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    this.sunElevation = elev;
    const az = ang * 0.6 + 0.8;
    this.sunDir.set(Math.cos(az) * Math.cos(Math.asin(elev)), elev, Math.sin(az) * Math.cos(Math.asin(elev))).normalize();

    // Interpolate keyframes (of the style: Bloom, Natural or a blend while switching, D-243).
    const r = U.realism.value;
    const keys = r <= 0 ? KEYS : r >= 1 ? NATURAL : blendKeys(r);
    let i = 0;
    while (i < keys.length - 2 && elev > keys[i + 1]!.e) i++;
    const a = keys[i]!;
    const b = keys[i + 1]!;
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
    // The Natural style lights shadow sides from the sky's reflections more than from the flat hemisphere fill.
    this.scene.environmentIntensity = lerp(0.36 + 0.36 * (1 - night), 0.3 + 0.5 * (1 - night), r);
  }

  /** The snapped shadow focus at the last refresh (the light's target, not its position: see `follow`). */
  private lastShadowPos = new Vector3(Infinity, 0, 0);
  private lastShadowDir = new Vector3();
  private shadowDirty = true;
  private sinceShadow = 0;
  /** Upper bound on shadow-map refreshes per second. */
  maxShadowHz = 15;
  /** 0..1 haze (set by weather): pulls the fog in so distant districts soften. */
  haze = 0;

  /**
   * The shadow map as last drawn: its centre (on the light's axis) and its axes across the light, for choosing
   * casters in the map's own space (D-231).
   */
  get shadowFocus(): Vector3 {
    return this.lastShadowPos;
  }
  readonly shadowRight = new Vector3(1, 0, 0);
  readonly shadowUp = new Vector3(0, 0, 1);

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
    // Capped: at overview zoom, distant shadows are sub-pixel but cost a draw call per batch. The extent sets the
    // shadow texel size, and every change re-rasterises every shadow (their edges jump): it moves between a few
    // levels only, up as soon as the view needs more, down only once it needs clearly less (D-162). It used to follow
    // the zoom in 4-unit steps, some twenty jumps from street to island.
    const want = Math.min(110, Math.max(25, distance * 0.9));
    const cur = this.shadowExtent;
    const ext = want > cur ? (SHADOW_LEVELS.find((l) => l >= want) ?? 110) : want < cur * 0.6 ? (SHADOW_LEVELS.find((l) => l >= want / 0.8) ?? 110) : cur;
    if (ext !== cur) {
      this.shadowExtent = ext;
      this.shadowDirty = true;
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -ext;
      cam.right = cam.top = ext;
      cam.near = 1;
      cam.far = 600;
      cam.updateProjectionMatrix();
    }
    // Snap the shadow focus to whole texels of the shadow map, in the light's own axes (D-161): the map's texel grid
    // lies across the sun's direction, so snapping world x / z still moved it by a fraction of a texel on every
    // refresh while panning, and every shadow edge (floor plates, fins, railings on the façades) crawled.
    const texel = (this.shadowExtent * 2) / this.sun.shadow.mapSize.x;
    const right = _right.crossVectors(_up, this.sunDir);
    // Sun straight overhead (noon at the equinox): any horizontal axis will do, as three's own lookAt does.
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    const lup = _lup.crossVectors(this.sunDir, right).normalize();
    const a = Math.round(target.dot(right) / texel) * texel;
    const b = Math.round(target.dot(lup) / texel) * texel;
    const snapped = _snap.copy(right).multiplyScalar(a).addScaledVector(lup, b).addScaledVector(this.sunDir, target.dot(this.sunDir));
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(this.sunDir, 250);
    this.sinceShadow += dt;
    // Compare the snapped focus, not the light's position: the light sits 250 units out along the sun direction, so
    // the sun's slow turn moved it every frame and refreshed shadows at the cap all day, past the `turned` gate (D-150).
    const moved = this.lastShadowPos.distanceToSquared(this.sun.target.position) > 1e-6;
    // ~0.6° of sun travel (≈ every 0.6 s at 1× speed): shadows creep imperceptibly in between.
    const turned = this.lastShadowDir.angleTo(this.sunDir) > 0.01;
    if ((moved || turned || this.shadowDirty) && this.sinceShadow >= 1 / this.maxShadowHz) {
      this.sun.shadow.needsUpdate = true;
      this.lastShadowPos.copy(this.sun.target.position);
      this.shadowRight.copy(right);
      this.shadowUp.copy(lup);
      this.lastShadowDir.copy(this.sunDir);
      this.shadowDirty = false;
      this.sinceShadow = 0;
    }
    // The Natural style looks through more air (D-243): the haze starts nearer and thickens sooner.
    const r = U.realism.value;
    this.fog.near = Math.max(120, distance * 1.6) * (1 - 0.6 * this.haze) * (1 - 0.45 * r);
    this.fog.far = this.fog.near + 700 * (1 - 0.7 * this.haze) * (1 - 0.25 * r);
  }
}

/** Shadow frustum half-sizes the view steps between (D-162). */
const SHADOW_LEVELS = [25, 34, 46, 62, 84, 110];
const _up = new Vector3(0, 1, 0);
const _right = new Vector3();
const _lup = new Vector3();
const _snap = new Vector3();

/** Bloom and Natural keys blended at `r` into `BLENDED` (colours mixed in sRGB hex space through `Color`). */
function blendKeys(r: number): SkyKey[] {
  const mixHex = (x: number, y: number) => ca.setHex(x).lerp(cb.setHex(y), r).getHex();
  for (let k = 0; k < KEYS.length; k++) {
    const s = KEYS[k]!;
    const n = NATURAL[k]!;
    const o = BLENDED[k]!;
    o.zenith = mixHex(s.zenith, n.zenith);
    o.horizon = mixHex(s.horizon, n.horizon);
    o.sun = mixHex(s.sun, n.sun);
    o.sunI = lerp(s.sunI, n.sunI, r);
    o.hemiI = lerp(s.hemiI, n.hemiI, r);
    for (let j = 0; j < 3; j++) {
      o.lift[j] = lerp(s.lift[j]!, n.lift[j]!, r);
      o.gain[j] = lerp(s.gain[j]!, n.gain[j]!, r);
    }
    o.sat = lerp(s.sat, n.sat, r);
    o.con = lerp(s.con, n.con, r);
    o.bloom = lerp(s.bloom, n.bloom, r);
  }
  return BLENDED;
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
  // Natural (D-243): distance haze takes some of the sky's blue (aerial perspective), and thins faster with height.
  const tint = mix(U.fogColor, mix(U.fogColor, U.zenith, 0.18), U.realism);
  return fog(mix(tint, U.sunColor, toSun), factor.mul(mix(float(1), mix(float(0.75), float(1.1), height), U.realism)).min(1));
}
