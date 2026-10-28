import type { AgentTool } from '@/core/AgentTools';
import { Building, Service } from '@/ecs/components';
import type { ActionCtx } from './actionTools';
import { getCrisis } from './crises';
import { RESPONSE_COST, clockLabel, eidOfUid, isRuined, repairCost } from './hazards';
import { buildingId, getObject } from './inventory';
import type { City } from './City';

/**
 * Incident tools for the city assistant and scripts (D-050): what is burning, broken or ruined and what the
 * log says; dispatching crews; repairing damage. Plain JSON in and out; changes go through undoable commands.
 */

/** Damaged buildings, worst first: ruins, then the lowest condition. */
function damaged(city: City, district?: string): number[] {
  return city
    .buildingEntities()
    .filter((e) => {
      if (!isRuined(city, e) && Service.condition[e]! > 0.9) return false;
      if (!district) return true;
      const x = Math.floor(Building.x[e]! + Building.w[e]! / 2);
      const z = Math.floor(Building.z[e]! + Building.d[e]! / 2);
      return city.districtAt(x, z)?.toLowerCase() === district.toLowerCase();
    })
    .sort(
      (a, b) =>
        Number(isRuined(city, b)) - Number(isRuined(city, a)) ||
        Service.condition[a]! - Service.condition[b]! ||
        a - b,
    );
}

export const hazardTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'incident_status',
    option: 'Check fires, quake or storm damage, ruins and the incident log',
    description:
      'Emergencies right now: every fire (id, building, district, intensity, whether crews or an Ember Watch station are on it), active hazards (earthquake, thunderstorm, industrial fire and other crises), ruined and badly damaged buildings with repair costs, and the last few entries of the incident log with their losses.',
    keywords: [
      'fire',
      'fires',
      'burning',
      'earthquake',
      'quake',
      'lightning',
      'storm',
      'incident',
      'emergency',
      'damage',
      'damaged',
      'ruin',
      'ruins',
      'disaster',
      'hazard',
    ],
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      const st = city.steward;
      const fires = st.fires.map((f) => {
        const eid = eidOfUid(city, f.uid);
        return {
          fire: f.id,
          building: eid >= 0 ? buildingId(city, eid) : null,
          name: eid >= 0 ? city.buildingDef(eid).name : null,
          district: city.districtAt(Math.floor(f.x), Math.floor(f.z)) ?? 'Outskirts',
          intensity: `${Math.round(f.intensity * 100)}%`,
          crews: f.crew,
          cause: f.cause,
          burningFor: `${Math.round((city.tick - f.startTick) / 10)} s`,
        };
      });
      const hurt = damaged(city)
        .slice(0, 8)
        .map((e) => ({
          id: buildingId(city, e),
          name: city.buildingDef(e).name,
          state: isRuined(city, e) ? 'ruined' : `${Math.round(Service.condition[e]! * 100)}% condition`,
          repairCost: repairCost(city, e),
        }));
      return {
        fires,
        crewCost: RESPONSE_COST,
        hazards: st.crises.map((c) => ({
          name: getCrisis(c.def).name,
          phase: c.phase,
          district: c.x !== undefined ? city.districtAt(Math.floor(c.x), Math.floor(c.z!)) : null,
        })),
        ruins: st.ruins.length,
        damaged: hurt,
        recent: st.history
          .slice(-5)
          .reverse()
          .map((h) => ({
            when: clockLabel(h.startTick),
            what: h.name,
            where: h.district ?? 'Outskirts',
            outcome: h.outcome,
            ruined: h.lost,
            cost: h.cost,
          })),
      };
    },
  },
  {
    name: 'respond_incident',
    option: 'Dispatch fire crews to a fire, or to every fire',
    description: `Sends emergency crews to a fire by its fire number (see incident_status), or to every fire without crews when none is given. Crews beat a fire back quickly and stop it spreading. ${RESPONSE_COST} credits per fire. Undoable.`,
    keywords: ['fire', 'crews', 'dispatch', 'extinguish', 'put out', 'respond', 'emergency', 'firefighters'],
    llmArgs: ['fire'],
    input: {
      type: 'object',
      properties: {
        fire: {
          type: 'integer',
          minimum: 0,
          description: 'Fire number from incident_status; omit for all fires.',
        },
      },
    },
    effect: 'mutate',
    run({ city, commands }, { fire }: { fire?: number }) {
      const targets = city.steward.fires.filter((f) => !f.crew && (fire === undefined || f.id === fire));
      if (!targets.length)
        throw new Error(
          city.steward.fires.length ? 'Crews are already on every fire asked for.' : 'Nothing is burning.',
        );
      if (!commands.execute('respond', fire === undefined ? {} : { id: fire }))
        throw new Error(`Not enough credits: ${targets.length * RESPONSE_COST} needed.`);
      return {
        dispatched: targets.map((f) => f.id),
        cost: targets.length * RESPONSE_COST,
        credits: Math.round(city.credits),
      };
    },
  },
  {
    name: 'repair_damage',
    option: 'Repair or rebuild damaged and ruined buildings',
    description:
      'Repairs damaged buildings and rebuilds ruins (a ruin costs half its price, damage in proportion), worst first: one building by id, or up to `limit` (default 5) in a district or anywhere. Stops when credits run short. Each repair is undoable.',
    keywords: ['repair', 'rebuild', 'restore', 'fix damage', 'ruin', 'ruins', 'damaged'],
    llmArgs: ['id', 'district'],
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'A building id, e.g. "LIV-0042".' },
        district: { type: 'string', description: 'Repair within this district, e.g. "Bayfront".' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'How many buildings at most (default 5).',
        },
      },
    },
    effect: 'mutate',
    run({ city, commands }, { id, district, limit = 5 }: { id?: string; district?: string; limit?: number }) {
      let list: number[];
      if (id) {
        const o = getObject(city, id);
        if (!o || o.ref.eid === undefined) throw new Error(`No building "${id}"`);
        list = [o.ref.eid];
      } else list = damaged(city, district).slice(0, limit);
      if (!list.length)
        throw new Error(district ? `Nothing needs repair in ${district}.` : 'Nothing needs repair.');
      const repaired: { id: string; cost: number }[] = [];
      for (const e of list) {
        const cost = repairCost(city, e);
        if (!commands.execute('repair', { x: Building.x[e]!, z: Building.z[e]! })) continue;
        repaired.push({ id: buildingId(city, e), cost });
      }
      if (!repaired.length)
        throw new Error('Could not repair: a building may still be burning, or credits are short.');
      return { repaired, total: repaired.reduce((a, r) => a + r.cost, 0), credits: Math.round(city.credits) };
    },
  },
];
