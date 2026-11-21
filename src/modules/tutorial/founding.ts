import type { GameContext } from '@/game/context';
import type { JuiceSound } from '@/modules/juice';
import { DIFFICULTIES } from '@/sim/difficulty';
import { h } from '@/ui/dom';
import type { FilmBed, FilmHit } from '@/modules/moments/score';
import { drawIsland } from './islandMap';
import { mapOfCity } from './cityMap';
import './founding.css';

/**
 * "First Light" (D-183): the film that plays when a fresh island is founded. About twenty seconds, illustrated in
 * DOM / SVG / CSS over the paused city, and cast from the city itself:
 *
 * 1. Night sea, letterboxed; under it, an older city sleeps. Ama Reyes lights the Tidewatch Lighthouse on its rock
 *    (canon: `docs/lore/bible.md` Part VI), and a lantern-lit boat follows the light in from the left.
 * 2. Dawn breaks, the mist parts and the island rises: its real silhouette (the terrain's skyline seen from the
 *    south, `profile`), with Halcyon's drowned columns standing in the bay.
 * 3. A seed of light arcs from the lantern onto the hills; green sweeps out from where it lands, trees pop up, and
 *    a door in the hillside lights: the Seedvault wakes.
 * 4. The founding hamlet rises: one shape per real building, at its real place along the island, windows lighting.
 * 5. A hologram scan unfolds the island's real map with the hamlet on it: the old grid is back on.
 * 6. The city's name drops in, "Founded · Day 1", chosen by the Island Compact, petals fall, and **Begin** ends it.
 *
 * Skip with the button or Esc; replayable from Build → Goals → Replays and the gallery (a film, D-181). The city's
 * name only ever reaches the DOM as text; the SVG is built from numbers. A founding plays it `instant` (D-184): it
 * opens on black over the loading screen, so no frame of the city shows before it.
 */

let current: { skip(): void } | null = null;
let keysBound = false;

/**
 * The film's clock (scenes): while `held`, the timeline waits where it is, so a script can pause the CSS too
 * (`document.getAnimations()`) and capture an exact moment.
 */
export const filmClock = { held: false };

export interface FilmOptions {
  /** Open on black at once, without fading in (over a loading screen, D-184). */
  instant?: boolean;
  /** Runs as the film starts to fade out (the camera can start its fly-in under it). */
  leaving?: () => void;
}

/** The island's skyline from the south: per column, the highest ground across it (world units), cropped to land. */
function profile(ctx: GameContext, cols = 220): { hs: number[]; x0: number; x1: number; max: number } {
  const g = ctx.city.grid;
  const size = ctx.city.size;
  const raw: number[] = [];
  for (let i = 0; i < cols; i++) {
    const x = ((i + 0.5) / cols) * size;
    let m = -Infinity;
    for (let k = 0; k < 96; k++) m = Math.max(m, g.heightAt(x, ((k + 0.5) / 96) * size));
    raw.push(m);
  }
  let a = raw.findIndex((v) => v > 0.2);
  let b = cols - 1 - [...raw].reverse().findIndex((v) => v > 0.2);
  if (a < 0) [a, b] = [0, cols - 1];
  // A little sea either side.
  const pad = Math.max(3, Math.round((b - a) * 0.06));
  a = Math.max(0, a - pad);
  b = Math.min(cols - 1, b + pad);
  const hs = raw.slice(a, b + 1);
  return { hs, x0: (a / cols) * size, x1: ((b + 1) / cols) * size, max: Math.max(4, ...hs) };
}

