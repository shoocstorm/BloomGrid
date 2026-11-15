export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  msaa: number;
  /** Temporal anti-aliasing (D-161): replaces MSAA / FXAA where post-processing runs. */
  taa: boolean;
  /** Multiplier on per-piece LOD cull distances. */
  lodScale: number;
  /** Fraction of wild flora generated. */
  floraDensity: number;
}

export const QUALITY_TIERS: Record<QualityTier, QualitySettings> = {
  low: { maxPixelRatio: 0.75, shadows: false, shadowMapSize: 1024, bloom: false, msaa: 0, taa: false, lodScale: 0.55, floraDensity: 0.4 },
  medium: { maxPixelRatio: 1, shadows: true, shadowMapSize: 2048, bloom: true, msaa: 0, taa: true, lodScale: 0.8, floraDensity: 0.7 },
  high: { maxPixelRatio: 1.25, shadows: true, shadowMapSize: 2048, bloom: true, msaa: 4, taa: true, lodScale: 1, floraDensity: 1 },
  ultra: { maxPixelRatio: 2, shadows: true, shadowMapSize: 4096, bloom: true, msaa: 4, taa: true, lodScale: 1.5, floraDensity: 1 },
};

/**
 * Dynamic resolution: lowers the render scale when the GPU can't keep the frame rate. Each window is judged by its
 * median frame time, not the mean: a GPU that can't keep up is slow on every frame, while a hitch (boot, a shader
 * build, a save) is one long frame that would otherwise pull the mean down, cut the scale and leave the picture soft
 * long after it passed.
 *
 * Every change re-rasterises the whole frame (each window line and floor edge shifts by a fraction of a pixel, and
 * the temporal AA history restarts), so changes are rare and big (D-161): a drop needs two missed windows in a row;
 * a recovery needs three comfortable windows in a row at the active cap (frames meeting the low idle cap prove
 * nothing about the GPU) and `RECOVER_AFTER` seconds since the last change. It used to step 10 % down while the
 * camera moved and 5 % back up every 1.5 s once it stopped: the city visibly redrew itself several times per move.
 */
/** Judging window (s), scale step, and the wait (s) after a change before the scale may rise again. */
const WINDOW = 1.5;
const STEP = 0.15;
const RECOVER_AFTER = 20;

export class DynamicResolution {
  scale = 1;
  enabled = true;
  private timer = 0;
  private samples = 0;
  private readonly dts = new Float32Array(1024);
  /** Seconds of frames still to pass before judging (boot, a city change: uploads, fly-ins and grow-ins). */
  private grace = 0;
  private held = false;

  constructor(
    private targetFps = 55,
    private minScale = 0.5,
  ) {}

  private lastCap = -1;
  /** Highest cap seen (the active cap); 0 = uncapped. */
  private activeCap = -1;
  private misses = 0;
  private goods = 0;
  /** Seconds of judged frames since the last scale change. */
  private sinceChange = Infinity;

  /** Full scale, and no judgement for the next `seconds` of frames (call when a city appears). */
  hold(seconds: number): void {
    this.held ||= this.scale !== 1;
    this.scale = 1;
    this.grace = Math.max(this.grace, seconds);
    this.timer = this.samples = 0;
  }

  /**
   * `cap` is the current frame-rate cap (0 = uncapped → judged against `targetFps`). The scale
   * only drops when frames miss the cap, so deliberate throttling (idle / battery) never
   * lowers resolution.
   */
  update(dt: number, cap = 0): boolean {
    if (!this.enabled) return false;
    if (this.grace > 0) {
      this.grace -= dt;
      const changed = this.held;
      this.held = false;
      return changed;
    }
    this.sinceChange += dt;
    if (cap !== this.lastCap) {
      this.lastCap = cap;
      if (cap === 0 || this.activeCap === -1 || (this.activeCap !== 0 && cap > this.activeCap)) this.activeCap = cap;
      this.timer = this.samples = this.misses = this.goods = 0;
      return false;
    }
    if (this.samples < this.dts.length) this.dts[this.samples++] = dt;
    this.timer += dt;
    if (this.timer < WINDOW) return false;
    const frames = this.dts.subarray(0, this.samples).sort();
    const fps = 1 / Math.max(1e-4, frames[this.samples >> 1]);
    this.timer = this.samples = 0;
    const target = cap > 0 ? cap : this.targetFps;
    const prev = this.scale;
    const atActive = cap === this.activeCap;
    this.misses = fps < target * 0.85 ? this.misses + 1 : 0;
    this.goods = atActive && fps > target * 0.97 ? this.goods + 1 : 0;
    if (this.misses >= 2 && this.scale > this.minScale) this.scale = Math.max(this.minScale, this.scale - STEP);
    else if (this.goods >= 3 && this.scale < 1 && this.sinceChange >= RECOVER_AFTER) this.scale = Math.min(1, this.scale + STEP);
    if (prev === this.scale) return false;
    this.misses = this.goods = 0;
    this.sinceChange = 0;
    return true;
  }
}
