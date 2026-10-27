import { Building, Greenery, Problem, Service } from '@/ecs/components';
import { buildings } from '@/content';
import { CATEGORY_CODES, CATEGORY_LABELS } from '@/content/types';
import { NO_ENTITY } from './Grid';
import type { City } from './City';
import { findBridgeSpans } from './bridges';
import { activeBridges } from './weaver';

/**
 * City inventory: every object the steward manages (buildings, highway networks, bridges, sky-bridges,
 * channels, districts, and whatever modules register) as plain JSON-ready records with a readable, unique id.
 * One query API serves the dashboard, the inspector and agent tools (LLM function calling, `inventoryTools.ts`),
 * so a new kind of object only needs a provider (`registerInventoryKind`). Pure sim code; nothing here runs per
 * frame (callers snapshot on demand and filter the snapshot).
 *
 * Ids: buildings use their saved serial behind a category code (`LIV-0042`, never reused while the game lives);
 * tile-based infrastructure uses its anchor tile (`HWY-118.204`, the network's first tile in row-major order;
 * bridges add their axis, `BRG-51.308E`),
 * sky-bridges their towers' serials (`SKY-0042-0107`), districts their name (`DST-WESTBROOK`).
 */

export type ObjectStatus = 'ok' | 'warning' | 'critical';
export const STATUSES: readonly ObjectStatus[] = ['ok', 'warning', 'critical'];

export interface CityObject {
  /** Readable, unique among live objects; case-insensitive on lookup. */
  id: string;
  /** Provider kind: `building`, `network`, `bridge`, `skybridge`, `channel`, `district`, … */
  kind: string;
  /** Content type within the kind (building def id, `highway`, …). */
  type: string;
  name: string;
  /** Group within the kind (building category label, …). */
  group: string;
  district: string;
  /** Centre in tiles and footprint / bounding size. */
  x: number;
  z: number;
  w: number;
  d: number;
  status: ObjectStatus;
  /** Issue codes (see ISSUES). */
  issues: string[];
  /** Numeric readings (rounded); names are stable API (`residents`, `condition`, `tiles`…). */
  metrics: Record<string, number>;
  /** Handles for the HUD: the entity (buildings) or an anchor tile (tile-based infrastructure). */
  ref: { eid?: number; tile?: number };
}

export interface IssueInfo {
  label: string;
  /** 0 notice (does not change status), 1 warning, 2 critical. */
  severity: 0 | 1 | 2;
  /** What the steward can do about it. */
  hint: string;
}

/** Issue vocabulary shared by every kind. Providers may add codes with `registerIssue`. */
export const ISSUES: Record<string, IssueInfo> = {
  'no-road': {
    label: 'No highway access',
    severity: 2,
    hint: 'Connect it to a Living Highway: power and water run beneath them.',
  },
  'no-power': {
    label: 'Brownout',
    severity: 2,
    hint: 'Its network lacks energy: add generation or connect a stronger network.',
  },
  'no-water': {
    label: 'Dry taps',
    severity: 2,
    hint: 'Its network lacks water: add Water Works or reservoirs on the network.',
  },
  unstaffed: {
    label: 'Understaffed',
    severity: 1,
    hint: 'Not enough workers: add homes nearby or improve transit.',
  },
  flooded: {
    label: 'Flooded',
    severity: 2,
    hint: 'Under flood water: build Mangrove Seawalls or reclaim land.',
  },
  neglected: {
    label: 'Neglected',
    severity: 1,
    hint: 'Condition below 35%: restore upkeep funding or retrofit it.',
  },
  offline: {
    label: 'Offline',
    severity: 2,
    hint: 'Shut down by a crisis: resolve the crisis to bring it back.',
  },
  worn: {
    label: 'Worn',
    severity: 1,
    hint: 'Condition below 60%: it decays under austerity, floods and abandonment.',
  },
  unpaired: {
    label: 'Unpaired',
    severity: 0,
    hint: 'Place a symbiotic partner within range to purify and boost it.',
  },
  'power-short': { label: 'Power deficit', severity: 2, hint: 'The network uses more energy than it makes.' },
  'water-short': {
    label: 'Water deficit',
    severity: 2,
    hint: 'The network uses more water than it supplies.',
  },
  overgrown: {
    label: 'Overgrown',
    severity: 1,
    hint: 'Over 10% of its highways are overgrown: fund upkeep or rebuild them.',
  },
  troubled: {
    label: 'Troubled',
    severity: 1,
    hint: 'Over 10% of its buildings report problems: inspect them.',
  },
  failing: { label: 'Failing', severity: 2, hint: 'Over 10% of its buildings are critical: inspect them.' },
};
export const registerIssue = (code: string, info: IssueInfo) => void (ISSUES[code] = info);

