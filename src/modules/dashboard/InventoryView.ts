import type { GameContext } from '@/game/context';
import {
  ISSUES,
  STATUSES,
  inventoryKinds,
  type CityObject,
  type InventoryQuery,
  type InventorySummary,
  type ObjectStatus,
} from '@/sim/inventory';
import { h, setText } from '@/ui/dom';
import { icon as ico } from '@/ui/icons';
import './inventory.css';

const fmt = (n: number) => Math.round(n).toLocaleString();
const PAGE = 80;
const STATUS_LABEL: Record<ObjectStatus, string> = { ok: 'OK', warning: 'Warning', critical: 'Critical' };
const SORTS: [string, string][] = [
  ['status', 'Worst first'],
  ['id', 'Id'],
  ['name', 'Name'],
  ['district', 'District'],
  ['type', 'Type'],
  ['residents', 'Residents'],
  ['condition', 'Condition'],
  ['tiles', 'Size (tiles)'],
];

/** The headline reading of an object for its table row. */
function keyMetric(o: CityObject): string {
  const m = o.metrics;
  if (m.capacity) return `${fmt(m.residents ?? 0)} / ${fmt(m.capacity)} res`;
  if (m.jobs) return `${fmt(m.workers ?? 0)} / ${fmt(m.jobs)} staff`;
  if (o.kind === 'district') return `${fmt(m.buildings ?? 0)} bldg · ${fmt(m.residents ?? 0)} res`;
  if (m.energy) return `${m.energy > 0 ? '+' : ''}${fmt(m.energy)} kW`;
  if (m.water) return `${m.water > 0 ? '+' : ''}${fmt(m.water)} water`;
  if (m.tiles) return `${fmt(m.tiles)} tiles`;
  if (m.length) return `${m.length.toFixed(0)} tiles long`;
  if (m.condition !== undefined) return `cond ${Math.round(m.condition * 100)}%`;
  return '';
}

