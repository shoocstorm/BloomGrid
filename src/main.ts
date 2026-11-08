// The whole HUD cascade first (base, boot screen, every module, then the theme and the phone layout, D-148).
import '@/ui/cssOrder';
import { createBootScreen, type BootScreen } from '@/ui/Boot';
import { runWelcome } from '@/ui/welcome';
import { wantsWelcome } from '@/game/start';
import { watchDevice } from '@/platform/device';
import { watchFocusRing } from '@/ui/focusRing';
import { installCursors } from '@/ui/cursor';

/**
 * The entry stays light (D-148): the welcome screen (the New Chapter dialog over a holographic island) is up before
 * three.js, the feature modules and the content load. The game is its own chunk (`game/boot.ts`, where `MODULES`
 * lives), fetched behind the welcome and booted once for the city the player chose. Scripts' URL scenarios skip the
 * welcome and boot straight in.
 */

/**
 * No browser or webview context menu anywhere in the game (right-click is a game gesture: leave build mode, slow the
 * clock), on the web and in the Tauri shell alike. Text fields keep theirs for paste.
 */
function blockContextMenu(): void {
  window.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
  });
}

const SUBTITLE = 'SOLARPUNK ISLAND CITY SYSTEMS';
type GameChunk = typeof import('@/game/boot');
let chunk: Promise<GameChunk> | null = null;
const loadGame = () => (chunk ??= import('@/game/boot'));

async function boot() {
  blockContextMenu();
  watchDevice();
  watchFocusRing();
  installCursors();
  const el = document.getElementById('boot')!;
  const params = new URLSearchParams(location.search);
  let screen: BootScreen | null = null;
  try {
    if (!wantsWelcome(params)) {
      screen = createBootScreen(el, SUBTITLE);
      await (await loadGame()).bootGame(undefined, screen);
      return;
    }
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    // Behind the choice: the game chunk once the welcome has painted, then the GPU device and the kit.
    const prefetch = () =>
      new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 50)))
        .then(loadGame)
        .then((g) => g.prepareCore(canvas, params));
    const w = await runWelcome(el, SUBTITLE, params, prefetch);
    screen = w.screen;
    await screen.stage('Loading city systems', 0.02);
    // The island glides to the centre on an idle main thread (≈ 0.8 s; the GPU core is usually ready by now).
    const [game] = await Promise.all([loadGame(), w.settled]);
    await game.bootGame(w.start, screen);
    w.done();
  } catch (e) {
    console.error(e);
    (screen ?? createBootScreen(el, SUBTITLE)).fail((e as Error).message);
  }
}

void boot();
