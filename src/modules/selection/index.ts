import { BRIDGE_DECK } from '@/sim/City';
import { CylinderGeometry, InstancedMesh, Matrix4, Mesh, OctahedronGeometry, Quaternion, TorusGeometry, Vector3, type BufferGeometry } from 'three/webgpu';
import type { GameContext, GameModule } from '@/game/context';
import { Building } from '@/ecs/components';
import { getMaterial } from '@/render/materials/library';
import { GeoBuilder, tf } from '@/render/bake';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';

/**
 * The selection highlight (D-090): what is selected should be unmistakable from any distance. On a selection
 * (a click, the inventory, Flora's Locate chips, the advisor) the object gets:
 *
 * - a **frame ring** on the ground round its footprint, breathing gently while it stays selected;
 * - two **ripples** that sweep out from it once, so the eye catches where it is;
 * - a **beam of light** from its roof that widens with the camera distance (readable from the island view) and
 *   fades after a few seconds;
 * - a **marker**: a glowing diamond over the roof that bobs and turns slowly, scaled so it stays a few pixels big.
 *
 * Four meshes on the unlit `beacon` material (the marker on `beacon-xray`, drawn over buildings), CPU-posed per
 * frame only while something is selected; hidden otherwise. Nothing casts shadows (the shadow map is cached). Motion stays subtle.
 */

const ACCENT = 0x14e0bd;
const BRIGHT = 0xc8fff4;
/** Outline under every bright stroke, so the highlight reads on pale ground in daylight too. */
const DARK = 0x053a33;
/** Seconds the beam shows after a selection, then fades over `BEAM_FADE`. */
const BEAM_HOLD = 3.5;
const BEAM_FADE = 1.2;
const RIPPLE_TIME = 1.4;

function ringGeometry(thick: number, color: number, glow: number): BufferGeometry {
  return new GeoBuilder()
    .add(new TorusGeometry(1, thick * 1.9, 3, 64), tf(0, -0.04, 0, Math.PI / 2), DARK, 0)
    .add(new TorusGeometry(1, thick, 3, 64), tf(0, 0, 0, Math.PI / 2), color, glow)
    .build();
}

/** A targeting reticle: a thin inner ring and four bold outer arcs (turned slowly as a whole). */
function reticleGeometry(): BufferGeometry {
  const b = new GeoBuilder()
    .add(new TorusGeometry(1, 0.05, 3, 72), tf(0, -0.04, 0, Math.PI / 2), DARK, 0)
    .add(new TorusGeometry(1, 0.026, 3, 72), tf(0, 0, 0, Math.PI / 2), ACCENT, 3);
  for (let i = 0; i < 4; i++) {
    const at = tf(0, -0.04, 0, Math.PI / 2, 0, (i * Math.PI) / 2).clone();
    b.add(new TorusGeometry(1.15, 0.085, 3, 14, Math.PI / 3.2), at, DARK, 0);
    b.add(new TorusGeometry(1.15, 0.05, 3, 14, Math.PI / 3.2), tf(0, 0, 0, Math.PI / 2, 0, (i * Math.PI) / 2), ACCENT, 5);
  }
  return b.build();
}

function beamGeometry(): BufferGeometry {
  return new GeoBuilder()
    .add(new CylinderGeometry(0.12, 0.45, 1, 10, 1, true), tf(0, 0.5, 0), ACCENT, 4)
    .add(new CylinderGeometry(0.04, 0.12, 1, 6, 1, true), tf(0, 0.5, 0), BRIGHT, 7)
    .build();
}

function markerGeometry(): BufferGeometry {
  return new GeoBuilder()
    // Drawn without depth test in this order: the dark shell, then the colour, then the bright core on top.
    .add(new OctahedronGeometry(0.78, 0), tf(0, 0, 0, 0, 0, 0, 0.8, 1.35, 0.8), DARK, 0)
    .add(new OctahedronGeometry(0.6, 0), tf(0, 0, 0, 0, 0, 0, 0.8, 1.35, 0.8), ACCENT, 5)
    .add(new OctahedronGeometry(0.3, 0), tf(0, 0, 0, 0, 0, 0, 0.8, 1.35, 0.8), BRIGHT, 8)
    .build();
}

interface Target {
  x: number;
  y: number;
  z: number;
  /** Footprint radius and height above the base. */
  r: number;
  h: number;
  /** Seconds since selected. */
  t: number;
}

class SelectionFx {
  private frame: Mesh;
  private ripples: InstancedMesh;
  private beam: Mesh;
  private marker: Mesh;
  private target: Target | null = null;
  private clock = 0;
  private m = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private sc = new Vector3();
  private up = new Vector3(0, 1, 0);

  constructor(private ctx: GameContext) {
    const mat = getMaterial('beacon');
    this.frame = new Mesh(reticleGeometry(), mat);
    this.ripples = new InstancedMesh(ringGeometry(0.03, BRIGHT, 5), mat, 2);
    this.beam = new Mesh(beamGeometry(), mat);
    this.marker = new Mesh(markerGeometry(), getMaterial('beacon-xray'));
    this.marker.renderOrder = 20;
    // Visible (at zero scale) for the first frames, so their pipelines compile in the boot warm-up, not on the
    // first click.
    for (const o of [this.frame, this.ripples, this.beam, this.marker]) {
      o.frustumCulled = false;
      o.castShadow = false;
      o.receiveShadow = false;
      o.matrixAutoUpdate = false;
      o.matrix.makeScale(1e-4, 1e-4, 1e-4);
      o.name = 'selection';
      ctx.scene.add(o);
    }
    // The ripples' own transform stays identity: their instances carry the scale.
    this.ripples.matrix.identity();
    this.ripples.count = 2;
    for (let k = 0; k < 2; k++) this.ripples.setMatrixAt(k, new Matrix4().makeScale(1e-4, 1e-4, 1e-4));
    const bus = ctx.bus;
    bus.on('selection:changed', ({ eid, road, bridge }) => this.select(eid, road, bridge));
    bus.on('building:removed', ({ eid }) => this.target && this.selectedEid === eid && this.select(null));
    bus.on('city:reset', () => this.select(null));
    bus.on('terrain:changed', () => this.selectedEid !== null && this.select(this.selectedEid));
  }