export interface InventoryKind {
  kind: string;
  /** Plural label, e.g. "Buildings". */
  label: string;
  icon: string;
  /** Id prefixes this kind owns (upper case), used to route lookups. */
  prefixes: string[];
  /** Short description for agents and the catalog. */
  description: string;
  list(city: City): CityObject[];
  /** Fast lookup by upper-cased id; defaults to scanning `list`. */
  get?(city: City, id: string): CityObject | null;
  /** Extra JSON-ready detail for `inspectObject`. */
  details?(city: City, obj: CityObject): Record<string, unknown>;
}

const kinds = new Map<string, InventoryKind>();
export const registerInventoryKind = (k: InventoryKind) => void kinds.set(k.kind, k);
export const inventoryKinds = () => [...kinds.values()];

// ── Shared helpers ──────────────────────────────────────────────────────────

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;
const pad4 = (n: number) => String(n).padStart(4, '0');
const OUTSKIRTS = 'Outskirts';
const districtOf = (city: City, x: number, z: number) =>
  city.districtAt(Math.floor(x), Math.floor(z)) ?? OUTSKIRTS;

export function statusOf(issues: readonly string[]): ObjectStatus {
  let s = 0;
  for (const i of issues) s = Math.max(s, ISSUES[i]?.severity ?? 1);
  return STATUSES[s] ?? 'ok';
}

const slug = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ── Buildings ───────────────────────────────────────────────────────────────

export function buildingId(city: City, eid: number): string {
  return `${CATEGORY_CODES[city.buildingDef(eid).category]}-${pad4(Building.uid[eid]!)}`;
}

/** Problem flag → issue code. */
const PROBLEM_ISSUES: [number, string][] = [
  [Problem.NO_ROAD, 'no-road'],
  [Problem.NO_POWER, 'no-power'],
  [Problem.NO_WATER, 'no-water'],
  [Problem.UNSTAFFED, 'unstaffed'],
  [Problem.FLOODED, 'flooded'],
  [Problem.NEGLECTED, 'neglected'],
  [Problem.OFFLINE, 'offline'],
];

function buildingObject(city: City, eid: number): CityObject {
  const def = city.buildingDef(eid);
  const s = def.stats;
  const [x, z, w, d] = [Building.x[eid]!, Building.z[eid]!, Building.w[eid]!, Building.d[eid]!];
  const p = Service.problems[eid]!;
  const cond = Service.condition[eid]!;
  const occ = Service.occupancy[eid]!;
  const issues = PROBLEM_ISSUES.filter(([f]) => p & f).map(([, c]) => c);
  if (cond < 0.6 && !(p & Problem.NEGLECTED)) issues.push('worn');
  if (def.symbiosis && !Service.paired[eid]) issues.push('unpaired');
  const metrics: Record<string, number> = {
    condition: r3(cond),
    greenery: r3(Greenery.value[eid]!),
    bloom: r3(Service.bloom[eid]!),
    soil: r3(Service.soil[eid]!),
    level: Building.level[eid]!,
    upkeep: r3(s.upkeep),
    cost: s.cost,
  };
  if (s.population > 0)
    Object.assign(metrics, {
      residents: Math.round(s.population * occ),
      capacity: s.population,
      occupancy: r3(occ),
    });
  if (s.jobs > 0 && s.population <= 0)
    Object.assign(metrics, { workers: Math.round(s.jobs * occ), jobs: s.jobs, staffing: r3(occ) });
  if (s.energy) metrics.energy = s.energy;
  if (s.energy < 0) metrics.power = r3(Service.power[eid]!);
  if (s.water) metrics.water = s.water;
  if (s.water < 0) metrics.waterSupply = r3(Service.water[eid]!);
  if (s.food) metrics.food = s.food;
  if (def.transit) metrics.riders = Math.round(Service.riders[eid]!);
  return {
    id: buildingId(city, eid),
    kind: 'building',
    type: def.id,
    name: def.name,
    group: CATEGORY_LABELS[def.category],
    district: districtOf(city, x + w / 2, z + d / 2),
    x: x + w / 2,
    z: z + d / 2,
    w,
    d,
    status: statusOf(issues),
    issues,
    metrics,
    ref: { eid },
  };
}

