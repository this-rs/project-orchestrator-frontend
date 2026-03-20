/**
 * PropagationVizWidget — DistributionScene driven by propagation data.
 *
 * Integrates into NotesPage list tab as a split-view panel.
 * Reacts to selected note, supports interactive drill-down.
 */

import { ParticleViz } from '../ParticleViz';
import type { ParticleHitInfo } from '../ParticleViz';
import type { DistributionData } from '../adapters/types';

export interface PropagationVizWidgetProps {
  data?: DistributionData;
  className?: string;
  height?: number;
  /** Enable interactive hit-testing & tooltips. Default false (backward compat) */
  interactive?: boolean;
  /** Called when a particle/node is clicked (interactive mode only) */
  onParticleClick?: (info: ParticleHitInfo) => void;
}

export function PropagationVizWidget({
  data,
  className = '',
  height = 400,
  interactive = false,
  onParticleClick,
}: PropagationVizWidgetProps) {
  return (
    <ParticleViz
      scene="distribution"
      data={data}
      height={height}
      interactive={interactive}
      onParticleClick={onParticleClick}
      className={`w-full ${className}`}
    />
  );
}
