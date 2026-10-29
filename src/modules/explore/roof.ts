import { Box3, Matrix4, Vector3 } from 'three/webgpu';
import { getPiece } from '@/assets/kit/pieces';
import type { City } from '@/sim/City';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';
import { HERO_IDS } from '@/content/scenarios/founding-city';

/**
 * Rooftop explore mode (D-054): finds the walkable roof of a building from its cached recipe. Every flat solid
 * piece (slabs, boxes, drums, moss beds, pools) is projected onto a fine grid over the footprint; the roof is the
 * highest level whose connected flat area is big enough to stroll on (a spire's tip is not), less any cell with
 * something in the way at body height (a spire's cone, petals, trunks), eroded by one cell so the steward never
 * stands on the very edge. Movement is then held to that area; a building with no such roof is skipped.
 */

/** Grid resolution (world units per cell) and the least roof area worth standing on. */
const RES = 0.08;
const MIN_AREA = 0.8;
/** Height band that counts as one level (steps within it are walkable). */
const BAND = 0.16;
const FLAT = new Set(['slab', 'plinth', 'glassBox', 'mossBox', 'timberBox', 'pool']);
const ROUND = new Set(['glassCyl', 'concreteCyl']);
/** Pieces that never block a stroll: ground cover, rings overhead or round the rim, canopies above head height. */
const PASSABLE = new Set([
  'grass',
  'flower',
  'ivy',
  'fungus',
  'lily',
  'koi',
  'haloRing',
  'canopy',
  'waterfall',
]);
/** Body height above the roof that has to be clear. */
const HEADROOM = 0.24;
/** A roof this close to the ground is a plaza, not a rooftop (about four storeys). */
const MIN_RISE = 1.2;

export interface Roof {
  eid: number;
  name: string;
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** Height per cell (NaN where nothing solid), and the walkable cells. */
  h: Float32Array;
  walk: Uint8Array;
  spawn: Vector3;
}

const _p = new Vector3();

