import { slug } from '@/content/knowledge';
import { h } from '@/ui/dom';

/**
 * The Markdown Seedvault docs use (D-088): headings, paragraphs, nested lists, task-free tables, block quotes
 * (a leading **Tip:** / **Warning:** / **Do:** makes a callout), fenced code, rules, and inline code, bold,
 * italic and links. `kb:<id>` and `<id>.md` links open another doc. Parsed to blocks (pure, tested) and
 * rendered with DOM calls only, never `innerHTML`, so a note written on the device can't inject markup.
 */

export type Block =
  | { t: 'h'; level: number; text: string; id: string }
  | { t: 'p'; text: string }
  | { t: 'list'; ordered: boolean; items: { text: string; children: Block[] }[] }
  | { t: 'quote'; tone: '' | 'tip' | 'warn' | 'do'; blocks: Block[] }
  | { t: 'code'; text: string }
  | { t: 'table'; head: string[]; rows: string[][]; align: ('' | 'r' | 'c')[] }
  | { t: 'hr' };

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const splitRow = (l: string) =>
  l
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export function parseMarkdown(src: string): Block[] {
  const lines = src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const out: Block[] = [];
  const seen = new Map<string, number>();
  let i = 0;
  const isBlockStart = (l: string) =>
    /^(#{1,6}\s|>|```|\s*([-*+]|\d+[.)])\s|---+\s*$|\*\*\*+\s*$)/.test(l) ||
    (l.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? ''));
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const hm = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (hm) {
      const base = slug(hm[2]!);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      out.push({ t: 'h', level: hm[1]!.length, text: hm[2]!, id: n ? `${base}-${n + 1}` : base });
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      out.push({ t: 'code', text: body.join('\n') });
      continue;
    }
    if (/^(---+|\*\*\*+)\s*$/.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (/^>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^>\s?/, ''));
      const first = body[0] ?? '';
      const tone = /^\*\*(tip|note)\b/i.test(first)
        ? 'tip'
        : /^\*\*(warning|careful|danger|don['’]?t)\b/i.test(first)
          ? 'warn'
          : /^\*\*(do|checklist)\b/i.test(first)
            ? 'do'
            : '';
      out.push({ t: 'quote', tone, blocks: parseMarkdown(body.join('\n')) });
      continue;
    }
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]!).map(
        (c) => (/^:-+:$/.test(c) ? 'c' : /-+:$/.test(c) ? 'r' : '') as '' | 'r' | 'c',
      );
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim())
        rows.push(splitRow(lines[i++]!));
      out.push({ t: 'table', head, rows, align });
      continue;
    }
    const lm = LIST_RE.exec(line);
    if (lm) {
      const indent = lm[1]!.length;
      const ordered = /\d/.test(lm[2]!);
      const items: { text: string; children: Block[] }[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        const m = LIST_RE.exec(l);
        if (m && m[1]!.length === indent) {
          items.push({ text: m[3]!, children: [] });
          i++;
          continue;
        }
        // Deeper items and continuation lines belong to the last item.
        const deeper: string[] = [];
        while (
          i < lines.length &&
          lines[i]!.trim() &&
          /^\s/.test(lines[i]!) &&
          lines[i]!.length - lines[i]!.trimStart().length > indent
        )
          deeper.push(lines[i++]!.slice(indent + 2));
        if (deeper.length && items.length) {
          const last = items[items.length - 1]!;
          if (LIST_RE.test(deeper[0]!)) last.children.push(...parseMarkdown(deeper.join('\n')));
          else last.text += ` ${deeper.join(' ').trim()}`;
          continue;
        }
        break;
      }
      out.push({ t: 'list', ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !(para.length && isBlockStart(lines[i]!)))
      para.push(lines[i++]!.trim());
    out.push({ t: 'p', text: para.join(' ') });
  }
  return out;
}

export type Inline =
  { t: 'text' | 'code' | 'b' | 'i'; text: string } | { t: 'a'; text: string; href: string };

