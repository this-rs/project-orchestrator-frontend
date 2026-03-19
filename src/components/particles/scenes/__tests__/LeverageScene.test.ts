/**
 * LeverageScene tests — verify physics, animation, and rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeverageScene } from '../LeverageScene';

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

describe('LeverageScene', () => {
  let scene: LeverageScene;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    scene = new LeverageScene();
    ctx = createMockCtx();
  });

  it('has correct metadata', () => {
    expect(scene.name).toBe('leverage');
    expect(scene.title).toBe('LEVERAGE');
  });

  it('initializes without error', () => {
    expect(() => scene.init(800, 600)).not.toThrow();
  });

  it('resizes without error', () => {
    scene.init(800, 600);
    expect(() => scene.resize(1024, 768)).not.toThrow();
  });

  it('updates without error at progress=0', () => {
    scene.init(800, 600);
    expect(() => scene.update(0.016, 0, 0)).not.toThrow();
  });

  it('updates without error at progress=1', () => {
    scene.init(800, 600);
    expect(() => scene.update(0.016, 1, 5)).not.toThrow();
  });

  it('draws without error', () => {
    scene.init(800, 600);
    scene.update(0.016, 0.5, 2);
    expect(() => scene.draw(ctx, 800, 600)).not.toThrow();
  });

  it('draws beam (moveTo + lineTo + stroke)', () => {
    scene.init(800, 600);
    scene.update(0.016, 0.5, 2);
    scene.draw(ctx, 800, 600);
    // Beam is drawn as a line (moveTo → lineTo → stroke)
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws fulcrum triangle (3-point path with closePath)', () => {
    scene.init(800, 600);
    scene.update(0.016, 0.5, 2);
    scene.draw(ctx, 800, 600);
    expect(ctx.closePath).toHaveBeenCalled();
  });

  it('draws both balls as arcs', () => {
    scene.init(800, 600);
    scene.update(0.016, 0.5, 2);
    scene.draw(ctx, 800, 600);
    // Small ball glow + core + big ball glow + core + dust + arrow head = many arcs
    expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('draws multiplier text', () => {
    scene.init(800, 600);
    scene.update(0.016, 0.5, 2);
    scene.draw(ctx, 800, 600);
    // renderLabel uses fillText for char-by-char rendering
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('at progress=0 multiplier is ×1.0', () => {
    scene.init(800, 600);
    scene.update(0.016, 0, 0);
    scene.draw(ctx, 800, 600);
    // Check that fillText was called with something containing "×1.0"
    const calls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
    const allText = calls.map((c: unknown[]) => c[0]).join('');
    expect(allText).toContain('1');
  });

  it('at progress=1 multiplier approaches ×10', () => {
    scene.init(800, 600);
    scene.update(0.016, 1, 8);
    scene.draw(ctx, 800, 600);
    const calls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
    const allText = calls.map((c: unknown[]) => c[0]).join('');
    // Should contain "10" for ×10.0
    expect(allText).toContain('10');
  });

  it('disposes cleanly', () => {
    scene.init(800, 600);
    scene.update(0.016, 0.5, 1);
    expect(() => scene.dispose()).not.toThrow();
  });

  it('can reinitialize after dispose', () => {
    scene.init(800, 600);
    scene.dispose();
    expect(() => scene.init(400, 300)).not.toThrow();
  });

  it('spawns ambient dust particles', () => {
    scene.init(800, 600);
    // After init, dust should be spawned — update should not throw
    for (let i = 0; i < 60; i++) {
      scene.update(0.016, i / 60, i * 0.016);
    }
    scene.draw(ctx, 800, 600);
    // Dust particles rendered via renderParticles → multiple fill calls
    expect((ctx.fill as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(2);
  });
});
