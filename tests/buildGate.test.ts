import { describe, expect, it } from 'vitest';
import { buildings } from '@/content';
import { applyScenario } from '@/sim/scenario';
import { buildBlock, unavailable } from '@/sim/buildGate';
import { limitStatus } from '@/sim/limits';
import { proposeBuilds } from '@/sim/proposals';
import { makeSim } from './helpers';

/** The build gate (D-130): every "can't build it" says what to do next. */
function fresh() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'fresh-island');
  return s;
}

/** Places fishing docks until the limit stops it. */
function fillDocks(s: ReturnType<typeof fresh>) {
  const def = buildings.get('fishing-dock');
  s.city.credits += 1e5;
  for (let z = 0; z < s.city.size; z++)
    for (let x = 0; x < s.city.size; x++)
      for (let rot = 0; rot < 4; rot++) {
        const r = s.city.checkPlacement(def, x, z, rot);
        if (r.ok) s.commands.execute('build', { def: def.id, x, z, rot }, false);
        else if (/built/.test(r.reason)) return r.reason;
      }
  return null;
}

describe('build gate (D-130)', () => {
  it('counts limits and the population that opens the next one', () => {
    expect(limitStatus({ base: 3, perPopulation: 600 }, 0, 3)).toEqual({ have: 3, max: 3, nextAt: 600 });
    expect(limitStatus({ base: 3, perPopulation: 600 }, 1300, 2)).toEqual({ have: 2, max: 5, nextAt: 1800 });
  });

  it('a full fishing-dock limit says how many residents open the next and offers homes', () => {
    const s = fresh();
    const reason = fillDocks(s);
    expect(reason).toMatch(/of \d+ built: the \d+(st|nd|rd|th) opens at [\d,]+ residents/);
    const block = buildBlock(s.city, 'fishing-dock')!;
    expect(block.kind).toBe('capped');
    expect(block.short).toMatch(/next at/);
    const act = block.steps.find((st) => st.act)!.act!.action;
    expect(act.kind).toBe('place');
    if (act.kind === 'place') expect(buildings.get(act.def).category).toBe('residential');
    expect(unavailable(s.city, 'fishing-dock')).toBe(true);
    // Planners stop suggesting a dock that can't be placed.
    expect(proposeBuilds(s.city, { limit: 20 }).some((p) => p.type === 'fishing-dock')).toBe(false);
  });

  it('a locked building names its project and what it still needs, with a way to act on each', () => {
    const s = fresh();
    const pod = buildings.all().find((d) => d.requires === 'skylanes')!;
    const block = buildBlock(s.city, pod.id)!;
    expect(block.kind).toBe('locked');
    expect(block.reason).toMatch(/Sky-lane charter/);
    expect(block.steps.some((st) => st.act?.action.kind === 'place')).toBe(true);
    expect(block.steps.some((st) => st.act?.action.kind === 'goals')).toBe(true);
  });

  it('short of credits: says how much and how to earn it; nothing blocks an affordable building', () => {
    const s = fresh();
    const dear = buildings
      .all()
      .filter((d) => !d.requires && !d.limit && !d.landmark)
      .sort((a, b) => b.stats.cost - a.stats.cost)[0]!;
    s.city.credits = 0;
    const block = buildBlock(s.city, dear.id)!;
    expect(block.kind).toBe('credits');
    expect(block.reason).toMatch(/short/);
    expect(block.steps.some((st) => st.act?.action.kind === 'credits')).toBe(true);
    s.city.credits = dear.stats.cost;
    expect(buildBlock(s.city, dear.id)).toBeNull();
  });
});
