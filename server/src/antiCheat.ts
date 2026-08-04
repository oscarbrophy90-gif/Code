import { INPUT_HZ, type PackedInput } from '@hoops/shared';

export interface CheatFinding {
  code: string;
  detail: string;
  /** 0..1 — how confident we are this was not legitimate play */
  severity: number;
}

const MAX_INPUT_BURST = INPUT_HZ * 3;
const AXIS_LIMIT = 128;

/**
 * Server-side validation. The authoritative sim already makes wall-hacks and
 * teleports impossible, so this layer targets what is left: input flooding,
 * impossible axis values, superhuman action rates, and statistically
 * implausible shot timing (the classic auto-green macro).
 */
export class AntiCheat {
  private inputsThisSecond = 0;
  private windowStart = Date.now();
  private lastFrame = -1;
  private outOfOrder = 0;
  private moveTimestamps: number[] = [];
  private releaseErrors: number[] = [];
  private findings: CheatFinding[] = [];

  /** Returns false when the input should be dropped outright. */
  acceptInput(frame: number, input: PackedInput): boolean {
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.inputsThisSecond = 0;
    }
    this.inputsThisSecond++;

    if (this.inputsThisSecond > MAX_INPUT_BURST) {
      this.flag('input_flood', `${this.inputsThisSecond} inputs in one second`, 0.9);
      return false;
    }

    if (!Number.isFinite(frame) || frame < 0 || frame > 1e9) {
      this.flag('bad_frame', `frame ${frame}`, 1);
      return false;
    }

    // Replayed or reordered frames are dropped rather than trusted.
    if (frame <= this.lastFrame) {
      this.outOfOrder++;
      if (this.outOfOrder > INPUT_HZ * 2) {
        this.flag('replay', `${this.outOfOrder} stale frames`, 0.7);
      }
      return false;
    }
    this.lastFrame = frame;

    for (const axis of [input.mx, input.mz, input.dx, input.dz]) {
      if (!Number.isFinite(axis) || Math.abs(axis) > AXIS_LIMIT) {
        this.flag('axis_range', `axis ${axis}`, 1);
        return false;
      }
    }

    if (!Number.isFinite(input.f) || input.f < 0 || input.f > 63) {
      this.flag('flag_range', `flags ${input.f}`, 1);
      return false;
    }

    if (!Number.isInteger(input.m) || input.m < 0 || input.m > 12) {
      this.flag('move_range', `move ${input.m}`, 1);
      return false;
    }

    if (input.m > 0) {
      this.moveTimestamps.push(now);
      while (this.moveTimestamps.length && now - this.moveTimestamps[0] > 2000) this.moveTimestamps.shift();
      // No human chains more than about ten dribble moves in two seconds; the
      // animations themselves take longer than that.
      if (this.moveTimestamps.length > 14) {
        this.flag('move_spam', `${this.moveTimestamps.length} moves in 2s`, 0.85);
      }
    }

    return true;
  }

  /**
   * Records the timing error of a resolved shot. A human's errors form a broad
   * distribution; a timing macro produces a near-zero variance spike.
   */
  recordRelease(timingError: number): void {
    this.releaseErrors.push(Math.abs(timingError));
    if (this.releaseErrors.length < 25) return;
    if (this.releaseErrors.length > 80) this.releaseErrors.shift();

    const n = this.releaseErrors.length;
    const mean = this.releaseErrors.reduce((a, b) => a + b, 0) / n;
    const variance = this.releaseErrors.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    // Even the best human players sit well above these bounds.
    if (mean < 0.006 && stdDev < 0.004) {
      this.flag('timing_macro', `mean ${mean.toFixed(4)}, sd ${stdDev.toFixed(4)} over ${n} shots`, 0.95);
    }
  }

  private flag(code: string, detail: string, severity: number): void {
    const existing = this.findings.find((f) => f.code === code);
    if (existing) {
      existing.severity = Math.max(existing.severity, severity);
      existing.detail = detail;
      return;
    }
    this.findings.push({ code, detail, severity });
  }

  /** True once the evidence is strong enough to end the session. */
  shouldKick(): boolean {
    return this.findings.some((f) => f.severity >= 0.9);
  }

  report(): CheatFinding[] {
    return [...this.findings];
  }
}
