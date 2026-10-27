import type { AgentTool } from '@/core/AgentTools';
import { buildings } from '@/content';
import { CATEGORY_LABELS, type BuildingDef } from '@/content/types';
import { Building } from '@/ecs/components';
import { NO_ENTITY } from './Grid';
import type { City } from './City';
import type { SimCtx } from './systems';
import { DEMOLISH_REFUND, RETROFIT_RADIUS, roadTileCost } from './commands';
import { LOAN_SIZES } from './finance';
import { MIST_COST } from './floranet';
import { TAX_MAX, TAX_MIN } from './pulseState';
import { ISSUES, buildingId, getObject, queryInventory, type CityObject } from './inventory';

/**
 * Agent tools that change the city (`effect: 'mutate'`): build, demolish, connect to a highway, retrofit,
 * tax, loans and undo. Each runs one ordinary command, so it is undoable with ⌘Z, saved, deterministic and
 * in the command log like a player's action; hosts ask the player before running one (assistant policy).
 * Placement is found here (`findSites`) because small models can't pick valid coordinates.
 */

/** What action tools need beyond the sim: the command stack. */
export interface ActionCtx extends SimCtx {
  commands: {
    execute(type: string, payload: unknown, undoable?: boolean): boolean;
    undo(): boolean;
    readonly canUndo: boolean;
  };
}

/** A building def by id, exact name or unique substring of either. */
export function resolveType(text: string): BuildingDef {
  const q = text
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  const all = buildings.all();
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const exact = all.find((d) => d.id === q || slug(d.name) === q);
  if (exact) return exact;
  const hits = all.filter((d) => d.id.includes(q) || slug(d.name).includes(q));
  if (hits.length === 1) return hits[0]!;
  if (!hits.length) throw new Error(`No building type "${text}". See inventory_catalog for buildingTypes.`);
  throw new Error(
    `"${text}" matches ${hits.length} types: ${hits
      .slice(0, 8)
      .map((d) => d.id)
      .join(', ')}. Name one.`,
  );
}

export interface Site {
  x: number;
  z: number;
  rot: number;
  /** Distance in tiles from the requested centre. */
  distance: number;
  district: string;
}

/**
 * Where to look: a district's centre, else an object's, else tile coordinates, else the island centre. The
 * district wins because it is what stewards name ("in Westbrook") and small models fill every field.
 */
export function siteCentre(
  city: City,
  where: { near?: string; district?: string; x?: number; z?: number },
): { x: number; z: number; label: string } {
  if (where.district) {
    const d = city.districts.find((a) => a.name.toLowerCase() === where.district!.trim().toLowerCase());
    if (!d)
      throw new Error(
        `No district "${where.district}". Districts: ${city.districts.map((a) => a.name).join(', ')}`,
      );
    return { x: (d.x0 + d.x1 + 1) / 2, z: (d.z0 + d.z1 + 1) / 2, label: d.name };
  }
  if (where.near) {
    const o = getObject(city, where.near);
    if (!o) throw new Error(`No object "${where.near}"`);
    return { x: o.x, z: o.z, label: o.id };
  }
  if (where.x !== undefined && where.z !== undefined)
    return { x: where.x, z: where.z, label: `${Math.round(where.x)}E ${Math.round(where.z)}S` };
  return { x: city.size / 2, z: city.size / 2, label: 'the island centre' };
}

/** Valid lots with highway access for `def`, nearest `centre` first (searched outward up to `radius` tiles). */
export function findSites(
  city: City,
  def: BuildingDef,
  centre: { x: number; z: number },
  limit = 5,
  radius = 80,
): Site[] {
  const out: Site[] = [];
  const cx = Math.round(centre.x);
  const cz = Math.round(centre.z);
  const seen = new Set<number>();
  // Ring by ring, so the first `limit` valid lots are the nearest ones (Chebyshev rings, sorted by distance).
  for (let r = 0; r <= radius && out.length < limit * 3; r++) {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const [x, z] = [cx + dx, cz + dz];
        if (!city.grid.inBounds(x, z)) continue;
        for (let rot = 0; rot < (def.footprint[0] === def.footprint[1] ? 1 : 2); rot++) {
          const key = (z * city.size + x) * 4 + rot;
          if (seen.has(key)) continue;
          seen.add(key);
          const p = city.checkPlacement(def, x, z, rot);
          if (!p.ok || p.warning) continue;
          const [w, d] = city.footprint(def, rot);
          out.push({
            x,
            z,
            rot,
            distance: Math.round(Math.hypot(x + w / 2 - centre.x, z + d / 2 - centre.z)),
            district: city.districtAt(x, z) ?? 'Outskirts',
          });
        }
      }
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, limit);
}

