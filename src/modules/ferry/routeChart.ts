import type { Grid } from '@/sim/Grid';

/**
 * The cruise ferry's route chart (D-232): the inspector's picture of the timetable instead of a row of names. A small
 * sea chart of the island (land and shallows painted once from the terrain) with every stop in timetable order as a
 * numbered marker (this voyage, the next, risen, not yet risen; click one to charter it), this voyage's course with the
 * stretch already sailed lit and the sightseeing loop dashed, the pier, and the ship on it; under it a strip from
 * the pier out to the loop and home with the ship's progress.
 *
 * DOM only, built once and updated in place on the inspector's read (twice a second); the ship glides between reads
 * on a CSS transition, so no animation loop of its own. Text goes in through `textContent` (names are ours).
 */

type P2 = readonly [number, number];
const SVG = 'http://www.w3.org/2000/svg';

export interface ChartStop {
  key: string;
  name: string;
  /** Where it is now (tile coordinates; the whale pod roams). */
  at: P2;
  state: 'dest' | 'next' | 'open' | 'locked';
}

export interface ChartState {
  stops: ChartStop[];
  pier: P2 | null;
  ship: P2;
  /** Heading (atan2(dz, dx)). */
  heading: number;
  /** This voyage's course (tile points), its length, the loop's arc range and how far along the ship is. */
  course: { pts: readonly P2[]; length: number; loop: readonly [number, number] } | null;
  along: number;
  phase: 'board' | 'astern' | 'turn' | 'sail';
  /** 0..1 of the boarding wait, while at the pier. */
  boarding: number;
  destName: string | null;
}

export interface RouteChart {
  el: HTMLElement;
  update(s: ChartState): void;
}

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const div = (cls: string, text?: string) => {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
};

/** Map tiles the chart shows round the island (the whale grounds reach past the map's edge). */
const MARGIN = 0.14;
/** Marker radius and label size in tiles (the chart is drawn ~300 px across ~650 tiles). */
const R = 24;

