import {
  BoxGeometry,
  Color,
  DoubleSide,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  RingGeometry,
  Vector3,
  type Scene,
} from 'three/webgpu';
import { color, mix, mod, positionGeometry, positionLocal, sin, smoothstep, time, uniform, varying, vec3 } from 'three/tsl';
import { U } from '@/render/uniforms';
import { pieceCover } from '@/render/materials/library';
import { envelope, getCrisis } from '@/sim/crises';
import { seasonAt, showerAt } from '@/sim/seasons';
import type { GameContext } from '@/game/context';

const RAIN_DROPS = 5000;
/** Camera distance at which drops have their base size; the rain volume and drops scale with distance past it. */
const RAIN_REF = 70;
/** Horizontal wind slant of the falling drops (x, z per unit fallen), roughly along the prevailing sea wind. */
const SLANT_X = 0.12;
const SLANT_Z = 0.05;
const DUST_MOTES = 1400;
/** Dust drifts with the sea wind (units per second). */
const DUST_DRIFT_X = 1.6;
const DUST_DRIFT_Z = 0.7;
/** Dust is a near-view effect: motes fade out past this camera distance. */
const DUST_FAR = 240;
/** Flash pulses of one lightning stroke: start offset (s) and strength; a stroke flickers two or three times. */
const STROKE = [
  [0, 1],
  [0.09, 0.55],
  [0.24, 0.8],
] as const;
const GREY = new Color(0x6d7b86);
const HAZE = new Color(0xffd9a8);
const FLASH = new Color(0xdfe8ff);
const SCORCH = new Color(0xffc890);

declare module '@/core/EventBus' {
  interface GameEvents {
    /** A lightning stroke lit the clouds (ambient storm lightning or a strike): the audio module rumbles. */
    'weather:flash': { x: number; z: number; power: number };
  }
}

/**
 * Crisis and seasonal atmosphere: Monsoon season brings passing drizzle (light rain, no flood),
 * Haze season and heatwaves thicken a warm fog with drifting dust, thunderstorms (and heavy monsoon rain) flicker
 * with lightning inside the clouds, and storms gust the wind. Everything is driven by uniforms plus three small
 * meshes (rain, dust and a region ring), so weather adds at most three draw calls while active and none otherwise.
 * The sea's response (whitecaps, rain rings, algal scum) lives in the water shader (`world/Water.ts`).
 */
export class Weather {
  private rain: InstancedMesh;
  private dust: InstancedMesh;
  private ring: Mesh;
  private level = 0;
  private haze = 0;
  /** Rain volume: min corner (x, base y, z) and size (width, height, drop scale). */
  private rainOrigin = uniform(new Vector3());
  private rainSize = uniform(new Vector3(80, 40, 1));
  private fwd = new Vector3();
  /** Dust volume: min corner (x, base y, z) and size (width, height). */
  private dustOrigin = uniform(new Vector3());
  private dustSize = uniform(new Vector3(80, 24, 0));
  private dustAmount = uniform(0);
  private t = 0;
  /** Seconds until the next ambient stroke, and the running stroke (seconds since it began; < 0 = none). */
  private flashIn = 3;
  private stroke = -1;
  private gusting = false;

