import type { AgentTool } from '@/core/AgentTools';
import { Building, Service } from '@/ecs/components';
import type { ActionCtx } from './actionTools';
import { buildingId, getObject } from './inventory';
import { DAY_LENGTH } from './pulseConst';
import { ageDays, renovateCost, upgradeBlocker, upgradeCost } from './levels';
import type { City } from './City';

/**
 * Level and ageing tools for the city assistant (D-073): grow a building a level now, and renovate old or worn
 * buildings (one by id, or the oldest in a district or the city). Changes run undoable commands.
 */
const inDistrict = (city: City, e: number, district?: string) => {
  if (!district) return true;
  const x = Math.floor(Building.x[e]! + Building.w[e]! / 2);
  const z = Math.floor(Building.z[e]! + Building.d[e]! / 2);
  return city.districtAt(x, z)?.toLowerCase() === district.toLowerCase();
};

export const levelTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'upgrade_building',
    option: 'Upgrade a building to its next level now',
    description:
      'Grows a home or workplace to its next level now (levels 1–3: more residents or jobs and output, more upkeep) instead of waiting for it to thrive. Costs 60% of its price at level 1, 100% at level 2. Undoable.',
    keywords: ['upgrade', 'level', 'level up', 'grow', 'expand', 'bigger'],
    llmArgs: ['id'],
    input: {
      type: 'object',
      properties: { id: { type: 'string', description: 'A building id, e.g. "LIV-0042".' } },
      required: ['id'],
    },
    effect: 'mutate',
    run({ city, commands }, { id }: { id: string }) {
      const o = getObject(city, id);
      if (!o || o.ref.eid === undefined) throw new Error(`No building "${id}"`);
      const e = o.ref.eid;
      const why = upgradeBlocker(city, e);
      if (why) throw new Error(why);
      const cost = upgradeCost(city, e);
      if (!commands.execute('upgradeBuilding', { x: Building.x[e]!, z: Building.z[e]! }))
        throw new Error('Could not upgrade.');
      return { id, level: Building.tier[e]! + 1, cost, credits: Math.round(city.credits) };
    },
  },
  {
    name: 'renovate',
    option: 'Renovate old or worn buildings',
    description:
      'Renovates buildings: age and weathering reset, condition restored, so upkeep falls back. One by id, or the oldest (up to `limit`, default 5) in a district or the city. Each is undoable.',
    keywords: ['renovate', 'refurbish', 'old', 'aging', 'ageing', 'weathered', 'worn', 'upkeep'],
    llmArgs: ['id', 'district'],
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'A building id, e.g. "LIV-0042".' },
        district: { type: 'string', description: 'Renovate within this district.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'How many at most (default 5).' },
      },
    },
    effect: 'mutate',
    run({ city, commands }, { id, district, limit = 5 }: { id?: string; district?: string; limit?: number }) {
      let list: number[];
      if (id) {
        const o = getObject(city, id);
        if (!o || o.ref.eid === undefined) throw new Error(`No building "${id}"`);
        list = [o.ref.eid];
      } else
        list = city
          .buildingEntities()
          .filter(
            (e) =>
              (Service.age[e]! >= DAY_LENGTH * 0.5 || Service.condition[e]! < 0.95) &&
              inDistrict(city, e, district),
          )
          .sort((a, b) => Service.age[b]! - Service.age[a]! || a - b)
          .slice(0, limit);
      if (!list.length) throw new Error('Nothing needs renovating yet.');
      const done: { id: string; ageDays: number; cost: number }[] = [];
      for (const e of list) {
        const cost = renovateCost(city, e);
        const age = ageDays(e);
        if (commands.execute('renovate', { x: Building.x[e]!, z: Building.z[e]! }))
          done.push({ id: buildingId(city, e), ageDays: Math.round(age * 10) / 10, cost });
      }
      if (!done.length) throw new Error('Could not renovate: credits may be short.');
      return {
        renovated: done,
        total: done.reduce((a, d) => a + d.cost, 0),
        credits: Math.round(city.credits),
      };
    },
  },
];
