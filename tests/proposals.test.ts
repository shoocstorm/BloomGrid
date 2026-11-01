import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { buildings } from '@/content';
import { AgentToolRegistry } from '@/core/AgentTools';
import { actionTools, type ActionCtx } from '@/sim/actionTools';
import { insightTools } from '@/sim/insightTools';
import { proposalTools } from '@/sim/proposalTools';
import { diagnose, proposeBuilds } from '@/sim/proposals';
import { lockReason } from '@/sim/projects';
import { getObject } from '@/sim/inventory';
import { observe, plainIntent, runTurn, type Llm } from '@/ai/agent';
import { makeSim } from './helpers';

function founded(seed = 20261024) {
  const s = makeSim(seed);
  applyScenario(s.city, 'founding-city');
  s.step(40);
  return s;
}

const registry = (s: ReturnType<typeof makeSim>) => {
  const r = new AgentToolRegistry<ActionCtx>({ city: s.city, commands: s.commands });
  for (const t of [...insightTools, ...actionTools, ...proposalTools]) r.register(t);
  return r;
};

describe('build proposals', () => {
  it('are sized, sited on valid lots, unlocked and deterministic', () => {
    const s = founded();
    const a = proposeBuilds(s.city, { limit: 3 });
    expect(a).toEqual(proposeBuilds(s.city, { limit: 3 }));
    for (const p of a) {
      const def = buildings.get(p.type);
      expect(lockReason(s.city, p.type)).toBeNull();
      expect(def.landmark).toBeFalsy();
      expect(p.count).toBeGreaterThanOrEqual(1);
      expect(p.count).toBeLessThanOrEqual(3);
      expect(p.cost).toBe(p.count * def.stats.cost);
      expect(s.city.checkPlacement(def, p.site.x, p.site.z, p.site.rot).ok).toBe(true);
      expect(p.why.length).toBeGreaterThan(5);
    }
  });

  it('a water shortage gets water works sized to bring supply back above demand', () => {
    const s = founded();
    // Take supply away until water is short.
    const before = s.city.pulse.waterRatio;
    s.city.stats.waterProduced = s.city.stats.waterUsed * 0.8;
    s.city.pulse.waterRatio = 0.8;
    s.city.pulse.tiers.water = 3;
    const [p] = proposeBuilds(s.city, { focus: 'water' });
    expect(p, `water ratio was ${before}`).toBeDefined();
    expect(buildings.get(p!.type).stats.water).toBeGreaterThan(0);
    expect(p!.gain).toMatch(/water → \d+% of demand/);
    expect(diagnose(s.city)[0]).toMatch(/^water Critical/);
  });

  it('a district pins the proposals there', () => {
    const s = founded();
    s.city.pulse.tiers.energy = 2;
    s.city.pulse.energyRatio = 0.9;
    s.city.stats.energyProduced = s.city.stats.energyUsed * 0.9;
    const [p] = proposeBuilds(s.city, { focus: 'energy', district: 'Westbrook' });
    expect(p?.district).toBe('Westbrook');
  });

  it('the tool reports a diagnosis and cards, and a card builds where it said', async () => {
    const s = founded();
    s.city.pulse.tiers.energy = 2;
    s.city.pulse.energyRatio = 0.9;
    s.city.stats.energyProduced = s.city.stats.energyUsed * 0.9;
    const r = registry(s);
    const out = await r.call('propose_builds', { focus: 'energy' });
    expect(out.ok).toBe(true);
    const res = (out as { result: { diagnosis: string; proposals: { type: string; site: { x: number; z: number; rot: number } }[] } }).result;
    expect(res.diagnosis).toMatch(/energy Strained/);
    expect(observe(res)).not.toContain('(cut)');
    const p = res.proposals[0]!;
    // What the card's Build button does.
    const built = await r.call('build', { type: p.type, ...p.site });
    expect(built.ok).toBe(true);
    const id = (built as { result: { built: string; at: { x: number; z: number } } }).result;
    expect(id.at).toEqual({ x: p.site.x, z: p.site.z });
    expect(getObject(s.city, id.built)).not.toBeNull();
  });

  it('advice is followed by proposals without a model decision', async () => {
    const s = founded();
    s.city.pulse.tiers.energy = 2;
    s.city.pulse.energyRatio = 0.9;
    const llm: Llm = {
      async generate(messages) {
        const text = messages.map((m) => m.content).join('\n');
        const letters = /option letter from: ([A-P, ]+)\./.exec(text);
        if (letters) return letters[1]!.split(', ').pop()!;
        return 'Energy is short: build the proposed turbines.';
      },
    };
    const out = await runTurn({ llm, tools: registry(s), request: 'any advice?', brief: () => 'Day 1.' });
    expect(out.steps.map((x) => x.call.tool)).toEqual(['advisor_tips', 'propose_builds']);
  });

  it('routes planning questions to the planner', () => {
    expect(plainIntent('what should we build next?')).toBe('propose_builds');
    expect(plainIntent('What does the city need?')).toBe('propose_builds');
    expect(plainIntent('make a plan for Westbrook')).toBe('propose_builds');
    expect(plainIntent('which building is cheapest for power?')).toBe('building_types');
    expect(plainIntent('any advice?')).toBe('advisor_tips');
    expect(plainIntent('build a water works in Westbrook')).toBe('build');
  });
});
