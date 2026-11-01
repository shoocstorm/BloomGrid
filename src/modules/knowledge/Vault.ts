import type { GameContext } from '@/game/context';
import { KNOWLEDGE_CATEGORIES, categoryLabel, docSections, type KnowledgeDoc } from '@/content/knowledge';
import { ago, h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { holoHead } from '@/ui/holo';
import { isTouchDevice } from '@/platform/device';
import type { KnowledgeBase } from './base';
import { parseMarkdown, renderBlocks, type RenderHooks } from './markdown';

type Filter = 'all' | 'guide' | 'reference' | 'journal';
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['guide', 'Guides'],
  ['reference', 'Reference'],
  ['journal', 'Journal'],
];
const SOURCE_LABEL = { guide: 'Guide', reference: 'Live reference', journal: 'Journal' } as const;
const AUTHOR_LABEL = { steward: 'by you', flora: 'by Flora', city: 'kept by the city' } as const;
const START = 'basics-welcome';

/**
 * The Seedvault dialog (D-088): the knowledge base for the steward. A navigator (search, source filter,
 * categories) beside a reader (outline, rendered doc, related docs, Ask Flora), plus a note editor for the
 * journal. Search runs the same index Flora uses, so what the steward finds is what she finds.
 */
export class Vault {
  readonly el: HTMLElement;
  private nav = h('nav', { class: 'kb-nav', 'aria-label': 'Seedvault docs' });
  private reader = h('article', { class: 'kb-doc' });
  private search = h('input', {
    class: 'kb-search',
    type: 'search',
    placeholder: 'Search guides, runbooks, logs…',
    'aria-label': 'Search the knowledge base',
  }) as HTMLInputElement;
  private filters = h('div', { class: 'kb-filters', role: 'tablist' });
  private open = false;
  private current: string | null = null;
  private filter: Filter = 'all';
  private shownVersion = -1;
  private timer = 0;

