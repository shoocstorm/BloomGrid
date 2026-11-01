import type { BuildingRecord } from './City';
import type { SystemKey, Tier } from './pulseState';
import type { CrisisInstance, FireIncident, IncidentRecord } from './stewardState';
import type { FireworkKind, FireworkShow, ShowRecord } from './fireworksState';
import type { UnlockId } from './growthState';

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
    /** Highway tiles whose level changed (D-096). */
    'road:level': { tiles: number[] };
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
    /** Hazards (D-050): a fire broke out / went out; a building was ruined; the ground shook; lightning struck. */
    'fire:start': { fire: FireIncident; eid: number };
    'fire:end': { fire: FireIncident; ruined: boolean };
    'building:ruined': { eid: number; cause: string };
    'quake:shock': { x: number; z: number; radius: number; magnitude: number; aftershock: boolean };
    'lightning:strike': { x: number; z: number; y: number; eid: number; fire: boolean };
    /** A crisis or fire was added to the incident log. */
    'incident:logged': { record: IncidentRecord };
    /** Fireworks (D-068): a show started; shells went up this pulse (renderers launch them); a show ended. */
    'fireworks:start': { show: FireworkShow };
    'fireworks:volley': { show: FireworkShow; kinds: FireworkKind[]; finale: boolean };
    'fireworks:end': { record: ShowRecord };
    /** Progression (D-072): an unlock project started / finished; a sea wonder was discovered; the city was named. */
    'project:start': { id: UnlockId };
    'project:done': { id: UnlockId };
    'wonder:discovered': { id: string; name: string };
    'city:named': { name: string };
    /** Levels and ageing (D-073): a building changed level (grew, was upgraded, or an upgrade was undone); renovated. */
    'building:tier': { eid: number; tier: number; paid: boolean };
    'building:renovated': { eid: number };
    /** Visible damage and switches (D-075): repaired (a ruin rebuilt when `ruined`); switched off or on. */
    'building:repaired': { eid: number; ruined: boolean };
    'building:switched': { eid: number; off: boolean };
    /** A consequence rule came into force or eased off (D-074). */
    consequence: { rule: string; kind: 'start' | 'end'; text: string };
  }
}
export {};
