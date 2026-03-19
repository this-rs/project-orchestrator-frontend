/**
 * SceneAdapter — Bridges the engine Scene interface to ParticleScene.
 *
 * Scene (engine/types.ts) expects engine/pool/renderer as params.
 * ParticleScene (scenes/types.ts) is self-contained.
 * This adapter creates the engine infrastructure and delegates.
 */

import type { ParticleScene } from './scenes/types';
import type { Scene } from './engine/types';
import { ParticlePool } from './engine/ParticlePool';
import { ParticleEngine } from './engine/ParticleEngine';
import { CanvasRenderer } from './engine/CanvasRenderer';
import { TextRenderer } from './engine/TextRenderer';

export class SceneAdapter implements ParticleScene {
  readonly name: string;
  readonly title: string;
  readonly description: string;

  private scene: Scene;
  private pool: ParticlePool;
  private engine: ParticleEngine;
  private canvasRenderer: CanvasRenderer | null = null;
  private textRenderer: TextRenderer | null = null;
  private initialized = false;

  constructor(scene: Scene) {
    this.scene = scene;
    this.name = scene.name;
    this.title = scene.title;
    this.description = scene.subtitle;
    this.pool = new ParticlePool(scene.particleCount);
    this.engine = new ParticleEngine(this.pool, scene.damping);
  }

  init(width: number, height: number): void {
    this.scene.setup(this.engine, this.pool, { width, height });
    this.initialized = true;
  }

  resize(width: number, height: number): void {
    if (this.canvasRenderer) {
      this.canvasRenderer.resize(width, height, window.devicePixelRatio || 1);
    }
    // Re-setup with new bounds
    if (this.initialized) {
      this.scene.teardown();
      this.pool.reset();
      this.engine.clearForces();
      this.scene.setup(this.engine, this.pool, { width, height });
    }
  }

  update(dt: number, progress: number, time: number): void {
    this.scene.update(this.engine, this.pool, time, dt, progress);
    this.engine.step(dt, time);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.canvasRenderer) {
      this.canvasRenderer = new CanvasRenderer(ctx);
      this.canvasRenderer.resize(width, height, window.devicePixelRatio || 1);
    } else {
      this.canvasRenderer.setContext(ctx);
    }

    if (!this.textRenderer) {
      this.textRenderer = new TextRenderer(ctx);
      this.textRenderer.setDpr(1); // DPR already handled by ParticleViz transform
    } else {
      this.textRenderer.setContext(ctx);
    }

    this.scene.draw(ctx, this.canvasRenderer, this.textRenderer, this.pool, 0, 0);
  }

  dispose(): void {
    this.scene.teardown();
    this.pool.reset();
    this.engine.clearForces();
    this.canvasRenderer?.clearCache();
    this.initialized = false;
  }

  setData(data: unknown): void {
    this.scene.setData?.(data);
  }
}
