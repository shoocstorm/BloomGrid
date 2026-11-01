import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { buildings } from '@/content';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { PROJECTS, projectStatus } from '@/sim/projects';
import { floraBlocker, floraCost } from '@/sim/flora';
import { wonderVisible } from '@/sim/wonders';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { AgentToolRegistry } from '@/core/AgentTools';
import type { ActionCtx } from '@/sim/actionTools';
import { growthTools } from '@/sim/growthTools';
import { cityBrief } from '@/ai/brief';
import { plainIntent } from '@/ai/agent';
import { makeSim } from './helpers';

const seconds = (s: ReturnType<typeof makeSim>, n: number) => s.step(n * 10);

function fresh(seed = 20261024) {
  const s = makeSim(seed);
  applyScenario(s.city, 'fresh-island');
  return s;
}
const count = (s: ReturnType<typeof makeSim>, id: string) =>
  s.city.buildingEntities().filter((e) => s.city.buildingDef(e).id === id).length;

describe('fresh island start (Phase 16, D-072)', () => {
  it('founds a fishing hamlet with progression on, two wonders and nothing unlocked', () => {
    for (const seed of [20261024, 1337, 7]) {
      const s = fresh(seed);
      expect(s.city.growth.progression).toBe(true);
      expect(count(s, 'fishing-dock')).toBe(1);
      expect(count(s, 'garden-residence')).toBeGreaterThanOrEqual(6);
      expect(count(s, 'water-works')).toBe(1);
      expect(count(s, 'solar-spire')).toBeGreaterThanOrEqual(1);
      expect(s.city.growth.wonders).toEqual(['lighthouse', 'whales']);
      expect(wonderVisible(s.city, 'dome')).toBe(false);
    }
  });

  it('pays its way: 30 sim-minutes on fishing alone without going broke', () => {
    const s = fresh();
    seconds(s, 1800);
    expect(s.city.credits).toBeGreaterThan(1500);
    expect(s.city.growth.fishIncome).toBeGreaterThan(500);
    expect(s.city.pulse.tiers.budget).toBeLessThanOrEqual(1);
    expect(s.city.stats.energyProduced).toBeGreaterThanOrEqual(s.city.stats.energyUsed);
  });

  it('overfishing: more docks than the sea can feed bring in less per boat', () => {
    const run = (docks: number) => {
      const s = fresh();
      s.city.credits += 1e5;
      s.city.stats.population = 6000; // room for more docks
      const def = buildings.get('fishing-dock');
      let placed = 0;
      for (let z = 0; z < s.city.size && placed < docks - 1; z++)
        for (let x = 0; x < s.city.size && placed < docks - 1; x++)
          if (
            s.city.checkPlacement(def, x, z, 0).ok &&
            s.commands.execute('build', { def: def.id, x, z, rot: 0 })
          )
            placed++;
      seconds(s, 900);
      return s.city.growth.fish;
    };
    expect(run(6)).toBeLessThan(run(1));
  });

  it('locks pod hubs and Aeroline stations until their projects finish; projects cost and take time', () => {
    const s = fresh();
    const c = s.city;
    const spot = (id: string) => {
      const def = buildings.get(id);
      for (let z = 0; z < c.size; z += 3)
        for (let x = 0; x < c.size; x += 3) {
          const r = c.checkPlacement(def, x, z, 0);
          if (!r.ok && r.reason.startsWith('Locked')) return r.reason;
        }
      return null;
    };
    c.credits += 1e5;
    expect(spot('pod-dock')).toMatch(/Sky-lane/);
    expect(spot('aeroline-station')).toMatch(/Aeroline/);
    expect(projectStatus(c, 'skylanes')).toBe('blocked');
    expect(s.commands.execute('startProject', { id: 'skylanes' })).toBe(false);
    // Meet the criteria by hand: residents and a Drone Fabricator.
    c.stats.population = 3500;
    let built = false;
    const fab = buildings.get('drone-fabricator');
    for (let z = 0; z < c.size && !built; z += 2)
      for (let x = 0; x < c.size && !built; x += 2)
        if (c.checkPlacement(fab, x, z, 0).ok)
          built = s.commands.execute('build', { def: fab.id, x, z, rot: 0 });
    expect(built).toBe(true);
    c.stats.population = 3500;
    expect(projectStatus(c, 'skylanes')).toBe('ready');
    const credits = c.credits;
    expect(s.commands.execute('startProject', { id: 'skylanes' })).toBe(true);
    expect(c.credits).toBe(credits - PROJECTS.skylanes.cost);
    s.commands.undo();
    expect(c.credits).toBe(credits);
    expect(s.commands.execute('startProject', { id: 'skylanes' })).toBe(true);
    seconds(s, 400);
    expect(c.growth.unlocked).toContain('skylanes');
  });

  it('Flora sleeps until woken, then each request is billed; the showcase city is free and open', () => {
    const s = fresh();
    expect(floraBlocker(s.city)).toMatch(/asleep/);
    s.city.growth.unlocked.push('flora');
    expect(floraBlocker(s.city)).toBeNull();
    const credits = s.city.credits;
    expect(s.commands.execute('floraBill', { tokens: 400 }, false)).toBe(true);
    expect(s.city.credits).toBeCloseTo(credits - floraCost(400), 5);
    const show = makeSim(1);
    applyScenario(show.city, 'founding-city');
    expect(show.city.growth.progression).toBe(false);
    expect(floraBlocker(show.city)).toBeNull();
    expect(wonderVisible(show.city, 'dome')).toBe(true);
  });

  it('names the city; saves name, unlocks, wonders and stock; v10 saves open everything', () => {
    const s = fresh();
    expect(s.commands.execute('nameCity', { name: '  Coral   Bay ' })).toBe(true);
    expect(s.city.growth.name).toBe('Coral Bay');
    seconds(s, 30);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    expect(data.version).toBe(SAVE_VERSION);
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.hash()).toBe(s.city.hash());
    expect(other.growth.name).toBe('Coral Bay');
    const v10 = structuredClone(data) as unknown as Record<string, unknown>;
    v10.version = 10;
    delete v10.growth;
    const m = migrateSave(v10 as unknown as SaveData);
    expect(m.growth.progression).toBe(false);
  });
});

