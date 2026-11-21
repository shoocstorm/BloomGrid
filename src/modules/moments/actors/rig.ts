import {
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  SphereGeometry,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
  type Object3D,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The film actors' kit (D-197): shared shapes, soft materials and a pose blender, so every 3D film character (the
 * cat, people, gulls) is built and animated the same way: a small rig of groups holding primitive meshes, posed on
 * the CPU each frame from eased targets. Actors appear only in films (a few dozen meshes each, never in the city).
 */

// Shared shapes, smooth enough for close-ups (never disposed: actors share them).
export const BALL = new SphereGeometry(1, 24, 16);
export const HEMI = new SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
export const ROD = new CylinderGeometry(1, 1, 1, 12).translate(0, -0.5, 0);
export const TAPER = new CylinderGeometry(0.8, 1, 1, 12).translate(0, -0.5, 0);
export const CAPS = new CapsuleGeometry(1, 1, 6, 14).translate(0, -1, 0);
export const CONE = new ConeGeometry(1, 1, 16).translate(0, 0.5, 0);

/**
 * Cloth, fur and skin: a standard surface with a soft sheen at grazing angles (velvet / peach fuzz), which is what
 * makes a primitive read as fabric or fur rather than plastic.
 */
export function soft(col: ColorRepresentation, rough = 0.8, sheen = 0.6): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial({ color: col, roughness: rough, metalness: 0 });
  m.sheen = sheen;
  m.sheenRoughness = 0.55;
  m.sheenColor = new Color(col).lerp(new Color(0xffffff), 0.45);
  return m;
}

export function hard(col: ColorRepresentation, rough = 0.35, metal = 0): MeshStandardNodeMaterial {
  return new MeshStandardNodeMaterial({ color: col, roughness: rough, metalness: metal });
}

/** A glowing material (eyes, lanterns): bloom picks up its emissive. */
export function glow(col: ColorRepresentation, intensity = 2): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: col, roughness: 0.4, metalness: 0 });
  m.emissive = new Color(col);
  m.emissiveIntensity = intensity;
  return m;
}

/** A mesh at (x, y, z) scaled (sx, sy, sz) under `parent`; it casts shadows. */
export function part(
  g: BufferGeometry,
  m: Material,
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy = sx,
  sz = sx,
): Mesh {
  const mesh = new Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A pivot group at (x, y, z) under `parent`. */
export function joint(parent: Group, x = 0, y = 0, z = 0): Group {
  const g = new Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * Eased pose values: `to(targets)` sets where each value heads, `step(dt)` moves them there (critically damped, so
 * a pose change is a quick, soft blend and never a pop). Values not named by a target keep heading where they were.
 */
export class Blend<K extends string> {
  readonly v: Record<K, number>;
  private goal: Record<K, number>;
  rate = 9;

  constructor(base: Record<K, number>) {
    this.v = { ...base };
    this.goal = { ...base };
  }

  to(t: Partial<Record<K, number>>, base?: Record<K, number>): void {
    if (base) Object.assign(this.goal, base);
    Object.assign(this.goal, t);
  }

  /** Jumps straight to the goal (the first frame of a shot). */
  snap(): void {
    Object.assign(this.v, this.goal);
  }

  step(dt: number): void {
    const k = 1 - Math.exp(-dt * this.rate);
    for (const key in this.goal) this.v[key] += (this.goal[key] - this.v[key]) * k;
  }
}

/** A blink clock: `start(len, hold)`; `lid()` is 1 open → 0 shut → 1. Actors also blink on their own. */
export class Blinker {
  private t = -1;
  private len = 0.18;
  private hold = 0;
  private next = 2 + Math.random() * 3;
  auto = true;

  start(len = 0.18, hold = 0): void {
    this.t = 0;
    this.len = len;
    this.hold = hold;
  }

  lid(dt: number): number {
    if (this.t < 0 && this.auto && (this.next -= dt) <= 0) {
      this.start();
      this.next = 2.5 + Math.random() * 3.5;
    }
    if (this.t < 0) return 1;
    this.t += dt;
    const half = this.len / 2;
    const b = this.t;
    const lid = b < half ? 1 - b / half : b < half + this.hold ? 0 : Math.min(1, (b - half - this.hold) / half);
    if (b > this.len + this.hold) this.t = -1;
    return lid;
  }
}

/**
 * Merges each joint's leaf parts that share a material into one mesh (D-197): an actor is built from dozens of
 * primitives for clarity, but it draws (and casts shadows) as a few meshes per joint. Parts a rig animates on their
 * own (eyes, brows, a mouth: `keep`), parts with children, and joints themselves stay as they are.
 */
export function compact(root: Object3D, keep: Set<Object3D>): void {
  const joints: Object3D[] = [];
  root.traverse((o) => {
    if (!(o as Mesh).isMesh) joints.push(o);
  });
  for (const j of joints) {
    const byMat = new Map<Material, Mesh[]>();
    for (const c of j.children) {
      const m = c as Mesh;
      if (!m.isMesh || m.children.length || keep.has(m) || Array.isArray(m.material)) continue;
      const list = byMat.get(m.material as Material) ?? [];
      list.push(m);
      byMat.set(m.material as Material, list);
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        if (!g.attributes.uv) g.deleteAttribute('uv');
        return g.applyMatrix4(m.matrix);
      });
      // Every part needs the same attribute set to merge: drop uv where any lacks it.
      if (geos.some((g) => !g.attributes.uv)) for (const g of geos) if (g.attributes.uv) g.deleteAttribute('uv');
      const merged = new Mesh(mergeGeometries(geos), mat);
      for (const g of geos) g.dispose();
      merged.castShadow = list.some((m) => m.castShadow);
      merged.receiveShadow = list.some((m) => m.receiveShadow);
      for (const m of list) j.remove(m);
      j.add(merged);
    }
  }
}

/** Stops `root` and everything in it from casting shadows (a crowd far from the key light's interest). */
export function noShadows(root: Object3D): void {
  root.traverse((o) => ((o as Mesh).castShadow = false));
}
