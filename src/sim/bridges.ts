import type { CommandStack } from '@/core/Commands';
import type { Grid } from './Grid';
import type { City } from './City';
import type { SimCtx } from './systems';
import { BUILDER_NAMES, builderCode, builderFromCode, type Builder } from './builders';
import { DAY_LENGTH, PULSE_TICKS } from './pulseConst';
import { fnv1a, hash2 } from './random';
import { roadLevels, roadWear } from './roads';

/** Grid value of a bridge tile (`BRIDGE` in City.ts; repeated here so City can import this module without a cycle). */
const BRIDGE_TILE = 2;

/** A straight run of bridge tiles: start tile (x, z), length, and whether it runs along x. */
export interface BridgeSpan {
  x: number;
  z: number;
  len: number;
  alongX: boolean;
}

/** Straight runs of bridge tiles at least `min` long, row by row then column by column (deterministic). */
export function findBridgeSpans(g: Grid, min: number): BridgeSpan[] {
  const out: BridgeSpan[] = [];
  const isB = (x: number, z: number) => g.inBounds(x, z) && g.road[g.index(x, z)] === BRIDGE_TILE;
  for (const alongX of [true, false])
    for (let a = 0; a < (alongX ? g.h : g.w); a++)
      for (let b = 0; b < (alongX ? g.w : g.h);) {
        const [x, z] = alongX ? [b, a] : [a, b];
        if (!isB(x, z)) {
          b++;
          continue;
        }
        let len = 1;
        while (alongX ? isB(x + len, z) : isB(x, z + len)) len++;
        if (len >= min) out.push({ x, z, len, alongX });
        b += len;
      }
  return out;
}

// ── Named bridges (D-128) ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Every straight bridge span of `BRIDGE_MIN`+ tiles is a named object: a unique name, who built it, when, and a
 * level the steward can raise (Standard → Lantern → Grand: more lanes, lamps, then planted verges). The registry
 * follows the grid (`syncBridges` after every highway change): a span that grows or shrinks keeps its record, a
 * removed one drops it. The level lives in the `roadLevel` layer of its deck tiles (saved and hashed with the
 * highways), so traffic sees it through `roadCapacity`.
 */
export interface BridgeRecord {
  /** `<first deck tile><E|S>`: stable while the span's start stays put. */
  key: string;
  name: string;
  x: number;
  z: number;
  len: number;
  alongX: boolean;
  /** Tick it opened (founding bridges are dated before the city's first day). */
  built: number;
  by: Builder;
}

export const BRIDGE_MIN = 3;
export const BRIDGE_LEVEL_NAMES = ['Standard span', 'Lantern span', 'Grand span'] as const;
export const MAX_BRIDGE_LEVEL = 2;
export { BRIDGE_CAPACITY } from './roads';
/** Credits per deck tile to raise a bridge to level 1 / level 2. */
export const BRIDGE_UPGRADE_COST = [0, 30, 70] as const;
export const BRIDGE_LEVEL_NOTES = [
  'Two lanes on a plain deck.',
  'Widened to three lanes, with lamps along both rails: carries ×1.4.',
  'Four lanes, planted verges and gateway lights: carries ×1.9.',
] as const;

export type BridgeType = 'beam' | 'arch' | 'helix' | 'stayed' | 'suspension';
export const BRIDGE_TYPE_NAMES: Record<BridgeType, string> = {
  beam: 'Beam bridge',
  arch: 'Bloom Arch',
  helix: 'Helix bridge',
  stayed: 'Cable-stayed bridge',
  suspension: 'Suspension bridge',
};

/** The signature a span is dressed with (the renderer uses the same rule). */
export function bridgeType(sp: { x: number; z: number; len: number }): BridgeType {
  if (sp.len < 8) return 'beam';
  if (sp.len >= 45) return 'suspension';
  if (sp.len >= 28) return 'stayed';
  if (sp.len >= 14) return hash2(sp.x, sp.z, 4021) < 0.5 ? 'helix' : 'arch';
  return 'arch';
}

