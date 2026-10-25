import type { BuildingRecord } from './City';
import type { SystemKey, Tier } from './pulseState';
import type { CrisisInstance } from './stewardState';

declare module '@/core/EventBus' {
  interface GameEvents {
    'city:reset': { seed: number };
    'building:added': { eid: number };
    'building:removed': { eid: number; record: BuildingRecord };
    'road:changed': { tiles: number[] };
    'stats:updated': void;
    'pulse:tier': { system: SystemKey; tier: Tier; prev: Tier };
    'crisis:forecast': { crisis: CrisisInstance };
    'crisis:start': { crisis: CrisisInstance };
    'crisis:end': { crisis: CrisisInstance };
    'road:overgrowth': { tiles: number[] };
    'loan:repaid': { id: number };
    'season:changed': { index: number };
    /** The bloom field was recomputed (renderers re-upload it). */
    'bloom:updated': void;
    /** The pedestrian-activity field was recomputed. */
    'activity:updated': void;
    /** The mobility pass ran (flow field, congestion, pod routes). */
    'mobility:updated': void;
    /** The Flora-Net pass ran (soil, drones, pod mists). */
    'floranet:updated': void;
    /** Flora-Net misted zones at (x, z) (a steward dispatch). */
    'floranet:mist': { x: number; z: number; radius: number };
    /** Corner heights changed inside this tile rectangle (land reclamation). */
    'terrain:changed': { x0: number; z0: number; x1: number; z1: number };
    /** Sea level crossed another 0.1 world units of rise. */
    'sea:rise': { level: number };
    /** Green Weaver sky-bridges were added or removed. */
    'weaver:changed': void;
    'channel:changed': { tiles: number[] };
    /** Buildings whose retrofit level changed; `origin` drives the transformation wave. */
    'buildings:level': { eids: number[]; origin?: { x: number; z: number; radius: number } };
    /** The fail clock started (seconds left) or stopped (null). */
    'steward:warning': { secondsLeft: number | null };
    'steward:replaced': { day: number; peakPopulation: number };
  }
}
export {};
