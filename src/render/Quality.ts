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
/**
 * A drop must pay for itself (D-204): it is judged over the next `PROBE` windows and kept only if the frame rate rose
 * by `GAIN` (or now meets the target). Otherwise the frames were slow for another reason (the sim, the main thread),
 * fewer pixels can't help, full scale comes back and no drop is tried for `NO_DROP` seconds.
 */
const PROBE = 2;
const GAIN = 1.08;
const NO_DROP = 300;

export class DynamicResolution {
  scale = 1;
  enabled = true;
  private timer = 0;
  private samples = 0;
  private readonly dts = new Float32Array(1024);
  /** Seconds of frames still to pass before judging (boot, a city change: uploads, fly-ins and grow-ins). */
  private grace = 0;
  private held = false;

  /** The drop on trial: the scale before it, the frame rate that caused it, windows judged since. */
  private probe: { from: number; fps: number; windows: number } | null = null;
  /** Seconds left in which no drop is tried (the last one didn't help). */
  private noDrop = 0;

  constructor(
    private targetFps = 55,
    /** 0.7, not lower: below it the picture turns visibly soft for little gain (D-204). */
    private minScale = 0.7,
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
    this.probe = null;
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
    if (this.noDrop > 0) this.noDrop -= dt;
    if (cap !== this.lastCap) {
      this.lastCap = cap;
      if (cap === 0 || this.activeCap === -1 || (this.activeCap !== 0 && cap > this.activeCap)) this.activeCap = cap;
      // A new cap starts a new window; the streaks carry on (idle spells between moves no longer wipe a recovery).
      this.timer = this.samples = 0;
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
    // A drop on trial: kept once it pays, undone if it doesn't.
    if (this.probe) {
      const p = this.probe;
      if (fps >= p.fps * GAIN || fps > target * 0.97) this.probe = null;
      else if (++p.windows >= PROBE) {
        this.scale = p.from;
        this.probe = null;
        this.noDrop = NO_DROP;
        this.misses = this.goods = 0;
        this.sinceChange = 0;
        log(`[dynres] back to ${this.scale.toFixed(2)}: lower resolution didn't speed frames up (${fps.toFixed(0)} fps), not GPU-bound`);
        return true;
      }
      if (this.probe) return false;
    }
    this.misses = fps < target * 0.85 ? this.misses + 1 : 0;
    if (atActive) this.goods = fps > target * 0.97 ? this.goods + 1 : 0;
    if (this.misses >= 2 && this.scale > this.minScale && this.noDrop <= 0) {
      this.scale = Math.max(this.minScale, this.scale - STEP);
      this.probe = { from: prev, fps, windows: 0 };
    } else if (this.goods >= 3 && this.scale < 1 && this.sinceChange >= RECOVER_AFTER) this.scale = Math.min(1, this.scale + STEP);
    if (prev === this.scale) return false;
    log(`[dynres] scale ${prev.toFixed(2)} → ${this.scale.toFixed(2)} (${fps.toFixed(0)} fps against ${target})`);
    this.misses = this.goods = 0;
    this.sinceChange = 0;
    return true;
  }
}

/** Scale changes are rare and worth a line in the console (and in `bun run snap`'s output). */
function log(text: string): void {
  if (typeof console !== 'undefined' && !(globalThis as { __vitest_worker__?: unknown }).__vitest_worker__) console.info(text);
}
