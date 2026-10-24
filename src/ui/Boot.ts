import './boot.css';

const SVG = 'http://www.w3.org/2000/svg';
const COLORS = ['#5ff2da', '#8ef07a', '#ff9fc4', '#ffcf6a', '#c9b6ff'];

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Bio-circuit emblem: three counter-rotating rings, a pulsing seed and vines that grow and bloom. */
function emblem(): SVGSVGElement {
  const root = svg('svg', { class: 'bt-emblem', viewBox: '-100 -100 200 200', 'aria-hidden': 'true' });
  const defs = svg('defs', {});
  const grad = svg('linearGradient', { id: 'bt-vine', x1: '0', y1: '0', x2: '1', y2: '1' });
  grad.append(svg('stop', { offset: '0', 'stop-color': '#8ef07a' }), svg('stop', { offset: '1', 'stop-color': '#5ff2da' }));
  const glow = svg('radialGradient', { id: 'bt-glow' });
  glow.append(svg('stop', { offset: '0', 'stop-color': '#d9fff6' }), svg('stop', { offset: '0.5', 'stop-color': '#5ff2da' }), svg('stop', { offset: '1', 'stop-color': '#5ff2da', 'stop-opacity': '0' }));
  defs.append(grad, glow);
  root.append(defs);

  root.append(
    svg('circle', { class: 'bt-ring bt-r1', r: 90, stroke: '#5ff2da', 'stroke-opacity': 0.5, 'stroke-width': 1, 'stroke-dasharray': '1 5' }),
    svg('circle', { class: 'bt-ring bt-r2', r: 77, stroke: '#8ef07a', 'stroke-opacity': 0.55, 'stroke-width': 1.6, 'stroke-dasharray': '46 10 4 10' }),
  );
  const r3 = svg('g', { class: 'bt-ring bt-r3' });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = a + 0.5;
    r3.append(
      svg('path', {
        d: `M ${Math.cos(a) * 63} ${Math.sin(a) * 63} A 63 63 0 0 1 ${Math.cos(b) * 63} ${Math.sin(b) * 63}`,
        stroke: '#ff9fc4',
        'stroke-opacity': 0.7,
        'stroke-width': 2.4,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
  }
  root.append(r3);

  // Vines: each curls outward from the seed and ends in a glowing bud.
  const vines = svg('g', {});
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    const p = (r: number, off: number) => `${(Math.cos(a + off) * r).toFixed(1)} ${(Math.sin(a + off) * r).toFixed(1)}`;
    const delay = `${(i * 0.18).toFixed(2)}s`;
    const end = [Math.cos(a - 0.15) * 54, Math.sin(a - 0.15) * 54];
    vines.append(
      svg('path', { class: 'bt-vine', pathLength: 1, d: `M ${p(14, 0)} C ${p(30, 0.7)} ${p(40, -0.6)} ${p(54, -0.15)}`, stroke: 'url(#bt-vine)', 'stroke-width': 2, style: `--delay:${delay}` }),
      svg('path', { class: 'bt-vine', pathLength: 1, d: `M ${p(32, 0.25)} Q ${p(40, 0.55)} ${p(44, 0.42)}`, stroke: '#8ef07a', 'stroke-width': 1.2, style: `--delay:${delay}` }),
      svg('circle', { class: 'bt-bud', cx: end[0]!, cy: end[1]!, r: 3.2, fill: COLORS[i % COLORS.length]!, style: `--delay:${delay}` }),
    );
  }
  root.append(vines);

  const seed = svg('g', { class: 'bt-seed' });
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return `${(Math.cos(a) * 15).toFixed(1)},${(Math.sin(a) * 15).toFixed(1)}`;
  }).join(' ');
  seed.append(
    svg('circle', { r: 26, fill: 'url(#bt-glow)', opacity: 0.55 }),
    svg('polygon', { points: hex, fill: '#0b2a2e', stroke: '#5ff2da', 'stroke-width': 1.5 }),
    svg('path', { d: 'M 0 8 C -7 2 -6 -6 0 -10 C 6 -6 7 2 0 8 Z M 0 8 L 0 -6', fill: '#8ef07a', stroke: '#d9fff6', 'stroke-width': 0.8 }),
  );
  root.append(seed);
  return root;
}

