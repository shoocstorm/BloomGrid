import {
  KNOWLEDGE_CATEGORIES,
  categoryLabel,
  docSections,
  parseDoc,
  plainText,
  serializeDoc,
  slug,
  type DocSection,
  type KnowledgeDoc,
} from '@/content/knowledge';
import type { DocStore } from '@/platform/types';
import { KnowledgeIndex, type SearchHit } from './search';

/**
 * Seedvault's knowledge base (D-088): the shipped guides, the live reference and the journal (docs written on
 * this device: the steward's and Flora's notes, and the field logs the city keeps itself), behind one catalog,
 * search and reader. Journal docs persist through the platform's `DocStore` (IndexedDB on the web, Markdown
 * files in the desktop app's `knowledge` folder), so they outlive any one city and carry lessons into the next.
 * Field logs keep their raw entries in a trailing `<!-- seedvault:data … -->` comment and regenerate their
 * Markdown (summary, what the record shows, recent incidents) whenever an entry is added.
 */

/** One finished incident, as the field logs keep it. */
export interface FieldEntry {
  /** Epoch ms (device clock). */
  at: number;
  city: string;
  /** "Day 3 · 14:20". */
  clock: string;
  name: string;
  icon: string;
  severity: number;
  district: string | null;
  cause?: string;
  hits: number;
  lost: number;
  fires: number;
  displaced: number;
  cost: number;
  outcome: string;
  prevented?: string[];
  /** Sim seconds it lasted. */
  secs: number;
}

/** A system that fell and came back, with what the steward did in between. */
export interface RecoveryEntry {
  at: number;
  city: string;
  clock: string;
  system: string;
  /** Worst tier name reached ("Critical") and the tier it came back to. */
  worst: string;
  back: string;
  secs: number;
  /** "build ×2 (Fog Harp Tower), setTax" */
  actions: string;
}

export interface ConsequenceEntry {
  at: number;
  city: string;
  clock: string;
  rule: string;
  name: string;
  text: string;
  good: boolean;
}

export interface NoteInput {
  title: string;
  body: string;
  tags?: string[];
  category?: string;
  summary?: string;
  related?: string[];
  author?: 'steward' | 'flora';
}

export interface CatalogGroup {
  id: string;
  label: string;
  blurb: string;
  docs: KnowledgeDoc[];
}

export interface DocReading {
  doc: KnowledgeDoc;
  sections: DocSection[];
  /** The section asked for (or best matching), null for the whole doc. */
  section: DocSection | null;
  text: string;
}

/** An in-memory store (tests, and a fallback when the device store fails). */
export class MemoryDocStore implements DocStore {
  readonly where = 'memory';
  readonly docs = new Map<string, string>();
  async list() {
    return [...this.docs].map(([id, text]) => ({ id, text }));
  }
  async put(id: string, text: string) {
    this.docs.set(id, text);
  }
  async remove(id: string) {
    this.docs.delete(id);
  }
}

const DATA_RE = /<!--\s*seedvault:data\s*([\s\S]*?)-->/;
const FIELD_MAX = 30;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');

