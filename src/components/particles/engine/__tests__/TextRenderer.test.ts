/**
 * TextRenderer tests — verify text rendering API.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextRenderer } from '../TextRenderer';

function createMockCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    font: '',
    fillStyle: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
  } as unknown as CanvasRenderingContext2D;
}

describe('TextRenderer', () => {
  let ctx: CanvasRenderingContext2D;
  let text: TextRenderer;

  beforeEach(() => {
    ctx = createMockCtx();
    text = new TextRenderer(ctx);
    text.setDpr(1);
  });

  it('drawLabel calls fillText with uppercase text', () => {
    text.drawLabel('hello', 100, 50);
    // Char-by-char rendering: 5 chars = 5 fillText calls
    expect(ctx.fillText).toHaveBeenCalledTimes(5);
    // First char should be 'H' (uppercased)
    expect(ctx.fillText).toHaveBeenCalledWith('H', expect.any(Number), 50);
  });

  it('drawSubtitle uses lowercase', () => {
    text.drawSubtitle('Hello World', 100, 50);
    // Should NOT uppercase — first char is lowercase 'H' from original
    expect(ctx.fillText).toHaveBeenCalledWith('H', expect.any(Number), 50);
  });

  it('drawCounter draws both label and value', () => {
    text.drawCounter('portée', '80', 200, 100);
    // Label part "portée: " and value part "80" = 2 fillText calls
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
  });

  it('drawSlideNumber renders N/M format', () => {
    text.drawSlideNumber(7, 15, 400, 580);
    expect(ctx.fillText).toHaveBeenCalledWith('7/15', 400, 580);
  });

  it('drawAccent uses letter spacing (char-by-char)', () => {
    text.drawAccent('test', 50, 50);
    // 4 chars with letter spacing = 4 fillText calls
    expect(ctx.fillText).toHaveBeenCalledTimes(4);
  });

  it('fast path when letterSpacing is 0', () => {
    text.draw('hello', 100, 50, { letterSpacing: 0 });
    // Single fillText call (fast path)
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
  });

  it('respects DPR via ctx.scale', () => {
    text.setDpr(2);
    text.drawLabel('X', 100, 50);
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
  });
});
