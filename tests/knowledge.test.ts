import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_CATEGORIES, docSections, parseDoc, serializeDoc, shippedDocs } from '@/content/knowledge';
import { referenceDocs } from '@/sim/knowledgeRefs';
import { allCrises } from '@/sim/crises';
import { KnowledgeBase, MemoryDocStore } from '@/modules/knowledge/base';
import { docLink, parseInline, parseMarkdown } from '@/modules/knowledge/markdown';
import { knowledgeTools } from '@/modules/knowledge/tools';
import { describeActions } from '@/modules/knowledge/actions';
import { AgentToolRegistry } from '@/core/AgentTools';
import { observe, plainIntent, runTurn, type Llm } from '@/ai/agent';

const docs = () => [...shippedDocs(), ...referenceDocs()];
const base = (store = new MemoryDocStore(), t = { now: 1_800_000_000_000 }) =>
  new KnowledgeBase(docs(), store, () => t.now++);

describe('Seedvault docs', () => {
  it('every shipped doc parses with a unique id, a known category, a title and a summary', () => {
    const all = shippedDocs();
    expect(all.length).toBeGreaterThanOrEqual(25);
    const cats = new Set(KNOWLEDGE_CATEGORIES.map((c) => c.id));
    const ids = new Set<string>();
    for (const d of all) {
      expect(ids.has(d.id), d.id).toBe(false);
      ids.add(d.id);
      expect(cats.has(d.category), `${d.id}: ${d.category}`).toBe(true);
      expect(d.title.length, d.id).toBeGreaterThan(3);
      expect(d.summary.length, d.id).toBeGreaterThan(20);
      expect(d.source).toBe('guide');
    }
  });

  it('links and related ids point at docs that exist (field logs appear once the city writes them)', () => {
    const ids = new Set(docs().map((d) => d.id));
    const ok = (id: string) => ids.has(id) || id.startsWith('field-log-');
    for (const d of shippedDocs()) {
      for (const r of d.related) expect(ok(r), `${d.id} → related ${r}`).toBe(true);
      for (const m of d.body.matchAll(/\]\(([^)]+)\)/g)) {
        const link = docLink(m[1]!);
        if (link) expect(ok(link.id), `${d.id} → ${m[1]}`).toBe(true);
      }
    }
  });

  it('sections stay small enough for Flora to read one at a time', () => {
    for (const d of shippedDocs())
      for (const s of docSections(d.body)) expect(s.text.length, `${d.id} § ${s.title}`).toBeLessThan(1400);
  });

  it('every crisis has a runbook and appears in the live almanac', () => {
    const kb = base();
    const almanac = kb.get('reference-crises')!;
    for (const c of allCrises()) {
      expect(almanac.body).toContain(c.name);
      expect(kb.runbookFor(c.id), `runbook for ${c.id}`).toBeDefined();
    }
    expect(kb.runbookFor('fire')?.id).toBe('runbook-fires');
  });

  it('front matter round-trips through serializeDoc', () => {
    const d = parseDoc(
      '---\nid: note-x\ntitle: "Fires: what worked"\ncategory: notes\nsummary: Crews early, always.\ntags: [fire, crews]\nrelated: [runbook-fires]\nauthor: flora\nupdated: 1700000000000\n---\n\n## Lesson\n\nSend crews early.\n',
      'journal',
      'x',
    );
    expect(d).toMatchObject({
      id: 'note-x',
      title: 'Fires: what worked',
      tags: ['fire', 'crews'],
      related: ['runbook-fires'],
      author: 'flora',
      updated: 1700000000000,
    });
    expect(parseDoc(serializeDoc(d), 'journal', 'y')).toEqual(d);
  });
});

describe('Seedvault markdown', () => {
  it('parses headings, nested lists, tables, callouts and code', () => {
    const b = parseMarkdown(
      '## Steps\n\n1. First\n2. Second\n   - nested\n\n| A | B |\n| --- | ---: |\n| 1 | 2 |\n\n> **Tip:** do it\n\n```\ncode | here\n```\n',
    );
    expect(b.map((x) => x.t)).toEqual(['h', 'list', 'table', 'quote', 'code']);
    const list = b[1] as Extract<(typeof b)[number], { t: 'list' }>;
    expect(list.ordered).toBe(true);
    expect(list.items[1]!.children[0]!.t).toBe('list');
    expect((b[2] as { align: string[] }).align).toEqual(['', 'r']);
    expect((b[3] as { tone: string }).tone).toBe('tip');
  });

  it('parses inline spans and doc links', () => {
    expect(parseInline('a **b** `c` [d](kb:runbook-fires) *e*').map((s) => s.t)).toEqual([
      'text',
      'b',
      'text',
      'code',
      'text',
      'a',
      'text',
      'i',
    ]);
    expect(docLink('kb:runbook-fires#procedure')).toEqual({ id: 'runbook-fires', section: 'procedure' });
    expect(docLink('../runbooks/fires.md')).toEqual({ id: 'fires' });
    expect(docLink('https://example.com')).toBeNull();
  });
});

