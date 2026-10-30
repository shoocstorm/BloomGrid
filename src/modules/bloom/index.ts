import { Color, DoubleSide, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, RingGeometry } from 'three/webgpu';
import { color, float, mod, positionGeometry, positionLocal, sin, smoothstep, time, vec3 } from 'three/tsl';
import type { GameModule } from '@/game/context';
import { activityAt, bloomAt, bloomTexture } from '@/render/materials/overlay';
import { U } from '@/render/uniforms';
import { bloomLayers } from '@/sim/bloom';
import { activityLayer } from '@/sim/nightlife';
import { SEASONS, seasonAt } from '@/sim/seasons';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import './bloom.css';

/** Kept sparse on purpose: a few motes catch the light; a blizzard reads as noise (user feedback). */
const POLLEN_COUNT = 1100;
const BOX = 90;
const HEIGHT = 14;
const tint = new Color();

/**
 * Seasonal Bloom Engine visuals: uploads the bloom field to the GPU, drives the season's look,
 * renders drifting pollen (one draw call; density follows the bloom field) and plays the
 * district transformation wave (an expanding ring + pollen burst; the buildings' new flower
 * walls pop in by distance from the origin, see BuildingRenderer).
 */
export const bloomModule: GameModule = {
  id: 'bloom',
  deps: ['hud', 'world'],
  init(ctx) {
    const { city, scene } = ctx;

    // Field texture upload (each field recompute, ~5 s): R = bloom, G = pedestrian activity.
    const data = bloomTexture.image.data as Uint8Array;
    const upload = (src: Float32Array, channel: number) => {
      const g = ctx.city.grid;
      const tw = bloomTexture.image.width;
      for (let z = 0; z < g.h; z++) for (let x = 0; x < g.w; x++) data[(z * tw + x) * 4 + channel] = Math.round(src[z * g.w + x]! * 255);
      bloomTexture.needsUpdate = true;
    };
    ctx.bus.on('bloom:updated', () => upload(bloomLayers(ctx.city).bloom, 0));
    ctx.bus.on('activity:updated', () => upload(activityLayer(ctx.city), 1));
    ctx.bus.on('city:reset', () => data.fill(100));
    data.fill(100);
    bloomTexture.needsUpdate = true;

    // Pollen: tiny glowing motes in a box that follows the view; each drifts in a slow loop and
    // shrinks to nothing where the bloom field is low. Instance matrices are pure translations, so
    // the instance centre is positionLocal − positionGeometry.
    const pm = new MeshStandardNodeMaterial({ roughness: 1 });
    const centre = positionLocal.sub(positionGeometry);
    const t = time.mul(0.35);
    const drift = vec3(
      sin(t.add(centre.z.mul(0.37))).mul(1.4),
      mod(centre.y.add(time.mul(0.2)), float(HEIGHT)).sub(centre.y),
      sin(t.mul(1.3).add(centre.x.mul(0.29))).mul(1.4),
    );
    const at = centre.add(drift);
    const world = at.add(U.pollenOrigin);
    // At night the motes become drifting spores that also gather over busy streets.
    const field = bloomAt(world.x, world.z).max(activityAt(world.x, world.z).mul(U.night).mul(U.nightlife));
    const size = smoothstep(0.25, 0.8, field).mul(U.pollen);
    pm.positionNode = at.add(positionGeometry.mul(size));
    pm.colorNode = color(0xfff2b0);
    pm.emissiveNode = color(0xffe08a).mul(0.6).add(color(0x7ff7e6).mul(U.night).mul(0.8));
    const pollen = new InstancedMesh(new IcosahedronGeometry(0.06, 0), pm, POLLEN_COUNT);
    const m = new Matrix4();
    for (let i = 0; i < POLLEN_COUNT; i++) pollen.setMatrixAt(i, m.makeTranslation((Math.random() - 0.5) * BOX, Math.random() * HEIGHT, (Math.random() - 0.5) * BOX));
    pollen.frustumCulled = false;
    pollen.castShadow = false;
    scene.add(pollen);

    // Transformation wave ring.
    const ringMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    ringMat.colorNode = color(0xb8ffcf);
    const ring = new Mesh(new RingGeometry(0.94, 1, 96, 1).rotateX(-Math.PI / 2), ringMat);
    ring.visible = false;
    ring.renderOrder = 9;
    scene.add(ring);
    let wave: { x: number; z: number; r: number; t: number } | null = null;
    let burst = 0;
    ctx.bus.on('buildings:level', ({ origin }) => {
      if (!origin || ctx.loading) return;
      wave = { x: origin.x, z: origin.z, r: origin.radius, t: 0 };
      burst = 1;
    });

    // Season chip in the clock panel.
    const chip = h('span', { class: 'season-chip' });
    const bar = h('i');
    const wrap = h('span', { class: 'season', title: '' }, chip, h('span', { class: 'season-bar' }, bar));
    document.querySelector('.topbar .clock')?.append(wrap);
    ctx.bus.on('season:changed', ({ index }) => {
      const s = SEASONS[index]!;
      ctx.bus.emit('toast', { text: `${s.icon} ${s.name} season: ${s.description}`, tone: 'info' });
    });

    let hudTimer = 0;
    ctx.systems.add({
      id: 'bloom.visuals',
      phase: 'sync',
      order: 6,
      update(c, f) {
        const { season, progress } = seasonAt(city.tick);
        // Ease the season look in over the first 10% of each season.
        U.seasonTint.value.lerp(tint.setHex(season.tint), Math.min(1, f.dt * 0.5));
        U.seasonAmount.value += (season.tintAmount - U.seasonAmount.value) * Math.min(1, f.dt * 0.5);
        // Pollen: thick in Bloom, thin in Haze; hidden when zoomed far out; bursts on retrofits.
        burst = Math.max(0, burst - f.dt * 0.35);
        const near = c.cameraCtl.distance < 160 ? 1 : 0;
        U.pollen.value = near * Math.min(1.2, season.bloom * 0.55 + burst);
        pollen.visible = U.pollen.value > 0.02;
        const tg = c.cameraCtl.target;
        pollen.position.set(tg.x, tg.y + 0.5, tg.z);
        U.pollenOrigin.value.copy(pollen.position);

        if (wave) {
          wave.t += f.dt;
          const k = Math.min(1, wave.t / 2.4);
          ring.visible = k < 1;
          ring.scale.setScalar(Math.max(0.5, wave.r * k));
          ring.position.set(wave.x, Math.max(0, city.grid.heightAt(wave.x, wave.z)) + 0.6, wave.z);
          ringMat.opacity = 0.9 * (1 - k);
          if (k >= 1) wave = null;
        }

        hudTimer += f.dt;
        if (hudTimer > 0.5) {
          hudTimer = 0;
          // Rebuilt only when the season turns (the chip holds an icon now, not just text).
          if (chip.dataset.season !== season.id) {
            chip.dataset.season = season.id;
            chip.replaceChildren(icon(season.icon), ` ${season.name}`);
          }
          bar.style.transform = `scaleX(${progress})`;
          wrap.title = `${season.name}: ${season.description}`;
        }
      },
    });
  },
};
