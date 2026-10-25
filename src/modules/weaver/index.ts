import { Color, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { GameModule } from '@/game/context';
import type { InstanceHandle } from '@/render/Instancer';
import { activeBridges, type SkyBridge } from '@/sim/weaver';
import { hash2 } from '@/sim/random';
import { PALETTE } from '@/content/kit';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';

const STEP = 0.35;
const _m = new Matrix4();
const _q = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _t = new Vector3();
const _side = new Vector3();
const _up = new Vector3();
const _s = new Vector3();
const _c = new Color();
const UP = new Vector3(0, 1, 0);
const params = [1, 0, 0, 1];

const keyOf = (b: SkyBridge) => `${b.ax},${b.az}-${b.bx},${b.bz}`;

/**
 * Green Weaver sky-bridges (Phase 10). Each bridge is braided branches with a moss deck, flower
 * rails, canopy tufts and hanging ivy, drawn through the shared instancer (no new draw calls
 * beyond existing piece batches). New bridges grow along their length from both towers.
 */
export const weaverModule: GameModule = {
  id: 'weaver',
  deps: ['construction', 'world'],
  init(ctx) {
    const { city, instancer } = ctx;
    const shown = new Map<string, InstanceHandle[]>();

    const add = (piece: string, m: Matrix4, tint: number, glow: number, seed: number, delay: number) => {
      params[1] = seed;
      params[2] = glow;
      return instancer.addMatrix(piece, m, _c.setHex(tint), params, delay, 0.6);
    };

    const build = (bridge: SkyBridge, a: number, b: number, animate: boolean): InstanceHandle[] => {
      const out: InstanceHandle[] = [];
      const ends = [a, b].map((eid) => {
        const r = city.buildingRecord(eid);
        const place = placeBuilding(city.grid, city.buildingDef(eid), r.x, r.z, r.rot);
        const e = place.base.elements;
        return { x: e[12]!, y: e[13]!, z: e[14]!, h: place.template.height };
      });
      const [A, B] = ends as [(typeof ends)[0], (typeof ends)[0]];
      const y = Math.min(A.y + A.h, B.y + B.h) * 0.62 + Math.max(A.y, B.y) * 0.38;
      _a.set(A.x, y, A.z);
      _b.set(B.x, y, B.z);
      // Start and end at the façades rather than the tower centres.
      const dir = _t.subVectors(_b, _a).setY(0).normalize();
      _a.addScaledVector(dir, 0.9);
      _b.addScaledVector(dir, -0.9);
      const len = _a.distanceTo(_b);
      const steps = Math.max(2, Math.ceil(len / STEP));
      const arch = Math.min(1.2, len * 0.08);
      const at = (t: number, v: Vector3) => v.lerpVectors(_a, _b, t).setY(y + Math.sin(Math.PI * t) * arch);
      const seed = hash2(bridge.ax * 31 + bridge.bx, bridge.az * 17 + bridge.bz, 5);
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        at(t0, _p);
        at(t1, _s);
        const tangent = _t.subVectors(_s, _p);
        const segLen = tangent.length();
        tangent.normalize();
        _side.crossVectors(tangent, UP).normalize();
        _up.crossVectors(_side, tangent).normalize();
        // Grows outward from both towers toward the middle.
        const delay = animate ? 0.2 + Math.min(t0, 1 - t0) * len * 0.12 : -1;
        // Two braided branch strands.
        for (const k of [-1, 1]) {
          const twist = Math.sin(t0 * len * 2.2 + k) * 0.06;
          _m.compose(_p.clone().addScaledVector(_side, k * (0.22 + twist)).addScaledVector(_up, -0.05), _q.setFromUnitVectors(UP, tangent), _s.set(0.09, segLen * 1.08, 0.09));
          out.push(add('trunk', _m, PALETTE.bark, 0, seed, delay));
        }
        // Moss deck: a thin slab aligned with the path.
        _m.makeBasis(_side, _up, tangent).scale(_s.set(0.42, 0.05, segLen * 1.02)).setPosition(_p.clone().addScaledVector(_up, -0.07));
        out.push(add('mossBox', _m, 0xffffff, 0, seed, delay));
        // Flower rails, canopy tufts and hanging ivy.
        const h = hash2(i, Math.floor(seed * 1000), 3);
        if (i % 2 === 0) {
          const k = h < 0.5 ? -1 : 1;
          const s = 0.08 + h * 0.05;
          _m.compose(_p.clone().addScaledVector(_side, k * 0.24).addScaledVector(_up, 0.02), _q.identity(), _s.set(s, s, s));
          out.push(add('flower', _m, PALETTE.blossoms[Math.floor(h * PALETTE.blossoms.length)]!, h < 0.6 ? 0.8 : 0, h, delay + 0.2));
        }
        if (i % 6 === 3) {
          const s = 0.28 + h * 0.2;
          _m.compose(_p.clone().addScaledVector(_side, (h - 0.5) * 0.5).addScaledVector(_up, 0.02), _q.identity(), _s.set(s, s * 0.8, s));
          out.push(add('canopy', _m, PALETTE.leaves[Math.floor(h * PALETTE.leaves.length)]!, h < 0.4 ? 0.5 : 0, h, delay + 0.3));
        }
        if (i % 3 === 1) {
          _m.compose(_p.clone().addScaledVector(_side, 0.2 * (h < 0.5 ? -1 : 1)).addScaledVector(_up, -0.08), _q.setFromAxisAngle(UP, Math.atan2(_side.x, _side.z)), _s.set(0.14, 0.35 + h * 0.4, 1));
          out.push(add('ivy', _m, PALETTE.leaves[Math.floor(h * 4)]!, h < 0.2 ? 0.6 : 0, h, delay + 0.4));
        }
      }
      return out;
    };

    const sync = (animate: boolean) => {
      const active = activeBridges(city);
      const keys = new Set(active.map((x) => keyOf(x.bridge)));
      for (const [k, hs] of shown)
        if (!keys.has(k)) {
          hs.forEach((h) => instancer.remove(h));
          shown.delete(k);
        }
      for (const { bridge, a, b } of active) {
        const k = keyOf(bridge);
        if (!shown.has(k)) shown.set(k, build(bridge, a, b, animate && !ctx.loading));
      }
      ctx.services.get('world').atmosphere.invalidateShadows();
    };

    ctx.bus.on('weaver:changed', () => sync(true));
    // Demolishing an end hides its bridges; rebuilding (or undo) brings them back.
    ctx.bus.on('building:added', () => city.weaver.bridges.length && sync(false));
    ctx.bus.on('building:removed', () => city.weaver.bridges.length && sync(false));
    ctx.bus.on('city:reset', () => {
      for (const hs of shown.values()) hs.forEach((h) => instancer.remove(h));
      shown.clear();
    });
    sync(false);
  },
};
