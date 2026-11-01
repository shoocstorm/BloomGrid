import type { CommandStack } from '@/core/Commands';
import { Building, Service } from '@/ecs/components';
import type { City } from './City';
import type { CrisisInstance, Modifiers } from './stewardState';
import type { SimCtx } from './systems';
import { PULSE_TICKS } from './pulseConst';
import { forecastCrisis, leadFor, registerCrisis } from './crises';
import { damageBuilding, ignite, isRuined } from './hazards';
import { defenceList, isProtected } from './coast';
import { wonderVisible } from './wonders';

/**
 * Tornadoes and tsunamis, and what the steward can do about them (Phase 21, D-076).
 *
 * A **tornado** touches down upwind of a built-up spot and tracks across the city at ~0.8 tiles/s with a wobble:
 * buildings within 3 tiles take damage each second (turbines spinning in its path most, unless feathered), and it
 * can start fires. Parks and gardens near its track act as windbreaks (up to 60% less force), Storm Shelters keep
 * residents safe (less harmony lost). A **tsunami** follows a strong offshore earthquake (or comes on its own,
 * rarely): after a warning, the sea surges up the coast; low buildings that no seawall protects flood and take
 * damage. Closing the Tide Gates cuts the surge by 40%, an evacuation siren cuts the residents displaced by 70%,
 * and a Weather Radar doubles the warning for both. Each incident records what prevention did.
 */

const centreOf = (e: number) =>
  [Building.x[e]! + Building.w[e]! / 2, Building.z[e]! + Building.d[e]! / 2] as const;

/** Buildings with their centre within r tiles of (x, z). */
function within(city: City, x: number, z: number, r: number): number[] {
  return city.buildingEntities().filter((e) => {
    const [cx, cz] = centreOf(e);
    return (cx - x) ** 2 + (cz - z) ** 2 <= r * r;
  });
}

/** Share of residents near (x, z) a Storm Shelter covers (0..1). */
function sheltered(city: City, x: number, z: number): number {
  for (const e of city.buildingEntities()) {
    const s = city.buildingDef(e).shelter;
    if (!s || Service.off[e]) continue;
    const [cx, cz] = centreOf(e);
    if ((cx - x) ** 2 + (cz - z) ** 2 <= s.radius * s.radius) return 1;
  }
  return 0;
}

const note = (c: CrisisInstance, text: string) => {
  const list = (c.prevented ??= []);
  if (!list.includes(text)) list.push(text);
};

registerCrisis({
  id: 'tornado',
  name: 'Tornado',
  icon: '🌪',
  description:
    'A funnel touches down and tracks across the city, wrecking what it passes: turbines spinning in its path suffer most, and it can start fires.',
  prep: 'Feather the wind turbines, build parks as windbreaks and Storm Shelters near homes; a Weather Radar gives longer warning.',
  lead: 20,
  duration: 45,
  weight: () => 0.35,
  begin(city, c) {
    const ents = city.buildingEntities();
    if (!ents.length) return;
    const [tx, tz] = centreOf(ents[Math.floor(city.rng.next() * ents.length)]!);
    const a = city.rng.next() * Math.PI * 2;
    const speed = 0.8;
    // Start upwind, so it crosses the target spot half-way through.
    const back = speed * ((c.endTick - c.startTick) / PULSE_TICKS) * 0.5;
    [c.x, c.z, c.radius] = [tx - Math.cos(a) * back, tz - Math.sin(a) * back, 3];
    [c.vx, c.vz] = [Math.cos(a) * speed, Math.sin(a) * speed];
    c.saved = 0;
  },
  apply(city, c, env, m) {
    const shelter = c.x !== undefined ? sheltered(city, c.x, c.z!) : 0;
    m.harmony -= 4 * c.severity * env * (1 - 0.6 * shelter);
    m.rain = Math.max(m.rain, 0.5 * env);
  },
});

registerCrisis({
  id: 'tsunami',
  name: 'Tsunami',
  icon: '🌊',
  description:
    'A wave from an offshore earthquake surges up the coast. Low waterfront buildings that no seawall protects flood and are damaged or wrecked.',
  prep: 'Sound the evacuation siren (fewer residents caught), close the Tide Gates (a lower surge), build Mangrove Seawalls along low coasts.',
  lead: 40,
  duration: 40,
  weight: () => 0.12,
  begin(city, c) {
    // The wave comes in from the open sea on one side of the island.
    const a = city.rng.next() * Math.PI * 2;
    const S = city.size;
    [c.x, c.z, c.radius] = [S / 2 + Math.cos(a) * S * 0.62, S / 2 + Math.sin(a) * S * 0.62, S];
    c.saved = 0;
  },
  apply(_city, c, env, m) {
    m.surge = Math.max(m.surge, surge(c) * env);
    m.harmony -= 5 * c.severity * env * (c.evacuated ? 0.5 : 1);
  },
});

/** Peak surge height (world units) of a tsunami: lower with the Tide Gates closed. */
export const surge = (c: CrisisInstance) => (0.9 + 0.6 * c.severity) * (c.gates ? 0.6 : 1);

/**
 * Per pulse, after the crises and hazards: the tornado moves and wrecks, the tsunami floods and damages, and a
 * strong earthquake may send a tsunami (forecast with its warning, longer with a radar).
 */
export function updateDisasters(city: City, m: Modifiers): void {
  for (const c of city.steward.crises) {
    if (c.def === 'earthquake' && c.phase === 'active' && !c.rolled) {
      c.rolled = true;
      if (city.rng.next() < 0.3 * c.severity)
        forecastCrisis(city, 'tsunami', c.severity, leadFor(city, 'tsunami'));
    }
    if (c.phase !== 'active' || c.x === undefined) continue;
    const t = (city.tick - c.startTick) / Math.max(1, c.endTick - c.startTick);
    const env = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    if (c.def === 'tornado') tornadoStep(city, c, env);
    else if (c.def === 'tsunami') tsunamiStep(city, c, env, m);
  }
}