registerInventoryKind({
  kind: 'building',
  label: 'Buildings',
  icon: '⌂',
  prefixes: Object.values(CATEGORY_CODES),
  description:
    'Homes, workplaces, utilities, parks and landmarks. Id = category code + serial, e.g. LIV-0042.',
  list: (city) => city.buildingEntities().map((eid) => buildingObject(city, eid)),
  get(city, id) {
    const m = /^[A-Z]+-0*(\d+)$/.exec(id);
    const eid = m ? city.buildingByUid(Number(m[1])) : NO_ENTITY;
    return eid === NO_ENTITY ? null : buildingObject(city, eid);
  },
  details(city, obj) {
    const eid = obj.ref.eid!;
    const def = city.buildingDef(eid);
    const net = Service.network[eid]!;
    const sym = def.symbiosis;
    return {
      description: def.description,
      category: def.category,
      footprint: [Building.w[eid], Building.d[eid]],
      origin: [Building.x[eid], Building.z[eid]],
      rotation: Building.rot[eid],
      retrofit: ['original', 'Bloom Retrofit', 'banyan merge'][Building.level[eid]!] ?? 'original',
      network: net >= 0 ? networkIdOf(city, net) : null,
      stats: def.stats,
      ...(sym && {
        symbiosis: {
          paired: !!Service.paired[eid],
          label: sym.label,
          partners: sym.partners,
          radius: sym.radius,
        },
      }),
      ...(def.transit && { transit: def.transit }),
      ...(def.drones && { drones: def.drones }),
      ...(def.defence && { defence: def.defence }),
      ...(def.floodproof && { floodproof: true }),
      ...(def.landmark && { landmark: true }),
      ...(def.tower && { tower: true }),
    };
  },
});

// ── Highway networks ────────────────────────────────────────────────────────

/** Anchor tile (first in row-major order) per network id, cached per `comp` contents. */
function networkAnchors(city: City): Int32Array {
  const { comp, count } = city.networks;
  const out = new Int32Array(count).fill(-1);
  for (let t = 0, found = 0; t < comp.length && found < count; t++) {
    const c = comp[t]!;
    if (c >= 0 && out[c] === -1) {
      out[c] = t;
      found++;
    }
  }
  return out;
}

const tileId = (prefix: string, city: City, t: number) =>
  `${prefix}-${t % city.grid.w}.${(t / city.grid.w) | 0}`;

/** Readable id of highway network `net` (an index into `city.pulse.networks`). */
export function networkIdOf(city: City, net: number): string | null {
  const t = networkAnchors(city)[net];
  return t === undefined || t < 0 ? null : tileId('HWY', city, t);
}

/** Readable id of the highway network a road tile belongs to. */
export function networkIdAtTile(city: City, tile: number): string | null {
  const c = city.networks.comp[tile] ?? -1;
  return c < 0 ? null : networkIdOf(city, c);
}