const label = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const show = (v: unknown): string =>
  typeof v === 'number'
    ? Number.isInteger(v)
      ? fmt(v)
      : v.toFixed(3).replace(/0+$/, '')
    : typeof v === 'object' && v !== null
      ? JSON.stringify(v).replace(/[{}"]/g, '').replace(/,/g, ', ').replace(/:/g, ': ')
      : String(v);

/**
 * Inventory tab of the dashboard: counts of every object the city holds (by kind, issue, district and type),
 * a searchable, sortable list, and an inspector for the chosen object with a Locate action. Snapshots the
 * inventory every 2 s while visible; typing filters the snapshot without rebuilding it.
 */
export class InventoryView {
  readonly el: HTMLElement;
  private objects: CityObject[] = [];
  private summary: InventorySummary | null = null;
  private q: Required<Pick<InventoryQuery, 'text' | 'sort'>> & {
    kind: string;
    status: string;
    district: string;
    issue: string;
  } = {
    text: '',
    sort: 'status',
    kind: '',
    status: '',
    district: '',
    issue: '',
  };
  private shown = PAGE;
  private chosen: string | null = null;
  private timer = 0;
  private kindsEl = h('div', { class: 'inv-kinds' });
  private issuesEl = h('div', { class: 'db-bars' });
  private districtsEl = h('div', { class: 'db-bars' });
  private typesEl = h('div', { class: 'db-bars' });
  private search: HTMLInputElement;
  private kindSel: HTMLSelectElement;
  private statusSel: HTMLSelectElement;
  private districtSel: HTMLSelectElement;
  private sortSel: HTMLSelectElement;
  private countEl = h('span', { class: 'inv-count' });
  private rows = h('tbody');
  private more: HTMLButtonElement;
  private detail = h('aside', { class: 'inv-detail' });
  private clearBtn: HTMLButtonElement;

  constructor(
    private ctx: GameContext,
    private close: () => void,
  ) {
    const select = (options: [string, string][], key: 'kind' | 'status' | 'district' | 'sort') => {
      const s = h('select', {
        class: 'inv-sel',
        'aria-label': key,
        onChange: () => this.set({ [key]: s.value }),
      }) as HTMLSelectElement;
      s.append(...options.map(([v, l]) => h('option', { value: v }, l)));
      return s;
    };
    this.search = h('input', {
      class: 'inv-search',
      type: 'search',
      placeholder: 'Search id, name, type, district… or key:value (issue:power, status:critical)',
      'aria-label': 'Search the inventory',
      onInput: () => this.set({ text: this.search.value }),
      onKeydown: (e: KeyboardEvent) => e.key === 'Escape' && this.search.blur(),
    }) as HTMLInputElement;
    this.kindSel = select(
      [['', 'All kinds'], ...inventoryKinds().map((k) => [k.kind, k.label] as [string, string])],
      'kind',
    );
    this.statusSel = select(
      [['', 'Any status'], ...STATUSES.map((s) => [s, STATUS_LABEL[s]] as [string, string])],
      'status',
    );
    this.districtSel = select([['', 'All districts']], 'district');
    this.sortSel = select(SORTS, 'sort');
    this.clearBtn = h(
      'button',
      { class: 'btn ghost inv-clear', onClick: () => this.reset() },
      'Clear',
    ) as HTMLButtonElement;
    this.more = h(
      'button',
      { class: 'btn ghost inv-more', onClick: () => ((this.shown += PAGE), this.renderRows()) },
      'Show more',
    ) as HTMLButtonElement;

    this.el = h(
      'div',
      { class: 'inv' },
      this.kindsEl,
      h(
        'div',
        { class: 'db-cols' },
        h('div', {}, h('h3', {}, 'Open issues'), this.issuesEl),
        h('div', {}, h('h3', {}, 'Districts'), this.districtsEl),
        h('div', {}, h('h3', {}, 'Most common types'), this.typesEl),
      ),
      h('h3', {}, 'Objects'),
      h(
        'div',
        { class: 'inv-filters' },
        this.search,
        this.kindSel,
        this.statusSel,
        this.districtSel,
        this.sortSel,
        this.clearBtn,
        this.countEl,
      ),
      h(
        'div',
        { class: 'inv-main' },
        h(
          'div',
          { class: 'inv-table-wrap' },
          h(
            'table',
            { class: 'inv-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                ...['Id', 'Name', 'District', 'Status', 'Reading', 'Issues'].map((c) => h('th', {}, c)),
              ),
            ),
            this.rows,
          ),
          this.more,
        ),
        this.detail,
      ),
    );
    this.renderDetail();
  }

  /** Called by the dashboard while this tab is visible. */
  update(dt: number, force = false): void {
    this.timer += dt;
    if (!force && this.timer < 2) return;
    this.timer = 0;
    const inv = this.ctx.services.get('inventory');
    this.objects = inv.list();
    this.summary = inv.summary(this.objects);
    this.renderSummary();
    this.renderRows();
    this.renderDetail();
  }

  focusSearch(): void {
    this.search.focus();
    this.search.select();
  }

  /** Shows one object (e.g. from the HUD inspector). */
  choose(id: string): void {
    this.chosen = id;
    this.renderRows();
    this.renderDetail();
  }

  private set(patch: Partial<InventoryView['q']>): void {
    Object.assign(this.q, patch);
    this.shown = PAGE;
    this.syncControls();
    this.renderRows();
  }

  private reset(): void {
    this.set({ text: '', kind: '', status: '', district: '', issue: '' });
  }

  private syncControls(): void {
    if (this.search.value !== this.q.text) this.search.value = this.q.text;
    this.kindSel.value = this.q.kind;
    this.statusSel.value = this.q.status;
    this.districtSel.value = this.q.district;
    this.sortSel.value = this.q.sort;
    this.clearBtn.disabled = !(
      this.q.text ||
      this.q.kind ||
      this.q.status ||
      this.q.district ||
      this.q.issue
    );
  }

  private bars(
    container: HTMLElement,
    rows: {
      label: string;
      count: number;
      warn?: number;
      crit?: number;
      active: boolean;
      tone?: string;
      onClick: () => void;
    }[],
  ): void {
    const max = Math.max(1, ...rows.map((r) => r.count));
    container.replaceChildren(
      ...rows.map((r) =>
        h(
          'button',
          {
            class: `db-bar inv-bar${r.active ? ' on' : ''}`,
            onClick: r.onClick,
            title: r.warn || r.crit ? `${r.warn ?? 0} warning · ${r.crit ?? 0} critical` : undefined,
          },
          h('span', { class: 'db-bar-l' }, r.label),
          h(
            'span',
            { class: 'db-bar-t' },
            h('i', { class: r.tone ?? '', style: `width:${(r.count / max) * 100}%` }),
          ),
          h(
            'span',
            { class: 'db-bar-v' },
            fmt(r.count),
            r.crit
              ? h('em', { class: 'crit' }, ` ${fmt(r.crit)}`)
              : r.warn
                ? h('em', { class: 'warn' }, ` ${fmt(r.warn)}`)
                : null,
          ),
        ),
      ),
    );
  }

  private renderSummary(): void {
    const s = this.summary!;
    const kindTile = (kind: string, glyph: string, name: string, count: number, warn: number, crit: number) =>
      h(
        'button',
        {
          class: `db-tile inv-kind${this.q.kind === kind ? ' on' : ''}`,
          onClick: () => this.set({ kind: this.q.kind === kind ? '' : kind }),
        },
        h('div', { class: 'db-tile-k' }, ico(`kind:${kind}`, glyph), ` ${name}`),
        h('div', { class: 'db-tile-v' }, fmt(count)),
        h(
          'div',
          { class: 'db-tile-s' },
          crit || warn
            ? h(
                'span',
                {},
                h('i', { class: 'led crit' }),
                fmt(crit),
                ' ',
                h('i', { class: 'led warn' }),
                fmt(warn),
              )
            : 'all OK',
        ),
      );
    this.kindsEl.replaceChildren(
      kindTile('', '∑', 'All objects', s.total, s.status.warning, s.status.critical),
      ...s.kinds.map((k) => kindTile(k.kind, k.icon, k.label, k.count, k.warning, k.critical)),
    );
    this.bars(
      this.issuesEl,
      s.issues.length
        ? s.issues.slice(0, 8).map((i) => ({
            label: i.label,
            count: i.count,
            tone: i.severity >= 2 ? 'crit' : i.severity === 1 ? 'warn' : 'neg',
            active: this.q.issue === i.code,
            onClick: () => this.set({ issue: this.q.issue === i.code ? '' : i.code }),
          }))
        : [{ label: 'No open issues', count: 0, active: false, onClick: () => {} }],
    );
    this.bars(
      this.districtsEl,
      s.districts
        .slice(0, 8)
        .map((d) => ({
          label: d.name,
          count: d.count,
          warn: d.warning,
          crit: d.critical,
          active: this.q.district === d.name,
          onClick: () => this.set({ district: this.q.district === d.name ? '' : d.name }),
        })),
    );
    this.bars(
      this.typesEl,
      s.types
        .filter((t) => t.kind === 'building')
        .slice(0, 8)
        .map((t) => ({
          label: t.name,
          count: t.count,
          warn: t.warning,
          crit: t.critical,
          active: this.q.text === `type:${t.type}`,
          onClick: () => this.set({ text: this.q.text === `type:${t.type}` ? '' : `type:${t.type}` }),
        })),
    );
    // District options follow the city (new game, load).
    const names = s.districts.map((d) => d.name).sort();
    if (
      this.districtSel.options.length !== names.length + 1 ||
      names.some((n, i) => this.districtSel.options[i + 1]!.value !== n)
    ) {
      this.districtSel.replaceChildren(
        h('option', { value: '' }, 'All districts'),
        ...names.map((n) => h('option', { value: n }, n)),
      );
    }
    this.syncControls();
  }

  private renderRows(): void {
    const q = this.q;
    const page = this.ctx.services.get('inventory').filter(this.objects, {
      text: q.text,
      kind: q.kind || undefined,
      status: (q.status || undefined) as ObjectStatus | undefined,
      issue: q.issue || undefined,
      district: q.district || undefined,
      sort: q.sort,
      limit: this.shown,
    });
    const items = page.items;
    setText(
      this.countEl,
      `${fmt(items.length)} of ${fmt(page.total)} shown · ${fmt(this.objects.length)} in the city`,
    );
    this.more.classList.toggle('hidden', items.length >= page.total);
    this.rows.replaceChildren(
      ...items.map((o) =>
        h(
          'tr',
          {
            class: `${o.id === this.chosen ? 'on' : ''}`,
            onClick: () => this.choose(o.id),
            onDblclick: () => this.locate(o.id),
          },
          h('td', { class: 'inv-id' }, o.id),
          h('td', {}, o.name),
          h('td', {}, o.district),
          h('td', {}, h('i', { class: `led ${o.status}` }), STATUS_LABEL[o.status]),
          h('td', { class: 'num' }, keyMetric(o)),
          h('td', { class: 'inv-issues' }, o.issues.map((i) => ISSUES[i]?.label ?? i).join(', ')),
        ),
      ),
    );
    if (!items.length)
      this.rows.append(
        h(
          'tr',
          {},
          h('td', { colspan: 6, class: 'inv-empty' }, 'Nothing matches. Try fewer words or Clear.'),
        ),
      );
  }

  private locate(id: string): void {
    this.close();
    this.ctx.services.get('inventory').select(id);
  }

  private renderDetail(): void {
    const o = this.chosen ? this.ctx.services.get('inventory').inspect(this.chosen) : null;
    if (!o) {
      this.detail.replaceChildren(
        h(
          'p',
          { class: 'inv-hint' },
          this.chosen
            ? `${this.chosen} no longer exists.`
            : 'Pick a row to inspect it. Double-click (or Locate) flies the camera there and opens it in the inspector.',
        ),
      );
      return;
    }
    const row = (k: string, v: unknown) =>
      h('div', { class: 'row' }, h('span', {}, label(k)), h('b', {}, show(v)));
    this.detail.replaceChildren(
      h('div', { class: 'inv-d-id' }, o.id, h('i', { class: `led ${o.status}` }), STATUS_LABEL[o.status]),
      h('h4', {}, o.name),
      h(
        'p',
        { class: 'inv-d-sub' },
        `${o.kind} · ${o.type} · ${o.district} · ${o.x.toFixed(0)}E ${o.z.toFixed(0)}S`,
      ),
      ...(typeof o.details.description === 'string' ? [h('p', {}, o.details.description)] : []),
      ...o.issueDetails.map((i) =>
        h('p', { class: `inv-d-issue s${i.severity}` }, h('b', {}, i.label), ` — ${i.hint}`),
      ),
      h('div', { class: 'inv-kv' }, ...Object.entries(o.metrics).map(([k, v]) => row(k, v))),
      h(
        'div',
        { class: 'inv-kv inv-d-more' },
        ...Object.entries(o.details)
          .filter(([k, v]) => k !== 'description' && k !== 'stats' && v !== null && v !== undefined)
          .map(([k, v]) => row(k, v)),
      ),
      h(
        'div',
        { class: 'inv-d-actions' },
        h('button', { class: 'btn ghost', onClick: () => this.locate(o.id) }, '⌖ Locate'),
        h(
          'button',
          { class: 'btn ghost', onClick: () => void navigator.clipboard?.writeText(o.id) },
          'Copy id',
        ),
      ),
    );
  }
}
