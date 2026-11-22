import { SHOWCASE_SEED } from '@/game/start';
import type { SaveEntry } from '@/game/saves';
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
  /** Every saved island, most recently saved first (D-207). */
  saves: SaveEntry[];
  /** The running city's slot (in game): marked "On screen". */
  current?: string | null;
  /** The path shown first (default Resume when there is a save). */
  path?: ChapterPath;
  /** A saved island itself (its map). */
  readSave(slot: string): Promise<SaveData | null | undefined>;
  /** Deletes a saved island. */
  remove(slot: string): Promise<void>;
  /** Map edge in tiles. */
  size: number;
  /** Difficulty offered first. */
  difficulty: DifficultyId;
  /** Island seed offered for a new city. */
  seed: number;
  /** Tick "Show me how to play" (the guide was never finished or skipped). */
  guide: boolean;
  /** Loads a saved island; resolves false when it could not (the dialog stays, with a note). `close` drops the dialog. */
  resume(slot: string, close: () => void): Promise<boolean>;
  found(name: string, seed: number, difficulty: DifficultyId, guide: boolean): void;
  /** Opens the founding city, as free play (`founding-city`) or as one of its `CHALLENGES`. */
  showcase(scenario: string): void;
  /** The dialog closed (any way). */
  onClose?(): void;
  /** The path or island on show changed (the welcome screen's island follows it). */
  onView?(path: Path, seed: number, slot?: string): void;
}

/**
 * The founding city's challenge scenarios (plan v5, Phase 28; `content/scenarios/*.ts` with a `challenge`). Listed
 * here, not read from content, so the welcome chunk stays light (D-148).
 */
export const CHALLENGES = [
  { id: 'founding-city', icon: 'city', name: 'Free play', line: 'Explore it, or run it as its steward' },
  { id: 'water-crisis', icon: 'water', name: 'Water Crisis Rescue', line: 'Water works shut: Stable again within 20 min' },
  { id: 'debt-island', icon: 'credits', name: 'Debt Island', line: 'Repay ◈30,000, no system below Strained' },
] as const;

/** A saved city drawn as a map; loads the building registry lazily (the welcome chunk stays light, D-148). */
export async function drawSave(canvas: HTMLCanvasElement, data: SaveData | null | undefined, seed: number, size: number): Promise<void> {
  drawIsland(canvas, data?.seed ?? seed, size);
  if (!data) return;
  const { mapOfSave } = await import('./cityMap');
  drawIsland(canvas, data.seed ?? seed, size, mapOfSave(data));
}

/**
 * The New Chapter dialog (D-085): three ways in, one at a time. **Resume** a saved island (the default whenever
 * there is one: every saved island listed with its day, residents and when it was saved, the picked one's map;
 * each can be deleted with a second press, D-207), **found a new island** (name with a
 * dice, difficulty as four tiles, the guide; the island seed sits under Advanced with a live map), or **browse the
 * showcase city**. One primary button acts on the chosen path; Enter presses it, Esc cancels when it can.
 */
