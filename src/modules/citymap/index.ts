import type { GameContext, GameModule } from '@/game/context';
import { Building, Service } from '@/ecs/components';
import { NO_ENTITY } from '@/sim/Grid';
import type { District } from '@/sim/City';
import { ZONES, type ZoneKind } from '@/content/types';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { holoHead } from '@/ui/holo';
import './citymap.css';

export interface CityMapService {
  toggle(open?: boolean): void;
  readonly isOpen: boolean;
}

declare module '@/core/Services' {
  interface GameServices {
    citymap: CityMapService;
  }
}

interface Area {
  d: District;
  color: [number, number, number];
  /** Tile centroid (where the label goes) and tile count. */
  cx: number;
  cz: number;
  tiles: number;
  buildings: number;
  residents: number;
  label: HTMLElement;
  row: HTMLElement;
}

const fmtK = (n: number) =>
  n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));

/** District hues spread round the wheel (golden angle), kept light enough to read on the dark map. */
function hue(i: number): [number, number, number] {
  const hh = ((i * 137.508 + 165) % 360) / 360;
  const s = 0.62;
  const l = 0.62;
  const f = (n: number) => {
    const k = (n + hh * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const ZONE_ORDER = Object.keys(ZONES) as ZoneKind[];

/**
 * City map (Y, ⌖ map button in the top bar's stats): a holographic plan of the island painted from the live
 * city when opened (terrain relief, water depth, highways, buildings), every named district tinted and outlined
 * with its name, building and resident counts placed at its centre, a legend, and the camera's position and
 * heading. Colours show each area's zone (living, work, industry, entertainment, sports…; D-049), or, toggled,
 * one colour per district. Click a district (label or legend) or any spot to fly there. Painted once per open (one pass over the
 * tiles, ≈ tens of ms); only the camera marker updates while open (5 Hz).
 */
class CityMap {
  readonly el: HTMLElement;
  private open = false;
  private canvas = h('canvas', { class: 'cmap-canvas' }) as HTMLCanvasElement;
  private labels = h('div', { class: 'cmap-labels' });
  private legend = h('div', { class: 'cmap-legend' });
  private cam = h('div', { class: 'cmap-cam' }, h('i'));
  private readout = h('div', { class: 'cmap-readout' });
  /** Burning buildings (D-050), refreshed with the camera marker; click to fly there. */
  private fires = h('div', { class: 'cmap-fires' });
  private fireKey = '';
  private stage: HTMLElement;
  private areas: Area[] = [];
  private owner = new Int16Array(0);
  private hot: Area | null = null;
  private timer = 0;
  /** Square view box over the land (tiles): the open sea round the island is cropped away. */
  private view = { x: 0, z: 0, size: 1 };
  /** Colour by zone (default) or one colour per district. */
  private byZone = true;
  private modeBtns: HTMLElement[] = [];

  constructor(private ctx: GameContext) {
    this.stage = h(
      'div',
      {
        class: 'cmap-stage',
        onPointermove: (e: PointerEvent) => this.hover(e),
        onPointerleave: () => this.setHot(null),
        onClick: (e: MouseEvent) => this.clickMap(e),
      },
      this.canvas,
      h('div', { class: 'cmap-grid' }),
      this.labels,
      this.fires,
      this.cam,
      h('div', { class: 'cmap-compass', 'aria-hidden': 'true' }, h('b', {}, 'N'), h('i')),
    );
    this.el = h(
      'div',
      { class: 'cmap-scrim hidden', onClick: (e: Event) => e.target === this.el && this.toggle(false) },
      h(
        'section',
        { class: 'cmap panel holo', role: 'dialog', 'aria-label': 'City map' },
        h(
          'header',
          { class: 'cmap-head' },
          holoHead(icon('map'), 'Island survey', 'City Map', 'Districts and areas · click anywhere to fly there'),
          h(
            'div',
            { class: 'cmap-mode', role: 'tablist' },
            ...(['Zones', 'Districts'] as const).map((label, k) => {
              const btn = h(
                'button',
                { class: `cmap-mode-b${k === 0 ? ' on' : ''}`, onClick: () => this.setMode(k === 0) },
                label,
              );
              this.modeBtns.push(btn);
              return btn;
            }),
          ),
          h('kbd', { class: 'cmap-key' }, 'Y'),
          h('button', { class: 'icon-btn', title: 'Close (Esc)', 'aria-label': 'Close', onClick: () => this.toggle(false) }, icon('close')),
        ),
        h(
          'div',
          { class: 'cmap-body' },
          h('div', { class: 'cmap-mapcol' }, this.stage, this.readout),
          this.legend,
        ),
      ),
    );
    ctx.hud.append(this.el);
    ctx.input.onKey((e) => {
      if (e.code === 'KeyY' && !e.metaKey && !e.ctrlKey) return (this.toggle(), true);
      if (e.code === 'Escape' && this.open) return (this.toggle(false), true);
      return false;
    });
  }

  private setMode(byZone: boolean): void {
    this.byZone = byZone;
    this.modeBtns.forEach((b, k) => b.classList.toggle('on', (k === 0) === byZone));
    if (this.open) this.paint();
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(open = !this.open): void {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    if (open) {
      this.paint();
      this.fireKey = '-';
      this.timer = 99;
      this.update(0);
    }
  }

  /** One pass over the tiles: ownership, relief, water, roads, buildings, district tint and borders. */
  private paint(): void {
    const { city } = this.ctx;
    const g = city.grid;
    const [W, H] = [g.w, g.h];
    const ds = city.districts;
    if (this.owner.length !== W * H) this.owner = new Int16Array(W * H);
    const own = this.owner;
    const sums = ds.map(() => ({ x: 0, z: 0, n: 0 }));
    let [lx0, lz0, lx1, lz1] = [W, H, 0, 0];
    for (let z = 0; z < H; z++)
      for (let x = 0; x < W; x++) {
        let o = -1;
        for (let k = 0; k < ds.length; k++) {
          const d = ds[k]!;
          if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) {
            o = k;
            break;
          }
        }
        own[z * W + x] = o;
        if (!city.isWaterTile(x, z))
          [lx0, lz0, lx1, lz1] = [Math.min(lx0, x), Math.min(lz0, z), Math.max(lx1, x), Math.max(lz1, z)];
        if (o >= 0) {
          const s = sums[o]!;
          s.x += x;
          s.z += z;
          s.n++;
        }
      }
    const colors = ds.map((d, i) => (this.byZone && d.zone ? rgb(ZONES[d.zone].color) : hue(i)));
    const size = Math.min(W, Math.max(lx1 - lx0, lz1 - lz0) + 24);
    const clampV = (c: number) => Math.max(0, Math.min(W - size, Math.round(c - size / 2)));
    this.view = { x: clampV((lx0 + lx1) / 2), z: clampV((lz0 + lz1) / 2), size };
    const v = this.view;
    Object.assign(this.canvas.style, {
      width: `${(W / v.size) * 100}%`,
      height: `${(H / v.size) * 100}%`,
      left: `${(-v.x / v.size) * 100}%`,
      top: `${(-v.z / v.size) * 100}%`,
    });
    // Labels fit their district's on-screen width (the stage is laid out: the map opened before painting).
    const pxPerTile = this.stage.getBoundingClientRect().width / v.size;
    this.canvas.width = W;
    this.canvas.height = H;
    const c2 = this.canvas.getContext('2d')!;
    const img = c2.createImageData(W, H);
    const px = img.data;
    const hAt = (x: number, z: number) => g.heightAt(Math.min(W - 1, x) + 0.5, Math.min(H - 1, z) + 0.5);
    for (let z = 0; z < H; z++)
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        const hgt = hAt(x, z);
        let r: number, gg: number, b: number;
        if (city.isWaterTile(x, z)) {
          const k = Math.max(0, Math.min(1, -hgt / 6));
          [r, gg, b] = [16 - 10 * k, 64 - 40 * k, 74 - 36 * k];
        } else {
          // Height tint plus a north-west light for relief.
          const k = Math.max(0, Math.min(1, hgt / 14));
          const shade = Math.max(-0.35, Math.min(0.35, (hAt(x - 1, z - 1) - hgt) * -0.6));
          [r, gg, b] = [34 + 40 * k, 74 + 44 * k, 62 + 22 * k].map((v) => v * (1 + shade)) as [
            number,
            number,
            number,
          ];
        }
        const o = own[i]!;
        if (o >= 0) {
          const [cr, cg, cb] = colors[o]!;
          [r, gg, b] = [r * 0.72 + cr * 0.28, gg * 0.72 + cg * 0.28, b * 0.72 + cb * 0.28];
        }
        if (g.road[i]) [r, gg, b] = [150, 236, 220];
        else if (city.buildingAt(x, z) !== NO_ENTITY)
          [r, gg, b] = [r * 0.5 + 118, gg * 0.5 + 128, b * 0.5 + 120];
        // District borders: tiles whose east or south neighbour belongs elsewhere.
        if (
          o >= 0 &&
          ((x + 1 < W && own[i + 1] !== o) ||
            (z + 1 < H && own[i + W] !== o) ||
            (x > 0 && own[i - 1] !== o) ||
            (z > 0 && own[i - W] !== o))
        )
          [r, gg, b] = colors[o]!;
        px[i * 4] = r;
        px[i * 4 + 1] = gg;
        px[i * 4 + 2] = b;
        px[i * 4 + 3] = 255;
      }
    c2.putImageData(img, 0, 0);

    // Buildings and residents per district (by footprint centre).
    const counts = ds.map(() => ({ b: 0, r: 0 }));
    for (const eid of city.buildingEntities()) {
      const x = Math.floor(Building.x[eid]! + Building.w[eid]! / 2);
      const z = Math.floor(Building.z[eid]! + Building.d[eid]! / 2);
      const o = g.inBounds(x, z) ? own[z * W + x]! : -1;
      if (o < 0) continue;
      counts[o]!.b++;
      counts[o]!.r += city.buildingDef(eid).stats.population * Service.occupancy[eid]!;
    }

    this.areas = ds
      .map((d, i): Area | null => {
        const s = sums[i]!;
        if (!s.n) return null;
        const [cr, cg, cb] = colors[i]!;
        const css = `rgb(${cr},${cg},${cb})`;
        const area: Area = {
          d,
          color: colors[i]!,
          cx: s.x / s.n + 0.5,
          cz: s.z / s.n + 0.5,
          tiles: s.n,
          buildings: counts[i]!.b,
          residents: counts[i]!.r,
          label: h('div'),
          row: h('div'),
        };
        const stat = `${area.buildings} bldg${area.residents >= 1 ? ` · ${fmtK(area.residents)} res` : ''}`;
        const zone = d.zone ? ZONES[d.zone] : null;
        // Names fit their district's width on screen (≈0.78 em per mono character incl. letter spacing).
        const wpx = (d.x1 - d.x0) * pxPerTile;
        const fs = Math.max(9.5, Math.min(15, (wpx * 0.92) / (d.name.length * 0.78)));
        area.label = h(
          'button',
          {
            // Narrow districts show just the name (their counts are in the legend).
            class: `cmap-label${wpx < 115 ? ' tight' : ''}`,
            // Never wider than the district: long names wrap rather than run into the neighbours.
            style: `left:${((area.cx - v.x) / v.size) * 100}%;top:${((area.cz - v.z) / v.size) * 100}%;--c:${css};--fs:${fs.toFixed(1)}px;max-width:${Math.max(48, wpx + 14).toFixed(0)}px`,
            onClick: (e: Event) => (e.stopPropagation(), this.fly(area)),
            onPointerenter: () => this.setHot(area),
          },
          h('b', {}, zone && this.byZone ? `${zone.icon} ${d.name}` : d.name),
          h('span', {}, stat),
        );
        area.row = h(
          'button',
          {
            class: 'cmap-row',
            style: `--c:${css}`,
            onClick: () => this.fly(area),
            onPointerenter: () => this.setHot(area),
            onPointerleave: () => this.setHot(null),
          },
          h('i'),
          h('b', {}, d.name),
          h('span', {}, stat),
        );
        return area;
      })
      .filter((a): a is Area => a !== null);
    this.labels.replaceChildren(...this.areas.map((a) => a.label));
    const sorted = [...this.areas].sort((a, b) => b.residents - a.residents || b.buildings - a.buildings);
    // Grouped by zone (in ZONES order, with what each zone is for), or one list by residents.
    const groups = this.byZone
      ? [
          ...ZONE_ORDER.map((z) => [z, sorted.filter((a) => a.d.zone === z)] as const),
          [null, sorted.filter((a) => !a.d.zone)] as const,
        ].filter(([, list]) => list.length)
      : [[null, sorted] as const];
    this.legend.replaceChildren(
      h(
        'div',
        { class: 'cmap-lh' },
        h('span', {}, `${this.areas.length} districts`),
        h('span', {}, this.byZone ? 'by zone' : 'by residents'),
      ),
      ...groups.flatMap(([z, list]): HTMLElement[] => [
        ...(z
          ? [
              h(
                'div',
                { class: 'cmap-zone', style: `--c:#${ZONES[z].color.toString(16).padStart(6, '0')}` },
                h('b', {}, `${ZONES[z].icon} ${ZONES[z].label}`),
                h('span', {}, ZONES[z].note),
              ),
            ]
          : []),
        ...list.map((a) => a.row),
      ]),
      h('div', { class: 'cmap-note' }, 'Land outside every district is the Outskirts.'),
    );
  }

  private setHot(a: Area | null): void {
    if (a === this.hot) return;
    this.hot?.label.classList.remove('hot');
    this.hot?.row.classList.remove('hot');
    this.hot = a;
    a?.label.classList.add('hot');
    a?.row.classList.add('hot');
  }

  /** Tile under a pointer event on the stage. */
  private tileAt(e: MouseEvent): [number, number] {
    const r = this.stage.getBoundingClientRect();
    const v = this.view;
    return [
      Math.floor(v.x + ((e.clientX - r.left) / r.width) * v.size),
      Math.floor(v.z + ((e.clientY - r.top) / r.height) * v.size),
    ];
  }

  private hover(e: PointerEvent): void {
    const [x, z] = this.tileAt(e);
    const g = this.ctx.city.grid;
    if (!g.inBounds(x, z)) return;
    const o = this.owner[z * g.w + x] ?? -1;
    const area = o >= 0 ? (this.areas.find((a) => a.d === this.ctx.city.districts[o]) ?? null) : null;
    if (!(e.target as HTMLElement).closest('.cmap-label')) this.setHot(area);
    const what = this.ctx.city.isWaterTile(x, z) ? 'Open water' : (area?.d.name ?? 'Outskirts');
    setText(this.readout, `X ${String(x).padStart(3, '0')} · Z ${String(z).padStart(3, '0')} · ${what}`);
  }

  private clickMap(e: MouseEvent): void {
    const [x, z] = this.tileAt(e);
    if (!this.ctx.city.grid.inBounds(x, z)) return;
    this.ctx.cameraCtl.flyTo(x + 0.5, z + 0.5, 70);
    this.toggle(false);
  }

  private fly(a: Area): void {
    const { d } = a;
    const span = Math.max(d.x1 - d.x0, d.z1 - d.z0);
    this.ctx.cameraCtl.flyTo(a.cx, a.cz, Math.max(55, Math.min(260, span * 1.5)), 0.9);
    this.ctx.bus.emit('toast', { text: `Flying to ${d.name}`, tone: 'info' });
    this.toggle(false);
  }

  /** Camera marker (5 Hz while open). */
  update(dt: number): void {
    if (!this.open) return;
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    const { cameraCtl } = this.ctx;
    const t = cameraCtl.target;
    const v = this.view;
    // The camera sits at +(sin yaw, cos yaw) from its target, so it looks along the opposite direction.
    const heading = Math.atan2(-Math.cos(cameraCtl.yaw), -Math.sin(cameraCtl.yaw));
    this.cam.style.left = `${((t.x - v.x) / v.size) * 100}%`;
    this.cam.style.top = `${((t.z - v.z) / v.size) * 100}%`;
    this.cam.style.transform = `translate(-50%, -50%) rotate(${heading + Math.PI / 2}rad)`;
    const fires = this.ctx.city.steward.fires;
    const key = fires.map((f) => f.id).join(',');
    if (key === this.fireKey) return;
    this.fireKey = key;
    this.fires.replaceChildren(
      ...fires.map((f) =>
        h(
          'button',
          {
            class: 'cmap-fire',
            title: 'Fire: fly there',
            style: `left:${((f.x - v.x) / v.size) * 100}%;top:${((f.z - v.z) / v.size) * 100}%`,
            onClick: (e: Event) => (
              e.stopPropagation(),
              this.ctx.cameraCtl.flyTo(f.x, f.z, 32),
              this.toggle(false)
            ),
          },
          '🔥',
        ),
      ),
    );
  }
}

export const cityMapModule: GameModule = {
  id: 'citymap',
  deps: ['hud'],
  init(ctx) {
    const map = new CityMap(ctx);
    ctx.services.get('hud').stats.prepend(
      h(
        'button',
        {
          class: 'cmap-btn',
          title: 'City map: districts (Y)',
          'aria-label': 'Open the city map',
          onClick: () => map.toggle(),
        },
        h('span', { class: 'g' }, icon('map')),
        h('span', { class: 'l' }, 'Map'),
      ),
    );
    ctx.services.provide('citymap', {
      toggle: (o) => map.toggle(o),
      get isOpen() {
        return map.isOpen;
      },
    });
    ctx.systems.add({ id: 'citymap', phase: 'render', order: 110, update: (_c, f) => map.update(f.dt) });
  },
};
