/**
 * CanvasRenderer tests — verify rendering API and color utilities.
 * Uses a mock CanvasRenderingContext2D since jsdom doesn't support Canvas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasRenderer, colorWithAlpha } from '../CanvasRenderer';
import { ParticlePool } from '../ParticlePool';

// Minimal mock for CanvasRenderingContext2D
function createMockCtx(): CanvasRenderingContext2D {
  const gradient = {
    addColorStop: vi.fn(),
  };
  return {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    translate: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D;
}

describe('colorWithAlpha', () => {
  it('converts #rrggbb to rgba', () => {
    expect(colorWithAlpha('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
  });

  it('converts #rgb shorthand', () => {
    expect(colorWithAlpha('#f00', 1)).toBe('rgba(255,0,0,1)');
  });

  it('replaces alpha in existing rgba string', () => {
    expect(colorWithAlpha('rgba(100,200,50,1)', 0.3)).toBe('rgba(100,200,50,0.3)');
  });

  it('defaults to white for unknown format', () => {
    expect(colorWithAlpha('unknown', 0.7)).toBe('rgba(255,255,255,0.7)');
  });
});

describe('CanvasRenderer', () => {
  let ctx: CanvasRenderingContext2D;
  let renderer: CanvasRenderer;

  beforeEach(() => {
    ctx = createMockCtx();
    renderer = new CanvasRenderer(ctx);
    renderer.resize(800, 600, 1);
  });

  it('clear fills background', () => {
    renderer.clear();
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it('drawParticles calls arc for each active particle', () => {
    const pool = new ParticlePool(16);
    pool.spawn({ x: 10, y: 20, size: 3, color: '#ffffff', opacity: 1 });
    pool.spawn({ x: 30, y: 40, size: 2, color: '#ffffff', opacity: 1 });

    renderer.drawParticles(pool);
    // arc is called for core dots (2 particles) + glow pass (2 gradients)
    expect(ctx.arc).toHaveBeenCalledTimes(2); // core dots only use arc
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it('skips particles with near-zero opacity', () => {
    const pool = new ParticlePool(8);
    const p = pool.spawn({ x: 10, y: 20, opacity: 0.001 })!;
    p.life = 1;

    renderer.drawParticles(pool);
    // opacity * life = 0.001 < 0.01 threshold → skipped
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('drawLine draws a stroked line', () => {
    renderer.drawLine(0, 0, 100, 100, 0.5, 2);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('drawCircle draws a stroked circle', () => {
    renderer.drawCircle(50, 50, 30, 0.5);
    expect(ctx.arc).toHaveBeenCalledWith(50, 50, 30, 0, expect.closeTo(Math.PI * 2, 5));
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('caches gradients for same size bucket + color', () => {
    const pool = new ParticlePool(8);
    // Spawn 3 particles with same size → same gradient bucket
    pool.spawn({ x: 10, y: 10, size: 2, color: '#ffffff', opacity: 0.8 });
    pool.spawn({ x: 20, y: 20, size: 2, color: '#ffffff', opacity: 0.8 });
    pool.spawn({ x: 30, y: 30, size: 2, color: '#ffffff', opacity: 0.8 });

    renderer.drawParticles(pool);
    // Only 1 gradient creation for size bucket 2.0 + #ffffff
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);
  });

  it('creates separate gradients for different colors', () => {
    const pool = new ParticlePool(8);
    pool.spawn({ x: 10, y: 10, size: 2, color: '#ffffff', opacity: 0.8 });
    pool.spawn({ x: 20, y: 20, size: 2, color: '#22d3ee', opacity: 0.8 });

    renderer.drawParticles(pool);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(2);
  });

  it('respects DPR scaling', () => {
    renderer.resize(400, 300, 2);
    renderer.clear();
    // Clears at physical resolution: 400*2, 300*2
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });
});
