import { BoxGeometry, Color, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicNodeMaterial, RingGeometry, type Scene } from 'three/webgpu';
import { color, float, mod, positionLocal, sin, time, vec3 } from 'three/tsl';
import { U } from '@/render/uniforms';
import { envelope, getCrisis } from '@/sim/crises';
import type { GameContext } from '@/game/context';

const RAIN_DROPS = 1800;
const RAIN_BOX = 80;
const RAIN_HEIGHT = 40;
const GREY = new Color(0x6d7b86);
const HAZE = new Color(0xffd9a8);

/**
 * Crisis atmosphere. Everything is driven by uniforms plus two tiny meshes (one rain draw,
 * one region ring), so weather adds at most two draw calls while active and none otherwise.
 */
export class Weather {
  private rain: InstancedMesh;
  private ring: Mesh;
  private level = 0;

  constructor(
    private ctx: GameContext,
    scene: Scene,
  ) {
    const rm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    // Drops fall and wrap inside a box that follows the camera target.
    rm.positionNode = vec3(positionLocal.x, mod(positionLocal.y.sub(time.mul(26)), float(RAIN_HEIGHT)), positionLocal.z);
    rm.colorNode = color(0xcfe6f2);
    rm.opacityNode = U.rain.mul(0.42);
    this.rain = new InstancedMesh(new BoxGeometry(0.03, 0.9, 0.03), rm, RAIN_DROPS);
    const m = new Matrix4();
    for (let i = 0; i < RAIN_DROPS; i++)
      this.rain.setMatrixAt(i, m.makeTranslation((Math.random() - 0.5) * RAIN_BOX, Math.random() * RAIN_HEIGHT, (Math.random() - 0.5) * RAIN_BOX));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.renderOrder = 5;

    const ringMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    ringMat.opacityNode = sin(time.mul(3)).mul(0.15).add(0.35);
    this.ring = new Mesh(new RingGeometry(0.92, 1, 64, 1).rotateX(-Math.PI / 2), ringMat);
    this.ring.visible = false;
    this.ring.renderOrder = 9;
    scene.add(this.rain, this.ring);
  }

  update(dt: number): void {
    const { city, cameraCtl } = this.ctx;
    const st = city.steward;
    let rain = 0;
    let storm = 0;
    let heat = 0;
    let algae = 0;
    let ringAt: { x: number; z: number; r: number; tint: number } | null = null;
    for (const c of st.crises) {
      const lead = getCrisis(c.def).lead * 10;
      // Forecast phases build up (clouds gather) over the warning window.
      const k =
        c.phase === 'active'
          ? envelope((city.tick - c.startTick) / Math.max(1, c.endTick - c.startTick))
          : 0.35 * Math.max(0, 1 - (c.startTick - city.tick) / Math.max(1, lead));
      if (c.def === 'monsoon') {
        rain = c.phase === 'active' ? k : 0;
        storm = Math.max(storm, k * 0.85);
      } else if (c.def === 'king-tide') storm = Math.max(storm, k * 0.35);
      else if (c.def === 'heatwave') heat = k;
      else if (c.def === 'algal-bloom') algae = k;
      if ((c.def === 'blight' || c.def === 'grid-failure') && c.x !== undefined)
        ringAt = { x: c.x, z: c.z!, r: c.radius ?? 6, tint: c.def === 'blight' ? 0xc08a3a : 0xff8a3a };
    }
    const a = Math.min(1, dt * 2);
    U.rain.value += (rain - U.rain.value) * a;
    U.storm.value += (storm - U.storm.value) * a;
    U.heat.value += (heat - U.heat.value) * a;
    U.algae.value += (algae - U.algae.value) * a;
    this.level += (st.modifiers.floodLevel - this.level) * Math.min(1, dt * 1.5);
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
    atmo.fog.color.copy(U.horizon.value);

    this.rain.visible = U.rain.value > 0.02;
    if (this.rain.visible) this.rain.position.set(cameraCtl.target.x, cameraCtl.target.y - 6, cameraCtl.target.z);
    this.ring.visible = !!ringAt;
    if (ringAt) {
      this.ring.position.set(ringAt.x, Math.max(0, city.grid.heightAt(ringAt.x, ringAt.z)) + 1.2, ringAt.z);
      this.ring.scale.setScalar(ringAt.r);
      (this.ring.material as MeshBasicNodeMaterial).color.setHex(ringAt.tint);
    }
  }
}
