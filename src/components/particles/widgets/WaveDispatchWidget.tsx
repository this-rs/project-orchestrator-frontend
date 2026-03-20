/**
 * WaveDispatchWidget — DelegationScene driven by wave data.
 *
 * Integrates into PlanDetailPage -> "Waves" section.
 * Supports interactive mode: hover/click on agents to interact with task list.
 */

import { ParticleViz } from '../ParticleViz';
import type { ParticleHitInfo } from '../ParticleViz';
import type { DelegationData } from '../adapters/types';

export interface WaveDispatchWidgetProps {
  data?: DelegationData;
  className?: string;
  height?: number;
  /** Enable interactive mode (hit-testing, tooltips, hover/click callbacks). Default false */
  interactive?: boolean;
  /** Called when an agent particle is hovered — returns taskId or null */
  onTaskHover?: (taskId: string | null) => void;
  /** Called when an agent particle is clicked — returns taskId */
  onTaskClick?: (taskId: string) => void;
  /** Externally highlighted particle index (from kanban hover) */
  highlightedId?: number;
}

export function WaveDispatchWidget({
  data,
  className = '',
  height = 250,
  interactive = false,
  onTaskHover,
  onTaskClick,
  highlightedId,
}: WaveDispatchWidgetProps) {
  const handleHover = (info: ParticleHitInfo | null) => {
    if (!onTaskHover) return;
    const taskId = info?.metadata?.taskId as string | undefined;
    onTaskHover(taskId ?? null);
  };

  const handleClick = (info: ParticleHitInfo) => {
    if (!onTaskClick) return;
    const taskId = info.metadata?.taskId as string | undefined;
    if (taskId) onTaskClick(taskId);
  };

  return (
    <ParticleViz
      scene="delegation"
      data={data}
      height={height}
      className={className}
      interactive={interactive}
      onParticleHover={interactive ? handleHover : undefined}
      onParticleClick={interactive ? handleClick : undefined}
      highlightedId={highlightedId}
    />
  );
}
