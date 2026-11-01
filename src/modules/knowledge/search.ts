import { docSections, plainText, type DocSection, type KnowledgeDoc } from '@/content/knowledge';

/**
 * Seedvault retrieval (D-088): a small lexical index over doc sections, so Flora (and the search box) can find
 * the one section that answers a question instead of a whole doc. BM25 over section text, with field boosts for
 * the doc's title, tags and summary and the section's heading, a coverage bonus (docs matching more of the
 * query rank higher), and a synonym table that maps the words players use ("blackout", "money", "jam") to the
 * words the docs use ("power", "budget", "traffic"). Pure and synchronous; rebuilt when the docs change.
 */

const STOP = new Set(
  'a an and are as at be but by can could did do does for from had has have how i if in into is it its me my of on or our should so than that the their them then there these they this to us was we were what when where which who why will with would you your about any some all more most much very just get got make made need want tell show please steward city'.split(
    ' ',
  ),
);

/** Player words → doc words. Applied to query terms only (one hop). */
const SYNONYMS: Record<string, string[]> = {
  blackout: ['power', 'energy', 'grid'],
  brownout: ['power', 'energy'],
  electricity: ['power', 'energy'],
  power: ['energy'],
  energy: ['power'],
  outage: ['power', 'grid', 'offline'],
  money: ['budget', 'credit', 'treasury'],
  cash: ['budget', 'credit', 'treasury'],
  broke: ['budget', 'debt', 'austerity'],
  debt: ['loan', 'budget'],
  bankrupt: ['debt', 'austerity', 'budget'],
  happy: ['harmony'],
  happiness: ['harmony'],
  unhappy: ['harmony'],
  mood: ['harmony'],
  jam: ['traffic', 'congestion', 'mobility'],
  traffic: ['congestion', 'mobility', 'commute'],
  congestion: ['traffic', 'mobility'],
  commute: ['traffic', 'mobility'],
  flood: ['monsoon', 'tide', 'seawall'],
  rain: ['monsoon', 'storm'],
  tide: ['king', 'flood', 'coast'],
  sea: ['coast', 'tide'],
  wave: ['tsunami'],
  quake: ['earthquake'],
  earthquake: ['quake'],
  burn: ['fire'],
  burning: ['fire'],
  blaze: ['fire'],
  fire: ['ember', 'crew'],
  heat: ['heatwave'],
  hot: ['heatwave'],
  drought: ['water'],
  thirsty: ['water'],
  dry: ['water', 'soil', 'mist'],
  pollution: ['smog', 'pollut'],
  smog: ['pollution'],
  wind: ['turbine', 'tornado'],
  twister: ['tornado'],
  storm: ['thunderstorm', 'lightning', 'tornado'],
  lightning: ['thunderstorm'],
  unemployment: ['job', 'work'],
  unemployed: ['job', 'work'],
  worker: ['job', 'staff'],
  staff: ['job', 'worker'],
  housing: ['residential', 'home'],
  home: ['residential', 'housing'],
  homes: ['residential', 'housing'],
  food: ['farm', 'fish'],
  hungry: ['food', 'farm'],
  fish: ['fishing'],
  green: ['ecology', 'greenery', 'bloom'],
  nature: ['ecology', 'park', 'greenery'],
  tree: ['greenery', 'park'],
  old: ['age', 'renovate'],
  ageing: ['age', 'renovate'],
  upgrade: ['level', 'tier'],
  level: ['tier', 'upgrade'],
  lose: ['fail', 'collapse', 'council'],
  losing: ['fail', 'collapse', 'council'],
  fired: ['fail', 'council', 'replaced'],
  replaced: ['fail', 'council'],
  unlock: ['project', 'goal', 'progression'],
  goal: ['project', 'unlock'],
  assistant: ['flora'],
  ai: ['flora'],
  keys: ['control', 'hotkey'],
  shortcut: ['control', 'hotkey'],
  stop: ['prevent', 'contain'],
  avoid: ['prevent'],
  protect: ['prevent', 'defence'],
  safe: ['prevent', 'risk'],
  happen: ['cause'],
  prepare: ['prevent', 'warning', 'procedure'],
  preparation: ['prevent', 'warning', 'procedure'],
  ready: ['prepare', 'prevent'],
};

/** A light suffix stripper: prepare / preparation / preparing → prepar, evacuate / evacuation → evacu. */
export const stem = (w: string) =>
  w.length > 4
    ? w
        .replace(/ies$/, 'y')
        .replace(/(ing|ed|es|s)$/, '')
        .replace(/(?<=.{4})(ation|ion)$/, '')
        .replace(/(?<=.{4})(ate|e)$/, '')
    : w.replace(/s$/, '');

/** Lower-case word stems without stop words. */
export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map(stem);
}

/** Query terms with their weight: the player's own words count 1, synonyms 0.5. */
export function queryTerms(q: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of q.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    out.set(stem(raw), 1);
    for (const s of SYNONYMS[raw] ?? SYNONYMS[stem(raw)] ?? []) if (!out.has(stem(s))) out.set(stem(s), 0.5);
  }
  return out;
}

