import { createGame, prepareCore } from './createGame';
import { openingView } from './opening';
import type { GameStart } from './start';
import type { BootScreen } from '@/ui/Boot';
import { worldModule } from '@/modules/world';
import { constructionModule } from '@/modules/construction';
import { hudModule } from '@/ui/Hud';
import { previewModule } from '@/modules/preview';
import { loaderModule } from '@/modules/loader';
import { pauseModule } from '@/modules/pause';
import { debugModule } from '@/debug';
import { pulseModule } from '@/modules/pulse';
import { buildModule } from '@/modules/build';
import { overlaysModule } from '@/modules/overlays';
import { advisorModule } from '@/modules/advisor';
import { viewsModule } from '@/modules/views';
import { inventoryModule } from '@/modules/inventory';
import { dashboardModule } from '@/modules/dashboard';
import { aboutModule } from '@/modules/about';
import { cityMapModule } from '@/modules/citymap';
import { assistantModule } from '@/modules/assistant';
import { knowledgeModule } from '@/modules/knowledge';
import { statInfoModule } from '@/modules/statinfo';
import { selectionModule } from '@/modules/selection';
import { momentsModule } from '@/modules/moments';
import { risingModule } from '@/modules/rising';
import { roadworksModule } from '@/modules/roadworks';
import { juiceModule } from '@/modules/juice';
import { settingsModule } from '@/modules/settings';
import { crisesModule } from '@/modules/crises';
import { bloomModule } from '@/modules/bloom';
import { mobilityModule } from '@/modules/mobility';
import { walkersModule } from '@/modules/walkers';
import { happeningsModule } from '@/modules/happenings';
import { floranetModule } from '@/modules/floranet';
import { weaverModule } from '@/modules/weaver';
import { sceneryModule } from '@/modules/scenery';
import { aerolineModule } from '@/modules/aeroline';
import { windModule } from '@/modules/wind';
import { hazardsModule } from '@/modules/hazards';
import { fireworksModule } from '@/modules/fireworks';
import { fishingModule } from '@/modules/fishing';
import { goalsModule } from '@/modules/goals';
import { tutorialModule } from '@/modules/tutorial';
import { disastersModule } from '@/modules/disasters';
import { audioModule } from '@/modules/audio';
import { exploreModule } from '@/modules/explore';
import { interactModule } from '@/modules/interact';
import { signsModule } from '@/modules/signs';
import { auroraModule } from '@/modules/aurora';
import { ferryModule } from '@/modules/ferry';
import { skyguardModule } from '@/modules/skyguard';
import { policeModule } from '@/modules/police';

/**
 * Feature modules. New gameplay layers (city pulse, overlays, crises, bloom engine, mobility,
 * Flora-Net, Green Weaver, explore modes…) are added here as self-contained modules.
 */
const MODULES = [worldModule, constructionModule, hudModule, loaderModule, previewModule, selectionModule, momentsModule, risingModule, roadworksModule, juiceModule, happeningsModule, pulseModule, buildModule, overlaysModule, advisorModule, goalsModule, viewsModule, inventoryModule, dashboardModule, cityMapModule, aboutModule, assistantModule, knowledgeModule, statInfoModule, audioModule, settingsModule, crisesModule, bloomModule, mobilityModule, walkersModule, floranetModule, weaverModule, sceneryModule, aerolineModule, windModule, hazardsModule, disastersModule, fireworksModule, fishingModule, tutorialModule, pauseModule, exploreModule, interactModule, signsModule, auroraModule, policeModule, ferryModule, skyguardModule, debugModule];

export { prepareCore };

/**
 * Boots the game for a start behind a boot screen and lifts it onto the city (D-148). This file is the game chunk:
 * `main.ts` imports it dynamically, so the welcome screen shows before three.js and the modules have loaded.
 */
export async function bootGame(start: GameStart | undefined, screen: BootScreen, onReveal?: () => void): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hud = document.getElementById('hud')!;
  hud.style.opacity = '0';
  const ctx = await createGame(canvas, hud, MODULES, start, screen.stage);
  // Park high over the island, then fly down to the landmark when the boot screen lifts.
  const v = openingView(ctx.city);
  ctx.cameraCtl.intro(v.x, v.z, v.distance, 0, v);
  // Boot's first frames (uploads, the fly-in, buildings growing in) are slow by nature: don't let them set the
  // render scale for the rest of the session.
  const res = ctx.services.get('render').dynamicResolution;
  res.hold(4);
  ctx.engine.start();
  (window as unknown as { bloomgrid: unknown }).bloomgrid = ctx;
  await screen.finish(() => (ctx.cameraCtl.intro(v.x, v.z, v.distance, 6, v), res.hold(8), onReveal?.()));
  hud.style.transition = 'opacity 1s';
  hud.style.opacity = '1';
  // HUD entrance animations (the welcome card) wait for this so they play in view.
  document.body.classList.add('booted');
}