/** The scene's SVG (1000 × 300; the sea line at y = 250): land, the green that sweeps over it, trees, the hamlet. */
function islandSvg(ctx: GameContext): { svg: string; seedX: number; seedY: number; hamletX: number } {
  const { hs, x0, x1, max } = profile(ctx);
  const SEA = 250;
  const LIFT = 165;
  const n = hs.length;
  const px = (i: number) => (i / (n - 1)) * 1000;
  const py = (v: number) => SEA - (Math.max(-1, v) / max) * LIFT;
  // A softened outline (neighbour average) so the terrain's steps read as hills.
  const smooth = hs.map((_, i) => (hs[Math.max(0, i - 1)]! + 2 * hs[i]! + hs[Math.min(n - 1, i + 1)]!) / 4);
  let d = `M0 ${SEA + 40} L0 ${py(smooth[0]!).toFixed(1)}`;
  for (let i = 1; i < n; i++) d += ` L${px(i).toFixed(1)} ${py(smooth[i]!).toFixed(1)}`;
  d += ` L1000 ${SEA + 40} Z`;
  const xOf = (wx: number) => ((wx - x0) / (x1 - x0)) * 1000;

  const { city } = ctx;
  const es = city.buildingEntities();
  // The seed lands on the highest ground near the hamlet's middle (or the island's).
  const mid = es.length ? es.reduce((a, e) => a + city.buildingRecord(e).x, 0) / es.length : (x0 + x1) / 2;
  let best = Math.round(((mid - x0) / (x1 - x0)) * (n - 1));
  for (let i = Math.max(0, best - 12); i < Math.min(n, best + 12); i++) if (smooth[i]! > smooth[best]!) best = i;
  const seedX = px(best);
  const seedY = py(smooth[best]!);
  const hamletX = xOf(mid);

  // Trees along the ridge (deterministic from the column), skipping the shore. Each pops up as the green wave
  // reaches it (`--t`: its distance from the seed at the wave's pace, `.ftl-green`).
  let trees = '';
  for (let i = 2; i < n - 2; i += 2) {
    const v = smooth[i]!;
    if (v < 0.8) continue;
    const x = px(i) + ((i * 37) % 9) - 4;
    const y = py(v) + 2;
    const r = 5 + ((i * 13) % 5);
    const t = 0.15 + (3.2 * Math.abs(x - seedX)) / 1000;
    trees += `<g class="ftl-tree" style="--t:${t.toFixed(2)}s"><rect x="${(x - 1).toFixed(1)}" y="${(y - r).toFixed(1)}" width="2" height="${r}"/><circle cx="${x.toFixed(1)}" cy="${(y - r - r * 0.55).toFixed(1)}" r="${(r * 0.85).toFixed(1)}"/></g>`;
  }

  // The hamlet: each building at its own place along the island and its own ground height (in front of the hills
  // behind it: a fishing hamlet stands by the water, not on the skyline), shaped by what it is.
  let homes = '';
  es.forEach((e, j) => {
    const r = city.buildingRecord(e);
    const def = city.buildingDef(e);
    const [w, dz] = city.footprint(def, r.rot);
    const wx = r.x + w / 2;
    if (wx < x0 || wx > x1) return;
    const x = xOf(wx);
    const y = Math.min(SEA + 2, py(city.grid.heightAt(wx, r.z + dz / 2))) + 3;
    const s = `style="--i:${j}"`;
    const f = (v: number) => v.toFixed(1);
    // Drawn larger than the island's scale, around its own foot, so the hamlet reads.
    const big = (inner: string) => `<g transform="translate(${f(x)} ${f(y)}) scale(1.6) translate(${f(-x)} ${f(-y)})">${inner}</g>`;
    if (def.fishing)
      // A fishing dock: a jetty over the water with a little boat tied up.
      homes += `<g class="ftl-home" ${s}>${big(`<rect x="${f(x - 7)}" y="${f(y - 8)}" width="10" height="8" rx="1"/><path class="ftl-roof" d="M${f(x - 8.5)} ${f(y - 8)} L${f(x - 2)} ${f(y - 12)} L${f(x + 4.5)} ${f(y - 8)}Z"/><rect class="ftl-pier" x="${f(x + 3)}" y="${f(y - 2)}" width="14" height="1.6"/><path class="ftl-dinghy" d="M${f(x + 9)} ${f(y + 1)}h7l-1.5 2.4h-4z"/><rect class="ftl-lit" x="${f(x - 4)}" y="${f(y - 6)}" width="3" height="3"/>`)}</g>`;
    else if (def.category === 'energy')
      // A solar spire: a slim mast under a fan of three solar petals.
      homes += `<g class="ftl-home tall" ${s}>${big(`<rect x="${f(x - 1.5)}" y="${f(y - 40)}" width="3" height="40"/><g class="ftl-fan"><ellipse class="ftl-petal" cx="${f(x)}" cy="${f(y - 46)}" rx="3.2" ry="8"/><ellipse class="ftl-petal" cx="${f(x - 5)}" cy="${f(y - 42)}" rx="3" ry="7" transform="rotate(-50 ${f(x - 5)} ${f(y - 42)})"/><ellipse class="ftl-petal" cx="${f(x + 5)}" cy="${f(y - 42)}" rx="3" ry="7" transform="rotate(50 ${f(x + 5)} ${f(y - 42)})"/></g><circle class="ftl-lit" cx="${f(x)}" cy="${f(y - 40)}" r="2.2"/>`)}</g>`;
    else if (def.category === 'food' || def.category === 'utility')
      homes += `<g class="ftl-home" ${s}>${big(`<rect x="${(x - 9).toFixed(1)}" y="${(y - 9).toFixed(1)}" width="18" height="9" rx="1.5"/><rect class="ftl-lit" x="${(x - 5).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="3" height="3"/><rect class="ftl-lit" x="${(x + 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="3" height="3"/>`)}</g>`;
    else {
      const tall = 12 + ((j * 7) % 3) * 5;
      homes += `<g class="ftl-home" ${s}>${big(`<rect x="${(x - 6).toFixed(1)}" y="${(y - tall).toFixed(1)}" width="12" height="${tall}" rx="1"/><path class="ftl-roof" d="M${(x - 8).toFixed(1)} ${(y - tall).toFixed(1)} L${x.toFixed(1)} ${(y - tall - 6).toFixed(1)} L${(x + 8).toFixed(1)} ${(y - tall).toFixed(1)}Z"/><rect class="ftl-lit" x="${(x - 3).toFixed(1)}" y="${(y - tall + 4).toFixed(1)}" width="2.5" height="3"/><rect class="ftl-lit" x="${(x + 1).toFixed(1)}" y="${(y - tall + 4).toFixed(1)}" width="2.5" height="3"/>`)}</g>`;
    }
  });


  const svg =
    `<svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true">` +
    `<defs><clipPath id="ftl-land"><path d="${d}"/></clipPath></defs>` +
    `<path class="ftl-land" d="${d}"/>` +
    `<g clip-path="url(#ftl-land)"><rect class="ftl-green" x="0" y="0" width="1000" height="300" style="--sx:${(seedX / 10).toFixed(1)}%;--sy:${((seedY / 300) * 100).toFixed(1)}%"/></g>` +
    `<g class="ftl-trees">${trees}</g><g class="ftl-hamlet">${homes}</g></svg>`;
  return { svg, seedX, seedY, hamletX };
}

/** Plays "First Light"; `done` runs when it has faded out (ended or skipped). */
export function playFounding(ctx: GameContext, done: () => void, opts: FilmOptions = {}): void {
  if (current) return void done();
  if (!keysBound) {
    keysBound = true;
    // While the film runs it owns the keyboard: Esc skips, nothing reaches the city.
    ctx.input.onKey((e) => {
      if (!current) return false;
      if (e.code === 'Escape') current.skip();
      return true;
    }, 1000);
  }
  const { city } = ctx;
  const name = city.growth.name || 'Your city';
  const speed = ctx.engine.speed;
  ctx.engine.speed = 0;
  const cue = (sound: JuiceSound) => ctx.bus.emit('juice', { sound });
  // The score (D-195): night surf and wind; a light, dawn's swell, the vault's voices; the city's music ducks under it.
  const bed = (b: FilmBed, level: number, fade?: number) => ctx.bus.emit('film:bed', { bed: b, level, fade });
  const hit = (h: FilmHit, delay?: number, dur?: number) => alive && ctx.bus.emit('film:hit', { hit: h, delay, dur });
  ctx.bus.emit('film:state', { on: true, key: 0 });
  let alive = true;
  // Waits `ms` of film time: the clock stands still while `filmClock.held`.
  const wait = async (ms: number) => {
    let left = ms;
    while (left > 0) {
      const step = Math.min(50, left);
      await new Promise((r) => setTimeout(r, step));
      if (!filmClock.held) left -= step;
    }
  };

  // ── The set ──
  const stars = h('div', { class: 'ftl-stars' });
  for (let i = 0; i < 90; i++)
    stars.append(
      h('i', {
        style: `left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 58).toFixed(1)}%;--d:${(Math.random() * 3).toFixed(2)}s;--z:${(0.5 + Math.random()).toFixed(2)}`,
      }),
    );
  const sky = h(
    'div',
    { class: 'ftl-sky' },
    h('div', { class: 'ftl-dawn' }),
    h('div', { class: 'ftl-noon' }),
    stars,
    h('div', { class: 'ftl-moon' }),
    h('div', { class: 'ftl-shoot' }),
    h('div', { class: 'ftl-sun' }),
    // The sun's path on the water.
    h('div', { class: 'ftl-glint' }),
  );
  const { svg, seedX, seedY, hamletX } = islandSvg(ctx);
  // The boat makes for the water in front of the hamlet; the seed leaves from its lantern.
  const bx = Math.min(80, Math.max(8, hamletX / 10 - 7));
  const island = h('div', { class: 'ftl-island', style: `--hx:${(hamletX / 10).toFixed(2)}` });
  island.innerHTML = svg;
  const mist = h('div', { class: 'ftl-mist' }, h('i', { class: 'm1' }), h('i', { class: 'm2' }), h('i', { class: 'm3' }));
  const sea = h('div', { class: 'ftl-sea' }, h('i', { class: 'w1' }), h('i', { class: 'w2' }), h('i', { class: 'w3' }));
  const boat = h('div', { class: 'ftl-boat' });
  boat.innerHTML = BOAT_SVG;
  const sail = h('div', { class: 'ftl-sail', style: `--bx:${bx.toFixed(2)}` }, h('i', { class: 'ftl-wake' }), boat);
  // Where the seed lands, in the island layer's own box (1000 × 300 drawn at its width, bottom-aligned); it leaves
  // from the lantern (`--fx`, `--fy`).
  const seed = h(
    'div',
    { class: 'ftl-seed', style: `--tx:${(seedX / 10).toFixed(2)};--ty:${((seedY / 300) * 100).toFixed(2)};--fx:${(bx - 0.9).toFixed(2)};--fy:86` },
    h('i', {}),
  );
  const ring = h('div', { class: 'ftl-ring', style: `left:${(seedX / 10).toFixed(2)}%;top:${((seedY / 300) * 100).toFixed(2)}%` });
  // The Seedvault's door, in the hillside under where the seed lands: it lights as the vault wakes.
  const vault = h('div', { class: 'ftl-vault', style: `left:${(seedX / 10).toFixed(2)}%;top:${((seedY / 300) * 100 + 3).toFixed(2)}%` });
  // Ama Reyes's light on the north rock, at the island's far end from the hamlet; Halcyon's columns in the bay
  // between it and the boat's course.
  const hx = hamletX / 10;
  const lx = hx < 50 ? 92 : 8;
  const light = h('div', { class: 'ftl-light', style: `left:${lx}%` }, h('i', { class: 'beam' }));
  light.insertAdjacentHTML('afterbegin', LIGHTHOUSE_SVG);
  const rx = hx < 50 ? Math.min(82, Math.max(hx + 22, 60)) : Math.max(18, Math.min(hx - 22, 40));
  const ruins = h('div', { class: 'ftl-ruins', style: `left:${rx.toFixed(1)}%` });
  ruins.innerHTML = RUINS_SVG;
  // One box in the SVG's own proportions: the boat, the sea and the seed share its coordinates.
  island.append(ruins, sea, light, sail, seed, ring, vault);
  const birds = h('div', { class: 'ftl-birds' }, ...Array.from({ length: 5 }, (_, i) => h('i', { style: `--i:${i}` })));

  // The hologram: the island's real map with the hamlet on it.
  const map = h('canvas', { class: 'ftl-map' }) as HTMLCanvasElement;
  drawIsland(map, city.seed, city.size, mapOfCity(city));
  // "You are here": the hamlet's middle on the map (the canvas fills the plate's inner 88%).
  const es = city.buildingEntities();
  const mean = (k: 'x' | 'z') => (es.length ? es.reduce((a, e) => a + city.buildingRecord(e)[k] + 1, 0) / es.length : city.size / 2) / city.size;
  const here = h('div', { class: 'ftl-here', style: `left:${(6 + 88 * mean('x')).toFixed(2)}%;top:${(6 + 88 * mean('z')).toFixed(2)}%` }, h('i', {}), h('b', {}, name));
  const holo = h(
    'div',
    { class: 'ftl-holo' },
    h('div', { class: 'ftl-scan' }),
    h(
      'div',
      { class: 'ftl-plate' },
      map,
      h('div', { class: 'ftl-grid' }),
      here,
      h('div', { class: 'ftl-tag' }, h('i', {}), `Island #${city.seed} · Seedvault grid online`),
    ),
  );

  const flash = h('div', { class: 'ftl-flash' });
  const petals = h('div', { class: 'ftl-petals' });
  const title = h('div', { class: 'ftl-title' });
  const cap = h('p', { class: 'ftl-cap' });
  const skip = h('button', { class: 'ftl-skip', onClick: () => finish() }, 'Skip ›');
  const root = h(
    'div',
    { class: 'ftl-root', role: 'dialog', 'aria-label': `Cutscene: the founding of ${name}` },
    // The art, as one layer: the finish drifts and grades it (D-188).
    h('div', { class: 'ftl-set' }, sky, birds, island, mist, holo),
    flash,
    title,
    petals,
    h('div', { class: 'ftl-bar top' }, skip),
    h('div', { class: 'ftl-bar bot' }, cap),
  );
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  ctx.services.tryGet('moments')?.finish(root, root.querySelector('.ftl-set')!, 'rgba(255, 190, 120, 0.18)');
  // Over a loading screen: black from the first frame (D-184).
  if (opts.instant) root.classList.add('instant', 'in');
  document.body.append(root);
  document.body.classList.add('cutscene-on');

  const say = (text: string) => {
    cap.classList.remove('show');
    void cap.offsetWidth;
    cap.textContent = text;
    cap.classList.add('show');
  };
  const on = (...cls: string[]) => root.classList.add(...cls);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    alive = false;
    current = null;
    root.classList.add('out');
    ctx.bus.emit('film:state', { on: false });
    ctx.engine.speed = speed;
    opts.leaving?.();
    setTimeout(() => {
      root.remove();
      document.body.classList.remove('cutscene-on');
      done();
    }, 700);
  };
  current = { skip: finish };

  const film = async () => {
    // 1. Night sea, and a boat.
    requestAnimationFrame(() => on('in'));
    cue('cs-night');
    bed('sea', 0.7, 2.5);
    bed('wind', 0.35, 2.5);
    bed('drone', 0.15, 3);
    await wait(700);
    if (!alive) return;
    say('Before the city, there was only the sea. Under it, an older city slept.');
    await wait(1900);
    if (!alive) return;
    on('beacon');
    cue('cs-blink');
    hit('shimmer', 0.1);
    hit('open', 0.2);
    say('Then a Drift fisher, Ama Reyes, lit a light on the north rock.');
    await wait(2000);
    if (!alive) return;
    on('sail');
    say('One boat, one lantern, a handful of fishers followed it home…');
    await wait(2300);
    if (!alive) return;

    // 2. Dawn, and the island.
    on('dawn');
    cue('cs-whoosh');
    bed('drone', 0, 2);
    bed('wind', 0.2, 2);
    hit('swell', 0.4, 3);
    hit('gulls', 2.2);
    say('…to an island no map had named.');
    await wait(1100);
    if (!alive) return;
    on('rise');
    ctx.bus.emit('moment', { id: 'founding', sound: 'wonder' });
    await wait(2300);
    if (!alive) return;

    // 3. The seed.
    on('seed');
    cue('cs-blink');
    say('A child planted the first seed.');
    await wait(1000);
    if (!alive) return;
    on('bloom');
    cue('cs-reveal');
    hit('thud', 0.5);
    hit('choir', 0.6, 2.4);
    say('Deep in the hill, something old felt it, and woke.');
    await wait(2000);
    if (!alive) return;

    // 4. The hamlet, in the golden morning (its lights show).
    on('homes');
    cue('day');
    say('Homes rose by the water, and the lights came on.');
    await wait(2400);
    if (!alive) return;

    // 5. Island OS, in full day.
    on('holo', 'noon');
    cue('ready');
    hit('shimmer', 0.2);
    say('The old grid hummed back to life, and it needed a steward.');
    await wait(2600);
    if (!alive) return;

    // 6. The name.
    on('named');
    flash.classList.add('go');
    const diff = DIFFICULTIES[city.steward.difficulty]?.label;
    // Letters drop one by one, but words stay whole (a long name wraps between words, and shrinks to fit).
    let li = 0;
    const words = name.split(/\s+/).filter(Boolean);
    const longest = Math.max(...words.map((w) => w.length), 4);
    title.replaceChildren(
      h('div', { class: 'ftl-kick' }, 'Founded · Day 1', diff ? ` · ${diff} difficulty` : ''),
      h(
        'div',
        { class: 'ftl-name', style: `--len:${longest};--all:${Math.max(10, name.length)}` },
        ...words.map((w) => h('span', { class: 'ftl-word' }, ...[...w].map((ch) => h('span', { style: `--i:${li++}` }, ch)))),
      ),
      h('p', { class: 'ftl-sub' }, 'The Island Compact chose you. Grow it gently, steward.'),
      h('button', { class: 'ftl-go', onClick: () => finish() }, 'Begin'),
    );
    title.classList.add('show');
    cue('cs-fanfare');
    hit('resolve', 0.3);
    say('');
    for (let i = 0; i < 40; i++)
      petals.append(
        h('i', {
          style: `left:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 2.2).toFixed(2)}s;--r:${(Math.random() * 540 - 270).toFixed(0)}deg;--s:${(0.6 + Math.random() * 0.8).toFixed(2)};--c:${PETALS[i % PETALS.length]};--sway:${(Math.random() * 16 - 8).toFixed(1)}vw`,
        }),
      );
    petals.classList.add('show');
    skip.classList.add('hidden');
    (title.querySelector('.ftl-go') as HTMLElement | null)?.focus({ preventScroll: true });
    await wait(14000);
    finish();
  };
  void film();
}

const PETALS = ['#ffd6e8', '#ffb3cf', '#fff3c4', '#c9f2d4', '#ffffff'];

/** The Tidewatch Lighthouse on its rock: coral-red and pearl-white bands, a gallery and the lamp (30 × 80). */
const LIGHTHOUSE_SVG = `<svg viewBox="0 0 30 80" aria-hidden="true">
<path class="rock" d="M0 80 Q2 66 9 64 Q15 60 22 64 Q29 67 30 80Z"/>
<path class="tower" d="M10 64 L12 18 H18 L20 64Z"/>
<path class="band" d="M10.6 50 H19.4 L19.7 57 H10.3Z M11.4 34 H18.6 L18.9 41 H11.1Z M11.9 22 H18.1 L18.3 27 H11.7Z"/>
<rect class="gallery" x="9.5" y="16" width="11" height="2.4"/>
<rect class="lantern" x="12" y="9" width="6" height="7"/>
<circle class="lamp" cx="15" cy="12.5" r="2.4"/>
<path class="cap" d="M11 9 L15 4 L19 9Z"/>
</svg>`;

/** Halcyon's drowned harbour: marble columns standing in the bay, one still bearing a lintel (80 × 30). */
const RUINS_SVG = `<svg viewBox="0 0 80 30" aria-hidden="true">
<rect x="4" y="10" width="6" height="20"/><rect x="2.5" y="8" width="9" height="2.6"/>
<rect x="18" y="4" width="6" height="26"/><rect x="30" y="4" width="6" height="26"/><path d="M15 1.4 H39 V4.4 H15Z"/>
<rect x="48" y="14" width="6" height="16"/><path d="M47 14 l3 -3 l3 2 l2 -1 v2z"/>
<rect x="66" y="19" width="6" height="11"/>
</svg>`;

/** A small sailing boat with a lantern, and the lantern's light on the water under it (60 × 44). */
const BOAT_SVG = `<svg viewBox="0 0 60 44" aria-hidden="true">
<ellipse class="lamp-water" cx="20" cy="47" rx="7" ry="2.2"/>
<path class="hull" d="M4 32h52l-7 9H12z"/>
<rect class="mast" x="29" y="4" width="2" height="28"/>
<path class="sail-a" d="M31 6l18 22H31z"/>
<path class="sail-b" d="M29 9L15 28h14z"/>
<circle class="lamp-glow" cx="20" cy="30" r="9"/>
<circle class="lamp" cx="20" cy="30" r="2.4"/>
</svg>`;
