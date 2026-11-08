import { createBootScreen, type BootScreen } from '@/ui/Boot';
import { createPlatform } from '@/platform';
import { isCompact } from '@/platform/device';
import { SHOWCASE_SEED, preferredDifficulty, type GameStart } from '@/game/start';
import type { SaveInfo } from '@/game/SaveManager';
import type { SaveData } from '@/sim/save';
import { MAP_SIZE } from '@/sim/mapSize';
import { guideWanted, openChapter, type ChapterPath } from '@/modules/tutorial/Chapter';
import { h, setText } from '@/ui/dom';
import { Hologram, type HoloCity } from './Hologram';
import './welcome.css';

export interface Welcome {
  start: GameStart;
  /** The same screen, now running the boot sequence over the island. */
  screen: BootScreen;
  /** Resolves once the island has glided to the centre: start the heavy boot work after it, so the move stays smooth. */
  settled: Promise<void>;
  /** Call once the game is in view (stops the backdrop). */
  done(): void;
}

/** Wide screens put the dialog on the right and the island on the left; narrower ones float the island behind it. */
const SIDE_BY_SIDE = 1180;

/**
 * The welcome screen (D-148): the New Chapter dialog over a holographic island, shown before the engine boots. It
 * needs only the save's summary and the sim's height function, so it is up in a few hundred milliseconds; meanwhile
 * `prefetch` loads the game chunk and warms the GPU. The choice resolves to a `GameStart`, and the same screen
 * flows into the boot sequence for that city, so nothing is built that the player did not ask for.
 */
export async function runWelcome(el: HTMLElement, subtitle: string, params: URLSearchParams, prefetch: () => Promise<unknown>): Promise<Welcome> {
  const holo = new Hologram(MAP_SIZE, isCompact());
  const screen = createBootScreen(el, subtitle, { welcome: { backdrop: holo.canvas } });

  // ── Brand, core status, version ──
  const title = h('h1', { class: 'wl-title' });
  [...'BLOOMGRID'].forEach((ch, i) => title.append(h('span', { style: `--i:${i}` }, ch)));
  const caption = h('div', { class: 'wl-caption' });
  const status = h('span', { class: 'wl-status-text' }, 'Loading city systems');
  el.append(
    h('div', { class: 'wl-brand' }, title, h('div', { class: 'wl-tag' }, 'Solarpunk island city builder')),
    caption,
    h('div', { class: 'wl-status', role: 'status' }, h('i'), status),
    h('div', { class: 'wl-ver' }, `v${__APP_VERSION__}`),
  );
  holo.start();

  // The game loads behind the choice. A failure here only means the boot fetches it again after the choice.
  void prefetch().then(
    () => (el.classList.add('wl-ready'), setText(status, 'City systems ready')),
    () => setText(status, 'City systems load on start'),
  );

  // ── The saved city (summary first; the full save only when shown or chosen) ──
  const storage = createPlatform().storage;
  const info: SaveInfo | null = await storage
    .get<SaveInfo>('save:slot1:info')
    .then(async (i) => i ?? ((await storage.keys()).includes('save:slot1') ? { at: 0, name: '', day: 0, residents: 0 } : null))
    .catch(() => null);
  let saved: Promise<SaveData | null | undefined> | null = null;
  const readSave = () => (saved ??= storage.get<SaveData>('save:slot1').catch(() => null));
  let savedCity: HoloCity = null;

  let path: ChapterPath = info ? 'resume' : 'new';
  const captions: Record<ChapterPath, (seed: number) => string> = {
    resume: () => `${info?.name || 'Your city'}${info?.day ? ` · day ${info.day}` : ''} · saved island`,
    new: (seed) => `Island #${seed} · unclaimed`,
    showcase: () => 'The founding city · in full bloom',
  };
  const view = (p: ChapterPath, seed: number) => {
    path = p;
    setText(caption, captions[p](seed));
    holo.show(seed, p === 'showcase' ? 'showcase' : p === 'resume' ? savedCity : null);
    if (p === 'resume' && !savedCity)
      void readSave().then(async (data) => {
        if (!data) return;
        const { mapOfSave } = await import('@/modules/tutorial/cityMap');
        savedCity = mapOfSave(data);
        if (path === 'resume') holo.show(data.seed, savedCity);
      });
  };

  /** Where the island sits while the chosen city loads: centred above the boot readout. */
  const centre = (): [number, number, number] => [innerWidth / 2, innerHeight * 0.42, Math.min(innerWidth * 0.4, innerHeight * 0.36)];
  const layout = () => {
    const dlg = el.querySelector<HTMLElement>('.ch');
    const W = innerWidth;
    const H = innerHeight;
    if (el.classList.contains('wl-chosen') || !dlg) return holo.place(...centre());
    const r = dlg.getBoundingClientRect();
    if (W >= SIDE_BY_SIDE) holo.place(r.left / 2, H * 0.54, Math.min(r.left * 0.44, H * 0.4));
    else if (r.top > 140) holo.place(W / 2, r.top * 0.55, Math.min(W * 0.46, r.top * 0.6));
    else holo.place(W / 2, H / 2, Math.min(W, H) * 0.56);
  };

  const start = await new Promise<GameStart>((resolve) => {
    const seed = Number(params.get('seed')) || SHOWCASE_SEED;
    openChapter({
      host: el,
      first: true,
      info,
      readSave,
      size: MAP_SIZE,
      difficulty: preferredDifficulty(params),
      seed,
      guide: guideWanted(),
      onView: view,
      async resume(close) {
        const data = await readSave();
        if (!data) return false;
        close();
        resolve({ kind: 'save', slot: 'slot1', data });
        return true;
      },
      found: (name, s, difficulty, guide) => resolve({ kind: 'scenario', scenario: 'fresh-island', seed: s, difficulty, name, guide, chosen: true }),
      showcase: () => resolve({ kind: 'scenario', scenario: 'founding-city', seed: SHOWCASE_SEED, difficulty: preferredDifficulty(params), chosen: true }),
    });
    layout();
    // Once more after the dialog's entrance (fonts and its maps settle its size).
    setTimeout(layout, 400);
    window.addEventListener('resize', layout);
  });

  // Dive in: the island moves to the centre and turns faster while the city loads.
  el.classList.add('wl-chosen');
  holo.setSpin(0.16);
  const settled = holo.glide(...centre());
  setText(caption, start.kind === 'save' ? `${info?.name || 'Your city'} · restoring` : start.scenario === 'founding-city' ? 'The founding city · opening' : `${start.name ?? 'A new island'} · founding`);
  return {
    start,
    screen,
    settled,
    done() {
      window.removeEventListener('resize', layout);
      holo.stop();
    },
  };
}
