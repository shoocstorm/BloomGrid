import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { color, fract, select, sin, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';

/**
 * Shared building blocks for the close-up wildlife (D-126): part tagging for merged models, palette picks and a
 * heading turn for shader-posed instances. Every creature is one instanced mesh whose parts are told apart by the
 * `aPart` vertex attribute and posed with `aLimb` (a per-vertex value the creature's shader reads its own way).
 */
export function tag(g: BufferGeometry, part: number, limb: [number, number] = [0, 0]): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute('position').count;
  geo.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  const l = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    l[i * 2] = limb[0];
    l[i * 2 + 1] = limb[1];
  }
  geo.setAttribute('aLimb', new Float32BufferAttribute(l, 2));
  for (const k of Object.keys(geo.attributes))
    if (!['position', 'normal', 'aPart', 'aLimb'].includes(k)) geo.deleteAttribute(k);
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  return geo;
}

/** A flat polygon (triangle fan from its first point) in the plane given by `axes` ('xz' lies flat, 'yz' stands up). */
export function fan(points: [number, number][], axes: 'xz' | 'yz'): BufferGeometry {
  const pos: number[] = [];
  const p = (a: number, b: number) => (axes === 'xz' ? [a, 0, b] : [0, a, b]);
  for (let i = 1; i < points.length - 1; i++)
    pos.push(...p(...points[0]!), ...p(...points[i]!), ...p(...points[i + 1]!));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Picks a colour from a list by an index node (0..n-1). */
export function pick(i: Node<'float'>, hexes: number[]): Node<'vec3'> {
  let out: Node<'vec3'> = color(hexes[hexes.length - 1]!) as unknown as Node<'vec3'>;
  for (let k = hexes.length - 2; k >= 0; k--)
    out = select(i.lessThan(k + 0.5), color(hexes[k]!), out) as unknown as Node<'vec3'>;
  return out;
}

/** Picks a node from a list by an index node (0..n-1). */
export function pickNode<T extends Node<'vec3'> | Node<'float'>>(i: Node<'float'>, nodes: T[]): T {
  let out = nodes[nodes.length - 1]!;
  for (let k = nodes.length - 2; k >= 0; k--)
    out = select(i.lessThan(k + 0.5), nodes[k]!, out) as unknown as T;
  return out;
}

/** Turns a model (local +z forward) to face `heading` (unit xz). */
export const turn = (v: Node<'vec3'>, heading: Node<'vec2'>): Node<'vec3'> =>
  vec3(
    v.x.mul(heading.y).add(v.z.mul(heading.x)),
    v.y,
    v.x.mul(heading.x).negate().add(v.z.mul(heading.y)),
  ) as Node<'vec3'>;

/** A cheap shader hash in 0..1. */
export const hash1 = (x: Node<'float'>): Node<'float'> =>
  fract(sin(x.mul(12.9898)).mul(43758.5453)) as Node<'float'>;
