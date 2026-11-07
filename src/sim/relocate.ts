/**
 * Relocation: the steward picks a standing building up and sets it down on another lot (Shift-drag in Inspect).
 * It keeps everything it has earned (serial id, level, age, greenery, retrofit or banyan), so moving beats
 * demolishing and rebuilding; it costs a fee instead of the build price. The new lot is graded like a fresh build,
 * and sky-bridges woven to a moved tower come down (undo weaves them back).
 */
import type { CommandStack } from '@/core/Commands';
import { buildings } from '@/content';
import { NO_ENTITY } from './Grid';
import type { BuildingRecord, City, PlacementResult } from './City';
import { setCorners } from './coast';
import { gradeLots } from './grading';
import { fireAt, isRuined } from './hazards';
import type { SkyBridge } from './weaver';
import type { SimCtx } from './systems';

/** Share of a building's cost that relocating it charges. */
export const MOVE_FEE = 0.1;

export const moveFee = (city: City, eid: number) => Math.round(city.buildingDef(eid).stats.cost * MOVE_FEE);

/** Bridges woven to the tower anchored at (x, z) (sky-bridges are keyed by their towers' anchors). */
const bridgesAt = (city: City, x: number, z: number) =>
  city.weaver.bridges.filter((b) => (b.ax === x && b.az === z) || (b.bx === x && b.bz === z));

/** Can building `eid` move to (x, z) facing `rot`? `bridges` counts the sky-bridges the move would take down. */
export function relocatePlan(
  city: City,
  eid: number,
  x: number,
  z: number,
  rot: number,
): PlacementResult & { fee: number; bridges: number } {
  const fee = moveFee(city, eid);
  if (isRuined(city, eid))
    return { ok: false, reason: 'A ruin must be repaired before it can move', fee, bridges: 0 };
  if (fireAt(city, eid)) return { ok: false, reason: 'Put the fire out first', fee, bridges: 0 };
  const r = city.buildingRecord(eid);
  if (r.x === x && r.z === z && r.rot === rot) return { ok: false, reason: 'Already here', fee, bridges: 0 };
  const res = city.checkPlacement(city.buildingDef(eid), x, z, rot, eid, fee);
  return { ...res, fee, bridges: bridgesAt(city, r.x, r.z).length };
}

export interface MovePayload {
  /** Any tile of the building to move. */
  from: [number, number];
  x: number;
  z: number;
  rot: number;
}

interface MoveUndo {
  record: BuildingRecord;
  fee: number;
  /** Sky-bridges taken down, with their places in the list (the hash reads it in order). */
  bridges: [number, SkyBridge][];
  corners: [number, number][];
  edits: [number, number | undefined][];
}

export function registerRelocateCommands(stack: CommandStack<SimCtx>): void {
  stack.register<MovePayload, MoveUndo>('move', {
    apply({ city }, p) {
      const eid = city.buildingAt(p.from[0], p.from[1]);
      if (eid === NO_ENTITY || !relocatePlan(city, eid, p.x, p.z, p.rot).ok) return null;
      const fee = moveFee(city, eid);
      const record = city.removeBuilding(eid);
      const down = bridgesAt(city, record.x, record.z);
      const bridges = down.map((b) => [city.weaver.bridges.indexOf(b), b] as [number, SkyBridge]);
      if (down.length) {
        city.weaver.bridges = city.weaver.bridges.filter((b) => !down.includes(b));
        city.bus.emit('weaver:changed', undefined);
      }
      city.credits -= fee;
      city.addSpend(city.addBuilding({ ...record, x: p.x, z: p.z, rot: p.rot }), fee);
      const [w, d] = city.footprint(buildings.get(record.def), p.rot);
      const grade = gradeLots(city, [{ x: p.x, z: p.z, w, d }]);
      const h = city.grid.heights;
      const undo: MoveUndo = {
        record,
        fee,
        bridges,
        corners: grade.map(([c]) => [c, h[c]!]),
        edits: grade.map(([c]) => [c, city.terrainEdits.get(c)]),
      };
      setCorners(city, grade);
      return undo;
    },
    revert({ city }, p, u) {
      const eid = city.buildingAt(p.x, p.z);
      if (eid === NO_ENTITY) return;
      city.removeBuilding(eid);
      setCorners(city, u.corners);
      for (const [c, e] of u.edits)
        if (e === undefined) city.terrainEdits.delete(c);
        else city.terrainEdits.set(c, e);
      city.addBuilding(u.record);
      city.credits += u.fee;
      if (u.bridges.length) {
        for (const [i, b] of u.bridges) city.weaver.bridges.splice(i, 0, b);
        city.bus.emit('weaver:changed', undefined);
      }
    },
  });
}
