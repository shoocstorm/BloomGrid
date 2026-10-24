import type { PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu';
import type { CommandStack } from '@/core/Commands';
import type { Engine } from '@/core/Engine';
import type { EventBus } from '@/core/EventBus';
import type { Services } from '@/core/Services';
import type { SystemRegistry } from '@/core/Systems';
import type { City } from '@/sim/City';
import type { SimCtx } from '@/sim/systems';
import type { ChunkedInstancer } from '@/render/Instancer';
import type { QualitySettings, QualityTier } from '@/render/Quality';
import type { AssetManager } from '@/assets/AssetManager';
import type { Input } from '@/input/Input';
import type { CityCamera } from '@/input/CityCamera';
import type { Platform } from '@/platform';
import type { ToolManager } from './Tools';

/** Everything a module or system can reach. Feature-specific APIs live in `services`. */
export interface GameContext extends SimCtx {
  bus: EventBus;
  city: City;
  commands: CommandStack<GameContext>;
  systems: SystemRegistry<GameContext>;
  engine: Engine<GameContext>;
  services: Services;
  renderer: WebGPURenderer;
  isWebGPU: boolean;
  scene: Scene;
  camera: PerspectiveCamera;
  instancer: ChunkedInstancer;
  assets: AssetManager;
  quality: { tier: QualityTier; settings: QualitySettings };
  input: Input;
  cameraCtl: CityCamera;
  tools: ToolManager;
  platform: Platform;
  params: URLSearchParams;
  hud: HTMLElement;
  /** True while a save is being loaded (renderers skip growth animations). */
  loading: boolean;
}

export type GameModule = import('@/core/Modules').GameModule<GameContext>;
