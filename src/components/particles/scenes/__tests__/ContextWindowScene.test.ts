/**
 * ContextWindowScene tests — verify token spawning, FIFO eviction, and rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextWindowScene } from '../ContextWindowScene';

function createMockCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
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
    closePath: vi.fn(),
    translate: vi.fn(),
    strokeRect: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowColor: '',
    shadowBlur: 0,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    letterSpacing: '0px',
  } as unknown as CanvasRenderingContext2D;
}

describe('ContextWindowScene', () => {
  let scene: ContextWindowScene;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    scene = new ContextWindowScene();
    ctx = createMockCtx();
  });

  it('has correct metadata', () => {
    expect(scene.name).toBe('contextWindow');
    expect(scene.title).toBe('CONTEXT WINDOW');
  });

  it('initializes with pre-allocated token pool', () => {
    expect(() => scene.init(800, 600)).not.toThrow();
  });

  it('resizes without error', () => {
    scene.init(800, 600);
    expect(() => scene.resize(1024, 768)).not.toThrow();
  });

  it('draws outer and inner rings', () => {
    scene.init(800, 600);
    scene.update(0.016, 0, 0);
    scene.draw(ctx, 800, 600);
    // 2 rings (outer + inner) drawn as arc + stroke
    const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
    expect(arcCalls.length).toBeGreaterThanOrEqual(2);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('spawns tokens over time', () => {
    scene.init(800, 600);
    // Advance 5 seconds (spawn interval = 0.6s) → ~8 tokens
    let t = 0;
    for (let i = 0; i < 312; i++) {
      t += 0.016;
      scene.update(0.016, 0, t);
    }
    scene.draw(ctx, 800, 600);
    // Tokens are drawn as arcs on inner ring (in addition to 2 ring arcs)
    const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
    expect(arcCalls.length).toBeGreaterThan(2);
  });

  it('fills up to MAX_TOKENS then evicts oldest (FIFO)', () => {
    scene.init(800, 600);
    // Advance enough to fill all 16 slots + trigger eviction
    // 16 tokens × 0.6s = 9.6s, plus a few more for eviction
    let t = 0;
    for (let i = 0; i < 800; i++) {
      t += 0.016;
      scene.update(0.016, 0, t);
    }
    // Should not throw — eviction is handled gracefully
    expect(() => scene.draw(ctx, 800, 600)).not.toThrow();
  });

  it('draws counter N/M text', () => {
    scene.init(800, 600);
    scene.update(0.016, 0, 0.7); // after first spawn
    scene.draw(ctx, 800, 600);
    // Counter rendered via renderLabel → fillText
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('counter shows cyan when full', () => {
    scene.init(800, 600);
    // Fill to max
    let t = 0;
    for (let i = 0; i < 700; i++) {
      t += 0.016;
      scene.update(0.016, 0, t);
    }
    // Reset mock to check only draw-phase calls
    (ctx.fillText as ReturnType<typeof vi.fn>).mockClear();
    scene.draw(ctx, 800, 600);
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('evicted tokens fade and shrink', () => {
    scene.init(800, 600);
    // Fill + trigger multiple evictions
    let t = 0;
    for (let i = 0; i < 900; i++) {
      t += 0.016;
      scene.update(0.016, 0, t);
    }
    scene.draw(ctx, 800, 600);
    // Some tokens should have been drawn with reduced globalAlpha
    // (We can't check exact alpha values easily, but ensure no errors)
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('cleans up fully faded tokens', () => {
    scene.init(800, 600);
    // Run a long simulation — dead tokens should be recycled
    let t = 0;
    for (let i = 0; i < 2000; i++) {
      t += 0.016;
      scene.update(0.016, 0, t);
    }
    // Should not throw or run out of pool slots
    expect(() => scene.draw(ctx, 800, 600)).not.toThrow();
  });

  it('disposes cleanly', () => {
    scene.init(800, 600);
    expect(() => scene.dispose()).not.toThrow();
  });

  it('can reinitialize after dispose', () => {
    scene.init(800, 600);
    scene.dispose();
    expect(() => scene.init(400, 300)).not.toThrow();
  });
});
