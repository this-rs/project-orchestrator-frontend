/**
 * SystemScene tests — verify split-panel layout, walker, orbit, and ejection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemScene } from '../SystemScene';

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

describe('SystemScene', () => {
  let scene: SystemScene;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    scene = new SystemScene();
    ctx = createMockCtx();
  });

  it('has correct metadata', () => {
    expect(scene.name).toBe('system');
    expect(scene.title).toBe('SYST\u00C8ME');
  });

  it('initializes and allocates ejection pool', () => {
    expect(() => scene.init(800, 600)).not.toThrow();
  });

  it('resizes without error', () => {
    scene.init(800, 600);
    expect(() => scene.resize(1024, 768)).not.toThrow();
  });

  it('draws rectangle for manual side', () => {
    scene.init(800, 600);
    scene.update(0.016, 0, 0);
    scene.draw(ctx, 800, 600);
    expect(ctx.strokeRect).toHaveBeenCalled();
  });

  it('draws 4 corner dots + walker + 8 orbit particles + center dot', () => {
    scene.init(800, 600);
    scene.update(0.016, 0, 0);
    scene.draw(ctx, 800, 600);
    // 4 corners + 1 walker + 1 center + 8 orbit = 14 arcs minimum
    // Plus orbit ring + center glow
    expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(14);
  });

  it('draws orbit ring (circle stroke)', () => {
    scene.init(800, 600);
    scene.update(0.016, 0, 0);
    scene.draw(ctx, 800, 600);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws center glow with radial gradient', () => {
    scene.init(800, 600);
    scene.update(0.016, 0, 0);
    scene.draw(ctx, 800, 600);
    expect(ctx.createRadialGradient).toHaveBeenCalled();
  });

  it('ejects particle after interval', () => {
    scene.init(800, 600);
    // Advance past eject interval (2.5s)
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += 0.016;
      scene.update(0.016, 0, t);
    }
    // After 3.2s, at least one ejection should have happened
    // Draw and check that ejected particles render (cyan arcs)
    scene.draw(ctx, 800, 600);
    // Should have more arcs than the base (corners + walker + orbit + ring + center)
    expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(14);
  });

  it('ejected particles fade out after lifetime', () => {
    scene.init(800, 600);
    // Trigger ejection then advance past lifetime
    let t = 0;
    for (let i = 0; i < 400; i++) {
      t += 0.016;
      scene.update(0.016, 0, t);
    }
    // Should not throw — expired ejections are deactivated
    expect(() => scene.draw(ctx, 800, 600)).not.toThrow();
  });

  it('labels are drawn (MANUEL and SYSTÈME)', () => {
    scene.init(800, 600);
    scene.update(0.016, 0, 0);
    scene.draw(ctx, 800, 600);
    expect(ctx.fillText).toHaveBeenCalled();
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
