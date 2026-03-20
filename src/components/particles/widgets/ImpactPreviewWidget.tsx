/**
 * ImpactPreviewWidget — AttentionScene driven by analyze_impact() data.
 *
 * Integrates into TaskDetailPage when viewing impact analysis.
 * Inline in the detail panel.
 *
 * Supports interactive mode (opt-in): hit-testing, tooltips, hover highlights,
 * click-to-navigate, and bidirectional hover sync with external file lists.
 */

import { ParticleViz } from '../ParticleViz';
import type { ParticleHitInfo } from '../ParticleViz';
import type { AttentionData } from '../adapters/types';

export interface ImpactPreviewWidgetProps {
  data?: AttentionData;
  className?: string;
  height?: number;
  /** Enable interactive mode: hit-testing, tooltips, hover highlights. Default true */
  interactive?: boolean;
  /** Called when a particle is clicked (interactive mode only) */
  onParticleClick?: (info: ParticleHitInfo) => void;
  /** Called when a particle is hovered (interactive mode only) */
  onParticleHover?: (info: ParticleHitInfo | null) => void;
  /** Externally controlled highlighted particle index */
  highlightedId?: number;
}

export function ImpactPreviewWidget({
  data,
  className = '',
  height = 250,
  interactive = true,
  onParticleClick,
  onParticleHover,
  highlightedId,
}: ImpactPreviewWidgetProps) {
  return (
    <ParticleViz
      scene="attention"
      data={data}
      height={height}
      className={className}
      interactive={interactive}
      onParticleClick={onParticleClick}
      onParticleHover={onParticleHover}
      highlightedId={highlightedId}
    />
  );
}
