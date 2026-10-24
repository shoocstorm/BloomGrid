import { ACESFilmicToneMapping, PCFShadowMap, WebGPURenderer } from 'three/webgpu';

export interface RendererInfo {
  renderer: WebGPURenderer;
  /** True when running on the native WebGPU backend, false on the WebGL2 fallback. */
  isWebGPU: boolean;
}

/**
 * Creates the renderer. WebGPU is preferred; three.js falls back to WebGL2 automatically when
 * WebGPU is unavailable. `?renderer=webgl` forces the fallback for testing.
 */
export async function createRenderer(canvas: HTMLCanvasElement, forceWebGL: boolean): Promise<RendererInfo> {
  const renderer = new WebGPURenderer({ canvas, antialias: false, forceWebGL, powerPreference: 'high-performance' });
  await renderer.init();
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const backend = renderer.backend as { isWebGPUBackend?: boolean };
  return { renderer, isWebGPU: backend.isWebGPUBackend === true };
}