export function createRouteChart(grid: Grid, onPick: (key: string) => void): RouteChart {
  const S = grid.w;
  const x0 = -MARGIN * S;
  const span = S * (1 + 2 * MARGIN);
  const root = div('fy-chart');
  const map = div('fy-map');

  // Land and shallows, painted once (the coast changes rarely and the chart is a sketch).
  const N = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  canvas.className = 'fy-land';
  const g2 = canvas.getContext('2d');
  if (g2) {
    const img = g2.createImageData(N, N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = x0 + ((i + 0.5) / N) * span;
        const z = x0 + ((j + 0.5) / N) * span;
        const inside = x >= 0 && z >= 0 && x < S && z < S;
        const h = inside ? grid.heightAt(x, z) : -10;
        const k = (j * N + i) * 4;
        if (h > 0.05) img.data.set(h > 3 ? [104, 160, 98, 255] : [126, 186, 112, 255], k);
        else if (h > -1.2) img.data.set([140, 214, 224, 120], k);
      }
    g2.putImageData(img, 0, 0);
  }

  const svg = el('svg', { viewBox: `${x0} ${x0} ${span} ${span}`, class: 'fy-svg', role: 'img' });
  const title = el('title');
  title.textContent = 'The Tidesong’s route: tap a stop to charter the next voyage';
  svg.append(title);
  const sailed = el('path', { class: 'fy-course-done', fill: 'none' });
  const ahead = el('path', { class: 'fy-course', fill: 'none' });
  const loop = el('path', { class: 'fy-loop', fill: 'none' });
  const stopsG = el('g');
  const pierG = el('g', { class: 'fy-pier' });
  pierG.append(el('rect', { x: -7, y: -7, width: 14, height: 14, rx: 3 }));
  const ship = el('g', { class: 'fy-ship' });
  ship.append(el('circle', { r: 30, class: 'fy-ship-halo' }), el('path', { d: 'M 30 0 L -20 -17 L -10 0 L -20 17 Z' }));
  svg.append(ahead, sailed, loop, pierG, stopsG, ship);
  map.append(canvas, svg);

  // Pier → out → loop → home strip.
  const strip = div('fy-strip');
  const bar = div('fy-bar');
  const fill = div('fy-fill');
  const loopBand = div('fy-band');
  const boat = div('fy-boat');
  bar.append(loopBand, fill, boat);
  const labels = div('fy-strip-labels');
  const [lPier, lDest, lHome] = [div('', 'Pier'), div('fy-dest'), div('', 'Home')];
  labels.append(lPier, lDest, lHome);
  strip.append(bar, labels);
  const legend = div('fy-legend');
  for (const [cls, text] of [
    ['dest', 'This voyage'],
    ['next', 'Next'],
    ['open', 'Charter'],
    ['locked', 'Not yet risen'],
  ] as const) {
    const item = div(`fy-key ${cls}`);
    item.append(div('fy-dot'), document.createTextNode(text));
    legend.append(item);
  }
  const hint = div('fy-hint', 'Tap a stop to charter the next voyage');
  root.append(map, strip, legend, hint);

  let courseKey = '';
  let shipDeg = 0;
  const markers = new Map<string, { g: SVGGElement; title: SVGTitleElement; label: SVGTextElement }>();

  const pathOf = (pts: readonly P2[], from = 0, to = pts.length) => {
    let d = '';
    const step = Math.max(1, Math.floor((to - from) / 160));
    for (let i = from; i < to; i += step) d += `${d ? 'L' : 'M'}${pts[i]![0].toFixed(1)} ${pts[i]![1].toFixed(1)}`;
    const last = pts[to - 1];
    if (last) d += `L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
    return d;
  };

  const update = (s: ChartState) => {
    // Stops: built once per key, restyled and moved each read.
    s.stops.forEach((stop, i) => {
      let m = markers.get(stop.key);
      if (!m) {
        const g = el('g', { class: 'fy-stop', tabindex: 0, role: 'button' });
        const t = el('title');
        const num = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' });
        num.textContent = String(i + 1);
        const label = el('text', { class: 'fy-label', 'dominant-baseline': 'central' });
        g.append(t, el('circle', { r: R + 9, class: 'fy-stop-ring' }), el('circle', { r: R }), num, label);
        const pick = () => g.classList.contains('locked') || onPick(stop.key);
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick()));
        stopsG.append(g);
        markers.set(stop.key, (m = { g, title: t, label }));
      }
      m.g.setAttribute('transform', `translate(${stop.at[0].toFixed(1)} ${stop.at[1].toFixed(1)})`);
      m.g.setAttribute('class', `fy-stop ${stop.state}`);
      // This voyage's and the next stop are named on the chart, on the side facing the island (inside the frame).
      const named = stop.state === 'dest' || stop.state === 'next';
      const left = stop.at[0] > S / 2;
      m.label.textContent = named ? stop.name.replace(/^the /i, '') : '';
      m.label.setAttribute('x', String(left ? -(R + 10) : R + 10));
      m.label.setAttribute('text-anchor', left ? 'end' : 'start');
      m.title.textContent =
        stop.state === 'locked'
          ? `${i + 1} · Not yet risen`
          : `${i + 1} · ${stop.name}${stop.state === 'dest' ? ' (this voyage)' : stop.state === 'next' ? ' (next voyage)' : ' · tap to charter'}`;
    });

    // The course: rebuilt only when the voyage (or the roaming pod's course) changes.
    const key = s.course ? `${s.destName}|${s.course.length.toFixed(0)}` : '';
    if (key !== courseKey) {
      courseKey = key;
      if (s.course) {
        const { pts, length, loop: [a, b] } = s.course;
        const d = pathOf(pts);
        ahead.setAttribute('d', d);
        sailed.setAttribute('d', d);
        sailed.setAttribute('pathLength', String(length));
        // The loop's points: arc length grows along the course, so find them by walking it.
        let acc = 0;
        let i0 = 0;
        let i1 = pts.length;
        for (let i = 1; i < pts.length; i++) {
          acc += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
          if (acc < a) i0 = i;
          if (acc <= b) i1 = i + 1;
        }
        loop.setAttribute('d', pathOf(pts, i0, i1));
        loopBand.style.left = `${(a / length) * 100}%`;
        loopBand.style.width = `${((b - a) / length) * 100}%`;
      } else for (const p of [ahead, sailed, loop]) p.setAttribute('d', '');
    }
    const len = s.course?.length ?? 1;
    const done = s.phase === 'sail' ? Math.min(len, s.along) : 0;
    sailed.setAttribute('stroke-dasharray', `${done} ${len}`);

    if (s.pier) pierG.setAttribute('transform', `translate(${s.pier[0].toFixed(1)} ${s.pier[1].toFixed(1)})`);
    pierG.style.display = s.pier ? '' : 'none';
    // Unwrap the heading so the CSS transition turns the short way round.
    let deg = (s.heading * 180) / Math.PI;
    deg += Math.round((shipDeg - deg) / 360) * 360;
    shipDeg = deg;
    ship.style.transform = `translate(${s.ship[0].toFixed(1)}px, ${s.ship[1].toFixed(1)}px) rotate(${deg.toFixed(1)}deg)`;

    const k = s.phase === 'board' ? 0 : s.phase === 'sail' ? done / len : 0.01;
    fill.style.width = `${(k * 100).toFixed(1)}%`;
    boat.style.left = `${(k * 100).toFixed(1)}%`;
    root.classList.toggle('boarding', s.phase === 'board');
    lPier.textContent = s.phase === 'board' ? `Boarding ${Math.round(s.boarding * 100)}%` : 'Pier';
    lDest.textContent = s.destName ? `Loop · ${s.destName.replace(/^the /i, '')}` : 'No voyage';
  };

  return { el: root, update };
}
