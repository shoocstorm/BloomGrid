import { Matrix4, Raycaster, Vector2, Vector3, type Box3, type Object3D } from 'three/webgpu';
import type { GameContext } from '@/game/context';
import { Building } from '@/ecs/components';
import { BRIDGE, BRIDGE_DECK } from '@/sim/City';
import { NO_ENTITY } from '@/sim/Grid';
import { bridgeAt, bridgeType, type BridgeRecord } from '@/sim/bridges';
import type { GroundHit } from '@/world/Picking';
import { isTouchDevice } from '@/platform/device';
import type { BuildingRenderer } from './BuildingRenderer';

/** What a click or tap lands on (D-129). */
export type ObjectHit =
  | { kind: 'building'; eid: number }
  | { kind: 'bridge'; bridge: BridgeRecord; tile: number }
  | { kind: 'road'; tile: number }
  | { kind: 'object'; object: string };

/**
 * A moving or free-standing thing a click can land on besides buildings and bridges (the cruise ferry and its pier,
 * the Sky Guard jet, D-141): a box in `node`'s local frame (unscaled), tested against the ray in that frame, and
 * the object key the inspector opens (`selection:changed` with `object`). `pad` widens the box (a fast jet).
 */
export interface PickableObject {
  object: string;
  node: Object3D;
  box: Box3;
  pad?: number;
}
const pickables: PickableObject[] = [];
/** Adds a free-standing object to the forgiving picks (D-141). */
export function registerPickable(p: PickableObject): void {
  pickables.push(p);
}

const ray = new Raycaster();
const ndc = new Vector2();
const inv = new Vector3();
const _m = new Matrix4();
const _o = new Vector3();
const _d = new Vector3();
/** Tallest thing in the city (tiles): the march starts where the ray drops below it. */
const CEILING = 70;

