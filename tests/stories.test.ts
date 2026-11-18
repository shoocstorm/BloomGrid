import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { ARCS, CHOICE_SECONDS, choiceBlock, homeOf, startStory, storyBeat } from '@/sim/stories';
import { dirtyPlants, lotsFor, planRecords, proposePlan, PLAN_GOALS } from '@/sim/plans';
import { buildings } from '@/content';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { makeSim } from './helpers';

function founded() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(100);
  return s;
}
/** The fishing hamlet: a dock, homes by the shore. */
function hamlet() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'fresh-island');
  s.step(100);
  s.city.credits = 5000;
  return s;
}
const pulses = (s: ReturnType<typeof makeSim>, n: number, f?: () => void) => {
  for (let i = 0; i < n; i++) {
    f?.();
    s.step(PULSE_TICKS);
  }
};

describe('resident stories (plan v5, Phase 29)', () => {
  it('are data: every arc has beats with two choices, and every next beat exists', () => {
    for (const a of ARCS) {
      expect(a.beats.length, a.id).toBeGreaterThanOrEqual(2);
      const ids = new Set(a.beats.map((b) => b.id));
      for (const b of a.beats) {
        expect(b.choices).toHaveLength(2);
        for (const c of b.choices) if (c.next) expect(ids.has(c.next), `${a.id}.${b.id} → ${c.next}`).toBe(true);
      }
    }
  });

  it('a story starts only when its trigger holds, names a resident and ties them to a home', () => {
    const s = hamlet();
    s.city.growth.fish = 1;
    expect(startStory(s.city, 'fisher')).toBeNull();
    s.city.growth.fish = 0.4;
    const run = startStory(s.city, 'fisher')!;
    expect(run.name).toMatch(/^\w+ \w+$/);
    expect(homeOf(s.city, run)).toBeGreaterThanOrEqual(0);
    expect(s.city.buildingDef(homeOf(s.city, run)).category).toBe('residential');
    expect(storyBeat(s.city)?.beat.id).toBe('nets');
  });

  it('a pay-now choice moves on at once; a goal choice waits for the city and pays on success', () => {
    const s = hamlet();
    s.city.growth.fish = 0.4;
    startStory(s.city, 'fisher');
    const c0 = s.city.credits;
    expect(s.commands.execute('storyChoice', { choice: 1 }, false)).toBe(true);
    expect(s.city.credits).toBeCloseTo(c0 - 600, 0);
    const run = s.city.stories.current!;
    expect(run.status).toBe('between');
    expect(run.beat).toBe('coast');
    pulses(s, 121);
    expect(run.status).toBe('choosing');
    // Plant a park within 14 tiles of the home: the goal is met and the story ends happily with a lasting outcome.
    expect(s.commands.execute('storyChoice', { choice: 0 }, false)).toBe(true);
    expect(run.status).toBe('waiting');
    const home = homeOf(s.city, run);
    const park = buildings.get('pocket-park');
    const lot = lotsFor(s.city, park, { x: s.city.buildingRecord(home).x, z: s.city.buildingRecord(home).z }, 1)[0]!;
    expect(Math.hypot(lot.x - s.city.buildingRecord(home).x, lot.z - s.city.buildingRecord(home).z)).toBeLessThan(12);
    const ends: string[] = [];
    s.bus.on('story:end', ({ outcome }) => ends.push(outcome));
    s.commands.execute('build', { def: 'pocket-park', x: lot.x, z: lot.z, rot: lot.rot });
    pulses(s, 2);
    expect(ends).toEqual(['happy']);
    expect(s.city.stories.lasting).toContain('fishers-coop');
    expect(s.city.stories.current).toBeNull();
    pulses(s, 2);
    expect(s.city.consequences.mods.fishing).toBeGreaterThan(1);
  });

  it('a goal missed by its deadline lets the resident down; an unanswered beat fades', () => {
    const s = hamlet();
    s.city.growth.fish = 0.4;
    startStory(s.city, 'fisher');
    s.commands.execute('storyChoice', { choice: 0 }, false); // enact a fishing quota … but don't
    const ends: string[] = [];
    s.bus.on('story:end', ({ outcome }) => ends.push(outcome));
    s.city.stories.current!.until = s.city.tick + 2;
    pulses(s, 2);
    expect(ends).toEqual(['let down']);
    s.city.stories.nextTick = 0;
    startStory(s.city, 'fisher');
    s.city.stories.current!.beatTick -= CHOICE_SECONDS * PULSE_TICKS;
    pulses(s, 1);
    expect(ends).toEqual(['let down', 'faded']);
  });

  it("a choice the treasury can't pay is refused", () => {
    const s = founded();
    startStory(s.city, 'founder');
    s.city.credits = 100;
    expect(choiceBlock(s.city, 1)).toContain('costs');
    expect(s.commands.execute('storyChoice', { choice: 1 }, false)).toBe(false);
  });

  it('the scheduler tells stories on its own, deterministically (and not in tests by default)', () => {
    const run = () => {
      const s = founded();
      s.city.stories.auto = true;
      s.city.growth.fish = 0.4;
      pulses(s, 300, () => (s.city.growth.fish = Math.min(s.city.growth.fish, 0.4)));
      return { hash: s.city.hash(), story: s.city.stories.current?.name ?? null };
    };
    const a = run();
    expect(a.story).not.toBeNull();
    expect(run()).toEqual(a);
    const quiet = founded();
    pulses(quiet, 300);
    expect(quiet.city.stories.current).toBeNull();
  });

  it('round-trips a story in progress (v24) and migrates v23 saves', () => {
    const s = hamlet();
    s.city.growth.fish = 0.4;
    startStory(s.city, 'fisher');
    s.commands.execute('storyChoice', { choice: 1 }, false);
    const data = serializeCity(s.city);
    expect(data.version).toBe(SAVE_VERSION);
    const copy = new City(new EventBus(), 1);
    deserializeCity(copy, structuredClone(data));
    expect(copy.hash()).toBe(s.city.hash());
    expect(copy.stories.current?.beat).toBe('coast');
    const v23 = structuredClone(data) as unknown as Record<string, unknown>;
    v23.version = 23;
    delete v23.stories;
    expect(migrateSave(v23 as unknown as SaveData).stories).toMatchObject({ current: null, lasting: [] });
  });
});

