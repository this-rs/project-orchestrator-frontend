/**
 * Scene Interface — Contract for all particle visualization scenes.
 *
 * Each scene manages its own particles + custom rendering.
 * Progress is 0..1 (looping), driven by ParticleViz.
 */

export interface ParticleScene {
  /** Scene metadata */
  readonly name: string;
  readonly title: string;
  readonly description: string;

  /** Called once when canvas is ready */
  init(width: number, height: number): void;

  /** Called on canvas resize */
  resize(width: number, height: number): void;

  /** Called every frame. dt in seconds, progress in 0..1, time in seconds */
  update(dt: number, progress: number, time: number): void;

  /** Render everything to the canvas context */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  /** Cleanup on unmount */
  dispose(): void;

  /** Optional: inject external data */
  setData?(data: unknown): void;

  /** Optional: expose pool for hit-testing in interactive mode */
  getPool?(): import('../engine/ParticlePool').ParticlePool | null;
}

/** Easing functions — zero-alloc */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeInQuad(t: number): number {
  return t * t;
}

export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
