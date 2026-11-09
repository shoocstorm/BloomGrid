import type { Input } from '@/input/Input';
import type { CityCamera } from '@/input/CityCamera';

/**
 * Power-aware frame pacing. The sim runs at its fixed tick rate regardless; only how often we
 * *render* changes. Active play (the camera moving, a press, drag, wheel or key in the last few
 * seconds, or the cursor moving while a placement tool previews under it) renders at the mode's
 * cap; otherwise the idle cap, which a cursor merely moving over the city does not lift (D-150);
 * an unfocused window drops further. Hidden tabs stop entirely (the browser pauses
 * requestAnimationFrame).
 */
export type PowerMode = 'battery' | 'balanced' | 'max';

export const POWER_MODES: Record<PowerMode, { label: string; active: number; idle: number; background: number }> = {
  battery: { label: 'Battery saver (30 fps)', active: 30, idle: 20, background: 10 },
  balanced: { label: 'Balanced (60 fps, idles at 30)', active: 60, idle: 30, background: 15 },
  max: { label: 'Max (uncapped)', active: 0, idle: 0, background: 30 },
};

const STORAGE_KEY = 'bloomgrid.power';
/** Full rate this long after the last press, drag, wheel or key. */
const IDLE_AFTER_MS = 3000;
/** Full rate this long after the cursor moved, while a placement preview follows it. */
const HOVER_FULL_MS = 400;

export class PowerManager {
  mode: PowerMode = 'balanced';

  constructor(
    private input: Input,
    private camera: CityCamera,
    /** True while the active tool draws a preview under the cursor (build ghosts): hover then counts as active. */
    private hoverPreview: () => boolean = () => false,
  ) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as PowerMode | null;
      if (saved && saved in POWER_MODES) this.mode = saved;
    } catch {
      /* storage unavailable: keep default */
    }
  }

  setMode(mode: PowerMode): void {
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  get idle(): boolean {
    const now = performance.now();
    if (now - this.input.lastActivity <= IDLE_AFTER_MS || this.camera.isMoving()) return false;
    return !(now - this.input.lastHover <= HOVER_FULL_MS && this.hoverPreview());
  }

  targetFps(): number {
    const m = POWER_MODES[this.mode];
    if (typeof document !== 'undefined' && !document.hasFocus()) return m.background;
    return this.idle ? m.idle : m.active;
  }
}