describe('Flora knows the goals (Phase 22)', () => {
  const tools = (s: ReturnType<typeof makeSim>) => {
    const r = new AgentToolRegistry<ActionCtx>({ city: s.city, commands: s.commands });
    for (const t of growthTools) r.register(t);
    return r;
  };
  const result = async (r: AgentToolRegistry<ActionCtx>, name: string) => {
    const res = await r.call(name);
    if (!res.ok) throw new Error(res.error);
    return res.result;
  };

  it('goals_status lists projects with criteria, the fish stock and hidden wonders', async () => {
    const s = fresh();
    const out = JSON.parse(JSON.stringify(await result(tools(s), 'goals_status'))) as {
      projects: { id: string; status: string; criteria?: string[] }[];
      fishing: { stock: string };
      wonders: { hidden: string[] };
    };
    expect(out.projects.map((p) => p.id)).toEqual(['skylanes', 'aeroline', 'flora']);
    expect(out.projects.find((p) => p.id === 'skylanes')!.criteria!.some((c) => c.startsWith('✗'))).toBe(
      true,
    );
    expect(out.fishing.stock).toMatch(/%$/);
    expect(out.wonders.hidden.length).toBeGreaterThan(0);
    // The showcase has nothing to unlock.
    const show = makeSim();
    expect(((await result(tools(show), 'goals_status')) as { progression: boolean }).progression).toBe(false);
  });

  it('start_project explains what is missing, then starts (undoably) once ready', async () => {
    const s = fresh();
    const r = tools(s);
    const blocked = await r.call('start_project', { id: 'skylanes' });
    expect(blocked.ok ? '' : blocked.error).toMatch(/residents/);
    s.city.stats.population = 2500;
    s.city.credits += 1e4;
    const fab = buildings.get('drone-fabricator');
    for (let z = 0, done = false; z < s.city.size && !done; z += 2)
      for (let x = 0; x < s.city.size && !done; x += 2)
        if (s.city.checkPlacement(fab, x, z, 0).ok)
          done = !!s.commands.execute('build', { def: fab.id, x, z, rot: 0 });
    s.city.stats.population = 2500;
    const before = s.city.credits;
    const ok = await r.call('start_project', { id: 'skylanes' });
    expect(ok.ok).toBe(true);
    expect(projectStatus(s.city, 'skylanes')).toBe('running');
    expect(before - s.city.credits).toBe(PROJECTS.skylanes.cost);
    s.commands.undo();
    expect(projectStatus(s.city, 'skylanes')).not.toBe('running');
  });

  it('routes goal questions and project commands; the brief names what is locked', () => {
    expect(plainIntent('what should I unlock next?')).toBe('goals_status');
    expect(plainIntent('how is the fishing?')).toBe('goals_status');
    expect(plainIntent('start the sky-lane charter')).toBe('start_project');
    expect(plainIntent('build a fishing dock')).toBe('build');
    const b = cityBrief(fresh().city);
    expect(b).toMatch(/Locked: Sky-lane charter \(needs/);
    expect(b).toMatch(/Fish stock \d+%/);
  });
});
