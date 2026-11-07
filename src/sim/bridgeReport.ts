import type { City } from './City';
import {
  BRIDGE_CAPACITY,
  BRIDGE_LEVEL_NAMES,
  BRIDGE_LEVEL_NOTES,
  BRIDGE_TYPE_NAMES,
  MAX_BRIDGE_LEVEL,
  bridgeAgeDays,
  bridgeLevel,
  bridgeTiles,
  bridgeType,
  bridgeUpgradeCost,
  type BridgeRecord,
} from './bridges';
import { BUILDER_NAMES } from './builders';
import { TILE_CAPACITY } from './mobility';

/** Everything the bridge inspector, the inventory and Flora show about one named bridge (D-128). */
export interface BridgeReport {
  name: string;
  type: string;
  length: number;
  level: number;
  levelName: string;
  levelNote: string;
  ageDays: number;
  builtBy: string;
  /** Commuters per pulse the deck carries before it jams (per lane set, whole span). */
  capacity: number;
  /** Mean and peak load / capacity over the deck tiles (0..1+). */
  traffic: number;
  peak: number;
  /** Commuters crossing per pulse, about. */
  flow: number;
  /** Districts at either end (same name twice for a bridge inside one area). */
  ends: [string, string];
  /** Next level: name, credits, what it adds; null at the top. */
  next: { name: string; cost: number; note: string; capacity: number } | null;
}

export function bridgeReport(city: City, b: BridgeRecord): BridgeReport {
  const g = city.grid;
  const level = bridgeLevel(city, b);
  const traffic = g.layer<Float32Array>('traffic');
  let sum = 0;
  let peak = 0;
  for (const t of bridgeTiles(g, b)) {
    const v = traffic?.[t] ?? 0;
    sum += v;
    peak = Math.max(peak, v);
  }
  const mean = sum / Math.max(1, b.len);
  const cap = (l: number) => Math.round(TILE_CAPACITY * BRIDGE_CAPACITY[l]!);
  const [ax, az] = b.alongX ? [b.x - 1, b.z] : [b.x, b.z - 1];
  const [bx, bz] = b.alongX ? [b.x + b.len, b.z] : [b.x, b.z + b.len];
  return {
    name: b.name,
    type: BRIDGE_TYPE_NAMES[bridgeType(b)],
    length: b.len,
    level,
    levelName: BRIDGE_LEVEL_NAMES[level]!,
    levelNote: BRIDGE_LEVEL_NOTES[level]!,
    ageDays: bridgeAgeDays(city, b),
    builtBy: BUILDER_NAMES[b.by],
    capacity: cap(level),
    traffic: Math.round(mean * 100) / 100,
    peak: Math.round(peak * 100) / 100,
    flow: Math.round(mean * cap(level)),
    ends: [city.districtAt(ax, az) ?? 'open country', city.districtAt(bx, bz) ?? 'open country'],
    next:
      level < MAX_BRIDGE_LEVEL
        ? {
            name: BRIDGE_LEVEL_NAMES[level + 1]!,
            cost: bridgeUpgradeCost(city, b),
            note: BRIDGE_LEVEL_NOTES[level + 1]!,
            capacity: cap(level + 1),
          }
        : null,
  };
}
