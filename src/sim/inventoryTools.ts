import type { AgentTool } from '@/core/AgentTools';
import type { SimCtx } from './systems';
import { SYSTEMS, TIERS } from './pulseState';
import { getCrisis } from './crises';
import {
  ISSUES,
  STATUSES,
  buildingTypes,
  inspectObject,
  inventoryKinds,
  listObjects,
  filterObjects,
  summarize,
  type CityObject,
  type InventoryQuery,
} from './inventory';

/**
 * Read-only agent tools over the city inventory and the pulse (see `core/AgentTools.ts`). Pure sim, so tests
 * and future headless agents run them without a renderer; the inventory module adds the camera / HUD tools.
 */

/** An object without its HUD handles: what agents see. */
function compact<T extends CityObject>(obj: T): Omit<T, 'ref'> {
  const { ref, ...o } = obj;
  void ref;
  return o;
}

const SEARCH_LIMIT = 200;

interface SearchArgs {
  text?: string;
  kind?: string;
  type?: string;
  group?: string;
  district?: string;
  status?: string;
  issue?: string;
  near_x?: number;
  near_z?: number;
  radius?: number;
  sort?: string;
  desc?: boolean;
  limit?: number;
  offset?: number;
}

export const inventoryTools: AgentTool<SimCtx, never>[] = [
  {
    name: 'city_overview',
    description:
      'Headline state of the city: day and time, treasury and net income, residents, harmony, system health tiers (Thriving…Collapse), supply ratios, active crises and how many inventory objects are ok / warning / critical. Call this first to orient.',
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      const s = city.stats;
      const p = city.pulse;
      const objects = listObjects(city);
      return {
        day: city.day,
        timeOfDay: Math.round(city.timeOfDay * 1000) / 1000,
        credits: Math.round(city.credits),
        netIncomePerSecond: Math.round((s.income - s.upkeep - s.debtService) * 100) / 100,
        residents: Math.round(s.population),
        housingCapacity: Math.round(s.capacity),
        jobs: Math.round(s.jobs),
        employed: Math.round(s.employed),
        harmony: Math.round(s.happiness),
        taxRate: p.taxRate,
        supply: {
          energy: round2(p.energyRatio),
          water: round2(p.waterRatio),
          food: round2(p.foodRatio),
          employment: round2(1 - p.unemployment),
        },
        tiers: Object.fromEntries(SYSTEMS.map((k) => [k, TIERS[p.tiers[k]]])),
        crises: city.steward.crises.map((c) => ({
          crisis: c.def,
          name: getCrisis(c.def).name,
          phase: c.phase,
          severity: round2(c.severity),
          x: c.x,
          z: c.z,
        })),
        inventory: summarize(objects).status,
      };
    },
  },
  {
    name: 'inventory_catalog',
    description:
      'Vocabulary for the other inventory tools: object kinds with their id prefixes, issue codes (with severity and what fixes them), statuses, district names and building types. Call once before searching by filters.',
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      return {
        kinds: inventoryKinds().map((k) => ({
          kind: k.kind,
          label: k.label,
          prefixes: k.prefixes,
          description: k.description,
        })),
        statuses: STATUSES,
        issues: Object.entries(ISSUES).map(([code, i]) => ({ code, ...i })),
        districts: city.districts.map((d) => d.name),
        buildingTypes: buildingTypes(),
      };
    },
  },
  {
    name: 'inventory_summary',
    description:
      'Comprehensive inventory counts: totals by status, kind, group (building category…), type, issue and district, each with warning / critical counts, plus summed metrics such as building.residents and network.tiles. Optionally limited to one kind.',
    input: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Only this kind (see inventory_catalog), e.g. "building".' },
      },
    },
    effect: 'read',
    run({ city }, { kind }: { kind?: string }) {
      return summarize(listObjects(city, kind));
    },
  },
  {
    name: 'inventory_search',
    description:
      'Finds city objects (buildings, highway networks, bridges, sky-bridges, channels, districts, landmarks…) by free text and filters; returns a page of records with id, name, type, district, centre (x, z in tiles), status, issue codes and metrics. Use the ids with inventory_inspect. Example: {"kind":"building","status":"critical","sort":"residents","limit":10}.',
    input: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description:
            'Words that must all match id, name, type, group, district or issue; also accepts key:value filters (kind:, type:, group:, district:, status:, issue:).',
        },
        kind: {
          type: 'string',
          description: 'Object kind, e.g. building, network, bridge, skybridge, channel, district.',
        },
        type: { type: 'string', description: 'Type id or name substring, e.g. "water-works" or "pod dock".' },
        group: {
          type: 'string',
          description: 'Group substring, e.g. building category "Living", "Energy", "Water", "Food".',
        },
        district: {
          type: 'string',
          description: 'Exact district name (case-insensitive), e.g. "Westbrook"; see inventory_catalog.',
        },
        status: { type: 'string', enum: STATUSES },
        issue: { type: 'string', description: 'Issue code or label substring, e.g. "no-power".' },
        near_x: { type: 'number', description: 'Tile x to measure distance from (with near_z).' },
        near_z: { type: 'number' },
        radius: {
          type: 'number',
          minimum: 0,
          description: 'Only objects within this many tiles of near_x / near_z.',
        },
        sort: {
          type: 'string',
          description:
            'id (default), name, status (worst first), distance, district, type, or a metric name such as residents, condition, tiles (largest first).',
        },
        desc: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: SEARCH_LIMIT, description: 'Page size (default 20).' },
        offset: { type: 'integer', minimum: 0 },
      },
    },
    effect: 'read',
    run({ city }, a: SearchArgs) {
      const q: InventoryQuery = {
        text: a.text,
        kind: a.kind,
        type: a.type,
        group: a.group,
        district: a.district,
        status: a.status as InventoryQuery['status'],
        issue: a.issue,
        near:
          a.near_x !== undefined && a.near_z !== undefined
            ? { x: a.near_x, z: a.near_z, radius: a.radius }
            : undefined,
        sort: a.sort,
        desc: a.desc,
        limit: Math.min(a.limit ?? 20, SEARCH_LIMIT),
        offset: a.offset,
      };
      const page = filterObjects(listObjects(city, q.kind), q);
      return { total: page.total, offset: page.offset, items: page.items.map(compact) };
    },
  },
  {
    name: 'inventory_inspect',
    description:
      'Full detail for one object by id (e.g. "LIV-0042", "HWY-118.204", "DST-WESTBROOK"): its record, what each issue means and how to fix it, and kind-specific detail (description, stats, network, symbiosis…).',
    input: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Readable object id (case-insensitive).' } },
      required: ['id'],
    },
    effect: 'read',
    run({ city }, { id }: { id: string }) {
      const o = inspectObject(city, id);
      if (!o) throw new Error(`No object "${id}"`);
      return compact(o);
    },
  },
];

const round2 = (v: number) => Math.round(v * 100) / 100;
