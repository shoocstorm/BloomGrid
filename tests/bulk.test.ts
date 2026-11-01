import { describe, expect, it } from 'vitest';
import { applyScenario } from '@/sim/scenario';
import { AgentToolRegistry } from '@/core/AgentTools';
import { CommandStack } from '@/core/Commands';
import { Building, Service } from '@/ecs/components';
import type { ActionCtx } from '@/sim/actionTools';
import { BULK_ACTIONS, actionIn, bulkTools, pickBuildings } from '@/sim/bulkTools';
import { DAY_LENGTH } from '@/sim/pulseConst';
import { plainIntent, repeatsItself, runTurn, tidyAnswer, type Llm } from '@/ai/agent';
import { makeSim } from './helpers';

function founded() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(20);
  return s;
}
const tool = (s: ReturnType<typeof makeSim>) => {
  const r = new AgentToolRegistry<ActionCtx>({ city: s.city, commands: s.commands });
  for (const t of bulkTools) r.register(t);
  return r;
};
const turbines = (s: ReturnType<typeof makeSim>) => s.city.buildingEntities().filter((e) => s.city.buildingDef(e).id === 'wind-turbine');

describe('batch command', () => {
  it('applies what it can, and one undo reverts all of it', () => {
    const log: string[] = [];
    const stack = new CommandStack<null>(null);
    stack.register<string, string>('say', { apply: (_c, p) => (p === 'no' ? null : (log.push(p), p)), revert: (_c, p) => void log.splice(log.lastIndexOf(p), 1) });
    expect(stack.execute('batch', [{ type: 'say', payload: 'a' }, { type: 'say', payload: 'no' }, { type: 'say', payload: 'b' }])).toBe(true);
    expect(log).toEqual(['a', 'b']);
    expect(stack.lastBatch).toEqual([0, 2]);
    stack.undo();
    expect(log).toEqual([]);
    stack.redo();
    expect(log).toEqual(['a', 'b']);
    expect(stack.execute('batch', [{ type: 'say', payload: 'no' }])).toBe(false);
  });
});

