import { AdditiveBlending, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { color, smoothstep, uv } from 'three/tsl';
import { getMaterial } from '@/render/materials/library';
import { U } from '@/render/uniforms';
import { WONDER_SITES, type WonderSite } from './sites';
import { dome, LANTERN_Y, lighthouse, lotus, stacks, tideGates } from './wonderModels';
import { colonnade, geode, turtle } from './laterWonders';
import { dolphinSchool, whalePod } from './SeaLife';
import type { Kit } from './wonderKit';

/** Each sea wonder's model at the origin, by its lore key (the model gallery). `S` = map size (the Tide Gates face the island). */
export const WONDER_MODELS: Record<string, (S: number) => Kit> = {
  lighthouse: () => lighthouse(0, 0),
  tideGates: (S) => tideGates(0, 0, S),
  lotus: () => lotus(0, 0),
  dome: () => dome(0, 0),
  stacks: () => stacks(0, 0),
  turtle: () => turtle(0, 0),
  colonnade: () => colonnade(0, 0),
  geode: () => geode(0, 0),
};

/**
 * Wonders of the sea, pure decoration out in the deep water off the coast (no sim state, so nothing
 * to save): the Tidewatch Lighthouse with its night beam, the Tide Gates (three giant pearl rings rising
 * out of the sea), the Lotus Atoll of giant floating flowers, the Abyssal Dome observatory, the
 * Verdant Pillars (forested sea stacks), Turtle Isle, the Sunken Colonnade and the Prism Geode, with pods of glowing
 * whales and schools of dolphins swimming, breaching and leaping (`SeaLife.ts`, D-164).
 * Each static wonder is one merged mesh (one draw call, culled on its own) in the `wonder` material; the models
 * are in `wonderModels.ts` (D-146) and `laterWonders.ts` (D-164).
 */
export class SeaWonders {
  readonly group = new Group();
  private beam: Mesh;

  constructor(S: number) {
    const at = (k: WonderSite) => {
      const [x, z] = WONDER_SITES[k];
      return [x * S, z * S] as const;
    };
    this.add('lighthouse', lighthouse(...at('lighthouse')));
    this.add('tide-gates', tideGates(...at('tideGates'), S));
    this.add('lotus-atoll', lotus(...at('lotus')));
    this.add('abyssal-dome', dome(...at('dome')));
    this.add('verdant-pillars', stacks(...at('stacks')));
    this.add('turtle-isle', turtle(...at('turtle')));
    this.add('sunken-colonnade', colonnade(...at('colonnade')));
    this.add('prism-geode', geode(...at('geode')));
    this.beam = this.makeBeam(...at('lighthouse'));
    this.group.add(
      this.beam,
      ...WONDER_SITES.whales.map(([x, z], p) => whalePod(x * S, z * S, p)),
      ...WONDER_SITES.dolphins.map(([x, z], p) => dolphinSchool(x * S, z * S, p)),
    );
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
    'turtle-isle': 'turtle',
    'sunken-colonnade': 'colonnade',
    'prism-geode': 'geode',
    whales: 'whales',
    dolphins: 'whales',
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
}
