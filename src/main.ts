import { createGame } from '@/game/createGame';
import { worldModule } from '@/modules/world';
import { constructionModule } from '@/modules/construction';
import { hudModule } from '@/ui/Hud';
import { debugModule } from '@/debug';
import { pulseModule } from '@/modules/pulse';
import { overlaysModule } from '@/modules/overlays';
import { advisorModule } from '@/modules/advisor';
import { viewsModule } from '@/modules/views';
import { dashboardModule } from '@/modules/dashboard';
import { settingsModule } from '@/modules/settings';
import { crisesModule } from '@/modules/crises';
import { bloomModule } from '@/modules/bloom';
import { mobilityModule } from '@/modules/mobility';
import { floranetModule } from '@/modules/floranet';
import { weaverModule } from '@/modules/weaver';
import { exploreModule } from '@/modules/explore';
import { createBootScreen } from '@/ui/Boot';
// The HUD theme loads after every module stylesheet so it can restyle them from one place.
import '@/ui/theme.css';

/**
 * Feature modules. New gameplay layers (city pulse, overlays, crises, bloom engine, mobility,
 * Flora-Net, Green Weaver, explore modes…) are added here as self-contained modules.
 */
const MODULES = [worldModule, constructionModule, hudModule, pulseModule, overlaysModule, advisorModule, viewsModule, dashboardModule, settingsModule, crisesModule, bloomModule, mobilityModule, floranetModule, weaverModule, exploreModule, debugModule];

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
