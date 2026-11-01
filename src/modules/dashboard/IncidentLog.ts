import type { GameContext } from '@/game/context';
import { Building, Service } from '@/ecs/components';
import { RESPONSE_COST, clockLabel, eidOfUid, repairCost } from '@/sim/hazards';
import { buildingId } from '@/sim/inventory';
import type { IncidentRecord } from '@/sim/stewardState';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';

type Filter = 'all' | 'fire' | 'quake' | 'storm' | 'water' | 'other';
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['fire', '🔥 Fires'],
  ['quake', '🌋 Quakes'],
  ['storm', '⛈ Storms'],
  ['water', '🌊 Floods & water'],
  ['other', 'Other'],
];
const KIND: Record<string, Filter> = {
  fire: 'fire',
  'industrial-fire': 'fire',
  earthquake: 'quake',
  thunderstorm: 'storm',
  tornado: 'storm',
  tsunami: 'water',
  monsoon: 'water',
  'king-tide': 'water',
  'algal-bloom': 'water',
};
const fmt = (n: number) => Math.round(n).toLocaleString();
const secs = (ticks: number) => {
  const s = Math.round(ticks / 10);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
};

/**
 * The dashboard's Incidents tab (D-050): what is burning or ruined now (dispatch crews, repair), and the log of
 * every past crisis and fire with its time, place, duration, losses and outcome, filterable by kind. Rebuilt
 * when shown and on incident events while open; live rows refresh at 1 Hz while the tab is open.
 */
export class IncidentLog {
  readonly el = h('div', { class: 'il' });
  private filter: Filter = 'all';
  private open = new Set<number>();

  constructor(private ctx: GameContext) {}

  render(): void {
    const { city } = this.ctx;
    const st = city.steward;
    const log = [...st.history].reverse();
    const sum = (k: keyof IncidentRecord) => log.reduce((a, r) => a + (r[k] as number), 0);
    const tile = (label: string, value: string, sub: string, bad = false) =>
      h(
        'div',
        { class: `il-tile${bad ? ' bad' : ''}` },
        h('span', {}, label),
        h('b', {}, value),
        h('i', {}, sub),
      );
    const crises = log.filter((r) => r.kind !== 'fire');
    const fires = log.filter((r) => r.kind === 'fire');

    // ── Now ──
    const now: HTMLElement[] = [];
    for (const f of st.fires) {
      const eid = eidOfUid(city, f.uid);
      if (eid < 0) continue;
      now.push(
        h(
          'div',
          { class: 'il-now fire' },
          h('span', { class: 'il-ico' }, '🔥'),
          h(
            'div',
            {},
            h('b', {}, `${city.buildingDef(eid).name} · ${buildingId(city, eid)}`),
            h(
              'span',
              {},
              `${city.districtAt(Math.floor(f.x), Math.floor(f.z)) ?? 'Outskirts'} · ${Math.round(f.intensity * 100)}% · ${f.crew ? 'crews on it' : f.cause}`,
            ),
          ),
          h('button', { class: 'il-go', onClick: () => this.fly(f.x, f.z) }, icon('locate')),
          f.crew
            ? null
            : h(
                'button',
                { class: 'il-act', onClick: () => this.act('respond', { id: f.id }) },
                `Dispatch ◈${RESPONSE_COST}`,
              ),
        ),
      );
    }
    let repairAll = 0;
    let listed = 0;
    for (const uid of st.ruins) {
      const eid = eidOfUid(city, uid);
      if (eid < 0) continue;
      const cost = repairCost(city, eid);
      repairAll += cost;
      // The first few ruins by name; the rest are summed into "Rebuild all" so the log stays in view.
      if (listed++ >= 4) continue;
      const [x, z] = [Building.x[eid]! + Building.w[eid]! / 2, Building.z[eid]! + Building.d[eid]! / 2];
      now.push(
        h(
          'div',
          { class: 'il-now ruin' },
          h('span', { class: 'il-ico' }, icon('ruin')),
          h(
            'div',
            {},
            h('b', {}, `Ruin: ${city.buildingDef(eid).name} · ${buildingId(city, eid)}`),
            h('span', {}, city.districtAt(Math.floor(x), Math.floor(z)) ?? 'Outskirts'),
          ),
          h('button', { class: 'il-go', onClick: () => this.fly(x, z) }, icon('locate')),
          h(
            'button',
            {
              class: 'il-act',
              onClick: () => this.act('repair', { x: Building.x[eid]!, z: Building.z[eid]! }),
            },
            `Rebuild ◈${fmt(cost)}`,
          ),
        ),
      );
    }
    const worn = city
      .buildingEntities()
      .filter((e) => Service.condition[e]! < 0.7 && !st.ruins.includes(Building.uid[e]!)).length;

    const shown = log.filter((r) => this.filter === 'all' || (KIND[r.kind] ?? 'other') === this.filter);
    this.el.replaceChildren(
      h(
        'div',
        { class: 'il-tiles' },
        tile('Incidents logged', fmt(crises.length), `${fmt(fires.length)} fires`),
        tile('Buildings ruined', fmt(sum('lost')), `${st.ruins.length} awaiting repair`, st.ruins.length > 0),
        tile('Damage & response', `◈${fmt(sum('cost'))}`, 'lost to hazards'),
        tile('Residents displaced', fmt(sum('displaced')), `${worn} buildings worn below 70%`),
      ),
      h('h3', { class: 'il-h' }, 'Now'),
      now.length
        ? h(
            'div',
            { class: 'il-nowlist' },
            ...now,
            st.ruins.length > 1
              ? h(
                  'div',
                  { class: 'il-more' },
                  st.ruins.length > 4 ? h('span', {}, `+ ${st.ruins.length - 4} more ruins`) : null,
                  h(
                    'button',
                    { class: 'il-act all', onClick: () => this.repairAll() },
                    `Rebuild all ${st.ruins.length} ruins · ◈${fmt(repairAll)}`,
                  ),
                )
              : null,
          )
        : h('p', { class: 'il-calm' }, '✓ Nothing burning, no ruins. Ember Watch stations stand by.'),
      h(
        'div',
        { class: 'il-bar' },
        h('h3', { class: 'il-h' }, 'Incident log'),
        h(
          'div',
          { class: 'il-filters' },
          ...FILTERS.map(([f, label]) =>
            h(
              'button',
              {
                class: `il-f${f === this.filter ? ' on' : ''}`,
                onClick: () => ((this.filter = f), this.render()),
              },
              label,
            ),
          ),
        ),
      ),
      this.trends(log),
      shown.length
        ? h('div', { class: 'il-log' }, ...shown.map((r) => this.row(r)))
        : h(
            'p',
            { class: 'il-calm' },
            log.length
              ? 'Nothing of this kind yet.'
              : 'No incidents yet. Crises, quakes, storms and fires will be recorded here.',
          ),
    );
  }

