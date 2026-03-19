/**
 * sceneAdapter — Bridges ParticleScene → Scene (engine/types).
 *
 * ParticleScene manages its own pool/engine internally.
 * This adapter wraps it to satisfy the Scene interface expected by
 * useParticleEngine and ParticleViz's registry system.
 */

import type { Scene, Rect } from '../engine/types';
import type { ParticleEngine } from '../engine/ParticleEngine';
import type { ParticlePool } from '../engine/ParticlePool';
import type { CanvasRenderer } from '../engine/CanvasRenderer';
import type { TextRenderer } from '../engine/TextRenderer';
import type { ParticleScene } from './types';

/**
 * Wrap a self-contained ParticleScene into the registry-compatible Scene interface.
 * The adapter delegates lifecycle to the ParticleScene while ignoring
 * the engine/pool/renderer provided by useParticleEngine (the ParticleScene
 * manages its own internally).
 */
export function adaptScene(ps: ParticleScene, duration = 10): Scene {
  let bounds: Rect = { width: 0, height: 0 };

  return {
    name: ps.name,
    title: ps.title,
    subtitle: ps.description,
    duration,
    particleCount: 0, // ParticleScene manages its own pool
    damping: 0.98,

    setup(_engine: ParticleEngine, _pool: ParticlePool, b: Rect): void {
      bounds = b;
      ps.init(b.width, b.height);
    },

    update(
      _engine: ParticleEngine,
      _pool: ParticlePool,
      time: number,
      dt: number,
      progress: number,
    ): void {
      ps.update(dt, progress, time);
    },

    draw(
      ctx: CanvasRenderingContext2D,
      _renderer: CanvasRenderer,
      _textRenderer: TextRenderer,
      _pool: ParticlePool,
      _time: number,
      _progress: number,
    ): void {
      ps.draw(ctx, bounds.width, bounds.height);
    },

    teardown(): void {
      ps.dispose();
    },

    setData(data: unknown): void {
      ps.setData?.(data);
    },
  };
}
