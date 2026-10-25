import type { Input } from '@/input/Input';
import type { CityCamera } from '@/input/CityCamera';

/**
 * Power-aware frame pacing. The sim runs at its fixed tick rate regardless; only how often we
 * *render* changes. Active play renders at the mode's cap; after a few seconds without input
 * (camera at rest) it drops to the idle cap; an unfocused window drops further. Hidden tabs
 * stop entirely (the browser pauses requestAnimationFrame).
 */
export type PowerMode = 'battery' | 'balanced' | 'max';

export const POWER_MODES: Record<PowerMode, { label: string; active: number; idle: number; background: number }> = {
  battery: { label: 'Battery saver (30 fps)', active: 30, idle: 20, background: 10 },
  balanced: { label: 'Balanced (60 fps, idles at 30)', active: 60, idle: 30, background: 15 },
  max: { label: 'Max (uncapped)', active: 0, idle: 0, background: 30 },
};

const STORAGE_KEY = 'bloomgrid.power';
const IDLE_AFTER_MS = 6000;

export class PowerManager {
  mode: PowerMode = 'balanced';

  constructor(
    private input: Input,
    private camera: CityCamera,
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
    return performance.now() - this.input.lastActivity > IDLE_AFTER_MS && !this.camera.isMoving();
  }

  targetFps(): number {
    const m = POWER_MODES[this.mode];
    if (typeof document !== 'undefined' && !document.hasFocus()) return m.background;
    return this.idle ? m.idle : m.active;
  }
}