const FIRST = [
  'Coral',
  'Lantern',
  'Monsoon',
  'Kingfisher',
  'Tidewater',
  'Jade',
  'Hibiscus',
  'Sunrise',
  'Mangrove',
  'Pearl',
  'Orchid',
  'Heron',
  'Frangipani',
  'Lotus',
  'Banyan',
  'Saffron',
  'Driftwood',
  'Cinnamon',
  'Starfruit',
  'Rainbird',
  'Seagrass',
  'Amber',
  'Moonlit',
  'Turtle',
  'Breeze',
  'Cloudforest',
  'Ironwood',
  'Firefly',
  'Nautilus',
  'Halcyon',
] as const;
const LAST: Record<BridgeType, readonly string[]> = {
  beam: ['Footway', 'Crossing', 'Causeway'],
  arch: ['Arch', 'Bridge', 'Crossing'],
  helix: ['Helix', 'Spiral', 'Bridge'],
  stayed: ['Bridge', 'Span', 'Harp'],
  suspension: ['Gate', 'Strait Bridge', 'Skyway'],
};

const keyOf = (g: Grid, s: BridgeSpan) => `${g.index(s.x, s.z)}${s.alongX ? 'E' : 'S'}`;

function uniqueName(city: City, sp: BridgeSpan, taken: Set<string>): string {
  const seed = Math.floor(hash2(sp.x, sp.z, sp.alongX ? 811 : 977) * 1e6);
  const last = LAST[bridgeType(sp)];
  for (let k = 0; k < FIRST.length * last.length; k++) {
    const n = seed + k * 7;
    const name = `${FIRST[n % FIRST.length]} ${last[Math.floor(n / FIRST.length) % last.length]}`;
    if (!taken.has(name)) return name;
  }
  return `${FIRST[seed % FIRST.length]} Bridge ${city.bridges.length + 1}`;
}

/** Deck tiles of a bridge, from its start. */
export function bridgeTiles(g: Grid, b: Pick<BridgeRecord, 'x' | 'z' | 'len' | 'alongX'>): number[] {
  const out: number[] = [];
  for (let k = 0; k < b.len; k++) out.push(b.alongX ? g.index(b.x + k, b.z) : g.index(b.x, b.z + k));
  return out;
}

const overlaps = (a: BridgeSpan, b: BridgeSpan) =>
  a.alongX === b.alongX &&
  (a.alongX
    ? a.z === b.z && a.x < b.x + b.len && b.x < a.x + a.len
    : a.x === b.x && a.z < b.z + b.len && b.z < a.z + a.len);

/**
 * Brings the registry in line with the grid: spans keep their record (by key, else by overlap with a record
 * whose span changed), new spans get a name and `by`, and records with no span left are dropped. Deterministic
 * (span order). `founding` dates new bridges before day 1 (scenario content). Returns the records created.
 */
export function syncBridges(city: City, by: Builder, founding = false): BridgeRecord[] {
  const g = city.grid;
  const spans = findBridgeSpans(g, BRIDGE_MIN);
  const byKey = new Map(city.bridges.map((b) => [b.key, b]));
  const spanKeys = new Set(spans.map((s) => keyOf(g, s)));
  const used = new Set<BridgeRecord>();
  const taken = new Set(city.bridges.map((b) => b.name));
  const next: BridgeRecord[] = [];
  const created: BridgeRecord[] = [];
  for (const s of spans) {
    const key = keyOf(g, s);
    let rec = byKey.get(key);
    if (rec && used.has(rec)) rec = undefined;
    rec ??= city.bridges.find((b) => !used.has(b) && !spanKeys.has(b.key) && overlaps(b, s));
    if (rec) {
      Object.assign(rec, { key, x: s.x, z: s.z, len: s.len, alongX: s.alongX });
    } else {
      const name = uniqueName(city, s, taken);
      taken.add(name);
      const days = founding ? 20 + Math.floor(hash2(s.x, s.z, 53) * 900) : 0;
      rec = {
        key,
        name,
        x: s.x,
        z: s.z,
        len: s.len,
        alongX: s.alongX,
        built: city.tick - days * DAY_LENGTH * PULSE_TICKS,
        by,
      };
      created.push(rec);
    }
    used.add(rec);
    next.push(rec);
  }
  city.bridges = next;
  return created;
}

