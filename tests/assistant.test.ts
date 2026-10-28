import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AgentToolRegistry } from '@/core/AgentTools';
import {
  runTurn,
  observe,
  stripThink,
  idsIn,
  plainIntent,
  selectMenu,
  CORE_TOOLS,
  type AgentEvent,
  type Llm,
} from '@/ai/agent';
import { argsGrammar, choiceGrammar, dropNulls } from '@/ai/grammar';
import { cityBrief } from '@/ai/brief';
import type { ChatMessage, GenOptions } from '@/ai/llm/engine';
import { actionTools, connectPath, findSites, resolveType, type ActionCtx } from '@/sim/actionTools';
import { inventoryTools } from '@/sim/inventoryTools';
import { insightTools } from '@/sim/insightTools';
import { hazardTools } from '@/sim/hazardTools';
import { getObject, queryInventory } from '@/sim/inventory';
import { applyScenario } from '@/sim/scenario';
import { buildings } from '@/content';
import { findSpot, makeSim } from './helpers';

function founded() {
  const s = makeSim(1337);
  applyScenario(s.city, 'founding-city');
  s.step(20);
  return s;
}

function registry(s: ReturnType<typeof makeSim>) {
  const ctx: ActionCtx = { city: s.city, commands: s.commands };
  const r = new AgentToolRegistry<ActionCtx>(ctx);
  for (const t of [...inventoryTools, ...insightTools, ...actionTools, ...hazardTools]) r.register(t);
  return r;
}

/** A model that answers from a script: each entry sees the messages and options and returns the reply. */
function scripted(
  replies: ((m: ChatMessage[], o: GenOptions) => string)[],
): Llm & { calls: { messages: ChatMessage[]; opts: GenOptions }[] } {
  const calls: { messages: ChatMessage[]; opts: GenOptions }[] = [];
  return {
    calls,
    async generate(messages, opts, onText) {
      calls.push({ messages, opts });
      const next = replies.shift();
      if (!next) throw new Error('script ran out');
      const text = next(messages, opts);
      onText?.(text);
      return text;
    },
  };
}

/** The letter of the menu option whose text contains `needle`. */
const pick = (needle: string) => (m: ChatMessage[]) => {
  const line = m[1]!.content
    .split('\n')
    .find((l) => /^[A-P]\. /.test(l) && l.toLowerCase().includes(needle.toLowerCase()));
  if (!line) throw new Error(`no option "${needle}"`);
  return line[0]!;
};
const reply = pick('Reply to the steward');