  constructor(
    private ctx: GameContext,
    private kb: KnowledgeBase,
  ) {
    for (const [id, label] of FILTERS)
      this.filters.append(
        h(
          'button',
          { class: 'kb-chip', 'data-f': id, onClick: () => ((this.filter = id), this.renderNav()) },
          label,
        ),
      );
    this.search.addEventListener('input', () => this.renderNav());
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (this.nav.querySelector('.kb-item') as HTMLElement | null)?.click();
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!this.search.value) return this.toggle(false);
        this.search.value = '';
        this.renderNav();
      }
    });
    this.el = h(
      'div',
      {
        class: 'db-scrim kb-scrim hidden',
        onClick: (e: Event) => e.target === this.el && this.toggle(false),
      },
      h(
        'section',
        { class: 'db kb panel holo', role: 'dialog', 'aria-label': 'Seedvault knowledge base' },
        h(
          'header',
          { class: 'db-head kb-head' },
          holoHead(icon('book'), 'Steward console · city knowledge', 'Seedvault'),
          h('div', { class: 'kb-find' }, icon('search'), this.search),
          h(
            'button',
            { class: 'kb-btn', title: 'Write a note (kept on this device)', onClick: () => this.edit() },
            icon('pen'),
            h('span', {}, 'New note'),
          ),
          h('span', { class: 'db-hint' }, '? or Esc'),
          h(
            'button',
            { class: 'icon-btn', 'aria-label': 'Close', onClick: () => this.toggle(false) },
            icon('close'),
          ),
        ),
        h('div', { class: 'kb-body' }, h('div', { class: 'kb-side' }, this.filters, this.nav), this.reader),
      ),
    );
    ctx.hud.append(this.el);
    kb.onChange(() => this.open && this.refresh());
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(open = !this.open): void {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    if (open) {
      this.refresh(true);
      if (!isTouchDevice()) setTimeout(() => this.search.focus());
    }
  }

  /** Opens on a doc (and scrolls to a section), or on the start page. */
  show(id?: string, section?: string): void {
    if (!this.open) this.toggle(true);
    this.read(id && this.kb.get(id) ? this.kb.get(id)!.id : (this.current ?? START), section);
  }

  update(dt: number): void {
    if (!this.open) return;
    this.timer += dt;
    if (this.timer < 2) return;
    this.timer = 0;
    // "5 min ago" labels and docs that changed while open.
    if (this.kb.version !== this.shownVersion) this.refresh();
  }

  private refresh(force = false): void {
    if (!force && this.kb.version === this.shownVersion) return;
    this.shownVersion = this.kb.version;
    this.renderNav();
    if (!this.reader.querySelector('.kb-editor'))
      this.read(this.current && this.kb.get(this.current) ? this.current : START, undefined, false);
  }

  private visible = (d: KnowledgeDoc) => this.filter === 'all' || d.source === this.filter;

  private item(d: KnowledgeDoc, extra?: Node): HTMLElement {
    return h(
      'button',
      {
        class: `kb-item${d.id === this.current ? ' on' : ''}`,
        'data-id': d.id,
        onClick: () => this.read(d.id),
      },
      h('span', { class: `kb-dot s-${d.source}` }),
      h('span', { class: 'kb-item-t' }, h('b', {}, d.title), extra ?? null),
    );
  }

  private renderNav(): void {
    for (const b of this.filters.children)
      b.classList.toggle('on', (b as HTMLElement).dataset.f === this.filter);
    const q = this.search.value.trim();
    if (q) {
      const hits = this.kb.search(q, 20, this.visible);
      this.nav.replaceChildren(
        h('div', { class: 'kb-group-h' }, `${hits.length} result${hits.length === 1 ? '' : 's'}`),
        ...(hits.length
          ? hits.map((x) =>
              this.item(
                x.doc,
                h(
                  'span',
                  { class: 'kb-snip' },
                  h(
                    'i',
                    {},
                    x.section.id === 'intro' ? categoryLabel(x.doc.category) : `§ ${x.section.title}`,
                  ),
                  ` ${x.snippet}`,
                ),
              ),
            )
          : [
              h(
                'p',
                { class: 'kb-empty' },
                'Nothing matched. Try fewer or other words (fire, budget, traffic…).',
              ),
            ]),
      );
      this.nav.querySelectorAll<HTMLElement>('.kb-item').forEach((el, i) => {
        const hit = hits[i]!;
        el.onclick = () => this.read(hit.doc.id, hit.section.id === 'intro' ? undefined : hit.section.id);
      });
      return;
    }
    const groups = this.kb
      .catalog()
      .map((g) => ({ ...g, docs: g.docs.filter(this.visible) }))
      .filter((g) => g.docs.length);
    this.nav.replaceChildren(
      ...groups.map((g) =>
        h(
          'div',
          { class: 'kb-group' },
          h('div', { class: 'kb-group-h' }, g.label, h('span', {}, String(g.docs.length))),
          ...g.docs.map((d) => this.item(d)),
        ),
      ),
    );
  }

  private hooks: RenderHooks = {
    open: (id, section) => this.read(this.kb.get(id)!.id, section),
    exists: (id) => !!this.kb.get(id),
  };

  /** Shows a doc in the reader. */
  read(id: string, section?: string, scrollTop = true): void {
    const doc = this.kb.get(id);
    if (!doc) return this.home();
    if (doc.id === START && !section) return this.home(doc);
    this.current = doc.id;
    for (const el of this.nav.querySelectorAll<HTMLElement>('.kb-item'))
      el.classList.toggle('on', el.dataset.id === doc.id);
    const sections = docSections(doc.body).filter((s) => s.id !== 'intro' && s.level === 2);
    const content = h('div', { class: 'kb-content' }, ...renderBlocks(parseMarkdown(doc.body), this.hooks));
    const journal = this.kb.isJournal(doc.id);
    const meta = [
      categoryLabel(doc.category),
      SOURCE_LABEL[doc.source],
      doc.author ? AUTHOR_LABEL[doc.author] : null,
      doc.updated ? `updated ${ago(doc.updated)}` : null,
    ].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);
    this.reader.replaceChildren(
      ...([
        h(
          'div',
          { class: 'kb-crumb' },
          ...meta.map((m) => h('span', {}, m)),
          h('code', { title: 'Doc id (Flora reads docs by id)' }, doc.id),
        ),
        h('div', { class: 'kb-title' }, doc.title),
        doc.summary ? h('p', { class: 'kb-summary' }, doc.summary) : null,
        sections.length > 1
          ? h(
              'div',
              { class: 'kb-outline' },
              ...sections.map((s) =>
                h('button', { class: 'kb-chip', onClick: () => this.scrollTo(s.id) }, s.title),
              ),
            )
          : null,
        content,
        doc.related.some((r) => this.kb.get(r))
          ? h(
              'div',
              { class: 'kb-related' },
              h('span', { class: 'kb-group-h' }, 'Read next'),
              ...doc.related
                .filter((r) => this.kb.get(r))
                .map((r) =>
                  h('button', { class: 'kb-chip', onClick: () => this.read(r) }, this.kb.get(r)!.title),
                ),
            )
          : null,
        h(
          'div',
          { class: 'kb-actions' },
          h(
            'button',
            {
              class: 'kb-btn',
              title: 'Ask Flora how this applies to the city now',
              onClick: () => this.askFlora(doc),
            },
            icon('sparkle'),
            h('span', {}, 'Ask Flora'),
          ),
          journal && doc.author !== 'city'
            ? h(
                'button',
                { class: 'kb-btn', onClick: () => this.edit(doc) },
                icon('pen'),
                h('span', {}, 'Edit'),
              )
            : null,
          journal
            ? h(
                'button',
                { class: 'kb-btn danger', onClick: () => this.remove(doc) },
                icon('close'),
                h('span', {}, 'Delete'),
              )
            : null,
          journal ? h('span', { class: 'kb-where' }, `Kept in ${this.kb.where}`) : null,
        ),
      ].filter(Boolean) as HTMLElement[]),
    );
    if (section) requestAnimationFrame(() => this.scrollTo(section));
    else if (scrollTop) this.reader.scrollTop = 0;
  }

  private scrollTo(section: string): void {
    const el = this.reader.querySelector<HTMLElement>(`[data-sec="${CSS.escape(section)}"]`);
    if (!el) return;
    this.reader.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  /** The start page: the welcome doc's text, then a card per category. */
  private home(welcome?: KnowledgeDoc): void {
    this.current = welcome?.id ?? null;
    for (const el of this.nav.querySelectorAll<HTMLElement>('.kb-item'))
      el.classList.toggle('on', el.dataset.id === this.current);
    const groups = this.kb.catalog();
    const journal = this.kb.all().filter((d) => d.source === 'journal').length;
    this.reader.replaceChildren(
      ...([
        h(
          'div',
          { class: 'kb-crumb' },
          h('span', {}, 'Seedvault'),
          h('span', {}, `${this.kb.all().length} docs`),
          h('span', {}, `${journal} in your journal`),
        ),
        h('div', { class: 'kb-title' }, welcome?.title ?? 'Seedvault'),
        welcome
          ? h('div', { class: 'kb-content' }, ...renderBlocks(parseMarkdown(welcome.body), this.hooks))
          : null,
        h(
          'div',
          { class: 'kb-cards' },
          ...KNOWLEDGE_CATEGORIES.map((c) => {
            const g = groups.find((x) => x.id === c.id);
            const first = g?.docs[0];
            return h(
              'button',
              {
                class: 'kb-card',
                disabled: first ? undefined : 'true',
                onClick: () => first && this.read(first.id),
              },
              h('b', {}, c.label, h('span', {}, String(g?.docs.length ?? 0))),
              h('span', {}, c.blurb),
            );
          }),
        ),
        h(
          'p',
          { class: 'kb-where' },
          `Your journal (notes and field logs) is kept in ${this.kb.where}, so it carries over to every city you found on this device.`,
        ),
      ].filter(Boolean) as HTMLElement[]),
    );
    this.reader.scrollTop = 0;
  }

  private askFlora(doc: KnowledgeDoc): void {
    const a = this.ctx.services.get('assistant');
    this.toggle(false);
    a.toggle(true);
    void a.ask(`Using the guide ${doc.id} ("${doc.title}"), what does it mean for our city right now?`);
  }

  private async remove(doc: KnowledgeDoc): Promise<void> {
    if (!confirm(`Delete “${doc.title}” from your journal? This can't be undone.`)) return;
    await this.kb.remove(doc.id);
    this.current = null;
    this.home(this.kb.get(START));
    this.renderNav();
  }

  /** The note editor (a new note, or an existing journal note). */
  private edit(doc?: KnowledgeDoc): void {
    if (!this.open) this.toggle(true);
    const title = h('input', {
      class: 'kb-in',
      placeholder: 'Title',
      value: doc?.title ?? '',
      maxlength: '120',
    }) as HTMLInputElement;
    const tags = h('input', {
      class: 'kb-in',
      placeholder: 'Tags, comma separated (fire, budget…)',
      value: doc?.tags.join(', ') ?? '',
    }) as HTMLInputElement;
    const cat = h(
      'select',
      { class: 'kb-in' },
      ...KNOWLEDGE_CATEGORIES.filter((c) => c.id !== 'field-log' && c.id !== 'reference').map((c) =>
        h(
          'option',
          { value: c.id, selected: (doc?.category ?? 'notes') === c.id ? 'true' : undefined },
          c.label,
        ),
      ),
    ) as HTMLSelectElement;
    const body = h('textarea', {
      class: 'kb-in kb-ta',
      placeholder: 'Write in Markdown: ## headings, - lists, **bold**, [links](kb:runbook-fires)…',
      rows: '14',
    }) as HTMLTextAreaElement;
    body.value = doc?.body ?? '';
    const save = async () => {
      if (!title.value.trim() && !body.value.trim()) return;
      const d = await this.kb.saveNote(
        { title: title.value, body: body.value, tags: tags.value.split(','), category: cat.value },
        doc?.id,
      );
      this.ctx.bus.emit('toast', { text: `Saved “${d.title}” to your Seedvault journal`, tone: 'ok' });
      this.read(d.id);
    };
    this.reader.replaceChildren(
      h(
        'form',
        { class: 'kb-editor', onSubmit: (e: Event) => (e.preventDefault(), void save()) },
        h('div', { class: 'kb-title' }, doc ? 'Edit note' : 'New note'),
        h(
          'p',
          { class: 'kb-summary' },
          `Notes are kept in ${this.kb.where} and Flora can read them. Write down what worked, so the next city goes better.`,
        ),
        title,
        h('div', { class: 'kb-row' }, cat, tags),
        body,
        h(
          'div',
          { class: 'kb-actions' },
          h('button', { class: 'kb-btn primary', type: 'submit' }, icon('save'), h('span', {}, 'Save note')),
          h(
            'button',
            {
              class: 'kb-btn',
              type: 'button',
              onClick: () => (doc ? this.read(doc.id) : this.home(this.kb.get(START))),
            },
            h('span', {}, 'Cancel'),
          ),
        ),
      ),
    );
    setTimeout(() => (doc ? body : title).focus());
  }
}
