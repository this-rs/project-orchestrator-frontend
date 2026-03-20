/**
 * DelegationScene — Data-driven wave delegation visualization.
 *
 * Renders actual plan waves with task agents color-coded by status:
 *   - completed  → green (#22c55e)
 *   - in_progress → cyan pulsing (#22d3ee)
 *   - blocked    → red (#ef4444)
 *   - pending    → gray (#6b7280)
 *   - failed     → dark red (#991b1b)
 *
 * Each wave is a horizontal row. Orchestrator node at top, agents below.
 * Uses ParticlePool for hit-testing (interactive mode).
 *
 * Falls back to demo mode (6 static agents) when no data is provided,
 * preserving backward compatibility.
 */

import { renderGlowDot, renderLine } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';
import { ParticlePool } from '../engine/ParticlePool';
import type { ParticleScene } from './types';
import type { DelegationData, DelegationTask } from '../adapters/types';

// ── Status → color mapping ────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  in_progress: '#22d3ee',
  blocked: '#ef4444',
  failed: '#991b1b',
  pending: '#6b7280',
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS.pending;
}

// ── Scene ────────────────────────────────────────────────────

export class DelegationScene implements ParticleScene {
  readonly name = 'delegation';
  readonly title = 'DELEGATION';
  readonly description = 'Wave dispatch — agents color-coded by task status';

  private w = 0;
  private h = 0;
  private time = 0;
  private data: DelegationData | null = null;
  private pool: ParticlePool = new ParticlePool(128);

  // Computed layout per wave
  private waveLayout: {
    waveNumber: number;
    orchX: number;
    orchY: number;
    agents: { x: number; y: number; task: DelegationTask }[];
  }[] = [];

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.rebuildLayout();
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.rebuildLayout();
  }

  update(_dt: number, _progress: number, time: number): void {
    this.time = time;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.data || this.data.waves.length === 0) {
      this.drawFallback(ctx, width, height);
      return;
    }

    const { time } = this;

    for (const wave of this.waveLayout) {
      // Orchestrator dot (white)
      const orchPulse = 0.7 + 0.15 * Math.sin(time * 2);
      renderGlowDot(ctx, wave.orchX, wave.orchY, 5 * orchPulse, 0.8, '#ffffff', 12);

      // Wave number label
      renderLabel(ctx, {
        text: `W${wave.waveNumber}`,
        x: wave.orchX,
        y: wave.orchY - 16,
        opacity: 0.5,
        size: 9,
      });

      // Agent dots + connection lines
      for (const agent of wave.agents) {
        const color = statusColor(agent.task.status);
        const isPulsing = agent.task.status === 'in_progress';

        // Connection line
        const lineOpacity = agent.task.status === 'completed' ? 0.15 : 0.25;
        renderLine(ctx, wave.orchX, wave.orchY, agent.x, agent.y, lineOpacity, 1, color);

        // Agent dot
        let dotSize = 5;
        let dotOpacity = 0.9;

        if (isPulsing) {
          // Cyan pulsing for in_progress
          const pulse = 0.7 + 0.3 * Math.sin(time * 4);
          dotSize = 4 + 3 * pulse;
          dotOpacity = 0.6 + 0.4 * pulse;
        } else if (agent.task.status === 'completed') {
          dotSize = 4;
          dotOpacity = 0.7;
        } else if (agent.task.status === 'blocked') {
          // Slow blink for blocked
          dotOpacity = 0.5 + 0.4 * Math.abs(Math.sin(time * 1.5));
        }

        renderGlowDot(ctx, agent.x, agent.y, dotSize, dotOpacity, color, isPulsing ? 14 : 8);
      }
    }

    // Title
    renderTitle(ctx, 'WAVE DISPATCH', width, 0.4);

    // Total tasks label
    renderLabel(ctx, {
      text: `${this.data.totalTasks} TASKS \u00b7 ${this.data.waves.length} WAVES`,
      x: width / 2,
      y: height - 16,
      opacity: 0.3,
      size: 9,
    });
  }

  dispose(): void {
    this.pool.reset();
    this.waveLayout = [];
  }

  setData(data: unknown): void {
    this.data = data as DelegationData | null;
    this.rebuildLayout();
  }

  getPool(): ParticlePool | null {
    return this.pool;
  }

  // ── Layout computation ──────────────────────────────────────

  private rebuildLayout(): void {
    this.pool.reset();
    this.waveLayout = [];

    if (!this.data || this.data.waves.length === 0 || this.w === 0) return;

    const { w, h, data } = this;
    const waveCount = data.waves.length;
    const topY = h * 0.2;
    const bottomY = h * 0.75;
    const margin = w * 0.06;

    // Distribute waves horizontally
    for (let wi = 0; wi < waveCount; wi++) {
      const wave = data.waves[wi];
      const waveX = waveCount === 1
        ? w / 2
        : margin + (wi / (waveCount - 1)) * (w - margin * 2);

      const agents: { x: number; y: number; task: DelegationTask }[] = [];
      const agentCount = wave.tasks.length;

      // Spread agents vertically below orchestrator
      for (let ai = 0; ai < agentCount; ai++) {
        const task = wave.tasks[ai];
        const agentY = agentCount === 1
          ? (topY + bottomY) / 2 + 30
          : topY + 40 + (ai / (agentCount - 1)) * (bottomY - topY - 40);

        // Offset X slightly for multiple agents in same wave
        const spreadX = agentCount > 1
          ? (ai / (agentCount - 1) - 0.5) * Math.min(60, w / (waveCount + 1) * 0.5)
          : 0;

        const agentX = waveX + spreadX;

        agents.push({ x: agentX, y: agentY, task });

        // Spawn particle in pool for hit-testing
        this.pool.spawn({
          x: agentX,
          y: agentY,
          size: 5,
          color: statusColor(task.status),
          group: wi,
          metadata: {
            taskId: task.id,
            label: task.title,
            status: task.status,
            waveNumber: wave.waveNumber,
            affected_files: task.affected_files,
          },
        });
      }

      this.waveLayout.push({
        waveNumber: wave.waveNumber,
        orchX: waveX,
        orchY: topY,
        agents,
      });
    }
  }

  // ── Fallback (no data) ──────────────────────────────────────

  private drawFallback(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const cx = width / 2;
    const cy = height / 2;

    renderGlowDot(ctx, cx, cy - 20, 4, 0.3, '#6b7280', 6);
    renderLabel(ctx, {
      text: 'NO WAVE DATA',
      x: cx,
      y: cy + 10,
      opacity: 0.25,
      size: 10,
    });

    renderTitle(ctx, 'DELEGATION', width, 0.3);
  }
}
