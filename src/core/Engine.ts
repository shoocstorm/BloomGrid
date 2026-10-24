import type { FrameInfo, SystemRegistry } from './Systems';

/**
 * Fixed-timestep simulation with variable-rate rendering.
 * The sim advances in `1 / tickRate` steps (scaled by `speed`); render phases get an
 * interpolation `alpha` so visuals stay smooth at any frame rate.
 */
export class Engine<Ctx> {
  speed = 1;
  readonly tickRate: number;
  readonly step: number;
  tick = 0;
  /** Smoothed ms spent in the sim phase per frame, and total frame CPU ms. */
  simMs = 0;
  frameMs = 0;
  fps = 60;
  /** Frames actually rendered since start (for power/perf measurement). */
  frames = 0;
  /**
   * Frame-rate cap provider (0 = uncapped). Called every display refresh; frames arriving sooner
   * than 1/cap are skipped entirely, which is what keeps laptops cool on 120 Hz displays.
   */
  targetFps: () => number = () => 0;

  private acc = 0;
  private last = 0;
  private elapsed = 0;
  private raf = 0;
  private running = false;
  private readonly frame: FrameInfo = { dt: 0, tickDt: 0, alpha: 0, elapsed: 0, tick: 0 };

  constructor(
    private ctx: Ctx,
    private systems: SystemRegistry<Ctx>,
    tickRate = 10,
    private maxStepsPerFrame = 8,
  ) {
    this.tickRate = tickRate;
    this.step = 1 / tickRate;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const cap = this.targetFps();
      // 2 ms tolerance absorbs vsync jitter so a 60 cap on a 120 Hz display renders every 2nd refresh.
      if (cap > 0 && now - this.last < 1000 / cap - 2) return;
      this.runFrame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Advances sim ticks synchronously (used by tests, stress tools, fast-forward). */
  stepTicks(n: number): void {
    const f = this.frame;
    f.tickDt = this.step;
    for (let i = 0; i < n; i++) {
      f.tick = ++this.tick;
      this.systems.run('sim', this.ctx, f);
    }
  }

  private runFrame(now: number): void {
    const t0 = performance.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += dt;
    if (dt > 0) this.fps = this.fps * 0.95 + (1 / dt) * 0.05;

    const f = this.frame;
    f.dt = dt;
    f.elapsed = this.elapsed;

    this.systems.run('input', this.ctx, f);

    const s0 = performance.now();
    this.acc += dt * this.speed;
    let steps = 0;
    while (this.acc >= this.step && steps < this.maxStepsPerFrame) {
      this.acc -= this.step;
      this.stepTicks(1);
      steps++;
    }
    if (steps === this.maxStepsPerFrame) this.acc = 0; // drop backlog rather than spiral
    this.simMs = this.simMs * 0.9 + (performance.now() - s0) * 0.1;

    f.alpha = this.acc / this.step;
    f.tick = this.tick;
    this.systems.run('sync', this.ctx, f);
    this.systems.run('render', this.ctx, f);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    this.frames++;
  }
}
