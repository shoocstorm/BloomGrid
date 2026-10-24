import { RenderPipeline, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu';
import { emissive, mrt, output, pass, uniform } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import type { QualitySettings } from './Quality';

/**
 * Post-processing: selective bloom driven by the emissive MRT channel, so only
 * bioluminescent surfaces glow. Disabled on low quality (direct render).
 */
export class PostFX {
  private pipeline: RenderPipeline | null = null;
  readonly strength = uniform(0.9);

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
    const color = scenePass.getTextureNode('output');
    const glow = scenePass.getTextureNode('emissive');
    const b = bloom(glow, this.strength as unknown as number, 0.55, 0);
    const pipeline = new RenderPipeline(this.renderer);
    pipeline.outputNode = color.add(b);
    this.pipeline = pipeline;
  }

  render(): void {
    if (this.pipeline) this.pipeline.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