describe("Flora's plans", () => {
  it('a plan stays within the treasury and leaves out declined steps', () => {
    const s = founded();
    for (const g of PLAN_GOALS) {
      const p = proposePlan(s.city, g);
      expect(p.cost, g).toBeLessThanOrEqual(s.city.credits);
      for (const st of p.steps) expect(st.records.length, `${g} ${st.key}`).toBeGreaterThan(0);
    }
    const p = proposePlan(s.city, 'carbon-zero');
    expect(p.steps.length).toBeGreaterThan(0);
    const avoid = new Set([p.steps[0]!.key]);
    const q = proposePlan(s.city, 'carbon-zero', avoid);
    expect(q.steps.some((x) => x.key === p.steps[0]!.key)).toBe(false);
    expect(q.skipped.some((x) => x.includes('declined'))).toBe(true);
  });

  it('runs as one batch: every step applies, and one undo reverts the whole plan', () => {
    const s = founded();
    s.city.credits = 200000;
    // A city short of power and water, with a dirty plant: the fix plan has several builds.
    const plan = proposePlan(s.city, 'carbon-zero');
    const builds = plan.steps.filter((x) => x.kind === 'build').flatMap((x) => x.records).length;
    const hash = s.city.hash();
    const before = s.city.buildingEntities().length;
    const dirty = dirtyPlants(s.city).length;
    expect(s.commands.execute('batch', planRecords(plan))).toBe(true);
    expect(s.commands.lastBatch.length).toBe(planRecords(plan).length);
    expect(s.city.buildingEntities().length).toBeGreaterThanOrEqual(before + builds - dirty);
    expect(s.city.charters.active).toContain('carbon-zero');
    s.commands.undo();
    expect(s.city.hash()).toBe(hash);
  });

  it('builds in a plan never fight over a lot', () => {
    const s = founded();
    const def = buildings.get('pocket-park');
    const lots = lotsFor(s.city, def, { x: 256, z: 256 }, 3);
    expect(lots.length).toBe(3);
    s.city.credits = 1e6;
    expect(s.commands.execute('batch', lots.map((l) => ({ type: 'build', payload: { def: def.id, x: l.x, z: l.z, rot: l.rot } })))).toBe(true);
    expect(s.commands.lastBatch.length).toBe(3);
  });
});
