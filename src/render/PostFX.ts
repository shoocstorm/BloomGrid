import { RenderPipeline, type Camera, type Node, type Scene, type WebGPURenderer } from 'three/webgpu';
import { emissive, mrt, output, pass, renderOutput, vec4 } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import type { QualitySettings } from './Quality';
import { grade } from './grade';
import { U } from './uniforms';

/**
 * Post-processing: selective bloom driven by the emissive MRT channel, so only bioluminescent surfaces
 * glow; then tone mapping, the display-space colour grade (D-120) and, without MSAA, FXAA. Disabled on low
 * quality (direct render, raw ACES). No ambient occlusion: half-resolution GTAO without a temporal filter
 * stippled every surface up close (D-124).
 */
export class PostFX {
  private pipeline: RenderPipeline | null = null;
  /** Bloom strength, driven by the atmosphere through `U.bloom` (night stronger than noon). */
  readonly strength = U.bloom;

  constructor(
    private renderer: WebGPURenderer,
    private scene: Scene,
    private camera: Camera,
  ) {}

  configure(q: QualitySettings): void {
    this.pipeline?.dispose();
    this.pipeline = null;
    if (!q.bloom) return;
    const scenePass = pass(this.scene, this.camera, { samples: q.msaa });
    scenePass.setMRT(mrt({ output, emissive }));
    const color = scenePass.getTextureNode('output') as Node<'vec4'>;
    const glow = scenePass.getTextureNode('emissive');
    const b = bloom(glow, U.bloom as unknown as number, 0.55, 0);
    const lit = renderOutput(color.add(b));
    let out = vec4(grade(lit.rgb), 1) as Node<'vec4'>;
    if (q.msaa === 0) out = fxaa(out) as unknown as Node<'vec4'>;
    const pipeline = new RenderPipeline(this.renderer);
    pipeline.outputColorTransform = false;
    pipeline.outputNode = out;
    this.pipeline = pipeline;
  }

  /**
   * Builds every pipeline for the path `render()` actually takes. three keys render contexts by
   * call depth, and the bloom scene pass renders nested inside the pipeline, so `compileAsync`
   * (depth 0) builds variants frames never use. With bloom, render one real frame instead (behind
   * the boot screen); the direct path matches `compileAsync`, which also compiles in parallel.
   */
  async compile(): Promise<void> {
    if (this.pipeline) this.pipeline.render();
    else await this.renderer.compileAsync(this.scene, this.camera);
  }

  render(): void {
    if (this.pipeline) this.pipeline.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