function tally(values: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export class KnowledgeBase {
  private fixed: KnowledgeDoc[];
  private journal = new Map<string, KnowledgeDoc>();
  private data = new Map<string, unknown[]>();
  private index: KnowledgeIndex | null = null;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  /** Bumped on every change (UI refresh). */
  version = 0;
  loaded = false;

  constructor(
    docs: readonly KnowledgeDoc[],
    private store: DocStore = new MemoryDocStore(),
    /** Device clock (journal timestamps); injectable for tests. */
    private now: () => number = () => Date.now(),
  ) {
    const seen = new Set<string>();
    this.fixed = docs.filter((d) => !seen.has(d.id) && (seen.add(d.id), true));
  }

  get where(): string {
    return this.store.where;
  }

  /** Reads the journal from the device. Files that fail to parse are skipped. */
  async load(): Promise<void> {
    let rows: { id: string; text: string }[] = [];
    try {
      rows = await this.store.list();
    } catch (e) {
      console.warn('[knowledge] could not read the journal', e);
    }
    for (const { id, text } of rows) {
      try {
        const doc = parseDoc(text, 'journal', id);
        // A dropped-in file may reuse a shipped id: keep both.
        if (this.fixed.some((d) => d.id === doc.id)) doc.id = `my-${doc.id}`;
        const raw = DATA_RE.exec(text)?.[1];
        if (raw) this.data.set(doc.id, JSON.parse(raw) as unknown[]);
        this.journal.set(doc.id, doc);
      } catch (e) {
        console.warn('[knowledge] skipped', id, e);
      }
    }
    this.loaded = true;
    this.changed();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    this.index = null;
    this.version++;
    for (const fn of this.listeners) fn();
  }

  all(): KnowledgeDoc[] {
    return [...this.fixed, ...this.journal.values()];
  }

  get(id: string): KnowledgeDoc | undefined {
    const key = slug(id.replace(/\.md$/, ''));
    return this.journal.get(key) ?? this.fixed.find((d) => d.id === key);
  }

  isJournal(id: string): boolean {
    return this.journal.has(id);
  }

  search(query: string, limit = 8, filter?: (d: KnowledgeDoc) => boolean): SearchHit[] {
    this.index ??= new KnowledgeIndex(this.all());
    return this.index.search(query, limit, filter);
  }

  /** Docs grouped by category, in reading order (journal docs newest first). */
  catalog(): CatalogGroup[] {
    const groups = new Map<string, CatalogGroup>(KNOWLEDGE_CATEGORIES.map((c) => [c.id, { ...c, docs: [] }]));
    for (const d of this.all()) {
      if (!groups.has(d.category))
        groups.set(d.category, { id: d.category, label: categoryLabel(d.category), blurb: '', docs: [] });
      groups.get(d.category)!.docs.push(d);
    }
    for (const g of groups.values())
      g.docs.sort(
        (a, b) => (b.updated ?? 0) - (a.updated ?? 0) || a.order - b.order || a.title.localeCompare(b.title),
      );
    return [...groups.values()];
  }

  /**
   * A doc, or one section of it: `section` may be a heading id, a heading's words or any question (the best
   * matching section is read). Unknown ids throw with the closest docs, so a model can correct itself.
   */
  read(id: string, section?: string): DocReading {
    const doc = this.get(id);
    if (!doc) {
      const near = this.search(id.replace(/[-_]/g, ' '), 3).map((h) => h.doc.id);
      throw new Error(
        `No doc "${id}".${near.length ? ` Closest: ${near.join(', ')}.` : ''} Use knowledge_catalog to find ids.`,
      );
    }
    const sections = docSections(doc.body);
    let sec: DocSection | null = null;
    if (section?.trim()) {
      const s = slug(section);
      sec =
        sections.find((x) => x.id === s) ??
        sections.find((x) => x.id.startsWith(s) || s.startsWith(x.id)) ??
        (this.index ??= new KnowledgeIndex(this.all())).bestSection(doc.id, section);
    }
    return { doc, sections, section: sec, text: plainText(sec ? sec.text : doc.body) };
  }

  /** The runbook covering an incident kind (`fire`, `monsoon`…). */
  runbookFor(kind: string): KnowledgeDoc | undefined {
    return this.fixed.find((d) => d.source === 'guide' && d.covers.includes(kind));
  }

  /** Runs journal writes one after another, so two quick records never race on the same file. */
  private write<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async persist(doc: KnowledgeDoc, data?: unknown[]): Promise<void> {
    this.journal.set(doc.id, doc);
    if (data) this.data.set(doc.id, data);
    this.changed();
    const text = serializeDoc(doc) + (data ? `\n<!-- seedvault:data ${JSON.stringify(data)} -->\n` : '');
    try {
      await this.store.put(doc.id, text);
    } catch (e) {
      console.warn('[knowledge] could not save', doc.id, e);
    }
  }

  /** Adds or replaces a note. Returns the saved doc. */
  saveNote(input: NoteInput, id?: string): Promise<KnowledgeDoc> {
    return this.write(async () => {
      const title = input.title.trim().slice(0, 120) || 'Untitled note';
      const existing = id ? this.journal.get(id) : undefined;
      const docId = existing?.id ?? this.freeId(`note-${slug(title).slice(0, 40)}`);
      const body = input.body.trim();
      const doc: KnowledgeDoc = {
        id: docId,
        title,
        category: input.category && input.category !== 'field-log' ? slug(input.category) : 'notes',
        summary: input.summary?.trim() || plainText(body).replace(/\s+/g, ' ').slice(0, 200),
        tags: [...new Set((input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(
          0,
          12,
        ),
        related: input.related ?? existing?.related ?? [],
        covers: [],
        source: 'journal',
        body,
        order: 50,
        author: input.author ?? existing?.author ?? 'steward',
        updated: this.now(),
      };
      await this.persist(doc);
      return doc;
    });
  }

  private freeId(base: string): string {
    let id = base;
    for (let i = 2; this.get(id); i++) id = `${base}-${i}`;
    return id;
  }

  /** Deletes a journal doc (shipped and reference docs cannot be deleted). */
  remove(id: string): Promise<boolean> {
    return this.write(async () => {
      if (!this.journal.delete(id)) return false;
      this.data.delete(id);
      this.changed();
      try {
        await this.store.remove(id);
      } catch (e) {
        console.warn('[knowledge] could not delete', id, e);
      }
      return true;
    });
  }

  // ── Field logs ──────────────────────────────────────────────────────────────

  /** Adds a finished incident to its kind's field log (`field-log-<kind>`). */
  recordIncident(kind: string, entry: Omit<FieldEntry, 'at'>): Promise<KnowledgeDoc> {
    return this.write(async () => {
      const id = `field-log-${slug(kind)}`;
      const entries = [
        ...((this.data.get(id) as FieldEntry[] | undefined) ?? []),
        { at: this.now(), ...entry },
      ].slice(-FIELD_MAX);
      const doc = this.incidentLog(id, kind, entries);
      await this.persist(doc, entries);
      return doc;
    });
  }

  /** Logs a system's recovery: how far it fell, how long it took and what was done meanwhile. */
  recordRecovery(entry: Omit<RecoveryEntry, 'at'>): Promise<KnowledgeDoc> {
    return this.write(async () => {
      const id = 'field-log-recoveries';
      const entries = [
        ...((this.data.get(id) as RecoveryEntry[] | undefined) ?? []),
        { at: this.now(), ...entry },
      ].slice(-FIELD_MAX);
      await this.persist(this.recoveryLog(id, entries), entries);
      return this.journal.get(id)!;
    });
  }

  /** Logs a consequence rule coming into force. */
  recordConsequence(entry: Omit<ConsequenceEntry, 'at'>): Promise<KnowledgeDoc> {
    return this.write(async () => {
      const id = 'field-log-consequences';
      const entries = [
        ...((this.data.get(id) as ConsequenceEntry[] | undefined) ?? []),
        { at: this.now(), ...entry },
      ].slice(-FIELD_MAX);
      await this.persist(this.consequenceLog(id, entries), entries);
      return this.journal.get(id)!;
    });
  }

  private logDoc(
    id: string,
    title: string,
    summary: string,
    body: string,
    tags: string[],
    related: string[],
    covers: string[] = [],
  ): KnowledgeDoc {
    return {
      id,
      title,
      category: 'field-log',
      summary,
      tags,
      related,
      covers,
      source: 'journal',
      body,
      order: 50,
      author: 'city',
      updated: this.now(),
    };
  }

  private incidentLog(id: string, kind: string, e: FieldEntry[]): KnowledgeDoc {
    const name = e[e.length - 1]!.name;
    const runbook = this.runbookFor(kind);
    const cities = new Set(e.map((x) => x.city)).size;
    const worst = e.reduce((a, b) => (b.cost > a.cost ? b : a));
    const avg = mean(e.map((x) => x.cost));
    const lessons: string[] = [];
    const byOutcome = tally(e.map((x) => x.outcome));
    if (byOutcome.length > 1) {
      const costs = byOutcome
        .map(([o]) => [o, mean(e.filter((x) => x.outcome === o).map((x) => x.cost))] as const)
        .sort((a, b) => a[1] - b[1]);
      const [cheap, dear] = [costs[0]!, costs[costs.length - 1]!];
      if (dear[1] > cheap[1] * 1.3 + 50)
        lessons.push(
          `Incidents that ended "${dear[0]}" cost ◈${fmt(dear[1])} on average, against ◈${fmt(cheap[1])} when they ended "${cheap[0]}".`,
        );
    }
    const ruined = e.reduce((s, x) => s + x.lost, 0);
    if (ruined)
      lessons.push(
        `${ruined} building${ruined === 1 ? ' was' : 's were'} ruined in these incidents: repairs cost half a building’s price, so prevention pays.`,
      );
    const spread = e.reduce((s, x) => s + x.fires, 0);
    if (spread && kind !== 'fire')
      lessons.push(
        `They started ${spread} fire${spread === 1 ? '' : 's'}: have crews or Ember Watch cover ready when one is forecast.`,
      );
    const districts = tally(e.map((x) => x.district ?? 'the outskirts'));
    if (districts[0] && districts[0][1] >= 3)
      lessons.push(`${districts[0][0]} was hit ${districts[0][1]} times: harden it first.`);
    const prevented = tally(e.flatMap((x) => x.prevented ?? []).map((p) => p.replace(/\s*\(◈[^)]*\)/, '')));
    const big = e.filter((x) => x.severity >= 1.1).length;
    if (big) lessons.push(`${big} of ${e.length} were severe (severity ≥ 1.1).`);
    const rows = [...e].reverse().slice(0, 12);
    const body = [
      `${e.length} ${name.toLowerCase()} incident${e.length === 1 ? '' : 's'} recorded in ${cities} cit${cities === 1 ? 'y' : 'ies'} since ${date(e[0]!.at)}. Average cost ◈${fmt(avg)}; the worst cost ◈${fmt(worst.cost)} (${worst.city}, ${worst.clock}${worst.district ? `, ${worst.district}` : ''}).`,
      '',
      '## What the record shows',
      '',
      ...(lessons.length ? lessons.map((l) => `- ${l}`) : ['- Not enough incidents yet to see a pattern.']),
      '',
      '## Outcomes',
      '',
      ...byOutcome.map(([o, n]) => `- ${o}: ${n}×`),
      '',
      '## Prevention that helped',
      '',
      ...(prevented.length
        ? prevented.map(([p, n]) => `- ${p} (${n}×)`)
        : [
            '- Nothing recorded yet.' +
              (runbook ? ` See [${runbook.title}](kb:${runbook.id}) for what to prepare.` : ''),
          ]),
      '',
      '## Recent incidents',
      '',
      '| When | City | Where | Severity | Cause | Damage | Cost | Outcome |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows.map(
        (x) =>
          `| ${cell(`${x.clock} (${date(x.at)})`)} | ${cell(x.city)} | ${cell(x.district ?? 'outskirts')} | ${x.severity.toFixed(2)} | ${cell(x.cause ?? '·')} | ${x.hits} hits${x.lost ? `, ${x.lost} ruined` : ''}${x.displaced ? `, ${fmt(x.displaced)} displaced` : ''} | ◈${fmt(x.cost)} | ${cell(x.outcome)} |`,
      ),
      ...(runbook ? ['', '## See also', '', `- Runbook: [${runbook.title}](kb:${runbook.id})`] : []),
    ].join('\n');
    return this.logDoc(
      id,
      `Field log · ${name}`,
      `${e.length} recorded ${name.toLowerCase()} incident${e.length === 1 ? '' : 's'}: average cost ◈${fmt(avg)}, worst ◈${fmt(worst.cost)}. ${lessons[0] ?? ''}`.trim(),
      body,
      ['field log', 'incident', kind, name.toLowerCase()],
      runbook ? [runbook.id] : [],
      [kind],
    );
  }

  private recoveryLog(id: string, e: RecoveryEntry[]): KnowledgeDoc {
    const by = tally(e.map((x) => x.system));
    const body = [
      `Every time a city system fell to Strained or worse and came back, with how long it took and what you did meanwhile: a record of fixes that worked. ${e.length} recover${e.length === 1 ? 'y' : 'ies'} so far.`,
      '',
      '## By system',
      '',
      ...by.map(([s, n]) => {
        const xs = e.filter((x) => x.system === s);
        const acts = tally(
          xs
            .flatMap((x) => x.actions.split(', ').filter((a) => a && a !== 'nothing'))
            .map((a) => a.replace(/ ×\d+/, '')),
        ).slice(0, 3);
        return `- **${s}**: ${n}×, back in ${fmt(mean(xs.map((x) => x.secs)))} s on average${acts.length ? `; most often after: ${acts.map(([a]) => a).join(', ')}` : ''}.`;
      }),
      '',
      '## Recent recoveries',
      '',
      '| When | City | System | Fell to | Back to | Took | What you did |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...[...e]
        .reverse()
        .slice(0, 15)
        .map(
          (x) =>
            `| ${cell(`${x.clock} (${date(x.at)})`)} | ${cell(x.city)} | ${x.system} | ${x.worst} | ${x.back} | ${fmt(x.secs)} s | ${cell(x.actions)} |`,
        ),
      '',
      '## See also',
      '',
      '- [Triage: a system is failing](kb:runbook-triage)',
    ].join('\n');
    return this.logDoc(
      id,
      'Field log · Recoveries (fix log)',
      `${e.length} system recoveries and what was done to fix each.`,
      body,
      ['field log', 'fix', 'recovery', ...by.map(([s]) => s.toLowerCase())],
      ['runbook-triage'],
    );
  }

  private consequenceLog(id: string, e: ConsequenceEntry[]): KnowledgeDoc {
    const by = tally(e.map((x) => x.name));
    const body = [
      `Consequence rules that came into force in your cities (Dashboard → Causes shows the ones active now). ${e.length} so far.`,
      '',
      '## Most frequent',
      '',
      ...by.map(([n, c]) => `- ${n}: ${c}×`),
      '',
      '## Recent',
      '',
      ...[...e]
        .reverse()
        .slice(0, 15)
        .map(
          (x) => `- ${x.good ? '✓' : '⚠'} **${x.name}** · ${x.city}, ${x.clock} (${date(x.at)}): ${x.text}`,
        ),
      '',
      '## See also',
      '',
      '- [Consequence rules](kb:reference-consequences)',
      '- [Cause-and-effect chains](kb:cause-effect-chains)',
    ].join('\n');
    return this.logDoc(
      id,
      'Field log · Consequences',
      `${e.length} consequences recorded; most often: ${by[0]?.[0] ?? '·'}.`,
      body,
      ['field log', 'consequence', 'cause', 'effect'],
      ['reference-consequences', 'cause-effect-chains'],
    );
  }
}