const count = (ts: string[]) => {
  const m = new Map<string, number>();
  for (const t of ts) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
};

interface Chunk {
  doc: KnowledgeDoc;
  section: DocSection;
  heading: Map<string, number>;
  text: Map<string, number>;
  len: number;
  plain: string;
}

interface DocFields {
  title: Map<string, number>;
  tags: Map<string, number>;
  summary: Map<string, number>;
}

export interface SearchHit {
  doc: KnowledgeDoc;
  score: number;
  /** The section that matched best. */
  section: DocSection;
  /** ~180 characters of the best section around the first match. */
  snippet: string;
  /** Query terms the doc matched (stems). */
  matched: string[];
}

/** Text around the first occurrence of any term (stems match word starts). */
export function snippetOf(plain: string, want: Iterable<string>, size = 180): string {
  const flat = plain.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  let at = -1;
  for (const t of want) {
    const m = new RegExp(`\\b${t.replace(/[^a-z0-9]/g, '')}`).exec(lower);
    if (m && (at < 0 || m.index < at)) at = m.index;
  }
  if (flat.length <= size) return flat;
  const start = Math.max(0, Math.min(flat.length - size, at < 0 ? 0 : at - 50));
  const s = flat.slice(start, start + size);
  return `${start > 0 ? '…' : ''}${s.trim()}${start + size < flat.length ? '…' : ''}`;
}

export class KnowledgeIndex {
  private chunks: Chunk[] = [];
  private fields = new Map<string, DocFields>();
  private df = new Map<string, number>();
  private avgLen = 1;

  constructor(docs: readonly KnowledgeDoc[]) {
    let total = 0;
    for (const doc of docs) {
      this.fields.set(doc.id, {
        title: count(terms(doc.title)),
        tags: count(doc.tags.flatMap(terms)),
        summary: count(terms(doc.summary)),
      });
      for (const section of docSections(doc.body)) {
        const plain = plainText(section.text);
        const ts = terms(plain);
        const chunk: Chunk = {
          doc,
          section,
          heading: count(terms(section.title)),
          text: count(ts),
          len: ts.length,
          plain,
        };
        this.chunks.push(chunk);
        total += ts.length;
        for (const t of new Set([...chunk.text.keys(), ...chunk.heading.keys()]))
          this.df.set(t, (this.df.get(t) ?? 0) + 1);
      }
    }
    this.avgLen = Math.max(1, total / Math.max(1, this.chunks.length));
  }

  private idf(t: string): number {
    const n = this.chunks.length;
    const d = this.df.get(t) ?? 0;
    return Math.log(1 + (n - d + 0.5) / (d + 0.5));
  }

  /** Best docs for a query, each with its best section. */
  search(query: string, limit = 8, filter?: (d: KnowledgeDoc) => boolean): SearchHit[] {
    const q = queryTerms(query);
    if (!q.size) return [];
    const k1 = 1.2;
    const b = 0.75;
    const best = new Map<string, { score: number; chunk: Chunk; matched: Set<string> }>();
    for (const c of this.chunks) {
      if (filter && !filter(c.doc)) continue;
      const f = this.fields.get(c.doc.id)!;
      let score = 0;
      const matched = new Set<string>();
      for (const [t, w] of q) {
        const idf = this.idf(t) + 0.2;
        const tf = c.text.get(t) ?? 0;
        const bm = tf ? (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * c.len) / this.avgLen)) : 0;
        const field =
          3 * (f.title.get(t) ?? 0) +
          2.5 * Math.min(1, f.tags.get(t) ?? 0) +
          1.5 * Math.min(1, f.summary.get(t) ?? 0) +
          2 * Math.min(1, c.heading.get(t) ?? 0);
        const s = w * idf * (bm + field);
        if (s > 0) {
          score += s;
          if (w === 1) matched.add(t);
        }
      }
      if (score <= 0) continue;
      const prev = best.get(c.doc.id);
      if (!prev || score > prev.score)
        best.set(c.doc.id, { score, chunk: c, matched: new Set([...matched, ...(prev?.matched ?? [])]) });
      else for (const m of matched) prev.matched.add(m);
    }
    const own = [...q].filter(([, w]) => w === 1).length || 1;
    return [...best.values()]
      .map(({ score, chunk, matched }) => ({
        doc: chunk.doc,
        // Coverage: a doc that matches every word the player typed beats one that repeats a single word; a doc
        // named for one of them (its title) beats a general one that mentions it.
        score:
          score *
          (0.6 + (0.4 * matched.size) / own) *
          ([...matched].some((t) => this.fields.get(chunk.doc.id)!.title.has(t)) ? 1.25 : 1),
        section: chunk.section,
        snippet: snippetOf(chunk.plain || chunk.doc.summary, matched.size ? matched : q.keys()),
        matched: [...matched],
      }))
      .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
      .slice(0, limit);
  }

  /** The section of one doc that best matches free words (a heading name or a question). */
  bestSection(docId: string, words: string): DocSection | null {
    const hit = this.search(words, 1, (d) => d.id === docId)[0];
    return hit && hit.score > 0 ? hit.section : null;
  }
}