  constructor(
    private ctx: GameContext,
    scene: Scene,
  ) {
    const rm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    // Each drop's instance matrix is a translation to a point in the unit cube (centre = positionLocal −
    // positionGeometry). The drops tile the world with the volume's width as period, so the rain stays put while
    // the view pans and the volume (which scales with zoom) covers whatever is on screen, up to the whole island.
    const o = this.rainOrigin;
    const sz = this.rainSize;
    const c = positionLocal.sub(positionGeometry);
    const k = sz.z;
    const y = mod(c.y.mul(sz.y).sub(time.mul(k.mul(26))), sz.y);
    const fallen = sz.y.sub(y);
    const gx = mod(c.x.mul(sz.x).add(fallen.mul(SLANT_X)).sub(o.x), sz.x);
    const gz = mod(c.z.mul(sz.x).add(fallen.mul(SLANT_Z)).sub(o.z), sz.x);
    const g = positionGeometry.mul(k);
    rm.positionNode = vec3(
      o.x.add(gx).add(g.x).add(g.y.mul(SLANT_X)),
      o.y.add(y).add(g.y),
      o.z.add(gz).add(g.z).add(g.y.mul(SLANT_Z)),
    );
    // Fade near the volume's sides (no hard edge at the horizon) and from a faint head to a brighter tail.
    const ux = gx.div(sz.x);
    const uz = gz.div(sz.x);
    const edge = smoothstep(0, 0.12, ux).mul(smoothstep(1, 0.88, ux)).mul(smoothstep(0, 0.12, uz)).mul(smoothstep(1, 0.88, uz));
    const tail = positionGeometry.y.div(1.1).add(0.5).oneMinus().mul(0.7).add(0.3);
    rm.colorNode = color(0xcfe6f2);
    rm.opacityNode = U.rain.mul(0.45).mul(varying(edge.mul(tail)));
    this.rain = new InstancedMesh(new BoxGeometry(0.035, 1.1, 0.035), rm, RAIN_DROPS);
    const m = new Matrix4();
    for (let i = 0; i < RAIN_DROPS; i++) this.rain.setMatrixAt(i, m.makeTranslation(Math.random(), Math.random(), Math.random()));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.renderOrder = 5;

    // Haze dust: warm motes drifting with the wind through a world-wrapped box round the view, like the rain.
    const dm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const dc = positionLocal.sub(positionGeometry);
    const dO = this.dustOrigin;
    const ds = this.dustSize;
    const dgx = mod(dc.x.mul(ds.x).add(time.mul(DUST_DRIFT_X)).sub(dO.x), ds.x);
    const dgz = mod(dc.z.mul(ds.x).add(time.mul(DUST_DRIFT_Z)).sub(dO.z), ds.x);
    const bob = sin(time.mul(0.6).add(dc.x.mul(40))).mul(0.6);
    dm.positionNode = vec3(dO.x.add(dgx), dO.y.add(dc.y.mul(ds.y)).add(bob), dO.z.add(dgz)).add(positionGeometry);
    const dux = dgx.div(ds.x);
    const duz = dgz.div(ds.x);
    const dEdge = smoothstep(0, 0.15, dux).mul(smoothstep(1, 0.85, dux)).mul(smoothstep(0, 0.15, duz)).mul(smoothstep(1, 0.85, duz));
    // Motes catch the sun in slow twinkles; sub-pixel ones fade so they don't shimmer (D-064).
    const glint = sin(time.mul(1.3).add(dc.z.mul(60))).mul(0.3).add(0.7);
    dm.colorNode = mix(U.sunColor, color(0xffe2b0), 0.5);
    dm.opacityNode = this.dustAmount.mul(0.5).mul(varying(dEdge.mul(glint))).mul(pieceCover(3));
    this.dust = new InstancedMesh(new IcosahedronGeometry(0.07, 0), dm, DUST_MOTES);
    for (let i = 0; i < DUST_MOTES; i++) this.dust.setMatrixAt(i, m.makeTranslation(Math.random(), Math.random(), Math.random()));
    this.dust.frustumCulled = false;
    this.dust.visible = false;
    this.dust.renderOrder = 5;

    // A lightning strike from the sim lights the clouds above it at full strength.
    ctx.bus.on('lightning:strike', ({ x, z }) => this.flashAt(x, z, 1));

    const ringMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    ringMat.opacityNode = sin(time.mul(3)).mul(0.15).add(0.35);
    this.ring = new Mesh(new RingGeometry(0.92, 1, 64, 1).rotateX(-Math.PI / 2), ringMat);
    this.ring.visible = false;
    this.ring.renderOrder = 9;
    scene.add(this.rain, this.dust, this.ring);
  }

  private flashAt(x: number, z: number, power: number): void {
    const d = this.ctx.cameraCtl.distance;
    U.flash.value.set(x, z, 70 + d * 0.35, 0);
    this.flashPower = power;
    this.stroke = 0;
    this.ctx.bus.emit('weather:flash', { x, z, power });
  }

  private flashPower = 0;

