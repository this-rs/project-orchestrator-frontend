/**
 * TextRenderer — Cosmos/terminal-style text labels for particle scenes.
 *
 * Monospace, uppercase, letter-spaced. White on black.
 */

export interface LabelConfig {
  text: string;
  x: number;
  y: number;
  opacity?: number;
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
}

const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";

/**
 * Render a single label in cosmos/terminal style.
 */
export function renderLabel(ctx: CanvasRenderingContext2D, cfg: LabelConfig): void {
  const opacity = cfg.opacity ?? 0.7;
  if (opacity <= 0.01) return;

  const size = cfg.size ?? 11;
  ctx.globalAlpha = opacity;
  ctx.fillStyle = cfg.color ?? '#ffffff';
  ctx.font = `${size}px ${FONT_FAMILY}`;
  ctx.textAlign = cfg.align ?? 'center';
  ctx.textBaseline = 'middle';

  // Letter spacing via manual character placement
  const text = cfg.text.toUpperCase();
  const spacing = size * 0.2;

  if (cfg.align === 'left') {
    let cx = cfg.x;
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], cx, cfg.y);
      cx += ctx.measureText(text[i]).width + spacing;
    }
  } else {
    // center-aligned: measure total width first
    let totalWidth = 0;
    for (let i = 0; i < text.length; i++) {
      totalWidth += ctx.measureText(text[i]).width + (i < text.length - 1 ? spacing : 0);
    }
    let cx = cfg.x - totalWidth / 2;
    for (let i = 0; i < text.length; i++) {
      ctx.textAlign = 'left';
      ctx.fillText(text[i], cx, cfg.y);
      cx += ctx.measureText(text[i]).width + spacing;
    }
  }

  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

/**
 * Render a scene title at the top.
 */
export function renderTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  opacity: number = 0.5,
): void {
  renderLabel(ctx, {
    text,
    x: width / 2,
    y: 28,
    opacity,
    size: 13,
    color: '#ffffff',
    align: 'center',
  });
}
