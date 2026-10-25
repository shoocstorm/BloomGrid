/**
 * ECS components as SoA typed arrays (bitecs). Keep components small and numeric so the
 * simulation can later run in a worker with SharedArrayBuffer.
 */
export const MAX_ENTITIES = 1 << 17;

export const Building = {
  /** Index into the building registry. */
  def: new Uint16Array(MAX_ENTITIES),
  x: new Int16Array(MAX_ENTITIES),
  z: new Int16Array(MAX_ENTITIES),
  rot: new Uint8Array(MAX_ENTITIES),
  w: new Uint8Array(MAX_ENTITIES),
  d: new Uint8Array(MAX_ENTITIES),
  /** 0 = original, 1 = Bloom Retrofit (district transformation). */
  level: new Uint8Array(MAX_ENTITIES),
};

/** Living greenery level 0..1 — drives membrane moss coverage and staged plant growth. */
export const Greenery = {
  value: new Float32Array(MAX_ENTITIES),
  rate: new Float32Array(MAX_ENTITIES),
};

/** Problem flags (bitmask) shown to the player as building alerts. */
export const Problem = {
  NO_ROAD: 1,
  NO_POWER: 2,
  NO_WATER: 4,
  UNSTAFFED: 8,
  FLOODED: 16,
  NEGLECTED: 32,
  OFFLINE: 64,
} as const;

/**
 * Utility service state, written once per pulse (1 s) by the City Pulse systems.
 * `occupancy` is residents / capacity for homes, staffing ratio for workplaces.
 */
export const Service = {
  network: new Int32Array(MAX_ENTITIES).fill(-1),
  power: new Float32Array(MAX_ENTITIES),
  water: new Float32Array(MAX_ENTITIES),
  occupancy: new Float32Array(MAX_ENTITIES),
  problems: new Uint8Array(MAX_ENTITIES),
  /** Physical condition 0..1: decays under austerity, flooding and abandonment. */
  condition: new Float32Array(MAX_ENTITIES).fill(1),
  /** 1 when a symbiotic partner is nearby (see `sim/bloom.ts`). */
  paired: new Uint8Array(MAX_ENTITIES),
  /** Bloom field at the building (0..1), sampled each pulse. */
  bloom: new Float32Array(MAX_ENTITIES),
  /** Pod Docks: commuters flown per pulse (see `sim/mobility.ts`). */
  riders: new Float32Array(MAX_ENTITIES),
};
