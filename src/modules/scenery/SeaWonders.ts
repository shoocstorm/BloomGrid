import {
  AdditiveBlending,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  Sphere,
  Vector3,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  attribute,
  color,
  float,
  mix,
  mrt,
  normalGeometry,
  positionGeometry,
  sin,
  smoothstep,
  uv,
  vec3,
} from 'three/tsl';
import { getMaterial } from '@/render/materials/library';
import { hash2 } from '@/sim/random';
import { U } from '@/render/uniforms';
import { GeoBuilder, skyShade, tf } from '@/render/bake';
import { orbit } from './SkyLife';
import { WONDER_SITES } from './sites';
import { dome, LANTERN_Y, lighthouse, lotus, stacks, tideGates } from './wonderModels';
import type { Kit } from './wonderKit';

const LUMEN = 0x8ff7ff;
const BALL = new SphereGeometry(1, 16, 10);

/**
 * Wonders of the sea, pure decoration out in the deep water off the coast (no sim state, so nothing
 * to save): the Tidewatch Lighthouse with its night beam, the Tide Gates (three giant pearl rings rising
 * out of the sea), the Lotus Atoll of giant floating flowers, the Abyssal Dome observatory, the
 * Verdant Pillars (forested sea stacks) and pods of glowing whales that surface now and then.
 * Each static wonder is one merged mesh (one draw call, culled on its own) in the `wonder` material; the models
 * are in `wonderModels.ts` (D-146).
 */
export class SeaWonders {
  readonly group = new Group();
  private beam: Mesh;

  constructor(S: number) {
    const at = (k: keyof typeof WONDER_SITES) => {
      const [x, z] = WONDER_SITES[k] as readonly [number, number];
      return [x * S, z * S] as const;
    };
    this.add('lighthouse', lighthouse(...at('lighthouse')));
    this.add('tide-gates', tideGates(...at('tideGates'), S));
    this.add('lotus-atoll', lotus(...at('lotus')));
    this.add('abyssal-dome', dome(...at('dome')));
    this.add('verdant-pillars', stacks(...at('stacks')));
    this.beam = this.makeBeam(...at('lighthouse'));
    this.group.add(this.beam, ...WONDER_SITES.whales.map(([x, z], p) => this.whales(x * S, z * S, p)));
  }

  private add(name: string, k: Kit): void {
    const mesh = new Mesh(k.b.build(), getMaterial('wonder'));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = name;
    this.group.add(mesh);
  }

  /** Mesh name → wonder id (`sim/wonders.ts`). */
  private static readonly IDS: Record<string, string> = {
    lighthouse: 'lighthouse',
    'lighthouse-beam': 'lighthouse',
    'tide-gates': 'tideGates',
    'lotus-atoll': 'lotus',
    'abyssal-dome': 'dome',
    'verdant-pillars': 'stacks',
    whales: 'whales',
  };
  /** Wonders rising out of the sea after their discovery: mesh → seconds elapsed. */
  private rising = new Map<Mesh, number>();
  private lit = true;

  /**
   * Shows the wonders `visible` allows (D-072); a wonder newly allowed with `rise` set climbs out of the sea over
   * a few seconds instead of popping in. Returns whether anything changed.
   */
  sync(visible: (id: string) => boolean, rise = false): boolean {
    let changed = false;
    for (const m of this.group.children as Mesh[]) {
      const on = visible(SeaWonders.IDS[m.name] ?? '');
      if (m === this.beam) {
        this.lit = on;
        continue;
      }
      if (on === m.visible) continue;
      changed = true;
      m.visible = on;
      if (on && rise) {
        m.position.y = -40;
        this.rising.set(m, 0);
      } else m.position.y = 0;
    }
    return changed;
  }

  /** True while a wonder is still rising (shadows need refreshing). */
  update(dt = 0): boolean {
    this.beam.visible = this.lit && U.night.value > 0.05;
    this.beam.rotation.y = U.clock.value * 0.5;
    for (const [m, t] of this.rising) {
      const k = Math.min(1, (t + dt) / 5);
      m.position.y = -40 * (1 - k) ** 3;
      if (k >= 1) this.rising.delete(m);
      else this.rising.set(m, t + dt);
    }
    return this.rising.size > 0;
  }