/** The highway network with the most tiles: the main grid. */
function mainNetwork(city: City): number {
  const comp = city.networks.comp;
  const size = new Map<number, number>();
  for (let t = 0; t < comp.length; t++) if (comp[t]! >= 0) size.set(comp[t]!, (size.get(comp[t]!) ?? 0) + 1);
  let best = -1;
  for (const [c, n] of size) if (best < 0 || n > size.get(best)!) best = c;
  return best;
}

/**
 * New highway tiles linking an object to the main grid (the largest highway network), shortest first; `[]`
 * when it is already on it, null when no route fits within `maxLen` tiles. A building on an isolated
 * network links that network.
 */
export function connectPath(city: City, o: CityObject, maxLen = 60): number[] | null {
  const g = city.grid;
  const comp = city.networks.comp;
  const n = g.w * g.h;
  const main = mainNetwork(city);
  const from = new Int32Array(n).fill(-2); // -2 unseen, -1 start, else previous tile
  const queue: number[] = [];
  let own: number;
  if (o.kind === 'network' && o.ref.tile !== undefined) own = comp[o.ref.tile]!;
  else if (o.kind === 'building' && o.ref.eid !== undefined) {
    const e = o.ref.eid;
    const [x0, z0, w, d] = [Building.x[e]!, Building.z[e]!, Building.w[e]!, Building.d[e]!];
    own = city.networks.networkFor(x0, z0, w, d);
    if (own < 0)
      for (let z = z0; z < z0 + d; z++)
        for (let x = x0; x < x0 + w; x++) {
          const t = g.index(x, z);
          from[t] = -1;
          queue.push(t);
        }
  } else throw new Error(`${o.id} is not a building or highway network`);
  if (own >= 0 && own === main) return [];
  if (own >= 0)
    for (let t = 0; t < n; t++)
      if (comp[t] === own) {
        from[t] = -1;
        queue.push(t);
      }
  const depth = new Int32Array(n);
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head]!;
    const x = t % g.w;
    const z = (t / g.w) | 0;
    for (const nb of [
      x > 0 ? t - 1 : -1,
      x < g.w - 1 ? t + 1 : -1,
      z > 0 ? t - g.w : -1,
      z < g.h - 1 ? t + g.w : -1,
    ]) {
      if (nb < 0 || from[nb] !== -2) continue;
      if (comp[nb] === main) {
        const path: number[] = [];
        for (let p = t; from[p] !== -1; p = from[p]!) path.push(p);
        return path.reverse();
      }
      if (depth[t]! >= maxLen || !city.canRoad(nb, true)) continue;
      from[nb] = t;
      depth[nb] = depth[t]! + 1;
      queue.push(nb);
    }
  }
  return null;
}

const money = (v: number) => Math.round(v);
const where = {
  near: { type: 'string', description: 'Object id to build next to, e.g. "HWY-304.368" or "LIV-0042".' },
  district: { type: 'string', description: 'District name, e.g. "Westbrook" (see inventory_catalog).' },
  x: { type: 'number', description: 'Tile x (east), with z.' },
  z: { type: 'number', description: 'Tile z (south), with x.' },
} as const;

