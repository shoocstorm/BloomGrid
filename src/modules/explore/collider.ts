import { Matrix4, Vector3 } from 'three/webgpu';
import { Building } from '@/ecs/components';
import type { City } from '@/sim/City';
import { BRIDGE, BRIDGE_DECK } from '@/sim/City';
import { NO_ENTITY } from '@/sim/Grid';
import { doorSteps, piecesAt, placeBuilding } from '@/modules/construction/BuildingRenderer';
import { ROAD_LIFT } from '@/modules/construction/RoadRenderer';
import { getPiece } from '@/assets/kit/pieces';

/** Player body radius, the tallest ledge it steps up without jumping, and its height (world units). */
export const RADIUS = 0.06;
export const STEP = 0.18;
export const BODY = 0.21;
/** A lot's plinth is climbed like front steps (D-132): buildings stand up to this far above the street. */
const PLINTH_STEP = 0.4;
const AROUND = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Explore-mode collision (D-025, D-055): terrain, bridge decks, water, every building piece and wild trees. Each
 * building's colliders are its recipe pieces in world space (boxes, upright cylinders, rounded ellipsoids for domes,
 * canopies and pods, a box round anything else), so a hero's wings, domes and spires are solid and its plazas and
 * courtyards stay open. Ground cover, flowers, ivy and hollow rings are passable. Pieces overhang their footprint,
 * so queries look through the buildings round the point. Built per building on first touch and cached; call
 * `clear()` when buildings or terrain change. Wild trees come from the flora (trunk cylinders, canopy spheres).
 */

