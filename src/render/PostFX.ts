import { BlendMode, MaterialBlending, Matrix4, RenderPipeline, Vector2, type Camera, type Node, type PerspectiveCamera, type Scene, type TextureNode, type WebGPURenderer } from 'three/webgpu';
import { Fn, convertToTexture, emissive, float, getViewPosition, mrt, output, pass, renderOutput, uniform, uv, vec4 } from 'three/tsl';
import { PostInputs, beforeTaa, display, needsBeforeTaa, needsResample, resample, type Looks, type PostLook } from './stylize';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { traa } from 'three/examples/jsm/tsl/display/TRAANode.js';
import type { QualitySettings } from './Quality';
import { grade } from './grade';
import { setBloomMRT } from './bloomMRT';
import { U } from './uniforms';

/**
 * Post-processing: selective bloom driven by the emissive MRT channel, so only bioluminescent surfaces
 * glow; then tone mapping, the display-space colour grade (D-120) and anti-aliasing. Disabled on low
 * quality (direct render, raw ACES). No ambient occlusion: half-resolution GTAO without a temporal filter
 * stippled every surface up close (D-124).
 *
 * Anti-aliasing (D-161): temporal (TRAA) where `taa` is on, else MSAA or FXAA. MSAA smooths a triangle's edge in
 * one frame, but a floor plate, mullion, railing or fin a pixel or less wide still lands on different pixels as the
 * camera moves, and façades crawl and flash. TRAA jitters the camera by a sub-pixel offset each frame and blends
 * with the reprojected history, so such lines settle into their true coverage. Its velocity comes from the depth
 * buffer and the camera (`cameraVelocity`): the city is static apart from shader-animated movers, and three's
 * per-object velocity would add a previous-matrix vertex buffer to every instanced batch (the pod mesh is at
 * WebGPU's limit of 8) and copy every batch's matrices each frame. Movers get the camera's motion only; TRAA's
 * variance clipping keeps their trails short.
 */
export class PostFX {
  private pipeline: RenderPipeline | null = null;
  /** Bloom strength, driven by the atmosphere through `U.bloom` (night stronger than noon). */
  readonly strength = U.bloom;
  /** Camera matrices for the depth-reprojected velocity, unjittered, refreshed each frame in `render`. */
  private readonly proj = uniform(new Matrix4());
  private readonly projInv = uniform(new Matrix4());
  private readonly camWorld = uniform(new Matrix4());
  private readonly prevViewProj = uniform(new Matrix4());
  /**
   * TRAA's history tests compare raw perspective depth, where a world-space gap shrinks in proportion to the near
   * plane. Its defaults (0.0005 / 0.001) were tuned at near = 0.5; the city camera's near plane follows its height
   * (D-237), which made the same tests reject history for depth steps of a few units, and every rejected pixel shows
   * the raw aliased frame. The thresholds scale with the near plane so they keep their world-space meaning (D-238).
   */
  private readonly depthThreshold = uniform(0.0005);
  private readonly edgeDepthDiff = uniform(0.001);
  private taa = false;
  /**
   * The style looks drawn by post (D-244, D-245): only those on screen (the chosen style and one still fading out)
   * are built, so a look costs nothing while it is off. `built` is what the current pipeline holds.
   */
  private looks: Looks = new Set();
  private built: Looks = new Set();
  private readonly postIn = new PostInputs();
  private last: QualitySettings | null = null;

  constructor(
    private renderer: WebGPURenderer,
    private scene: Scene,
    private camera: Camera,
  ) {}

  configure(q: QualitySettings): void {
    this.last = q;
    this.pipeline?.dispose();
    this.pipeline = null;
    this.taa = false;
    this.built = new Set(this.looks);
    const looks = this.built;
    // Materials' own bloom outputs need the scene pass's emissive target (see bloomMRT.ts).
    setBloomMRT(q.bloom);
    if (!q.bloom) return;
    this.taa = q.taa;
    const scenePass = pass(this.scene, this.camera, { samples: q.taa ? 0 : q.msaa });
    // three blends only `output` by default: every other target is written raw, so a transparent mesh (a wake, a
    // contrail, a lane) overwrote the glow behind it with its own, even where it was invisible, and the night sea
    // round it went dark in the shape of its quad (D-236). The emissive target blends like the material does; a
    // transparent material writes its opacity as the emissive alpha (bloomMRT.ts).
    const targets = mrt({ output, emissive });
    targets.setBlendMode('emissive', new BlendMode(MaterialBlending));
    scenePass.setMRT(targets);
    let color = scenePass.getTextureNode('output') as Node<'vec4'>;
    if (needsBeforeTaa(looks)) {
      // Before TAA, so outlines and bands are resolved with the rest of the frame rather than jittering over it (D-244).
      const styled = beforeTaa(scenePass.getTextureNode('output'), scenePass.getTextureNode('depth'), this.postIn, looks);
      color = (q.taa ? convertToTexture(styled) : styled) as Node<'vec4'>;
    }
    if (q.taa) {
      const depth = scenePass.getTextureNode('depth');
      this.syncMatrices();
      this.prevViewProj.value.multiplyMatrices(this.proj.value, (this.camera as PerspectiveCamera).matrixWorldInverse);
      const velocity = convertToTexture(this.cameraVelocity(depth));
      const t = traa(color, depth, velocity, this.camera);
      // Read at setup as numbers or nodes: uniforms keep them live (see `depthThreshold`).
      (t as unknown as { depthThreshold: unknown }).depthThreshold = this.depthThreshold;
      (t as unknown as { edgeDepthDiff: unknown }).edgeDepthDiff = this.edgeDepthDiff;
      color = t as unknown as Node<'vec4'>;
    }
    const glow = scenePass.getTextureNode('emissive');
    let b = bloom(glow, U.bloom as unknown as number, 0.55, 0) as unknown as Node<'vec4'>;
    // Blueprint keeps a faint glow: coloured halos would break its one blue.
    if (looks.has('blueprint')) b = b.mul(float(1).sub(U.blueprint.mul(0.8))) as Node<'vec4'>;
    const lit = renderOutput(color.add(b));
    let out = vec4(display(grade(lit.rgb), looks, this.postIn), 1) as Node<'vec4'>;
    if (needsResample(looks)) out = resample(convertToTexture(out), this.postIn, looks);
    else if (!q.taa && q.msaa === 0) out = fxaa(out) as unknown as Node<'vec4'>;
    const pipeline = new RenderPipeline(this.renderer);
    pipeline.outputColorTransform = false;
    pipeline.outputNode = out;
    this.pipeline = pipeline;
  }

