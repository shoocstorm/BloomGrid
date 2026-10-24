import {
  BoxGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BufferAttribute, BufferGeometry as Geo } from 'three/webgpu';

/**
 * Procedural modular kit. Every piece is a unit-sized geometry with its pivot at the base
 * centre, rendered through the shared material library. Building recipes compose pieces;
 * GLB hero assets register additional pieces at runtime via `registerPiece`.
 */
export interface PieceType {
  id: string;
  geometry: BufferGeometry;
  material: string;
  castShadow: boolean;
  receiveShadow: boolean;
  /** Cull distance in world units (before quality scaling). */
  lod: number;
}

const pieces = new Map<string, PieceType>();

export function registerPiece(p: Omit<PieceType, 'castShadow' | 'receiveShadow' | 'lod'> & Partial<PieceType>): PieceType {
  const full: PieceType = { castShadow: true, receiveShadow: true, lod: Infinity, ...p };
  pieces.set(p.id, full);
  return full;
}

export function getPiece(id: string): PieceType {
  const p = pieces.get(id);
  if (!p) throw new Error(`Unknown piece "${id}"`);
  return p;
}

export function pieceIds(): string[] {
  return [...pieces.keys()];
}

export function hasPiece(id: string): boolean {
  return pieces.has(id);
}

/** Deterministic vertex jitter so low-poly foliage looks organic (shared vertices stay welded). */
function jitter(g: BufferGeometry, amount: number): BufferGeometry {
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719) * 43758.5453;
    const n = (k - Math.floor(k) - 0.5) * amount;
    const len = Math.hypot(x, y, z) || 1;
    pos.setXYZ(i, x + (x / len) * n, y + (y / len) * n, z + (z / len) * n);
  }
  g.computeVertexNormals();
  return g;
}

const base = (g: BufferGeometry, y = 0.5) => g.translate(0, y, 0);

function grassGeometry(): BufferGeometry {
  const verts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const c = Math.cos(a) * 0.18;
    const s = Math.sin(a) * 0.18;
    const lean = 0.15 * (i - 1);
    verts.push(-c, 0, -s, c, 0, s, lean, 1, lean * 0.5);
  }
  const g = new Geo();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((verts.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

function petalGeometry(): BufferGeometry {
  const g = new PlaneGeometry(1, 0.38, 8, 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5;
    const taper = Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.92 + 0.08)), 0.7);
    pos.setXYZ(i, u, Math.sin(u * Math.PI) * 0.06, pos.getZ(i) * taper);
  }
  g.computeVertexNormals();
  return g;
}

function fungusGeometry(): BufferGeometry {
  const stem = new CylinderGeometry(0.1, 0.14, 0.42, 6).translate(0, 0.21, 0);
  const cap = new SphereGeometry(0.42, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.38, 0);
  return mergeGeometries([stem.toNonIndexed(), cap.toNonIndexed()])!;
}

export function initPieces(): void {
  if (pieces.size) return;
  const box = () => base(new BoxGeometry(1, 1, 1));
  const cyl = (seg = 16) => base(new CylinderGeometry(0.5, 0.5, 1, seg));

  registerPiece({ id: 'slab', geometry: box(), material: 'concrete' });
  registerPiece({ id: 'plinth', geometry: box(), material: 'plinth', castShadow: false });
  registerPiece({ id: 'glassBox', geometry: box(), material: 'glass' });
  registerPiece({ id: 'glassCyl', geometry: cyl(20), material: 'glass' });
  registerPiece({ id: 'concreteCyl', geometry: cyl(16), material: 'concrete' });
  registerPiece({ id: 'mossBox', geometry: box(), material: 'moss' });
  registerPiece({ id: 'algaeTank', geometry: cyl(16), material: 'algae' });
  registerPiece({ id: 'pool', geometry: box(), material: 'pool', castShadow: false });
  registerPiece({ id: 'dome', geometry: new SphereGeometry(0.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), material: 'dome', castShadow: false });
  registerPiece({ id: 'solarLeaf', geometry: petalGeometry(), material: 'solar' });

  registerPiece({ id: 'trunk', geometry: base(new CylinderGeometry(0.32, 0.5, 1, 6)), material: 'bark', lod: 260 });
  registerPiece({ id: 'canopy', geometry: base(jitter(new IcosahedronGeometry(0.5, 1), 0.12)), material: 'canopy', lod: 320 });
  registerPiece({ id: 'bush', geometry: base(jitter(new IcosahedronGeometry(0.5, 0), 0.15)), material: 'bush', lod: 160 });
  registerPiece({ id: 'ivy', geometry: new PlaneGeometry(1, 1, 1, 3).translate(0, -0.5, 0.01), material: 'ivy', castShadow: false, lod: 140 });
  registerPiece({ id: 'grass', geometry: grassGeometry(), material: 'grass', castShadow: false, receiveShadow: false, lod: 90 });
  registerPiece({ id: 'flower', geometry: base(new IcosahedronGeometry(0.5, 0).scale(1, 0.7, 1), 0.35), material: 'flower', castShadow: false, lod: 110 });
  registerPiece({ id: 'alert', geometry: base(new OctahedronGeometry(0.5, 0)), material: 'alert', castShadow: false, receiveShadow: false, lod: 400 });
  registerPiece({ id: 'fungus', geometry: fungusGeometry(), material: 'fungus', castShadow: false, lod: 140 });
}
