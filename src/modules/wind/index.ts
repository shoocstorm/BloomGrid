import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { Building } from '@/ecs/components';
import { getMaterial } from '@/render/materials/library';
import { GeoBuilder, tf } from '@/render/bake';
import { U } from '@/render/uniforms';
import { TURBINE_TOP } from '@/content/buildings/wind-turbine';

/** Prevailing sea wind: every nacelle faces this yaw (rotors face east-south-east, into the trade wind). */
const WIND_YAW = 1.15;
/** Rotor angular speed range (rad/s): slow and calm (ambient motion stays subtle). */
const SPIN = [0.75, 1.15] as const;
const BLADE = 4.3;
/** Hub in the nacelle frame (origin at the tower top, rotor facing +z). */
const HUB = new Vector3(0, 0.27, 0.66);
/** One instanced batch each; capacity ≤ 1024 keeps matrices in a UBO, which is fine for per-frame updates. */
const CAP = 1024;

interface Turbine {
  eid: number;
  /** Nacelle frame: tower top, facing the wind. */
  head: Matrix4;
  speed: number;
  phase: number;
}

function nacelleGeometry() {
  const b = new GeoBuilder();
  b.add(new BoxGeometry(1, 1, 1), tf(0, 0.31, -0.25, 0, 0, 0, 0.56, 0.6, 1.55), 0xfbfaf6);
  b.add(new SphereGeometry(0.5, 12, 8), tf(0, 0.31, -1.0, 0, 0, 0, 0.56, 0.6, 0.4), 0xfbfaf6);
  // Solar skin on the roof and an aviation beacon on the tail.
  b.add(new BoxGeometry(1, 1, 1), tf(0, 0.63, -0.3, 0, 0, 0, 0.42, 0.05, 1.1), 0x2f6f78, 0.25);
  b.add(new SphereGeometry(0.07, 8, 6), tf(0, 0.7, -1.05), 0xff7a6a, 3);
  b.add(new CylinderGeometry(0.24, 0.24, 0.12, 12), tf(0, 0, 0), 0xf1ede2);
  return b.build();
}

function rotorGeometry() {
  const b = new GeoBuilder();
  b.add(new ConeGeometry(0.24, 0.55, 14), tf(0, 0, 0.2, Math.PI / 2), 0xf7f6f0);
  b.add(new SphereGeometry(0.22, 12, 8), tf(0, 0, -0.02, 0, 0, 0, 1, 1, 0.6), 0xf7f6f0);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    // A flat tapered blade with a slight pitch, and a glowing teal tip band.
    const blade = new CylinderGeometry(0.05, 0.19, BLADE, 4)
      .scale(1, 1, 0.28)
      .translate(0, BLADE / 2 + 0.16, 0);
    b.add(blade, tf(0, 0, 0, 0, 0.25, a), 0xf4f6f2);
    const tip = new CylinderGeometry(0.045, 0.06, 0.45, 4).scale(1, 1, 0.3).translate(0, BLADE - 0.1, 0);
    b.add(tip, tf(0, 0, 0, 0, 0.25, a), 0x5ff2da, 1.4);
  }
  return b.build();
}

/**
 * Breeze Turbines (D-047): the building recipe draws plinth and tower; this module mounts a nacelle on each
 * (all facing the prevailing wind) and spins the rotors. Two instanced meshes, rotors re-posed on the CPU each
 * frame from `U.clock` (≈ one matrix per turbine). Neither casts shadows: rotors move every frame, and the
 * cached shadow map would need re-rendering for them.
 */
export const windModule: GameModule = {
  id: 'wind',
  deps: ['world'],
  init(ctx) {
    const mat = getMaterial('scenery');
    const nacelles = new InstancedMesh(nacelleGeometry(), mat, CAP);
    const rotors = new InstancedMesh(rotorGeometry(), mat, CAP);
    for (const m of [nacelles, rotors]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = true;
      m.name = 'wind-turbines';
    }
    ctx.scene.add(nacelles, rotors);

    const turbines: Turbine[] = [];
    const facing = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), WIND_YAW);
    const one = new Vector3(1, 1, 1);
    const head = (eid: number) => {
      const { grid } = ctx.city;
      const [x, z, w, d] = [Building.x[eid]!, Building.z[eid]!, Building.w[eid]!, Building.d[eid]!];
      const y = grid.rangeOver(x, z, w, d).max + 0.02 + TURBINE_TOP;
      return new Matrix4().compose(new Vector3(x + w / 2, y, z + d / 2), facing, one);
    };
    const isTurbine = (eid: number) => ctx.city.buildingDef(eid).id === 'wind-turbine';
    const syncStatic = () => {
      nacelles.count = rotors.count = turbines.length;
      turbines.forEach((t, i) => nacelles.setMatrixAt(i, t.head));
      nacelles.instanceMatrix.needsUpdate = true;
    };
    const add = (eid: number) => {
      if (!isTurbine(eid) || turbines.length >= CAP) return;
      const h = ((eid * 2654435761) >>> 0) / 4294967296;
      turbines.push({ eid, head: head(eid), speed: SPIN[0] + (SPIN[1] - SPIN[0]) * h, phase: h * 20 });
    };
    const rebuild = () => {
      turbines.length = 0;
      for (const eid of ctx.city.buildingEntities()) add(eid);
      syncStatic();
    };
    // Startup content exists before modules load: mirror it now (AGENTS.md rule 9).
    rebuild();
    ctx.bus.on('building:added', ({ eid }) => {
      if (!isTurbine(eid)) return;
      add(eid);
      syncStatic();
    });
    ctx.bus.on('building:removed', ({ eid }) => {
      const i = turbines.findIndex((t) => t.eid === eid);
      if (i < 0) return;
      turbines.splice(i, 1);
      syncStatic();
    });
    ctx.bus.on('city:reset', rebuild);
    ctx.bus.on('terrain:changed', () => {
      for (const t of turbines) t.head = head(t.eid);
      syncStatic();
    });

    const spin = new Matrix4();
    const m = new Matrix4();
    const hub = new Matrix4().makeTranslation(HUB.x, HUB.y, HUB.z);
    ctx.systems.add({
      id: 'wind.update',
      phase: 'render',
      order: 5,
      update() {
        if (!turbines.length) return;
        const t = U.clock.value;
        for (let i = 0; i < turbines.length; i++) {
          const tb = turbines[i]!;
          spin.makeRotationZ(t * tb.speed + tb.phase);
          rotors.setMatrixAt(i, m.multiplyMatrices(tb.head, hub).multiply(spin));
        }
        rotors.instanceMatrix.needsUpdate = true;
      },
    });
  },
};