describe('Seedvault search', () => {
  it('finds the right runbook for the words players use', () => {
    const kb = base();
    const top = (q: string, n = 3) => kb.search(q, n).map((h) => h.doc.id);
    expect(top('how do I put out a fire', 1)).toEqual(['runbook-fires']);
    expect(top('blackout')).toContain('runbook-blackout');
    expect(top('we are out of money')).toContain('runbook-budget-deficit');
    expect(top('tsunami siren', 1)).toEqual(['runbook-tsunami']);
    expect(top('how should we prepare for a tsunami?', 1)).toEqual(['runbook-tsunami']);
    expect(top('what to do when the grid fails', 1)).toEqual(['runbook-blackout']);
    expect(top('traffic jam')).toContain('runbook-traffic');
    expect(top('about to be fired by the council')).toContain('runbook-fail-clock');
  });

  it('reads one section by heading or by free words', () => {
    const kb = base();
    expect(kb.read('runbook-fires', 'Prevention').section?.title).toBe('Prevention');
    expect(kb.read('runbook-fires', 'how to stop them happening').section?.title).toBe('Prevention');
    expect(() => kb.read('runbook-fire')).toThrow(/Closest: .*runbook-fires/);
  });
});

describe('Seedvault journal', () => {
  it('saves notes to the device store and reads them back in a new session', async () => {
    const store = new MemoryDocStore();
    const kb = base(store);
    await kb.load();
    const d = await kb.saveNote({
      title: 'Crews early',
      body: 'Send crews before it spreads.',
      tags: ['Fire'],
    });
    expect(store.docs.get(d.id)).toContain('title: Crews early');
    expect(kb.search('crews spreads', 3).map((h) => h.doc.id)).toContain(d.id);

    const again = base(store);
    await again.load();
    expect(again.get(d.id)).toMatchObject({
      title: 'Crews early',
      tags: ['fire'],
      source: 'journal',
      author: 'steward',
    });
    expect(await again.remove(d.id)).toBe(true);
    expect(store.docs.has(d.id)).toBe(false);
    expect(await again.remove('runbook-fires')).toBe(false);
  });

  it('accumulates field logs across sessions and learns from them', async () => {
    const store = new MemoryDocStore();
    const kb = base(store);
    await kb.load();
    const fire = (cost: number, outcome: string) => ({
      city: 'Verdance',
      clock: 'Day 2 · 10:00',
      name: 'Fire',
      icon: '🔥',
      severity: 1,
      district: 'Westbrook',
      hits: 3,
      lost: outcome === 'burned out' ? 1 : 0,
      fires: 1,
      displaced: 0,
      cost,
      outcome,
      secs: 30,
    });
    await kb.recordIncident('fire', fire(150, 'contained by crews'));
    await kb.recordIncident('fire', fire(2400, 'burned out'));
    const again = base(store);
    await again.load();
    await again.recordIncident('fire', fire(200, 'contained by crews'));
    const log = again.get('field-log-fire')!;
    expect(log).toMatchObject({ category: 'field-log', author: 'city', related: ['runbook-fires'] });
    expect(log.body).toContain('3 fire incidents recorded');
    expect(log.body).toMatch(/ended "burned out" cost ◈2,400 on average/);
    expect(log.body).toContain('[Fire response](kb:runbook-fires)');
    expect(store.docs.get('field-log-fire')).toContain('seedvault:data');

    const r = await again.recordRecovery({
      city: 'Verdance',
      clock: 'Day 3 · 08:00',
      system: 'Water',
      worst: 'Critical',
      back: 'Stable',
      secs: 40,
      actions: 'built ×2 (Fog Harp Tower)',
    });
    expect(r.body).toContain('most often after: built (Fog Harp Tower)');
  });

  it('names what the steward did between a drop and a recovery', () => {
    expect(
      describeActions([
        { type: 'build', payload: { def: 'pocket-park', x: 0, z: 0, rot: 0 } },
        { type: 'build', payload: { def: 'pocket-park', x: 2, z: 0, rot: 0 } },
        { type: 'setTax', payload: { rate: 0.1 } },
        { type: 'floraBill', payload: { tokens: 10 } },
      ]),
    ).toBe('built ×2 (Bloom Park), changed taxes');
    expect(describeActions([])).toMatch(/nothing/);
  });
});

