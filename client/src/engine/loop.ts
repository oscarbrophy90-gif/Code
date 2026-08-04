/**
 * Fixed-timestep game loop. The simulation always advances in exact SIM_DT
 * steps so physics and shot timing stay identical regardless of frame rate,
 * while rendering runs as fast as the display allows.
 */
export class GameLoop {
  private raf = 0;
  private last = 0;
  private accumulator = 0;
  private running = false;
  private frameTimes: number[] = [];
  private nextRenderAt = 0;

  fps = 0;

  constructor(
    private step: (dt: number) => void,
    private render: (alpha: number, dt: number) => void,
    private fixedDt: number,
  ) {}

  /** 0 = uncapped, otherwise the render cap in frames per second. */
  fpsCap = 0;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    let elapsed = (now - this.last) / 1000;
    this.last = now;
    // A long stall (tab switch) must not fast-forward the match.
    if (elapsed > 0.25) elapsed = 0.25;

    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < 12) {
      this.step(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }

    if (this.fpsCap > 0) {
      if (now < this.nextRenderAt) return;
      this.nextRenderAt = now + 1000 / this.fpsCap;
    }

    this.render(this.accumulator / this.fixedDt, elapsed);

    this.frameTimes.push(elapsed);
    if (this.frameTimes.length > 45) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fps = avg > 0 ? 1 / avg : 0;
  };
}
