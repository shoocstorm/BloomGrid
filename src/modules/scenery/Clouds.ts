import { IcosahedronGeometry, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  distance,
  dot,
  length,
  float,
  max,
  mix,
  mod,
  normalize,
  positionGeometry,
  smoothstep,
  step,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2 } from '@/sim/random';
import { U } from '@/render/uniforms';
import { GeoBuilder, tf } from '@/render/bake';

const CLOUDS = 64;
/** Clouds drift east and wrap inside this band of x (world units), so the sky never empties. */
const X0 = -320;
const SPAN = 1150;
const DRIFT = 0.7;

/**
 * Cumulus clouds: puffy clusters of soft spheres drifting slowly east high over the island, all in one
 * draw call (positions are shader-animated from `U.clock`). Clouds part along the line from the camera to
 * its focus, so they frame the view instead of hiding the city; storms bring more, darker clouds.
 */
export class Clouds {
  readonly mesh: Mesh;
  /** Camera focus (xz) and the radius kept clear of cloud around it. */
  readonly focus = uniform(new Vector3());
  readonly clear = uniform(120);

  constructor() {
    const b = new GeoBuilder({ aCloud: 4, aPuff: 4 });
    const puff = mergeVertices(new IcosahedronGeometry(1, 2));
    // Flat-bottomed puffs read as cumulus.
    const pos = puff.attributes.position!;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.45);
    for (let c = 0; c < CLOUDS; c++) {
      const h = (k: number) => hash2(c, k, 9137);
      const cx = X0 + h(1) * SPAN;
      const cz = -260 + h(2) * 1030;
      const cy = 62 + h(3) * 50;
      const size = 0.7 + h(4) * 0.8;
      const n = 5 + Math.floor(h(5) * 8);
      for (let p = 0; p < n; p++) {
        const k = (q: number) => hash2(c * 31 + p, q, 5113);
        // Puffs line up along x and pile up in the middle.
        const t = n === 1 ? 0 : p / (n - 1) - 0.5;
        const r = (5 + k(1) * 7) * size * (1.15 - Math.abs(t));
        const px = cx + t * 34 * size + (k(2) - 0.5) * 6;
        const pz = cz + (k(3) - 0.5) * 16 * size;
        const py = cy + (1 - Math.abs(t) * 2) * r * 0.35 + k(4) * 2;
        b.add(puff, tf(px, py, pz, 0, k(5) * 6, 0, r), 0xffffff, 0, {
          aCloud: [cx, cy, cz, h(6)],
          aPuff: [px, py, pz, r],
        });
      }
    }
    const geo = b.build();
    puff.dispose();

    const cloud = attribute('aCloud', 'vec4');
    const p = attribute('aPuff', 'vec4');
    // Drift with wrap-around; fade (shrink) at the wrap ends, around the focus and near the camera.
    const wx = mod(cloud.x.sub(X0).add(U.clock.mul(DRIFT)), float(SPAN));
    const shift = wx.add(X0).sub(cloud.x);
    const centre = vec3(cloud.x.add(shift), cloud.y, cloud.z);
    const ends = smoothstep(0, 140, wx).mul(smoothstep(SPAN, SPAN - 140, wx));
    // Clear a capsule from the focus back to the camera (xz), so nothing hangs between the eye and the city.
    const a = vec2(this.focus.x, this.focus.z);
    const ab = vec2(cameraPosition.x, cameraPosition.z).sub(a);
    const ap = vec2(centre.x, centre.z).sub(a);
    const t = dot(ap, ab)
      .div(max(dot(ab, ab), 1))
      .clamp(0, 1);
    const off = length(ap.sub(ab.mul(t)));
    const parted = smoothstep(this.clear.mul(0.55), this.clear, off);
    const near = smoothstep(25, 70, distance(cameraPosition, centre));
    const cover = step(cloud.w, float(0.62).add(U.storm.mul(0.38)));
    const k = ends.mul(parted).mul(near).mul(cover);
    const rel = positionGeometry.sub(p.xyz);
    const m = new MeshBasicNodeMaterial();
    m.positionNode = p.xyz.add(vec3(shift, 0, 0)).add(rel.mul(k.mul(0.9).add(0.1).mul(step(0.02, k))));
    const nrm = normalize(rel);
    // Wrapped sun light over a sky-tinted shadow side, darker underneath; moonlit grey-blue at night.
    const lam = dot(nrm, U.sunDir).mul(0.5).add(0.5).mul(float(1).sub(U.night));
    const shade = mix(U.zenith, U.horizon, 0.6).mul(0.72).add(0.1);
    const under = mix(float(0.7), float(1), smoothstep(-0.7, 0.5, nrm.y));
    const day = mix(shade, U.sunColor.mul(1.05), lam).mul(under);
    const lit = mix(day, vec3(0.035, 0.045, 0.08).mul(under), U.night);
    m.colorNode = mix(
      lit,
      vec3(0.42, 0.46, 0.5)
        .mul(under)
        .mul(max(float(0.3), float(1).sub(U.night))),
      U.storm.mul(0.75),
    );
    this.mesh = new Mesh(geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'clouds';
  }
}