export function openChapter(o: ChapterOptions): { close(): void } {
  const saves = [...o.saves];
  let picked: SaveEntry | null = saves[0] ?? null;
  const any = saves.length > 0;
  let path: Path = o.path === 'resume' && !any ? 'new' : (o.path ?? (any ? 'resume' : 'new'));
  let mode: string = CHALLENGES[0].id;
  let difficulty: DifficultyId = o.difficulty;
  let seed = o.seed;
  const size = o.size;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    window.clearTimeout(armed);
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
    card('resume', 'play', 'Resume', resumeLine()),
    card('new', 'sparkle', 'New island', 'Start from a fishing hamlet'),
    card('showcase', 'city', 'Showcase', 'Browse a finished city'),
  );
  const resumeCard = paths.firstElementChild as HTMLButtonElement;
  resumeCard.disabled = !any;
  function resumeLine(): string {
    if (!saves.length) return 'No saved island yet';
    return saves.length === 1 ? saves[0]!.name || 'Your city' : `${saves.length} saved islands`;
  }

  // ── Resume: every saved island (D-207), one picked; each can be deleted (two presses) ──
  const resumeErr = h('p', { class: 'ch-note ch-err', role: 'alert' });
  const savedMap = h('canvas', { class: 'ch-map' }) as HTMLCanvasElement;
  const mapCap = h('span', { class: 'ch-map-cap' });
  const kicker = h('div', { class: 'ch-kicker' });
  const list = h('div', { class: 'ch-saves', role: 'listbox', 'aria-label': 'Saved islands' });
  /** The row whose delete button is armed (a second press within 4 s deletes). */
  let armedSlot: string | null = null;
  let armed = 0;
  const disarm = () => {
    window.clearTimeout(armed);
    armed = 0;
    armedSlot = null;
    for (const b of list.querySelectorAll<HTMLElement>('.ch-del.warn')) {
      b.classList.remove('warn');
      b.replaceChildren(icon('trash'));
    }
  };
  const line = (e: SaveEntry) =>
    [
      e.day ? `Day ${e.day}` : '',
      e.day ? `${Math.round(e.residents).toLocaleString()} residents` : '',
      e.difficulty && e.difficulty in DIFFICULTIES ? DIFFICULTIES[e.difficulty as DifficultyId].label : '',
      e.at ? ago(e.at) : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'Saved island';
  const drawList = () => {
    setText(kicker, saves.length === 1 ? 'Saved island' : `Saved islands · ${saves.length}`);
    list.replaceChildren(
      ...saves.map((e) => {
        const del = h('button', { class: 'ch-del', title: `Delete ${e.name || 'this island'}`, 'aria-label': `Delete ${e.name || 'this island'}` }, icon('trash'));
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (armedSlot !== e.slot) {
            disarm();
            armedSlot = e.slot;
            del.classList.add('warn');
            del.replaceChildren(h('span', {}, 'Delete?'));
            armed = window.setTimeout(disarm, 4000);
            return;
          }
          disarm();
          del.disabled = true;
          void o
            .remove(e.slot)
            .then(() => {
              saves.splice(saves.indexOf(e), 1);
              if (picked === e) picked = saves[0] ?? null;
              setText(resumeCard.querySelector('span:last-child')!, resumeLine());
              resumeCard.disabled = !saves.length;
              if (!saves.length) return choose('new');
              drawList();
              pick(picked!);
            })
            .catch(() => ((del.disabled = false), setText(resumeErr, 'That island could not be deleted.')));
        });
        const here = e.slot === o.current;
        return h(
          'div',
          { class: 'ch-save', role: 'option', 'data-slot': e.slot, tabindex: '0', onClick: () => pick(e) },
          h('span', { class: 'ch-save-ico' }, icon('city')),
          h('b', {}, e.name || 'Your city', here ? h('em', {}, 'On screen') : null),
          h('span', {}, line(e)),
          del,
        );
      }),
    );
  };
  const mapToken = { n: 0 };
  function pick(e: SaveEntry): void {
    picked = e;
    setText(resumeErr, '');
    for (const r of list.children) {
      const on = (r as HTMLElement).dataset.slot === e.slot;
      r.classList.toggle('on', on);
      r.setAttribute('aria-selected', String(on));
    }
    setText(mapCap, e.seed ? `Island #${e.seed}` : 'Your island');
    const n = ++mapToken.n;
    drawIsland(savedMap, e.seed ?? SHOWCASE_SEED, size);
    void o
      .readSave(e.slot)
      .then((data) => (n === mapToken.n ? drawSave(savedMap, data, e.seed ?? SHOWCASE_SEED, size) : undefined))
      .catch(() => undefined);
    if (path === 'resume') {
      setGo();
      o.onView?.('resume', e.seed ?? SHOWCASE_SEED, e.slot);
    }
  }
  const resume = h(
    'div',
    { class: 'ch-pane p-resume' },
    h('div', { class: 'ch-mapbox' }, h('div', { class: 'ch-mapwrap' }, savedMap, mapCap), legend(false)),
    h(
      'div',
      { class: 'ch-detail' },
      kicker,
      list,
      h('p', { class: 'ch-note' }, o.first ? 'Pick up where you left off.' : 'Replaces the city on screen with the saved one.'),
      resumeErr,
    ),
  );
  drawList();

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

  // ── Showcase ── free play or a challenge (plan v5, Phase 28).
  const modes = h(
    'div',
    { class: 'ch-diffs ch-modes', role: 'radiogroup', 'aria-label': 'How to play it' },
    ...CHALLENGES.map((c) =>
      h('button', { class: 'ch-diff', role: 'radio', 'data-mode': c.id, onClick: () => setMode(c.id) }, icon(c.icon), h('b', {}, c.name), h('span', {}, c.line)),
    ),
  );
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
        h('li', {}, icon('city'), 'About 2,500 buildings and 50,000 residents across named towns'),
        h('li', {}, icon('train'), 'The Aeroline, sky-lane pods, Flora and sea wonders, all unlocked'),
      ),
      modes,
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
        any ? 'Welcome back, steward' : 'Welcome, steward',
        any ? 'Resume a saved island, found a new one, or wander the showcase.' : 'Grow a solarpunk island from a fishing hamlet, or wander a finished city first.',
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

  function setMode(id: string): void {
    mode = id;
    for (const b of modes.children) {
      const on = (b as HTMLElement).dataset.mode === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    if (path === 'showcase') choose('showcase');
  }

  function choose(p: Path): void {
    path = p;
    for (const b of paths.children) {
      const on = (b as HTMLElement).dataset.path === p;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    for (const [k, el] of Object.entries(panes)) el.classList.toggle('on', k === p);
    setGo();
    if (p === 'new' && !o.first) setTimeout(() => nameInput.focus(), 30);
    o.onView?.(p, p === 'resume' ? (picked?.seed ?? SHOWCASE_SEED) : p === 'new' ? seed : SHOWCASE_SEED, p === 'resume' ? picked?.slot : undefined);
  }

  function setGo(): void {
    const p = path;
    go.replaceChildren(
      icon(p === 'resume' ? 'play' : p === 'new' ? 'sparkle' : 'city'),
      p === 'resume' ? `Resume ${picked?.name || 'my city'}` : p === 'new' ? 'Found the city' : mode === 'founding-city' ? 'Open the showcase' : 'Start the challenge',
    );
  }

  function act(): void {
    if (path === 'resume') {
      if (!picked) return;
      go.disabled = true;
      setText(resumeErr, '');
      void o
        .resume(picked.slot, close)
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
      o.showcase(mode);
    }
  }

  // Captured first, so the city's hotkeys never see keys typed here.
  function onKey(e: KeyboardEvent): void {
    const row = e.target instanceof HTMLElement && e.target.classList.contains('ch-save') ? e.target : null;
    if (row && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const next = (e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
      next?.focus();
      const s = saves.find((x) => x.slot === next?.dataset.slot);
      if (s) pick(s);
    } else if (row && e.key === 'Enter' && saves.find((x) => x.slot === row.dataset.slot) !== picked) {
      e.preventDefault();
      pick(saves.find((x) => x.slot === row.dataset.slot)!);
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLElement && e.target.tagName === 'SUMMARY')) {
      e.preventDefault();
      act();
    } else if (e.key === 'Escape' && armedSlot) {
      e.preventDefault();
      disarm();
    } else if (e.key === 'Escape' && !o.first) {
      e.preventDefault();
      close();
    } else return;
    e.stopPropagation();
  }
  window.addEventListener('keydown', onKey, true);

  setDifficulty(difficulty);
  setMode(mode);
  choose(path);
  for (const r of list.children) {
    const on = (r as HTMLElement).dataset.slot === picked?.slot;
    r.classList.toggle('on', on);
    r.setAttribute('aria-selected', String(on));
  }
  rise(paths.children);
  o.host.append(scrim);
  // Maps after the dialog is up (≈15k height samples each).
  setTimeout(() => {
    if (closed) return;
    paintNew();
    // The picked island itself, read from its save (it is not loaded).
    if (picked) pick(picked);
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