function listNetworks(city: City): CityObject[] {
  const { comp, count: n } = city.networks;
  const g = city.grid;
  const og = g.layer<Uint8Array>('overgrowth');
  const tiles = new Float64Array(n * 8); // count, sx, sz, minx, minz, maxx, maxz, overgrown
  const anchor = new Int32Array(n).fill(-1);
  for (let t = 0; t < comp.length; t++) {
    const c = comp[t]!;
    if (c < 0) continue;
    const x = t % g.w;
    const z = (t / g.w) | 0;
    const o = c * 8;
    if (anchor[c] === -1) {
      anchor[c] = t;
      tiles[o + 3] = tiles[o + 5] = x;
      tiles[o + 4] = tiles[o + 6] = z;
    }
    tiles[o]!++;
    tiles[o + 1]! += x;
    tiles[o + 2]! += z;
    tiles[o + 3] = Math.min(tiles[o + 3]!, x);
    tiles[o + 4] = Math.min(tiles[o + 4]!, z);
    tiles[o + 5] = Math.max(tiles[o + 5]!, x);
    tiles[o + 6] = Math.max(tiles[o + 6]!, z);
    if (og?.[t]) tiles[o + 7]!++;
  }
  const out: CityObject[] = [];
  for (let c = 0; c < n; c++) {
    const o = c * 8;
    const size = tiles[o]!;
    if (!size) continue;
    const st = city.pulse.networks[c];
    const issues: string[] = [];
    const metrics: Record<string, number> = { tiles: size, overgrown: tiles[o + 7]! };
    if (st) {
      Object.assign(metrics, {
        buildings: st.buildings,
        energyProduced: r3(st.energyProduced),
        energyUsed: r3(st.energyUsed),
        waterProduced: r3(st.waterProduced),
        waterUsed: r3(st.waterUsed),
      });
      if (st.energyUsed > st.energyProduced + 1e-6) issues.push('power-short');
      if (st.waterUsed > st.waterProduced + 1e-6) issues.push('water-short');
    }
    if (tiles[o + 7]! > size * 0.1) issues.push('overgrown');
    const [cx, cz] = [r1(tiles[o + 1]! / size + 0.5), r1(tiles[o + 2]! / size + 0.5)];
    const district = districtOf(city, cx, cz);
    out.push({
      id: tileId('HWY', city, anchor[c]!),
      kind: 'network',
      type: 'highway',
      name: `Highway network · ${district}`,
      group: 'Living Highways',
      district,
      x: cx,
      z: cz,
      w: tiles[o + 5]! - tiles[o + 3]! + 1,
      d: tiles[o + 6]! - tiles[o + 4]! + 1,
      status: statusOf(issues),
      issues,
      metrics,
      ref: { tile: anchor[c]! },
    });
  }
  return out;
}

registerInventoryKind({
  kind: 'network',
  label: 'Highway networks',
  icon: '⛙',
  prefixes: ['HWY'],
  description:
    'Connected Living Highways; buildings touching one share its power and water. Id = HWY-<x>.<z> of its first tile.',
  list: listNetworks,
  details: (city, obj) => {
    const c = city.networks.comp[obj.ref.tile!]!;
    let homes = 0;
    for (const eid of city.buildingEntities()) if (Service.network[eid] === c) homes++;
    return {
      description:
        'Power and water flow along connected Living Highways. Everything touching this network shares its supply.',
      connectedBuildings: homes,
    };
  },
});

// ── Highway bridges ─────────────────────────────────────────────────────────

registerInventoryKind({
  kind: 'bridge',
  label: 'Bridges',
  icon: '⌒',
  prefixes: ['BRG'],
  description:
    'Straight highway bridge spans over water (3+ tiles). Id = BRG-<x>.<z> of its first deck tile + E (east–west) or S (north–south).',
  list(city) {
    return findBridgeSpans(city.grid, 3).map((s) => {
      const [w, d] = s.alongX ? [s.len, 1] : [1, s.len];
      const [x, z] = [s.x + w / 2, s.z + d / 2];
      const t = city.grid.index(s.x, s.z);
      const network = networkIdAtTile(city, t);
      return {
        id: `${tileId('BRG', city, t)}${s.alongX ? 'E' : 'S'}`,
        kind: 'bridge',
        type: s.len >= 12 ? 'suspension-bridge' : 'bridge',
        name: `${s.len >= 12 ? 'Suspension bridge' : 'Bridge'} · ${s.len} tiles`,
        group: s.alongX ? 'East–west' : 'North–south',
        district: districtOf(city, x, z),
        x,
        z,
        w,
        d,
        status: network ? 'ok' : 'warning',
        issues: network ? [] : ['overgrown'],
        metrics: { length: s.len },
        ref: { tile: t },
      } satisfies CityObject;
    });
  },
  details: (city, obj) => ({ network: networkIdAtTile(city, obj.ref.tile!) }),
});

// ── Sky-bridges (Green Weaver) ──────────────────────────────────────────────

