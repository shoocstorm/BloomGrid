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
  high: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 2048, bloom: true, msaa: 4, lodScale: 1, floraDensity: 1 },
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
  update(dt: number): boolean {
    if (!this.enabled) return false;
    this.sum += dt;
    this.samples++;
    this.timer += dt;
    if (this.timer < 1.5) return false;
    const fps = this.samples / this.sum;
    this.timer = this.sum = this.samples = 0;
    const prev = this.scale;
    if (fps < this.targetFps - 5) this.scale = Math.max(this.minScale, this.scale - 0.1);
    else if (fps > this.targetFps + 3 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.05);
    return prev !== this.scale;
  }
}