export interface BootScreen {
  /** Logs a stage and advances the progress bar (0..1). Yields a frame so the DOM paints. */
  stage(label: string, progress: number): Promise<void>;
  /** Plays the reveal and removes the screen. */
  finish(onReveal?: () => void): Promise<void>;
  fail(message: string): void;
}

/** Futuristic boot sequence: animated emblem, pollen, a boot log with real stages, and an iris reveal. */
export function createBootScreen(el: HTMLElement, subtitle: string): BootScreen {
  el.replaceChildren();
  const pollen = document.createElement('div');
  pollen.className = 'bt-pollen';
  for (let i = 0; i < 32; i++) {
    const s = document.createElement('span');
    s.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;--s:${(2 + Math.random() * 4).toFixed(1)}px;--d:${(7 + Math.random() * 9).toFixed(1)}s;--delay:${(-Math.random() * 12).toFixed(1)}s;--drift:${((Math.random() - 0.5) * 120).toFixed(0)}px;--col:${COLORS[i % COLORS.length]}`;
    pollen.append(s);
  }

  const core = document.createElement('div');
  core.className = 'bt-core';
  const title = document.createElement('h1');
  title.className = 'bt-title';
  [...'BLOOMGRID'].forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.setProperty('--i', String(i));
    title.append(s);
  });
  const sub = document.createElement('div');
  sub.className = 'bt-sub';
  sub.textContent = subtitle;
  const bar = document.createElement('div');
  bar.className = 'bt-bar';
  bar.append(document.createElement('i'));
  const meta = document.createElement('div');
  meta.className = 'bt-meta';
  const stageEl = document.createElement('span');
  stageEl.className = 'bt-stage';
  const pct = document.createElement('span');
  meta.append(stageEl, pct);
  const log = document.createElement('ol');
  log.className = 'bt-log';
  core.append(emblem(), title, sub, bar, meta, log);

  const grid = document.createElement('div');
  grid.className = 'bt-grid';
  const scan = document.createElement('div');
  scan.className = 'bt-scan';
  el.append(grid, pollen, core, scan);

  let last: HTMLLIElement | null = null;
  const t0 = performance.now();
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const line = (label: string, status: string, cls = '') => {
    const li = document.createElement('li');
    li.className = cls;
    const name = document.createElement('span');
    name.textContent = `› ${label.toUpperCase()}`;
    const dots = document.createElement('span');
    dots.className = 'dots';
    const ok = document.createElement('span');
    ok.className = 'ok';
    ok.textContent = status;
    li.append(name, dots, ok);
    log.append(li);
    while (log.children.length > 5) log.firstChild!.remove();
    return li;
  };

  return {
    async stage(label, progress) {
      if (last) last.querySelector('.ok')!.textContent = 'ONLINE';
      last = line(label, '···');
      stageEl.textContent = label;
      pct.textContent = `${Math.round(progress * 100)}%`;
      bar.style.setProperty('--p', String(progress));
      await frame();
      await frame();
    },
    async finish(onReveal) {
      if (last) last.querySelector('.ok')!.textContent = 'ONLINE';
      line('City systems', 'ALL GREEN');
      stageEl.textContent = 'Welcome, Steward';
      pct.textContent = '100%';
      bar.style.setProperty('--p', '1');
      // Let the emblem breathe for a moment on very fast loads.
      const minShow = 1800 - (performance.now() - t0);
      if (minShow > 0) await new Promise((r) => setTimeout(r, minShow));
      onReveal?.();
      el.classList.add('bt-reveal');
      await new Promise((r) => setTimeout(r, 1800));
      el.classList.add('bt-gone');
    },
    fail(message) {
      if (last) {
        last.classList.add('err');
        last.querySelector('.ok')!.textContent = 'FAILED';
      }
      stageEl.textContent = 'Boot failed';
      line(message.slice(0, 60), 'ERR', 'err');
    },
  };
}