registerInventoryKind({
  kind: 'skybridge',
  label: 'Sky-bridges',
  icon: '≋',
  prefixes: ['SKY'],
  description: 'Green Weaver bridges between towers. Id = SKY-<tower serial>-<tower serial>.',
  list(city) {
    return activeBridges(city).map(({ a, b }) => {
      const [ax, az] = [Building.x[a]! + Building.w[a]! / 2, Building.z[a]! + Building.d[a]! / 2];
      const [bx, bz] = [Building.x[b]! + Building.w[b]! / 2, Building.z[b]! + Building.d[b]! / 2];
      const [x, z] = [(ax + bx) / 2, (az + bz) / 2];
      return {
        id: `SKY-${pad4(Building.uid[a]!)}-${pad4(Building.uid[b]!)}`,
        kind: 'skybridge',
        type: 'sky-bridge',
        name: `Sky-bridge ${buildingId(city, a)} ↔ ${buildingId(city, b)}`,
        group: 'Green Weaver',
        district: districtOf(city, x, z),
        x,
        z,
        w: Math.abs(ax - bx) + 1,
        d: Math.abs(az - bz) + 1,
        status: 'ok',
        issues: [],
        metrics: { length: r3(Math.hypot(ax - bx, az - bz)) },
        ref: { eid: a },
      } satisfies CityObject;
    });
  },
  details: (city, obj) => {
    const [, a, b] = obj.id.split('-');
    return { towers: [a, b].map((u) => buildingId(city, city.buildingByUid(Number(u)))) };
  },
});

// ── Filtration channels ─────────────────────────────────────────────────────

let channelQueue = new Int32Array(0);

registerInventoryKind({
  kind: 'channel',
  label: 'Filtration channels',
  icon: '≈',
  prefixes: ['CHN'],
  description:
    'Connected runs of filtration channels (irrigate and purify nearby land). Id = CHN-<x>.<z> of its first tile.',
  list(city) {
    const ch = city.grid.layer<Uint8Array>('channel');
    if (!ch) return [];
    const g = city.grid;
    if (channelQueue.length < ch.length) channelQueue = new Int32Array(ch.length);
    const q = channelQueue;
    const seen = new Uint8Array(ch.length);
    const out: CityObject[] = [];
    for (let start = 0; start < ch.length; start++) {
      if (!ch[start] || seen[start]) continue;
      let [head, tail, lush, sx, sz] = [0, 0, 0, 0, 0];
      let [x0, z0, x1, z1] = [g.w, g.h, 0, 0];
      q[tail++] = start;
      seen[start] = 1;
      while (head < tail) {
        const t = q[head++]!;
        const x = t % g.w;
        const z = (t / g.w) | 0;
        if (ch[t] === 2) lush++;
        [sx, sz] = [sx + x, sz + z];
        [x0, z0, x1, z1] = [Math.min(x0, x), Math.min(z0, z), Math.max(x1, x), Math.max(z1, z)];
        for (const n of [
          x > 0 ? t - 1 : -1,
          x < g.w - 1 ? t + 1 : -1,
          z > 0 ? t - g.w : -1,
          z < g.h - 1 ? t + g.w : -1,
        ])
          if (n >= 0 && ch[n] && !seen[n]) {
            seen[n] = 1;
            q[tail++] = n;
          }
      }
      const [x, z] = [r1(sx / tail + 0.5), r1(sz / tail + 0.5)];
      out.push({
        id: tileId('CHN', city, start),
        kind: 'channel',
        type: 'filtration-channel',
        name: `Filtration channel · ${tail} tiles`,
        group: 'Water',
        district: districtOf(city, x, z),
        x,
        z,
        w: x1 - x0 + 1,
        d: z1 - z0 + 1,
        status: 'ok',
        issues: [],
        metrics: { tiles: tail, lush },
        ref: { tile: start },
      });
    }
    return out;
  },
});

// ── Districts ───────────────────────────────────────────────────────────────

