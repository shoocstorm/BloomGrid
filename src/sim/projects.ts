import type { CommandStack } from '@/core/Commands';
import { buildings } from '@/content';
import type { City } from './City';
import type { SimCtx } from './systems';
import { DAY_LENGTH, PULSE_TICKS } from './pulseConst';
import { startWonders } from './wonders';
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
  /** The button that starts it, in the project's own words (`{cat}` is the island cat's name), D-181. */
  verb: string;
  /** What the ready call-out says when every criterion is met. */
  readyLine: string;
  /** Residents it asks for (0 = none): the Goals tab keeps projects far beyond the city out of view. */
  residents: number;
  /** A project that must be done first (the Goals tab waits for it). */
  after?: UnlockId;
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
const residents = (city: City, n: number): Criterion => ({
  label: `${fmt(n)} residents (${fmt(city.stats.population)})`,
  ok: city.stats.population >= n,
  progress: toward(city.stats.population, n),
  build: 'garden-residence',
});
const building = (city: City, id: string, label: string): Criterion => ({ label, ok: has(city, id), build: id });
const fmt = (n: number) => Math.round(n).toLocaleString();

export const PROJECTS: Record<UnlockId, ProjectDef> = {
  // The island's cat (D-178): the first thing a fresh island earns, and the cheapest; it is a friendship rather
  // than an investment. The criteria are what would make a stray stay: fish, a sunny garden, a lively town.
  cat: {
    id: 'cat',
    verb: "Adopt {cat}",
    readyLine: "The stray has been eyeing your fish all week. Leave the door open and it may just stay.",
    residents: 250,
    name: 'Befriend the stray',
    icon: 'happy',
    description:
      'A shy stray watches the harbour from the rooftops. Leave out fresh fish, plant a sunny garden, and it may decide to stay.',
    unlocks:
      "The island's cat: a rooftop companion that follows you, talks to you, warns you of trouble and loves a pet.",
    cost: 250,
    // 8 s at 1×: earning its trust, then the cutscene.
    days: 8 / DAY_LENGTH,
    criteria: (city) => [
      {
        label: `Two Fishing Boat Docks for fresh fish (${city.buildingEntities().filter((e) => city.buildingDef(e).id === 'fishing-dock').length})`,
        ok: city.buildingEntities().filter((e) => city.buildingDef(e).id === 'fishing-dock').length >= 2,
        build: 'fishing-dock',
      },
      {
        label: 'A park or garden for sunny naps',
        ok: city.buildingEntities().some((e) => city.buildingDef(e).category === 'nature'),
        build: 'pocket-park',
      },
      residents(city, 250),
    ],
  },
  skylanes: {
    id: 'skylanes',
    verb: "Open the skies",
    readyLine: "The pods are built and the pilots are waiting. The air over the island is yours to license.",
    residents: 2000,
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
    verb: "Raise the Aeroline",
    readyLine: "Power to spare and a city ready to ride: the maglev loop can rise.",
    residents: 5000,
    after: 'skylanes',
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
    verb: "Wake Flora",
    readyLine: "The Data Spire hums. Flora is ready to open her eyes.",
    residents: 0,
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
  // The late-game spectacle (D-144): drones, the cruise ferry and the jet are earned like the Aeroline.
  police: {
    id: 'police',
    verb: "Found the Watch",
    readyLine: "The fire crews are ready to take the oath: the island can have its own watch.",
    residents: 3000,
    name: 'Aegis Watch charter',
    icon: 'drone',
    description: 'Found the island police and train the first drone crews, with the fire watch as their backbone.',
    unlocks:
      'The Aegis Watch Precinct and the patrol drones: drone sorties, bay patrols and a command that answers fires.',
    cost: 5000,
    days: 1,
    criteria: (city) => [
      residents(city, 3000),
      building(city, 'ember-watch', 'An Ember Watch Station (the crews start as fire watch)'),
      {
        label: `Harmony 60 or more (${Math.round(city.stats.happiness)})`,
        ok: city.stats.happiness >= 60,
        progress: toward(city.stats.happiness, 60),
        build: 'pocket-park',
      },
    ],
  },
  cruise: {
    id: 'cruise',
    verb: "Launch the Tidesong",
    readyLine: "A wonder has risen and the radar is up: the Tidesong can set sail.",
    residents: 4000,
    name: 'Tidesong cruise line',
    icon: 'ferry',
    description: 'Commission the Tidesong and lay out her pier: a cruise ferry that sails the sea wonders.',
    unlocks: 'The cruise ferry Tidesong and her pier: voyages to the sea wonders, charters, deck shows and rides aboard.',
    cost: 8000,
    days: 1.5,
    criteria: (city) => {
      const risen = city.growth.wonders.length - startWonders().length;
      return [
        residents(city, 4000),
        { label: `A sea wonder risen beyond the lighthouse and the whales (${Math.max(0, risen)})`, ok: risen >= 1 },
        building(city, 'weather-radar', 'A Weather Radar to forecast the crossings'),
      ];
    },
  },
  skyguard: {
    id: 'skyguard',
    verb: "Wings up",
    readyLine: "The airfield is ready and the radar is watching: the Sky Guard can take to the sky.",
    residents: 8000,
    after: 'police',
    name: 'Sky Guard air wing',
    icon: 'jet',
    description: 'Stand up the island’s air guard: an airfield crew, a radar picture and the Aegis Watch behind it.',
    unlocks: 'The Sky Guard jet: patrol passes over the city, a chase cam, victory rolls, afterburners and display smoke.',
    cost: 18000,
    days: 2,
    criteria: (city) => [
      residents(city, 8000),
      { label: 'The Aegis Watch charter', ok: isOpen(city.growth, 'police') },
      building(city, 'zephyr-airport', 'A Zephyr Airship Port (the airfield)'),
      building(city, 'weather-radar', 'A Weather Radar (the radar picture)'),
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

/** How far past the city's population a locked project may ask and still show in the Goals tab. */
export const REACH = 3;

/**
 * What the Goals tab lists (D-180): every project under way or ready, and the locked ones within reach (their
 * prerequisite done, residents asked no more than `REACH` × the population; the nearest one is always shown).
 * The rest wait, counted in `later` with the smallest resident gate among them.
 */
export function projectsInView(city: City): { shown: UnlockId[]; done: UnlockId[]; later: number; next: number } {
  const pop = city.stats.population;
  const done: UnlockId[] = [];
  const shown: UnlockId[] = [];
  const locked: UnlockId[] = [];
  for (const id of PROJECT_IDS) {
    const st = projectStatus(city, id);
    if (st === 'open') done.push(id);
    else if (st !== 'blocked') shown.push(id);
    else {
      const after = PROJECTS[id].after;
      if (!after || isOpen(city.growth, after)) locked.push(id);
    }
  }
  const nearest = Math.min(Infinity, ...locked.map((id) => PROJECTS[id].residents));
  const reach = Math.max(pop * REACH, nearest);
  let later = 0;
  let next = Infinity;
  for (const id of PROJECT_IDS) {
    if (done.includes(id) || shown.includes(id)) continue;
    if (locked.includes(id) && PROJECTS[id].residents <= reach) shown.push(id);
    else {
      later++;
      // Only a gate the city can grow into now (not one waiting on its prerequisite).
      if (locked.includes(id)) next = Math.min(next, PROJECTS[id].residents);
    }
  }
  shown.sort((a, b) => PROJECT_IDS.indexOf(a) - PROJECT_IDS.indexOf(b));
  return { shown, done, later, next: Number.isFinite(next) ? next : 0 };
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
