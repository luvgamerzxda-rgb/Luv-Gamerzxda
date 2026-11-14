/**
 * NovaChat AI - Resilient Streaming Timeout & Lifecycle Manager
 * 
 * Provides three-tier timeout protection:
 * 1. Initial Connection / TTFT Timeout (default 60s, configurable):
 *    Protects against stalled network or provider connection before streaming begins.
 * 2. Stream Idle Timeout (default 30s-60s, configurable):
 *    Resets on every arriving token chunk. Protects against stalled streams without
 *    arbitrarily truncating valid, in-progress responses (such as large code blocks).
 * 3. Overall Application Deadline (up to 15 minutes / 900s for Think mode):
 *    Hard safety limit preventing orphaned hanging processes while supporting deep thinking.
 */

export interface TimeoutEvent {
  phase: 'connect' | 'idle' | 'deadline';
  elapsedMs: number;
  message: string;
}

export class StreamTimeoutController {
  private connectTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private deadlineTimer: NodeJS.Timeout | null = null;
  private isStreamActive = false;
  private isClosed = false;
  private chunkCount = 0;
  private readonly startTime = Date.now();
  private firstTokenTime: number | null = null;

  constructor(
    private readonly onTimeout: (event: TimeoutEvent) => void,
    public readonly connectTimeoutMs: number = 60000,
    public readonly idleTimeoutMs: number = 30000,
    public readonly maxDeadlineMs?: number
  ) {
    this.startConnectTimer();
    this.startDeadlineTimer();
  }

  private startConnectTimer() {
    this.connectTimer = setTimeout(() => {
      if (!this.isClosed && !this.isStreamActive) {
        const elapsedMs = Date.now() - this.startTime;
        this.onTimeout({
          phase: 'connect',
          elapsedMs,
          message: `Request timed out waiting for AI provider response after ${Math.round(this.connectTimeoutMs / 1000)} seconds. Please try again.`,
        });
      }
    }, this.connectTimeoutMs);
  }

  private startDeadlineTimer() {
    if (this.maxDeadlineMs && this.maxDeadlineMs > 0) {
      this.deadlineTimer = setTimeout(() => {
        if (!this.isClosed) {
          const elapsedMs = Date.now() - this.startTime;
          this.onTimeout({
            phase: 'deadline',
            elapsedMs,
            message: `Request reached the maximum application safety limit of ${Math.round(this.maxDeadlineMs! / 60000)} minutes. Safe termination applied.`,
          });
        }
      }, this.maxDeadlineMs);
    }
  }

  public notifyStreamStarted() {
    if (this.isClosed) return;
    this.isStreamActive = true;
    if (this.firstTokenTime === null) {
      this.firstTokenTime = Date.now();
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.resetIdleTimer();
  }

  public notifyDataReceived() {
    if (this.isClosed) return;
    this.chunkCount++;
    if (!this.isStreamActive) {
      this.notifyStreamStarted();
    } else {
      this.resetIdleTimer();
    }
  }

  private resetIdleTimer() {
    if (this.isClosed) return;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      if (!this.isClosed) {
        const elapsedMs = Date.now() - this.startTime;
        this.onTimeout({
          phase: 'idle',
          elapsedMs,
          message: `Stream stalled: no tokens received for ${Math.round(this.idleTimeoutMs / 1000)} seconds. Please try again.`,
        });
      }
    }, this.idleTimeoutMs);
  }

  public getRemainingWorkTime(workDeadlineMs: number = 13 * 60 * 1000): number {
    return Math.max(0, workDeadlineMs - (Date.now() - this.startTime));
  }

  public getMetrics() {
    const now = Date.now();
    return {
      startTime: this.startTime,
      elapsedMs: now - this.startTime,
      ttftMs: this.firstTokenTime !== null ? this.firstTokenTime - this.startTime : null,
      chunkCount: this.chunkCount,
      isStreamActive: this.isStreamActive,
      isClosed: this.isClosed,
      maxDeadlineMs: this.maxDeadlineMs || null,
    };
  }

  public clear() {
    this.isClosed = true;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.deadlineTimer) {
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
  }
}
