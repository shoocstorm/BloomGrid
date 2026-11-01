import type { AgentTool, JsonSchema } from '@/core/AgentTools';
import { KNOWLEDGE_CATEGORIES } from '@/content/knowledge';
import type { KnowledgeBase } from './base';

/**
 * Flora's Seedvault tools (D-088): agentic retrieval in two levels, sized for a small local model whose
 * observations are cut at ~1.4k characters.
 *
 * 1. `knowledge_catalog` finds docs: with a query, the best docs each with the section that matched and a
 *    snippet (BM25 over sections, synonyms, coverage bonus); without one, the catalog's doc ids by category.
 * 2. `knowledge_read` reads one doc: its outline, related docs and the text of one section (by heading or by
 *    free words: the best-matching section is read), so a long runbook costs one section, not the whole file.
 *
 * Its doc id is held to the ids the turn's catalog results named (then the docs that match the request), so a
 * small model can only ask for a real doc. `knowledge_note` keeps a lesson on the device (asks first), and
 * `knowledge_open` shows a doc to the steward in the Seedvault.
 */

const READ_CHARS = 820;
const SNIPPET = 120;

/** Doc ids named in text (the catalog's results), in order of appearance. */
function idsIn(text: string, kb: KnowledgeBase): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g))
    if (!out.includes(m[0]) && kb.get(m[0])) out.push(m[0]);
  return out;
}

/** The doc argument held to real ids, the ones this turn has seen first. */
function narrowDoc(kb: KnowledgeBase) {
  return (schema: JsonSchema & { type: 'object' }, turn: { request: string; observed: string }) => {
    const seen = idsIn(turn.observed, kb);
    const ranked = kb.search(turn.request, 12).map((h) => h.doc.id);
    const ids = [...new Set([...seen, ...ranked, ...kb.all().map((d) => d.id)])];
    const doc = schema.properties?.doc;
    if (!doc) return schema;
    return {
      ...schema,
      properties: {
        ...schema.properties,
        doc: { ...doc, enum: seen.length ? [...new Set([...seen, ...ranked])] : ids },
      },
    };
  };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);

