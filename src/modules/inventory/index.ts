import type { GameContext, GameModule } from '@/game/context';
import {
  filterObjects,
  getObject,
  inspectObject,
  listObjects,
  summarize,
  type CityObject,
  type InventoryPage,
  type InventoryQuery,
  type InventorySummary,
  type ObjectInspection,
} from '@/sim/inventory';
import { inventoryTools } from '@/sim/inventoryTools';

/**
 * City inventory service: the sim inventory (`sim/inventory.ts`) plus the view actions a steward or an agent
 * takes on a result (fly the camera there, select it in the inspector). Registers the inventory agent tools and
 * the `camera_focus` / `object_select` view tools. The dashboard's Inventory tab is its UI.
 */
export interface InventoryService {
  /** Snapshot of every object (or some kinds). Rebuilt per call: snapshot once, then `filter`. */
  list(kind?: string | string[]): CityObject[];
  filter(objects: readonly CityObject[], q?: InventoryQuery): InventoryPage;
  query(q?: InventoryQuery): InventoryPage;
  summary(objects?: readonly CityObject[]): InventorySummary;
  get(id: string): CityObject | null;
  inspect(id: string): ObjectInspection | null;
  /** Flies the camera to the object; false when the id is unknown. */
  focus(id: string): boolean;
  /** Focuses and selects the object in the HUD inspector (buildings and networks). */
  select(id: string): boolean;
}

/** Camera distance that frames an object of footprint w × d (tiles). */
const frameDistance = (o: CityObject) => Math.min(260, Math.max(28, Math.max(o.w, o.d) * 1.6));

function createService(ctx: GameContext): InventoryService {
  const focus = (o: CityObject) => ctx.cameraCtl.flyTo(o.x, o.z, frameDistance(o));
  return {
    list: (kind) => listObjects(ctx.city, kind),
    filter: filterObjects,
    query: (q) => filterObjects(listObjects(ctx.city, q?.kind), q),
    summary: (objects) => summarize(objects ?? listObjects(ctx.city)),
    get: (id) => getObject(ctx.city, id),
    inspect: (id) => inspectObject(ctx.city, id),
    focus(id) {
      const o = getObject(ctx.city, id);
      if (o) focus(o);
      return !!o;
    },
    select(id) {
      const o = getObject(ctx.city, id);
      if (!o) return false;
      focus(o);
      if (o.ref.eid !== undefined && o.kind === 'building')
        ctx.bus.emit('selection:changed', { eid: o.ref.eid });
      else if (o.ref.tile !== undefined && ctx.city.grid.road[o.ref.tile])
        ctx.bus.emit('selection:changed', { eid: null, road: o.ref.tile });
      return true;
    },
  };
}

export const inventoryModule: GameModule = {
  id: 'inventory',
  deps: ['construction'],
  init(ctx) {
    const service = ctx.services.provide('inventory', createService(ctx));
    const agent = ctx.services.get('agent');
    for (const t of inventoryTools) agent.register(t);
    agent.register<{ id?: string; x?: number; z?: number; distance?: number }>({
      name: 'camera_focus',
      option: 'Point the camera at an object or place',
      description:
        'Flies the player camera to an object id, or to tile coordinates x / z (optionally at a distance in tiles, 20 close … 400 whole island).',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Object id from inventory_search.' },
          x: { type: 'number' },
          z: { type: 'number' },
          distance: { type: 'number', minimum: 10, maximum: 600 },
        },
      },
      effect: 'view',
      run(c, { id, x, z, distance }) {
        if (id) {
          if (!service.focus(id)) throw new Error(`No object "${id}"`);
          return { focused: id };
        }
        if (x === undefined || z === undefined) throw new Error('Give an id, or x and z');
        c.cameraCtl.flyTo(x, z, distance);
        return { focused: { x, z } };
      },
    });
    agent.register<{ id: string }>({
      name: 'object_select',
      option: 'Show the steward an object (fly the camera there and open it)',
      description:
        'Selects an object for the player: flies the camera to it and opens it in the HUD inspector.',
      input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      effect: 'view',
      run(_c, { id }) {
        if (!service.select(id)) throw new Error(`No object "${id}"`);
        return { selected: id };
      },
    });
  },
};

declare module '@/core/Services' {
  interface GameServices {
    inventory: InventoryService;
  }
}