export const actionTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'find_sites',
    llmArgs: ['type', 'district', 'near'],
    option: 'Find free lots where a building type could go',
    description:
      'Lists valid lots with highway access for a building type near an object, a district or tile coordinates, nearest first. Read-only; use before build when the location matters.',
    input: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Building type id or name, e.g. "water-works".' },
        ...where,
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['type'],
    },
    effect: 'read',
    run(
      { city },
      a: { type: string; near?: string; district?: string; x?: number; z?: number; limit?: number },
    ) {
      const def = resolveType(a.type);
      const c = siteCentre(city, a);
      return {
        type: def.id,
        name: def.name,
        cost: def.stats.cost,
        credits: money(city.credits),
        near: c.label,
        sites: findSites(city, def, c, a.limit ?? 5),
      };
    },
  },
  {
    name: 'build',
    llmArgs: ['type', 'district', 'near'],
    option: 'Build a new building (homes, power, water, food, parks…)',
    description:
      'Builds one building of a type at the best free lot with highway access near an object, a district or tile coordinates (nearest first), paying its cost. Undoable. Returns the new building id.',
    input: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Building type id or name, e.g. "solar-spire", "water-works", "garden-residence".',
        },
        ...where,
        rot: { type: 'integer', minimum: 0, maximum: 3 },
      },
      required: ['type'],
    },
    effect: 'mutate',
    run(
      { city, commands },
      a: { type: string; near?: string; district?: string; x?: number; z?: number; rot?: number },
    ) {
      const def = resolveType(a.type);
      if (city.credits < def.stats.cost)
        throw new Error(`${def.name} costs ${def.stats.cost}; the treasury has ${money(city.credits)}.`);
      const c = siteCentre(city, a);
      const exact =
        a.x !== undefined && a.z !== undefined && !a.near && !a.district
          ? city.checkPlacement(def, Math.round(a.x), Math.round(a.z), a.rot ?? 0)
          : null;
      const site = exact?.ok
        ? {
            x: Math.round(a.x!),
            z: Math.round(a.z!),
            rot: a.rot ?? 0,
            distance: 0,
            district: city.districtAt(Math.round(a.x!), Math.round(a.z!)) ?? 'Outskirts',
          }
        : findSites(city, def, c, 1)[0];
      if (!site)
        throw new Error(`No free lot with highway access for ${def.name} within 80 tiles of ${c.label}.`);
      if (!commands.execute('build', { def: def.id, x: site.x, z: site.z, rot: site.rot }))
        throw new Error(`The city refused to build ${def.name} at ${site.x}E ${site.z}S.`);
      const eid = city.buildingAt(site.x, site.z);
      return {
        built: buildingId(city, eid),
        type: def.id,
        name: def.name,
        category: CATEGORY_LABELS[def.category],
        at: { x: site.x, z: site.z },
        district: site.district,
        cost: def.stats.cost,
        credits: money(city.credits),
      };
    },
  },
  {
    name: 'build_many',
    llmArgs: ['type', 'count', 'district'],
    option: 'Build several buildings of one type (up to 6) in a district',
    description:
      'Builds `count` buildings of one type (1–6) at the nearest free lots with highway access in a district or near an object, as one action (undo removes them one by one). Stops early when credits or lots run out.',
    input: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Building type id or name.' },
        count: { type: 'integer', minimum: 1, maximum: 6 },
        district: where.district,
        near: where.near,
      },
      required: ['type', 'count'],
    },
    effect: 'mutate',
    run({ city, commands }, a: { type: string; count: number; district?: string; near?: string }) {
      const def = resolveType(a.type);
      const c = siteCentre(city, a);
      const built: string[] = [];
      for (let i = 0; i < a.count; i++) {
        if (city.credits < def.stats.cost) break;
        const site = findSites(city, def, c, 1)[0];
        if (!site || !commands.execute('build', { def: def.id, x: site.x, z: site.z, rot: site.rot })) break;
        built.push(buildingId(city, city.buildingAt(site.x, site.z)));
      }
      if (!built.length)
        throw new Error(
          `Couldn't build any ${def.name} near ${c.label} (credits ${money(city.credits)}, cost ${def.stats.cost}).`,
        );
      return {
        built,
        type: def.id,
        name: def.name,
        near: c.label,
        cost: built.length * def.stats.cost,
        credits: money(city.credits),
        ...(built.length < a.count && {
          note: `Only ${built.length} of ${a.count}: out of credits or free lots.`,
        }),
      };
    },
  },
  {
    name: 'demolish',
    option: 'Demolish a building (returns half its cost)',
    description: `Removes one building by id and refunds ${DEMOLISH_REFUND * 100}% of its cost. Undoable.`,
    input: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Building id, e.g. "LIV-0042".' } },
      required: ['id'],
    },
    effect: 'mutate',
    run({ city, commands }, { id }: { id: string }) {
      const o = getObject(city, id);
      if (!o || o.kind !== 'building') throw new Error(`No building "${id}"`);
      const e = o.ref.eid!;
      if (!commands.execute('demolish', { x: Building.x[e], z: Building.z[e] }))
        throw new Error(`Could not demolish ${o.id}`);
      return {
        demolished: o.id,
        name: o.name,
        refund: money(buildings.get(o.type).stats.cost * DEMOLISH_REFUND),
        credits: money(city.credits),
      };
    },
  },
  {
    name: 'connect_highway',
    option: 'Lay a highway linking a building or isolated network to the main grid',
    description:
      'Lays the shortest new Living Highway from a building, or the isolated highway network it sits on, to the main grid (the largest network), so it shares its power and water. Bridges water if it must. Undoable; costs per tile.',
    input: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Building or highway network id, e.g. "LIV-0249" or "HWY-304.368".',
        },
      },
      required: ['id'],
    },
    effect: 'mutate',
    run({ city, commands }, { id }: { id: string }) {
      const o = getObject(city, id);
      if (!o) throw new Error(`No object "${id}"`);
      const path = connectPath(city, o);
      if (!path) throw new Error(`No buildable highway route from ${o.id} to the main grid within 60 tiles.`);
      if (!path.length) return { connected: o.id, tiles: 0, note: 'Already on the main grid.' };
      const cost = path.reduce((s, t) => s + roadTileCost(city, t), 0);
      if (city.credits < cost)
        throw new Error(
          `The route needs ${path.length} tiles costing ${money(cost)}; the treasury has ${money(city.credits)}.`,
        );
      if (!commands.execute('road', { tiles: path, bridges: true }))
        throw new Error('The city refused the highway route.');
      return {
        connected: o.id,
        tiles: path.length,
        cost: money(cost),
        from: { x: path[0]! % city.grid.w, z: (path[0]! / city.grid.w) | 0 },
        credits: money(city.credits),
        note: 'Networks and supply update on the next pulse (1 s).',
      };
    },
  },
  {
    name: 'fix_issue',
    option: 'Fix the problem of a building, network or district (applies the usual remedy)',
    description:
      'Applies the standard remedy for an object’s worst issue: links an isolated building or network to the main grid; builds water works or solar spires nearby for deficits; retrofits neglected buildings; adds homes for understaffed workplaces; places a symbiosis partner. A district fixes its worst building. One undoable action.',
    input: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Object id with the issue, e.g. "LIV-0249", "HWY-304.368" or "DST-BAYFRONT".',
        },
      },
      required: ['id'],
    },
    effect: 'mutate',
    async run(ctx, { id }: { id: string }) {
      const tool = (name: string) =>
        actionTools.find((t) => t.name === name)! as AgentTool<ActionCtx, Record<string, unknown>>;
      const { city } = ctx;
      let o = getObject(city, id);
      if (!o) throw new Error(`No object "${id}"`);
      if (o.kind === 'district') {
        const worst = queryInventory(city, {
          kind: 'building',
          district: o.name,
          status: ['critical', 'warning'],
          sort: 'status',
          limit: 1,
        }).items[0];
        if (!worst) return { fixed: o.id, note: 'Nothing in this district needs fixing.' };
        o = worst;
      }
      const issues = o.issues.filter((i) => (ISSUES[i]?.severity ?? 1) > 0 || i === 'unpaired');
      if (!issues.length) return { fixed: o.id, note: 'It has no issues.' };
      const issue = issues.sort((a, b) => (ISSUES[b]?.severity ?? 1) - (ISSUES[a]?.severity ?? 1))[0]!;
      const remedy = async (action: string, args: Record<string, unknown>) => ({
        fixed: o.id,
        issue,
        action,
        args,
        result: await tool(action).run(ctx, args),
      });
      const supply = ['no-road', 'no-power', 'no-water', 'power-short', 'water-short'];
      if (supply.includes(issue)) {
        const path = o.kind === 'building' || o.kind === 'network' ? connectPath(city, o) : null;
        if (path && path.length) return remedy('connect_highway', { id: o.id });
        const water = issue === 'no-water' || issue === 'water-short';
        return remedy('build', { type: water ? 'water-works' : 'solar-spire', near: o.id });
      }
      if (issue === 'neglected' || issue === 'worn') return remedy('bloom_retrofit', { id: o.id });
      if (issue === 'unstaffed') return remedy('build', { type: 'garden-residence', near: o.id });
      if (issue === 'unpaired' && o.kind === 'building') {
        const partner = buildings.get(o.type).symbiosis?.partners[0];
        if (partner) return remedy('build', { type: partner, near: o.id });
      }
      if (issue === 'flooded') return remedy('build', { type: 'mangrove-seawall', near: o.id });
      throw new Error(
        `No standard remedy for "${ISSUES[issue]?.label ?? issue}" on ${o.id}: ${ISSUES[issue]?.hint ?? ''}`,
      );
    },
  },
  {
    name: 'bloom_retrofit',
    option: 'Bloom Retrofit the buildings around an object (eco boost, less power/water)',
    description: `Retrofits every building within ${RETROFIT_RADIUS} tiles of an object with flowering façades (eco ×1.5, uses less power and water), paying 40% of their cost. Undoable.`,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object id at the centre (a building or district).' },
      },
      required: ['id'],
    },
    effect: 'mutate',
    run({ city, commands }, { id }: { id: string }) {
      const o = getObject(city, id);
      if (!o) throw new Error(`No object "${id}"`);
      const before = city.credits;
      if (!commands.execute('retrofit', { x: Math.round(o.x), z: Math.round(o.z), radius: RETROFIT_RADIUS }))
        throw new Error(`Nothing to retrofit around ${o.id}, or not enough credits.`);
      return { retrofitted: o.id, cost: money(before - city.credits), credits: money(city.credits) };
    },
  },
  {
    name: 'mist_soil',
    option: 'Dispatch Flora-Net drones to mist dry soil around an object or district',
    description: `Sends drones and pods to soak the soil zones around an object or a district's centre (+35% hydration), for ${MIST_COST} credits. Helps parched gardens and farms in a drought. Undoable.`,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Object or district id, e.g. "DST-SUNFIELD" or "FOD-0004".' },
      },
      required: ['id'],
    },
    effect: 'mutate',
    run({ city, commands }, { id }: { id: string }) {
      const o = getObject(city, id);
      if (!o) throw new Error(`No object "${id}"`);
      if (!commands.execute('mist', { x: Math.round(o.x), z: Math.round(o.z) }))
        throw new Error(
          `Couldn't mist around ${o.id}: no land zones there, or not enough credits (${MIST_COST}).`,
        );
      return { misted: o.id, cost: MIST_COST, credits: money(city.credits) };
    },
  },
  {
    name: 'repay_loan',
    option: 'Repay a loan in full',
    description:
      'Repays a loan in full (the oldest when no id is given), if the treasury can cover what remains. Undoable.',
    input: {
      type: 'object',
      properties: {
        loan: {
          type: 'integer',
          minimum: 0,
          description: 'Loan id (see budget_breakdown); the oldest when omitted.',
        },
      },
    },
    effect: 'mutate',
    run({ city, commands }, { loan }: { loan?: number }) {
      const l = loan === undefined ? city.steward.loans[0] : city.steward.loans.find((x) => x.id === loan);
      if (!l) throw new Error(city.steward.loans.length ? `No loan ${loan}.` : 'There are no loans.');
      const owed = l.remaining;
      if (!commands.execute('repayLoan', { id: l.id }))
        throw new Error(`Repaying needs ${money(owed)}; the treasury has ${money(city.credits)}.`);
      return {
        repaid: l.id,
        paid: money(owed),
        credits: money(city.credits),
        loansLeft: city.steward.loans.length,
      };
    },
  },
  {
    name: 'set_tax',
    option: 'Change the tax rate',
    description: `Sets the city tax rate in percent (${TAX_MIN * 100}–${TAX_MAX * 100}). Higher earns more but lowers harmony. Undoable.`,
    input: {
      type: 'object',
      properties: { percent: { type: 'number', minimum: TAX_MIN * 100, maximum: TAX_MAX * 100 } },
      required: ['percent'],
    },
    effect: 'mutate',
    run({ city, commands }, { percent }: { percent: number }) {
      const was = city.pulse.taxRate;
      if (!commands.execute('setTax', { rate: percent / 100 }))
        return { taxPercent: Math.round(was * 100), note: 'Unchanged.' };
      return { taxPercent: Math.round(city.pulse.taxRate * 100), was: Math.round(was * 100) };
    },
  },
  {
    name: 'take_loan',
    option: 'Borrow credits (a loan repaid over time)',
    description: `Takes a loan of ${LOAN_SIZES.join(', ')} credits, repaid with interest over 10 sim-minutes. Undoable.`,
    input: {
      type: 'object',
      properties: { amount: { type: 'integer', enum: LOAN_SIZES } },
      required: ['amount'],
    },
    effect: 'mutate',
    run({ city, commands }, { amount }: { amount: number }) {
      if (!commands.execute('takeLoan', { amount }))
        throw new Error('The bank refused the loan (too much debt, or difficulty forbids it).');
      return { borrowed: amount, credits: money(city.credits), loans: city.steward.loans.length };
    },
  },
  {
    name: 'undo',
    option: 'Undo the last action',
    description: 'Undoes the most recent action (the assistant’s or the steward’s), like ⌘Z.',
    input: { type: 'object', properties: {} },
    effect: 'mutate',
    run({ commands }) {
      if (!commands.canUndo) throw new Error('Nothing to undo.');
      commands.undo();
      return { undone: true };
    },
  },
];

/** Live building at a tile, for tests and hosts. */
export const buildingIdAt = (city: City, x: number, z: number) => {
  const e = city.buildingAt(x, z);
  return e === NO_ENTITY ? null : buildingId(city, e);
};
