import type { JsonSchema, ToolEffect } from '@/core/AgentTools';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';

/** A command the menu can offer: an agent tool, or a console built-in (/help, /clear). */
export interface SlashCommand {
  name: string;
  option: string;
  effect: ToolEffect | 'console';
  input: JsonSchema;
}

interface Item {
  /** Text shown bold (command or value). */
  label: string;
  /** Characters of `label` matched by the typed query (highlighted). */
  hit: [number, number] | null;
  note: string;
  badge: string;
  /** The input's text once this item is accepted. */
  apply: string;
  /** Accepting it leaves nothing to fill in, so Enter can send at once. */
  complete: boolean;
}

const BADGE: Record<SlashCommand['effect'], string> = {
  read: 'sense',
  view: 'guide',
  mutate: 'act',
  console: 'console',
};
const MAX = 8;

const typeHint = (s: JsonSchema | undefined) =>
  s?.enum ? s.enum.slice(0, 4).join('|') + (s.enum.length > 4 ? '|…' : '') : (s?.type ?? 'value');

/**
 * Slash-command autocomplete for Flora's input: typing `/` lists commands (prefix matches first, then
 * substrings), then a command's argument keys, then an argument's allowed values. ↑/↓ choose, Tab or Enter
 * completes, Esc closes; a click picks. It only rewrites the input's text: running stays with the console.
 */
export class SlashMenu {
  readonly el = h('div', { class: 'ai-slash hidden', role: 'listbox', 'aria-label': 'Commands' });
  private items: Item[] = [];
  private sel = 0;
  private dismissed = '';

  constructor(
    private input: HTMLTextAreaElement,
    private commands: () => SlashCommand[],
  ) {
    input.addEventListener('input', () => this.update());
    input.addEventListener('blur', () => setTimeout(() => this.hide(), 120));
    input.addEventListener('focus', () => this.update());
  }

  get open(): boolean {
    return !this.el.classList.contains('hidden');
  }

  /**
   * Keyboard handling; true when the key was used. Enter completes only while that changes the text, so a
   * finished command still sends on Enter.
   */
  key(e: KeyboardEvent): boolean {
    if (!this.open || !this.items.length) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      this.sel = (this.sel + (e.key === 'ArrowDown' ? 1 : this.items.length - 1)) % this.items.length;
      this.render();
      return true;
    }
    if (e.key === 'Escape') {
      this.dismissed = this.input.value;
      this.hide();
      return true;
    }
    const item = this.items[this.sel]!;
    if (
      e.key === 'Tab' ||
      (e.key === 'Enter' && !e.shiftKey && item.apply.trimEnd() !== this.input.value.trimEnd())
    ) {
      this.accept(item);
      return true;
    }
    return false;
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  private accept(item: Item): void {
    this.input.value = item.apply;
    this.input.focus();
    this.input.setSelectionRange(item.apply.length, item.apply.length);
    this.update();
    if (item.complete) this.hide();
  }

  update(): void {
    const text = this.input.value;
    if (!text.startsWith('/') || text.includes('\n') || text === this.dismissed) return this.hide();
    this.dismissed = '';
    this.items = this.suggest(text);
    this.sel = Math.min(this.sel, Math.max(0, this.items.length - 1));
    if (!this.items.length) return this.hide();
    this.render();
    this.el.classList.remove('hidden');
  }

  private suggest(text: string): Item[] {
    const all = this.commands();
    const space = text.indexOf(' ');
    // 1 The command name.
    if (space < 0) {
      const q = text.slice(1).toLowerCase();
      const scored = all
        .map((c) => ({ c, at: c.name.indexOf(q) }))
        .filter((x) => x.at >= 0)
        .sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1) || a.c.name.localeCompare(b.c.name));
      return scored.slice(0, MAX).map(({ c, at }) => {
        const props = Object.keys(c.input.properties ?? {});
        return {
          label: `/${c.name}`,
          hit: q ? [at + 1, at + 1 + q.length] : null,
          note:
            c.option +
            (props.length
              ? `  ·  ${props
                  .slice(0, 3)
                  .map((k) => `${k}=`)
                  .join(' ')}`
              : ''),
          badge: BADGE[c.effect],
          apply: props.length ? `/${c.name} ` : `/${c.name}`,
          complete: !props.length,
        };
      });
    }
    // 2 Arguments: the token being typed is a key, or a value after `key=`.
    const cmd = all.find((c) => c.name === text.slice(1, space).toLowerCase());
    const props = cmd?.input.properties ?? {};
    if (!cmd || !Object.keys(props).length) return [];
    const head = text.slice(0, text.lastIndexOf(' ') + 1);
    const token = text.slice(head.length);
    const used = new Set([...text.matchAll(/(\w+)=/g)].map((m) => m[1]!));
    const required = new Set(cmd.input.required ?? []);
    const eq = token.indexOf('=');
    if (eq >= 0) {
      const key = token.slice(0, eq);
      const q = token.slice(eq + 1).toLowerCase();
      const values = props[key]?.enum ?? (props[key]?.type === 'boolean' ? ['true', 'false'] : []);
      return values
        .map(String)
        .filter((v) => v.toLowerCase().includes(q))
        .slice(0, MAX)
        .map((v) => ({
          label: v,
          hit: q ? [v.toLowerCase().indexOf(q), v.toLowerCase().indexOf(q) + q.length] : null,
          note: `${key}`,
          badge: 'value',
          apply: `${head}${key}=${v} `,
          complete: [...required].every((r) => r === key || used.has(r)),
        }));
    }
    const q = token.toLowerCase();
    return Object.entries(props)
      .filter(([k]) => !used.has(k) && k.toLowerCase().startsWith(q))
      .sort(([a], [b]) => Number(required.has(b)) - Number(required.has(a)))
      .slice(0, MAX)
      .map(([k, s]) => ({
        label: `${k}=`,
        hit: q ? [0, q.length] : null,
        note: `${typeHint(s)}${s.description ? `  ·  ${s.description}` : ''}`,
        badge: required.has(k) ? 'required' : 'optional',
        apply: `${head}${k}=`,
        complete: false,
      }));
  }

  private render(): void {
    this.el.replaceChildren(
      h(
        'div',
        { class: 'ai-slash-h' },
        icon('console'),
        h('span', {}, 'Commands'),
        h(
          'span',
          { class: 'ai-slash-keys' },
          h('kbd', {}, '↑↓'),
          ' choose ',
          h('kbd', {}, 'Tab'),
          ' complete ',
          h('kbd', {}, 'Esc'),
          ' close',
        ),
      ),
      ...this.items.map((it, i) => {
        const [a, b] = it.hit ?? [0, 0];
        const row = h(
          'div',
          {
            class: `ai-slash-row${i === this.sel ? ' on' : ''}`,
            role: 'option',
            'aria-selected': String(i === this.sel),
            onMousedown: (e: MouseEvent) => (e.preventDefault(), this.accept(it)),
          },
          h('b', {}, it.label.slice(0, a), h('mark', {}, it.label.slice(a, b)), it.label.slice(b)),
          h('span', { class: 'ai-slash-note' }, it.note),
          h('span', { class: `ai-slash-badge ${it.badge}` }, it.badge),
        );
        return row;
      }),
    );
    this.el.querySelector('.ai-slash-row.on')?.scrollIntoView({ block: 'nearest' });
  }
}
