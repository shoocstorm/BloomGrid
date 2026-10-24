import { createGame } from '@/game/createGame';
import { worldModule } from '@/modules/world';
import { constructionModule } from '@/modules/construction';
import { hudModule } from '@/ui/Hud';
import { debugModule } from '@/debug';
import { createBootScreen } from '@/ui/Boot';

/**
 * Feature modules. New gameplay layers (city pulse, overlays, crises, bloom engine, mobility,
 * Flora-Net, Green Weaver, explore modes…) are added here as self-contained modules.
 */
const MODULES = [worldModule, constructionModule, hudModule, debugModule];

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hud = document.getElementById('hud')!;
  const screen = createBootScreen(document.getElementById('boot')!, 'SOLARPUNK ISLAND CITY SYSTEMS');
  hud.style.opacity = '0';
  try {
    const ctx = await createGame(canvas, hud, MODULES, screen.stage);
    const target = ctx.cameraCtl.target.clone();
    ctx.cameraCtl.intro(target.x, target.z, 60, 0); // park high over the island
    ctx.engine.start();
    (window as unknown as { bloomgrid: unknown }).bloomgrid = ctx;
    await screen.finish(() => ctx.cameraCtl.intro(target.x, target.z, 60));
    hud.style.transition = 'opacity 1s';
    hud.style.opacity = '1';
  } catch (e) {
    console.error(e);
    screen.fail((e as Error).message);
  }
}

void boot();