describe('action tools', () => {
  it('resolves building types by id, name or unique substring', () => {
    expect(resolveType('water-works').id).toBe('water-works');
    expect(resolveType(buildings.get('pod-dock').name).id).toBe('pod-dock');
    expect(() => resolveType('zzz')).toThrow(/No building type/);
  });

  it('builds at a valid lot in a district, and undo removes it', async () => {
    const s = founded();
    const r = registry(s);
    const before = s.city.buildingEntities().length;
    const res = await r.call('build', { type: 'pocket-park', district: 'Westbrook' });
    if (!res.ok) throw new Error(res.error);
    const id = (res.result as { built: string }).built;
    expect(getObject(s.city, id)?.type).toBe('pocket-park');
    expect(s.city.buildingEntities().length).toBe(before + 1);
    expect((await r.call('undo')).ok).toBe(true);
    expect(getObject(s.city, id)).toBeNull();
    const sites = findSites(s.city, buildings.get('water-works'), { x: 150, z: 270 }, 3);
    for (const site of sites)
      expect(s.city.checkPlacement(buildings.get('water-works'), site.x, site.z, site.rot)).toEqual({
        ok: true,
      });
  });

  it('connects an isolated highway network to the grid', async () => {
    const s = founded();
    const r = registry(s);
    const isolated = queryInventory(s.city, {
      kind: 'network',
      issue: 'power-short',
      sort: 'tiles',
      desc: false,
      limit: 1,
    }).items[0];
    if (!isolated) return; // seed-dependent: nothing isolated
    const path = connectPath(s.city, isolated)!;
    expect(path.length).toBeGreaterThan(0);
    const res = await r.call('connect_highway', { id: isolated.id });
    if (!res.ok) throw new Error(res.error);
    s.step(12);
    expect(getObject(s.city, isolated.id)?.issues ?? []).not.toContain('power-short');
  });

  it('fix_issue applies the standard remedy for the worst issue', async () => {
    const s = founded();
    const r = registry(s);
    // An isolated network (not the largest) is fixed by linking it to the main grid.
    const nets = queryInventory(s.city, { kind: 'network', sort: 'tiles' }).items;
    const isolated = nets.slice(1).find((n) => n.issues.includes('power-short'));
    if (isolated) {
      const res = await r.call('fix_issue', { id: isolated.id });
      if (!res.ok) throw new Error(res.error);
      expect(res.result).toMatchObject({ fixed: isolated.id, action: 'connect_highway' });
      s.step(12);
      expect(queryInventory(s.city, { kind: 'network' }).total).toBe(nets.length - 1);
    }
    // A district fixes its worst building; an object without issues is left alone.
    const fine = queryInventory(s.city, { kind: 'building', status: 'ok', limit: 1 }).items[0]!;
    const ok = await r.call('fix_issue', { id: fine.id });
    expect(ok).toMatchObject({ ok: true, result: { note: 'It has no issues.' } });
    expect((await r.call('fix_issue', { id: 'NOPE-1' })).ok).toBe(false);
  });

  it('demolishes by id and refuses unknown ids', async () => {
    const s = makeSim(3);
    const a = findSpot(s.city, 'pocket-park');
    s.commands.execute('build', { def: 'pocket-park', ...a, rot: 0 });
    const r = registry(s);
    const id = queryInventory(s.city, { kind: 'building' }).items[0]!.id;
    expect((await r.call('demolish', { id })).ok).toBe(true);
    expect(s.city.buildingEntities().length).toBe(0);
    expect((await r.call('demolish', { id })).ok).toBe(false);
    expect((await r.call('set_tax', { percent: 50 })).ok).toBe(false);
  });
});

describe('insight and more action tools', () => {
  it('explain the city: advice, trends, budget, crises, building types', async () => {
    const s = founded();
    s.step(300); // a few history samples (one per 10 sim-seconds)
    const r = registry(s);
    const call = async (name: string, args: unknown = {}) => {
      const res = await r.call(name, args);
      if (!res.ok) throw new Error(`${name}: ${res.error}`);
      return JSON.parse(JSON.stringify(res.result)) as Record<string, unknown>;
    };
    expect(Array.isArray(await call('advisor_tips'))).toBe(true);
    const trend = await call('city_trends', { metric: 'population' });
    expect(['rising', 'falling', 'steady']).toContain(trend.direction);
    const budget = await call('budget_breakdown');
    expect(budget.netPerSecond).toBeTypeOf('number');
    expect(
      Object.keys((budget.spending as { upkeepByCategory: object }).upkeepByCategory).length,
    ).toBeGreaterThan(2);
    expect((await call('crisis_status')).crises).toEqual([]);
    const water = (await call('building_types', { need: 'water' })).types as {
      type: string;
      perThousandCredits: number;
    }[];
    expect(water.map((t) => t.type)).toContain('water-works');
    expect(water[0]!.perThousandCredits).toBeGreaterThanOrEqual(water[water.length - 1]!.perThousandCredits);
  });

  it('build_many builds several in one undoable action set; repay and mist report clearly', async () => {
    const s = founded();
    const r = registry(s);
    const before = s.city.buildingEntities().length;
    const res = await r.call('build_many', { type: 'pocket-park', count: 3, district: 'Hillcrest' });
    if (!res.ok) throw new Error(res.error);
    expect((res.result as { built: string[] }).built).toHaveLength(3);
    expect(s.city.buildingEntities().length).toBe(before + 3);
    expect(await r.call('repay_loan')).toEqual({ ok: false, error: 'There are no loans.' });
    expect((await r.call('take_loan', { amount: 5000 })).ok).toBe(true);
    expect((await r.call('repay_loan')).ok).toBe(true);
    expect((await r.call('mist_soil', { id: 'DST-SUNFIELD' })).ok).toBe(true);
  });
});

