/**
 * WaveDispatchWidget — DelegationScene driven by wave data.
 *
 * Integrates into PlanDetailPage → "Waves" section.
 * Compact: alongside WaveView.
 */

import { ParticleViz } from '../ParticleViz';
import type { DelegationData } from '../adapters/types';

export interface WaveDispatchWidgetProps {
  data?: DelegationData;
  className?: string;
  height?: number;
}

export function WaveDispatchWidget({
  data,
  className = '',
  height = 250,
}: WaveDispatchWidgetProps) {
  return (
    <ParticleViz
      scene="delegation"
      data={data}
      height={height}
      className={className}
    />
  );
}
