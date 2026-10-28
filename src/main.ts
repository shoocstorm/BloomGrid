import { createGame } from '@/game/createGame';
import { openingView } from '@/game/opening';
import { worldModule } from '@/modules/world';
import { constructionModule } from '@/modules/construction';
import { hudModule } from '@/ui/Hud';
import { debugModule } from '@/debug';
import { pulseModule } from '@/modules/pulse';
import { overlaysModule } from '@/modules/overlays';
import { advisorModule } from '@/modules/advisor';
import { viewsModule } from '@/modules/views';
import { inventoryModule } from '@/modules/inventory';
import { dashboardModule } from '@/modules/dashboard';
import { cityMapModule } from '@/modules/citymap';
import { assistantModule } from '@/modules/assistant';
import { settingsModule } from '@/modules/settings';
import { crisesModule } from '@/modules/crises';
import { bloomModule } from '@/modules/bloom';
import { mobilityModule } from '@/modules/mobility';
import { floranetModule } from '@/modules/floranet';
import { weaverModule } from '@/modules/weaver';
import { sceneryModule } from '@/modules/scenery';
import { aerolineModule } from '@/modules/aeroline';
import { windModule } from '@/modules/wind';
import { exploreModule } from '@/modules/explore';
import { createBootScreen } from '@/ui/Boot';
import { watchDevice } from '@/platform/device';
// The HUD theme loads after every module stylesheet so it can restyle them from one place; the
// phone layout loads after it.
import '@/ui/theme.css';
import '@/ui/mobile.css';

/**
 * Feature modules. New gameplay layers (city pulse, overlays, crises, bloom engine, mobility,
 * Flora-Net, Green Weaver, explore modes…) are added here as self-contained modules.
 */
const MODULES = [worldModule, constructionModule, hudModule, pulseModule, overlaysModule, advisorModule, viewsModule, inventoryModule, dashboardModule, cityMapModule, assistantModule, settingsModule, crisesModule, bloomModule, mobilityModule, floranetModule, weaverModule, sceneryModule, aerolineModule, windModule, exploreModule, debugModule];

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hud = document.getElementById('hud')!;
  watchDevice();
  const screen = createBootScreen(document.getElementById('boot')!, 'SOLARPUNK ISLAND CITY SYSTEMS');
  hud.style.opacity = '0';
  try {
    const ctx = await createGame(canvas, hud, MODULES, screen.stage);
    // Park high over the island, then fly down to the landmark when the boot screen lifts.
    const v = openingView(ctx.city);
    ctx.cameraCtl.intro(v.x, v.z, v.distance, 0, v);
    ctx.engine.start();
    (window as unknown as { bloomgrid: unknown }).bloomgrid = ctx;
    await screen.finish(() => ctx.cameraCtl.intro(v.x, v.z, v.distance, 6, v));
    hud.style.transition = 'opacity 1s';
    hud.style.opacity = '1';
  } catch (e) {
    console.error(e);
    screen.fail((e as Error).message);
  }
}

void boot();
