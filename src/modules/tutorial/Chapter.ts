import { SHOWCASE_SEED } from '@/game/start';
import type { SaveInfo } from '@/game/SaveManager';
import type { SaveData } from '@/sim/save';
import { DIFFICULTIES, type DifficultyId } from '@/sim/difficulty';
import { ago, h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { holoHead, rise } from '@/ui/holo';
import { MAP_COLORS, MAP_LINE, MAP_ROAD, drawIsland } from './islandMap';

export type ChapterPath = 'resume' | 'new' | 'showcase';
type Path = ChapterPath;

const PREFIX = ['Coral', 'Tide', 'Fern', 'Lumen', 'Moss', 'Saffron', 'Willow', 'Amber', 'Kelp', 'Lotus', 'Cedar', 'Opal', 'Heron', 'Mango'];
const SUFFIX = ['Haven', 'Reach', 'Hollow', 'Point', 'Cove', 'Isle', 'Bloom', 'Harbour', 'Vale', 'Strand', 'Landing', 'Bay'];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;
/** A city name to start from ("Kelp Harbour"); the player can type their own or roll again. */
const cityName = () => `${pick(PREFIX)} ${pick(SUFFIX)}`;

/** Where the guide's progress is kept ('done', 'skipped' or the step reached). */
export const TUTORIAL_KEY = 'bloomgrid.tutorial';

/** Tick "Show me how to play" unless the guide was finished or skipped. */
export function guideWanted(): boolean {
  try {
    return !['done', 'skipped'].includes(localStorage.getItem(TUTORIAL_KEY) ?? '');
  } catch {
    return true;
  }
}

const DIFF_ICONS: Record<DifficultyId, string> = { sandbox: 'leaf', relaxed: 'sun', steward: 'eco', hard: 'storm' };

export interface ChapterOptions {
  /** Where the dialog goes. */
  host: HTMLElement;
  /** The welcome screen's dialog (D-148): no Cancel, nothing on screen to replace yet. */
  first: boolean;
  /** The saved city's summary (null: nothing saved). */
  info: SaveInfo | null;
  /** The saved city itself (its map). */
  readSave(): Promise<SaveData | null | undefined>;
  /** Map edge in tiles. */
  size: number;
  /** Difficulty offered first. */
  difficulty: DifficultyId;
  /** Island seed offered for a new city. */
  seed: number;
  /** Tick "Show me how to play" (the guide was never finished or skipped). */
  guide: boolean;
  /** Loads the saved city; resolves false when it could not (the dialog stays, with a note). `close` drops the dialog. */
  resume(close: () => void): Promise<boolean>;
  found(name: string, seed: number, difficulty: DifficultyId, guide: boolean): void;
  showcase(): void;
  /** The dialog closed (any way). */
  onClose?(): void;
  /** The path or island on show changed (the welcome screen's island follows it). */
  onView?(path: Path, seed: number): void;
}

/** A saved city drawn as a map; loads the building registry lazily (the welcome chunk stays light, D-148). */
export async function drawSave(canvas: HTMLCanvasElement, data: SaveData | null | undefined, seed: number, size: number): Promise<void> {
  drawIsland(canvas, data?.seed ?? seed, size);
  if (!data) return;
  const { mapOfSave } = await import('./cityMap');
  drawIsland(canvas, data.seed ?? seed, size, mapOfSave(data));
}

/**
 * The New Chapter dialog (D-085): three ways in, one at a time. **Resume** the saved city (the default whenever
 * there is one: its name, day, residents, when it was saved and its island), **found a new island** (name with a
 * dice, difficulty as four tiles, the guide; the island seed sits under Advanced with a live map), or **browse the
 * showcase city**. One primary button acts on the chosen path; Enter presses it, Esc cancels when it can.
 */
export function openChapter(o: ChapterOptions): { close(): void } {
  const info = o.info;
  let path: Path = info ? 'resume' : 'new';
  let difficulty: DifficultyId = o.difficulty;
  let seed = o.seed;
  const size = o.size;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    scrim.remove();
    o.onClose?.();
  };

  // ── Path cards ──
  const card = (id: Path, ico: string, title: string, line: string) =>
    h(
      'button',
      { class: 'ch-path', role: 'tab', 'data-path': id, onClick: () => choose(id) },
      h('span', { class: 'ch-path-ico' }, icon(ico)),
      h('b', {}, title),
      h('span', {}, line),
    );
  const paths = h(
    'div',
    { class: 'ch-paths', role: 'tablist' },
    card('resume', 'play', 'Resume', info?.name ? info.name : 'No saved city yet'),
    card('new', 'sparkle', 'New island', 'Start from a fishing hamlet'),
    card('showcase', 'city', 'Showcase', 'Browse a finished city'),
  );
  const resumeCard = paths.firstElementChild as HTMLButtonElement;
  if (!info) resumeCard.disabled = true;

  // ── Resume ──
  const resumeErr = h('p', { class: 'ch-note ch-err', role: 'alert' });
  const savedMap = h('canvas', { class: 'ch-map' }) as HTMLCanvasElement;
  const resume = h(
    'div',
    { class: 'ch-pane p-resume' },
    h('div', { class: 'ch-mapbox' }, h('div', { class: 'ch-mapwrap' }, savedMap, h('span', { class: 'ch-map-cap' }, info?.seed ? `Island #${info.seed}` : 'Your island')), legend(false)),
    h(
      'div',
      { class: 'ch-detail' },
      h('div', { class: 'ch-kicker' }, 'Saved city'),
      h('div', { class: 'ch-name' }, info?.name || 'Your city'),
      h(
        'div',
        { class: 'ch-facts' },
        info?.day ? fact('sun', 'Day', String(info.day)) : null,
        info?.day ? fact('people', 'Residents', Math.round(info.residents).toLocaleString()) : null,
        info?.difficulty && info.difficulty in DIFFICULTIES ? fact('eco', 'Difficulty', DIFFICULTIES[info.difficulty as DifficultyId].label) : null,
        info?.at ? fact('save', 'Saved', ago(info.at)) : null,
      ),
      h('p', { class: 'ch-note' }, o.first ? 'Pick up where you left off.' : 'Replaces the city on screen with your saved one.'),
      resumeErr,
    ),
  );

  // ── New island ──
  const nameInput = h('input', { class: 'ch-input', value: cityName(), maxlength: '32', 'aria-label': 'City name', spellcheck: 'false' }) as HTMLInputElement;
  const diffs = h(
    'div',
    { class: 'ch-diffs', role: 'radiogroup', 'aria-label': 'Difficulty' },
    ...(Object.values(DIFFICULTIES) as (typeof DIFFICULTIES)[DifficultyId][]).map((d) =>
      h(
        'button',
        { class: 'ch-diff', role: 'radio', 'data-diff': d.id, title: d.description, onClick: () => setDifficulty(d.id) },
        icon(DIFF_ICONS[d.id]),
        h('b', {}, d.label),
        h('span', {}, d.description),
      ),
    ),
  );
  const guide = h('input', { type: 'checkbox' }) as HTMLInputElement;
  guide.checked = o.guide;
  const newMap = h('canvas', { class: 'ch-map' }) as HTMLCanvasElement;
  const seedInput = h('input', { type: 'number', class: 'ch-seed', value: String(seed), min: '1', 'aria-label': 'Island seed' }) as HTMLInputElement;
  const seedLabel = h('span', { class: 'ch-map-cap' });
  const paintNew = () => {
    setText(seedLabel, `Island #${seed} · unclaimed`);
    drawIsland(newMap, seed, size);
    if (path === 'new') o.onView?.('new', seed);
  };
  seedInput.addEventListener('change', () => {
    seed = Math.max(1, Math.floor(Number(seedInput.value)) || 1);
    seedInput.value = String(seed);
    paintNew();
  });
  const fresh = h(
    'div',
    { class: 'ch-pane p-new' },
    h('div', { class: 'ch-mapbox' }, h('div', { class: 'ch-mapwrap' }, newMap, seedLabel)),
    h(
      'div',
      { class: 'ch-detail' },
      h(
        'label',
        { class: 'ch-field' },
        h('span', {}, 'City name'),
        h(
          'div',
          { class: 'ch-name-row' },
          nameInput,
          h('button', { class: 'ch-dice', title: 'Another name', 'aria-label': 'Another name', onClick: () => ((nameInput.value = cityName()), nameInput.focus()) }, icon('rotate')),
        ),
      ),
      h('div', { class: 'ch-field' }, h('span', {}, 'How hard the world pushes back'), diffs),
      h('label', { class: 'ch-check' }, guide, h('span', {}, 'Show me how to play (a six-step guide, skippable)')),
      h(
        'details',
        { class: 'ch-adv' },
        h('summary', {}, 'Advanced'),
        h(
          'div',
          { class: 'ch-adv-body' },
          h('label', { class: 'ch-field' }, h('span', {}, 'Island seed'), seedInput),
          h(
            'button',
            { class: 'btn ghost', onClick: () => ((seed = Math.floor(Math.random() * 1e6) + 1), (seedInput.value = String(seed)), paintNew()) },
            'Roll',
          ),
          h('p', { class: 'ch-note' }, 'Varies the coastline, hills and when storms come. Same seed, same island: share it to replay one.'),
        ),
      ),
    ),
  );

  // ── Showcase ──
  // A rendered overview of the real showcase (scripts/scenes/showcase-shot.js); the bare island if it is missing.
  const showMap = h('img', { class: 'ch-map', alt: 'The showcase city seen from above', src: '/assets/showcase-overview.webp', draggable: 'false' }) as HTMLImageElement;
  showMap.addEventListener('error', () => {
    const c = h('canvas', { class: 'ch-map' }) as HTMLCanvasElement;
    drawIsland(c, SHOWCASE_SEED, size);
    showMap.replaceWith(c);
  });
  const showcase = h(
    'div',
    { class: 'ch-pane p-showcase' },
    h('div', { class: 'ch-mapbox' }, h('div', { class: 'ch-mapwrap' }, showMap, h('span', { class: 'ch-map-cap' }, 'The founding city'))),
    h(
      'div',
      { class: 'ch-detail' },
      h('div', { class: 'ch-kicker' }, 'The founding city'),
      h('div', { class: 'ch-name' }, 'A city in full bloom'),
      h(
        'ul',
        { class: 'ch-list' },
        h('li', {}, icon('city'), 'About 2,000 buildings and 25,000 residents across named towns'),
        h('li', {}, icon('train'), 'The Aeroline maglev, sky-lane pods and Flora, all unlocked'),
        h('li', {}, icon('sparkle'), 'The Aurora Gemini twin towers, Bloomtopia park, a wind farm and sea wonders'),
        h('li', {}, icon('eye'), 'Explore it on foot, by drone or by train, or run it as its steward'),
      ),
      h('p', { class: 'ch-note' }, o.first ? 'Your saved city stays saved.' : 'Replaces the city on screen.'),
    ),
  );

  // ── Footer ──
  const go = h('button', { class: 'btn primary ch-go', onClick: () => act() }) as HTMLButtonElement;
  const foot = h(
    'div',
    { class: 'ch-foot' },
    o.first ? h('span') : h('button', { class: 'btn ghost', onClick: close }, 'Cancel'),
    h('span', { class: 'ch-enter' }, h('kbd', {}, 'Enter')),
    go,
  );

  const panes: Record<Path, HTMLElement> = { resume, new: fresh, showcase };
  const scrim = h(
    'div',
    { class: o.first ? 'modal-scrim ch-scrim ch-welcome' : 'modal-scrim ch-scrim' },
    h(
      'section',
      { class: 'modal ch panel holo', role: 'dialog', 'aria-label': 'New chapter' },
      holoHead(
        icon('sparkle'),
        'Steward console · new chapter',
        info ? 'Welcome back, steward' : 'Welcome, steward',
        info ? 'Resume your city, found a new island, or wander the showcase.' : 'Grow a solarpunk island from a fishing hamlet, or wander a finished city first.',
      ),
      paths,
      // All panes share one cell, so the dialog keeps the tallest one's height and never jumps between paths.
      h('div', { class: 'ch-stage' }, resume, fresh, showcase),
      foot,
    ),
  );

  function setDifficulty(id: DifficultyId): void {
    difficulty = id;
    for (const b of diffs.children) {
      const on = (b as HTMLElement).dataset.diff === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  }

  function choose(p: Path): void {
    path = p;
    for (const b of paths.children) {
      const on = (b as HTMLElement).dataset.path === p;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    for (const [k, el] of Object.entries(panes)) el.classList.toggle('on', k === p);
    go.replaceChildren(
      icon(p === 'resume' ? 'play' : p === 'new' ? 'sparkle' : 'city'),
      p === 'resume' ? `Resume ${info?.name || 'my city'}` : p === 'new' ? 'Found the city' : 'Open the showcase',
    );
    if (p === 'new' && !o.first) setTimeout(() => nameInput.focus(), 30);
    o.onView?.(p, p === 'resume' ? (info?.seed ?? SHOWCASE_SEED) : p === 'new' ? seed : SHOWCASE_SEED);
  }

  function act(): void {
    if (path === 'resume') {
      go.disabled = true;
      setText(resumeErr, '');
      void o
        .resume(close)
        .catch(() => false)
        .then((ok) => {
          go.disabled = false;
          if (!ok) setText(resumeErr, 'The saved city could not be loaded.');
        });
    } else if (path === 'new') {
      close();
      o.found(nameInput.value.trim() || cityName(), seed, difficulty, guide.checked);
    } else {
      close();
      o.showcase();
    }
  }

  // Captured first, so the city's hotkeys never see keys typed here.
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLElement && e.target.tagName === 'SUMMARY')) {
      e.preventDefault();
      act();
    } else if (e.key === 'Escape' && !o.first) {
      e.preventDefault();
      close();
    } else return;
    e.stopPropagation();
  }
  window.addEventListener('keydown', onKey, true);

  setDifficulty(difficulty);
  choose(path);
  rise(paths.children);
  o.host.append(scrim);
  // Maps after the dialog is up (≈15k height samples each).
  setTimeout(() => {
    if (closed) return;
    paintNew();
    // The saved city itself, read from its save (it is not loaded).
    if (info)
      void o
        .readSave()
        .then((data) => drawSave(savedMap, data, info.seed ?? SHOWCASE_SEED, size))
        .catch(() => drawIsland(savedMap, info.seed ?? SHOWCASE_SEED, size));
  }, 60);
  return { close };
}

/** What the colours on a city map mean. */
function legend(line: boolean): HTMLElement {
  const item = (color: string, label: string, cls = '') => h('span', { class: `ch-key ${cls}` }, h('i', { style: `background:${color}` }), label);
  return h(
    'div',
    { class: 'ch-legend' },
    item(MAP_COLORS.residential, 'Homes'),
    item(MAP_COLORS.commercial, 'Work'),
    item(MAP_COLORS.nature, 'Nature'),
    item(MAP_COLORS.energy, 'Power'),
    item(MAP_ROAD, 'Highways', 'road'),
    line ? item(MAP_LINE, 'Aeroline', 'road') : null,
  );
}

function fact(ico: string, label: string, value: string): HTMLElement {
  return h('div', { class: 'ch-fact' }, icon(ico), h('b', {}, value), h('span', {}, label));
}
