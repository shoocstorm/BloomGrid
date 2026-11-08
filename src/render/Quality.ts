export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  msaa: number;
  /** Multiplier on per-piece LOD cull distances. */
  lodScale: number;
  /** Fraction of wild flora generated. */
  floraDensity: number;
}

export const QUALITY_TIERS: Record<QualityTier, QualitySettings> = {
  low: { maxPixelRatio: 0.75, shadows: false, shadowMapSize: 1024, bloom: false, msaa: 0, lodScale: 0.55, floraDensity: 0.4 },
  medium: { maxPixelRatio: 1, shadows: true, shadowMapSize: 2048, bloom: true, msaa: 0, lodScale: 0.8, floraDensity: 0.7 },
  high: { maxPixelRatio: 1.25, shadows: true, shadowMapSize: 2048, bloom: true, msaa: 4, lodScale: 1, floraDensity: 1 },
  ultra: { maxPixelRatio: 2, shadows: true, shadowMapSize: 4096, bloom: true, msaa: 4, lodScale: 1.5, floraDensity: 1 },
};

/**
 * Dynamic resolution: nudges the render scale to keep frame time near the target.
 * Hysteresis + slow adjustment avoid visible oscillation. Each window is judged by its median frame time, not the
 * mean: a GPU that can't keep up is slow on every frame, while a hitch (boot, a shader build, a save) is one long
 * frame that would otherwise pull the mean down, cut the scale and leave the picture soft long after it passed.
 */
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

  /** Returns true when the scale changed. */
  private lastCap = -1;

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
    if (cap !== this.lastCap) {
      this.lastCap = cap;
      this.timer = this.samples = 0;
      return false;
    }
    if (this.samples < this.dts.length) this.dts[this.samples++] = dt;
    this.timer += dt;
    if (this.timer < 1.5) return false;
    const frames = this.dts.subarray(0, this.samples).sort();
    const fps = 1 / Math.max(1e-4, frames[this.samples >> 1]);
    this.timer = this.samples = 0;
    const target = cap > 0 ? cap : this.targetFps;
    const prev = this.scale;
    if (fps < target * 0.85) this.scale = Math.max(this.minScale, this.scale - 0.1);
    else if (fps > target * 0.97 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.05);
    return prev !== this.scale;
  }
}
