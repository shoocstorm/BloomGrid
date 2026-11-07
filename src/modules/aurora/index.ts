import {
  AdditiveBlending,
  BufferAttribute,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Node,
} from 'three/webgpu';
import { abs, attribute, cameraPosition, color, cos, dot, float, max, mix, mrt, normalGeometry, normalize, positionGeometry, sin, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { AURORA } from '@/content/buildings/aurora-gemini';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';

/**
 * The Aurora Gemini's light-work (D-135). Golden searchlights sweep the sky from both crowns after dark, and the steward can put on a light show from the inspector: the beams speed up, fan out
 * and cycle through the spectrum while an aurora curtain ripples over the Aurora Ring. Render-only: nothing here
 * touches the sim, its hash or its undo history.
 *
 * Beams and curtain are one merged mesh, one material and one draw call, drawn only at night or during a show;
 * every beam is posed in the shader from static per-vertex data plus a sweep angle the CPU advances each frame.
 */

const ID = 'aurora-gemini';
/** Searchlights per tower, their reach (world units) and how long a light show runs (seconds). */
const BEAMS = 3;
const REACH = 70;
const SHOW = 42;

declare module '@/core/Services' {
  interface GameServices {
    aurora: { show(eid?: number): boolean; readonly showing: boolean };
  }
}

export const auroraModule: GameModule = {
  id: 'aurora',
  deps: ['construction', 'hud'],
  init(ctx) {
    const { city, bus } = ctx;
    const sweep = uniform(0);
    const show = uniform(0);
    const spread = uniform(0);

    const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
    {
      const kind = attribute('aKind', 'float');
      const apex = attribute('aApex', 'vec3');
      const beam = attribute('aBeam', 'vec4');
      const g = positionGeometry;
      // Beams: a cone (apex at the origin, +y up) tilted off vertical, then swept round the crown. A show fans
      // them out further and turns them faster (the CPU advances `sweep`, so speed changes never jump).
      const tilt = beam.z.add(spread.mul(0.28));
      const yaw = beam.x.add(sweep.mul(beam.y));
      const turn = (v: Node<'vec3'>) => {
        const ct = cos(tilt);
        const st = sin(tilt);
        const t1 = vec3(v.x, v.y.mul(ct).sub(v.z.mul(st)), v.y.mul(st).add(v.z.mul(ct)));
        const cy = cos(yaw);
        const sy = sin(yaw);
        return vec3(t1.x.mul(cy).add(t1.z.mul(sy)), t1.y, t1.z.mul(cy).sub(t1.x.mul(sy)));
      };
      const beamPos = apex.add(turn(g.mul(REACH)));
      // Curtain: world points in aApex; it ripples along z and its rays shimmer.
      const u = uv().x;
      const v = uv().y;
      const ripple = sin(u.mul(9).add(U.clock.mul(0.5))).mul(1.8).add(sin(u.mul(23).sub(U.clock.mul(0.9))).mul(0.5));
      const curtainPos = apex.add(vec3(0, 0, ripple));
      const world = mix(beamPos, curtainPos, kind);
      mat.positionNode = world;
      // Beams: soft edges (bright where the cone faces the camera), fading along their reach.
      const n = turn(normalGeometry);
      const view = normalize(cameraPosition.sub(world));
      const soft = abs(dot(n, view)).pow(1.6);
      const along = g.y;
      const beamA = float(1).sub(along).pow(2).mul(smoothstep(0, 0.02, along)).mul(soft);
      const tone = beam.w;
      const base = mix(color(0xffd38a), color(0x9ff7ff), tone);
      // In a show each beam cycles through the spectrum, offset by its own phase.
      const hue = U.clock.mul(0.7).add(beam.x.mul(2));
      const spectrum = vec3(sin(hue).mul(0.5).add(0.5), sin(hue.add(2.1)).mul(0.5).add(0.5), sin(hue.add(4.2)).mul(0.5).add(0.5));
      const beamCol = mix(base, spectrum.mul(1.2).add(0.15), show);
      const beamI = U.night.mul(0.24).add(show.mul(0.32));
      // Curtain: green at its foot to violet at its crest, bright along the lower edge, with shimmering rays.
      const rays = sin(u.mul(48).add(U.clock.mul(1.6))).mul(0.35).add(0.65);
      const edge = smoothstep(0, 0.12, u).mul(smoothstep(1, 0.88, u));
      const curtainA = smoothstep(0, 0.12, v).mul(float(1).sub(v).pow(1.3)).mul(rays).mul(edge).mul(show).mul(U.night.mul(0.6).add(0.4)).mul(0.55);
      const curtainCol = mix(mix(color(0x5dffb0), color(0x47c8ff), smoothstep(0.2, 0.6, v)), color(0xb07aff), smoothstep(0.55, 1, v));
      const col = mix(beamCol.mul(beamA).mul(beamI), curtainCol.mul(curtainA), kind);
      mat.colorNode = col;
      mat.opacityNode = max(col.x, max(col.y, col.z)).min(1);
      mat.mrtNode = mrt({ emissive: col.mul(0.6) });
    }

    const mesh = new Mesh(undefined, mat);
    mesh.name = 'aurora.lights';
    mesh.renderOrder = 8;
    mesh.visible = false;
    ctx.scene.add(mesh);

    const twins: number[] = [];
    const cone = new CylinderGeometry(0.075, 0.004, 1, 20, 1, true).translate(0, 0.5, 0);
    const curtain = new PlaneGeometry(1, 1, 64, 1).translate(0.5, 0.5, 0);
    const tag = (geo: BufferGeometry, kind: number, apex: (i: number) => [number, number, number], beam: [number, number, number, number]) => {
      const n = geo.getAttribute('position').count;
      const k = new Float32Array(n).fill(kind);
      const a = new Float32Array(n * 3);
      const b = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        a.set(apex(i), i * 3);
        b.set(beam, i * 4);
      }
      geo.setAttribute('aKind', new BufferAttribute(k, 1));
      geo.setAttribute('aApex', new BufferAttribute(a, 3));
      geo.setAttribute('aBeam', new BufferAttribute(b, 4));
      return geo;
    };

    /** Crown and plaza-centre world points of a twin (local x = ±AURORA.axis). */
    const local = (eid: number, x: number, y: number, z: number): Vector3 => {
      const rec = city.buildingRecord(eid);
      const place = placeBuilding(city.grid, city.buildingDef(eid), rec.x, rec.z, rec.rot);
      return new Vector3(x, y, z).applyMatrix4(place.base);
    };

    const rebuild = () => {
      twins.length = 0;
      for (const eid of city.buildingEntities()) if (city.buildingDef(eid).id === ID) twins.push(eid);
      mesh.geometry.dispose();
      if (!twins.length) {
        mesh.geometry = new PlaneGeometry(0, 0);
        return;
      }
      const parts: BufferGeometry[] = [];
      const centre = new Vector3();
      for (const eid of twins) {
        for (const side of [1, -1]) {
          const at = local(eid, side * AURORA.axis, AURORA.crown, 0);
          for (let k = 0; k < BEAMS; k++)
            // phase, sweep speed (the towers sweep opposite ways), tilt off vertical, tone (0 gold … 1 silver; the twins match).
            parts.push(tag(cone.clone(), 0, () => [at.x, at.y, at.z], [(k / BEAMS) * Math.PI * 2 + (side > 0 ? 0 : 0.6), side * (0.9 + k * 0.17), 0.32 + k * 0.08, 0.15 * k]));
        }
        // The aurora curtain hangs above the ring, 30 wide along the towers' axis.
        const c = curtain.clone();
        const p = c.getAttribute('position');
        const mid = local(eid, 0, AURORA.ringY + 7, 0);
        tag(c, 1, (i) => [mid.x + (p.getX(i) - 0.5) * 30, mid.y - 3 + p.getY(i) * 16, mid.z], [0, 0, 0, 0]);
        parts.push(c);
        centre.add(local(eid, 0, 40, 0));
      }
      const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
      geo.boundingSphere = new Sphere(centre.divideScalar(twins.length), REACH + 40);
      mesh.geometry = geo;
    };
    rebuild();
    const isTwin = (eid: number) => city.buildingDef(eid).id === ID;
    bus.on('building:added', ({ eid }) => isTwin(eid) && rebuild());
    bus.on('building:removed', ({ eid }) => twins.includes(eid) && rebuild());
    bus.on('city:reset', rebuild);
    bus.on('terrain:changed', () => twins.length && rebuild());

    // ── Light show ────────────────────────────────────────────────────────────────────────────────────────────
    let left = 0;
    const startShow = (eid?: number): boolean => {
      if (!twins.length) return false;
      left = SHOW;
      const at = city.buildingRecord(eid ?? twins[0]!);
      bus.emit('toast', { text: 'Aurora Gemini light show: Sol and Luna light up the sky', tone: 'ok', at: { x: at.x + 7, z: at.z + 7 } });
      return true;
    };
    ctx.services.provide('aurora', { show: startShow, get showing() { return left > 0; } });

    ctx.systems.add({
      id: 'aurora.update',
      phase: 'render',
      order: 6,
      update(_c, f) {
        if (!twins.length) return void (mesh.visible = false);
        left = Math.max(0, left - f.dt);
        // Ease in over two seconds, out over the last four.
        const target = left > 4 ? 1 : left / 4;
        show.value += (target - show.value) * Math.min(1, f.dt * 1.5);
        spread.value = show.value * (0.5 + 0.5 * Math.sin(U.clock.value * 0.9));
        sweep.value += f.dt * (0.12 + show.value * 0.9);
        mesh.visible = U.night.value > 0.04 || show.value > 0.01;
      },
    });

    // ── Inspector button: the show (Sky deck and Postcard come from the explore module, for every landmark) ──
    ctx.services.get('hud').buildingActions((eid) =>
      isTwin(eid)
        ? [
            h(
              'button',
              { class: 'tool', title: 'Searchlights dance through the spectrum and an aurora ripples over the Sun Gate (best after dark)', onClick: () => startShow(eid) },
              h('span', { class: 'g' }, icon('sparkle')),
              'Light show',
            ),
          ]
        : [],
    );
  },
};
