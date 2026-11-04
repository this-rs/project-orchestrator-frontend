// ============================================================================
// frameAnimator — ONE requestAnimationFrame loop, alive only while it has work
// ============================================================================
//
// The 3D graph renders on demand (useRenderLoop): nothing draws unless a code
// path calls `wake(ms)`. Transient animations (an entity pulse, a working
// agent's breathing) need a per-frame writer AND a renderer that is awake for
// as long as they last. This class owns that single rAF loop:
//
//   * a job is `(now) => boolean` — it writes its attributes and returns
//     `true` to be called again on the next frame, `false` when it is done;
//   * the loop starts on the first job and STOPS ITSELF when the last job
//     returns false — there is no permanent rAF, by construction;
//   * every frame calls `wake(FRAME_WAKE_MS)`, so the renderer draws what the
//     jobs wrote and goes back to sleep a few frames after they end.
//
// Scheduling is injected so the loop is testable without a browser.
// ============================================================================

/** How long the renderer stays awake after each animated frame, ms. */
export const FRAME_WAKE_MS = 120

export type FrameJob = (nowMs: number) => boolean

export interface FrameScheduler {
  request: (cb: (now: number) => void) => number
  cancel: (handle: number) => void
}

const browserScheduler: FrameScheduler = {
  request: (cb) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : 0),
  cancel: (h) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h)
  },
}

export class FrameAnimator {
  private readonly jobs = new Set<FrameJob>()
  private handle = 0
  private running = false

  constructor(
    private readonly wake: (ms?: number) => void,
    private readonly scheduler: FrameScheduler = browserScheduler,
  ) {}

  /** Number of jobs alive. 0 ⇒ no frame is scheduled. */
  get size(): number {
    return this.jobs.size
  }

  get isRunning(): boolean {
    return this.running
  }

  /** Register a job; starts the loop if it was idle. Adding twice is a no-op. */
  add(job: FrameJob): void {
    this.jobs.add(job)
    this.start()
  }

  remove(job: FrameJob): void {
    this.jobs.delete(job)
    if (this.jobs.size === 0) this.stop()
  }

  /** Draw one frame without a job: for a one-off imperative write. */
  wakeOnce(): void {
    this.wake(FRAME_WAKE_MS)
  }

  /** Drop every job and cancel the pending frame. */
  dispose(): void {
    this.jobs.clear()
    this.stop()
  }

  private start(): void {
    if (this.running) return
    this.running = true
    this.handle = this.scheduler.request(this.frame)
  }

  private stop(): void {
    if (!this.running) return
    this.running = false
    this.scheduler.cancel(this.handle)
    this.handle = 0
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return
    for (const job of [...this.jobs]) {
      let keep = false
      try {
        keep = job(now)
      } catch {
        keep = false
      }
      if (!keep) this.jobs.delete(job)
    }
    if (this.jobs.size > 0) {
      this.wake(FRAME_WAKE_MS)
      this.handle = this.scheduler.request(this.frame)
    } else {
      // Last frame of the animation: wake once more so the restored base
      // styles written by the final job call are actually drawn.
      this.wake(FRAME_WAKE_MS)
      this.running = false
      this.handle = 0
    }
  }
}
