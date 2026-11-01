import { describe, expect, it } from 'vitest';
import { buildings } from '@/content';
import { applyScenario } from '@/sim/scenario';
import { findSites } from '@/sim/actionTools';
import { PROJECTS, PROJECT_IDS, projectStatus } from '@/sim/projects';
import { isOpen } from '@/sim/growthState';
import { dockLimit } from '@/sim/fishing';
import { makeSim } from './helpers';

/**
 * Pacing of a fresh island (Phase 22): a scripted steward plays the opening the way the guide teaches (keep power,
 * water and food ahead, build homes or work as demand asks, extend the street grid when lots run out, start each
 * unlock project once it is ready) and we time the milestones. Targets from plan v4: the first unlock in about ten
 * minutes, the Aeroline in about two hours, never broke on the way.
 */
type Sim = ReturnType<typeof makeSim>;

const has = (s: Sim, id: string) => s.city.buildingEntities().some((e) => s.city.buildingDef(e).id === id);

/** The next street to lay: the coast road extended, then rows every 7 tiles inland joined by three spines. */
function* streets(x: number, street: number): Generator<[number, number, number, number]> {
  yield [x - 34, street, x + 34, street];
  // Two more lanes down to the waterfront jobs (docks, the market garden) so one lane doesn't jam.
  for (const sx of [x - 12, x + 12]) yield [sx, street, sx, street + 7];
  for (let k = 1; k <= 12; k++) {
    const z = street - 7 * k;
    for (const sx of [x - 34, x, x + 34]) yield [sx, z + 7, sx, z];
    yield [x - 34, z, x + 34, z];
  }
}

function roadTiles(s: Sim, [x0, z0, x1, z1]: [number, number, number, number]): number[] {
  const tiles: number[] = [];
  for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      if (s.city.grid.inBounds(x, z) && !s.city.grid.road[s.city.grid.index(x, z)])
        tiles.push(s.city.grid.index(x, z));
  return tiles;
}

const count = (s: Sim, id: string) =>
  s.city.buildingEntities().filter((e) => s.city.buildingDef(e).id === id).length;

/** What the steward does next: a building id, 'road' to open more lots or ease traffic, or null to save up. */
function want(s: Sim, roads: boolean): string | null {
  const { pulse, stats } = s.city;
  if (count(s, 'fishing-dock') < Math.min(3, dockLimit(s.city, 3, 600))) return 'fishing-dock';
  if (pulse.energyRatio < 1.15) return stats.population > 1500 ? 'wind-turbine' : 'solar-spire';
  if (pulse.waterRatio < 1.15) return 'water-works';
  if (pulse.foodRatio < 1.1) return 'vertical-farm';
  if (pulse.flow < 0.8 && roads) return 'road';
  if (stats.population > 400 && !has(s, 'data-spire')) return 'data-spire';
  if (stats.population > 2400 && !has(s, 'drone-fabricator')) return 'drone-fabricator';
  // Homes standing empty and jobs unfilled: the town needs to be nicer, not bigger.
  if (stats.demandHomes < 0 && stats.demandWork < 0) return stats.happiness < 70 ? 'pocket-park' : null;
  if (stats.demandHomes > stats.demandWork)
    return stats.population > 2500 ? 'canopy-tower' : 'garden-residence';
  return stats.population > 1500 ? 'living-studio' : 'greenhouse-hub';
}

function playthrough(seed: number, minutes: number) {
  const s = makeSim(seed);
  applyScenario(s.city, 'fresh-island');
  const c = s.city;
  const home = c.districts.find((d) => d.name === 'Old Harbour')!;
  const x = Math.round((home.x0 + home.x1) / 2);
  const street = home.z0 + 8;
  const centre = { x, z: street - 10 };
  const shore = { x, z: street + 9 };
  const plan = [...streets(x, street)];
  const at: Record<string, number> = {};
  let minCredits = c.credits;
  for (let sec = 10; sec <= minutes * 60; sec += 10) {
    s.step(100);
    minCredits = Math.min(minCredits, c.credits);
    // PACE=1 prints a timeline every 5 sim-minutes, for tuning.
    if (process.env.PACE && sec % 300 === 0) {
      const t = c.stats;
      const line = `${sec / 60}m pop ${Math.round(t.population)}/${Math.round(t.capacity)} jobs ${Math.round(t.jobs)}`;
      process.stdout.write(
        `${line} ◈${Math.round(c.credits)} tax ${t.income.toFixed(1)} fish ${t.fishing.toFixed(1)} upkeep ${t.upkeep.toFixed(1)} harmony ${Math.round(t.happiness)} flow ${c.pulse.flow.toFixed(2)} next ${want(s, plan.length > 0)}\n`,
      );
    }
    for (const id of PROJECT_IDS) {
      if (isOpen(c.growth, id)) at[id] ??= sec;
      else if (projectStatus(c, id) === 'ready' && s.commands.execute('startProject', { id }))
        at[`${id}:start`] = sec;
    }
    // Saving up: once a project's criteria (bar the treasury) are met, only essentials get built until it starts.
    const saving = PROJECT_IDS.find(
      (p) =>
        projectStatus(c, p) === 'blocked' &&
        PROJECTS[p].criteria(c).every((k) => k.ok || k.label.startsWith('Treasury')),
    );
    const id = want(s, plan.length > 0);
    if (!id) continue;
    const essential = [
      'fishing-dock',
      'solar-spire',
      'wind-turbine',
      'water-works',
      'vertical-farm',
    ].includes(id);
    const reserve =
      (saving && !essential ? PROJECTS[saving].cost : 0) + (c.stats.population > 900 ? 600 : 150);
    const road = () => {
      const next = plan.shift();
      if (next) s.commands.execute('road', { tiles: roadTiles(s, next), bridges: false });
    };
    if (id === 'road') {
      if (c.credits > 300 + reserve) road();
      continue;
    }
    const def = buildings.get(id);
    if (c.credits < def.stats.cost + reserve) continue;
    const site = findSites(c, def, id === 'fishing-dock' ? shore : centre, 1, 45)[0];
    if (site) s.commands.execute('build', { def: id, x: site.x, z: site.z, rot: site.rot });
    else road();
  }
  return { s, at, minCredits, population: c.stats.population, credits: c.credits };
}

describe('fresh island pacing (Phase 22)', () => {
  it('a steady steward wakes Flora, charters the sky-lanes and raises the Aeroline in order, never broke', () => {
    const r = playthrough(Number(process.env.SEED ?? 20261024), 165);
    if (process.env.PACE)
      process.stdout.write(`${JSON.stringify({ ...r.at, minCredits: Math.round(r.minCredits) })}\n`);
    const min = (id: string) => (r.at[id] ?? Infinity) / 60;
    // Sim-minutes (1× speed); players at 2–3× see about a third to half of this. Measured on three seeds: Flora
    // 32–36, sky-lanes 97–101, the Aeroline started at 137–143.
    expect(min('flora')).toBeLessThan(45);
    expect(min('skylanes')).toBeLessThan(115);
    expect(min('aeroline:start')).toBeLessThan(160);
    expect(min('flora')).toBeLessThan(min('skylanes'));
    expect(r.minCredits).toBeGreaterThan(0);
    expect(r.population).toBeGreaterThan(6000);
  });
});