  update(dt: number): void {
    const { city } = this.ctx;
    const st = city.steward;
    let heat = 0;
    let algae = 0;
    let ringAt: { x: number; z: number; r: number; tint: number } | null = null;
    // Seasonal weather eases in and out over the first and last 6% of the season.
    const { season, progress } = seasonAt(city.tick);
    const edge = Math.max(0, Math.min(1, progress / 0.06, (1 - progress) / 0.06));
    // Showers come and go every few minutes of game time (they also water the soil, see Flora-Net).
    const shower = showerAt(city.tick);
    let rain = shower * 0.4;
    let storm = shower * 0.3;
    let haze = season.id === 'haze' ? 0.75 * edge : 0;
    // How often ambient lightning strokes come (0 = never, 1 = every few seconds).
    let thunder = 0;
    for (const c of st.crises) {
      const lead = getCrisis(c.def).lead * 10;
      // Forecast phases build up (clouds gather) over the warning window.
      const k =
        c.phase === 'active'
          ? envelope((city.tick - c.startTick) / Math.max(1, c.endTick - c.startTick))
          : 0.35 * Math.max(0, 1 - (c.startTick - city.tick) / Math.max(1, lead));
      if (c.def === 'monsoon') {
        rain = Math.max(rain, c.phase === 'active' ? k : 0);
        storm = Math.max(storm, k * 0.85);
        if (c.phase === 'active') thunder = Math.max(thunder, (k - 0.5) * 0.6);
      } else if (c.def === 'thunderstorm') {
        rain = Math.max(rain, c.phase === 'active' ? k : 0);
        storm = Math.max(storm, k);
        // Distant flickers already show in the forecast window as the front gathers.
        thunder = Math.max(thunder, c.phase === 'active' ? k : k * 0.5);
      } else if (c.def === 'king-tide') storm = Math.max(storm, k * 0.35);
      else if (c.def === 'heatwave') {
        heat = k;
        haze = Math.max(haze, k * 0.6);
      }
      else if (c.def === 'algal-bloom') algae = k;
      if ((c.def === 'blight' || c.def === 'grid-failure') && c.x !== undefined)
        ringAt = { x: c.x, z: c.z!, r: c.radius ?? 6, tint: c.def === 'blight' ? 0xc08a3a : 0xff8a3a };
    }
    const a = Math.min(1, dt * 2);
    U.rain.value += (rain - U.rain.value) * a;
    U.storm.value += (storm - U.storm.value) * a;
    U.heat.value += (heat - U.heat.value) * a;
    U.algae.value += (algae - U.algae.value) * a;
    this.haze += (haze - this.haze) * Math.min(1, dt * 0.5);
    // A tsunami surge (D-076) raises the sea too; its flooding is limited to the waterfront in the sim.
    this.level += (Math.max(st.modifiers.floodLevel, st.modifiers.surge * 0.3) - this.level) * Math.min(1, dt * 1.5);
    U.waterLevel.value = this.level;
    const water = this.ctx.services.get('world').water;
    if (water) water.position.y = this.level;

    // Tint the sky and dim the sun after the atmosphere has set its time-of-day values.
    const atmo = this.ctx.services.get('world').atmosphere;
    if (U.storm.value > 0.01) {
      U.zenith.value.lerp(GREY, U.storm.value * 0.7);
      U.horizon.value.lerp(GREY, U.storm.value * 0.6);
      atmo.sun.intensity *= 1 - 0.6 * U.storm.value;
    }
    if (U.heat.value > 0.01) U.horizon.value.lerp(HAZE, U.heat.value * 0.5);
    // Haze: a dusty warm horizon (dimmer at night) and a nearer fog.
    if (this.haze > 0.01) U.horizon.value.lerp(HAZE, this.haze * 0.7 * (1 - 0.7 * U.night.value));
    // Heatwave: a harsher, warmer sun.
    if (U.heat.value > 0.01) {
      U.sunColor.value.lerp(SCORCH, U.heat.value * 0.35);
      atmo.sun.color.lerp(SCORCH, U.heat.value * 0.35);
      atmo.sun.intensity *= 1 + 0.15 * U.heat.value;
    }
    // Heavy rain closes the view in: grey veils of rain swallow the distance.
    atmo.haze = Math.max(this.haze, U.rain.value * 0.35);

    this.t += dt;
    this.lightning(dt, thunder, atmo);
    atmo.fog.color.copy(U.horizon.value);
    // Grade (D-120): storms drain colour and flatten contrast, heat and dust warm the light. Overcast
    // skies cast no separate cloud shadows.
    if (U.storm.value > 0.01) {
      U.gradeSat.value *= 1 - 0.3 * U.storm.value;
      U.gradeCon.value *= 1 - 0.04 * U.storm.value;
      U.cloudShadow.value *= 1 - U.storm.value;
    }
    const warm = Math.max(U.heat.value, this.haze);
    if (warm > 0.01) {
      U.gradeGain.value.x *= 1 + 0.05 * warm;
      U.gradeGain.value.z *= 1 - 0.07 * warm;
    }

    // Storm gusts: the wind rises and falls in slow surges (kept modest; ambient motion stays subtle).
    if (U.storm.value > 0.01) {
      const gust = 0.6 + 0.4 * Math.sin(this.t * 0.8) * Math.sin(this.t * 0.31 + 1);
      U.wind.value = 1 + U.storm.value * 0.6 * gust;
      this.gusting = true;
    } else if (this.gusting) {
      U.wind.value = 1;
      this.gusting = false;
    }

    // Dust hangs in the air in Haze season and heatwaves; it fades out at the island view.
    const dust = Math.max(this.haze, U.heat.value * 0.8) * Math.max(0, 1 - this.ctx.cameraCtl.distance / DUST_FAR);
    this.dustAmount.value = dust;
    this.dust.visible = dust > 0.02;
    if (this.dust.visible) this.placeDust();

    this.rain.visible = U.rain.value > 0.02;
    // Drizzle draws fewer drops than a storm (rain overdraw is the costly part).
    this.rain.count = Math.ceil(RAIN_DROPS * Math.min(1, 0.25 + U.rain.value * 1.2));
    if (this.rain.visible) this.placeRain();
    this.ring.visible = !!ringAt;
    if (ringAt) {
      this.ring.position.set(ringAt.x, Math.max(0, city.grid.heightAt(ringAt.x, ringAt.z)) + 1.2, ringAt.z);
      this.ring.scale.setScalar(ringAt.r);
      (this.ring.material as MeshBasicNodeMaterial).color.setHex(ringAt.tint);
    }
  }