describe('menu', () => {
  it('keeps the core tools and picks the rest by the request, in registry order', () => {
    const tools = registry(makeSim(1)).list();
    expect(tools.length).toBeGreaterThan(15);
    const menu = selectMenu('repay the loan and check the budget', tools);
    expect(menu.length).toBe(15);
    const names = menu.map((t) => t.name);
    for (const c of CORE_TOOLS) if (tools.some((t) => t.name === c)) expect(names).toContain(c);
    expect(names).toContain('repay_loan');
    expect(names).toContain('budget_breakdown');
    expect(names).toEqual(tools.map((t) => t.name).filter((n) => names.includes(n)));
    expect(plainIntent('build three pocket parks in Hillcrest')).toBe('build_many');
    expect(plainIntent('pause the game')).toBe('set_speed');
    expect(plainIntent('how is our budget?')).toBe('budget_breakdown');
  });
});

describe('grammars', () => {
  it('builds choice and argument grammars', () => {
    expect(choiceGrammar(3)).toBe('root ::= "A" | "B" | "C"');
    const g = argsGrammar({
      type: 'object',
      properties: { near: { type: 'string' }, type: { type: 'string', enum: ['a', 'b'] } },
      required: ['type'],
    });
    expect(g.split('\n')[0]).toBe(
      'root ::= "{" ws "\\"type\\"" ws ":" ws ("\\"a\\"" | "\\"b\\"") ws "," ws "\\"near\\"" ws ":" ws ("null" | string) ws "}"',
    );
    expect(argsGrammar({ type: 'object', properties: {} })).toBe('root ::= "{}"');
    expect(dropNulls({ a: 1, b: null, c: '' })).toEqual({ a: 1 });
  });

  /**
   * Every tool's argument grammar, shared with the Rust grammar tests (`src-tauri/src/llm/grammar.rs`
   * compiles each one). `UPDATE_GRAMMARS=1 bun run test` rewrites the fixture after a tool changes.
   */
  it('matches the fixture the native engine compiles', () => {
    const s = makeSim(1);
    const all = Object.fromEntries(
      registry(s)
        .list()
        .map((t) => [t.name, argsGrammar(t.input)]),
    );
    all['menu'] = choiceGrammar(16);
    const path = 'src-tauri/tests/fixtures/llm/bloomgrid-grammars.json';
    const json = `${JSON.stringify(all, null, 2)}\n`;
    if (process.env.UPDATE_GRAMMARS || !existsSync(path)) writeFileSync(path, json);
    expect(readFileSync(path, 'utf8')).toBe(json);
  });
});