/** Inline spans: `code`, **bold**, *italic* / _italic_, [text](href). */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re =
    /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^*\s][^*]*?)\*(?!\w)|(?<!\w)_([^_\s][^_]*?)_(?!\w)/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    if (m.index! > last) out.push({ t: 'text', text: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'b', text: m[2] });
    else if (m[3] !== undefined) out.push({ t: 'a', text: m[3], href: m[4]! });
    else out.push({ t: 'i', text: (m[5] ?? m[6])! });
    last = m.index! + m[0].length;
  }
  if (last < src.length) out.push({ t: 'text', text: src.slice(last) });
  return out;
}

/** The doc id a link points at (`kb:runbook-fires`, `runbook-fires.md`, `../runbooks/fires.md#x`), else null. */
export function docLink(href: string): { id: string; section?: string } | null {
  const [path, hash] = href.split('#') as [string, string | undefined];
  if (/^kb:/.test(path)) return { id: path.slice(3), ...(hash ? { section: hash } : {}) };
  if (/^[\w./-]+\.md$/.test(path) && !/^[a-z]+:/.test(path))
    return { id: path.split('/').pop()!.replace(/\.md$/, ''), ...(hash ? { section: hash } : {}) };
  return null;
}

export interface RenderHooks {
  /** A link to another doc was clicked. */
  open(id: string, section?: string): void;
  /** Whether a linked doc exists (missing ones render as plain text). */
  exists(id: string): boolean;
}

function inline(src: string, hooks: RenderHooks): (Node | string)[] {
  return parseInline(src).map((s) => {
    if (s.t === 'text') return s.text;
    if (s.t === 'code') return h('code', {}, s.text);
    if (s.t === 'b') return h('strong', {}, ...inline(s.text, hooks));
    if (s.t !== 'a') return h('em', {}, ...inline(s.text, hooks));
    const doc = docLink(s.href);
    if (doc)
      return hooks.exists(doc.id)
        ? h(
            'a',
            {
              class: 'kb-link',
              href: '#',
              onClick: (e: Event) => (e.preventDefault(), hooks.open(doc.id, doc.section)),
            },
            s.text,
          )
        : h('span', { class: 'kb-link missing' }, s.text);
    if (/^https?:\/\//.test(s.href))
      return h('a', { href: s.href, target: '_blank', rel: 'noopener noreferrer' }, s.text);
    return s.text;
  });
}

export function renderBlocks(blocks: Block[], hooks: RenderHooks): HTMLElement[] {
  return blocks.map((b): HTMLElement => {
    switch (b.t) {
      case 'h':
        return h(
          'div',
          {
            class: `kb-h kb-h${Math.min(4, Math.max(2, b.level))}`,
            role: 'heading',
            'aria-level': String(b.level),
            'data-sec': b.id,
          },
          ...inline(b.text, hooks),
        );
      case 'p':
        return h('p', {}, ...inline(b.text, hooks));
      case 'code':
        return h('pre', {}, h('code', {}, b.text));
      case 'hr':
        return h('hr', {});
      case 'quote':
        return h(
          'blockquote',
          { class: b.tone ? `kb-call ${b.tone}` : '' },
          ...renderBlocks(b.blocks, hooks),
        );
      case 'list':
        return h(
          b.ordered ? 'ol' : 'ul',
          {},
          ...b.items.map((it) => h('li', {}, ...inline(it.text, hooks), ...renderBlocks(it.children, hooks))),
        );
      case 'table': {
        const al = (i: number) =>
          b.align[i] === 'r' ? 'text-align:right' : b.align[i] === 'c' ? 'text-align:center' : undefined;
        return h(
          'div',
          { class: 'kb-table' },
          h(
            'table',
            {},
            h(
              'thead',
              {},
              h('tr', {}, ...b.head.map((c, i) => h('th', { style: al(i) }, ...inline(c, hooks)))),
            ),
            h(
              'tbody',
              {},
              ...b.rows.map((r) =>
                h('tr', {}, ...r.map((c, i) => h('td', { style: al(i) }, ...inline(c, hooks)))),
              ),
            ),
          ),
        );
      }
    }
  });
}
