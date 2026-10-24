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
 * Hysteresis + slow adjustment avoid visible oscillation.
 */
export class DynamicResolution {
  scale = 1;
  enabled = true;
  private timer = 0;
  private samples = 0;
  private sum = 0;

  constructor(
    private targetFps = 55,
    private minScale = 0.5,
  ) {}

  /** Returns true when the scale changed. */
  private lastCap = -1;

  /**
   * `cap` is the current frame-rate cap (0 = uncapped → judged against `targetFps`). The scale
   * only drops when frames miss the cap, so deliberate throttling (idle / battery) never
   * lowers resolution.
   */
  update(dt: number, cap = 0): boolean {
    if (!this.enabled) return false;
    if (cap !== this.lastCap) {
      this.lastCap = cap;
      this.timer = this.sum = this.samples = 0;
      return false;
    }
    this.sum += dt;
    this.samples++;
    this.timer += dt;
    if (this.timer < 1.5) return false;
    const fps = this.samples / this.sum;
    this.timer = this.sum = this.samples = 0;
    const target = cap > 0 ? cap : this.targetFps;
    const prev = this.scale;
    if (fps < target * 0.85) this.scale = Math.max(this.minScale, this.scale - 0.1);
    else if (fps > target * 0.97 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.05);
    return prev !== this.scale;
  }
}