  /** Ambient lightning: strokes at random spots round the view, each a quick two- or three-pulse flicker. */
  private lightning(dt: number, thunder: number, atmo: { hemi: { intensity: number } }): void {
    if (thunder > 0.02) {
      this.flashIn -= dt;
      if (this.flashIn <= 0) {
        const tg = this.ctx.cameraCtl.target;
        const spread = Math.max(60, this.ctx.cameraCtl.distance * 1.2);
        this.flashAt(tg.x + (Math.random() - 0.5) * spread, tg.z + (Math.random() - 0.5) * spread, 0.45 + Math.random() * 0.45);
        this.flashIn = (3 + Math.random() * 8) / Math.min(1, thunder * 1.4);
      }
    } else this.flashIn = Math.min(this.flashIn, 2 + Math.random() * 2);
    let f = 0;
    if (this.stroke >= 0) {
      this.stroke += dt;
      for (const [at, amp] of STROKE) if (this.stroke >= at) f = Math.max(f, amp * Math.exp(-(this.stroke - at) * 16));
      f *= this.flashPower;
      if (this.stroke > 1) this.stroke = -1;
    }
    U.flash.value.w = f;
    if (f > 0.005) {
      U.zenith.value.lerp(FLASH, f * 0.35);
      U.horizon.value.lerp(FLASH, f * 0.45);
      atmo.hemi.intensity += f * 1.4;
    }
  }

  /** Dust box round the camera focus, sized to the near view (dust never shows at the island view). */
  private placeDust(): void {
    const { camera, cameraCtl } = this.ctx;
    const tg = cameraCtl.enabled ? cameraCtl.target : camera.position;
    const w = Math.max(50, Math.min(DUST_FAR, cameraCtl.enabled ? cameraCtl.distance * 1.3 : 50));
    const hgt = Math.max(16, w * 0.3);
    this.dustOrigin.value.set(tg.x - w / 2, tg.y - 2, tg.z - w / 2);
    this.dustSize.value.set(w, hgt, 0);
  }

  /**
   * Sizes the rain volume to the view: it grows with camera distance (drops grow and fall faster with it, so they
   * keep their on-screen size and density) and leans toward where the camera looks. Explore modes rain round the eye.
   */
  private placeRain(): void {
    const { camera, cameraCtl } = this.ctx;
    const tg = cameraCtl.target;
    const orbit = cameraCtl.enabled;
    const d = orbit ? Math.max(cameraCtl.minDistance, camera.position.distanceTo(tg)) : 30;
    const k = Math.min(9, Math.max(0.6, d / RAIN_REF));
    const w = Math.max(60, d * 1.4);
    const hgt = Math.min(320, Math.max(36, d * 0.6));
    let cx = camera.position.x;
    let cz = camera.position.z;
    let base = camera.position.y - hgt * 0.5;
    if (orbit) {
      this.fwd.set(tg.x - camera.position.x, 0, tg.z - camera.position.z);
      const len = this.fwd.length() || 1;
      cx = tg.x + (this.fwd.x / len) * w * 0.2;
      cz = tg.z + (this.fwd.z / len) * w * 0.2;
      base = tg.y - hgt * 0.3;
    }
    this.rainOrigin.value.set(cx - w / 2, base, cz - w / 2);
    this.rainSize.value.set(w, hgt, k);
  }
}
