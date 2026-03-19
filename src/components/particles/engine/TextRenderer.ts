/**
 * TextRenderer — Monospace text overlays for particle scenes.
 *
 * Cosmos/terminal aesthetic: JetBrains Mono, uppercase, letter-spacing.
 * Canvas 2D doesn't support letter-spacing natively, so we draw char-by-char.
 * Cyan (#22d3ee) for accent values.
 */

import { colorWithAlpha } from './CanvasRenderer';

// ── Constants ───────────────────────────────────────────────

const FONT_FAMILY = "'JetBrains Mono', monospace";
const ACCENT_COLOR = '#22d3ee';

// ── Text Style ──────────────────────────────────────────────

export interface TextStyle {
  font: string;
  color: string;
  letterSpacing: number; // px between characters
  uppercase: boolean;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
}

const DEFAULT_STYLE: TextStyle = {
  font: '12px "JetBrains Mono", monospace',
  color: 'rgba(255,255,255,0.7)',
  letterSpacing: 2.4,
  uppercase: true,
  align: 'center',
  baseline: 'middle',
};

// ── Counter Options ─────────────────────────────────────────

export interface CounterOptions {
  labelSize?: number;
  valueSize?: number;
  labelColor?: string;
  valueColor?: string;
  opacity?: number;
}

// ── TextRenderer ────────────────────────────────────────────

export class TextRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setContext(ctx: CanvasRenderingContext2D): void {
    this.ctx = ctx;
  }

  setDpr(dpr: number): void {
    this.dpr = dpr;
  }

  /**
   * Draw text with letter-spacing at (x, y) in logical pixels.
   * Core method used by all other draw methods.
   */
  draw(
    text: string,
    x: number,
    y: number,
    style: Partial<TextStyle> = {},
  ): void {
    const s = { ...DEFAULT_STYLE, ...style };
    const { ctx, dpr } = this;
    const str = s.uppercase ? text.toUpperCase() : text;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.font = s.font;
    ctx.fillStyle = s.color;
    ctx.textBaseline = s.baseline;

    if (s.letterSpacing <= 0) {
      // Fast path: no letter-spacing
      ctx.textAlign = s.align;
      ctx.fillText(str, x, y);
    } else {
      // Measure total width for alignment
      const chars = [...str];
      let totalWidth = 0;
      for (const ch of chars) {
        totalWidth += ctx.measureText(ch).width + s.letterSpacing;
      }
      totalWidth -= s.letterSpacing; // no spacing after last char

      let startX = x;
      if (s.align === 'center') startX = x - totalWidth / 2;
      else if (s.align === 'right') startX = x - totalWidth;

      ctx.textAlign = 'left';
      let cx = startX;
      for (const ch of chars) {
        ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + s.letterSpacing;
      }
    }

    ctx.restore();
  }

  /**
   * Draw a label (uppercase, letter-spaced, white).
   */
  drawLabel(
    text: string,
    x: number,
    y: number,
    size: number = 14,
    opacity: number = 0.9,
  ): void {
    this.draw(text, x, y, {
      font: `${size}px ${FONT_FAMILY}`,
      color: colorWithAlpha('#ffffff', opacity),
      letterSpacing: 3.2,
    });
  }

  /**
   * Draw subtitle text (smaller, dimmer, not uppercase).
   */
  drawSubtitle(text: string, x: number, y: number): void {
    this.draw(text, x, y, {
      font: `11px ${FONT_FAMILY}`,
      color: 'rgba(255,255,255,0.4)',
      letterSpacing: 2,
      uppercase: false,
    });
  }

  /**
   * Draw accent text (cyan).
   */
  drawAccent(text: string, x: number, y: number): void {
    this.draw(text, x, y, {
      font: `12px ${FONT_FAMILY}`,
      color: ACCENT_COLOR,
      letterSpacing: 2.4,
    });
  }

  /**
   * Draw a "label: value" counter (e.g. "portée: 80").
   * Label in dim white, value in accent cyan.
   */
  drawCounter(
    label: string,
    value: string | number,
    x: number,
    y: number,
    options: CounterOptions = {},
  ): void {
    const {
      labelSize = 12,
      valueSize = 14,
      labelColor = '#888888',
      valueColor = ACCENT_COLOR,
      opacity = 1,
    } = options;
    const { ctx, dpr } = this;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.textBaseline = 'middle';

    const labelText = `${label}: `;
    const valueText = String(value);

    // Measure widths to center the combined text
    ctx.font = `${labelSize}px ${FONT_FAMILY}`;
    const labelWidth = ctx.measureText(labelText).width;

    ctx.font = `${valueSize}px ${FONT_FAMILY}`;
    const valueWidth = ctx.measureText(valueText).width;

    const totalWidth = labelWidth + valueWidth;
    const startX = x - totalWidth / 2;

    // Draw label part
    ctx.font = `${labelSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = colorWithAlpha(labelColor, opacity);
    ctx.textAlign = 'left';
    ctx.fillText(labelText, startX, y);

    // Draw value part (cyan accent)
    ctx.font = `${valueSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = colorWithAlpha(valueColor, opacity);
    ctx.fillText(valueText, startX + labelWidth, y);

    ctx.restore();
  }

  /**
   * Draw a slide number indicator "N/M" centered at position.
   * Dim, small monospace text.
   */
  drawSlideNumber(
    current: number,
    total: number,
    x: number,
    y: number,
    opacity: number = 0.4,
  ): void {
    const { ctx, dpr } = this;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.font = `11px ${FONT_FAMILY}`;
    ctx.fillStyle = colorWithAlpha('#ffffff', opacity);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${current}/${total}`, x, y);
    ctx.restore();
  }
}
