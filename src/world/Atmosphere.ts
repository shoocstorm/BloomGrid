import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { getMaterial } from '@/render/materials/library';
import { U } from '@/render/uniforms';

interface SkyKey {
  e: number; // sun elevation (sin)
  zenith: number;
  horizon: number;
  sun: number;
  sunI: number;
  hemiI: number;
}

// Keyframes by sun elevation: deep night -> dusk -> golden hour -> day.
const KEYS: SkyKey[] = [
  { e: -0.35, zenith: 0x070b24, horizon: 0x18204a, sun: 0x8fa8ff, sunI: 0.35, hemiI: 0.35 },
  { e: -0.05, zenith: 0x1c2a63, horizon: 0x6a5a9a, sun: 0xa0b4ff, sunI: 0.2, hemiI: 0.45 },
  { e: 0.08, zenith: 0x4a6fb8, horizon: 0xffb38a, sun: 0xffb070, sunI: 1.6, hemiI: 0.7 },
  { e: 0.3, zenith: 0x5aa8f0, horizon: 0xd9ecf5, sun: 0xffeccc, sunI: 2.6, hemiI: 0.9 },
  { e: 1.0, zenith: 0x4f9ff0, horizon: 0xcfeaff, sun: 0xfff6e6, sunI: 3.0, hemiI: 1.0 },
];

const ca = new Color();
const cb = new Color();

/** Sky dome, sun/moon light with camera-following shadows, hemisphere fill and fog. */
export class Atmosphere {
  readonly sky: Mesh;
  readonly sun = new DirectionalLight(0xffffff, 3);
  readonly hemi = new HemisphereLight(0xcfeaff, 0x5a7a4a, 1);
  readonly fog = new Fog(0xcfeaff, 180, 900);
  private sunDir = new Vector3();
  private shadowExtent = 60;
  sunElevation = 1;

  constructor(private scene: Scene) {
    this.sky = new Mesh(new SphereGeometry(1, 32, 16), getMaterial('sky'));
    this.sky.scale.setScalar(1800);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.sky.name = 'sky';
    scene.add(this.sky, this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.setShadowMapSize(2048);
  }

  setShadowMapSize(size: number): void {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as never;
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
      this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
      pmrem.dispose();
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

    // Night: light comes from the moon (opposite the sun), soft and blue.
    const night = 1 - smooth(-0.12, 0.12, elev);
    U.night.value = night;
    this.sun.color.copy(sunCol);
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    this.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * t;
    this.hemi.color.copy(U.horizon.value).lerp(ca.setHex(0xffffff), 0.3);
    this.hemi.groundColor.setHex(night > 0.5 ? 0x1a2a3a : 0x5a7a4a);
    if (elev < 0) this.sunDir.multiplyScalar(-1).setY(Math.max(0.35, -elev));
    this.scene.environmentIntensity = 0.25 + 0.75 * (1 - night);
  }

  /** Keeps the sky centred on the camera and the shadow frustum around the view target. */
  follow(cameraPos: Vector3, target: Vector3, distance: number): void {
    this.sky.position.copy(cameraPos);
    const ext = Math.min(160, Math.max(25, distance * 0.9));
    if (Math.abs(ext - this.shadowExtent) > 4) {
      this.shadowExtent = ext;
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
    this.fog.near = Math.max(120, distance * 1.6);
    this.fog.far = this.fog.near + 700;
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
