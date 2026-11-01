import type { AgentTool } from '@/core/AgentTools';
import { Building, Service } from '@/ecs/components';
import type { ActionCtx } from './actionTools';
import { buildingId, getObject } from './inventory';

/**
 * Switches for the city assistant (D-075): feather wind turbines (e.g. before a storm), pause a factory, and back.
 * One building by id, or every switchable building of a type. Each change is an undoable command.
 */
export const switchTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'switch_building',
    option: 'Switch a building off or on (feather turbines, pause a factory)',
    description:
      'Switches buildings that have a switch off or on: wind turbines are feathered (no power, but storms and lightning barely touch them), a fireworks factory pauses production. One building by `id`, or every one of a `type` (e.g. "wind-turbine"). `on` = true switches back on.',
    keywords: [
      'switch',
      'turn off',
      'turn on',
      'feather',
      'pause',
      'resume',
      'shut down',
      'turbine',
      'storm',
    ],
    llmArgs: ['id', 'type', 'on'],
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'A building id, e.g. "NRG-0042".' },
        type: { type: 'string', description: 'A building type id, e.g. "wind-turbine".' },
        on: { type: 'boolean', description: 'true = switch on, false (default) = switch off.' },
      },
    },
    effect: 'mutate',
    run({ city, commands }, { id, type, on = false }: { id?: string; type?: string; on?: boolean }) {
      let list: number[];
      if (id) {
        const o = getObject(city, id);
        if (!o || o.ref.eid === undefined) throw new Error(`No building "${id}"`);
        list = [o.ref.eid];
      } else if (type) list = city.buildingEntities().filter((e) => city.buildingDef(e).id === type);
      else throw new Error('Give an id or a type.');
      list = list.filter((e) => city.buildingDef(e).interact);
      if (!list.length) throw new Error('None of those has a switch.');
      const done = list.filter(
        (e) =>
          (Service.off[e] === 1) === on &&
          commands.execute('toggleBuilding', { x: Building.x[e]!, z: Building.z[e]!, off: !on }),
      );
      return {
        switched: on ? 'on' : 'off',
        buildings: done.slice(0, 12).map((e) => buildingId(city, e)),
        count: done.length,
      };
    },
  },
];
