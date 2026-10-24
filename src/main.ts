import { createGame } from '@/game/createGame';
import { worldModule } from '@/modules/world';
import { constructionModule } from '@/modules/construction';
import { hudModule } from '@/ui/Hud';
import { debugModule } from '@/debug';

/**
 * Feature modules. New gameplay layers (bloom engine, mobility, Flora-Net, Green Weaver,
 * walk mode…) are added here as self-contained modules.
 */
const MODULES = [worldModule, constructionModule, hudModule, debugModule];

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hud = document.getElementById('hud')!;
  const bootEl = document.getElementById('boot')!;
  try {
    const ctx = await createGame(canvas, hud, MODULES);
    ctx.engine.start();
    bootEl.classList.add('hidden');
    (window as unknown as { bloomgrid: unknown }).bloomgrid = ctx;
  } catch (e) {
    console.error(e);
    bootEl.textContent = `BloomGrid failed to start: ${(e as Error).message}`;
  }
}

void boot();