registerInventoryKind({
  kind: 'district',
  label: 'Districts',
  icon: '▦',
  prefixes: ['DST'],
  description: 'Named towns, quarters and parks with their buildings rolled up. Id = DST-<NAME>.',
  list(city) {
    const acc = new Map<
      string,
      {
        n: number;
        res: number;
        cap: number;
        jobs: number;
        warn: number;
        crit: number;
        cond: number;
        green: number;
      }
    >();
    for (const d of city.districts)
      acc.set(d.name, { n: 0, res: 0, cap: 0, jobs: 0, warn: 0, crit: 0, cond: 0, green: 0 });
    for (const eid of city.buildingEntities()) {
      const o = buildingObject(city, eid);
      const a = acc.get(o.district);
      if (!a) continue;
      a.n++;
      a.res += o.metrics.residents ?? 0;
      a.cap += o.metrics.capacity ?? 0;
      a.jobs += o.metrics.jobs ?? 0;
      a.cond += o.metrics.condition!;
      a.green += o.metrics.greenery!;
      if (o.status === 'warning') a.warn++;
      if (o.status === 'critical') a.crit++;
    }
    return city.districts.map((d) => {
      const a = acc.get(d.name)!;
      const issues = a.crit > a.n * 0.1 ? ['failing'] : a.crit + a.warn > a.n * 0.1 ? ['troubled'] : [];
      return {
        id: `DST-${slug(d.name)}`,
        kind: 'district',
        type: 'district',
        name: d.name,
        group: 'Districts',
        district: d.name,
        x: (d.x0 + d.x1 + 1) / 2,
        z: (d.z0 + d.z1 + 1) / 2,
        w: d.x1 - d.x0 + 1,
        d: d.z1 - d.z0 + 1,
        status: statusOf(issues),
        issues,
        metrics: {
          buildings: a.n,
          residents: a.res,
          capacity: a.cap,
          jobs: a.jobs,
          warning: a.warn,
          critical: a.crit,
          condition: a.n ? r3(a.cond / a.n) : 1,
          greenery: a.n ? r3(a.green / a.n) : 0,
        },
        ref: {},
      } satisfies CityObject;
    });
  },
});

// ── Queries ─────────────────────────────────────────────────────────────────

export interface InventoryQuery {
  /**
   * Free text (every word must match id, name, type, group, district or an issue) plus `key:value` filters:
   * `kind:`, `type:`, `group:`, `district:`, `status:`, `issue:` (values are case-insensitive substrings).
   */
  text?: string;
  kind?: string | string[];
  type?: string;
  group?: string;
  /** Exact district name (case-insensitive); `district:` in `text` matches substrings. */
  district?: string;
  status?: ObjectStatus | ObjectStatus[];
  issue?: string;
  near?: { x: number; z: number; radius?: number };
  /** `id` (default), `name`, `status` (worst first), `distance` (needs `near`), `district`, `type`, or a metric name. */
  sort?: string;
  desc?: boolean;
  limit?: number;
  offset?: number;
}

export interface InventoryPage {
  total: number;
  offset: number;
  items: CityObject[];
}

/** Every object of the given kinds (all when omitted). Each call rebuilds the records: snapshot, then filter. */
export function listObjects(city: City, kind?: string | string[]): CityObject[] {
  const want = kind === undefined ? null : new Set(Array.isArray(kind) ? kind : [kind]);
  const out: CityObject[] = [];
  for (const k of kinds.values()) if (!want || want.has(k.kind)) for (const o of k.list(city)) out.push(o);
  return out;
}

const SEVERITY: Record<ObjectStatus, number> = { ok: 0, warning: 1, critical: 2 };
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const has = (v: string, q: string) => v.toLowerCase().includes(q);

/** Splits free text into words and `key:value` filters (quotes keep spaces: `district:"garden quarter"`). */
export function parseSearch(text: string): { words: string[]; filters: [string, string][] } {
  const words: string[] = [];
  const filters: [string, string][] = [];
  for (const m of text.matchAll(/(\w+):"([^"]*)"|(\w+):(\S+)|"([^"]*)"|(\S+)/g)) {
    if (m[1]) filters.push([m[1].toLowerCase(), m[2]!.toLowerCase()]);
    else if (m[3]) filters.push([m[3].toLowerCase(), m[4]!.toLowerCase()]);
    else words.push((m[5] ?? m[6]!).toLowerCase());
  }
  return { words, filters };
}

function field(o: CityObject, key: string): string[] {
  switch (key) {
    case 'kind':
      return [o.kind];
    case 'type':
      return [o.type, o.name];
    case 'group':
    case 'category':
      return [o.group];
    case 'district':
      return [o.district];
    case 'status':
      return [o.status];
    case 'issue':
      return o.issues.flatMap((i) => [i, ISSUES[i]?.label ?? i]);
    case 'id':
      return [o.id];
    default:
      return [];
  }
}