  /**
   * The style looks to draw (D-244, D-245). A change rebuilds the post pipeline, which compiles only post nodes, not
   * the scene's materials: a frame or two. No effect without post-processing (Low).
   */
  setLooks(next: Iterable<PostLook>): void {
    const set = new Set(next);
    const same = set.size === this.looks.size && [...set].every((l) => this.looks.has(l));
    if (same) return;
    this.looks = set;
    if (this.last?.bloom) this.configure(this.last);
  }

  /**
   * Screen motion of each pixel from the camera alone, in NDC like three's `velocity` (current − previous): the
   * pixel's world position from depth, projected with this frame's and last frame's view-projection.
   */
  private cameraVelocity(depth: TextureNode) {
    return Fn(() => {
      const d = depth.sample(uv()).r;
      const view = getViewPosition(uv(), d, this.projInv);
      const world = this.camWorld.mul(vec4(view, 1));
      const cur = this.proj.mul(vec4(view, 1));
      const prev = this.prevViewProj.mul(world);
      return vec4(cur.xy.div(cur.w).sub(prev.xy.div(prev.w)), 0, 1);
    })();
  }

  /** Current unjittered camera matrices into the velocity uniforms (TRAA clears its jitter after each frame). */
  private syncMatrices(): void {
    const cam = this.camera as PerspectiveCamera;
    cam.updateMatrixWorld();
    this.proj.value.copy(cam.projectionMatrix);
    this.projInv.value.copy(cam.projectionMatrixInverse);
    this.camWorld.value.copy(cam.matrixWorld);
    const k = cam.near / 0.5;
    this.depthThreshold.value = 0.0005 * k;
    this.edgeDepthDiff.value = 0.001 * k;
  }

  /**
   * Builds every pipeline for the path `render()` actually takes. three keys render contexts by
   * call depth, and the bloom scene pass renders nested inside the pipeline, so `compileAsync`
   * (depth 0) builds variants frames never use. With bloom, render one real frame instead (behind
   * the boot screen); the direct path matches `compileAsync`, which also compiles in parallel.
   */
  async compile(): Promise<void> {
    if (this.pipeline) this.render();
    else await this.renderer.compileAsync(this.scene, this.camera);
  }

  /**
   * Prepares the next frames without drawing one (a film's loading beat, D-218): `compileAsync` on the direct path,
   * where it builds what frames use in parallel. With bloom it would build depth-0 variants no frame draws (above):
   * on a 6×-throttled CPU that tripled the founding film's lantern hold (5.1 s → 2.3 s without it), so the first real
   * frames build instead.
   */
  async precompile(): Promise<void> {
    if (!this.pipeline) await this.renderer.compileAsync(this.scene, this.camera);
  }

  render(): void {
    if (!this.pipeline) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.built.size) {
      const cam = this.camera as PerspectiveCamera;
      this.postIn.near.value = cam.near;
      this.postIn.far.value = cam.far;
      this.renderer.getDrawingBufferSize(_size);
      this.postIn.texel.value.set(1 / Math.max(1, _size.x), 1 / Math.max(1, _size.y));
      this.postIn.dpr.value = this.renderer.getPixelRatio();
    }
    if (this.taa) {
      this.syncMatrices();
      // Moves dither patterns (LOD dissolve) each frame so TAA averages them into a smooth fade (D-162).
      U.frame.value = (U.frame.value + 1) % 64;
    }
    this.pipeline.render();
    if (this.taa) this.prevViewProj.value.multiplyMatrices(this.proj.value, (this.camera as PerspectiveCamera).matrixWorldInverse);
  }
}

const _size = new Vector2();