  /**
   * Trends (D-076): per kind of incident, how many, buildings ruined, residents displaced and credits lost, and how
   * many had prevention that helped; plus the log as CSV for analysis outside the game.
   */
  private trends(log: IncidentRecord[]): HTMLElement {
    const by = new Map<string, { name: string; icon: string; n: number; lost: number; displaced: number; cost: number; helped: number }>();
    for (const r of log) {
      const t = by.get(r.kind) ?? { name: r.name, icon: r.icon, n: 0, lost: 0, displaced: 0, cost: 0, helped: 0 };
      t.n++;
      t.lost += r.lost;
      t.displaced += r.displaced;
      t.cost += r.cost;
      if (r.prevented?.length) t.helped++;
      by.set(r.kind, t);
    }
    const rows = [...by.values()].sort((a, b) => b.cost - a.cost);
    const csv = () => {
      const head = 'id,kind,name,start_tick,end_tick,severity,district,hits,ruined,fires,displaced,cost,outcome,prevented';
      const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const body = log.map((r) =>
        [r.id, r.kind, q(r.name), r.startTick, r.endTick, r.severity.toFixed(2), q(r.district), r.hits, r.lost, r.fires, r.displaced, r.cost, q(r.outcome), q((r.prevented ?? []).join('; '))].join(','),
      );
      const blob = new Blob([[head, ...body].join('\n')], { type: 'text/csv' });
      const a = h('a', { href: URL.createObjectURL(blob), download: 'bloomgrid-incidents.csv' }) as HTMLAnchorElement;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    return h(
      'div',
      { class: 'il-trends' },
      h('div', { class: 'il-bar' }, h('h3', { class: 'il-h' }, 'By kind'), log.length ? h('button', { class: 'il-act', onClick: csv }, 'Export CSV') : null),
      rows.length
        ? h(
            'div',
            { class: 'il-trend-grid' },
            ...rows.map((t) =>
              h('div', { class: 'il-trend' }, h('b', {}, `${t.icon} ${t.name}`), h('span', {}, `${t.n}×`), h('span', {}, `${t.lost} ruined`), h('span', {}, `${fmt(t.displaced)} displaced`), h('span', {}, `◈${fmt(t.cost)}`), h('span', { class: t.helped ? 'ok' : '' }, t.helped ? `prevention helped ${t.helped}×` : '')),
            ),
          )
        : h('p', { class: 'il-calm' }, 'No incidents yet.'),
    );
  }

  private row(r: IncidentRecord): HTMLElement {
    const open = this.open.has(r.id);
    const chip = (v: number | string, label: string, bad = false) =>
      v ? h('span', { class: `il-chip${bad ? ' bad' : ''}` }, `${v} ${label}`) : null;
    const detail = open
      ? h(
          'div',
          { class: 'il-detail' },
          h('div', {}, h('span', {}, 'Severity'), h('b', {}, `${Math.round(r.severity * 100)}%`)),
          r.cause ? h('div', {}, h('span', {}, 'Cause'), h('b', {}, r.cause)) : null,
          h('div', {}, h('span', {}, 'Ended'), h('b', {}, clockLabel(r.endTick))),
          ...(r.prevented ?? []).map((p) => h('div', { class: 'il-prev' }, h('span', {}, 'Prevented'), h('b', {}, p))),
          r.objects.length
            ? h(
                'div',
                { class: 'il-objs' },
                h('span', {}, 'Hit'),
                ...r.objects.map((id) =>
                  h(
                    'button',
                    { class: 'il-obj', onClick: () => this.ctx.services.get('dashboard').openInventory(id) },
                    id,
                  ),
                ),
              )
            : null,
        )
      : null;
    return h(
      'article',
      { class: `il-row ${KIND[r.kind] ?? 'other'}${open ? ' open' : ''}` },
      h(
        'header',
        { onClick: () => (open ? this.open.delete(r.id) : this.open.add(r.id), this.render()) },
        h('span', { class: 'il-ico' }, icon(r.icon)),
        h(
          'div',
          { class: 'il-main' },
          h('b', {}, r.name),
          h(
            'span',
            {},
            `${clockLabel(r.startTick)} · ${secs(r.endTick - r.startTick)} · ${r.district ?? 'Outskirts'}`,
          ),
        ),
        h('div', { class: 'il-out' }, h('span', { class: r.lost ? 'bad' : '' }, r.outcome)),
        r.x !== undefined
          ? h(
              'button',
              {
                class: 'il-go',
                title: 'Show where',
                onClick: (e: Event) => (e.stopPropagation(), this.fly(r.x!, r.z!)),
              },
              icon('locate'),
            )
          : null,
      ),
      h(
        'div',
        { class: 'il-chips' },
        chip(r.kind === 'fire' ? 0 : r.hits, 'damaged'),
        chip(r.lost, 'ruined', true),
        chip(r.kind === 'fire' ? 0 : r.fires, 'fires'),
        chip(r.displaced, 'displaced', true),
        chip(r.cost ? `◈${fmt(r.cost)}` : 0, 'lost'),
      ),
      detail,
    );
  }

  private fly(x: number, z: number): void {
    this.ctx.cameraCtl.flyTo(x, z, 40);
    this.ctx.services.get('dashboard').toggle();
  }

  private act(type: 'respond' | 'repair', payload: unknown): void {
    if (!this.ctx.commands.execute(type, payload))
      this.ctx.bus.emit('toast', { text: 'Not enough credits', tone: 'bad' });
    this.render();
  }

  private repairAll(): void {
    const { city } = this.ctx;
    for (const uid of [...city.steward.ruins]) {
      const eid = eidOfUid(city, uid);
      if (eid >= 0 && !this.ctx.commands.execute('repair', { x: Building.x[eid]!, z: Building.z[eid]! })) {
        this.ctx.bus.emit('toast', { text: 'Credits ran out before every ruin was rebuilt', tone: 'bad' });
        break;
      }
    }
    this.render();
  }
}