function tornadoStep(city: City, c: CrisisInstance, env: number): void {
  // A wobbling track.
  const wob = (city.rng.next() - 0.5) * 0.5;
  [c.vx, c.vz] = [
    c.vx! * Math.cos(wob * 0.2) - c.vz! * Math.sin(wob * 0.2),
    c.vx! * Math.sin(wob * 0.2) + c.vz! * Math.cos(wob * 0.2),
  ];
  c.x! += c.vx!;
  c.z! += c.vz!;
  // Windbreaks: parks and gardens within 8 tiles soak up its force.
  const parks = within(city, c.x!, c.z!, 8).filter((e) => city.buildingDef(e).category === 'nature').length;
  const shield = Math.min(0.6, parks * 0.08);
  for (const e of within(city, c.x!, c.z!, c.radius ?? 3)) {
    if (isRuined(city, e)) continue;
    const def = city.buildingDef(e);
    const spinning = def.id === 'wind-turbine' && !Service.off[e];
    const raw = (0.09 + (spinning ? 0.2 : 0)) * c.severity * env;
    const before = city.credits;
    damageBuilding(city, e, raw * (1 - shield), 'tornado', c);
    if (shield > 0) c.saved = (c.saved ?? 0) + ((before - city.credits) / (1 - shield)) * shield;
    if (city.rng.next() < 0.015 * env) ignite(city, e, 'tornado', 0.3, c);
  }
  if (shield >= 0.16)
    note(c, `Windbreak parks along its track absorbed up to ${Math.round(shield * 100)}% of its force`);
  if (sheltered(city, c.x!, c.z!))
    note(c, 'Storm Shelters kept residents in its path safe (harmony loss −60%)');
}

function tsunamiStep(city: City, c: CrisisInstance, env: number, m: Modifiers): void {
  const level = m.surge;
  if (level <= 0.05) return;
  const defences = defenceList(city);
  const shore = city.fields.shore;
  let dry = 0;
  for (const e of city.buildingEntities()) {
    const def = city.buildingDef(e);
    if (def.floodproof || isRuined(city, e)) continue;
    const [x, z, w, d] = [Building.x[e]!, Building.z[e]!, Building.w[e]!, Building.d[e]!];
    if (city.grid.rangeOver(x, z, w, d).min >= level) continue;
    const [cx, cz] = centreOf(e);
    // The wave breaks on the waterfront: only buildings within ~8 tiles of the sea take its force (the shore field
    // saturates at 8).
    if (shore[city.grid.index(Math.floor(cx), Math.floor(cz))]! >= 8) continue;
    if (isProtected(defences, cx, cz, level)) {
      dry++;
      continue;
    }
    // Flooded by the wave: evacuated (nothing works) for the pulse, and battered.
    m.down.add(e);
    damageBuilding(city, e, 0.05 * c.severity * env, 'tsunami', c);
  }
  if (dry) note(c, `Seawalls kept ${dry} low buildings dry`);
  if (c.gates) note(c, 'The closed Tide Gates cut the surge by 40%');
  if (c.evacuated) note(c, 'The evacuation siren cut the residents caught by 70%');
}

/** A tornado or tsunami the steward can still act on (forecast or active), or undefined. */
const threat = (city: City, def: string) => city.steward.crises.find((c) => c.def === def);

export const EVACUATE_COST = 300;
export const GATES_COST = 500;

/** Why the Tide Gates can't be closed now, or null. */
export function gatesBlocker(city: City): string | null {
  const c = threat(city, 'tsunami');
  if (!c) return 'No tsunami is coming.';
  if (c.gates) return 'The Tide Gates are already closed.';
  if (!wonderVisible(city, 'tideGates'))
    return 'The Tide Gates have not risen yet (a sea wonder still to discover).';
  if (city.credits < GATES_COST) return `Not enough credits (${GATES_COST}).`;
  return null;
}

export function evacuateBlocker(city: City): string | null {
  const c = city.steward.crises.find((x) => (x.def === 'tsunami' || x.def === 'tornado') && !x.evacuated);
  if (!c) return 'No tornado or tsunami to evacuate for.';
  if (city.credits < EVACUATE_COST) return `Not enough credits (${EVACUATE_COST}).`;
  return null;
}

export function registerDisasterCommands(stack: CommandStack<SimCtx>): void {
  stack.register<Record<string, never>, { id: number }>('evacuate', {
    apply({ city }) {
      if (evacuateBlocker(city)) return null;
      const c = city.steward.crises.find(
        (x) => (x.def === 'tsunami' || x.def === 'tornado') && !x.evacuated,
      )!;
      c.evacuated = true;
      city.credits -= EVACUATE_COST;
      return { id: c.id };
    },
    revert({ city }, _p, u) {
      const c = city.steward.crises.find((x) => x.id === u.id);
      if (c) c.evacuated = false;
      city.credits += EVACUATE_COST;
    },
  });
  stack.register<Record<string, never>, { id: number }>('closeTideGates', {
    apply({ city }) {
      if (gatesBlocker(city)) return null;
      const c = threat(city, 'tsunami')!;
      c.gates = true;
      city.credits -= GATES_COST;
      return { id: c.id };
    },
    revert({ city }, _p, u) {
      const c = city.steward.crises.find((x) => x.id === u.id);
      if (c) c.gates = false;
      city.credits += GATES_COST;
    },
  });
}