export function findRoof(city: City, eid: number): Roof | null {
  const rec = city.buildingRecord(eid);
  const def = city.buildingDef(eid);
  const place = placeBuilding(city.grid, def, rec.x, rec.z, rec.rot);
  const [w, d] = city.footprint(def, rec.rot);
  const nx = Math.ceil(w / RES);
  const nz = Math.ceil(d / RES);
  const h = new Float32Array(nx * nz).fill(NaN);
  // Upright solid pieces in world space (tilted ones are ribs and petals, not floors).
  const parts: { inv: Matrix4; world: Matrix4; round: boolean }[] = [];
  // Everything else, as world boxes: obstacles where they reach into a roof's headroom.
  const others: Box3[] = [];
  for (const p of place.template.pieces) {
    const round = ROUND.has(p.piece);
    const world = new Matrix4().multiplyMatrices(place.base, p.local);
    if (!round && !FLAT.has(p.piece)) {
      if (PASSABLE.has(p.piece)) continue;
      const geo = getPiece(p.piece).geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      others.push(geo.boundingBox!.clone().applyMatrix4(world));
      continue;
    }
    const e = world.elements;
    const sy = Math.hypot(e[4]!, e[5]!, e[6]!);
    if (sy < 0.02 || Math.abs(e[5]!) / sy < 0.98) continue;
    parts.push({ inv: new Matrix4().copy(world).invert(), world, round });
  }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = rec.x + (i + 0.5) * RES;
      const z = rec.z + (j + 0.5) * RES;
      let top = NaN;
      for (const part of parts) {
        _p.set(x, 0, z).applyMatrix4(part.inv);
        const inside = part.round
          ? _p.x * _p.x + _p.z * _p.z <= 0.25
          : Math.abs(_p.x) <= 0.5 && Math.abs(_p.z) <= 0.5;
        if (!inside) continue;
        const y = _p.set(_p.x, 1, _p.z).applyMatrix4(part.world).y;
        if (!(y <= top)) top = y;
      }
      h[j * nx + i] = top;
    }

  // Levels from the top down: the first with a connected flat area of MIN_AREA wins (its largest piece).
  const levels = [...new Set([...h].filter((v) => v === v).map((v) => Math.round(v / 0.05) * 0.05))].sort(
    (a, b) => b - a,
  );
  const comp = new Int32Array(nx * nz);
  const free = new Uint8Array(nx * nz);
  const baseY = place.base.elements[13]!;
  for (const level of levels.slice(0, 60)) {
    if (level - baseY < MIN_RISE) break;
    comp.fill(-1);
    // Headroom at this level: no other piece reaching into [level, level + HEADROOM] over the cell.
    free.fill(1);
    const lo = level + 0.03;
    const hi = level + HEADROOM;
    for (const b of others) {
      if (b.max.y < lo || b.min.y > hi) continue;
      const i0 = Math.max(0, Math.floor((b.min.x - rec.x) / RES));
      const i1 = Math.min(nx - 1, Math.floor((b.max.x - rec.x) / RES));
      const j0 = Math.max(0, Math.floor((b.min.z - rec.z) / RES));
      const j1 = Math.min(nz - 1, Math.floor((b.max.z - rec.z) / RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) free[j * nx + i] = 0;
    }
    const ok = (c: number) => free[c] === 1 && Math.abs(h[c]! - level) <= BAND;
    let best: number[] = [];
    for (let s = 0; s < nx * nz; s++) {
      if (comp[s] !== -1 || !ok(s)) continue;
      const cells: number[] = [s];
      comp[s] = s;
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k]!;
        const ci = c % nx;
        for (const n of [ci > 0 ? c - 1 : -1, ci < nx - 1 ? c + 1 : -1, c - nx, c + nx]) {
          if (n < 0 || n >= nx * nz || comp[n] !== -1 || !ok(n)) continue;
          comp[n] = s;
          cells.push(n);
        }
      }
      if (cells.length > best.length) best = cells;
    }
    if (best.length * RES * RES < MIN_AREA) continue;
    // Erode by one cell so feet stay on the roof, not its rim.
    const inArea = new Uint8Array(nx * nz);
    for (const c of best) inArea[c] = 1;
    const walk = new Uint8Array(nx * nz);
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (const c of best) {
      const ci = c % nx;
      const cj = (c / nx) | 0;
      if (ci === 0 || cj === 0 || ci === nx - 1 || cj === nz - 1) continue;
      if (!inArea[c - 1] || !inArea[c + 1] || !inArea[c - nx] || !inArea[c + nx]) continue;
      walk[c] = 1;
      sx += ci;
      sz += cj;
      n++;
    }
    // A ledge that erodes to a sliver isn't a roof to stroll: try the next level down.
    if (n * RES * RES < MIN_AREA * 0.75) continue;
    // Spawn on the walkable cell nearest the area's centre.
    const [cx, cz] = [sx / n, sz / n];
    let spawn = -1;
    let bd = Infinity;
    for (let c = 0; c < nx * nz; c++) {
      if (!walk[c]) continue;
      const dd = ((c % nx) - cx) ** 2 + (((c / nx) | 0) - cz) ** 2;
      if (dd < bd) [bd, spawn] = [dd, c];
    }
    const roof: Roof = { eid, name: def.name, x0: rec.x, z0: rec.z, nx, nz, h, walk, spawn: new Vector3() };
    roof.spawn.set(rec.x + ((spawn % nx) + 0.5) * RES, h[spawn]!, rec.z + (((spawn / nx) | 0) + 0.5) * RES);
    return roof;
  }
  return null;
}

/** Roof height at (x, z) if it's walkable, else null. */
export function roofAt(r: Roof, x: number, z: number): number | null {
  const i = Math.floor((x - r.x0) / RES);
  const j = Math.floor((z - r.z0) / RES);
  if (i < 0 || j < 0 || i >= r.nx || j >= r.nz) return null;
  const c = j * r.nx + i;
  return r.walk[c] ? r.h[c]! : null;
}

const HEROES = new Set(HERO_IDS);

/**
 * Landmarks worth standing on, at least 4 tall: the hero district's buildings, the city's landmark, and any other
 * one-of-a-kind building at least 6 tiles across (not everyday utilities like Pod Interchanges).
 */
export function rooftopCandidates(city: City): number[] {
  const out: number[] = [];
  for (const eid of city.buildingEntities()) {
    const def = city.buildingDef(eid);
    const big = def.variants === 1 && Math.max(def.footprint[0], def.footprint[1]) >= 6;
    if (!(HEROES.has(def.id) || def.landmark || big) || def.transit?.rail) continue;
    const rec = city.buildingRecord(eid);
    if (placeBuilding(city.grid, def, rec.x, rec.z, rec.rot).template.height < 4) continue;
    out.push(eid);
  }
  return out;
}
