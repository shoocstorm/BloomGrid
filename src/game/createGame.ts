import { PerspectiveCamera, Scene } from 'three/webgpu';
import { CommandStack } from '@/core/Commands';
import { Engine } from '@/core/Engine';
import { EventBus } from '@/core/EventBus';
import { loadModules } from '@/core/Modules';
import { Services } from '@/core/Services';
import { SystemRegistry } from '@/core/Systems';
import { City } from '@/sim/City';
import { registerSimCommands } from '@/sim/commands';
import { simSystems } from '@/sim/systems';
import { createRenderer } from '@/render/Renderer';
import { ChunkedInstancer } from '@/render/Instancer';
import { DynamicResolution, QUALITY_TIERS, type QualityTier } from '@/render/Quality';
import { PostFX } from '@/render/PostFX';
import { initMaterials } from '@/render/materials/library';
import { initPieces, pieceIds } from '@/assets/kit/pieces';
import { AssetManager } from '@/assets/AssetManager';
import { Input } from '@/input/Input';
import { CityCamera } from '@/input/CityCamera';
import { createPlatform } from '@/platform';
import type { GameContext, GameModule } from './context';
import { ToolManager } from './Tools';
import { SaveManager } from './SaveManager';
import { U } from '@/render/uniforms';

export interface RenderService {
  postfx: PostFX;
  dynamicResolution: DynamicResolution;
  setQuality(tier: QualityTier): void;
}

declare module '@/core/Services' {
  interface GameServices {
    render: RenderService;
    save: SaveManager;
  }
}

/**
 * Builds the core runtime (sim, renderer, input, tools, persistence) and then loads feature
 * modules in dependency order. Everything feature-specific lives in modules.
 */
export type ProgressFn = (label: string, progress: number) => Promise<void> | void;

export async function createGame(
  canvas: HTMLCanvasElement,
  hud: HTMLElement,
  modules: GameModule[],
  onProgress: ProgressFn = () => {},
): Promise<GameContext> {
  const params = new URLSearchParams(location.search);
  await onProgress('Negotiating GPU link', 0.05);
  const { renderer, isWebGPU } = await createRenderer(canvas, params.get('renderer') === 'webgl');
  const tier = (params.get('quality') as QualityTier) || (isWebGPU ? 'high' : 'medium');
  await onProgress(`${isWebGPU ? 'WebGPU' : 'WebGL2'} core · calibrating bio-shaders`, 0.15);

  initMaterials();
  initPieces();

  await onProgress('Raising the island from the sea', 0.25);
  const bus = new EventBus();
  const seed = Number(params.get('seed')) || 20261024;
  const city = new City(bus, seed);
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.5, 4000);
  const input = new Input(canvas);
  const systems = new SystemRegistry<GameContext>();

  const ctx = {
    bus,
    city,
    systems,
    services: new Services(),
    renderer,
    isWebGPU,
    scene,
    camera,
    instancer: new ChunkedInstancer(scene),
    assets: new AssetManager(),
    quality: { tier, settings: QUALITY_TIERS[tier] },
    input,
    cameraCtl: new CityCamera(camera, input, city.grid),
    platform: createPlatform(),
    params,
    hud,
    loading: false,
  } as GameContext;
  ctx.commands = new CommandStack<GameContext>(ctx);
  ctx.engine = new Engine(ctx, systems, 10);
  ctx.tools = new ToolManager(ctx);
  registerSimCommands(ctx.commands);
  simSystems.forEach((s) => systems.add(s));
  U.mapSize.value = city.grid.w;

  // Rendering services.
  const postfx = new PostFX(renderer, scene, camera);
  const dynRes = new DynamicResolution();
  dynRes.enabled = !params.has('nodynres');
  const applySize = () => {
    const pr = Math.min(window.devicePixelRatio, ctx.quality.settings.maxPixelRatio) * dynRes.scale;
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  const setQuality = (t: QualityTier) => {
    ctx.quality = { tier: t, settings: QUALITY_TIERS[t] };
    const q = ctx.quality.settings;
    renderer.shadowMap.enabled = q.shadows;
    ctx.instancer.lodScale = q.lodScale;
    ctx.services.tryGet('world')?.atmosphere.setShadowMapSize(q.shadowMapSize);
    postfx.configure(q);
    dynRes.scale = 1;
    applySize();
  };
  ctx.services.provide('render', { postfx, dynamicResolution: dynRes, setQuality });
  ctx.services.provide('save', new SaveManager(ctx));
  window.addEventListener('resize', applySize);

  // Core per-frame systems.
  systems.add({ id: 'core.tools', phase: 'input', update: (c, f) => c.tools.update(f.dt) });
  systems.add({ id: 'core.camera', phase: 'input', order: 1, update: (c, f) => c.cameraCtl.update(f.dt) });
  systems.add({ id: 'core.instancer', phase: 'sync', order: 100, update: (c, f) => c.instancer.update(f.dt, c.camera) });
  systems.add({
    id: 'core.render',
    phase: 'render',
    update(c, f) {
      if (dynRes.update(f.dt)) applySize();
      postfx.render();
      c.input.endFrame();
    },
  });

  // Global hotkeys.
  const save = ctx.services.get('save');
  input.onKey((e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.code === 'KeyZ') return (e.shiftKey ? ctx.commands.redo() : ctx.commands.undo()), true;
    if (mod && e.code === 'KeyY') return ctx.commands.redo(), true;
    if (mod && e.code === 'KeyS') return void save.save(), true;
    if (mod && e.code === 'KeyL') return void save.load(), true;
    if (mod) return false;
    if (e.code === 'Space') return (ctx.engine.speed = ctx.engine.speed ? 0 : 1), true;
    if (e.code === 'Digit1') return (ctx.engine.speed = 1), true;
    if (e.code === 'Digit2') return (ctx.engine.speed = 3), true;
    if (e.code === 'Digit3') return (ctx.engine.speed = 8), true;
    return false;
  });

  await onProgress('Seeding forests, meadows & mangroves', 0.4);
  await loadModules(ctx, modules);
  ctx.tools.attach();
  ctx.tools.setActive('select');
  setQuality(tier);

  // Start looking at a pleasant buildable spot near the map centre.
  await onProgress('Compiling luminous materials', 0.75);
  ctx.cameraCtl.lookAt(city.grid.w * 0.52, city.grid.h * 0.66, 60, true);
  ctx.cameraCtl.update(0);
  await ctx.instancer.warmup(renderer, scene, camera, pieceIds(), ctx.cameraCtl.target);

  // Autosave every 2 minutes.
  setInterval(() => void save.save('autosave'), 120_000);
  await onProgress('Synchronising city pulse', 0.95);
  return ctx;
}
