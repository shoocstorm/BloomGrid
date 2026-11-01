import type { AgentTool } from '@/core/AgentTools';
import type { CommandRecord } from '@/core/Commands';
import { Building, Service } from '@/ecs/components';
import type { City } from './City';
import { resolveType, type ActionCtx } from './actionTools';
import { buildingId, filterObjects, listObjects } from './inventory';
import { DAY_LENGTH } from './pulseConst';
import { renovateCost, upgradeBlocker, upgradeCost } from './levels';
import { isRuined, repairCost } from './hazards';

/**
 * Bulk building actions for the city assistant (D-091): "turn on all wind turbines", "renovate every Canopy Tower
 * in Westbrook", "upgrade the old homes in Bayfront". One tool picks the buildings (a type, a district, an
 * inventory query, or any mix) and does one thing to all of them as a single `batch` command, so ⌘Z undoes the
 * lot at once. Buildings an action doesn't apply to (already on, nothing to renovate, credits short) are skipped
 * and counted. Hosts ask the steward first (`mutate`).
 */

export const BULK_ACTIONS = ['turn_on', 'turn_off', 'renovate', 'upgrade', 'repair', 'return_to_nature'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

/** The action a request plainly names (small models are held to it). */
export function actionIn(request: string): BulkAction | null {
  const r = request.toLowerCase();
  if (/\b(turn|switch|power|start) (them |it )?(back )?on\b|\b(start|resume|restart|unfeather|unpause|reactivate)\b/.test(r)) return 'turn_on';
  if (/\b(turn|switch|power|shut) (them |it )?(off|down)\b|\b(stop|pause|feather|deactivate)\b/.test(r)) return 'turn_off';
  if (/\b(renovate|refurbish|modernise|modernize)\b/.test(r)) return 'renovate';
  if (/\b(upgrade|level up|level-up)\b/.test(r)) return 'upgrade';
  if (/\b(repair|rebuild|restore)\b/.test(r)) return 'repair';
  if (/\b(demolish|bulldoze|tear down|knock down|remove|return .* to nature)\b/.test(r)) return 'return_to_nature';
  return null;
}

/** An inventory filter the request's own words ask for ("the old homes", "damaged towers"), or null. */
export function queryIn(request: string): string | null {
  const r = request.toLowerCase();
  if (/\b(old|older|oldest|aged|ageing|aging)\b/.test(r)) return 'is:old';
  if (/\bupgradable|upgradeable|can (be )?upgraded?\b/.test(r)) return 'is:upgradable';
  if (/\b(critical|failing|broken)\b/.test(r)) return 'status:critical';
  if (/\b(worn|neglected|run-?down|shabby)\b/.test(r)) return 'issue:worn';
  if (/\b(unpowered|without power|no power|blacked out)\b/.test(r)) return 'issue:no-power';
  return null;
}

/** Buildings a type, a district and an inventory query (each optional) all agree on, in id order. */
export function pickBuildings(city: City, a: { type?: string; district?: string; query?: string }): number[] {
  let list: number[] = [...city.buildingEntities()];
  if (a.type) {
    const def = resolveType(a.type);
    list = list.filter((e) => city.buildingDef(e).id === def.id);
  }
  if (a.district) {
    const d = city.districts.find((x) => x.name.toLowerCase() === a.district!.trim().toLowerCase());
    if (!d) throw new Error(`No district "${a.district}". Districts: ${city.districts.map((x) => x.name).join(', ')}`);
    list = list.filter((e) => {
      const cx = Building.x[e]! + Building.w[e]! / 2;
      const cz = Building.z[e]! + Building.d[e]! / 2;
      return cx >= d.x0 && cx <= d.x1 + 1 && cz >= d.z0 && cz <= d.z1 + 1;
    });
  }
  if (a.query?.trim()) {
    const hit = new Set(
      filterObjects(listObjects(city, 'building'), { text: a.query, limit: 5000 }).items.map((o) => o.ref.eid),
    );
    list = list.filter((e) => hit.has(e));
  }
  return list.sort((x, y) => Building.uid[x]! - Building.uid[y]!);
}

const at = (e: number) => ({ x: Building.x[e]!, z: Building.z[e]! });

/** Whether the action applies to a building, or why not; and the command that does it. */
function plan(city: City, action: BulkAction, e: number): { skip: string } | { cmd: CommandRecord; cost: number } {
  const def = city.buildingDef(e);
  switch (action) {
    case 'turn_on':
    case 'turn_off': {
      if (!def.interact) return { skip: 'has no switch' };
      const off = Service.off[e] === 1;
      if (action === 'turn_on' ? !off : off) return { skip: action === 'turn_on' ? 'already on' : 'already off' };
      return { cmd: { type: 'toggleBuilding', payload: { ...at(e), off: action === 'turn_off' } }, cost: 0 };
    }
    case 'renovate':
      if (Service.age[e]! < DAY_LENGTH * 0.5 && Service.condition[e]! >= 0.95 && !Service.scorch[e]) return { skip: 'like new already' };
      return { cmd: { type: 'renovate', payload: at(e) }, cost: renovateCost(city, e) };
    case 'upgrade': {
      const why = upgradeBlocker(city, e);
      if (why) return { skip: why.replace(/\.$/, '').toLowerCase() };
      return { cmd: { type: 'upgradeBuilding', payload: at(e) }, cost: upgradeCost(city, e) };
    }
    case 'repair':
      if (!isRuined(city, e) && Service.condition[e]! >= 0.98 && !Service.scorch[e]) return { skip: 'not damaged' };
      return { cmd: { type: 'repair', payload: at(e) }, cost: repairCost(city, e) };
    case 'return_to_nature':
      return { cmd: { type: 'demolish', payload: at(e) }, cost: 0 };
  }
}

const VERB: Record<BulkAction, string> = {
  turn_on: 'switched on',
  turn_off: 'switched off',
  renovate: 'renovated',
  upgrade: 'upgraded',
  repair: 'repaired',
  return_to_nature: 'returned to nature',
};

export const bulkTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'act_on_buildings',
    option: 'Act on many buildings at once (all of a type or district): turn on/off, renovate, upgrade, repair',
    description:
      'Applies one action to every building matching a type, a district and/or an inventory query (e.g. type "wind-turbine"; type "canopy-tower" + district "Westbrook"; query "is:old"): turn_on / turn_off (wind turbines are feathered when off; factories pause), renovate (age and wear reset), upgrade (next level), repair (damage and ruins), return_to_nature (demolish). Buildings it does not apply to are skipped and counted; credits are spent in order until they run out. One undo reverts the whole change.',
    keywords: ['all', 'every', 'each', 'turn on', 'turn off', 'start', 'stop', 'switch', 'renovate', 'upgrade', 'repair', 'bulk', 'turbines', 'towers'],
    llmArgs: ['action', 'type', 'district', 'query'],
    input: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: BULK_ACTIONS },
        type: { type: 'string', description: 'Building type id or name, e.g. "wind-turbine", "canopy-tower".' },
        district: { type: 'string', description: 'Only buildings in this district, e.g. "Westbrook".' },
        query: { type: 'string', description: 'Inventory filter, e.g. "is:old", "status:critical", "issue:power".' },
        limit: { type: 'integer', minimum: 1, maximum: 2000, description: 'At most this many (default: all).' },
      },
      required: ['action'],
    },
    effect: 'mutate',
    // Small models fill every optional field (a district from the brief, a query of their own), and every
    // extra filter narrows the match to nothing. So the request decides: the action it names, a district or type
    // only when it names one (the host pins those), and a query only from filter words it uses.
    narrow(schema, { request }) {
      const props = { ...schema.properties };
      const a = actionIn(request);
      if (a) props.action = { ...props.action, enum: [a] };
      const named = (k: string) => (props[k]?.enum?.length ?? Infinity) <= 3;
      if (!named('district')) delete props.district;
      if (!named('type') && (a === 'turn_on' || a === 'turn_off')) delete props.type;
      const q = queryIn(request);
      if (q) props.query = { ...props.query, enum: [q] };
      else delete props.query;
      return { ...schema, properties: props };
    },
    run(
      { city, commands },
      a: { action: BulkAction; type?: string; district?: string; query?: string; limit?: number },
    ) {
      const switching = a.action === 'turn_on' || a.action === 'turn_off';
      if (!a.type && !a.district && !a.query && !switching)
        throw new Error('Name a building type, a district or an inventory query, so I know which buildings.');
      let list = pickBuildings(city, a);
      if (switching && !a.type) list = list.filter((e) => city.buildingDef(e).interact);
      if (!list.length) throw new Error('No buildings match that.');
      const matched = list.length;
      if (a.limit) list = list.slice(0, a.limit);
      const skipped: Record<string, number> = {};
      const todo: { e: number; cmd: CommandRecord }[] = [];
      let budget = city.credits;
      for (const e of list) {
        const p = plan(city, a.action, e);
        if ('skip' in p) {
          skipped[p.skip] = (skipped[p.skip] ?? 0) + 1;
          continue;
        }
        if (p.cost > budget) {
          skipped['credits short'] = (skipped['credits short'] ?? 0) + 1;
          continue;
        }
        budget -= p.cost;
        todo.push({ e, cmd: p.cmd });
      }
      if (!todo.length)
        throw new Error(`Nothing to do for ${matched} building${matched === 1 ? '' : 's'}: ${Object.entries(skipped).map(([k, n]) => `${n} ${k}`).join(', ')}.`);
      // Ids before the change: returning buildings to nature removes them.
      const ids = todo.map((t) => buildingId(city, t.e));
      const before = city.credits;
      if (!commands.execute('batch', todo.map((t) => t.cmd))) throw new Error('The city refused every change.');
      const applied = commands.lastBatch ?? todo.map((_, i) => i);
      const failed = todo.length - applied.length;
      if (failed) skipped['refused'] = failed;
      const done = applied.map((i) => ids[i]!);
      // The count leads (a small model once read a truncated id list as the total).
      return {
        done: `${done.length} of ${matched} ${VERB[a.action]}`,
        count: done.length,
        action: a.action,
        [a.action === 'return_to_nature' ? 'removed' : 'affected']: done.slice(0, 8),
        ...(Object.keys(skipped).length ? { skipped } : {}),
        cost: Math.round(before - city.credits),
        credits: Math.round(city.credits),
        undo: 'One ⌘Z (or "undo") reverts all of it.',
      };
    },
  },
];