/** The named bridge with a deck tile at `tile`, if any. */
export function bridgeAt(city: City, tile: number): BridgeRecord | undefined {
  const g = city.grid;
  const x = tile % g.w;
  const z = (tile / g.w) | 0;
  return city.bridges.find((b) =>
    b.alongX ? z === b.z && x >= b.x && x < b.x + b.len : x === b.x && z >= b.z && z < b.z + b.len,
  );
}

export const bridgeByKey = (city: City, key: string) => city.bridges.find((b) => b.key === key);

/** A bridge's level (0..2): its lowest deck tile (a span extended later has new tiles at Standard). */
export function bridgeLevel(city: City, b: BridgeRecord): number {
  const lv = roadLevels(city);
  let l = MAX_BRIDGE_LEVEL;
  for (const t of bridgeTiles(city.grid, b)) l = Math.min(l, lv[t]!);
  return l;
}

/** Copies names, dates and builders from an earlier registry onto spans that still have the same key (undo). */
export function restoreBridges(city: City, earlier: readonly BridgeRecord[]): void {
  const byKey = new Map(earlier.map((b) => [b.key, b]));
  for (const b of city.bridges) {
    const e = byKey.get(b.key);
    if (e) Object.assign(b, { name: e.name, built: e.built, by: e.by });
  }
}

/** Age in whole days. */
export const bridgeAgeDays = (city: City, b: BridgeRecord): number =>
  Math.max(0, Math.floor((city.tick - b.built) / (DAY_LENGTH * PULSE_TICKS)));

export const bridgeUpgradeCost = (city: City, b: BridgeRecord): number => {
  const l = bridgeLevel(city, b);
  return l >= MAX_BRIDGE_LEVEL ? 0 : BRIDGE_UPGRADE_COST[l + 1]! * b.len;
};

export const bridgeBuilderName = (b: BridgeRecord) => BRIDGE_BUILDER[b.by];
const BRIDGE_BUILDER = BUILDER_NAMES;

/** Save form: [key, name, built, builder code] (spans are re-derived from the grid). */
export type BridgeSave = [string, string, number, string];
export const saveBridges = (city: City): BridgeSave[] =>
  city.bridges.map((b) => [b.key, b.name, b.built, builderCode(b.by)]);

/** Restores saved names, dates and builders onto the spans the loaded grid has. */
export function loadBridges(city: City, saved: readonly BridgeSave[]): void {
  syncBridges(city, 'system', true);
  const byKey = new Map(saved.map((s) => [s[0], s]));
  for (const b of city.bridges) {
    const s = byKey.get(b.key);
    if (!s) continue;
    b.name = s[1];
    b.built = s[2];
    b.by = builderFromCode(s[3]);
  }
}

export const bridgeHash = (city: City): string =>
  fnv1a(city.bridges.map((b) => `${b.key}:${b.name}:${b.built}:${b.by}:${b.len}`).join(';'));

export interface UpgradeBridgePayload {
  key: string;
}

export function registerBridgeCommands(stack: CommandStack<SimCtx>): void {
  // Raises every deck tile of a bridge one level (paid per tile). Undo restores the levels and the credits.
  stack.register<UpgradeBridgePayload, { tiles: number[]; prev: number[]; wear: number[]; cost: number }>(
    'upgradeBridge',
    {
      apply({ city }, p) {
        const b = bridgeByKey(city, p.key);
        if (!b) return null;
        const level = bridgeLevel(city, b);
        const cost = bridgeUpgradeCost(city, b);
        if (level >= MAX_BRIDGE_LEVEL || city.credits < cost) return null;
        const lv = roadLevels(city);
        const wear = roadWear(city);
        const tiles = bridgeTiles(city.grid, b);
        const undo = { tiles, prev: tiles.map((t) => lv[t]!), wear: tiles.map((t) => wear[t]!), cost };
        for (const t of tiles) lv[t] = Math.max(lv[t]!, level + 1);
        city.credits -= cost;
        city.bus.emit('road:level', { tiles });
        city.bus.emit('bridge:upgraded', { key: b.key, level: level + 1 });
        return undo;
      },
      revert({ city }, _p, u) {
        const lv = roadLevels(city);
        const wear = roadWear(city);
        u.tiles.forEach((t, i) => {
          lv[t] = u.prev[i]!;
          wear[t] = u.wear[i]!;
        });
        city.credits += u.cost;
        city.bus.emit('road:level', { tiles: u.tiles });
      },
    },
  );
}
