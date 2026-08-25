/**
 * Fixed-timestep game loop. The simulation always advances in exact SIM_DT
 * steps so physics and shot timing stay identical regardless of frame rate,
 * while rendering runs as fast as the display allows.
 *
 * The clock is normally `requestAnimationFrame`, which is the right choice for
 * a game you are looking at and the wrong one for a game somebody else is also
 * playing: a browser stops rAF dead in a hidden or background tab. Offline that
 * is a feature — the match politely waits for you. Online it means the host
 * alt-tabbing takes the whole game down, and the other player, whose own screen
 * is still drawing, is left holding a controller that does nothing. So an
 * online match sets `backgroundSafe` and gets a second clock, a worker
 * heartbeat, which keeps ticking while the tab is hidden.
 */

/**
 * A timer that survives a hidden tab. Workers are not throttled the way a
 * hidden page's own timers are, so this posts a beat the page can step on.
 */
const HEARTBEAT_WORKER = `
let id = 0;
onmessage = (e) => {
  clearInterval(id);
  if (e.data === 'start') id = setInterval(() => postMessage(0), 8);
};
`;

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

  /**
   * Keep simulating while the tab is hidden. Set by online matches, where
   * somebody else is waiting on this simulation, and left off everywhere else,
   * where stopping with the tab is exactly the right behaviour.
   */
  backgroundSafe = false;

  private worker: Worker | null = null;
  /** When rAF last ran, so the heartbeat knows whether it is needed. */
  private lastRaf = 0;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.lastRaf = this.last;
    this.accumulator = 0;
    this.raf = requestAnimationFrame(this.tick);
    if (this.backgroundSafe) this.startHeartbeat();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stopHeartbeat();
  }

  /**
   * Advance the simulation to `now`, and draw if there is anybody to draw for.
   *
   * Both clocks come through here and both measure from `this.last`, so a frame
   * driven by one can never be counted twice by the other.
   */
  private advance(now: number, allowRender: boolean): void {
    let elapsed = (now - this.last) / 1000;
    this.last = now;
    // A long stall (a laptop lid, a throttled tab) must not fast-forward the
    // match: it catches up at most a quarter second at a time.
    if (elapsed > 0.25) elapsed = 0.25;
    if (elapsed <= 0) return;

    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < 12) {
      this.step(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }

    if (!allowRender) return;

    if (this.fpsCap > 0) {
      if (now < this.nextRenderAt) return;
      this.nextRenderAt = now + 1000 / this.fpsCap;
    }

    this.render(this.accumulator / this.fixedDt, elapsed);

    this.frameTimes.push(elapsed);
    if (this.frameTimes.length > 45) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fps = avg > 0 ? 1 / avg : 0;
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.lastRaf = now;
    this.raf = requestAnimationFrame(this.tick);
    this.advance(now, true);
  };

  /**
   * The hidden-tab beat.
   *
   * The test is not "is the tab hidden" but "has rAF actually stopped", which
   * is the thing that matters and is true in more cases than hiding: an
   * occluded window, a browser that throttles without flipping
   * `document.hidden`, a machine under load. While rAF is running this does
   * nothing, so the two clocks never fight over the accumulator.
   */
  private beat = () => {
    if (!this.running) return;
    const now = performance.now();
    if (now - this.lastRaf < 100) return;
    this.advance(now, false);
  };

  private startHeartbeat(): void {
    if (this.worker || typeof Worker === 'undefined') return;
    try {
      const url = URL.createObjectURL(new Blob([HEARTBEAT_WORKER], { type: 'text/javascript' }));
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.worker.onmessage = this.beat;
      this.worker.postMessage('start');
    } catch {
      // No worker available: the match still plays, it just pauses with the tab.
      this.worker = null;
    }
  }

  private stopHeartbeat(): void {
    if (!this.worker) return;
    this.worker.onmessage = null;
    this.worker.terminate();
    this.worker = null;
  }
}