describe('agent loop', () => {
  it('looks up, acts after approval, observes, and answers from what ran', async () => {
    const s = founded();
    const tools = registry(s);
    const target = queryInventory(s.city, {
      kind: 'building',
      type: 'pocket-park',
      district: 'Bayfront',
      limit: 1,
    }).items[0]!;
    const llm = scripted([
      pick('Find city objects'),
      () =>
        JSON.stringify({
          text: null,
          kind: 'building',
          type: 'pocket-park',
          group: null,
          district: 'Bayfront',
          status: null,
          issue: null,
          near_x: null,
          near_z: null,
          radius: null,
          sort: null,
          desc: null,
          limit: 1,
          offset: null,
        }),
      pick('Demolish'),
      (m) => {
        // The id argument is held to ids the turn has seen.
        expect(m[1]!.content).toContain(target.id);
        return JSON.stringify({ id: target.id });
      },
      // A successful action ends the loop: no decision after it, straight to the answer.
      () => `<think>\n\n</think>\n\nDemolished ${target.id}.`,
    ]);
    const events: AgentEvent[] = [];
    const asked: string[] = [];
    const out = await runTurn({
      llm,
      tools,
      request: 'Remove a pocket park in Bayfront',
      brief: () => cityBrief(s.city),
      approve: async (c) => (asked.push(`${c.tool} ${JSON.stringify(c.args)}`), true),
      onEvent: (e) => events.push(e),
    });
    expect(out.answer).toBe(`Demolished ${target.id}.`);
    expect(asked).toEqual([`demolish {"id":"${target.id}"}`]);
    expect(getObject(s.city, target.id)).toBeNull();
    expect(out.steps.map((x) => [x.call.tool, x.ok])).toEqual([
      ['inventory_search', true],
      ['demolish', true],
    ]);
    // Decisions are one letter held to a grammar; arguments to the tool's grammar.
    expect(llm.calls[0]!.opts.grammar).toMatch(/^root ::= "A" \| "B"/);
    expect(llm.calls[1]!.opts.grammar).toContain('"\\"kind\\""');
    expect(events.filter((e) => e.type === 'approval')).toHaveLength(1);
  });

  it('a declined action is not run and the answer is told so', async () => {
    const s = founded();
    const before = s.city.credits;
    const llm = scripted([
      pick('Change the tax'),
      () => '{"percent": 20}',
      (m) => (expect(m[1]!.content).toContain('declined'), 'I left the tax as it is.'),
    ]);
    const out = await runTurn({
      llm,
      tools: registry(s),
      request: 'raise taxes to 20%',
      brief: () => cityBrief(s.city),
      approve: async () => false,
    });
    expect(out.steps[0]).toMatchObject({ ok: false, error: 'The steward declined this action.' });
    expect(s.city.pulse.taxRate).not.toBe(0.2);
    expect(s.city.credits).toBe(before);
  });

  it('retries arguments once with the validation errors, then observes the failure', async () => {
    const s = founded();
    const llm = scripted([
      pick('Full detail'),
      () => '{"id": 42}',
      (m) => (expect(m[1]!.content).toContain('rejected'), 'not json'),
      reply,
      () => 'Sorry.',
    ]);
    const out = await runTurn({
      llm,
      tools: registry(s),
      request: 'inspect something',
      brief: () => cityBrief(s.city),
    });
    expect(out.steps[0]!.ok).toBe(false);
    expect(out.answer).toBe('Sorry.');
  });

  it('an unreadable decision ends the loop with a reply; maxSteps bounds it', async () => {
    const s = founded();
    const out = await runTurn({
      llm: scripted([() => 'Z', () => 'Hello!']),
      tools: registry(s),
      request: 'hi',
      brief: () => '',
    });
    expect(out).toEqual({ answer: 'Hello!', steps: [] });
    // A tool without arguments needs no fill; the second identical call is skipped and the turn answers.
    const loop = scripted([pick('Headline state'), pick('Headline state'), () => 'ok']);
    const r = await runTurn({
      llm: loop,
      tools: registry(s),
      request: 'status',
      brief: () => '',
      maxSteps: 3,
      policy: () => 'auto',
    });
    expect(r.steps).toHaveLength(1);
  });

  it('routes plain commands to their tool without a decision', async () => {
    expect(plainIntent('Build a water works in Westbrook')).toBe('build');
    expect(plainIntent('please demolish LIV-0042')).toBe('demolish');
    expect(plainIntent('set taxes to 15%')).toBe('set_tax');
    expect(plainIntent('how are we doing?')).toBeNull();
    expect(plainIntent('What did you just build?')).toBeNull();
    expect(plainIntent('where is the lighthouse?')).toBe('object_select');
    // Questions never offer actions.
    const llm2 = scripted([
      (m) => (expect(m[1]!.content).not.toMatch(/Demolish|Build a new/), reply(m)),
      () => 'Two homes lack power.',
    ]);
    await runTurn({ llm: llm2, tools: registry(founded()), request: 'what needs fixing?', brief: () => '' });
    const s = founded();
    const llm = scripted([() => '{"type": "pocket-park", "district": "Westbrook"}', () => 'Built it.']);
    const out = await runTurn({
      llm,
      tools: registry(s),
      request: 'build a pocket park in Westbrook',
      brief: () => '',
      approve: async () => true,
    });
    expect(out.steps[0]).toMatchObject({ ok: true, call: { tool: 'build' } });
    expect(llm.calls[0]!.opts.grammar).toContain('"\\"type\\""');
  });

  it('helpers: observation cut, think stripped, ids found', () => {
    expect(observe({ a: Array.from({ length: 20 }, (_, i) => i) })).toBe(
      '{"a":[0,1,2,3,4,5,6,7,"…12 more"]}',
    );
    expect(observe('x'.repeat(2000)).endsWith('…(cut)')).toBe(true);
    expect(stripThink('<think>hm</think>\nYes')).toBe('Yes');
    expect(idsIn('fix LIV-0042 and HWY-304.368, not ABC-1')).toEqual(['LIV-0042', 'HWY-304.368']);
  });

  it('the brief names the city state in a few lines', () => {
    const s = founded();
    const b = cityBrief(s.city);
    expect(b).toMatch(/Treasury \d+ credits/);
    expect(b).toContain('Westbrook');
    expect(b.length).toBeLessThan(1200);
  });
});