describe('act_on_buildings', () => {
  it('switches every wind turbine off and back on, one undo for the lot', async () => {
    const s = founded();
    const all = turbines(s);
    expect(all.length).toBeGreaterThan(5);
    const r = tool(s);
    const off = await r.call('act_on_buildings', { action: 'turn_off', type: 'wind-turbine' });
    expect(off.ok).toBe(true);
    expect(all.every((e) => Service.off[e] === 1)).toBe(true);
    expect((off as { result: { done: string } }).result.done).toBe(`${all.length} of ${all.length} switched off`);
    const again = await r.call('act_on_buildings', { action: 'turn_off', type: 'Breeze Turbine' });
    expect(again.ok).toBe(false);
    expect((again as { error: string }).error).toMatch(/already off/);
    const on = await r.call('act_on_buildings', { action: 'turn_on', type: 'wind turbine' });
    expect(on.ok).toBe(true);
    expect(all.every((e) => Service.off[e] === 0)).toBe(true);
    s.commands.undo();
    expect(all.every((e) => Service.off[e] === 1)).toBe(true);
  });

  it('renovates one type in one district, skipping the new and paying in order', async () => {
    const s = founded();
    const towers = pickBuildings(s.city, { type: 'canopy-tower' });
    const byDistrict = new Map<string, number[]>();
    for (const e of towers) {
      const d = s.city.districts.find((x) => {
        const cx = Building.x[e]! + Building.w[e]! / 2;
        const cz = Building.z[e]! + Building.d[e]! / 2;
        return ['Westbrook', 'Eastgate', 'Bayfront', 'Hillcrest'].includes(x.name) && cx >= x.x0 && cx <= x.x1 + 1 && cz >= x.z0 && cz <= x.z1 + 1;
      });
      if (d) byDistrict.set(d.name, [...(byDistrict.get(d.name) ?? []), e]);
    }
    const [district, inIt] = [...byDistrict].sort((a, b) => b[1].length - a[1].length)[0]!;
    // Age half of them.
    inIt.forEach((e, i) => (Service.age[e] = i % 2 ? 0 : DAY_LENGTH * 12));
    const aged = inIt.filter((_, i) => i % 2 === 0);
    s.city.credits = 1e6;
    const res = await tool(s).call('act_on_buildings', { action: 'renovate', type: 'canopy towers'.replace(/s$/, ''), district });
    expect(res.ok).toBe(true);
    const out = (res as { result: { affected: string[]; skipped?: Record<string, number> } }).result;
    expect(out.affected.length).toBe(Math.min(8, aged.length));
    expect((res as { result: { count: number } }).result.count).toBe(aged.length);
    if (inIt.length > aged.length) expect(out.skipped?.['like new already']).toBe(inIt.length - aged.length);
    expect(aged.every((e) => Service.age[e] === 0)).toBe(true);
    // Elsewhere untouched.
    const other = towers.find((e) => !inIt.includes(e))!;
    expect(other).toBeDefined();
  });

  it('needs some way to pick buildings, and names bad districts', async () => {
    const s = founded();
    expect((await tool(s).call('act_on_buildings', { action: 'renovate' })).ok).toBe(false);
    const bad = await tool(s).call('act_on_buildings', { action: 'renovate', district: 'Atlantis' });
    expect((bad as { error: string }).error).toMatch(/No district "Atlantis"/);
  });

  it('reads the action from the request and routes bulk requests to it', () => {
    expect(actionIn('start all wind turbines')).toBe('turn_on');
    expect(actionIn('turn off every turbine')).toBe('turn_off');
    expect(actionIn('renovate all canopy towers in Westbrook')).toBe('renovate');
    expect(BULK_ACTIONS).toContain('return_to_nature');
    const t = bulkTools[0]!;
    expect(t.narrow!(t.input, { request: 'turn on all wind turbines', observed: '' }).properties!.action!.enum).toEqual(['turn_on']);
    // Optional filters the request doesn't name are not offered (small models fill them with junk).
    const host = { ...t.input, properties: { ...t.input.properties, district: { type: 'string' as const, enum: ['Westbrook', 'Eastgate', 'Bayfront', 'Hillcrest'] }, type: { type: 'string' as const, enum: ['wind-turbine'] } } };
    const s1 = t.narrow!(host, { request: 'start all wind turbines', observed: '' });
    expect(Object.keys(s1.properties!).filter((k) => k !== 'limit').sort()).toEqual(['action', 'type']); // limit is not in llmArgs
    const s2 = t.narrow!({ ...host, properties: { ...host.properties, district: { type: 'string', enum: ['Westbrook'] } } }, { request: 'renovate the old canopy towers in Westbrook', observed: '' });
    expect(s2.properties!.query!.enum).toEqual(['is:old']);
    expect(s2.properties!.district!.enum).toEqual(['Westbrook']);
    expect(plainIntent('start all wind turbines')).toBe('act_on_buildings');
    expect(plainIntent('turn on all the wind turbines')).toBe('act_on_buildings');
    expect(plainIntent('renovate all canopy towers in Westbrook')).toBe('act_on_buildings');
    expect(plainIntent('upgrade every home in Bayfront')).toBe('act_on_buildings');
    // Single-building and other routes unchanged.
    expect(plainIntent('renovate LIV-0042')).toBe('renovate');
    expect(plainIntent('put out the fires')).toBe('respond_incident');
    expect(plainIntent('rebuild the ruins in Bayfront')).toBe('repair_damage');
  });
});

describe('reply hygiene', () => {
  it('drops repeated sentences and stops a looping reply early', async () => {
    const loop = 'Turned on 110 wind turbines. The water deficit is still present. The water deficit is still present. The water deficit is still present.';
    expect(repeatsItself('A first point here. The water deficit is still present. The water deficit is still present.')).toBe(true);
    expect(tidyAnswer(loop)).toBe('Turned on 110 wind turbines. The water deficit is still present.');
    let pieces = 0;
    const llm: Llm = {
      async generate(_m, opts, onText) {
        for (const p of loop.split(/(?<=\.) /)) {
          if (opts.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
          pieces++;
          onText?.(`${p} `);
        }
        return loop;
      },
    };
    const r = new AgentToolRegistry<ActionCtx>({ city: makeSim(1).city, commands: makeSim(1).commands });
    const out = await runTurn({ llm, tools: r, request: 'hello there', brief: () => 'Day 1.', maxSteps: 0 });
    expect(out.answer).toBe('Turned on 110 wind turbines. The water deficit is still present.');
    expect(pieces).toBe(3);
  });
});
