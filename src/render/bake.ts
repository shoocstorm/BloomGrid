import {
  BufferAttribute,
  Color,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Node } from 'three/webgpu';
import { dot, float, max, mix } from 'three/tsl';
import { U } from '@/render/uniforms';

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Vector3();
const _r = new Euler();

/** A transform from position, Euler angles (radians) and scale. */
export function tf(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
): Matrix4 {
  _q.setFromEuler(_r.set(rx, ry, rz, 'YXZ'));
  return _m.compose(_e.set(x, y, z), _q, new Vector3(sx, sy, sz));
}

/**
 * Bakes many primitives into one geometry with per-vertex colour, glow and optional extra
 * attributes, so a whole wonder (or every cloud) is a single draw call. Each part is cloned, so
 * the source geometries can be shared between calls.
 */
export class GeoBuilder {
  private parts: BufferGeometry[] = [];

  constructor(private extras: Record<string, number> = {}) {}

  add(
    src: BufferGeometry,
    m: Matrix4,
    col: ColorRepresentation,
    glow = 0,
    extra: Record<string, number[]> = {},
  ): this {
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.applyMatrix4(m);
    if (g.attributes.uv) g.deleteAttribute('uv');
    const n = g.attributes.position!.count;
    const c = new Color(col);
    g.setAttribute('color', fill(n, [c.r, c.g, c.b]));
    g.setAttribute('aGlow', fill(n, [glow]));
    for (const [k, size] of Object.entries(this.extras))
      g.setAttribute(k, fill(n, extra[k] ?? new Array<number>(size).fill(0)));
    this.parts.push(g);
    return this;
  }

  get count(): number {
    return this.parts.length;
  }

  build(): BufferGeometry {
    const g = mergeGeometries(this.parts);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
}

function fill(n: number, v: number[]): BufferAttribute {
  const a = new Float32Array(n * v.length);
  for (let i = 0; i < n; i++) for (let k = 0; k < v.length; k++) a[i * v.length + k] = v[k]!;
  return new BufferAttribute(a, v.length);
}

/**
 * Cheap sky lighting for unlit (shader-animated) scenery: sky ambient by normal, sun diffuse,
 * dimmed and cooled at night. Matches the lit city closely enough at a distance.
 */
export function skyShade(base: Node<'vec3'>, n: Node<'vec3'>): Node<'vec3'> {
  const sun = max(dot(n, U.sunDir), 0).mul(float(1).sub(U.night));
  const amb = mix(U.horizon, U.zenith, n.y.mul(0.5).add(0.5)).mul(0.6).add(0.12);
  const moon = mix(float(1), float(0.35), U.night);
  return base.mul(amb.add(U.sunColor.mul(sun).mul(0.8)).mul(moon)) as Node<'vec3'>;
}