  private selectedEid: number | null = null;

  select(eid: number | null, road?: number, bridge?: string): void {
    this.selectedEid = eid;
    const city = this.ctx.city;
    if (eid !== null && city.buildingEntities().includes(eid)) {
      const rec = city.buildingRecord(eid);
      const p = placeBuilding(city.grid, city.buildingDef(eid), rec.x, rec.z, rec.rot);
      const e = p.base.elements;
      const [w, d] = [Building.w[eid]!, Building.d[eid]!];
      this.target = { x: e[12]!, y: e[13]!, z: e[14]!, r: Math.hypot(w, d) / 2 + 0.6, h: p.template.height, t: 0 };
    } else if (bridge !== undefined && city.bridges.some((b) => b.key === bridge)) {
      // A bridge: the reticle spans the deck (D-128).
      const b = city.bridges.find((r) => r.key === bridge)!;
      const [x, z] = b.alongX ? [b.x + b.len / 2, b.z + 0.5] : [b.x + 0.5, b.z + b.len / 2];
      this.target = { x, y: BRIDGE_DECK, z, r: Math.min(7, b.len / 2 + 0.8), h: 1.2, t: 0 };
    } else if (road !== undefined && road >= 0) {
      const g = city.grid;
      const [x, z] = [(road % g.w) + 0.5, Math.floor(road / g.w) + 0.5];
      this.target = { x, y: Math.max(0, g.heightAt(x, z)), z, r: 1.4, h: 0.5, t: 0 };
    } else this.target = null;
    const on = !!this.target;
    this.frame.visible = this.marker.visible = on;
    if (!on) this.ripples.visible = this.beam.visible = false;
  }

  private warm = 3;

  update(dt: number): void {
    if (this.warm > 0 && --this.warm === 0 && !this.target)
      this.frame.visible = this.ripples.visible = this.beam.visible = this.marker.visible = false;
    const s = this.target;
    if (!s) return;
    s.t += dt;
    this.clock += dt;
    const { m, q, v, sc } = this;
    const dist = this.ctx.cameraCtl.distance;
    // Never thinner than a few pixels: rings and marker grow with the camera distance.
    const px = Math.max(1, dist / 60);

    // Rings go sub-pixel from far away and would shimmer (D-070): the marker alone carries it there.
    const near = dist < 170;
    this.frame.visible = near;
    // Reticle: closes in from wide on select, then breathes by ±3% and turns slowly.
    const close = Math.max(0, 1 - s.t / 0.5);
    const r = s.r * (1 + 0.03 * Math.sin(this.clock * 2.4) + 0.8 * close * close);
    this.frame.matrix.compose(v.set(s.x, s.y + 0.15, s.z), q.setFromAxisAngle(this.up, this.clock * 0.35), sc.set(r, px, r));
    this.frame.matrixWorldNeedsUpdate = true;

    // Ripples: two sweeps outward right after the selection, sinking at the end of each.
    const rip = near && s.t < RIPPLE_TIME + 0.35;
    this.ripples.visible = rip;
    if (rip) {
      for (let k = 0; k < 2; k++) {
        const p = Math.min(1, Math.max(0, (s.t - k * 0.35) / RIPPLE_TIME));
        const rr = s.r * (1 + 2.2 * p) + px * 0.5;
        v.set(s.x, s.y + 0.2 - (p >= 1 ? 50 : Math.max(0, p - 0.75) * rr * 0.5), s.z);
        this.ripples.setMatrixAt(k, m.compose(v, q.identity(), sc.set(rr, px, rr)));
      }
      this.ripples.instanceMatrix.needsUpdate = true;
    }

    // Beam: from the roof up, wide from far away; shrinks away after BEAM_HOLD.
    const fade = 1 - Math.min(1, Math.max(0, (s.t - BEAM_HOLD) / BEAM_FADE));
    this.beam.visible = fade > 0;
    if (fade > 0) {
      const bw = Math.max(0.3, dist * 0.006) * fade * (0.9 + 0.1 * Math.sin(this.clock * 5));
      const bh = 14 + dist * 0.45;
      this.beam.matrix.compose(v.set(s.x, s.y + s.h, s.z), q.identity(), sc.set(bw, bh, bw));
      this.beam.matrixWorldNeedsUpdate = true;
    }

    // Marker: over the roof, a gentle bob and a slow turn; drops in from above on select.
    const drop = Math.max(0, 1 - s.t / 0.45);
    const ms = Math.max(1.3, dist / 32);
    const y = s.y + s.h + 2.2 * ms + 0.35 * ms * Math.sin(this.clock * 2) + drop * drop * 8 * ms;
    this.marker.matrix.compose(v.set(s.x, y, s.z), q.setFromAxisAngle(this.up, this.clock * 0.9), sc.setScalar(ms));
    this.marker.matrixWorldNeedsUpdate = true;
  }
}

export const selectionModule: GameModule = {
  id: 'selection',
  deps: ['construction'],
  init(ctx) {
    const fx = new SelectionFx(ctx);
    ctx.systems.add({ id: 'selection-fx', phase: 'render', order: 120, update: (_c, f) => fx.update(f.dt) });
  },
};
