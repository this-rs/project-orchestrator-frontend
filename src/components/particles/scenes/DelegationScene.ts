/**
 * DelegationScene — slide 14/15
 * "DELEGATION — un cerveau délègue, 6 agents exécutent en parallèle"
 *
 * Split left/right:
 *   Left  (séquentiel): 1 orchestrator + 6 agents, lit up one at a time
 *   Right (parallèle):  1 orchestrator + 6 agents, fan-out lines then all glow
 *
 * Progress-driven (0..1), looping.
 * Decision: stagger fan-out tripled for perceptible cascade (~75ms between agents).
 */

import { renderGlowDot, renderLine } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';
import type { ParticleScene } from './types';
import { clamp, smoothstep } from './types';

// ── Constants ────────────────────────────────────────────────
const AGENT_COUNT: number = 6;

// ── Scene ────────────────────────────────────────────────────

export class DelegationScene implements ParticleScene {
  readonly name = 'delegation';
  readonly title = 'DELEGATION';
  readonly description =
    'One brain delegates, 6 agents execute — sequential vs parallel';

  private w = 0;
  private h = 0;
  private progress = 0;
  private time = 0;

  // Left panel positions
  private leftOrchX = 0;
  private leftOrchY = 0;
  private leftAgents: { x: number; y: number }[] = [];

  // Right panel positions
  private rightOrchX = 0;
  private rightOrchY = 0;
  private rightAgents: { x: number; y: number }[] = [];

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();
  }

  update(_dt: number, progress: number, time: number): void {
    this.progress = progress;
    this.time = time;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { progress, time } = this;
    const midX = width / 2;

    // ── Divider ──
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ══════════════════════════════════════════════
    // LEFT — SÉQUENTIEL
    // ══════════════════════════════════════════════
    this.drawSequential(ctx, progress, time);

    // ══════════════════════════════════════════════
    // RIGHT — PARALLÈLE
    // ══════════════════════════════════════════════
    this.drawParallel(ctx, progress, time);

    // ── Labels ──
    renderLabel(ctx, {
      text: 'SÉQUENTIEL',
      x: width * 0.25,
      y: height - 24,
      opacity: 0.4,
      size: 10,
    });
    renderLabel(ctx, {
      text: 'PARALLÈLE',
      x: width * 0.75,
      y: height - 24,
      opacity: 0.4,
      size: 10,
      color: '#22d3ee',
    });

    renderTitle(ctx, 'DELEGATION', width, 0.5);
  }

  dispose(): void {
    this.leftAgents = [];
    this.rightAgents = [];
  }

  setData(_data: unknown): void {
    // No external data needed
  }

  // ── Sequential (left panel) ────────────────────────────────
  private drawSequential(
    ctx: CanvasRenderingContext2D,
    progress: number,
    time: number,
  ): void {
    const { leftOrchX, leftOrchY, leftAgents } = this;

    // Active agent cycles through based on progress
    const activeAgent = Math.floor(progress * AGENT_COUNT) % AGENT_COUNT;

    // Orchestrator dot
    const orchPulse = 0.7 + 0.15 * Math.sin(time * 2);
    renderGlowDot(ctx, leftOrchX, leftOrchY, 5 * orchPulse, 0.8, '#ffffff', 12);

    // Connection line to active agent only
    const activePos = leftAgents[activeAgent];
    renderLine(
      ctx,
      leftOrchX,
      leftOrchY,
      activePos.x,
      activePos.y,
      0.2 + 0.1 * Math.sin(time * 4),
      1.5,
      '#ffffff',
    );

    // Agent dots
    for (let i = 0; i < AGENT_COUNT; i++) {
      const pos = leftAgents[i];
      const isActive = i === activeAgent;
      const agentOpacity = isActive ? 1.0 : 0.3;
      const agentSize = isActive ? 6 : 4;

      renderGlowDot(
        ctx,
        pos.x,
        pos.y,
        agentSize,
        agentOpacity,
        '#ffffff',
        isActive ? 12 : 4,
      );
    }
  }

  // ── Parallel (right panel) ─────────────────────────────────
  private drawParallel(
    ctx: CanvasRenderingContext2D,
    progress: number,
    time: number,
  ): void {
    const { rightOrchX, rightOrchY, rightAgents } = this;

    // Fan-out progress: 10%–40% of progress
    const fanProgress = clamp((progress - 0.1) / 0.3, 0, 1);

    // Orchestrator dot (cyan)
    const orchPulse = 0.8 + 0.15 * Math.sin(time * 2.5);
    renderGlowDot(
      ctx,
      rightOrchX,
      rightOrchY,
      5 * orchPulse,
      0.9,
      '#22d3ee',
      14,
    );

    // Fan-out lines + agent dots
    // Tripled stagger spread: i/6 * 0.3 instead of 0.1 (Decision: perceptible cascade)
    for (let i = 0; i < AGENT_COUNT; i++) {
      const pos = rightAgents[i];
      const staggerStart = (i / AGENT_COUNT) * 0.3;
      const lineOpacity =
        smoothstep(staggerStart, staggerStart + 0.15, fanProgress) * 0.4;

      // Connection line
      if (lineOpacity > 0.01) {
        renderLine(
          ctx,
          rightOrchX,
          rightOrchY,
          pos.x,
          pos.y,
          lineOpacity,
          1.5,
          '#22d3ee',
        );
      }

      // Agent dot: appears after line arrives
      const agentAppear = smoothstep(
        0.3 + i * 0.02,
        0.35 + i * 0.02,
        progress,
      );
      const agentOpacity = Math.max(0.15, agentAppear);
      const agentSize = 4 + agentAppear * 2;

      renderGlowDot(
        ctx,
        pos.x,
        pos.y,
        agentSize,
        agentOpacity,
        agentAppear > 0.5 ? '#22d3ee' : '#ffffff',
        agentAppear > 0.5 ? 12 : 4,
      );
    }
  }

  // ── Layout ──────────────────────────────────────────────────
  private computeLayout(): void {
    const { w, h } = this;
    const midX = w / 2;
    const topY = h * 0.2;
    const bottomY = h * 0.72;

    // Left panel
    this.leftOrchX = w * 0.25;
    this.leftOrchY = topY;
    this.leftAgents = [];
    const leftMargin = w * 0.05;
    const leftSpan = midX - leftMargin * 2;
    for (let i = 0; i < AGENT_COUNT; i++) {
      const t = AGENT_COUNT === 1 ? 0.5 : i / (AGENT_COUNT - 1);
      this.leftAgents.push({
        x: leftMargin + t * leftSpan,
        y: bottomY,
      });
    }

    // Right panel
    this.rightOrchX = w * 0.75;
    this.rightOrchY = topY;
    this.rightAgents = [];
    const rightMargin = midX + w * 0.03;
    const rightSpan = w - rightMargin - w * 0.03;
    for (let i = 0; i < AGENT_COUNT; i++) {
      const t = AGENT_COUNT === 1 ? 0.5 : i / (AGENT_COUNT - 1);
      this.rightAgents.push({
        x: rightMargin + t * rightSpan,
        y: bottomY,
      });
    }
  }
}
