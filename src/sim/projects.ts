import type { CommandStack } from '@/core/Commands';
import { buildings } from '@/content';
import type { City } from './City';
import type { SimCtx } from './systems';
import { DAY_LENGTH, PULSE_TICKS } from './pulseConst';
import { UNLOCK_NAMES, isOpen, type ProjectRun, type UnlockId } from './growthState';

/**
 * Unlock projects (Phase 16, D-072). On a fresh island the late-game systems are earned: each project lists its
 * criteria, costs credits up front and takes some sim days to complete; then the buildings that need it
 * (`requires` on a def) can be built. Without progression (showcase city, tests) everything is already open.
 */
export interface Criterion {
  label: string;
  ok: boolean;
  /** A building type that meets it: the HUD offers to build one (D-092). */
  build?: string;
  /** 0..1 toward it, for numeric targets (residents, credits). */
  progress?: number;
  /** A treasury target: the HUD points at the budget. */
  credits?: boolean;
}

export interface ProjectDef {
  id: UnlockId;
  name: string;
  icon: string;
  description: string;
  /** What finishing it opens up. */
  unlocks: string;
  cost: number;
  /** Sim days of work once started. */
  days: number;
  criteria(city: City): Criterion[];
}

const has = (city: City, id: string) => city.buildingEntities().some((e) => city.buildingDef(e).id === id);
/** The cheapest building the city may place now that makes power (what "build a power plant" should pick). */
export const cheapestPower = (city: City) =>
  buildings
    .all()
    .filter((d) => d.category === 'energy' && d.stats.energy > 0 && !d.landmark && !lockReason(city, d.id))
    .sort((a, b) => a.stats.cost - b.stats.cost || a.id.localeCompare(b.id))[0]?.id;
const toward = (have: number, need: number) => Math.max(0, Math.min(1, have / need));
const fmt = (n: number) => Math.round(n).toLocaleString();

export const PROJECTS: Record<UnlockId, ProjectDef> = {
  skylanes: {
    id: 'skylanes',
    name: 'Sky-lane charter',
    icon: '⇶',
    description: 'License the air corridors over the island and train the first pod pilots.',
    unlocks:
      'Pod Docks, Pod Interchanges and the Skylane Nexus: commuters fly instead of jamming the streets.',
    cost: 3000,
    days: 1,
    criteria: (city) => [
      { label: `${fmt(2000)} residents (${fmt(city.stats.population)})`, ok: city.stats.population >= 2000, progress: toward(city.stats.population, 2000), build: 'garden-residence' },
      { label: 'A Drone Fabricator to build the pods', ok: has(city, 'drone-fabricator'), build: 'drone-fabricator' },
    ],
  },
  aeroline: {
    id: 'aeroline',
    name: 'Build the Aeroline',
    icon: '◇',
    description: 'Raise the maglev loop over the island: four stations, two days of construction.',
    unlocks: 'Aeroline stations: fast trains round the island and pod transfers at every station.',
    cost: 15000,
    days: 2,
    criteria: (city) => [
      { label: `${fmt(5000)} residents (${fmt(city.stats.population)})`, ok: city.stats.population >= 5000, progress: toward(city.stats.population, 5000), build: 'garden-residence' },
      {
        label: `Power to spare: 110% of demand (${Math.round(city.pulse.energyRatio * 100)}%)`,
        ok: city.pulse.energyRatio >= 1.1,
        progress: toward(city.pulse.energyRatio, 1.1),
        build: cheapestPower(city),
      },
      { label: 'The Sky-lane charter', ok: isOpen(city.growth, 'skylanes') },
    ],
  },
  flora: {
    id: 'flora',
    name: 'Wake Flora',
    icon: '✧',
    description:
      'Bring the city assistant online. She thinks on the Data Spire, and every request costs credits.',
    unlocks: 'Flora, the city assistant: answers, advice and actions on request (credits per request).',
    cost: 1200,
    // 5 s at 1× (D-093, D-104): a short build-up to the awakening, not a wait.
    days: 5 / DAY_LENGTH,
    criteria: (city) => [
      {
        label: 'A power plant',
        ok: city.buildingEntities().some((e) => city.buildingDef(e).stats.energy > 0),
        build: cheapestPower(city),
      },
      { label: 'A Data Spire', ok: has(city, 'data-spire'), build: 'data-spire' },
      {
        label: `${fmt(1500)} credits saved (${fmt(city.credits)})`,
        ok: city.credits >= 1500,
        progress: toward(city.credits, 1500),
        credits: true,
      },
    ],
  },
};

export const PROJECT_IDS = Object.keys(PROJECTS) as UnlockId[];

export type ProjectStatus = 'open' | 'running' | 'ready' | 'blocked';

/** Where a project stands: done (open), under way, startable, or blocked by criteria or credits. */
export function projectStatus(city: City, id: UnlockId): ProjectStatus {
  if (isOpen(city.growth, id)) return 'open';
  if (city.growth.projects.some((p) => p.id === id)) return 'running';
  const def = PROJECTS[id];
  return def.criteria(city).every((c) => c.ok) && city.credits >= def.cost ? 'ready' : 'blocked';
}

/** 0..1 progress of a running project. */
export function projectProgress(city: City, run: ProjectRun): number {
  return Math.min(1, (city.tick - run.startTick) / Math.max(1, run.endTick - run.startTick));
}

/** Why a building can't be placed yet, or null (also used by `City.checkPlacement`). */
export function lockReason(city: City, defId: string): string | null {
  const req = buildings.get(defId).requires;
  if (!req || isOpen(city.growth, req)) return null;
  return `Locked: needs ${UNLOCK_NAMES[req]}`;
}

/** Once per pulse: finished projects unlock their buildings and announce it. */
export function updateProjects(city: City): void {
  const g = city.growth;
  for (let i = g.projects.length - 1; i >= 0; i--) {
    const run = g.projects[i]!;
    if (city.tick < run.endTick) continue;
    g.projects.splice(i, 1);
    if (!g.unlocked.includes(run.id)) g.unlocked.push(run.id);
    city.bus.emit('project:done', { id: run.id });
  }
}

export function registerProjectCommands(stack: CommandStack<SimCtx>): void {
  stack.register<{ id: UnlockId }, ProjectRun>('startProject', {
    apply({ city }, p) {
      if (!PROJECTS[p.id] || projectStatus(city, p.id) !== 'ready') return null;
      const def = PROJECTS[p.id];
      const run: ProjectRun = {
        id: p.id,
        startTick: city.tick,
        endTick: city.tick + Math.round(def.days * DAY_LENGTH * PULSE_TICKS),
        cost: def.cost,
      };
      city.credits -= def.cost;
      city.growth.projects.push(run);
      city.bus.emit('project:start', { id: p.id });
      return run;
    },
    revert({ city }, _p, run) {
      // Undo before completion cancels the work and refunds it; a finished project stays finished.
      const i = city.growth.projects.findIndex((r) => r.id === run.id && r.startTick === run.startTick);
      if (i < 0) return;
      city.growth.projects.splice(i, 1);
      city.credits += run.cost;
    },
  });

  stack.register<{ name: string }, { was: string }>('nameCity', {
    apply({ city }, p) {
      const name = p.name.replace(/\s+/g, ' ').trim().slice(0, 32);
      if (!name || name === city.growth.name) return null;
      const was = city.growth.name;
      city.growth.name = name;
      city.bus.emit('city:named', { name });
      return { was };
    },
    revert({ city }, _p, u) {
      city.growth.name = u.was;
      city.bus.emit('city:named', { name: u.was });
    },
  });
}
