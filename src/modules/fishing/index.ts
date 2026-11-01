import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { Building, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { getMaterial } from '@/render/materials/library';
import { longlinerGeometry, trawlerGeometry, wakeGeometry } from './boat';
import { U } from '@/render/uniforms';

/** Seconds for a boat's round trip: out, a slow circle over the fishing ground, home. */
const TRIP = 70;
/** Capacity ≤ 1024 (UBO): boats are re-posed every frame anyway. */
const CAP = 512;

interface Route {
  eid: number;
  /** Water's edge by the dock, the fishing ground's direction (unit) and how far out it lies. */
  x: number;
  z: number;
  dx: number;
  dz: number;
  reach: number;
  boats: number;
  phase: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

/**
 * Fishing boats (D-072): each Fishing Boat Dock's boats sail out to a fishing ground, circle it slowly and come
 * home, on a loop from `U.clock`; they stay moored while the dock is unstaffed. A dock's heading is the direction
 * with the longest run of open sea. Two boat designs and their wakes (`boat.ts`, D-095), CPU-posed per frame; no shadows.
 */
export const fishingModule: GameModule = {
  id: 'fishing',
  deps: ['world'],
  init(ctx) {
    const { city } = ctx;
    // Two boat designs (D-095), alternating along a dock, and a foam wake under each boat under way.
    const mat = getMaterial('scenery');
    const fleets = [new InstancedMesh(trawlerGeometry(), mat, CAP), new InstancedMesh(longlinerGeometry(), mat, CAP)];
    const wakes = new InstancedMesh(wakeGeometry(), mat, CAP);
    for (const m of [...fleets, wakes]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.name = 'fishing-boats';
      ctx.scene.add(m);
    }
    const routes = new Map<number, Route>();

    const plan = (eid: number): Route | null => {
      const f = buildings.at(Building.def[eid]!).fishing;
      if (!f) return null;
      const cx = Building.x[eid]! + Building.w[eid]! / 2;
      const cz = Building.z[eid]! + Building.d[eid]! / 2;
      let best = { dx: 0, dz: 1, run: -1, start: 0 };
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const [dx, dz] = [Math.cos(a), Math.sin(a)];
        // First water within a few tiles, then how far the sea stays open.
        let start = -1;
        let run = 0;
        for (let d = 1; d < 60; d++) {
          const water = city.isWaterTile(Math.floor(cx + dx * d), Math.floor(cz + dz * d));
          if (start < 0) {
            if (water) start = d;
            else if (d > 6) break;
          } else if (water) run++;
          else break;
        }
        if (start >= 0 && run > best.run) best = { dx, dz, run, start };
      }
      if (best.run < 4) return null;
      return {
        eid,
        x: cx + best.dx * (best.start + 0.5),
        z: cz + best.dz * (best.start + 0.5),
        dx: best.dx,
        dz: best.dz,
        reach: Math.min(30, best.run - 2),
        boats: f.boats,
        phase: (Building.uid[eid]! * 0.618) % 1,
      };
    };
    const sync = () => {
      routes.clear();
      for (const e of city.buildingEntities()) {
        const r = plan(e);
        if (r) routes.set(e, r);
      }
    };
    sync();
    ctx.bus.on('building:added', ({ eid }) => {
      const r = plan(eid);
      if (r) routes.set(eid, r);
    });
    ctx.bus.on('building:removed', ({ eid }) => routes.delete(eid));
    for (const ev of ['city:reset', 'terrain:changed', 'load:done'] as const) ctx.bus.on(ev, sync);

    ctx.systems.add({
      id: 'fishing.boats',
      phase: 'sync',
      update() {
        const t = U.clock.value;
        const n = [0, 0];
        let nw = 0;
        for (const r of routes.values()) {
          const working = Service.occupancy[r.eid]! > 0.1;
          const [px, pz] = [-r.dz, r.dx];
          for (let i = 0; i < r.boats && n[0]! + n[1]! < CAP; i++) {
            const lane = (i - (r.boats - 1) / 2) * 1.6;
            // Moored side by side off the dock, bows to the sea.
            let x = r.x + px * lane * 0.38;
            let z = r.z + pz * lane * 0.38;
            let yaw = Math.atan2(r.dx, r.dz);
            let speed = 0;
            if (working) {
              // 0–0.35 out, 0.35–0.65 a slow circle on the ground, 0.65–1 home.
              const u = (t / TRIP + r.phase + i * 0.17) % 1;
              const out = u < 0.35 ? u / 0.35 : u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35;
              const d = r.reach * (out * out * (3 - 2 * out));
              x = r.x + r.dx * d + px * lane;
              z = r.z + r.dz * d + pz * lane;
              // Under way: fastest mid-passage, slow while circling the ground.
              speed = u < 0.35 || u >= 0.65 ? 6 * out * (1 - out) * 1.2 + 0.15 : 0.35;
              if (u >= 0.35 && u < 0.65) {
                const a = ((u - 0.35) / 0.3) * Math.PI * 2;
                x += Math.cos(a) * 3 - 3;
                z += Math.sin(a) * 3;
                yaw = -a;
              } else if (u >= 0.65) yaw += Math.PI;
            }
            const bob = Math.sin(t * 1.3 + i * 2 + r.phase * 9) * 0.025;
            _q.setFromAxisAngle(UP, yaw);
            const k = i % 2;
            fleets[k]!.setMatrixAt(n[k]!++, _m.compose(_v.set(x, 0.01 + bob, z), _q, _s.set(1, 1, 1)));
            if (speed > 0.05 && nw < CAP) wakes.setMatrixAt(nw++, _m.compose(_v.set(x, 0, z), _q, _s.set(0.7 + speed * 0.2, 1, Math.min(1, 0.4 + speed * 0.5))));
          }
        }
        fleets.forEach((m, k) => {
          m.count = n[k]!;
          if (n[k]) m.instanceMatrix.needsUpdate = true;
        });
        wakes.count = nw;
        if (nw) wakes.instanceMatrix.needsUpdate = true;
      },
    });
  },
};
