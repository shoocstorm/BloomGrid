/**
 * Seedvault knowledge docs (D-088): the shape of a doc, its Markdown-with-front-matter file format, and the
 * guides shipped with the game (`docs/knowledge/**.md`, bundled as raw text). The same format is used for
 * the steward's own notes and the field logs the city writes on the player's device, so a doc can move
 * between the repo, IndexedDB and the desktop app's knowledge folder unchanged. Pure: no DOM, no three.
 */

/** Where a doc comes from: shipped with the game, generated from the game's own rules, or written on this device. */
export type KnowledgeSource = 'guide' | 'reference' | 'journal';

export interface KnowledgeCategory {
  id: string;
  label: string;
  blurb: string;
}

/** Categories in reading order. A doc with an unknown category is listed under its own id. */
export const KNOWLEDGE_CATEGORIES: readonly KnowledgeCategory[] = [
  {
    id: 'basics',
    label: 'Getting started',
    blurb: 'The steward’s role, the first hour and how to read the HUD.',
  },
  {
    id: 'systems',
    label: 'City systems',
    blurb: 'How power, water, food, jobs, mobility, ecology, harmony and money work.',
  },
  {
    id: 'cause-effect',
    label: 'Cause & effect',
    blurb: 'What leads to what: chains, feedback loops and slow consequences.',
  },
  {
    id: 'runbooks',
    label: 'Incident runbooks',
    blurb: 'Step-by-step procedures for crises, disasters and failing systems.',
  },
  {
    id: 'playbooks',
    label: 'Playbooks',
    blurb: 'Strategies for growing, balancing and protecting the city.',
  },
  {
    id: 'reference',
    label: 'Live reference',
    blurb: 'Generated from the game’s own rules, so always current.',
  },
  {
    id: 'field-log',
    label: 'Field logs',
    blurb: 'What happened in your cities: incidents, causes, costs and what helped.',
  },
  { id: 'notes', label: 'Steward’s notes', blurb: 'Lessons you and Flora wrote down. Kept on this device.' },
];

export const categoryLabel = (id: string) => KNOWLEDGE_CATEGORIES.find((c) => c.id === id)?.label ?? id;

export interface KnowledgeDoc {
  /** Kebab-case, unique across sources (`runbook-fires`, `field-log-fire`, `note-…`). */
  id: string;
  title: string;
  category: string;
  /** One or two sentences: what the doc answers. */
  summary: string;
  tags: string[];
  /** Ids of docs worth reading next. */
  related: string[];
  /** Crisis or incident kinds a runbook covers (`fire`, `monsoon`…): field logs link back to it. */
  covers: string[];
  source: KnowledgeSource;
  /** Markdown body (without front matter). */
  body: string;
  /** Sort order inside the category (lower first). */
  order: number;
  /** Who wrote a journal doc. */
  author?: 'steward' | 'flora' | 'city';
  /** Epoch ms of the last change (journal docs). */
  updated?: number;
}

export interface DocSection {
  /** Slug of the heading (`what-to-do`); `intro` for text before the first heading. */
  id: string;
  title: string;
  level: number;
  text: string;
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'doc';

const unquote = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, '$2');

/** `key: value` lines with `[a, b]` lists: the YAML subset Seedvault front matter uses. */
export function parseFrontMatter(text: string): { meta: Record<string, string | string[]>; body: string } {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string | string[]> = {};
  for (const line of m[1]!.split('\n')) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const v = kv[2]!.trim();
    meta[kv[1]!] =
      v.startsWith('[') && v.endsWith(']')
        ? v.slice(1, -1).split(',').map(unquote).filter(Boolean)
        : unquote(v);
  }
  return { meta, body: src.slice(m[0].length) };
}

const list = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v : v ? v.split(/,\s*/).filter(Boolean) : [];
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : (v ?? ''));