/** Ray / axis-aligned box: entry distance, or Infinity when it misses. */
function slab(
  o: Vector3,
  id: Vector3,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): number {
  let tmin = 0;
  let tmax = Infinity;
  for (const [ov, iv, a, b] of [
    [o.x, id.x, x0, x1],
    [o.y, id.y, y0, y1],
    [o.z, id.z, z0, z1],
  ] as const) {
    let t1 = (a - ov) * iv;
    let t2 = (b - ov) * iv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

/** Height of a bridge's tallest structure over its deck (towers, arches, cables), as the renderer builds it. */
function bridgeTop(b: BridgeRecord): number {
  const L = b.len;
  const t = bridgeType(b);
  if (t === 'suspension') return BRIDGE_DECK + Math.min(15, 6 + L * 0.09) + 1.5;
  if (t === 'stayed') return BRIDGE_DECK + Math.min(16, 5 + L * 0.3) + 1;
  if (t === 'arch') return BRIDGE_DECK + Math.min(9, 2.5 + L * 0.3) + 0.5;
  if (t === 'helix') return BRIDGE_DECK + 2.2;
  return BRIDGE_DECK + 0.8;
}

/**
 * Forgiving object picking (D-129). A building is hit anywhere on its drawn volume (roof, upper floors, not just
 * the ground tile under the cursor), a bridge anywhere on its deck, towers or cables. The pointer's ray is walked
 * tile by tile from where it drops below the city's tallest structure to the ground; at each tile the buildings
 * and bridges on it and its neighbours are tested as boxes padded by a margin that grows with the camera
 * distance (a few pixels on screen), and the nearest along the ray wins. A miss falls back to the ground tile,
 * then to the nearest building or bridge within that margin of the ground point; then a highway tile.
 */
export function pickObject(
  ctx: GameContext,
  renderer: BuildingRenderer,
  ground: GroundHit | null,
): ObjectHit | null {
  const { city, camera } = ctx;
  const g = city.grid;
  ndc.set(ctx.input.pointer.nx, ctx.input.pointer.ny);
  ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin;
  const d = ray.ray.direction;
  inv.set(1 / d.x, 1 / d.y, 1 / d.z);
  // About 6 px on screen (a fingertip's worth, twice that, on touch screens), never less than a sixth of a tile
  // nor more than a tile and a half (three on touch).
  const touch = isTouchDevice() ? 2 : 1;
  const pad = Math.min(1.5 * touch, Math.max(0.16, ctx.cameraCtl.distance * 0.006) * touch);

  let best = Infinity;
  let hit: ObjectHit | null = null;
  const seenB = new Set<number>();
  const seenBr = new Set<BridgeRecord>();
  const testTile = (tx: number, tz: number) => {
    if (!g.inBounds(tx, tz)) return;
    const t = g.index(tx, tz);
    const eid = g.occupant[t]!;
    if (eid !== NO_ENTITY && !seenB.has(eid)) {
      seenB.add(eid);
      const v = renderer.verticalExtent(eid);
      if (v) {
        const [x0, z0] = [Building.x[eid]!, Building.z[eid]!];
        const s = slab(
          o,
          inv,
          x0 - pad,
          v.y0,
          z0 - pad,
          x0 + Building.w[eid]! + pad,
          v.y1 + pad,
          z0 + Building.d[eid]! + pad,
        );
        if (s < best) [best, hit] = [s, { kind: 'building', eid }];
      }
    }
    if (g.road[t] === BRIDGE) {
      const b = bridgeAt(city, t);
      if (b && !seenBr.has(b)) {
        seenBr.add(b);
        const [w, dd] = b.alongX ? [b.len, 1] : [1, b.len];
        const wide = 0.35 + pad;
        const [x0, z0, x1, z1] = b.alongX
          ? [b.x - pad, b.z - wide, b.x + w + pad, b.z + 1 + wide]
          : [b.x - wide, b.z - pad, b.x + 1 + wide, b.z + dd + pad];
        const s = slab(o, inv, x0, -0.5, z0, x1, bridgeTop(b) + pad, z1);
        if (s < best) {
          // The deck tile under the hit, for the selection's anchor.
          const p = o.clone().addScaledVector(d, s);
          const k = Math.max(0, Math.min(b.len - 1, Math.floor(b.alongX ? p.x - b.x : p.z - b.z)));
          best = s;
          hit = { kind: 'bridge', bridge: b, tile: b.alongX ? g.index(b.x + k, b.z) : g.index(b.x, b.z + k) };
        }
      }
    }
  };

  // Free-standing objects (D-141): the ray in each one's own frame against its box.
  for (const p of pickables) {
    if (!p.node.visible || !p.node.parent) continue;
    _m.copy(p.node.matrixWorld).invert();
    _o.copy(o).applyMatrix4(_m);
    _d.copy(d).transformDirection(_m);
    const q = pad + (p.pad ?? 0);
    const b = p.box;
    const s = slab(_o, inv.set(1 / _d.x, 1 / _d.y, 1 / _d.z), b.min.x - q, b.min.y - q, b.min.z - q, b.max.x + q, b.max.y + q, b.max.z + q);
    if (s < best) [best, hit] = [s, { kind: 'object', object: p.object }];
  }
  inv.set(1 / d.x, 1 / d.y, 1 / d.z);

  // March the ray's ground track tile by tile, from below the ceiling to the ground (or the map's far side).
  const tStart = d.y < 0 ? Math.max(0, (o.y - CEILING) / -d.y) : 0;
  const tEnd = ground ? o.distanceTo(ground.point) + 2 : tStart + 400;
  const step = 0.5;
  let lastKey = -1;
  for (let s = tStart; s <= tEnd && s < best; s += step) {
    const x = Math.floor(o.x + d.x * s);
    const z = Math.floor(o.z + d.z * s);
    const key = z * 4096 + x;
    if (key === lastKey) continue;
    lastKey = key;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) testTile(x + dx, z + dz);
  }
  if (hit) return hit;
  if (!ground?.inBounds) return null;

  // Missed every volume: what is on the ground tile, else the nearest building or bridge within the margin.
  const gx = ground.point.x;
  const gz = ground.point.z;
  const R = Math.ceil(pad);
  let near = Infinity;
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      const [tx, tz] = [ground.tx + dx, ground.tz + dz];
      if (!g.inBounds(tx, tz)) continue;
      const t = g.index(tx, tz);
      const eid = g.occupant[t]!;
      const isBridge = g.road[t] === BRIDGE;
      if (eid === NO_ENTITY && !isBridge) continue;
      // Distance from the ground point to this tile's square.
      const ex = Math.max(tx - gx, 0, gx - (tx + 1));
      const ez = Math.max(tz - gz, 0, gz - (tz + 1));
      const dist = Math.hypot(ex, ez);
      if (dist > pad || dist >= near) continue;
      near = dist;
      if (eid !== NO_ENTITY) hit = { kind: 'building', eid };
      else {
        const b = bridgeAt(city, t);
        hit = b ? { kind: 'bridge', bridge: b, tile: t } : null;
      }
    }
  if (hit) return hit;
  const t = g.index(ground.tx, ground.tz);
  return g.road[t] ? { kind: 'road', tile: t } : null;
}