export function knowledgeTools<Ctx>(
  kb: KnowledgeBase,
  ui: { open(id?: string, section?: string): void },
): AgentTool<Ctx, never>[] {
  const categories = KNOWLEDGE_CATEGORIES.map((c) => c.id);
  return [
    {
      name: 'knowledge_catalog',
      option: 'Look up the knowledge base: guides, runbooks, how-tos, field logs, notes',
      description:
        'Searches Seedvault, the city knowledge base (how-to guides, incident runbooks, cause-and-effect explanations, the live rule reference, field logs of past incidents and fixes, and saved notes). With a query it returns the best docs with the matching section and a snippet; without one, every doc id by category. Then read a doc with knowledge_read.',
      keywords: [
        'how',
        'guide',
        'manual',
        'runbook',
        'procedure',
        'learn',
        'explain',
        'knowledge',
        'help',
        'tips',
        'strategy',
        'lesson',
        'playbook',
        'why',
        'prepare',
      ],
      input: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What to look up, in a few words (e.g. "put out fires", "budget deficit")',
          },
          category: { type: 'string', enum: categories, description: 'Only this category' },
        },
      },
      llmArgs: ['query'],
      effect: 'read',
      // Level two follows at once: read the section that matched best (the model then answers from it).
      follow(result) {
        const top = (result as { results?: { doc: string; section: string }[] }).results?.[0];
        return top ? { tool: 'knowledge_read', args: { doc: top.doc, section: top.section } } : null;
      },
      run(_c, { query, category }: { query?: string; category?: string }) {
        const filter = category ? (d: { category: string }) => d.category === category : undefined;
        if (query?.trim()) {
          const hits = kb.search(query, 5, filter);
          if (!hits.length)
            return {
              query,
              results: [],
              next: 'Nothing matched. Try other words, or call knowledge_catalog without a query for every doc.',
            };
          return {
            query,
            results: hits.map((h) => ({
              doc: h.doc.id,
              title: h.doc.title,
              section: h.section.title,
              snippet: clip(h.snippet, SNIPPET),
            })),
            next: `Read the best one: knowledge_read doc="${hits[0]!.doc.id}" section="${hits[0]!.section.title}".`,
          };
        }
        const groups = kb.catalog().filter((g) => g.docs.length && (!category || g.id === category));
        return {
          categories: groups.map((g) => ({ category: g.id, docs: g.docs.map((d) => d.id).join(', ') })),
          next: 'Search with a query, or read one with knowledge_read doc="<id>".',
        };
      },
    },
    {
      name: 'knowledge_read',
      option: 'Read a knowledge doc (or one section of it) found with knowledge_catalog',
      description:
        'Reads one Seedvault doc by id: its outline (section titles), related docs and the text of one section. Name a section by its title, or give a few words and the best-matching section is read; without a section the doc opens at its start.',
      keywords: ['read', 'runbook', 'guide', 'doc', 'section', 'steps', 'procedure'],
      input: {
        type: 'object',
        properties: {
          doc: { type: 'string', description: 'Doc id from knowledge_catalog, e.g. runbook-fires' },
          section: {
            type: 'string',
            description: 'Section title, or a few words of what to find in the doc',
          },
        },
        required: ['doc'],
      },
      effect: 'read',
      narrow: narrowDoc(kb),
      run(_c, { doc, section }: { doc: string; section?: string }) {
        const r = kb.read(doc, section);
        const outline = r.sections.filter((s) => s.id !== 'intro').map((s) => s.title);
        const text = r.section ? r.text : `${r.doc.summary}\n\n${r.text}`;
        return {
          doc: r.doc.id,
          title: r.doc.title,
          ...(r.doc.source === 'journal' && r.doc.updated
            ? { updated: new Date(r.doc.updated).toISOString().slice(0, 10) }
            : {}),
          section: r.section?.title ?? null,
          text: clip(text, READ_CHARS),
          ...(text.length > READ_CHARS ? { more: 'Cut: read one section for the rest.' } : {}),
          sections: outline.join('; '),
          ...(r.doc.related.length ? { related: r.doc.related.join(', ') } : {}),
        };
      },
    },
    {
      name: 'knowledge_note',
      option: 'Save a note or lesson to the knowledge base',
      description:
        'Saves a note in Seedvault on this device (it outlives this city): a lesson learned, a procedure that worked, a reminder. Asks the steward first.',
      keywords: ['note', 'remember', 'save', 'lesson', 'write', 'record', 'journal'],
      input: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A short title' },
          text: { type: 'string', description: 'The note, in plain sentences' },
          tags: { type: 'string', description: 'Comma-separated tags' },
        },
        required: ['title', 'text'],
      },
      llmArgs: ['title', 'text'],
      effect: 'mutate',
      async run(_c, { title, text, tags }: { title: string; text: string; tags?: string }) {
        const d = await kb.saveNote({ title, body: text, tags: tags?.split(','), author: 'flora' });
        return { saved: d.id, title: d.title, where: kb.where };
      },
    },
    {
      name: 'knowledge_open',
      option: 'Open the Seedvault knowledge base on a doc for the steward',
      description:
        'Opens Seedvault, the knowledge base, on one doc (and section) so the steward can read it, or on its catalog when no doc is given.',
      keywords: ['open', 'show', 'runbook', 'guide', 'seedvault', 'knowledge'],
      input: {
        type: 'object',
        properties: {
          doc: { type: 'string', description: 'Doc id, e.g. runbook-fires' },
          section: { type: 'string', description: 'Section title to scroll to' },
        },
      },
      effect: 'view',
      narrow: narrowDoc(kb),
      run(_c, { doc, section }: { doc?: string; section?: string }) {
        if (doc && !kb.get(doc)) throw new Error(`No doc "${doc}". Use knowledge_catalog to find ids.`);
        ui.open(doc, section);
        return { opened: doc ?? 'catalog', ...(doc ? { title: kb.get(doc)!.title } : {}) };
      },
    },
  ];
}