/** First paragraph of plain text, for docs without a `summary`. */
function firstParagraph(body: string): string {
  for (const para of body.split(/\n\s*\n/)) {
    const t = para.trim();
    if (!t || /^(#|>|\||```|[-*+] |\d+\. |<!--)/.test(t)) continue;
    return t.replace(/\s+/g, ' ').replace(/[*_`]/g, '').slice(0, 220);
  }
  return '';
}

/** Reads a doc file. `fallbackId` (the file name) is used when the front matter has no `id`. */
export function parseDoc(text: string, source: KnowledgeSource, fallbackId: string): KnowledgeDoc {
  const { meta, body } = parseFrontMatter(text);
  const heading = /^#\s+(.+)$/m.exec(body);
  const title = str(meta.title) || heading?.[1]?.trim() || fallbackId;
  // The page shows the title itself: drop a leading `# Title` that repeats it.
  const content =
    heading && heading.index === body.search(/\S/) ? body.slice(heading.index + heading[0].length) : body;
  const updated = Number(str(meta.updated));
  const author = str(meta.author);
  return {
    id: slug(str(meta.id) || fallbackId),
    title,
    category: str(meta.category) || (source === 'journal' ? 'notes' : 'basics'),
    summary: str(meta.summary) || firstParagraph(content),
    tags: list(meta.tags).map((t) => t.toLowerCase()),
    related: list(meta.related).map(slug),
    covers: list(meta.covers),
    source,
    body: content.replace(/^\n+/, ''),
    order: Number(str(meta.order)) || 50,
    ...(author === 'steward' || author === 'flora' || author === 'city' ? { author } : {}),
    ...(Number.isFinite(updated) && updated > 0 ? { updated } : {}),
  };
}

const yamlValue = (v: string) => (/[:#[\]{},]|^\s|\s$|^['"]/.test(v) ? JSON.stringify(v) : v);
const yamlList = (a: readonly string[]) => `[${a.map(yamlValue).join(', ')}]`;

/** Writes a doc back to its file format (journal docs are stored like this, on the web and on the desktop). */
export function serializeDoc(d: KnowledgeDoc): string {
  const lines = [
    '---',
    `id: ${d.id}`,
    `title: ${yamlValue(d.title.replace(/\n/g, ' '))}`,
    `category: ${d.category}`,
    `summary: ${yamlValue(d.summary.replace(/\n/g, ' '))}`,
    `tags: ${yamlList(d.tags)}`,
    d.related.length ? `related: ${yamlList(d.related)}` : '',
    d.covers.length ? `covers: ${yamlList(d.covers)}` : '',
    d.author ? `author: ${d.author}` : '',
    d.updated ? `updated: ${Math.round(d.updated)}` : '',
    '---',
    '',
  ].filter((l, i, a) => l !== '' || i === a.length - 1);
  return `${lines.join('\n')}\n${d.body.trimEnd()}\n`;
}

/** Splits a body at its `##`/`###` headings (`#` inside code fences ignored). */
export function docSections(body: string): DocSection[] {
  const out: DocSection[] = [];
  let cur: DocSection = { id: 'intro', title: 'Introduction', level: 1, text: '' };
  let fence = false;
  const seen = new Map<string, number>();
  for (const line of body.split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    const m = !fence && /^(#{2,4})\s+(.+?)\s*#*$/.exec(line);
    if (m) {
      if (cur.text.trim() || cur.id !== 'intro') out.push(cur);
      const base = slug(m[2]!);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      cur = {
        id: n ? `${base}-${n + 1}` : base,
        title: m[2]!.replace(/[*_`]/g, ''),
        level: m[1]!.length,
        text: '',
      };
    } else cur.text += `${line}\n`;
  }
  if (cur.text.trim() || cur.id !== 'intro') out.push(cur);
  return out.map((s) => ({ ...s, text: s.text.replace(/<!--[\s\S]*?-->/g, '').trim() }));
}

/** Markdown reduced to plain text, for search and for what Flora reads. */
export const plainText = (md: string) =>
  md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[^\n]*\n/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|?[-: |]+\|?\s*$/gm, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/gm, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/[*_`>#]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Shipped guides: every `.md` under `docs/knowledge/` except READMEs and `_drafts`. */
const RAW = import.meta.glob('../../docs/knowledge/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

let shipped: KnowledgeDoc[] | null = null;

export function shippedDocs(): KnowledgeDoc[] {
  shipped ??= Object.entries(RAW)
    .filter(([path]) => !/(^|\/)(README|_[^/]*)\.md$|\/_/.test(path))
    .map(([path, text]) => parseDoc(text, 'guide', path.split('/').pop()!.replace(/\.md$/, '')))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return shipped;
}