/** Filters, sorts and pages a snapshot from `listObjects`. */
export function filterObjects(objects: readonly CityObject[], q: InventoryQuery = {}): InventoryPage {
  const { words, filters } = parseSearch(q.text ?? '');
  const kinds = q.kind === undefined ? null : new Set(Array.isArray(q.kind) ? q.kind : [q.kind]);
  const statuses = q.status === undefined ? null : new Set(Array.isArray(q.status) ? q.status : [q.status]);
  const exact: [string, string | undefined][] = [
    ['type', q.type],
    ['group', q.group],
    ['issue', q.issue],
  ];
  for (const [k, v] of exact) if (v) filters.push([k, v.toLowerCase()]);
  const district = q.district?.toLowerCase();
  const near = q.near;
  const r2 = near?.radius !== undefined ? near.radius * near.radius : Infinity;
  const dist2 = (o: CityObject) => (near ? (o.x - near.x) ** 2 + (o.z - near.z) ** 2 : 0);
  const items = objects.filter((o) => {
    if (kinds && !kinds.has(o.kind)) return false;
    if (statuses && !statuses.has(o.status)) return false;
    if (district && o.district.toLowerCase() !== district) return false;
    if (near && dist2(o) > r2) return false;
    for (const [k, v] of filters) if (!field(o, k).some((f) => has(f, v))) return false;
    if (words.length) {
      const hay = [
        o.id,
        o.name,
        o.type,
        o.group,
        o.district,
        o.kind,
        ...o.issues,
        ...o.issues.map((i) => ISSUES[i]?.label ?? ''),
      ];
      for (const w of words) if (!hay.some((f) => has(f, w))) return false;
    }
    return true;
  });
  const sort = q.sort ?? 'id';
  const metricSort = !['id', 'name', 'status', 'distance', 'district', 'type'].includes(sort);
  const dir = (q.desc ?? (metricSort || sort === 'status')) ? -1 : 1;
  const key = (o: CityObject): number | string =>
    sort === 'name'
      ? o.name
      : sort === 'status'
        ? SEVERITY[o.status]
        : sort === 'distance'
          ? dist2(o)
          : sort === 'district'
            ? o.district
            : sort === 'type'
              ? o.type
              : metricSort
                ? (o.metrics[sort] ?? -Infinity)
                : o.id;
  items.sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    const c = typeof ka === 'number' ? (ka as number) - (kb as number) : collator.compare(ka, kb as string);
    return c * dir || collator.compare(a.id, b.id);
  });
  const offset = Math.max(0, q.offset ?? 0);
  const limit = Math.max(0, q.limit ?? items.length);
  return { total: items.length, offset, items: items.slice(offset, offset + limit) };
}

export const queryInventory = (city: City, q: InventoryQuery = {}): InventoryPage =>
  filterObjects(listObjects(city, q.kind), q);

/** The kind owning an id's prefix. */
const kindFor = (id: string) => {
  const prefix = id.split('-')[0]!;
  for (const k of kinds.values()) if (k.prefixes.includes(prefix)) return k;
  return undefined;
};

export function getObject(city: City, id: string): CityObject | null {
  const key = id.trim().toUpperCase();
  const k = kindFor(key);
  if (!k) return null;
  return k.get ? k.get(city, key) : (k.list(city).find((o) => o.id.toUpperCase() === key) ?? null);
}

export interface ObjectInspection extends CityObject {
  issueDetails: ({ code: string } & IssueInfo)[];
  details: Record<string, unknown>;
}

/** Everything known about one object (record, issue explanations, kind-specific detail), or null. */
export function inspectObject(city: City, id: string): ObjectInspection | null {
  const o = getObject(city, id);
  if (!o) return null;
  return {
    ...o,
    issueDetails: o.issues.map((code) => ({
      code,
      ...(ISSUES[code] ?? { label: code, severity: 1 as const, hint: '' }),
    })),
    details: kinds.get(o.kind)?.details?.(city, o) ?? {},
  };
}

// ── Summary ─────────────────────────────────────────────────────────────────

