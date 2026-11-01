import type { CommandStack } from '@/core/Commands';
import { Building, Service } from '@/ecs/components';
import type { SimCtx } from './systems';

/**
 * Switches (Phase 19, D-075): buildings with `interact` on their def can be switched off and on. Off, a building
 * neither produces nor consumes, its staff go home and it doesn't wear; a feathered wind turbine also draws far
 * less lightning, and a paused fireworks factory makes no shells. Undoable; saved per building.
 */
export function registerSwitchCommands(stack: CommandStack<SimCtx>): void {
  stack.register<{ x: number; z: number; off?: boolean }, { uid: number; was: number }>('toggleBuilding', {
    apply({ city }, p) {
      const eid = city.buildingAt(p.x, p.z);
      if (eid < 0 || !city.buildingDef(eid).interact) return null;
      const was = Service.off[eid]!;
      const next = p.off === undefined ? 1 - was : p.off ? 1 : 0;
      if (next === was) return null;
      Service.off[eid] = next;
      city.bus.emit('building:switched', { eid, off: next === 1 });
      return { uid: Building.uid[eid]!, was };
    },
    revert({ city }, _p, u) {
      const eid = city.buildingByUid(u.uid);
      if (eid < 0) return;
      Service.off[eid] = u.was;
      city.bus.emit('building:switched', { eid, off: u.was === 1 });
    },
  });
}