describe('Seedvault tools', () => {
  const setup = async () => {
    const kb = base();
    await kb.load();
    const opened: (string | undefined)[] = [];
    const reg = new AgentToolRegistry<null>(null);
    for (const t of knowledgeTools<null>(kb, { open: (id) => opened.push(id) })) reg.register(t);
    return { kb, reg, opened };
  };

  it('catalog → read: finds a section, then reads it within the observation budget', async () => {
    const { reg } = await setup();
    const cat = await reg.call('knowledge_catalog', { query: 'stop a fire spreading' });
    expect(cat.ok).toBe(true);
    const res = (cat as { result: { results: { doc: string }[] } }).result;
    expect(res.results[0]!.doc).toBe('runbook-fires');
    expect(observe(res)).not.toContain('(cut)');

    const all = await reg.call('knowledge_catalog', {});
    expect(observe((all as { result: unknown }).result)).toContain('runbook-tsunami');

    const read = await reg.call('knowledge_read', { doc: 'runbook-fires', section: 'Procedure' });
    const r = (read as { result: { section: string; text: string; sections: string } }).result;
    expect(r.section).toBe('Procedure');
    expect(r.text).toContain('Dispatch crews');
    expect(r.sections).toContain('Prevention');
    expect(observe(r).length).toBeLessThanOrEqual(1400);
    expect(observe(r)).not.toContain('(cut)');
  });

  it('holds the doc id to what the catalog returned', async () => {
    const { reg } = await setup();
    const t = reg.get('knowledge_read')!;
    const s = t.narrow!(t.input, {
      request: 'how do I handle a tsunami?',
      observed: '{"results":[{"doc":"runbook-tsunami"},{"doc":"runbook-floods"}]}',
    });
    expect(s.properties!.doc!.enum!.slice(0, 2)).toEqual(['runbook-tsunami', 'runbook-floods']);
    expect(s.properties!.doc!.enum).not.toContain('reference-buildings-food');
  });

  it('notes are saved, and open shows a doc', async () => {
    const { kb, reg, opened } = await setup();
    const n = await reg.call('knowledge_note', {
      title: 'Gates first',
      text: 'Close the Tide Gates before the siren.',
    });
    expect(n.ok).toBe(true);
    expect(kb.get((n as { result: { saved: string } }).result.saved)?.author).toBe('flora');
    expect((await reg.call('knowledge_open', { doc: 'runbook-tsunami' })).ok).toBe(true);
    expect(opened).toEqual(['runbook-tsunami']);
    expect((await reg.call('knowledge_open', { doc: 'nope' })).ok).toBe(false);
  });

  it('a how-to turn searches, then reads the best section before answering', async () => {
    const { reg } = await setup();
    const prompts: string[] = [];
    const llm: Llm = {
      async generate(messages) {
        const text = messages.map((m) => m.content).join('\n');
        prompts.push(text);
        if (text.includes('Write the arguments for this call')) return '{"query":"stop fires spreading"}';
        const letters = /option letter from: ([A-P, ]+)\./.exec(text);
        if (letters) return letters[1]!.split(', ').pop()!;
        return 'Send crews early and cover dense blocks with Ember Watch stations.';
      },
    };
    const out = await runTurn({
      llm,
      tools: reg,
      request: 'how do I stop fires spreading?',
      brief: () => 'Day 1.',
    });
    expect(out.steps.map((s) => s.call.tool)).toEqual(['knowledge_catalog', 'knowledge_read']);
    expect(out.steps[1]!.call.args).toMatchObject({ doc: 'runbook-fires' });
    // The answer is written from the section that was read, not just the search snippet.
    expect(prompts[prompts.length - 1]).toContain('Ember Watch');
    expect(prompts.filter((p) => p.includes('Write the arguments')).length).toBe(1);
  });

  it('routes how-to questions, notes and opening runbooks to the knowledge tools', () => {
    expect(plainIntent('how do I stop fires spreading?')).toBe('knowledge_catalog');
    expect(plainIntent('what is the procedure for a tsunami?')).toBe('knowledge_catalog');
    expect(plainIntent('remember that crews should go early')).toBe('knowledge_note');
    expect(plainIntent('open the fire runbook')).toBe('knowledge_open');
    // Unchanged routes.
    expect(plainIntent('how is our budget?')).toBe('budget_breakdown');
    expect(plainIntent('put out the fires')).toBe('respond_incident');
  });
});