type Shape = 0 | 1 | 2 | 3; // box, upright cylinder, ellipsoid, hollow dome shell (D-132)
interface Part {
  inv: Matrix4;
  world: Matrix4;
  shape: Shape;
  /** Local bounds of the piece geometry, and the world-units-per-local-unit scale per axis. */
  min: Vector3;
  max: Vector3;
  sx: number;
  sy: number;
  sz: number;
  /** World AABB, for a quick reject. */
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** A door leaf (D-132): passable while its building's door is open. */
  door?: boolean;
  /** The lot's plinth: stepped onto from up to `PLINTH_STEP` below (D-132). */
  plinth?: boolean;
}
interface Solid {
  parts: Part[];
  /** Doorways (D-132): boxes through each door leaf, deep enough to cut through a hollow shell round it. */
  passages: Part[];
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

// Palms in a lot are passable: their crown's box would wall off the path under them (wild ones collide by trunk).
const PASSABLE = new Set(['palm', 'grass', 'flower', 'ivy', 'fungus', 'lily', 'koi', 'haloRing', 'willowArch', 'waterfall', 'sunPetal', 'alert']);
const ROUND = new Set(['glassCyl', 'concreteCyl', 'algaeTank', 'trunk', 'lumenRib', 'spireCone']);
const ROUNDED = new Set(['dome', 'canopy', 'bush', 'pod', 'drone']);
/** Glass skins with a room inside (D-132): only their surface is solid, so the steward can walk about under them. */
const HOLLOW = new Set(['glassDome']);
/** How far a doorway reaches either side of its door leaf (world units), and how much taller than the leaf it is. */
const PASSAGE_DEPTH = 1.2;
const PASSAGE_RISE = 1.3;
/** How far round a point to look for buildings whose pieces overhang their lots (tiles). */
const REACH = 5;

/** Wild trees per tile, flat: [x, z, ground, trunk height, trunk radius, canopy y, canopy radius] per tree. */
export type TreeLookup = (tile: number) => readonly number[] | undefined;
export const TREE_STRIDE = 7;

const _p = new Vector3();
const _c = new Vector3();

export function createCollider(city: City, trees?: TreeLookup, doorOpen?: (eid: number) => boolean) {
  const solids = new Map<number, Solid>();
  const partOf = (piece: string, world: Matrix4): Part => {
    const geo = getPiece(piece).geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const b = geo.boundingBox!;
    const e = world.elements;
    const part: Part = {
      inv: world.clone().invert(),
      world,
      shape: HOLLOW.has(piece) ? 3 : ROUND.has(piece) ? 1 : ROUNDED.has(piece) ? 2 : 0,
      min: b.min.clone(),
      max: b.max.clone(),
      sx: Math.hypot(e[0]!, e[1]!, e[2]!) || 1e-6,
      sy: Math.hypot(e[4]!, e[5]!, e[6]!) || 1e-6,
      sz: Math.hypot(e[8]!, e[9]!, e[10]!) || 1e-6,
      x0: Infinity,
      y0: Infinity,
      z0: Infinity,
      x1: -Infinity,
      y1: -Infinity,
      z1: -Infinity,
    };
    for (let i = 0; i < 8; i++) {
      _p.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(world);
      part.x0 = Math.min(part.x0, _p.x);
      part.y0 = Math.min(part.y0, _p.y);
      part.z0 = Math.min(part.z0, _p.z);
      part.x1 = Math.max(part.x1, _p.x);
      part.y1 = Math.max(part.y1, _p.y);
      part.z1 = Math.max(part.z1, _p.z);
    }
    return part;
  };
  const solidOf = (eid: number): Solid => {
    let s = solids.get(eid);
    if (s) return s;
    const r = city.buildingRecord(eid);
    const place = placeBuilding(city.grid, city.buildingDef(eid), r.x, r.z, r.rot);
    const parts: Part[] = [Object.assign(partOf('plinth', place.plinth.clone()), { plinth: true })];
    const passages: Part[] = [];
    for (const p of piecesAt(place.template, Building.tier[eid]!)) {
      if (PASSABLE.has(p.piece)) continue;
      const world = new Matrix4().multiplyMatrices(place.base, p.local);
      const part = partOf(p.piece, world);
      if (p.door) {
        part.door = true;
        // The leaf's own box, deepened through its thickness and a little taller (unit box: base at y = 0).
        const e = world.elements;
        const thick = Math.hypot(e[8]!, e[9]!, e[10]!) || 1e-3;
        passages.push(partOf('glassBox', world.clone().multiply(new Matrix4().makeScale(1, PASSAGE_RISE, (PASSAGE_DEPTH * 2) / thick))));
      }
      parts.push(part);
    }
    // Front steps up to a raised door (D-132): solid treads, each a rise the walker steps up.
    for (const m of doorSteps(city.grid, city.buildingDef(eid), place)) parts.push(partOf('slab', m));
    s = { parts, passages, x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    for (const p of parts) {
      s.x0 = Math.min(s.x0, p.x0);
      s.z0 = Math.min(s.z0, p.z0);
      s.x1 = Math.max(s.x1, p.x1);
      s.z1 = Math.max(s.z1, p.z1);
    }
    solids.set(eid, s);
    return s;
  };

  /** Buildings whose pieces may cover (x, z), deduplicated (reused between queries). */
  const near: number[] = [];
  const seen = new Set<number>();
  const buildingsNear = (x: number, z: number, r: number) => {
    const g = city.grid;
    near.length = 0;
    seen.clear();
    const [tx, tz] = [Math.floor(x), Math.floor(z)];
    for (let dz = -REACH; dz <= REACH; dz++)
      for (let dx = -REACH; dx <= REACH; dx++) {
        if (!g.inBounds(tx + dx, tz + dz)) continue;
        const eid = g.occupant[g.index(tx + dx, tz + dz)]!;
        if (eid === NO_ENTITY || seen.has(eid)) continue;
        seen.add(eid);
        const s = solidOf(eid);
        if (x + r >= s.x0 && x - r <= s.x1 && z + r >= s.z0 && z - r <= s.z1) near.push(eid);
      }
    return near;
  };

  /** Is (x, y, z), grown by `r`, inside the piece? Margins convert to local units per axis. */
  const inside = (p: Part, x: number, y: number, z: number, r: number) => {
    if (x + r < p.x0 || x - r > p.x1 || y + r < p.y0 || y - r > p.y1 || z + r < p.z0 || z - r > p.z1) return false;
    _p.set(x, y, z).applyMatrix4(p.inv);
    const [mx, my, mz] = [r / p.sx, r / p.sy, r / p.sz];
    const { min, max } = p;
    if (p.shape === 0)
      return _p.x >= min.x - mx && _p.x <= max.x + mx && _p.y >= min.y - my && _p.y <= max.y + my && _p.z >= min.z - mz && _p.z <= max.z + mz;
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;
    if (p.shape === 3) {
      // A hemispherical skin on its base: touching only near the surface, never inside or below it.
      if (_p.y < min.y - my) return false;
      const [hx, hy, hz] = [(max.x - min.x) / 2, max.y - min.y, (max.z - min.z) / 2];
      const d = Math.hypot((_p.x - cx) / hx, (_p.y - min.y) / hy, (_p.z - cz) / hz);
      const band = r / Math.min(hx * p.sx, hy * p.sy, hz * p.sz) + 0.02;
      return Math.abs(d - 1) <= band;
    }
    const rx = (max.x - min.x) / 2 + mx;
    const rz = (max.z - min.z) / 2 + mz;
    const u = ((_p.x - cx) / rx) ** 2 + ((_p.z - cz) / rz) ** 2;
    if (p.shape === 1) return u <= 1 && _p.y >= min.y - my && _p.y <= max.y + my;
    const cy = (min.y + max.y) / 2;
    const ry = (max.y - min.y) / 2 + my;
    return u + ((_p.y - cy) / ry) ** 2 <= 1;
  };
  /** Top surface of the piece over (x, z), or -Infinity if it doesn't cover the point. */
  const topOf = (p: Part, x: number, z: number) => {
    if (p.shape === 3 || x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return -Infinity;
    _p.set(x, p.y1, z).applyMatrix4(p.inv);
    const { min, max } = p;
    let ly = max.y;
    if (p.shape === 0) {
      if (_p.x < min.x || _p.x > max.x || _p.z < min.z || _p.z > max.z) return -Infinity;
    } else {
      const cx = (min.x + max.x) / 2;
      const cz = (min.z + max.z) / 2;
      const u = ((_p.x - cx) / ((max.x - min.x) / 2)) ** 2 + ((_p.z - cz) / ((max.z - min.z) / 2)) ** 2;
      if (u > 1) return -Infinity;
      if (p.shape === 2) ly = (min.y + max.y) / 2 + ((max.y - min.y) / 2) * Math.sqrt(1 - u);
    }
    return _c.set(_p.x, ly, _p.z).applyMatrix4(p.world).y;
  };

  /** Wild trees round (x, z): each tree's columns are passed to `fn` until it returns true. */
  const treesNear = (x: number, z: number, fn: (t: readonly number[], o: number) => boolean) => {
    if (!trees) return false;
    const g = city.grid;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const tx = Math.floor(x) + dx;
        const tz = Math.floor(z) + dz;
        if (!g.inBounds(tx, tz)) continue;
        const t = trees(g.index(tx, tz));
        if (!t) continue;
        for (let o = 0; o < t.length; o += TREE_STRIDE) if (fn(t, o)) return true;
      }
    return false;
  };

  /** True if a ball of radius `r` at (x, y, z) touches a building piece or a wild tree; `plinths` = false skips lots. */
  const hits = (x: number, y: number, z: number, r: number, plinths = true): boolean => {
    for (const eid of buildingsNear(x, z, r)) {
      const s = solids.get(eid)!;
      const open = s.passages.length > 0 && !!doorOpen?.(eid);
      const through = open && s.passages.some((q) => inside(q, x, y, z, 0));
      for (const p of s.parts) {
        if (open && (p.door || (through && p.shape === 3))) continue;
        if (!plinths && p.plinth) continue;
        if (inside(p, x, y, z, r)) return true;
      }
    }
    return treesNear(x, z, (t, o) => {
      const [tx, tz, g0, th, tr, cy, cr] = [t[o]!, t[o + 1]!, t[o + 2]!, t[o + 3]!, t[o + 4]!, t[o + 5]!, t[o + 6]!];
      if (y >= g0 && y <= g0 + th && (x - tx) ** 2 + (z - tz) ** 2 <= (tr + r) ** 2) return true;
      return (x - tx) ** 2 + (y - cy) ** 2 + (z - tz) ** 2 <= (cr + r) ** 2;
    });
  };

  /** Ground under (x, z) for feet at `feet`: terrain, a bridge deck, or the highest piece top within a step. */
  const groundAt = (x: number, z: number, feet: number): number => {
    const g = city.grid;
    if (!g.inBounds(Math.floor(x), Math.floor(z))) return g.heightAt(x, z);
    const t = g.index(Math.floor(x), Math.floor(z));
    let y = g.road[t] === BRIDGE ? BRIDGE_DECK + ROAD_LIFT : g.heightAt(x, z) + (g.road[t] ? ROAD_LIFT : 0);
    for (const eid of buildingsNear(x, z, 0))
      for (const p of solids.get(eid)!.parts) {
        const step = p.plinth ? PLINTH_STEP : STEP;
        if (p.y1 < y || p.y0 > feet + step) continue;
        const top = topOf(p, x, z);
        if (top <= feet + step && top > y) y = top;
      }
    return y;
  };

  /** True if a walker at (x, z) with feet at `feet` would be inside a wall, in deep water or off the map. */
  const blocked = (x: number, z: number, feet: number, swim: boolean, waterLevel: number): boolean => {
    const g = city.grid;
    if (x < 0.2 || z < 0.2 || x > g.w - 0.2 || z > g.h - 0.2) return true;
    if (!swim && g.heightAt(x, z) < waterLevel - 0.04 && g.road[g.index(Math.floor(x), Math.floor(z))] !== BRIDGE) return true;
    // Anything below the step height is climbable; one ball just above it spans the rest of a 0.22-tall body.
    // Stepping up onto a plinth: test the body from the ground it lands on, or the lot's own floor walls it off.
    // (Probed a body's radius round, so the plinth's edge counts as a step before the body is over it.)
    let up = Math.max(feet, groundAt(x, z, feet));
    for (const [ox, oz] of AROUND) up = Math.max(up, groundAt(x + ox * RADIUS, z + oz * RADIUS, feet));
    if (hits(x, up + STEP + RADIUS, z, RADIUS, false)) return true;
    // Plinths are front steps: only one taller than that walls the walker off.
    for (const eid of buildingsNear(x, z, RADIUS)) {
      const p = solids.get(eid)!.parts[0]!;
      if (inside(p, x, feet + PLINTH_STEP + RADIUS, z, RADIUS)) return true;
    }
    return false;
  };

  /**
   * How far along from → to a ball of radius `r` travels before touching something (0..1). For chase cameras:
   * the camera stops short of a wall instead of looking through it.
   */
  const reach = (from: Vector3, to: Vector3, r: number): number => {
    const len = from.distanceTo(to);
    const steps = Math.max(1, Math.ceil(len / Math.max(0.06, len / 40)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (hits(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t, r)) return (i - 1) / steps;
    }
    return 1;
  };

  return { groundAt, blocked, hits, reach, clear: () => solids.clear() };
}