  /** Two rotating cones of light from the lantern room, seen only at night. */
  private makeBeam(x: number, z: number): Mesh {
    const cone = new ConeGeometry(4, 70, 16, 1, true).translate(0, -35, 0).rotateZ(Math.PI / 2);
    const g = mergeGeometries([cone, cone.clone().rotateY(Math.PI)]);
    cone.dispose();
    const m = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      fog: false,
    });
    m.colorNode = color(0xfff1c0);
    // Fades out along the beam (cone uv.y runs base → tip).
    m.opacityNode = U.night.mul(0.22).mul(smoothstep(0, 0.9, uv().y));
    const mesh = new Mesh(g, m);
    mesh.position.set(x, LANTERN_Y, z);
    mesh.name = 'lighthouse-beam';
    mesh.renderOrder = 6;
    return mesh;
  }

  /**
   * A pod of whales gliding in slow circles, surfacing every half minute or so with a spout. Positions are
   * shader-animated from local geometry, so the pod's bounds are set by hand for culling.
   */
  private whales(x: number, z: number, p: number): Mesh {
    const b = new GeoBuilder({ aOrbit: 4, aWhale: 4 });
    for (let w = 0; w < 3; w++) {
      const h = (k: number) => hash2(p * 7 + w, k, 9901);
      const s = w === 0 ? 1.4 : 0.9 + h(1) * 0.3;
      const ex = {
        aOrbit: [x, z, 22 + w * 5, 0.035 * (p ? -1 : 1)],
        aWhale: [w * 0.5 + h(2) * 0.2, p * 2.1 + w * 0.7, 0, s],
      };
      const spout = { ...ex, aWhale: [ex.aWhale[0]!, ex.aWhale[1]!, 1, s] };
      b.add(BALL, tf(0, 0, 0, 0, 0, 0, 1.6 * s, 1.3 * s, 6 * s), 0x2e5f86, 0.25, ex);
      b.add(BALL, tf(0, -0.5 * s, 0.6 * s, 0, 0, 0, 1.3 * s, 0.9 * s, 4.8 * s), 0xdde8ea, 0.1, ex);
      b.add(BALL, tf(0, -0.3 * s, -6.2 * s, 0, 0, 0, 2.6 * s, 0.16 * s, 1.1 * s), 0x2e5f86, 0.25, ex);
      for (const side of [-1, 1])
        b.add(
          BALL,
          tf(side * 2 * s, -0.6 * s, 1.6 * s, 0, side * 0.5, side * 0.4, 1.6 * s, 0.12 * s, 0.8 * s),
          0x2e5f86,
          0.25,
          ex,
        );
      // Glowing spots along the back.
      for (let k = 0; k < 5; k++)
        b.add(BALL, tf(0, 1.15 * s, (2.5 - k * 1.4) * s, 0, 0, 0, 0.18 * s), LUMEN, 2.2, ex);
      // Spout: a column of spray under a puff of mist.
      b.add(BALL, tf(0, 1.2 * s + 1.6, 3 * s, 0, 0, 0, 0.22, 1.7, 0.22), 0xeefcff, 0.4, spout);
      b.add(BALL, tf(0, 1.2 * s + 3.3, 3 * s, 0, 0, 0, 0.9, 0.55, 0.9), 0xeefcff, 0.4, spout);
    }
    const geo = b.build();
    const o = attribute('aOrbit', 'vec4');
    const wh = attribute('aWhale', 'vec4');
    // Surfacing: mostly below the surface, rising for a few seconds each cycle; the spout grows meanwhile.
    const surf = smoothstep(0.75, 1, sin(U.clock.mul(0.18).add(wh.y)));
    const depth = float(-5)
      .mul(wh.w)
      .add(surf.mul(float(4.9).mul(wh.w)));
    const local = positionGeometry.mul(vec3(1, mix(float(1), surf, wh.z), 1));
    const { pos, rot } = orbit(local as never, o, wh.x, depth);
    const m = new MeshBasicNodeMaterial();
    m.positionNode = pos;
    const col = attribute('color', 'vec3');
    const glow = col.mul(attribute('aGlow', 'float')).mul(U.night.mul(0.9).add(0.04));
    m.colorNode = skyShade(col, rot(normalGeometry)).add(glow);
    m.mrtNode = mrt({ emissive: glow.mul(0.7) });
    const mesh = new Mesh(geo, m);
    geo.boundingSphere = new Sphere(new Vector3(x, 0, z), 48);
    mesh.name = 'whales';
    return mesh;
  }
}
