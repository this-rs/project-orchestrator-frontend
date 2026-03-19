/**
 * PropagationVizWidget — DistributionScene driven by propagation data.
 *
 * Integrates into NotesPage → "Propagation" view.
 * Full width.
 */

import { ParticleViz } from '../ParticleViz';
import type { DistributionData } from '../adapters/types';

export interface PropagationVizWidgetProps {
  data?: DistributionData;
  className?: string;
  height?: number;
}

export function PropagationVizWidget({
  data,
  className = '',
  height = 400,
}: PropagationVizWidgetProps) {
  return (
    <ParticleViz
      scene="distribution"
      data={data}
      height={height}
      className={`w-full ${className}`}
    />
  );
}
