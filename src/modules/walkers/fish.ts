import {
  CapsuleGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardNodeMaterial,
  SphereGeometry,
} from 'three/webgpu';
import {
  abs,
  attribute,
  color,
  cos,
  float,
  fract,
  max,
  mix,
  normalGeometry,
  positionGeometry,
  positionWorld,
  select,
  sin,
  smoothstep,
  step,
  time,
  transformNormalToView,
  vec2,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { City } from '@/sim/City';
import { hash2 } from '@/sim/random';
import { U } from '@/render/uniforms';
import { fan, pick, pickNode, tag, turn } from './kit';

/** Instanced batches stay above the 1024-instance UBO path (AGENTS.md §8). */
const CAP = 1040;
const REGION = 28;
/** Chance per open-water tile of hosting a fish. */
const DENSITY = 0.16;
/** Fish length in tiles is about 0.2 × this. */
const SIZE = 1.7;
const BODY = 0;
const FIN = 1;
const EYE = 2;

function fishModel() {
  return mergeGeometries([
    // A streamlined body (long axis z, nose at +z) and a tapering tail stalk.
    tag(new SphereGeometry(0.5, 14, 10).scale(0.034, 0.05, 0.12).translate(0, 0, 0.012), BODY),
    tag(
      new CapsuleGeometry(0.012, 0.03, 2, 8)
        .rotateX(Math.PI / 2)
        .scale(1, 1.5, 1)
        .translate(0, 0, -0.05),
      BODY,
    ),
    // Tail fin (forked), dorsal fin and two pectoral fins.
    tag(
      fan(
        [
          [0, -0.062],
          [0.032, -0.1],
          [0.008, -0.085],
          [0, -0.078],
          [-0.008, -0.085],
          [-0.032, -0.1],
        ],
        'yz',
      ),
      FIN,
    ),
    tag(
      fan(
        [
          [0.022, 0.03],
          [0.042, -0.01],
          [0.024, -0.03],
        ],
        'yz',
      ),
      FIN,
    ),
    tag(
      fan(
        [
          [0, 0.025],
          [0.03, 0.005],
          [0, 0.005],
        ],
        'xz',
      )
        .rotateZ(-0.5)
        .translate(0.014, -0.012, 0),
      FIN,
    ),
    tag(
      fan(
        [
          [0, 0.025],
          [-0.03, 0.005],
          [0, 0.005],
        ],
        'xz',
      )
        .rotateZ(0.5)
        .translate(-0.014, -0.012, 0),
      FIN,
    ),
    // Eyes on both flanks.
    tag(new SphereGeometry(0.0065, 8, 6).translate(0.015, 0.008, 0.052), EYE),
    tag(new SphereGeometry(0.0065, 8, 6).translate(-0.015, 0.008, 0.052), EYE),
  ])!;
}

/**
 * Fish (D-126): five species (koi, blue tang, mackerel, clownfish, golden bream) with patterned bodies, fins and eyes.
 * Each swims a loop round its home below the surface, the body waving more toward the tail, and now and then leaps
 * out in an arc (nose up, then down) and drops back in. Explore modes only, round the camera.
 */
export class Fish {
  readonly mesh: InstancedMesh;
  private home = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
  cx = -1e9;
  cz = -1e9;

  constructor() {
    const geo = fishModel();
    geo.setAttribute('aHome', this.home);
    const m = new MeshStandardNodeMaterial({
      roughness: 0.35,
      metalness: 0.15,
      side: DoubleSide,
      transparent: true,
    });
    const h = attribute('aHome', 'vec4');
    const part = attribute('aPart', 'float');
    const seed = h.w;
    const g = positionGeometry;
    const n = normalGeometry as unknown as Node<'vec3'>;
    // Swim a loop (radius 0.6–1.4 tiles), either way round.
    const dirSign = step(0.5, fract(seed.mul(5.7)))
      .mul(2)
      .sub(1);
    const R = float(0.6).add(fract(seed.mul(3.3)).mul(0.8));
    const w = float(0.35)
      .add(fract(seed.mul(7.9)).mul(0.25))
      .mul(dirSign);
    const a = time.mul(w).add(seed.mul(40));
    const at = vec2(cos(a), sin(a)).mul(R);
    const heading = vec2(sin(a).negate(), cos(a)).mul(dirSign);
    // Leap: once every 9–15 s a fish spends 1.1 s in the air (only some species leap).
    const period = float(9).add(fract(seed.mul(13.1)).mul(6));
    const jf = fract(time.div(period).add(seed.mul(2.1)));
    const leaps = step(0.4, fract(seed.mul(17.3)));
    const jump = smoothstep(0, 0.001, float(1.1).div(period).sub(jf)).mul(leaps);
    const s = jf.mul(period).div(1.1).clamp(0, 1);
    const arc = s.mul(float(1).sub(s)).mul(4).mul(0.42).mul(jump);
    const depth = float(0.14).add(fract(seed.mul(9.1)).mul(0.12));
    const y = U.waterLevel.sub(depth.mul(float(1).sub(jump))).add(arc);
    // Body wave: stronger toward the tail; pitch follows the leap's arc.
    const tailK = smoothstep(0.05, -0.1, g.z);
    const wave = sin(time.mul(9).add(g.z.mul(30)).add(seed.mul(20)))
      .mul(0.012)
      .mul(tailK.add(0.15));
    const waved = vec3(g.x.add(wave), g.y, g.z);
    const pitch = mix(float(0.9), float(-0.9), s).mul(jump);
    const pitched = vec3(
      waved.x,
      waved.y.mul(cos(pitch)).add(waved.z.mul(sin(pitch))),
      waved.z.mul(cos(pitch)).sub(waved.y.mul(sin(pitch))),
    );
    const nP = vec3(
      n.x,
      n.y.mul(cos(pitch)).add(n.z.mul(sin(pitch))),
      n.z.mul(cos(pitch)).sub(n.y.mul(sin(pitch))),
    );
    m.positionNode = vec3(h.x.add(at.x), y, h.z.add(at.y)).add(turn(pitched, heading).mul(SIZE));
    m.normalNode = transformNormalToView(turn(nP, heading));

    // Patterns per species by position on the body.
    const sp = fract(seed.mul(11.7)).mul(5).floor();
    const belly = smoothstep(0.01, -0.02, g.y);
    const koi = mix(
      color(0xf26b2a),
      color(0xf7f1e8),
      step(0.55, fract(sin(g.z.mul(60).add(g.y.mul(90)).add(seed.mul(50))).mul(43758.5))),
    );
    const tang = mix(
      color(0x2f6fd6),
      color(0x13254d),
      smoothstep(0.012, 0.03, g.y).mul(smoothstep(0.05, -0.02, g.z)),
    );
    const mackerel = mix(
      color(0xc7d3dc),
      color(0x2c4a5e),
      step(0, g.y).mul(step(0.5, fract(g.z.mul(70).add(g.y.mul(40))))),
    );
    const clown = mix(color(0xf27a1a), color(0xffffff), step(0.86, abs(sin(g.z.mul(48).add(1.2)))));
    const bream = mix(color(0xd9b44a), color(0x8a7a3a), step(0, g.y).mul(0.6));
    const skin = mix(pickNode(sp, [koi, tang, mackerel, clown, bream]), color(0xf3f0e6), belly.mul(0.6));
    const fin = pick(sp, [0xf7c8a8, 0xf2d23a, 0x9fb3c0, 0xf27a1a, 0xe8c86a]);
    const own = select(
      part.lessThan(FIN - 0.5),
      skin,
      select(part.lessThan(EYE - 0.5), fin, color(0x101418)),
    ) as unknown as Node<'vec3'>;
    // Seen through the water: the deeper, the more the sea's colour takes over (none while leaping).
    const under = smoothstep(0, 0.32, U.waterLevel.sub(positionWorld.y));
    m.colorNode = mix(own, color(0x2f8fa8), under.mul(0.45));
    m.opacityNode = float(1).sub(under.mul(0.25));
    // A wet sheen: smoother when leaping into the light.
    m.roughnessNode = max(float(0.2), float(0.45).sub(jump.mul(0.2)));
    this.mesh = new InstancedMesh(geo, m, CAP);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.name = 'wildlife.fish';
    // After the water (renderOrder 1), so they show through it.
    this.mesh.renderOrder = 2;
  }

  /** Re-homes fish on open water round a point (deterministic per tile). */
  place(city: City, x: number, z: number): void {
    this.cx = x;
    this.cz = z;
    const g = city.grid;
    const a = this.home.array as Float32Array;
    let n = 0;
    for (let j = Math.max(1, Math.floor(z - REGION)); j < Math.min(g.h - 1, z + REGION) && n < CAP; j++)
      for (let i = Math.max(1, Math.floor(x - REGION)); i < Math.min(g.w - 1, x + REGION) && n < CAP; i++) {
        // Deep enough to swim a loop: the tile and its neighbours under water.
        if (g.heightAt(i + 0.5, j + 0.5) > -0.35 || g.road[g.index(i, j)]) continue;
        if (g.heightAt(i - 0.5, j + 0.5) > -0.2 || g.heightAt(i + 1.5, j + 0.5) > -0.2) continue;
        if (g.heightAt(i + 0.5, j - 0.5) > -0.2 || g.heightAt(i + 0.5, j + 1.5) > -0.2) continue;
        if (hash2(i, j, 307) > DENSITY) continue;
        a[n * 4] = i + 0.5;
        a[n * 4 + 1] = 0;
        a[n * 4 + 2] = j + 0.5;
        a[n * 4 + 3] = hash2(i, j, 311);
        n++;
      }
    this.mesh.count = n;
    this.home.needsUpdate = true;
  }
}
