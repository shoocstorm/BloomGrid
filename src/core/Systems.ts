/**
 * Systems run in ordered phases:
 *  - `input`  per frame, before simulation
 *  - `sim`    fixed timestep (deterministic, renderer-agnostic)
 *  - `sync`   per frame, mirrors sim state into render objects
 *  - `render` per frame, draws
 */
export type SystemPhase = 'input' | 'sim' | 'sync' | 'render';

export interface FrameInfo {
  /** Seconds since last frame (real time, clamped). */
  dt: number;
  /** Seconds since last tick (sim time). Only meaningful in `sim` phase. */
  tickDt: number;
  /** Interpolation factor between the last two sim ticks, [0,1). */
  alpha: number;
  /** Real elapsed seconds since start. */
  elapsed: number;
  tick: number;
}

export interface System<Ctx> {
  id: string;
  phase: SystemPhase;
  /** Lower runs first within a phase. Default 0. */
  order?: number;
  enabled?: boolean;
  update(ctx: Ctx, frame: FrameInfo): void;
}

const PHASES: SystemPhase[] = ['input', 'sim', 'sync', 'render'];

export class SystemRegistry<Ctx> {
  private byPhase = new Map<SystemPhase, System<Ctx>[]>(PHASES.map((p) => [p, []]));
  /** Rolling per-system timings in ms (for the perf overlay). */
  readonly timings = new Map<string, number>();
  profile = false;

  add(system: System<Ctx>): () => void {
    const list = this.byPhase.get(system.phase)!;
    if (list.some((s) => s.id === system.id)) throw new Error(`System "${system.id}" already registered`);
    list.push(system);
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return () => list.splice(list.indexOf(system), 1);
  }

  run(phase: SystemPhase, ctx: Ctx, frame: FrameInfo): void {
    const list = this.byPhase.get(phase)!;
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      if (s.enabled === false) continue;
      if (this.profile) {
        const t0 = performance.now();
        s.update(ctx, frame);
        const ms = performance.now() - t0;
        this.timings.set(s.id, (this.timings.get(s.id) ?? ms) * 0.9 + ms * 0.1);
      } else {
        s.update(ctx, frame);
      }
    }
  }
}