export interface CountRow {
  count: number;
  warning: number;
  critical: number;
}
export interface InventorySummary {
  total: number;
  status: Record<ObjectStatus, number>;
  kinds: ({ kind: string; label: string; icon: string } & CountRow)[];
  /** Per kind and group (building categories, bridge directions, …), largest first. */
  groups: ({ kind: string; group: string } & CountRow)[];
  /** Per content type, largest first. */
  types: ({ kind: string; type: string; name: string } & CountRow)[];
  /** Objects affected per issue, most first. */
  issues: ({ code: string; label: string; severity: number } & { count: number })[];
  /** Per district (objects of every kind except districts), largest first. */
  districts: ({ name: string } & CountRow)[];
  /** Summed metrics per kind (e.g. `building.residents`). */
  totals: Record<string, number>;
}

/** Counts a snapshot: the comprehensive inventory table. */
export function summarize(objects: readonly CityObject[]): InventorySummary {
  const row = (): CountRow => ({ count: 0, warning: 0, critical: 0 });
  const bump = (r: CountRow, o: CityObject) => {
    r.count++;
    if (o.status === 'warning') r.warning++;
    if (o.status === 'critical') r.critical++;
  };
  const status: Record<ObjectStatus, number> = { ok: 0, warning: 0, critical: 0 };
  const byKind = new Map<string, CountRow>();
  const groups = new Map<string, { kind: string; group: string } & CountRow>();
  const types = new Map<string, { kind: string; type: string; name: string } & CountRow>();
  const issues = new Map<string, number>();
  const districts = new Map<string, { name: string } & CountRow>();
  const totals: Record<string, number> = {};
  const SUMMED = [
    'residents',
    'capacity',
    'workers',
    'jobs',
    'tiles',
    'length',
    'upkeep',
    'riders',
    'buildings',
  ];
  for (const o of objects) {
    status[o.status]++;
    if (!byKind.has(o.kind)) byKind.set(o.kind, row());
    bump(byKind.get(o.kind)!, o);
    const gk = `${o.kind}|${o.group}`;
    if (!groups.has(gk)) groups.set(gk, { kind: o.kind, group: o.group, ...row() });
    bump(groups.get(gk)!, o);
    const tk = `${o.kind}|${o.type}`;
    if (!types.has(tk))
      types.set(tk, { kind: o.kind, type: o.type, name: o.kind === 'building' ? o.name : o.type, ...row() });
    bump(types.get(tk)!, o);
    for (const i of o.issues) issues.set(i, (issues.get(i) ?? 0) + 1);
    if (o.kind !== 'district') {
      if (!districts.has(o.district)) districts.set(o.district, { name: o.district, ...row() });
      bump(districts.get(o.district)!, o);
    }
    if (o.kind !== 'district')
      for (const m of SUMMED)
        if (o.metrics[m] !== undefined)
          totals[`${o.kind}.${m}`] = r3((totals[`${o.kind}.${m}`] ?? 0) + o.metrics[m]!);
  }
  const bySize = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
  return {
    total: objects.length,
    status,
    kinds: inventoryKinds()
      .filter((k) => byKind.has(k.kind))
      .map((k) => ({ kind: k.kind, label: k.label, icon: k.icon, ...byKind.get(k.kind)! })),
    groups: [...groups.values()].sort(bySize),
    types: [...types.values()].sort(bySize),
    issues: [...issues]
      .map(([code, count]) => ({
        code,
        label: ISSUES[code]?.label ?? code,
        severity: ISSUES[code]?.severity ?? 1,
        count,
      }))
      .sort((a, b) => b.severity - a.severity || b.count - a.count),
    districts: [...districts.values()].sort(bySize),
    totals,
  };
}

/** Readable id for whatever a HUD selection points at (a building entity or a road tile). */
export function idForSelection(city: City, sel: { eid?: number | null; road?: number }): string | null {
  if (sel.road !== undefined) return networkIdAtTile(city, sel.road);
  if (sel.eid === undefined || sel.eid === null || sel.eid === NO_ENTITY) return null;
  return buildingId(city, sel.eid);
}

/** Building def ids and names, for agents that need the type vocabulary. */
export const buildingTypes = () =>
  buildings
    .all()
    .map((d) => ({
      type: d.id,
      name: d.name,
      group: CATEGORY_LABELS[d.category],
      code: CATEGORY_CODES[d.category],
    }));
