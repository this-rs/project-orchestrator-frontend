/**
 * ImpactPreviewWidget — AttentionScene driven by analyze_impact() data.
 *
 * Integrates into TaskDetailPage when viewing impact analysis.
 * Inline in the detail panel.
 */

import { ParticleViz } from '../ParticleViz';
import type { AttentionData } from '../adapters/types';

export interface ImpactPreviewWidgetProps {
  data?: AttentionData;
  className?: string;
  height?: number;
}

export function ImpactPreviewWidget({
  data,
  className = '',
  height = 250,
}: ImpactPreviewWidgetProps) {
  return (
    <ParticleViz
      scene="attention"
      data={data}
      height={height}
      className={className}
    />
  );
}
